import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

let dbPath;
let data;

function load() {
  if (existsSync(dbPath)) {
    data = JSON.parse(readFileSync(dbPath, "utf-8"));
  } else {
    data = { messages: [], lastChecked: Date.now() };
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

/**
 * Get the last-checked timestamp.
 * Always defaults to Date.now() so fresh starts only see new messages.
 */
export function getLastChecked() {
  return data.lastChecked || Date.now();
}

/**
 * Persist the last-checked timestamp.
 */
export function setLastChecked(timestamp) {
  data.lastChecked = timestamp;
  save();
}
