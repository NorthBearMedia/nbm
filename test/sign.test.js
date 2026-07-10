import { test } from "node:test";
import assert from "node:assert/strict";
import { signAction, verifyAction, buildActionUrl } from "../src/utils/sign.js";

const SECRET = "test-secret";

test("sign/verify roundtrip", () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = signAction(SECRET, "t_123", "approve", exp);
  assert.equal(verifyAction(SECRET, "t_123", "approve", exp, sig), true);
});

test("tampered action fails verification", () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = signAction(SECRET, "t_123", "reject", exp);
  assert.equal(verifyAction(SECRET, "t_123", "approve", exp, sig), false);
  assert.equal(verifyAction(SECRET, "t_999", "reject", exp, sig), false);
});

test("expired link fails verification", () => {
  const exp = Math.floor(Date.now() / 1000) - 10;
  const sig = signAction(SECRET, "t_123", "approve", exp);
  assert.equal(verifyAction(SECRET, "t_123", "approve", exp, sig), false);
});

test("missing pieces fail closed", () => {
  assert.equal(verifyAction("", "t_123", "approve", 123, "sig"), false);
  assert.equal(verifyAction(SECRET, "t_123", "approve", null, "sig"), false);
  assert.equal(verifyAction(SECRET, "t_123", "approve", 99999999999, undefined), false);
});

test("buildActionUrl produces a verifiable link", () => {
  const url = new URL(buildActionUrl("https://example.com", SECRET, "t_1", "approve"));
  assert.equal(url.pathname, "/action");
  assert.equal(
    verifyAction(
      SECRET,
      url.searchParams.get("cid"),
      url.searchParams.get("do"),
      url.searchParams.get("exp"),
      url.searchParams.get("sig")
    ),
    true
  );
});
