/**
 * Pure conversation-skip logic, extracted so the safety rules that prevent
 * reprocessing old messages are unit-testable.
 *
 * Rules:
 * 1. ALWAYS skip anything last updated before the persisted watermark
 *    (hard cutoff — never touch old stuff, even if the DB is wiped).
 * 2. Never seen before and updated after the watermark → process it.
 * 3. Already processed but updated_time moved past what we stored → process
 *    it (follow-up message). Rows reset for retry store updated_at = 0, so
 *    they re-enter here too.
 * 4. Already processed and unchanged → skip.
 */
export function shouldSkipConversation({ updatedTime, watermark, storedUpdatedAt }) {
  if (updatedTime < watermark) return true;
  if (!storedUpdatedAt) return false;
  return updatedTime <= storedUpdatedAt;
}
