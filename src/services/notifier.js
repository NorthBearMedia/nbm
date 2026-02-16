import nodemailer from "nodemailer";
import { config } from "../config.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.email.user,
    pass: config.email.appPassword,
  },
});

/**
 * Send an email notification for a moderation event.
 */
export async function sendNotification(submission, moderation, action) {
  if (!config.email.enabled) return;

  const emoji = action === "POST" ? "✅" : action === "REJECT" ? "❌" : "⚠️";
  const subject = `${emoji} Spotted: ${action} — "${submission.text.substring(0, 40)}..."`;

  const html = `
    <h2>${emoji} Message ${action}</h2>
    <p><strong>From:</strong> ${submission.senderName}</p>
    <p><strong>Message:</strong></p>
    <blockquote>${submission.text}</blockquote>
    <hr>
    <p><strong>Decision:</strong> ${moderation.decision}</p>
    <p><strong>Confidence:</strong> ${(moderation.confidence * 100).toFixed(0)}%</p>
    <p><strong>Reason:</strong> ${moderation.reason}</p>
  `;

  try {
    await transporter.sendMail({
      from: config.email.user,
      to: config.email.notifyTo,
      subject,
      html,
    });
    console.log(`[EMAIL] Notification sent for message ${submission.id}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send notification: ${err.message}`);
  }
}
