import { postApprovedMessage, notifyRejection, notifyFlagged, correctPost, removePost } from "../facebook/poster.js";
import { moderateConversation } from "../moderation/moderator.js";
import { resolveAction } from "../moderation/moderator.js";
import { isConversationProcessed, getConversationUpdatedAt, getConversationPostId, saveConversation, getConversationProcessedAt } from "../db/database.js";
import { sendNotification } from "./notifier.js";

/**
 * Hard cutoff: only process conversations updated AFTER the bot started.
 * This prevents re-processing old conversations even if the database is wiped.
 */
const BOOT_TIME = Date.now();
console.log(`[PROCESSOR] Boot time recorded: ${new Date(BOOT_TIME).toISOString()} — ignoring all older conversations`);

/**
 * Process updated conversations for a single page:
 * 1. Fetch conversations with new messages (only those updated after boot)
 * 2. Skip conversations already processed
 * 3. Give the AI the full thread to identify the submission
 * 4. Post/reject/flag based on the AI decision
 * 5. Reply to the sender once per conversation
 *
 * @param {object} client — page client from createPageClient()
 */
export async function processNewMessages(client) {
  const tag = `[${client.pageName}]`;
  console.log(`${tag} [POLL] Checking for new messages...`);

  // Skip rules:
  // 1. ALWAYS skip anything last updated before we booted (hard cutoff — never touch old stuff)
  // 2. If never seen before and updated after boot — process it (new conversation)
  // 3. If already processed but updated_time changed — process it (follow-up message)
  // 4. If already processed and updated_time unchanged — skip (nothing new)
  const shouldSkip = (conversationId, updatedTime) => {
    if (updatedTime < BOOT_TIME) return true;
    if (!isConversationProcessed(conversationId)) return false;
    const storedAt = getConversationUpdatedAt(conversationId);
    return updatedTime <= storedAt;
  };

  let conversations;
  try {
    conversations = await client.fetchConversations(shouldSkip);
  } catch (err) {
    console.error(`${tag} [ERROR] Failed to fetch conversations: ${err.message}`);
    return { processed: 0 };
  }

  if (conversations.length === 0) {
    console.log(`${tag} [POLL] No conversations found.`);
    return { processed: 0 };
  }

  console.log(`${tag} [POLL] Found ${conversations.length} conversation(s).`);

  for (const convo of conversations) {
    const userMessages = convo.thread.filter((m) => !m.isPage);

    console.log(
      `${tag} [ANALYSE] Conversation ${convo.conversationId} from ${convo.senderName} (${userMessages.length} user msgs)`
    );

    // Mark messages as new if this is a follow-up to an already-processed conversation
    const lastProcessedAt = getConversationProcessedAt(convo.conversationId);
    const threadWithNewMarkers = convo.thread.map((msg) => ({
      ...msg,
      isNew: lastProcessedAt > 0 && msg.timestamp > lastProcessedAt,
    }));

    // Give the AI the full thread
    let moderation;
    try {
      moderation = await moderateConversation(threadWithNewMarkers);
    } catch (err) {
      console.error(
        `${tag} [ERROR] Moderation failed for conversation ${convo.conversationId}: ${err.message}`
      );
      moderation = {
        decision: "FLAG",
        submissionMessageId: null,
        submissionText: null,
        hasImages: false,
        reason: "Moderation error — flagged for manual review",
        confidence: 0,
        reply: "Thanks for your message! It's been queued for review.",
      };
    }

    // SKIP means the AI found no submission in the thread
    if (moderation.decision === "SKIP") {
      console.log(
        `${tag} [SKIP] No submission found in conversation ${convo.conversationId}: ${moderation.reason}`
      );
      saveConversation(convo, moderation, "SKIP", null);
      continue;
    }

    // ASK means the AI needs clarification — reply and wait for their response
    if (moderation.decision === "ASK") {
      console.log(
        `${tag} [ASK] Requesting clarification for conversation ${convo.conversationId}: ${moderation.reason}`
      );
      if (moderation.reply) {
        try {
          await client.sendReply(convo.senderId, moderation.reply);
        } catch (err) {
          console.warn(`${tag} [WARN] Could not send ASK reply: ${err.message}`);
        }
      }
      // Save as ASK — when the user replies, updated_at will change
      // and shouldSkip will let us re-process the conversation
      saveConversation(convo, moderation, "ASK", null);
      continue;
    }

    const action = resolveAction(moderation);

    console.log(
      `${tag} [DECISION] ${action} (${moderation.decision} @ ${moderation.confidence}) — ${moderation.reason}`
    );

    // Build a submission object for the poster
    const submissionMsg = convo.thread.find(
      (m) => m.id === moderation.submissionMessageId
    );

    // For CORRECTION requests, get images from the correction message specifically
    let images = [];
    if (action === "CORRECTION" && moderation.useImagesFromMessageId) {
      const correctionMsg = convo.thread.find(
        (m) => m.id === moderation.useImagesFromMessageId
      );
      images = correctionMsg?.images || [];
    }

    // Fall back to the submission message's images
    if (images.length === 0) {
      images = submissionMsg?.images || [];
    }

    // Last resort: collect ALL user images in the thread
    if (images.length === 0) {
      images = convo.thread
        .filter((m) => !m.isPage)
        .flatMap((m) => m.images || []);
    }

    if (images.length > 0) {
      console.log(`${tag} [IMAGES] Found ${images.length} image(s) to post`);
    }

    const submission = {
      id: moderation.submissionMessageId || convo.conversationId,
      conversationId: convo.conversationId,
      text: moderation.submissionText || "",
      images,
      senderName: convo.senderName,
      senderId: convo.senderId,
      timestamp: submissionMsg?.timestamp || convo.updatedTime,
      pageName: client.pageName,
    };

    let postId = null;

    if (action === "POST") {
      try {
        const result = await postApprovedMessage(submission, moderation.reply, client);
        postId = result.id;
      } catch (err) {
        console.error(
          `${tag} [ERROR] Failed to post from conversation ${convo.conversationId}: ${err.message}`
        );
        saveConversation(convo, moderation, "FLAG", null);
        continue;
      }
    } else if (action === "CORRECTION") {
      const oldPostId = getConversationPostId(convo.conversationId);
      if (!oldPostId) {
        console.warn(
          `${tag} [WARN] Correction requested for conversation ${convo.conversationId} but no existing post found — treating as new post`
        );
        try {
          const result = await postApprovedMessage(submission, moderation.reply, client);
          postId = result.id;
        } catch (err) {
          console.error(
            `${tag} [ERROR] Failed to post correction for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      } else {
        try {
          const result = await correctPost(oldPostId, submission, moderation.reply, client);
          postId = result.id;
        } catch (err) {
          console.error(
            `${tag} [ERROR] Failed to correct post for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      }
    } else if (action === "DELETE") {
      const oldPostId = getConversationPostId(convo.conversationId);
      if (!oldPostId) {
        console.warn(
          `${tag} [WARN] Delete requested for conversation ${convo.conversationId} but no existing post found`
        );
        try {
          await client.sendReply(
            convo.senderId,
            moderation.reply || "We couldn't find the original post to remove — it may have already been taken down."
          );
        } catch (err) {
          console.warn(`${tag} [WARN] Could not reply for delete: ${err.message}`);
        }
      } else {
        try {
          await removePost(oldPostId, submission, moderation.reply, client);
        } catch (err) {
          console.error(
            `${tag} [ERROR] Failed to delete post for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      }
    } else if (action === "REJECT") {
      await notifyRejection(submission, moderation.reply, client);
    } else {
      console.log(
        `${tag} [FLAG] Conversation ${convo.conversationId} flagged for manual review.`
      );
      await notifyFlagged(submission, moderation.reply, client);
    }

    // Save to database
    saveConversation(convo, moderation, action, postId);

    // Send email notification
    await sendNotification(submission, moderation, action);
  }

  return { processed: conversations.length };
}
