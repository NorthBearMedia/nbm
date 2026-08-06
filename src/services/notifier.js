import { Resend } from "resend";
import { config } from "../config.js";
import { escapeHtml } from "../utils/text.js";
import { buildActionUrl } from "../utils/sign.js";

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
  resend = new Resend(config.email.resendApiKey);
}

async function send(subject, html) {
  if (!resend) return;
  try {
    const result = await resend.emails.send({
      from: config.email.from,
      to: config.email.notifyTo,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent: "${subject}" (${result?.data?.id || "unknown"})`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send "${subject}": ${err.message}`);
  }
}

/**
 * Operational alert (token death, repeated failures, recovery, crash).
 */
export async function sendAlert(subject, html) {
  await send(subject, html);
}

/**
 * Startup health report — sent after every boot with the REAL result of
 * checking each page token, not unconditional good news.
 */
export async function sendStartupReport(pageResults) {
  const allOk = pageResults.every((p) => p.ok);
  const subject = allOk
    ? "Spotted Moderator — Online, all pages healthy"
    : "🚨 Spotted Moderator — Online but a page token is FAILING";

  const rows = pageResults
    .map(
      (p) =>
        `<li><strong>${escapeHtml(p.name)}</strong>: ${
          p.ok ? "✅ token OK" : `❌ ${escapeHtml(p.error || "unknown error")}`
        }</li>`
    )
    .join("");

  await send(
    subject,
    `
    <h2>Spotted Moderator has started</h2>
    <ul>${rows}</ul>
    <p><strong>Polling interval:</strong> ${config.polling.intervalSeconds}s</p>
    <p><strong>Confidence threshold:</strong> ${config.moderation.confidenceThreshold}</p>
    ${
      config.posting.hours
        ? `<p><strong>Posting hours:</strong> ${config.posting.hours.start}:00–${config.posting.hours.end}:00 (${escapeHtml(config.posting.timezone)})</p>`
        : ""
    }
    <p><em>Started at ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}</em></p>
  `
  );
}

/**
 * Email a page-buying enquiry to the owners.
 * These are private business enquiries (someone answering the "we buy dormant
 * Spotted pages" post). They are never published, and the bot does not reply
 * to the sender, so the owners can open the conversation themselves.
 */
export async function sendEnquiryNotification(enquiry, moderation) {
  if (!resend) {
    console.warn(
      `[EMAIL] Page enquiry from ${enquiry.senderName} could NOT be emailed (email not configured) — check the Facebook inbox.`
    );
    return;
  }

  const preview = (enquiry.latestText || "").substring(0, 60);
  const subject = `💼 PAGE ENQUIRY: ${enquiry.senderName} — "${preview}..."`;

  // Include the whole conversation so far — context matters for a negotiation
  const transcript = (enquiry.thread || [])
    .map(
      (m) =>
        `<p style="margin:4px 0;"><strong>${escapeHtml(enquiry.senderName)}:</strong> ${
          escapeHtml(m.text) || "<em>(no text)</em>"
        }</p>`
    )
    .join("");

  await send(
    subject,
    `
    <h2>💼 Someone wants to talk about their page</h2>
    <p>This looks like a reply to the "we're interested in buying dormant Spotted pages" post.
       <strong>It has NOT been posted publicly</strong>, and the bot has not replied, so you can
       message them yourself.</p>
    <hr>
    <p><strong>From:</strong> ${escapeHtml(enquiry.senderName)}</p>
    <p><strong>Came in via:</strong> ${escapeHtml(enquiry.pageName || "Unknown page")}</p>
    <p><strong>What they said:</strong></p>
    <blockquote style="background:#f6f8fa;padding:10px 14px;border-left:3px solid #3eaf84;">
      ${transcript || escapeHtml(enquiry.latestText)}
    </blockquote>
    <p><strong>Reply to them here:</strong>
      <a href="https://business.facebook.com/latest/inbox/all">Open the Facebook inbox</a>
    </p>
    <hr>
    <p style="color:#666;font-size:12px;">AI reason: ${escapeHtml(moderation.reason)}
      (confidence ${(moderation.confidence * 100).toFixed(0)}%)</p>
  `
  );
}

const KIND_LABELS = {
  "ai-flagged": "The AI flagged this content for review",
  "posting-failed": "Posting to Facebook FAILED — the submission is stuck",
  "image-binding-failed": "The AI expected an image but none could be attached",
  "text-mismatch": "The AI's transcription didn't match the original message",
  "possible-duplicate": "Possible duplicate of an existing post",
};

/**
 * Send an email notification for a moderation event.
 * opts.kind distinguishes "AI flagged content" from "posting failed" etc.
 */
export async function sendNotification(submission, moderation, action, opts = {}) {
  if (!resend) return;

  // Don't email for SKIP (no submission found)
  if (action === "SKIP") return;

  const emoji = action === "POST" ? "✅" : action === "REJECT" ? "❌" : "⚠️";
  const preview = submission.text ? submission.text.substring(0, 40) : "[image]";
  const kindLabel = opts.kind ? KIND_LABELS[opts.kind] || opts.kind : null;
  const subject = `${emoji} Spotted: ${action}${opts.kind === "posting-failed" ? " (POSTING FAILED)" : ""} — "${preview}..."`;

  const imageNote =
    submission.images?.length > 0
      ? `<p><strong>Images:</strong> ${submission.images.length} attached</p>` +
        submission.images
          .slice(0, 4)
          .map(
            (url) =>
              `<img src="${escapeHtml(url)}" alt="submission image" style="max-width:280px;max-height:280px;margin:4px;border-radius:4px;" />`
          )
          .join("")
      : "";

  // One-tap approve/reject buttons for flagged items (needs ACTION_SECRET +
  // PUBLIC_URL configured). Approve same-day — Facebook image links expire.
  let actions = "";
  if (
    action === "FLAG" &&
    config.server.actionSecret &&
    config.server.publicUrl &&
    submission.conversationId
  ) {
    const approveUrl = buildActionUrl(
      config.server.publicUrl,
      config.server.actionSecret,
      submission.conversationId,
      "approve"
    );
    const rejectUrl = buildActionUrl(
      config.server.publicUrl,
      config.server.actionSecret,
      submission.conversationId,
      "reject"
    );
    actions = `
      <p style="margin:16px 0;">
        <a href="${approveUrl}" style="background:#1a7f37;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:12px;">✅ Approve &amp; post</a>
        <a href="${rejectUrl}" style="background:#cf222e;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">❌ Reject</a>
      </p>
      <p style="color:#666;font-size:12px;">Links work for 7 days and act once. If the submission has a photo, approve promptly — Facebook image links expire after a while.</p>`;
  }

  const html = `
    <h2>${emoji} Message ${escapeHtml(action)}</h2>
    ${kindLabel ? `<p><strong>${escapeHtml(kindLabel)}</strong></p>` : ""}
    <p><strong>Page:</strong> ${escapeHtml(submission.pageName || "Unknown")}</p>
    <p><strong>From:</strong> ${escapeHtml(submission.senderName)}</p>
    <p><strong>Message:</strong></p>
    <blockquote>${escapeHtml(submission.text) || "<em>(no text — image only)</em>"}</blockquote>
    ${imageNote}
    <hr>
    <p><strong>Decision:</strong> ${escapeHtml(moderation.decision)}</p>
    <p><strong>Confidence:</strong> ${(moderation.confidence * 100).toFixed(0)}%</p>
    <p><strong>Reason:</strong> ${escapeHtml(moderation.reason)}</p>
    ${action === "FLAG" ? "<p><strong>Action needed:</strong> Please review this message.</p>" : ""}
    ${actions}
  `;

  await send(subject, html);
}
