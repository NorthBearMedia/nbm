import express from "express";
import { config } from "./config.js";
import { initDatabase, getRecentMessages, getFlaggedMessages, getStats } from "./db/database.js";
import { startPolling } from "./services/poller.js";
import { initEmail } from "./services/notifier.js";

// Initialise database
initDatabase();

// Start the HTTP server FIRST so Railway sees the port open
const app = express();

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Spotted Moderator",
    pageId: config.facebook.pageId,
    pollingInterval: `${config.polling.intervalSeconds}s`,
  });
});

app.get("/stats", (req, res) => {
  res.json(getStats());
});

app.get("/messages", (req, res) => {
  const limit = parseInt(req.query.limit || "20", 10);
  res.json(getRecentMessages(limit));
});

app.get("/flagged", (req, res) => {
  res.json(getFlaggedMessages());
});

app.listen(config.server.port, async () => {
  console.log(`[SERVER] Status API running on port ${config.server.port}`);

  // Now that the server is up, initialise email (can take a few seconds)
  await initEmail();

  // Start polling for new messages
  startPolling();

  console.log("[SERVER] All systems ready.");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Stopping...");
  process.exit(0);
});
