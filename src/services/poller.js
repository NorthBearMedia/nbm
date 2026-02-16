import { config } from "../config.js";
import { createPageClient } from "../facebook/client.js";
import { processNewMessages } from "./processor.js";

/**
 * Start the polling loop that checks for new DMs on all configured pages.
 */
export function startPolling() {
  const intervalMs = config.polling.intervalSeconds * 1000;
  const pages = config.facebook.pages;

  // Create a client for each page
  const clients = pages.map((page) => createPageClient(page));

  console.log(
    `[POLLER] Starting — checking ${clients.length} page(s) every ${config.polling.intervalSeconds}s`
  );
  for (const client of clients) {
    console.log(`[POLLER]   • ${client.pageName} (${client.pageId})`);
  }

  async function poll() {
    if (config.polling.paused) {
      console.log("[POLLER] Paused — set PAUSED=false to resume.");
      return;
    }

    for (const client of clients) {
      try {
        await processNewMessages(client);
      } catch (err) {
        console.error(
          `[POLLER] Unexpected error on ${client.pageName}: ${err.message}`
        );
      }
    }
  }

  // First poll
  poll();

  // Schedule recurring polls
  const timer = setInterval(poll, intervalMs);

  return () => clearInterval(timer);
}
