import express from "express";
import crypto from "crypto";
import { config } from "./config.js";
import {
  initDatabase,
  getLoadWarning,
  getRecentConversations,
  getFlaggedMessages,
  getStats,
  getWeeklyStats,
  resetFlaggedForRetry,
  getConversation,
  updateConversationAction,
  isSubmissionPosted,
  getAllPostedSubmissions,
} from "./db/database.js";
import { startPolling, getHealth, getClients, beginShutdown, isBusy } from "./services/poller.js";
import { initEmail, sendAlert } from "./services/notifier.js";
import {
  initPostLog,
  postLogExists,
  logPostEvent,
  readPostLog,
  postLogToCsv,
  getCategoryStats,
} from "./services/postlog.js";
import { postApprovedMessage } from "./facebook/poster.js";
import { verifyAction } from "./utils/sign.js";
import { escapeHtml } from "./utils/text.js";

// Initialise database (use DATA_DIR for persistent volume on Railway)
initDatabase(config.storage.dataDir);

// Initialise the append-only post log; on first run, seed it from the ledger
// so the analysis history doesn't start from zero.
initPostLog(config.storage.dataDir);
if (!postLogExists() || readPostLog().length === 0) {
  const seed = getAllPostedSubmissions();
  for (const post of seed) {
    logPostEvent({ ...post, type: "published", imageCount: null, source: "backfill" });
  }
  if (seed.length > 0) {
    console.log(`[POSTLOG] Seeded post log with ${seed.length} post(s) from the ledger`);
  }
}

// Start the HTTP server FIRST so Railway sees the port open
const app = express();

/**
 * Admin gate for anything that exposes DM content or takes admin actions.
 * These endpoints previously had NO auth — anyone on the internet could read
 * residents' private messages. While ADMIN_KEY is unset they now return 503
 * (fail closed) with a hint, instead of leaking.
 */
function requireAdmin(req, res, next) {
  if (!config.server.adminKey) {
    return res.status(503).json({
      error:
        "Admin endpoints are locked. Set an ADMIN_KEY variable in Railway, then open this URL with ?key=YOUR_KEY",
    });
  }
  const provided = req.get("x-admin-key") || req.query.key || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(config.server.adminKey);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: "Invalid or missing admin key" });
  }
  next();
}

app.get("/", (req, res) => {
  // Deliberately minimal — page ids/names are not for the public internet
  res.json({ status: "running", service: "Spotted Moderator" });
});

// Public health endpoint (no PII) — point Railway's healthcheck or a free
// uptime monitor at this; it returns 503 while any page is down/stale.
app.get("/health", (req, res) => {
  const health = getHealth();
  res.status(health.ok ? 200 : 503).json({
    ok: health.ok,
    paused: health.paused,
    pages: health.pages.map((p) => ({
      name: p.name,
      ok: p.ok,
      lastSuccessAt: p.lastSuccessAt ? new Date(p.lastSuccessAt).toISOString() : null,
      consecutiveFailures: p.consecutiveFailures,
      tokenDead: p.authDead,
    })),
  });
});

app.get("/stats", requireAdmin, (req, res) => {
  res.json(getStats());
});

app.get("/messages", requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || "20", 10);
  res.json(getRecentConversations(limit));
});

app.get("/flagged", requireAdmin, (req, res) => {
  res.json(getFlaggedMessages());
});

// The analysis dataset: every published post with its category. JSON for a
// quick look, CSV for Excel/Sheets when working out ad volume and pricing.
app.get("/postlog", requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || "100", 10);
  res.json(readPostLog().slice(0, limit));
});

app.get("/postlog.csv", requireAdmin, (req, res) => {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="spotted-post-log.csv"');
  res.send(postLogToCsv());
});

app.post("/retry-flagged", requireAdmin, (req, res) => {
  const cleared = resetFlaggedForRetry();
  console.log(`[ADMIN] Reset ${cleared} flagged conversation(s) for retry`);
  res.json({
    cleared,
    message: `${cleared} flagged conversation(s) will be re-processed on the next poll cycle`,
  });
});

