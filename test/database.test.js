import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// database.js reads config.js which requires ANTHROPIC_API_KEY + a page.
process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.FACEBOOK_PAGE_ID ||= "page_1";
process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||= "tok_1";

const db = await import("../src/db/database.js");

let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "nbm-db-"));
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function convo(id) {
  return {
    conversationId: id,
    senderName: "Tester",
    senderId: "u1",
    thread: [{ isPage: false }],
  };
}
const mod = (messageId, decision = "APPROVE") => ({
  submissionMessageId: messageId,
  submissionText: `text for ${messageId}`,
  decision,
  reason: "ok",
  confidence: 0.99,
  reply: "done",
  hasImages: false,
  useImagesFromMessageId: null,
});

test("POST → CORRECTION → DELETE keeps the live-post pointer correct", () => {
  db.initDatabase(dir);
  const c = convo("t_flow");

  db.saveConversation(c, mod("m1"), "POST", "P1", { pageId: "page_1" });
  assert.equal(db.getConversationPostId("t_flow"), "P1");
  assert.equal(db.isSubmissionPosted("t_flow", "m1"), true);

  // CORRECTION replaces the live post — pointer must move to P2, not stay P1
  db.saveConversation(c, mod("m2", "CORRECTION"), "CORRECTION", "P2", { pageId: "page_1" });
  assert.equal(db.getConversationPostId("t_flow"), "P2");

  // DELETE clears the pointer — must not resurrect P1/P2 from the ledger
  db.saveConversation(c, mod("m3", "DELETE"), "DELETE", null, { pageId: "page_1" });
  assert.equal(db.getConversationPostId("t_flow"), null);
});

test("a plain re-save (FLAG) does not append phantom ledger entries", () => {
  db.initDatabase(dir);
  const c = convo("t_resave");
  db.saveConversation(c, mod("m1"), "POST", "P1", { pageId: "page_1" });
  // Re-save the same conversation as FLAG with no new post
  db.saveConversation(c, { ...mod("m1"), decision: "FLAG" }, "FLAG", null, { pageId: "page_1" });
  // Still exactly one posted submission on record, pointer intact
  assert.equal(db.getConversationPostId("t_resave"), "P1");
  assert.equal(db.isSubmissionPosted("t_resave", "m1"), true);
});

test("legacy rows (no submissions array) get the ledger backfilled on load", () => {
  const legacyDir = mkdtempSync(join(tmpdir(), "nbm-legacy-"));
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(
    join(legacyDir, "moderation.json"),
    JSON.stringify({
      messages: [],
      conversations: [
        {
          conversation_id: "t_legacy",
          submission_message_id: "old_msg",
          submission_text: "old flyer",
          action: "POST",
          post_id: "OLDPOST",
          processed_at: 1000,
        },
      ],
    })
  );

  db.initDatabase(legacyDir);
  // Double-post guard must recognise the already-posted legacy submission
  assert.equal(db.isSubmissionPosted("t_legacy", "old_msg"), true);
  assert.equal(db.getConversationPostId("t_legacy"), "OLDPOST");
  rmSync(legacyDir, { recursive: true, force: true });
});

test("resetFlaggedForRetry keeps rows visible as FLAG (does not hide them)", () => {
  const retryDir = mkdtempSync(join(tmpdir(), "nbm-retry-"));
  db.initDatabase(retryDir);
  const c = convo("t_retry");
  db.saveConversation(c, { ...mod("m1"), decision: "FLAG" }, "FLAG", null, { pageId: "page_1" });
  const count = db.resetFlaggedForRetry();
  assert.equal(count, 1);
  const flagged = db.getFlaggedMessages();
  assert.ok(flagged.some((r) => r.conversation_id === "t_retry"), "row stays in the flagged queue");
  rmSync(retryDir, { recursive: true, force: true });
});
