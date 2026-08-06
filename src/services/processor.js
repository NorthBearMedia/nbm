import { config } from "../config.js";
import { postApprovedMessage, notifyRejection, notifyFlagged, correctPost, removePost } from "../facebook/poster.js";
import { moderateConversation } from "../moderation/moderator.js";
import { resolveAction } from "../moderation/rules.js";
import { shouldSkipConversation } from "./skiprules.js";
import {
  getConversationUpdatedAt,
  getConversationPostId,
  getConversationProcessedAt,
  getConversation,
  saveConversation,
  isSubmissionPosted,
  findRecentDuplicate,
  getWatermark,
} from "../db/database.js";
import { sendNotification, sendEnquiryNotification } from "./notifier.js";
import { logPostEvent } from "./postlog.js";
import { textsMatch } from "../utils/text.js";

/**
 * Process updated conversations for a single page:
 * 1. Fetch conversations with new messages (only those updated after the
 *    persisted watermark — old conversations are never touched)
 * 2. Skip conversations already processed
 * 3. Give the AI the full thread (text + actual images) to identify the submission
 * 4. Post/reject/flag based on the AI decision
 * 5. Reply to the sender once per conversation
 *
 * @param {object} client — page client from createPageClient()
 * @returns {{ processed: number, error?: Error }}
 */