/**
 * One-tap approve/reject from the FLAG email. Authenticated by HMAC signature
 * (ACTION_SECRET), time-limited, and one-shot: only rows still in FLAG state
 * can be acted on.
 *
 * GET renders a confirmation button; only POST mutates state. This stops email
 * link-scanners (which prefetch GET URLs) from auto-approving/rejecting posts.
 */
const actionPage = (title, body) =>
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px;"><h2>${title}</h2>${body}</body>`;

// Synchronous in-flight claim (single instance) — prevents a double-click /
// double-request from posting twice before the first await resolves.
const inFlightActions = new Set();

function checkActionAuth(req, res) {
  const { cid, do: action, exp, sig } = req.query;
  if (!config.server.actionSecret) {
    res.status(503).send(actionPage("Not configured", "<p>ACTION_SECRET is not set.</p>"));
    return null;
  }
  if (!["approve", "reject"].includes(action) || !verifyAction(config.server.actionSecret, cid, action, exp, sig)) {
    res.status(403).send(actionPage("Link invalid or expired", "<p>This action link is no longer valid. Use the /admin dashboard instead.</p>"));
    return null;
  }
  const row = getConversation(cid);
  if (!row) {
    res.status(404).send(actionPage("Not found", "<p>This conversation is no longer in the database.</p>"));
    return null;
  }
  if (row.action !== "FLAG") {
    res.status(410).send(actionPage("Already handled", `<p>This item was already resolved (current status: ${escapeHtml(row.action)}).</p>`));
    return null;
  }
  return { cid, action, exp, sig, row };
}

app.get("/action", (req, res) => {
  const ctx = checkActionAuth(req, res);
  if (!ctx) return;
  const { cid, action, exp, sig, row } = ctx;
  const verb = action === "approve" ? "Approve &amp; post" : "Reject";
  const color = action === "approve" ? "#1a7f37" : "#cf222e";
  const params = new URLSearchParams({ cid, do: action, exp, sig });
  res.send(actionPage(
    `Confirm: ${verb}?`,
    `<blockquote style="background:#f6f8fa;padding:10px 14px;border-radius:6px;">${escapeHtml((row.submission_text || "(image only)").slice(0, 300))}</blockquote>
     <p><strong>Page:</strong> ${escapeHtml(row.page_name || "?")}</p>
     <form method="post" action="/action?${params}">
       <button style="background:${color};color:#fff;border:0;border-radius:6px;padding:12px 28px;font-size:16px;cursor:pointer;">${verb}</button>
     </form>`
  ));
});

app.post("/action", async (req, res) => {
  const ctx = checkActionAuth(req, res);
  if (!ctx) return;
  const { cid, action, row } = ctx;

  if (inFlightActions.has(cid)) {
    return res.status(409).send(actionPage("In progress", "<p>This item is already being processed — give it a moment and refresh the dashboard.</p>"));
  }
  // Belt-and-braces against the ledger: never approve something already posted.
  if (action === "approve" && isSubmissionPosted(cid, row.submission_message_id)) {
    return res.status(410).send(actionPage("Already posted", "<p>This submission was already published.</p>"));
  }

  const client = getClients().find((c) => c.pageId === row.page_id);
  inFlightActions.add(cid);
  try {
    if (action === "approve") {
      if (!client) {
        return res.status(500).send(actionPage("Can't approve", "<p>This item predates page tracking — it doesn't record which page it belongs to. Handle it manually on Facebook.</p>"));
      }
      const submission = {
        id: row.submission_message_id || row.conversation_id,
        conversationId: row.conversation_id,
        text: row.submission_text || "",
        images: row.images || [],
        senderName: row.sender_name,
        senderId: row.sender_id,
        pageName: row.page_name,
      };
      const result = await postApprovedMessage(
        submission,
        "Nice one, that's gone up on the page now. Cheers!",
        client
      );
      updateConversationAction(cid, "POST", result.id);
      logPostEvent({
        type: "published",
        postId: result.id,
        pageId: row.page_id,
        pageName: row.page_name,
        conversationId: cid,
        senderId: row.sender_id,
        senderName: row.sender_name,
        category: row.category || "unknown",
        text: row.submission_text || "",
        imageCount: (row.images || []).length,
        source: "manual-approve",
      });
      console.log(`[ADMIN] Approved ${cid} via email link → post ${result.id}`);
      return res.send(actionPage("✅ Posted", `<p>The submission is now live on <strong>${escapeHtml(row.page_name || "the page")}</strong>.</p>`));
    }

    // reject
    if (client && row.sender_id) {
      try {
        await client.sendReply(
          row.sender_id,
          "Sorry, we can't put that one up on the page."
        );
      } catch (err) {
        console.warn(`[ADMIN] Could not DM rejection: ${err.message}`);
      }
    }
    updateConversationAction(cid, "REJECT");
    console.log(`[ADMIN] Rejected ${cid} via email link`);
    return res.send(actionPage("❌ Rejected", "<p>The submission was declined and the sender has been notified.</p>"));
  } catch (err) {
    console.error(`[ADMIN] Action ${action} failed for ${cid}: ${err.message}`);
    return res
      .status(500)
      .send(actionPage("Something went wrong", `<p>${escapeHtml(err.message)}</p><p>The item is still in the flagged queue. If the submission had a photo, the Facebook image link may have expired — handle it manually on Facebook.</p>`));
  } finally {
    inFlightActions.delete(cid);
  }
});

