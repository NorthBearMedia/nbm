import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter = null;

/**
 * Initialise the email transporter.
 * Does NOT block startup — sends a test email in the background.
 */
export function initEmail() {
  if (!config.email.enabled) {
    console.log("[EMAIL] Email notifications disabled (no GMAIL_USER set).");
    return;
  }

  console.log(`[EMAIL] Setting up with user: ${config.email.user}`);
  console.log(`[EMAIL] Notifications will be sent to: ${config.email.notifyTo}`);

  // Use port 465 with SSL (more likely to work on Railway than port 587)
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    auth: {
      user: config.email.user,
      pass: config.email.appPassword,
    },
  });

  // Test connection in background — don't block startup
  transporter.verify().then(() => {
    console.log("[EMAIL] Gmail connection verified — email is working!");
    // Send startup notification
    transporter.sendMail({
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
    }).then(() => {
      console.log("[EMAIL] Startup notification sent.");
    }).catch((err) => {
      console.error(`[EMAIL] Startup email failed: ${err.message}`);
    });
  }).catch((err) => {
    console.error(`[EMAIL] Connection FAILED: ${err.message}`);
    console.error("[EMAIL] Check GMAIL_USER and GMAIL_APP_PASSWORD are correct.");
    transporter = null;
  });
}

/**
 * Send an email notification for a moderation event.
 */
export async function sendNotification(submission, moderation, action) {
  if (!transporter) {
    console.log("[EMAIL] Skipping notification — email not configured.");
    return;
  }

  const emoji = action === "POST" ? "\u2705" : action === "REJECT" ? "\u274C" : "\u26A0\uFE0F";
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
