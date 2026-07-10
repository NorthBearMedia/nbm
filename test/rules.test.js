import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAction, validateModerationResult } from "../src/moderation/rules.js";

const THRESHOLD = 0.7;

test("resolveAction: high-confidence APPROVE posts", () => {
  assert.equal(resolveAction({ decision: "APPROVE", confidence: 0.95 }, THRESHOLD), "POST");
});

test("resolveAction: low-confidence APPROVE flags", () => {
  assert.equal(resolveAction({ decision: "APPROVE", confidence: 0.5 }, THRESHOLD), "FLAG");
});

test("resolveAction: SKIP and ASK pass through regardless of confidence", () => {
  assert.equal(resolveAction({ decision: "SKIP", confidence: 0 }, THRESHOLD), "SKIP");
  assert.equal(resolveAction({ decision: "ASK", confidence: 0 }, THRESHOLD), "ASK");
});

test("resolveAction: FLAG always flags", () => {
  assert.equal(resolveAction({ decision: "FLAG", confidence: 1 }, THRESHOLD), "FLAG");
});

test("resolveAction: CORRECTION and DELETE respect the threshold", () => {
  assert.equal(resolveAction({ decision: "CORRECTION", confidence: 0.9 }, THRESHOLD), "CORRECTION");
  assert.equal(resolveAction({ decision: "DELETE", confidence: 0.9 }, THRESHOLD), "DELETE");
  assert.equal(resolveAction({ decision: "CORRECTION", confidence: 0.3 }, THRESHOLD), "FLAG");
});

test("validateModerationResult: rejects invalid shapes", () => {
  assert.equal(validateModerationResult(null, new Set()), null);
  assert.equal(validateModerationResult({ decision: "NOPE", reason: "x", confidence: 1 }, new Set()), null);
  assert.equal(validateModerationResult({ decision: "APPROVE", reason: 5, confidence: 1 }, new Set()), null);
});

test("validateModerationResult: hallucinated submissionMessageId downgrades to FLAG", () => {
  const result = validateModerationResult(
    { decision: "APPROVE", submissionMessageId: "m_fake", reason: "ok", confidence: 0.99, hasImages: false },
    new Set(["m_real"])
  );
  assert.equal(result.decision, "FLAG");
});

test("validateModerationResult: valid id passes through untouched", () => {
  const result = validateModerationResult(
    { decision: "APPROVE", submissionMessageId: "m_real", reason: "ok", confidence: 0.99, hasImages: false },
    new Set(["m_real"])
  );
  assert.equal(result.decision, "APPROVE");
});

test("validateModerationResult: unknown useImagesFromMessageId is dropped, decision kept", () => {
  const result = validateModerationResult(
    {
      decision: "APPROVE",
      submissionMessageId: "m_real",
      useImagesFromMessageId: "m_fake",
      reason: "ok",
      confidence: 0.99,
      hasImages: true,
    },
    new Set(["m_real"])
  );
  assert.equal(result.decision, "APPROVE");
  assert.equal(result.useImagesFromMessageId, null);
});

test("validateModerationResult: ASK/SKIP need no submissionMessageId", () => {
  const result = validateModerationResult(
    { decision: "ASK", submissionMessageId: null, reason: "need info", confidence: 0.9 },
    new Set()
  );
  assert.equal(result.decision, "ASK");
});
