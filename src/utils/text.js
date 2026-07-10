/**
 * Pure text helpers — no config or client imports so they stay unit-testable.
 */

/**
 * Escape user-controlled text before interpolating into HTML (emails, dashboard).
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Collapse newlines in a DM before it goes into the AI transcript, so a
 * message containing "\n[PAGE] ..." can't forge transcript lines.
 */
export function collapseLine(text) {
  return String(text ?? "").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse spaces.
 */
export function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaccard similarity between the token sets of two strings (0..1).
 */
export function tokenOverlap(a, b) {
  const setA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Compare the AI's transcription of a submission against the original message.
 * "exact"    — same text after normalization; post the ORIGINAL.
 * "subset"   — one contains the other (the AI trimmed greetings etc.); the
 *              AI text is acceptable.
 * "mismatch" — the AI paraphrased or invented; do not post without review.
 */
export function textsMatch(modelText, originalText) {
  const model = normalizeText(modelText);
  const original = normalizeText(originalText);
  if (!model || !original) return "mismatch";
  if (model === original) return "exact";
  if (original.includes(model) || model.includes(original)) return "subset";
  return "mismatch";
}
