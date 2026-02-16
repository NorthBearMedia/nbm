import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

let dbPath;
let data;

function load() {
  if (existsSync(dbPath)) {
    data = JSON.parse(readFileSync(dbPath, "utf-8"));
  } else {
    data = { messages: [] };
  }
}

function save() {
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

/**
 * Initialise the JSON-based database and create the file if needed.
 */
export function initDatabase(path = "./data/moderation.json") {
  mkdirSync("./data", { recursive: true });
  dbPath = path;
  load();
  return data;
}

/**
 * Check if a message has already been processed.
 */
export function isProcessed(messageId) {
  return data.messages.some((m) => m.id === messageId);
}

/**
 * Save a message and its moderation result.
 */
export function saveMessage(submission, moderation, action, postId = null) {
  // Remove existing entry if present (upsert)
  data.messages = data.messages.filter((m) => m.id !== submission.id);

  data.messages.push({
    id: submission.id,
    conversation_id: submission.conversationId,
    sender_name: submission.senderName,
    sender_id: submission.senderId,
    text: submission.text,
    received_at: submission.timestamp,
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
 * Get recent messages for a simple status overview.
 */
export function getRecentMessages(limit = 20) {
  return [...data.messages]
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit);
}

/**
 * Get flagged messages that need manual review.
 */
export function getFlaggedMessages() {
  return data.messages
    .filter((m) => m.action === "FLAG")
    .sort((a, b) => b.received_at - a.received_at);
}

/**
 * Get counts by action type.
 */
export function getStats() {
  const counts = {};
  for (const msg of data.messages) {
    counts[msg.action] = (counts[msg.action] || 0) + 1;
  }
  return counts;
}
