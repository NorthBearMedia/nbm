import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

let dbPath;
let data;

function load() {
  if (existsSync(dbPath)) {
    data = JSON.parse(readFileSync(dbPath, "utf-8"));
    // Migrate: ensure conversations array exists
    if (!data.conversations) {
      data.conversations = [];
    }
  } else {
    data = { messages: [], conversations: [] };
  }
}

function save() {
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

/**
 * Initialise the JSON-based database and create the file if needed.
 * Uses DATA_DIR env var for the directory (mount a Railway Volume there).
 */
export function initDatabase(dataDir = "./data") {
  mkdirSync(dataDir, { recursive: true });
  dbPath = join(dataDir, "moderation.json");
  load();
  save(); // persist immediately so the file exists
  return data;
}

/**
 * Check if a conversation has already been processed.
 */
export function isConversationProcessed(conversationId) {
  return data.conversations.some((c) => c.conversation_id === conversationId);
}

/**
 * Save a conversation and its moderation result.
 */
export function saveConversation(convo, moderation, action, postId = null) {
  // Remove existing entry if present (upsert)
  data.conversations = data.conversations.filter(
    (c) => c.conversation_id !== convo.conversationId
  );

  const userMessages = convo.thread.filter((m) => !m.isPage);

  data.conversations.push({
    conversation_id: convo.conversationId,
    sender_name: convo.senderName,
    sender_id: convo.senderId,
    submission_text: moderation.submissionText || null,
    submission_message_id: moderation.submissionMessageId || null,
    user_message_count: userMessages.length,
    updated_at: convo.updatedTime,
    decision: moderation.decision,
    reason: moderation.reason,
    confidence: moderation.confidence,
    action,
    post_id: postId,
    processed_at: Date.now(),
  });

  save();
}

/**
 * Get the stored post ID for a conversation (if it was posted).
 * Returns null if not found or not posted.
 */
export function getConversationPostId(conversationId) {
  const entry = data.conversations.find((c) => c.conversation_id === conversationId);
  return entry?.post_id || null;
}

/**
 * Get recent conversations for a simple status overview.
 */
export function getRecentMessages(limit = 20) {
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
 * Get counts by action type.
 */
export function getStats() {
  const counts = {};
  for (const c of data.conversations) {
    counts[c.action] = (counts[c.action] || 0) + 1;
  }
  return counts;
}
