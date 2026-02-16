import { fetchUpdatedConversations, sendReply } from "../facebook/client.js";
import { postApprovedMessage, notifyRejection, notifyFlagged, correctPost, removePost } from "../facebook/poster.js";
import { moderateConversation } from "../moderation/moderator.js";
import { resolveAction } from "../moderation/moderator.js";
import { isConversationProcessed, getConversationMessageCount, getConversationPostId, saveConversation } from "../db/database.js";
import { sendNotification } from "./notifier.js";

/**
 * Process updated conversations:
 * 1. Fetch conversations with new messages
 * 2. Skip conversations already fully processed
 * 3. Give the AI the full thread to identify the submission
 * 4. Post/reject/flag based on the AI decision
 * 5. Reply to the sender once per conversation
 */
export async function processNewMessages(sinceTimestamp) {
  console.log(`[POLL] Checking for new messages...`);

  let conversations;
  try {
    conversations = await fetchUpdatedConversations(sinceTimestamp);
  } catch (err) {
    console.error(`[ERROR] Failed to fetch conversations: ${err.message}`);
    return { processed: 0, latestTimestamp: sinceTimestamp };
  }

  if (conversations.length === 0) {
    console.log(`[POLL] No updated conversations found.`);
    return { processed: 0, latestTimestamp: sinceTimestamp };
  }

  console.log(`[POLL] Found ${conversations.length} updated conversation(s).`);

  let latestTimestamp = sinceTimestamp || 0;

  for (const convo of conversations) {
    const userMessages = convo.thread.filter((m) => !m.isPage);
    const storedCount = getConversationMessageCount(convo.conversationId);

    // Skip if we've already processed this conversation with the same message count
    // (no new user messages since we last looked)
    if (isConversationProcessed(convo.conversationId) && userMessages.length <= storedCount) {
      console.log(`[SKIP] Conversation ${convo.conversationId} already processed (${storedCount} msgs).`);
      continue;
    }

    console.log(
      `[ANALYSE] Conversation ${convo.conversationId} from ${convo.senderName} (${userMessages.length} user msgs)`
    );

    // Give the AI the full thread
    let moderation;
    try {
      moderation = await moderateConversation(convo.thread);
    } catch (err) {
      console.error(
        `[ERROR] Moderation failed for conversation ${convo.conversationId}: ${err.message}`
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
        `[SKIP] No submission found in conversation ${convo.conversationId}: ${moderation.reason}`
      );
      saveConversation(convo, moderation, "SKIP", null);
      if (convo.updatedTime > latestTimestamp) {
        latestTimestamp = convo.updatedTime;
      }
      continue;
    }

    const action = resolveAction(moderation);

    console.log(
      `[DECISION] ${action} (${moderation.decision} @ ${moderation.confidence}) — ${moderation.reason}`
    );

    // Build a submission object for the poster
    const submissionMsg = convo.thread.find(
      (m) => m.id === moderation.submissionMessageId
    );

    // For CORRECTION requests, get images from the correction message specifically
    // (the user sent new/correct images in their follow-up)
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
      console.log(`[IMAGES] Found ${images.length} image(s) to post`);
    }

    const submission = {
      id: moderation.submissionMessageId || convo.conversationId,
      conversationId: convo.conversationId,
      text: moderation.submissionText || "",
      images,
      senderName: convo.senderName,
      senderId: convo.senderId,
      timestamp: submissionMsg?.timestamp || convo.updatedTime,
    };

    let postId = null;

    if (action === "POST") {
      try {
        const result = await postApprovedMessage(submission, moderation.reply);
        postId = result.id;
      } catch (err) {
        console.error(
          `[ERROR] Failed to post from conversation ${convo.conversationId}: ${err.message}`
        );
        saveConversation(convo, moderation, "FLAG", null);
        continue;
      }
    } else if (action === "CORRECTION") {
      const oldPostId = getConversationPostId(convo.conversationId);
      if (!oldPostId) {
        console.warn(
          `[WARN] Correction requested for conversation ${convo.conversationId} but no existing post found — treating as new post`
        );
        try {
          const result = await postApprovedMessage(submission, moderation.reply);
          postId = result.id;
        } catch (err) {
          console.error(
            `[ERROR] Failed to post correction for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      } else {
        try {
          const result = await correctPost(oldPostId, submission, moderation.reply);
          postId = result.id;
        } catch (err) {
          console.error(
            `[ERROR] Failed to correct post for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      }
    } else if (action === "DELETE") {
      const oldPostId = getConversationPostId(convo.conversationId);
      if (!oldPostId) {
        console.warn(
          `[WARN] Delete requested for conversation ${convo.conversationId} but no existing post found`
        );
        try {
          await sendReply(
            convo.senderId,
            moderation.reply || "We couldn't find the original post to remove — it may have already been taken down."
          );
        } catch (err) {
          console.warn(`[WARN] Could not reply for delete: ${err.message}`);
        }
      } else {
        try {
          await removePost(oldPostId, submission, moderation.reply);
        } catch (err) {
          console.error(
            `[ERROR] Failed to delete post for conversation ${convo.conversationId}: ${err.message}`
          );
          saveConversation(convo, moderation, "FLAG", null);
          continue;
        }
      }
    } else if (action === "REJECT") {
      await notifyRejection(submission, moderation.reply);
    } else {
      console.log(
        `[FLAG] Conversation ${convo.conversationId} flagged for manual review.`
      );
      await notifyFlagged(submission, moderation.reply);
    }

    // Save to database
    saveConversation(convo, moderation, action, postId);

    // Send email notification
    await sendNotification(submission, moderation, action);

    // Track the latest timestamp
    if (convo.updatedTime > latestTimestamp) {
      latestTimestamp = convo.updatedTime;
    }
  }

  return { processed: conversations.length, latestTimestamp };
}
