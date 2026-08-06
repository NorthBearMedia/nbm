import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  initPostLog,
  logPostEvent,
  readPostLog,
  postLogToCsv,
  getCategoryStats,
} from "../src/services/postlog.js";
import { normalizeCategory } from "../src/moderation/rules.js";

function freshLog() {
  const dir = mkdtempSync(join(tmpdir(), "nbm-postlog-"));
  initPostLog(dir);
  return dir;
}

test("append and read roundtrip, newest first", () => {
  const dir = freshLog();
  logPostEvent({ type: "published", postId: "P1", pageName: "Derby", category: "business", text: "Pizza deal" });
  logPostEvent({ type: "published", postId: "P2", pageName: "Derby", category: "community", text: "Lost cat" });
  const log = readPostLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].postId, "P2"); // newest first
  assert.equal(log[1].category, "business");
  rmSync(dir, { recursive: true, force: true });
});

test("a torn final line (crash mid-append) doesn't break reading", () => {
  const dir = freshLog();
  logPostEvent({ type: "published", postId: "P1", category: "event" });
  appendFileSync(join(dir, "post-log.jsonl"), '{"type":"published","postId":"P2","cat');
  const log = readPostLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].postId, "P1");
  rmSync(dir, { recursive: true, force: true });
});

test("CSV export escapes commas, quotes and newlines in post text", () => {
  const dir = freshLog();
  logPostEvent({
    type: "published",
    postId: "P1",
    pageName: "Derby",
    category: "selling",
    senderName: 'Dave "The Van" Smith',
    text: 'Sofa, free\nCollection only',
  });
  const csv = postLogToCsv();
  assert.ok(csv.startsWith("date,type,page,category"));
  assert.ok(csv.includes('"Dave ""The Van"" Smith"'));
  assert.ok(csv.includes('"Sofa, free\nCollection only"'));
  rmSync(dir, { recursive: true, force: true });
});

test("category stats count published posts per page and type", () => {
  const dir = freshLog();
  logPostEvent({ type: "published", postId: "P1", pageName: "Derby", category: "business" });
  logPostEvent({ type: "published", postId: "P2", pageName: "Derby", category: "business" });
  logPostEvent({ type: "published", postId: "P3", pageName: "Derby", category: "community" });
  logPostEvent({ type: "deleted", postId: "P1", pageName: "Derby" }); // not counted
  const stats = getCategoryStats(30);
  assert.equal(stats["Derby|business"], 2);
  assert.equal(stats["Derby|community"], 1);
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeCategory accepts known values and falls back to unknown", () => {
  assert.equal(normalizeCategory("business"), "business");
  assert.equal(normalizeCategory(" Business "), "business");
  assert.equal(normalizeCategory("advert"), "unknown");
  assert.equal(normalizeCategory(null), "unknown");
  assert.equal(normalizeCategory(undefined), "unknown");
});
