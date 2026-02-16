import { fetchNewSubmissions } from "../facebook/client.js";
import { postApprovedMessage, notifyRejection } from "../facebook/poster.js";
import { moderateMessage, resolveAction } from "../moderation/moderator.js";
import { isProcessed, saveMessage } from "../db/database.js";
import { sendNotification } from "./notifier.js";

/**
 * Process all new DM submissions:
 * 1. Fetch new messages from the page inbox
 * 2. Run each through AI moderation
 * 3. Auto-post approved ones, reject bad ones, flag borderline ones
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

    console.log(
      `[MODERATE] Processing message from ${submission.senderName}: "${submission.text.substring(0, 50)}..."`
    );

    // Run AI moderation
    let moderation;
    try {
      moderation = await moderateMessage(submission.text);
    } catch (err) {
      console.error(
        `[ERROR] Moderation failed for message ${submission.id}: ${err.message}`
      );
      moderation = {
        decision: "FLAG",
        reason: "Moderation error — flagged for manual review",
        confidence: 0,
      };
    }

    const action = resolveAction(moderation);

    console.log(
      `[DECISION] ${action} (${moderation.decision} @ ${moderation.confidence}) — ${moderation.reason}`
    );

    // Execute the action
    let postId = null;

    if (action === "POST") {
      try {
        const result = await postApprovedMessage(submission);
        postId = result.id;
      } catch (err) {
        console.error(
          `[ERROR] Failed to post message ${submission.id}: ${err.message}`
        );
        // Save as FLAG so it can be retried manually
        saveMessage(submission, moderation, "FLAG");
        continue;
      }
    } else if (action === "REJECT") {
      await notifyRejection(submission, moderation.reason);
    } else {
      console.log(
        `[FLAG] Message ${submission.id} flagged for manual review.`
      );
    }

    // Save to database
    saveMessage(submission, moderation, action, postId);

    // Send email notification
    await sendNotification(submission, moderation, action);

    // Track the latest timestamp
    if (submission.timestamp > latestTimestamp) {
      latestTimestamp = submission.timestamp;
    }
  }

  return { processed: submissions.length, latestTimestamp };
}
