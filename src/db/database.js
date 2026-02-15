import Database from "better-sqlite3";
import { mkdirSync } from "fs";

let db;

/**
 * Initialise the SQLite database and create tables if needed.
 */
export function initDatabase(dbPath = "./data/moderation.db") {
  // Ensure the data directory exists
  mkdirSync("./data", { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_name TEXT,
      sender_id TEXT,
      text TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      decision TEXT,
      reason TEXT,
      confidence REAL,
      action TEXT,
      post_id TEXT,
      processed_at INTEGER
    )
  `);

  return db;
}

/**
 * Check if a message has already been processed.
 */
export function isProcessed(messageId) {
  const row = db.prepare("SELECT id FROM messages WHERE id = ?").get(messageId);
  return !!row;
}

/**
 * Save a message and its moderation result.
 */
export function saveMessage(submission, moderation, action, postId = null) {
  db.prepare(
    `INSERT OR REPLACE INTO messages
     (id, conversation_id, sender_name, sender_id, text, received_at,
      decision, reason, confidence, action, post_id, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    submission.id,
    submission.conversationId,
    submission.senderName,
    submission.senderId,
    submission.text,
    submission.timestamp,
    moderation.decision,
    moderation.reason,
    moderation.confidence,
    action,
    postId,
    Date.now()
  );
}

/**
 * Get recent messages for a simple status overview.
 */
export function getRecentMessages(limit = 20) {
  return db
    .prepare("SELECT * FROM messages ORDER BY received_at DESC LIMIT ?")
    .all(limit);
}

/**
 * Get flagged messages that need manual review.
 */
export function getFlaggedMessages() {
  return db
    .prepare(
      "SELECT * FROM messages WHERE action = 'FLAG' ORDER BY received_at DESC"
    )
    .all();
}

/**
 * Get counts by action type.
 */
export function getStats() {
  const rows = db
    .prepare("SELECT action, COUNT(*) as count FROM messages GROUP BY action")
    .all();
  return Object.fromEntries(rows.map((r) => [r.action, r.count]));
}
