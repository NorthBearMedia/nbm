import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Append-only log of everything published to the pages — the analysis dataset
 * for eventually monetising business ads while keeping community posts free.
 *
 * One JSON line per event, never rewritten (unlike the moderation DB, which
 * upserts and keeps only latest state per conversation). Lives on the same
 * persistent volume as the DB.
 *
 * Event shapes:
 *   { at, type: "published", postId, pageId, pageName, conversationId,
 *     senderId, senderName, category, text, imageCount, scheduledAt?,
 *     correctionOf?, source }
 *   { at, type: "deleted", postId, pageId, pageName, conversationId }
 */

let logPath = null;

export function initPostLog(dataDir = "./data") {
  mkdirSync(dataDir, { recursive: true });
  logPath = join(dataDir, "post-log.jsonl");
  return logPath;
}

export function postLogExists() {
  return logPath !== null && existsSync(logPath);
}

/**
 * Append one event. Never throws — losing a log line must not break posting.
 */
export function logPostEvent(record) {
  if (!logPath) return;
  try {
    appendFileSync(logPath, JSON.stringify({ at: Date.now(), ...record }) + "\n");
  } catch (err) {
    console.error(`[POSTLOG] Failed to append: ${err.message}`);
  }
}

/**
 * Read the whole log (newest first). Tolerates a torn final line from a
 * crash mid-append.
 */
export function readPostLog() {
  if (!postLogExists()) return [];
  const records = [];
  for (const line of readFileSync(logPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // torn/corrupt line — skip it rather than fail the whole read
    }
  }
  return records.reverse();
}

/**
 * Counts by category for published posts in the last N days — the number
 * that matters for ad pricing ("how many business posts do we run a month?").
 */
export function getCategoryStats(days = 30) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const counts = {};
  for (const rec of readPostLog()) {
    if (rec.type !== "published" || (rec.at || 0) < cutoff) continue;
    const key = `${rec.pageName || "Unknown page"}|${rec.category || "unknown"}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function csvField(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * The whole log as CSV (oldest first) for analysis in Excel/Sheets.
 */
export function postLogToCsv() {
  const header = [
    "date",
    "type",
    "page",
    "category",
    "sender_name",
    "sender_id",
    "post_id",
    "image_count",
    "text",
  ];
  const rows = [header.join(",")];
  for (const rec of readPostLog().reverse()) {
    rows.push(
      [
        new Date(rec.at).toISOString(),
        rec.type,
        rec.pageName || "",
        rec.category || "",
        rec.senderName || "",
        rec.senderId || "",
        rec.postId || "",
        rec.imageCount ?? "",
        rec.text || "",
      ]
        .map(csvField)
        .join(",")
    );
  }
  return rows.join("\r\n") + "\r\n";
}
