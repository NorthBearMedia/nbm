import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter = null;

/**
 * Initialise and verify the email transporter.
 * Call once at startup — logs clearly whether email will work.
 */
export async function initEmail() {
  if (!config.email.enabled) {
    console.log("[EMAIL] Email notifications disabled (no GMAIL_USER set).");
    return;
  }

  console.log(`[EMAIL] Setting up with user: ${config.email.user}`);
  console.log(`[EMAIL] Notifications will be sent to: ${config.email.notifyTo}`);

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.email.user,
      pass: config.email.appPassword,
    },
  });

  // Verify the connection works
  try {
    await transporter.verify();
    console.log("[EMAIL] Gmail connection verified — email is working!");

    // Send a startup test email
    await transporter.sendMail({
      from: config.email.user,
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
    });
    console.log("[EMAIL] Startup notification sent.");
  } catch (err) {
    console.error(`[EMAIL] Connection FAILED: ${err.message}`);
    console.error(
      "[EMAIL] Check GMAIL_USER and GMAIL_APP_PASSWORD are correct."
    );
    console.error(
      "[EMAIL] Make sure you're using a Gmail App Password, not your normal password."
    );
    transporter = null;
  }
}

/**
 * Send an email notification for a moderation event.
 */
export async function sendNotification(submission, moderation, action) {
  if (!transporter) {
    console.log("[EMAIL] Skipping notification — email not configured or failed to connect.");
    return;
  }

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
    ${action === "FLAG" ? "<p><strong>Action needed:</strong> Please review this message manually.</p>" : ""}
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
