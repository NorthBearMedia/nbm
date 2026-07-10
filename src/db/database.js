import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { normalizeText, tokenOverlap } from "../utils/text.js";

let dbPath;
let data;
let loadWarning = null;

function freshData() {
  return { conversations: [], watermark: Date.now() };
}

function load() {
  if (!existsSync(dbPath)) {
    data = freshData();
    return;
  }

  try {
    data = JSON.parse(readFileSync(dbPath, "utf-8"));
  } catch (err) {
    // A crash mid-write (pre-atomic-writes) can leave a corrupt file. Park it
    // aside and start fresh rather than crash-looping on boot. The watermark
    // in the fresh file prevents any reprocessing of old conversations.
    const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
    try {
      renameSync(dbPath, corruptPath);
    } catch {
      /* best effort */
    }
    loadWarning = `Database file was corrupt and has been moved to ${corruptPath}. Starting with a fresh database — stored post IDs were lost, so corrections/deletions of older posts won't work.`;
    console.error(`[DB] ${loadWarning}`);
    data = freshData();
    return;
  }

  // Migrations for files written by older versions
  if (!data.conversations) data.conversations = [];
  if (!data.watermark) {
    // First boot on the new code with an existing DB: seed the watermark to
    // "now" (preserves the old BOOT_TIME safety). From here on it persists
    // across restarts, so redeploys no longer eat DMs that arrive mid-restart.
    data.watermark = Date.now();
  }
  delete data.messages; // dead field from the first version

  // Backfill the per-submission ledger for legacy rows so the double-post
  // guard (isSubmissionPosted) and post lookup work identically old and new.
  // Without this, a follow-up DM on a pre-deploy conversation could re-post.
  for (const row of data.conversations) {
    if (!row.submissions) {
      row.submissions =
        row.action === "POST" && row.post_id && row.submission_message_id
          ? [
              {
                message_id: row.submission_message_id,
                post_id: row.post_id,
                text: row.submission_text || "",
                at: row.processed_at || Date.now(),
              },
            ]
          : [];
    }
  }
}