export async function processNewMessages(client) {
  const tag = `[${client.pageName}]`;

  const watermark = getWatermark();
  const shouldSkip = (conversationId, updatedTime) =>
    shouldSkipConversation({
      updatedTime,
      watermark,
      storedUpdatedAt: getConversationUpdatedAt(conversationId),
    });

  let conversations;
  try {
    conversations = await client.fetchConversations(shouldSkip);
  } catch (err) {
    console.error(`${tag} [ERROR] Failed to fetch conversations: ${err.message}`);
    // Surface the error so the poller can track page health and alert the owner
    return { processed: 0, error: err };
  }

  if (conversations.length === 0) {
    return { processed: 0 };
  }

  console.log(`${tag} [POLL] Found ${conversations.length} conversation(s) with new activity.`);

  for (const convo of conversations) {
    const userMessages = convo.thread.filter((m) => !m.isPage);

    console.log(
      `${tag} [ANALYSE] Conversation ${convo.conversationId} from ${convo.senderName} (${userMessages.length} user msgs)`
    );

    // Mark the sender's message as read now that the bot is handling it, so the
    // owner's inbox shows at a glance what's been dealt with. Best-effort and
    // fire-and-forget — never let a read-receipt failure derail moderation.
    if (config.facebook.markSeen) {
      client.markSeen(convo.senderId).catch((err) =>
        console.warn(`${tag} [WARN] Could not mark conversation seen: ${err.message}`)
      );
    }

    const extras = { pageId: client.pageId, pageName: client.pageName };

    // One helper for every "needs a human" outcome so no FLAG can silently
    // rot in the queue without the owner hearing about it.
    const flagAndNotify = async (submission, moderation, kind) => {
      try {
        await notifyFlagged(submission, moderation.reply, client);
      } catch (err) {
        console.warn(`${tag} [WARN] Could not send flagged reply: ${err.message}`);
      }
      saveConversation(convo, moderation, "FLAG", null, {
        ...extras,
        images: submission.images,
      });
      await sendNotification(submission, moderation, "FLAG", { kind });
    };

    // Mark messages as new if this is a follow-up to an already-processed conversation
    const lastProcessedAt = getConversationProcessedAt(convo.conversationId);
    const threadWithNewMarkers = convo.thread.map((msg) => ({
      ...msg,
      isNew: lastProcessedAt > 0 && msg.timestamp > lastProcessedAt,
    }));

    // Tell the AI what the page already knows about this conversation
    const existingRow = getConversation(convo.conversationId);
    const pageState = {
      livePostId: getConversationPostId(convo.conversationId),
      lastAction: existingRow?.action || null,
    };

    // Give the AI the full thread (with real images)
    let moderation;
    try {
      moderation = await moderateConversation(threadWithNewMarkers, pageState);
    } catch (err) {
      console.error(
        `${tag} [ERROR] Moderation failed for conversation ${convo.conversationId}: ${err.message}`
      );
      moderation = {
        decision: "FLAG",
        submissionMessageId: null,
        submissionText: null,
        hasImages: false,
        useImagesFromMessageId: null,
        reason: "Moderation error — flagged for manual review",
        confidence: 0,
        reply: "Cheers for that, I'll have a look shortly.",
      };
    }

    // SKIP means the AI found no submission in the thread
    if (moderation.decision === "SKIP") {
      console.log(
        `${tag} [SKIP] No submission found in conversation ${convo.conversationId}: ${moderation.reason}`
      );
      saveConversation(convo, moderation, "SKIP", null, extras);
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
      saveConversation(convo, moderation, "ASK", null, extras);
      continue;
    }

    const action = resolveAction(moderation, config.moderation.confidenceThreshold);

    console.log(
      `${tag} [DECISION] ${action} (${moderation.decision} @ ${moderation.confidence}) — ${moderation.reason}`
    );

    // ENQUIRY — someone answering our "we buy dormant Spotted pages" post.
    // This is a private business enquiry: email it to the owners and NEVER
    // publish it. No auto-reply is sent, so the owners can open the
    // conversation themselves. Handled before any posting logic can run.
    if (action === "ENQUIRY") {
      const enquiryMessages = convo.thread.filter((m) => !m.isPage);
      const latest = enquiryMessages[enquiryMessages.length - 1];
      console.log(
        `${tag} [ENQUIRY] Page-buying enquiry from ${convo.senderName} — emailing owners, not posting.`
      );
      await sendEnquiryNotification(
        {
          conversationId: convo.conversationId,
          senderName: convo.senderName,
          senderId: convo.senderId,
          pageName: client.pageName,
          latestText: latest?.text || "",
          thread: enquiryMessages,
        },
        moderation
      );
      saveConversation(convo, moderation, "ENQUIRY", null, extras);
      continue;
    }

    // Build a submission object for the poster
    const submissionMsg = convo.thread.find(
      (m) => m.id === moderation.submissionMessageId
    );

    // Resolve the image(s) to attach. The image MUST come from a message the
    // AI explicitly identified — NEVER scavenged from elsewhere in the thread.
    //
    // For CORRECTION: if the AI pointed at a correction image we can't find,
    // do NOT delete the live post and republish blind — ask the user to resend.
    if (action === "CORRECTION" && moderation.useImagesFromMessageId) {
      const correctionMsg = convo.thread.find(
        (m) => m.id === moderation.useImagesFromMessageId
      );
      if (!correctionMsg || (correctionMsg.images?.length || 0) === 0) {
        console.warn(
          `${tag} [WARN] CORRECTION points at image message ${moderation.useImagesFromMessageId} but no usable image found — asking the user to resend`
        );
        try {
          await client.sendReply(
            convo.senderId,
            "Can you send that photo again? It didn't come through my end."
          );
        } catch (err) {
          console.warn(`${tag} [WARN] Could not send CORRECTION resend request: ${err.message}`);
        }
        saveConversation(convo, moderation, "ASK", null, extras);
        continue;
      }
    }

    // Images come ONLY from the AI-identified image message, or failing that
    // the submission message's own attachments. We never reach across the thread.
    let images = [];
    if (moderation.useImagesFromMessageId) {
      const imageMsg = convo.thread.find(
        (m) => m.id === moderation.useImagesFromMessageId
      );
      images = imageMsg?.images || [];
    }
    if (images.length === 0) {
      images = submissionMsg?.images || [];
    }

    if (images.length > 0) {
      console.log(`${tag} [IMAGES] Found ${images.length} image(s) to post`);
    }

    let submissionText = moderation.submissionText || "";

    // Post exactly what the resident wrote: if the AI's transcription matches
    // the original message, use the original; if it silently paraphrased,
    // don't publish it under the community's name without review.
    // Skip this for image-only submissions (the AI legitimately returns little
    // or no caption) — otherwise an empty submissionText false-flags as a mismatch.
    if (action === "POST" && submissionMsg?.text && submissionText.trim()) {
      const match = textsMatch(submissionText, submissionMsg.text);
      if (match === "exact") {
        submissionText = submissionMsg.text;
      } else if (match === "mismatch") {
        console.warn(
          `${tag} [WARN] AI transcription doesn't match the original message — flagging instead of posting`
        );
        moderation.reason = `Submission text mismatch (AI paraphrased?) — flagged for review. ${moderation.reason}`;
        await flagAndNotify(
          buildSubmission(convo, moderation, submissionMsg, submissionText, images, client),
          moderation,
          "text-mismatch"
        );
        continue;
      }
      // "subset" (the AI trimmed a greeting) is fine — keep the AI text.
    }

    const submission = buildSubmission(convo, moderation, submissionMsg, submissionText, images, client);

    // If the AI says this submission has an image but we couldn't bind one to
    // the identified message, don't guess — flag for a human.
    if (action === "POST" && moderation.hasImages && images.length === 0) {
      console.warn(
        `${tag} [WARN] hasImages=true but no image could be bound to the submission — flagging instead of posting`
      );
      await flagAndNotify(submission, moderation, "image-binding-failed");
      continue;
    }

    let postId = null;
    let correctionOf = null;
    let deletedPostId = null;

    if (action === "POST") {
      // Ledger check: this exact message must never be published twice, no
      // matter what the AI decides on a re-poll.
      if (isSubmissionPosted(convo.conversationId, moderation.submissionMessageId)) {
        console.log(
          `${tag} [SKIP] Submission ${moderation.submissionMessageId} was already posted — not re-posting`
        );
        saveConversation(convo, { ...moderation, decision: "SKIP", reason: "Already posted" }, "SKIP", null, extras);
        continue;
      }

      // Duplicate detection: same flyer resent, or two people submitting the
      // same event → flag with a pointer instead of double-posting.
      const duplicate = findRecentDuplicate(client.pageId, submissionText, {
        excludeConversationId: convo.conversationId,
      });
      if (duplicate) {
        console.warn(
          `${tag} [WARN] Possible duplicate of post ${duplicate.postId} — flagging for review`
        );
        moderation.reason = `Possible duplicate of an existing post (${duplicate.postId}). ${moderation.reason}`;
        await flagAndNotify(submission, moderation, "possible-duplicate");
        continue;
      }

      try {
        const result = await postApprovedMessage(submission, moderation.reply, client);
        postId = result.id;
      } catch (err) {
        console.error(
          `${tag} [ERROR] Failed to post from conversation ${convo.conversationId}: ${err.message}`
        );
        moderation.reason = `Facebook posting failed: ${err.message}`;
        await flagAndNotify(submission, moderation, "posting-failed");
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
          moderation.reason = `Facebook posting failed: ${err.message}`;
          await flagAndNotify(submission, moderation, "posting-failed");
          continue;
        }
      } else {
        try {
          const result = await correctPost(oldPostId, submission, moderation.reply, client);
          postId = result.id;
          correctionOf = oldPostId;
        } catch (err) {
          console.error(
            `${tag} [ERROR] Failed to correct post for conversation ${convo.conversationId}: ${err.message}`
          );
          moderation.reason = `Facebook correction failed: ${err.message}`;
          await flagAndNotify(submission, moderation, "posting-failed");
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
            moderation.reply || "I can't find that post, it might already have been taken down."
          );
        } catch (err) {
          console.warn(`${tag} [WARN] Could not reply for delete: ${err.message}`);
        }
      } else {
        try {
          await removePost(oldPostId, submission, moderation.reply, client);
          deletedPostId = oldPostId;
        } catch (err) {
          console.error(
            `${tag} [ERROR] Failed to delete post for conversation ${convo.conversationId}: ${err.message}`
          );
          moderation.reason = `Facebook deletion failed: ${err.message}`;
          await flagAndNotify(submission, moderation, "posting-failed");
          continue;
        }
      }
    } else if (action === "REJECT") {
      await notifyRejection(submission, moderation.reply, client);
    } else {
      // FLAG (AI decision or low confidence)
      console.log(
        `${tag} [FLAG] Conversation ${convo.conversationId} flagged for manual review.`
      );
      await flagAndNotify(submission, moderation, "ai-flagged");
      continue;
    }

    // Append to the analysis post log (the monetisation dataset): every
    // publish and takedown, with the AI's category (business/selling/event/
    // community) so ad volume can be measured later.
    if (postId) {
      logPostEvent({
        type: "published",
        postId,
        pageId: client.pageId,
        pageName: client.pageName,
        conversationId: convo.conversationId,
        senderId: convo.senderId,
        senderName: convo.senderName,
        category: moderation.category || "unknown",
        text: submissionText,
        imageCount: images.length,
        ...(correctionOf ? { correctionOf } : {}),
        source: "auto",
      });
    } else if (deletedPostId) {
      logPostEvent({
        type: "deleted",
        postId: deletedPostId,
        pageId: client.pageId,
        pageName: client.pageName,
        conversationId: convo.conversationId,
      });
    }

    // Save to database (records the submission in the ledger when posted)
    saveConversation(convo, moderation, action, postId, {
      ...extras,
      images,
      postedText: submissionText,
    });

    // Send email notification
    await sendNotification(submission, moderation, action);
  }

  return { processed: conversations.length };
}

function buildSubmission(convo, moderation, submissionMsg, text, images, client) {
  return {
    id: moderation.submissionMessageId || convo.conversationId,
    conversationId: convo.conversationId,
    text,
    images,
    senderName: convo.senderName,
    senderId: convo.senderId,
    timestamp: submissionMsg?.timestamp || convo.updatedTime,
    pageName: client.pageName,
  };
}
