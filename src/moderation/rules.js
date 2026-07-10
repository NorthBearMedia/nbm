/**
 * Pure moderation rules — no API client or config imports so the safety
 * logic is unit-testable without credentials.
 */

const DECISIONS = ["APPROVE", "REJECT", "FLAG", "SKIP", "ASK", "CORRECTION", "DELETE"];

/**
 * Validate and repair a moderation result against the actual thread.
 * - A post-type decision whose submissionMessageId isn't a real message in
 *   the thread is downgraded to FLAG (hallucinated or scrolled out of view).
 * - A useImagesFromMessageId that isn't in the thread is dropped so the image
 *   binding falls back to the submission message's own attachments only.
 * Returns the (possibly modified) result, or null if the shape is invalid.
 */
export function validateModerationResult(result, threadIds) {
  if (
    !result ||
    !DECISIONS.includes(result.decision) ||
    typeof result.reason !== "string" ||
    typeof result.confidence !== "number"
  ) {
    return null;
  }

  const postActions = ["APPROVE", "REJECT", "CORRECTION", "DELETE"];
  if (postActions.includes(result.decision)) {
    if (!result.submissionMessageId || !threadIds.has(result.submissionMessageId)) {
      console.warn(
        `[MODERATION] submissionMessageId ${result.submissionMessageId} not found in thread — downgrading ${result.decision} to FLAG`
      );
      result.decision = "FLAG";
      result.reason =
        "Submission message could not be located in the thread — flagged for manual review.";
    }
  }

  if (result.useImagesFromMessageId && !threadIds.has(result.useImagesFromMessageId)) {
    console.warn(
      `[MODERATION] useImagesFromMessageId ${result.useImagesFromMessageId} not in thread — ignoring`
    );
    result.useImagesFromMessageId = null;
  }

  return result;
}

/**
 * Determine the final action from a moderation result and confidence threshold.
 */
export function resolveAction(moderationResult, threshold) {
  const { decision, confidence } = moderationResult;

  if (decision === "SKIP") return "SKIP";
  if (decision === "ASK") return "ASK";
  if (decision === "APPROVE" && confidence >= threshold) return "POST";
  if (decision === "REJECT" && confidence >= threshold) return "REJECT";
  if (decision === "CORRECTION" && confidence >= threshold) return "CORRECTION";
  if (decision === "DELETE" && confidence >= threshold) return "DELETE";

  // Anything else (FLAG, or low confidence) → needs human review
  return "FLAG";
}