function save() {
  // Atomic write: a crash mid-write must never corrupt the live file.
  const tmpPath = `${dbPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, dbPath);
}

/**
 * Initialise the JSON-based database and create the file if needed.
 * Uses DATA_DIR env var for the directory (mount a Railway Volume there).
 */
export function initDatabase(dataDir = "./data") {
  mkdirSync(dataDir, { recursive: true });
  dbPath = join(dataDir, "moderation.json");
  load();
  save(); // persist immediately so the file (and watermark) exists
  return data;
}

/**
 * If the last load had to recover from a corrupt file, returns a description
 * (used to email the owner once notifications are up). Null otherwise.
 */
export function getLoadWarning() {
  return loadWarning;
}

/**
 * Hard cutoff timestamp: conversations last updated before this are never
 * touched. Persisted so restarts/redeploys don't reset it.
 */
export function getWatermark() {
  return data.watermark;
}

/**
 * Check if a conversation has already been processed.
 */
export function isConversationProcessed(conversationId) {
  return data.conversations.some((c) => c.conversation_id === conversationId);
}

/**
 * Save a conversation and its moderation result.
 *
 * extras: { pageId, pageName, images, postedText } — recorded so the flagged
 * queue and approve-from-email flow know which page an item belongs to and
 * what would be posted.
 */
export function saveConversation(convo, moderation, action, postId = null, extras = {}) {
  const existing = data.conversations.find(
    (c) => c.conversation_id === convo.conversationId
  );

  // The caller passes a post id ONLY when it actually published this call
  // (a real POST or CORRECTION repost). Capture it before carry-forward so
  // the ledger records genuine publishes and not re-saves.
  const newlyPosted = postId;

  if (action === "DELETE") {
    // The post is gone — clear the live pointer, don't carry it forward.
    postId = null;
  } else if (!postId && existing?.post_id) {
    // Carry forward the old post_id if we're not replacing it
    postId = existing.post_id;
  }

  // Per-submission ledger: which message ids have been published, and as
  // which posts. This is what makes double-posting structurally impossible.
  const submissions = [...(existing?.submissions || [])];
  if (newlyPosted && moderation.submissionMessageId && ["POST", "CORRECTION"].includes(action)) {
    submissions.push({
      message_id: moderation.submissionMessageId,
      post_id: newlyPosted,
      text: extras.postedText || moderation.submissionText || "",
      at: Date.now(),
    });
  }

  // Remove existing entry if present (upsert)
  data.conversations = data.conversations.filter(
    (c) => c.conversation_id !== convo.conversationId
  );

  const userMessages = convo.thread.filter((m) => !m.isPage);

  // Use Date.now() for updated_at rather than convo.updatedTime.
  // The bot's own DM reply bumps Facebook's updated_time for the conversation.
  // If we stored the original updatedTime, the next poll would see a newer
  // updated_time (from our reply) and re-process → duplicate posts.
  // By storing Date.now() (which is AFTER our reply was sent), shouldSkip
  // will correctly see updatedTime <= storedAt on the next poll.
  const now = Date.now();

  data.conversations.push({
    conversation_id: convo.conversationId,
    sender_name: convo.senderName,
    sender_id: convo.senderId,
    page_id: extras.pageId || existing?.page_id || null,
    page_name: extras.pageName || existing?.page_name || null,
    submission_text: moderation.submissionText || null,
    submission_message_id: moderation.submissionMessageId || null,
    images: extras.images?.slice(0, 8) || existing?.images || [],
    reply: moderation.reply || null,
    user_message_count: userMessages.length,
    updated_at: now,
    decision: moderation.decision,
    reason: moderation.reason,
    confidence: moderation.confidence,
    action,
    post_id: postId,
    submissions,
    processed_at: now,
  });

  save();
}

/**
 * Get the stored updated_at timestamp for a conversation.
 * Returns 0 if the conversation has never been processed.
 */
export function getConversationUpdatedAt(conversationId) {
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  return entry?.updated_at || 0;
}

/**
 * Get the stored processed_at timestamp for a conversation.
 * Returns 0 if the conversation has never been processed.
 */
export function getConversationProcessedAt(conversationId) {
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  return entry?.processed_at || 0;
}

/**
 * Get the stored post ID for a conversation (if it was posted).
 * Prefers the most recent ledger entry; falls back to the legacy flat field.
 */
export function getConversationPostId(conversationId) {
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  if (!entry) return null;
  // Flat post_id is the authoritative live-post pointer — saveConversation keeps
  // it accurate across CORRECTION (→ new id) and DELETE (→ null). We deliberately
  // do NOT fall back to the submissions ledger: its last entry can be a
  // since-deleted/replaced post, which would resurrect a dead post id.
  return entry.post_id || null;
}

/**
 * Has this specific message already been published as a post?
 * Used to make re-posting the same submission structurally impossible.
 */
export function isSubmissionPosted(conversationId, messageId) {
  if (!messageId) return false;
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  return Boolean(entry?.submissions?.some((s) => s.message_id === messageId));
}

/**
 * Look for a recently published post with (near-)identical text on the same
 * page — catches impatient resends and two people submitting the same flyer.
 * Returns { postId, text } or null.
 */
export function findRecentDuplicate(pageId, text, { excludeConversationId, windowMs = 30 * 24 * 3600_000 } = {}) {
  const norm = normalizeText(text);
  if (!norm || norm.split(" ").length < 4) return null; // too short to compare meaningfully
  const cutoff = Date.now() - windowMs;

  for (const row of data.conversations) {
    if (row.conversation_id === excludeConversationId) continue;
    if (pageId && row.page_id && row.page_id !== pageId) continue;

    const candidates = [
      ...(row.submissions || []),
      // Legacy rows: single posted submission recorded on the flat fields
      ...(row.action === "POST" && row.post_id
        ? [{ post_id: row.post_id, text: row.submission_text, at: row.processed_at }]
        : []),
    ];

    for (const sub of candidates) {
      if (!sub.text || !sub.post_id || (sub.at || 0) < cutoff) continue;
      const candNorm = normalizeText(sub.text);
      if (candNorm === norm || tokenOverlap(candNorm, norm) >= 0.9) {
        return { postId: sub.post_id, text: sub.text };
      }
    }
  }
  return null;
}

/**
 * Get a single conversation row.
 */
export function getConversation(conversationId) {
  return data.conversations.find((c) => c.conversation_id === conversationId) || null;
}

/**
 * Update a conversation's action after a manual approve/reject (email link or
 * dashboard). Records the post in the ledger when approving.
 */
export function updateConversationAction(conversationId, action, postId = null) {
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  if (!entry) return false;
  const now = Date.now();
  entry.action = action;
  entry.processed_at = now;
  entry.updated_at = now;
  if (postId) {
    entry.post_id = postId;
    entry.submissions = entry.submissions || [];
    entry.submissions.push({
      message_id: entry.submission_message_id,
      post_id: postId,
      text: entry.submission_text || "",
      at: now,
    });
  }
  save();
  return true;
}

/**
 * Get recent conversations for a simple status overview.
 */
export function getRecentConversations(limit = 20) {
  return [...data.conversations]
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, limit);
}

/**
 * Get flagged conversations that need manual review.
 */
export function getFlaggedMessages() {
  return data.conversations
    .filter((c) => c.action === "FLAG")
    .sort((a, b) => b.updated_at - a.updated_at);
}

/**
 * Reset flagged conversations so they get re-processed on the next poll —
 * WITHOUT deleting the rows (that destroyed the stored post_id and, after a
 * redeploy, silently did nothing). We keep action = "FLAG" so the item stays
 * visible in the queue: if the conversation is still active it will be
 * re-processed (updated_at = 0 makes shouldSkip re-enter it) and the row
 * overwritten; if it's an old conversation the watermark keeps it skipped, and
 * it correctly remains in the flagged queue rather than vanishing.
 * Returns the number of conversations reset.
 */
export function resetFlaggedForRetry() {
  let count = 0;
  for (const row of data.conversations) {
    if (row.action === "FLAG") {
      row.updated_at = 0;
      count++;
    }
  }
  if (count > 0) save();
  return count;
}

/**
 * Get counts by action type.
 */
export function getStats() {
  const counts = {};
  for (const c of data.conversations) {
    counts[c.action] = (counts[c.action] || 0) + 1;
  }
  return counts;
}

/**
 * Posts per page over the last N days — the number the owner actually wants.
 */
export function getWeeklyStats(days = 7) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const perPage = {};
  for (const row of data.conversations) {
    const page = row.page_name || "Unknown page";
    perPage[page] = perPage[page] || { posts: 0, flagged: 0, rejected: 0 };
    if ((row.processed_at || 0) < cutoff) continue;
    if (row.action === "POST") perPage[page].posts++;
    else if (row.action === "FLAG") perPage[page].flagged++;
    else if (row.action === "REJECT") perPage[page].rejected++;
  }
  return perPage;
}
