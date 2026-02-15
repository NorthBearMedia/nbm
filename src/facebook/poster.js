import { publishPost, sendReply } from "./client.js";

/**
 * Format and publish an approved message as a page post.
 * The sender's name is not included (anonymous "Spotted" style).
 */
export async function postApprovedMessage(submission) {
  const postText = submission.text;

  const result = await publishPost(postText);
  console.log(
    `[POSTED] Message ${submission.id} published as post ${result.id}`
  );

  // Optionally notify the sender that their message was posted
  try {
    await sendReply(
      submission.conversationId,
      "Your message has been approved and posted to the page! 🎉"
    );
  } catch (err) {
    // Non-critical — don't fail if reply doesn't send
    console.warn(
      `[WARN] Could not notify sender for message ${submission.id}: ${err.message}`
    );
  }

  return result;
}

/**
 * Notify sender that their message was rejected.
 */
export async function notifyRejection(submission, reason) {
  try {
    await sendReply(
      submission.conversationId,
      `Your message was not approved for posting. Reason: ${reason}`
    );
  } catch (err) {
    console.warn(
      `[WARN] Could not notify sender of rejection for message ${submission.id}: ${err.message}`
    );
  }
}
