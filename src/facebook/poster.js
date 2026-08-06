import { config } from "../config.js";

/**
 * Apply the page's post template ("{text}" placeholder). split/join rather
 * than replace() so user text containing "$" can't corrupt the output.
 */
function applyTemplate(template, text) {
  return (template || "{text}").split("{text}").join(text);
}

/**
 * If posting hours are configured and we're outside them, return the Date of
 * the next window open (for Facebook native scheduling). Otherwise null —
 * post immediately.
 *
 * Walks forward hour by hour using Intl so DST in the configured timezone is
 * handled correctly without any offset math.
 */
export function nextPostingTime(now = new Date()) {
  const hours = config.posting.hours;
  if (!hours) return null;

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.posting.timezone,
    hour: "numeric",
    hour12: false,
  });
  const hourOf = (d) => parseInt(fmt.format(d), 10) % 24;

  if (hourOf(now) >= hours.start && hourOf(now) < hours.end) return null;

  const target = new Date(now);
  target.setMinutes(0, 30, 0); // land at hh:00:30, just inside the window
  let guard = 0;
  while (guard++ < 48) {
    target.setTime(target.getTime() + 3600_000);
    if (hourOf(target) === hours.start) break;
  }

  // Facebook needs scheduled_publish_time ≥ ~10 min out; if the window opens
  // almost immediately, just post now.
  if (target.getTime() - now.getTime() < 15 * 60_000) return null;
  return target;
}

function formatLocalTime(date) {
  return date.toLocaleString("en-GB", {
    timeZone: config.posting.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Publish a submission to the page: template applied, all photos attached,
 * scheduled if outside posting hours. Returns { id, scheduledAt, permalink }.
 */
export async function publishSubmission(submission, client) {
  const message = applyTemplate(client.template, submission.text || "");
  const scheduledAt = nextPostingTime();

  const result = await client.publishFeedPost({
    message,
    imageUrls: submission.images || [],
    scheduledAt,
  });

  let permalink = null;
  if (!scheduledAt) {
    permalink = await client.getPermalink(result.id);
  }

  return { id: result.id, scheduledAt, permalink };
}

/**
 * Format and publish an approved message as a page post, then DM the sender —
 * including a link to their live post (people immediately like and share
 * their own post, and it stops the "did it go up?" resends).
 */
export async function postApprovedMessage(submission, replyText, client) {
  const { id, scheduledAt, permalink } = await publishSubmission(submission, client);

  console.log(
    `[POSTED] Message ${submission.id} published as post ${id}` +
      (scheduledAt ? ` (scheduled for ${scheduledAt.toISOString()})` : "")
  );

  let reply = replyText || "Nice one, that's gone up on the page now. Cheers!";
  if (scheduledAt) {
    reply += `\n\nIt'll go up at ${formatLocalTime(scheduledAt)}.`;
  }

  try {
    await client.sendReply(submission.senderId, reply);
    console.log(`[REPLY] Sent approval reply to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for message ${submission.id}: ${err.message}`
    );
  }

  return { id, scheduledAt, permalink };
}

/**
 * Notify sender that their message was rejected, with AI-generated reply.
 */
export async function notifyRejection(submission, replyText, client) {
  try {
    await client.sendReply(
      submission.senderId,
      replyText || "Sorry, we can't put that one up on the page."
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
export async function correctPost(oldPostId, submission, replyText, client) {
  // Step 1: Delete the old post
  try {
    await client.deletePost(oldPostId);
    console.log(`[DELETED] Old post ${oldPostId} removed for correction`);
  } catch (err) {
    console.error(`[ERROR] Failed to delete old post ${oldPostId}: ${err.message}`);
    throw err;
  }

  // Step 2: Repost with corrected content
  const { id, scheduledAt, permalink } = await publishSubmission(submission, client);
  console.log(`[CORRECTED] Reposted as ${id} (replaced ${oldPostId})`);

  // Step 3: Notify the user
  let reply =
    replyText || "All sorted, the old one's gone and the new one's up.";
  if (scheduledAt) {
    reply += `\n\nThe new one'll go up at ${formatLocalTime(scheduledAt)}.`;
  }

  try {
    await client.sendReply(submission.senderId, reply);
    console.log(`[REPLY] Sent correction confirmation to ${submission.senderName}`);
  } catch (err) {
    console.warn(`[WARN] Could not reply to sender for correction: ${err.message}`);
  }

  return { id };
}

/**
 * Delete a post and notify the user (no repost).
 */
export async function removePost(oldPostId, submission, replyText, client) {
  try {
    await client.deletePost(oldPostId);
    console.log(`[DELETED] Post ${oldPostId} removed at user request`);
  } catch (err) {
    console.error(`[ERROR] Failed to delete post ${oldPostId}: ${err.message}`);
    throw err;
  }

  try {
    await client.sendReply(
      submission.senderId,
      replyText || "No worries, I've taken it down for you."
    );
    console.log(`[REPLY] Sent deletion confirmation to ${submission.senderName}`);
  } catch (err) {
    console.warn(`[WARN] Could not reply to sender for deletion: ${err.message}`);
  }
}

/**
 * Notify sender that their message was flagged for review.
 */
export async function notifyFlagged(submission, replyText, client) {
  try {
    await client.sendReply(
      submission.senderId,
      replyText || "Cheers for that, I'll have a look and get it up shortly."
    );
    console.log(`[REPLY] Sent flagged reply to ${submission.senderName}`);
  } catch (err) {
    console.warn(
      `[WARN] Could not reply to sender for message ${submission.id}: ${err.message}`
    );
  }
}
