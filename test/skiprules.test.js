import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipConversation } from "../src/services/skiprules.js";

const WATERMARK = 1_000_000;

test("skips anything older than the watermark", () => {
  assert.equal(
    shouldSkipConversation({ updatedTime: WATERMARK - 1, watermark: WATERMARK, storedUpdatedAt: 0 }),
    true
  );
});

test("processes a never-seen conversation newer than the watermark", () => {
  assert.equal(
    shouldSkipConversation({ updatedTime: WATERMARK + 10, watermark: WATERMARK, storedUpdatedAt: 0 }),
    false
  );
});

test("skips an already-processed conversation with no new activity", () => {
  assert.equal(
    shouldSkipConversation({
      updatedTime: WATERMARK + 10,
      watermark: WATERMARK,
      storedUpdatedAt: WATERMARK + 20,
    }),
    true
  );
});

test("processes a follow-up (updated after we last stored it)", () => {
  assert.equal(
    shouldSkipConversation({
      updatedTime: WATERMARK + 30,
      watermark: WATERMARK,
      storedUpdatedAt: WATERMARK + 20,
    }),
    false
  );
});

test("a retry-reset row (storedUpdatedAt = 0) is re-processed", () => {
  assert.equal(
    shouldSkipConversation({ updatedTime: WATERMARK + 10, watermark: WATERMARK, storedUpdatedAt: 0 }),
    false
  );
});