/**
 * Owner dashboard: is it alive, what did it decide, what's waiting on me?
 */
app.get("/admin", requireAdmin, (req, res) => {
  // Don't leak the ?key= admin secret to any off-site resource via Referer.
  res.set("Referrer-Policy", "no-referrer");
  const health = getHealth();
  const flagged = getFlaggedMessages();
  const recent = getRecentConversations(30);
  const weekly = getWeeklyStats();

  // Post types over the last 30 days (from the append-only post log) — the
  // "how many business ads do we actually run?" number for monetisation.
  const categoryCounts = getCategoryStats(30);
  const categoryRows = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [pageName, category] = key.split("|");
      return `<tr><td>${escapeHtml(pageName)}</td><td>${escapeHtml(category)}</td><td>${count}</td></tr>`;
    })
    .join("");
  const key = encodeURIComponent(String(req.query.key || ""));

  const fmtTime = (ts) =>
    ts ? new Date(ts).toLocaleString("en-GB", { timeZone: config.posting.timezone }) : "never";

  const pageCards = health.pages
    .map(
      (p) => `
      <div class="card ${p.ok ? "ok" : "bad"}">
        <h3>${p.ok ? "🟢" : "🔴"} ${escapeHtml(p.name)}</h3>
        <p>Last successful check: ${fmtTime(p.lastSuccessAt)}</p>
        ${p.authDead ? "<p><strong>TOKEN DEAD — needs replacing in Railway</strong></p>" : ""}
        ${p.lastError ? `<p class="err">${escapeHtml(p.lastError)}</p>` : ""}
      </div>`
    )
    .join("");

  const weeklyRows = Object.entries(weekly)
    .map(
      ([name, s]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${s.posts}</td><td>${s.flagged}</td><td>${s.rejected}</td></tr>`
    )
    .join("");

  const flaggedCards = flagged.length
    ? flagged
        .map((row) => {
          const thumbs = (row.images || [])
            .slice(0, 3)
            .map((u) => `<img src="${escapeHtml(u)}" alt="" />`)
            .join("");
          return `
          <div class="card flag">
            <p><strong>${escapeHtml(row.page_name || "Unknown page")}</strong> · ${escapeHtml(row.sender_name || "")} · ${fmtTime(row.processed_at)}</p>
            <blockquote>${escapeHtml(row.submission_text || "(no text)")}</blockquote>
            <div class="thumbs">${thumbs}</div>
            <p class="err">${escapeHtml(row.reason || "")}</p>
          </div>`;
        })
        .join("")
    : "<p>Nothing waiting on you. 🎉</p>";

  const recentRows = recent
    .map(
      (row) => `
      <tr>
        <td>${fmtTime(row.processed_at)}</td>
        <td>${escapeHtml(row.page_name || "?")}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml((row.submission_text || row.reason || "").slice(0, 80))}</td>
      </tr>`
    )
    .join("");

  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Spotted Moderator</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;margin:0 auto;max-width:900px;padding:16px;background:#f6f8fa;color:#1f2328;}
  h1{font-size:1.3rem} h2{font-size:1.05rem;margin-top:28px;}
  .cards{display:flex;gap:12px;flex-wrap:wrap;}
  .card{background:#fff;border:1px solid #d1d9e0;border-radius:8px;padding:12px 16px;flex:1;min-width:240px;}
  .card.ok{border-left:4px solid #1a7f37}.card.bad{border-left:4px solid #cf222e}
  .card.flag{border-left:4px solid #bf8700;flex-basis:100%;}
  .card h3{margin:0 0 6px;font-size:1rem}
  .err{color:#cf222e;font-size:.85rem}
  blockquote{margin:8px 0;padding:8px 12px;background:#f6f8fa;border-radius:6px;white-space:pre-wrap;}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d1d9e0;border-radius:8px;}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #eee;font-size:.85rem;}
  .thumbs img{max-height:90px;border-radius:4px;margin-right:6px;}
  .muted{color:#59636e;font-size:.8rem}
  form{display:inline}
  button{background:#0969da;color:#fff;border:0;border-radius:6px;padding:6px 14px;cursor:pointer}
</style></head><body>
  <h1>Spotted Moderator ${health.paused ? "⏸️ (paused)" : ""}</h1>
  <div class="cards">${pageCards}</div>

  <h2>Waiting on you (${flagged.length})</h2>
  ${flaggedCards}
  <form method="post" action="/retry-flagged?key=${key}"><button>Re-run AI on all flagged</button></form>
  <p class="muted">Approve/Reject buttons arrive in the email for each flagged item.</p>

  <h2>Post types (last 30 days)</h2>
  <table><tr><th>Page</th><th>Type</th><th>Posts</th></tr>${categoryRows || "<tr><td colspan=3>No posts logged yet</td></tr>"}</table>
  <p class="muted"><a href="/postlog.csv?key=${key}">Download the full post log as CSV</a> for analysis.</p>

  <h2>This week</h2>
  <table><tr><th>Page</th><th>Posts</th><th>Flagged</th><th>Rejected</th></tr>${weeklyRows || "<tr><td colspan=4>No activity yet</td></tr>"}</table>

  <h2>Recent decisions</h2>
  <table><tr><th>When</th><th>Page</th><th>Action</th><th>Content</th></tr>${recentRows || "<tr><td colspan=4>None yet</td></tr>"}</table>
  <p class="muted">Auto-refreshes every 60s.</p>
</body></html>`);
});

