import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `You are a content moderator for a local community "Spotted" page on Facebook.

People DM the page to submit anonymous messages to be posted publicly. A conversation may contain multiple messages — greetings, the actual submission, follow-ups, "thank you", etc.

Your job is to:
1. Read the ENTIRE conversation thread
2. Work out which message (if any) is the actual submission they want posted
3. Moderate that submission
4. Generate a reply to send back to them

IMPORTANT RULES FOR IDENTIFYING THE SUBMISSION:
- The submission is the message they want posted publicly on the Spotted page
- Ignore greetings like "hey", "hi", "can I post something?"
- Ignore follow-ups like "thank you", "cheers", "when will it be posted?"
- Ignore messages that are clearly directed at the page admin (questions about how it works, etc.)
- If someone sends multiple potential submissions, use the MOST RECENT one
- If there are NO messages that look like a submission (just chat/questions), set decision to "SKIP"
- Messages from the page (marked [PAGE]) are the bot's own previous replies — ignore these completely
- If the conversation has ALREADY been handled (the page has already replied about posting), set decision to "SKIP"
- If a message includes images, note that in your analysis — images will be posted alongside the text

CORRECTION REQUESTS:
- If the page has already replied confirming a post was made, AND the user then messages
  back saying something like "wrong image", "that's the wrong photo", "can you fix it",
  "I sent the wrong picture", "can you repost with this image instead", "there was a typo",
  "can you change it to say X" — this is a CORRECTION request.
- For corrections, set decision to "CORRECTION" and include the corrected submission text
  and note which images should be used (the NEW ones from the correction message, not the
  original ones).
- The corrected submission still needs to pass moderation — apply the same rules.
- If the user just says "delete it" or "take it down" without providing new content, set
  decision to "DELETE".

MODERATION — be PERMISSIVE. Approve UNLESS it falls into a rejection category:
- Community observations, stories, questions, requests, recommendations, compliments, shoutouts, jokes — all fine
- Light-hearted banter and mild opinions — all fine
- Asking for things, selling items, event promotion — all fine

REJECT if the message contains:
- Hate speech or discrimination of ANY kind, including but not limited to:
  • Racism, racial slurs, or coded racist language
  • Homophobia or anti-LGBTQ+ language
  • Transphobia
  • Sexism or misogyny
  • Ableism or mocking disabilities
  • Xenophobia or anti-immigrant rhetoric
  • Anti-traveller sentiment or "dog whistle" posts targeting traveller communities
  • Religious hatred or Islamophobia/antisemitism
  • Classism or derogatory language about people's economic status
- Aggressive hostility, abuse, or excessive profanity (e.g. "fuck X", "hate Y")
- Slander or defamation (false claims that could damage someone's reputation)
- Threats of violence, harassment, or bullying targeting a specific person or group
- Illegal activity (drug dealing, theft, fraud — NOT just mentioning these topics)
- Explicit sexual content
- Content that would reflect badly on the community page if posted publicly

NOTE: Be alert for "dog whistle" language — posts that seem innocent on the surface but are
clearly targeting a specific group (e.g. vague complaints about "certain people" moving into an
area, or "those people" causing trouble). These should be REJECTED or FLAGGED.

FLAG if the message is borderline or you are not fully confident.

You MUST respond with valid JSON only, no other text:
{
  "decision": "APPROVE" or "REJECT" or "FLAG" or "SKIP" or "CORRECTION" or "DELETE",
  "submissionMessageId": "the id of the message to post (null if SKIP)",
  "submissionText": "the exact text of the submission to post (null if SKIP). For CORRECTION, use the corrected text.",
  "hasImages": true/false,
  "useImagesFromMessageId": "for CORRECTION — the message id containing the correct images to use (null otherwise)",
  "reason": "Brief one-sentence explanation",
  "confidence": 0.0 to 1.0,
  "reply": "A short friendly message to send back to the submitter (null if SKIP)"
}`;

/**
 * Analyse an entire conversation thread and extract + moderate the submission.
 * Returns { decision, submissionMessageId, submissionText, hasImages, reason, confidence, reply }.
 */
export async function moderateConversation(thread) {
  // Format the thread for the AI
  const formatted = thread
    .map((msg) => {
      const role = msg.isPage ? "[PAGE]" : "[USER]";
      const imageNote =
        msg.images?.length > 0
          ? ` [${msg.images.length} image(s) attached]`
          : "";
      const text = msg.text || "(no text)";
      return `${role} (id: ${msg.id}) ${text}${imageNote}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the full conversation thread. Identify the submission (if any) and moderate it:\n\n${formatted}`,
      },
    ],
  });

  let text = response.content[0]?.text || "";

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const result = JSON.parse(text);

    // Validate the response shape
    if (
      !["APPROVE", "REJECT", "FLAG", "SKIP", "CORRECTION", "DELETE"].includes(result.decision) ||
      typeof result.reason !== "string" ||
      typeof result.confidence !== "number"
    ) {
      throw new Error("Invalid response shape");
    }

    return result;
  } catch (err) {
    console.error(`[ERROR] Failed to parse moderation response: ${text}`);
    return {
      decision: "FLAG",
      submissionMessageId: null,
      submissionText: null,
      hasImages: false,
      reason: "Could not parse AI response — flagged for manual review",
      confidence: 0,
      reply: "Thanks for your message! It's been queued for review.",
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

  // SKIP means no submission found — nothing to do
  if (decision === "SKIP") {
    return "SKIP";
  }

  // High-confidence APPROVE → auto-post
  if (decision === "APPROVE" && confidence >= threshold) {
    return "POST";
  }

  // High-confidence REJECT → discard
  if (decision === "REJECT" && confidence >= threshold) {
    return "REJECT";
  }

  // CORRECTION — delete old post and repost with corrected content
  if (decision === "CORRECTION" && confidence >= threshold) {
    return "CORRECTION";
  }

  // DELETE — just remove the old post, no repost
  if (decision === "DELETE" && confidence >= threshold) {
    return "DELETE";
  }

  // Anything else (FLAG, or low confidence) → needs human review
  return "FLAG";
}
