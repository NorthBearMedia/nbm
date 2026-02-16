import { Resend } from "resend";
import { config } from "../config.js";

let resend = null;

/**
 * Initialise the Resend email client.
 */
export function initEmail() {
  if (!config.email.resendApiKey) {
    console.log("[EMAIL] Email notifications disabled (no RESEND_API_KEY set).");
    return;
  }

  if (!config.email.notifyTo) {
    console.log("[EMAIL] Email notifications disabled (no NOTIFICATION_EMAIL set).");
    return;
  }

  console.log(`[EMAIL] From: ${config.email.from}`);
  console.log(`[EMAIL] To: ${config.email.notifyTo}`);
  console.log(`[EMAIL] API key: ${config.email.resendApiKey.substring(0, 8)}...`);
  resend = new Resend(config.email.resendApiKey);

  // Send startup notification
  resend.emails.send({
    from: config.email.from,
    to: config.email.notifyTo,
    subject: "Spotted Moderator — Online",
    html: `
      <h2>Spotted Moderator is running</h2>
      <p>The bot has started successfully and email notifications are working.</p>
      <p><strong>Pages:</strong> ${config.facebook.pages.map((p) => `${p.name} (${p.id})`).join(", ")}</p>
      <p><strong>Polling interval:</strong> ${config.polling.intervalSeconds}s</p>
      <p><strong>Confidence threshold:</strong> ${config.moderation.confidenceThreshold}</p>
      <p><em>Started at ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}</em></p>
    `,
  }).then((result) => {
    console.log(`[EMAIL] Startup notification sent. ID: ${result?.data?.id || "unknown"}`);
  }).catch((err) => {
    console.error(`[EMAIL] Startup email failed: ${JSON.stringify(err)}`);
  });
}

/**
 * Send an email notification for a moderation event.
 */
export async function sendNotification(submission, moderation, action) {
  if (!resend) {
    return;
  }

  // Don't email for SKIP (no submission found)
  if (action === "SKIP") {
    return;
  }

  const emoji = action === "POST" ? "\u2705" : action === "REJECT" ? "\u274C" : "\u26A0\uFE0F";
  const preview = submission.text
    ? submission.text.substring(0, 40)
    : "[image]";
  const subject = `${emoji} Spotted: ${action} — "${preview}..."`;

  const imageNote = submission.images?.length > 0
    ? `<p><strong>Images:</strong> ${submission.images.length} attached</p>`
    : "";

  const html = `
    <h2>${emoji} Message ${action}</h2>
    <p><strong>Page:</strong> ${submission.pageName || "Unknown"}</p>
    <p><strong>From:</strong> ${submission.senderName}</p>
    <p><strong>Message:</strong></p>
    <blockquote>${submission.text || "<em>(no text — image only)</em>"}</blockquote>
    ${imageNote}
    <hr>
    <p><strong>Decision:</strong> ${moderation.decision}</p>
    <p><strong>Confidence:</strong> ${(moderation.confidence * 100).toFixed(0)}%</p>
    <p><strong>Reason:</strong> ${moderation.reason}</p>
    ${action === "FLAG" ? "<p><strong>Action needed:</strong> Please review this message manually.</p>" : ""}
  `;

  try {
    await resend.emails.send({
      from: config.email.from,
      to: config.email.notifyTo,
      subject,
      html,
    });
    console.log(`[EMAIL] Notification sent for conversation ${submission.conversationId}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send notification: ${err.message}`);
  }
}
