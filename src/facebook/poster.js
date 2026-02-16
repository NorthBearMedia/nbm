import { publishPost, publishPhotoPost, sendReply } from "./client.js";

/**
 * Format and publish an approved message as a page post.
 * If the submission includes images, publishes as a photo post.
 * The sender's name is not included (anonymous "Spotted" style).
 */
export async function postApprovedMessage(submission, replyText) {
  let result;
  if (submission.images?.length > 0) {
    // Post first image with text as caption
    result = await publishPhotoPost(submission.images[0], submission.text);
  } else {
    result = await publishPost(submission.text);
  }
  console.log(
    `[POSTED] Message ${submission.id} published as post ${result.id}`
  );

  // Reply to the sender via DM
  try {
    await sendReply(
      submission.senderId,
      replyText || "Your message has been approved and posted to the page!"
    );
    console.log(`[REPLY] Sent approval reply to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for message ${submission.id}: ${err.message}`
    );
  }

  return result;
}

/**
 * Notify sender that their message was rejected, with AI-generated reply.
 */
export async function notifyRejection(submission, replyText) {
  try {
    await sendReply(
      submission.senderId,
      replyText || "Sorry, your message wasn't approved for posting."
    );
    console.log(`[REPLY] Sent rejection reply to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for message ${submission.id}: ${err.message}`
    );
  }
}

/**
 * Notify sender that their message was flagged for review.
 */
export async function notifyFlagged(submission, replyText) {
  try {
    await sendReply(
      submission.senderId,
      replyText || "Thanks for your message! It's been queued for review and will be posted shortly if approved."
    );
    console.log(`[REPLY] Sent flagged reply to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for message ${submission.id}: ${err.message}`
    );
  }
}
