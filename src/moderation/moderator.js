import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `You are a content moderator for a local community "Spotted" page on Facebook.

People send in anonymous messages about things they've seen or experienced in the local area. Your job is to decide whether each message is safe and appropriate to post publicly.

APPROVE if the message is:
- A lighthearted, funny, or interesting local sighting
- A community-relevant observation or story
- A compliment or shoutout to someone (e.g. "To the person who helped me at Tesco...")
- Generally harmless and in the spirit of a community page

REJECT if the message contains:
- Hate speech, racism, homophobia, or discrimination
- Threats of violence or harassment
- Personal information (full names with context that could identify/target someone, phone numbers, addresses)
- Spam, advertising, or self-promotion
- Illegal activity or drug references
- Bullying or targeted attacks on specific identifiable people
- Explicit sexual content

FLAG if the message is borderline:
- Could be interpreted different ways
- Mentions someone but isn't clearly malicious
- Uses mild language that might be inappropriate
- You're genuinely unsure

You MUST respond with valid JSON only, no other text:
{
  "decision": "APPROVE" or "REJECT" or "FLAG",
  "reason": "Brief one-sentence explanation of your decision",
  "confidence": 0.0 to 1.0
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

  const text = response.content[0]?.text;

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
