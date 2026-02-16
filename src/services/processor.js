import { fetchNewSubmissions } from "../facebook/client.js";
import { postApprovedMessage, notifyRejection, notifyFlagged } from "../facebook/poster.js";
import { moderateMessage, resolveAction } from "../moderation/moderator.js";
import { isProcessed, saveMessage } from "../db/database.js";

/**
 * Process all new DM submissions:
 * 1. Fetch new messages from the page inbox
 * 2. Run each through AI moderation
 * 3. Auto-post approved ones, reject bad ones, flag borderline ones
 * 4. Reply to the sender via DM with AI-generated message
 */
export async function processNewMessages(sinceTimestamp) {
  console.log(`[POLL] Checking for new messages...`);

  let submissions;
  try {
    submissions = await fetchNewSubmissions(sinceTimestamp);
  } catch (err) {
    console.error(`[ERROR] Failed to fetch messages: ${err.message}`);
    return { processed: 0, latestTimestamp: sinceTimestamp };
  }

  if (submissions.length === 0) {
    console.log(`[POLL] No new messages found.`);
    return { processed: 0, latestTimestamp: sinceTimestamp };
  }

  console.log(`[POLL] Found ${submissions.length} new message(s).`);

  let latestTimestamp = sinceTimestamp || 0;

  for (const submission of submissions) {
    // Skip if already processed (duplicate protection)
    if (isProcessed(submission.id)) {
      console.log(`[SKIP] Message ${submission.id} already processed.`);
      continue;
    }

    const hasImages = submission.images?.length > 0;
    const preview = submission.text
      ? `"${submission.text.substring(0, 50)}..."`
      : `[${submission.images.length} image(s), no text]`;

    console.log(
      `[MODERATE] Processing message from ${submission.senderName}: ${preview}`
    );

    // Run AI moderation
    let moderation;

    if (!submission.text && hasImages) {
      // Image-only messages can't be moderated by text AI — flag for review
      moderation = {
        decision: "FLAG",
        reason: "Image-only message — flagged for manual review",
        confidence: 0,
        reply: "Thanks for sending your image! It's been queued for review and will be posted if approved.",
      };
    } else {
      try {
        const moderationText = hasImages
          ? `${submission.text}\n\n[This message also includes ${submission.images.length} image(s)]`
          : submission.text;
        moderation = await moderateMessage(moderationText);
      } catch (err) {
        console.error(
          `[ERROR] Moderation failed for message ${submission.id}: ${err.message}`
        );
        moderation = {
          decision: "FLAG",
          reason: "Moderation error — flagged for manual review",
          confidence: 0,
          reply: "Thanks for your message! It's been queued for review.",
        };
      }
    }

    const action = resolveAction(moderation);

    console.log(
      `[DECISION] ${action} (${moderation.decision} @ ${moderation.confidence}) — ${moderation.reason}`
    );

    // Execute the action
    let postId = null;

    if (action === "POST") {
      try {
        const result = await postApprovedMessage(submission, moderation.reply);
        postId = result.id;
      } catch (err) {
        console.error(
          `[ERROR] Failed to post message ${submission.id}: ${err.message}`
        );
        saveMessage(submission, moderation, "FLAG");
        continue;
      }
    } else if (action === "REJECT") {
      await notifyRejection(submission, moderation.reply);
    } else {
      console.log(
        `[FLAG] Message ${submission.id} flagged for manual review.`
      );
      await notifyFlagged(submission, moderation.reply);
    }

    // Save to database
    saveMessage(submission, moderation, action, postId);

    // Track the latest timestamp
    if (submission.timestamp > latestTimestamp) {
      latestTimestamp = submission.timestamp;
    }
  }

  return { processed: submissions.length, latestTimestamp };
}
