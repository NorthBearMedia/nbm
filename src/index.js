import express from "express";
import { config } from "./config.js";
import { initDatabase, getRecentMessages, getFlaggedMessages, getStats } from "./db/database.js";
import { startPolling } from "./services/poller.js";

// Initialise database
initDatabase();

// Start the polling service
const stopPolling = startPolling();

// Simple status API
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

app.listen(config.server.port, () => {
  console.log(`[SERVER] Status API running on http://localhost:${config.server.port}`);
  console.log(`[SERVER] Endpoints:`);
  console.log(`  GET /         — Service status`);
  console.log(`  GET /stats    — Moderation stats`);
  console.log(`  GET /messages — Recent messages`);
  console.log(`  GET /flagged  — Messages needing review`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Stopping...");
  stopPolling();
  process.exit(0);
});
