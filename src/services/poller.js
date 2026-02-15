import { config } from "../config.js";
import { processNewMessages } from "./processor.js";

/**
 * Start the polling loop that checks for new DMs on a regular interval.
 */
export function startPolling() {
  const intervalMs = config.polling.intervalSeconds * 1000;
  let lastChecked = Date.now(); // Only process messages from now onwards

  console.log(
    `[POLLER] Starting — checking every ${config.polling.intervalSeconds}s`
  );

  // Run immediately on start, then on interval
  async function poll() {
    try {
      const result = await processNewMessages(lastChecked);
      if (result.latestTimestamp > lastChecked) {
        lastChecked = result.latestTimestamp;
      }
    } catch (err) {
      console.error(`[POLLER] Unexpected error: ${err.message}`);
    }
  }

  // First poll
  poll();

  // Schedule recurring polls
  const timer = setInterval(poll, intervalMs);

  // Return a stop function
  return () => clearInterval(timer);
}
