import crypto from "crypto";

/**
 * HMAC signing for one-tap approve/reject links in FLAG emails.
 * The signature covers conversation id + action + expiry, so a link can't be
 * altered to act on a different conversation or a different action.
 */

export function signAction(secret, conversationId, action, exp) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${conversationId}|${action}|${exp}`)
    .digest("hex");
}

export function verifyAction(secret, conversationId, action, exp, sig) {
  if (!secret || !conversationId || !action || !exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() / 1000 > expNum) return false;
  const expected = signAction(secret, conversationId, action, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildActionUrl(baseUrl, secret, conversationId, action, days = 7) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sig = signAction(secret, conversationId, action, exp);
  const params = new URLSearchParams({
    cid: conversationId,
    do: action,
    exp: String(exp),
    sig,
  });
  return `${baseUrl.replace(/\/$/, "")}/action?${params}`;
}
