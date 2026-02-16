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

  console.log(`[EMAIL] Notifications will be sent to: ${config.email.notifyTo}`);
  resend = new Resend(config.email.resendApiKey);

  // Send startup notification
  resend.emails.send({
    from: "Spotted Moderator <onboarding@resend.dev>",
    to: config.email.notifyTo,
    subject: "Spotted Moderator — Online",
    html: `
      <h2>Spotted Moderator is running</h2>
      <p>The bot has started successfully and email notifications are working.</p>
      <p><strong>Page ID:</strong> ${config.facebook.pageId}</p>
      <p><strong>Polling interval:</strong> ${config.polling.intervalSeconds}s</p>
      <p><strong>Confidence threshold:</strong> ${config.moderation.confidenceThreshold}</p>
      <p><em>Started at ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}</em></p>
    `,
  }).then(() => {
    console.log("[EMAIL] Startup notification sent.");
  }).catch((err) => {
    console.error(`[EMAIL] Startup email failed: ${err.message}`);
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
      from: "Spotted Moderator <onboarding@resend.dev>",
      to: config.email.notifyTo,
      subject,
      html,
    });
    console.log(`[EMAIL] Notification sent for conversation ${submission.conversationId}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send notification: ${err.message}`);
  }
}
