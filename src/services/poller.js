import { config } from "../config.js";
import { createPageClient } from "../facebook/client.js";
import { processNewMessages } from "./processor.js";
import { sendAlert, sendStartupReport } from "./notifier.js";

const clients = [];

// Per-page health, keyed by pageId:
// { name, lastSuccessAt, consecutiveFailures, lastError, authDead, alerted }
const health = new Map();

let started = false;
let isPolling = false;
let shuttingDown = false;
let cycleCount = 0;
let lastHeartbeatAt = Date.now();

export function getClients() {
  return clients;
}

/** True while a poll cycle is mid-flight (used to drain before shutdown). */
export function isBusy() {
  return isPolling;
}

/** Stop scheduling new cycles (called on SIGTERM/SIGINT before draining). */
export function beginShutdown() {
  shuttingDown = true;
}

export function getHealth() {
  const intervalMs = config.polling.intervalSeconds * 1000;
  const staleAfterMs = intervalMs * 3 + 120_000;
  const now = Date.now();

  const pages = clients.map((client) => {
    const h = health.get(client.pageId) || {};
    const stale = h.lastSuccessAt ? now - h.lastSuccessAt > staleAfterMs : !h.starting;
    return {
      pageId: client.pageId,
      name: client.pageName,
      ok: !h.authDead && !stale && (h.consecutiveFailures || 0) < 5,
      lastSuccessAt: h.lastSuccessAt || null,
      consecutiveFailures: h.consecutiveFailures || 0,
      lastError: h.lastError || null,
      authDead: Boolean(h.authDead),
    };
  });

  return { ok: pages.every((p) => p.ok), paused: config.polling.paused, pages };
}

function recordSuccess(client) {
  const h = health.get(client.pageId);
  h.lastSuccessAt = Date.now();
  h.lastError = null;
  h.starting = false;
  if (h.alerted) {
    // The page was down and has recovered — close the loop for the owner
    sendAlert(
      `✅ ${client.pageName} has recovered`,
      `<p><strong>${client.pageName}</strong> is polling Facebook successfully again after ${h.consecutiveFailures} failed cycle(s).</p>`
    );
    console.log(`[HEALTH] ${client.pageName} recovered after ${h.consecutiveFailures} failures`);
  }
  h.consecutiveFailures = 0;
  h.authDead = false;
  h.alerted = false;
}

function recordFailure(client, err) {
  const h = health.get(client.pageId);
  h.consecutiveFailures = (h.consecutiveFailures || 0) + 1;
  h.lastError = err.message;
  h.starting = false;

  const isAuth = err.isAuthError === true;
  if (isAuth) h.authDead = true;

  // Alert once per outage: immediately for a dead token (the failure mode
  // that took the bot down for days), after 5 consecutive failures otherwise.
  if (!h.alerted && (isAuth || h.consecutiveFailures >= 5)) {
    h.alerted = true;
    const subject = isAuth
      ? `🚨 ${client.pageName}: Facebook token is DEAD — bot is down`
      : `🚨 ${client.pageName}: bot failing to reach Facebook`;
    const fix = isAuth
      ? "<p><strong>Fix:</strong> generate a new page token (Graph API Explorer → exchange for long-lived token → /me/accounts) and update the token variable in Railway.</p>"
      : "<p>This may be a temporary Facebook outage. You'll get a recovery email when it heals; if this persists for hours, check the Railway logs.</p>";
    sendAlert(
      subject,
      `<p><strong>${client.pageName}</strong> has failed ${h.consecutiveFailures} poll cycle(s) in a row.</p>
       <p><strong>Last error:</strong> ${err.message}</p>${fix}`
    );
    console.error(`[HEALTH] ALERT sent for ${client.pageName}: ${err.message}`);
  }
}

/**
 * Start the polling loop that checks for new DMs on all configured pages.
 */
export function startPolling() {
  if (started) return () => {};
  started = true;

  const intervalMs = config.polling.intervalSeconds * 1000;

  for (const page of config.facebook.pages) {
    const client = createPageClient(page);
    clients.push(client);
    health.set(client.pageId, {
      name: client.pageName,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      lastError: null,
      authDead: false,
      alerted: false,
      starting: true,
    });
  }

  console.log(
    `[POLLER] Starting — checking ${clients.length} page(s) every ${config.polling.intervalSeconds}s`
  );
  for (const client of clients) {
    console.log(`[POLLER]   • ${client.pageName} (${client.pageId})`);
  }

  // Verify every token at boot so the startup email is a real health report —
  // not unconditional good news while a page is actually dead.
  (async () => {
    const results = [];
    for (const client of clients) {
      const check = await client.verifyToken();
      results.push({ name: client.pageName, ...check });
      const h = health.get(client.pageId);
      if (check.ok) {
        console.log(`[POLLER] Token OK for ${client.pageName}`);
      } else {
        console.error(`[POLLER] Token check FAILED for ${client.pageName}: ${check.error}`);
        if (check.isAuthError) {
          h.authDead = true;
          h.lastError = check.error;
        }
      }
    }
    await sendStartupReport(results);
  })().catch((err) => console.error(`[POLLER] Startup check failed: ${err.message}`));

  async function poll() {
    if (config.polling.paused || shuttingDown) {
      return;
    }
    // Re-entrancy guard: if a cycle overruns the interval (hung request,
    // big backlog), never start a second cycle on top of it — overlapping
    // cycles could re-moderate a not-yet-saved conversation and double-post.
    if (isPolling) {
      console.warn("[POLLER] Previous cycle still running — skipping this tick");
      return;
    }

    isPolling = true;
    try {
      for (const client of clients) {
        try {
          const result = await processNewMessages(client);
          if (result?.error) {
            recordFailure(client, result.error);
          } else {
            recordSuccess(client);
          }
        } catch (err) {
          console.error(`[POLLER] Unexpected error on ${client.pageName}: ${err.message}`);
          recordFailure(client, err);
        }
      }
    } finally {
      isPolling = false;
    }

    cycleCount++;

    // Hourly heartbeat instead of a log line every cycle
    if (Date.now() - lastHeartbeatAt >= 3600_000) {
      lastHeartbeatAt = Date.now();
      const summary = clients
        .map((c) => {
          const h = health.get(c.pageId);
          return `${c.pageName}: ${h.lastError ? `ERROR (${h.lastError})` : "ok"}`;
        })
        .join(" | ");
      console.log(`[POLLER] Heartbeat — ${cycleCount} cycles. ${summary}`);
    }
  }

  // First poll
  poll();

  // Schedule recurring polls
  const timer = setInterval(poll, intervalMs);

  return () => clearInterval(timer);
}
