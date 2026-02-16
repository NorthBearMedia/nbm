import { publishPost, publishPhotoPost, sendReply, deletePost } from "./client.js";

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
 * Correct a post: delete the old one, repost with corrected content, notify the user.
 * Returns the new post result (with new post ID).
 */
export async function correctPost(oldPostId, submission, replyText) {
  // Step 1: Delete the old post
  try {
    await deletePost(oldPostId);
    console.log(`[DELETED] Old post ${oldPostId} removed for correction`);
  } catch (err) {
    console.error(`[ERROR] Failed to delete old post ${oldPostId}: ${err.message}`);
    throw err;
  }

  // Step 2: Repost with corrected content
  let result;
  if (submission.images?.length > 0) {
    result = await publishPhotoPost(submission.images[0], submission.text);
  } else {
    result = await publishPost(submission.text);
  }
  console.log(
    `[CORRECTED] Reposted as ${result.id} (replaced ${oldPostId})`
  );

  // Step 3: Notify the user
  try {
    await sendReply(
      submission.senderId,
      replyText || "No worries! The old post has been removed and the corrected version is now live."
    );
    console.log(`[REPLY] Sent correction confirmation to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for correction: ${err.message}`
    );
  }

  return result;
}

/**
 * Delete a post and notify the user (no repost).
 */
export async function removePost(oldPostId, submission, replyText) {
  try {
    await deletePost(oldPostId);
    console.log(`[DELETED] Post ${oldPostId} removed at user request`);
  } catch (err) {
    console.error(`[ERROR] Failed to delete post ${oldPostId}: ${err.message}`);
    throw err;
  }

  try {
    await sendReply(
      submission.senderId,
      replyText || "Done! The post has been taken down as requested."
    );
    console.log(`[REPLY] Sent deletion confirmation to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for deletion: ${err.message}`
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