app.listen(config.server.port, () => {
  console.log(`[SERVER] Status API running on port ${config.server.port}`);

  // Initialise email notifications (non-blocking)
  initEmail();

  // If the DB had to recover from corruption, tell the owner
  const warning = getLoadWarning();
  if (warning) {
    sendAlert("⚠️ Spotted Moderator — database recovered from corruption", `<p>${escapeHtml(warning)}</p>`);
  }

  // Start polling for new messages
  startPolling();

  console.log("[SERVER] All systems ready.");
});

// Crash handlers: log, best-effort alert, exit non-zero so Railway restarts
// cleanly instead of leaving a half-dead process.
async function crash(kind, err) {
  console.error(`[FATAL] ${kind}:`, err);
  try {
    await sendAlert(
      `🚨 Spotted Moderator crashed (${kind})`,
      `<p>The bot hit a fatal error and is restarting.</p><pre>${escapeHtml(err?.stack || String(err))}</pre>`
    );
  } catch {
    /* best effort */
  }
  process.exit(1);
}
process.on("uncaughtException", (err) => crash("uncaughtException", err));
process.on("unhandledRejection", (err) => crash("unhandledRejection", err));

// Graceful shutdown: stop scheduling, drain the in-flight poll cycle (so a
// redeploy landing mid-post can't leave a published-but-unsaved submission that
// re-posts on the next boot), then exit.
let shuttingDownOnce = false;
async function shutdown(signal) {
  if (shuttingDownOnce) return;
  shuttingDownOnce = true;
  console.log(`\n[SHUTDOWN] ${signal} received — draining current poll cycle...`);
  beginShutdown();
  const deadline = Date.now() + 20_000;
  while (isBusy() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`[SHUTDOWN] ${isBusy() ? "drain timed out" : "drained"} — exiting.`);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
