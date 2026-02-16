import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `You are a content moderator for a local community "Spotted" page on Facebook.

People send in anonymous messages to be posted publicly. Your job is to check messages are not harmful. Be PERMISSIVE — most messages should be approved.

APPROVE the message UNLESS it falls into one of the rejection categories below. When in doubt, FLAG for review.
- Community observations, stories, questions, requests, recommendations, compliments, shoutouts, jokes — all fine
- Light-hearted banter and mild opinions — all fine
- Asking for things, selling items, event promotion — all fine

REJECT if the message contains:
- Hate speech, racism, homophobia, or discrimination against any group
- Aggressive hostility, abuse, or excessive profanity (e.g. "fuck X", "hate Y")
- Slander or defamation (false claims that could damage someone's reputation)
- Threats of violence, harassment, or bullying targeting a specific person or group
- Illegal activity (drug dealing, theft, fraud — NOT just mentioning these topics)
- Explicit sexual content
- Content that would reflect badly on the community page if posted publicly

FLAG if the message is borderline or you are not fully confident in your decision.

Also generate a short, friendly reply to send back to the person who submitted the message. If approved, thank them. If rejected, briefly explain why without being preachy.

You MUST respond with valid JSON only, no other text:
{
  "decision": "APPROVE" or "REJECT" or "FLAG",
  "reason": "Brief one-sentence explanation of your decision",
  "confidence": 0.0 to 1.0,
  "reply": "A short friendly message to send back to the submitter"
}`;

/**
 * Moderate a single message using Claude.
 * Returns { decision, reason, confidence }.
 */
export async function moderateMessage(messageText) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Please moderate this submitted message:\n\n"${messageText}"`,
      },
    ],
  });

  let text = response.content[0]?.text || "";

  // Strip markdown code fences if present (```json ... ```)
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const result = JSON.parse(text);

    // Validate the response shape
    if (
      !["APPROVE", "REJECT", "FLAG"].includes(result.decision) ||
      typeof result.reason !== "string" ||
      typeof result.confidence !== "number"
    ) {
      throw new Error("Invalid response shape");
    }

    return result;
  } catch (err) {
    console.error(`[ERROR] Failed to parse moderation response: ${text}`);
    // Default to FLAG when parsing fails — safer to require human review
    return {
      decision: "FLAG",
      reason: "Could not parse AI response — flagged for manual review",
      confidence: 0,
    };
  }
}

/**
 * Determine the final action based on the moderation result
 * and the confidence threshold.
 */
export function resolveAction(moderationResult) {
  const { decision, confidence } = moderationResult;
  const threshold = config.moderation.confidenceThreshold;

  // High-confidence APPROVE → auto-post
  if (decision === "APPROVE" && confidence >= threshold) {
    return "POST";
  }

  // High-confidence REJECT → discard
  if (decision === "REJECT" && confidence >= threshold) {
    return "REJECT";
  }

  // Anything else (FLAG, or low confidence) → needs human review
  return "FLAG";
}
