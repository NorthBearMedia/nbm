import { test } from "node:test";
import assert from "node:assert/strict";
// adsreport → notifier → config.js, which requires these at import time.
process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.FACEBOOK_PAGE_ID ||= "page_1";
process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||= "tok_1";
const { buildAdsReport, formatAdsReportHtml } = await import("../src/services/adsreport.js");

const WEEK = 7 * 24 * 3600_000;
const now = Date.UTC(2026, 10, 2);

function post(category, daysAgo, senderName = "Someone", pageName = "Derby") {
  return { type: "published", category, senderName, pageName, at: now - daysAgo * 24 * 3600_000 };
}

test("no classified posts → hasData false (backfilled unknowns ignored)", () => {
  const r = buildAdsReport([{ type: "published", category: "unknown", at: now }], now);
  assert.equal(r.hasData, false);
  assert.match(formatAdsReportHtml(r), /nothing to project/);
});

test("counts business posts per week and ranks top business posters", () => {
  const records = [
    post("business", 14, "Joe's Chippy"),
    post("business", 10, "Joe's Chippy"),
    post("business", 3, "Bloom Florist"),
    post("community", 12),
    post("selling", 5),
    post("business", 1, "Joe's Chippy"),
  ];
  const r = buildAdsReport(records, now);
  const derby = r.pages[0];
  assert.equal(derby.business, 4);
  assert.equal(derby.total, 6);
  assert.equal(Math.round(r.weeks), 2);
  assert.ok(Math.abs(derby.businessPerWeek - 2) < 0.01);
  assert.deepEqual(derby.topBusinesses[0], { name: "Joe's Chippy", count: 3 });
});

test("revenue scenarios increase with pay rate and pins cap at 4/month", () => {
  const many = Array.from({ length: 400 }, (_, i) => post("business", i % 28, `Biz ${i}`));
  const r = buildAdsReport(many, now);
  const [cautious, realistic, strong] = r.pages[0].scenarios;
  assert.ok(cautious.monthly < realistic.monthly && realistic.monthly < strong.monthly);
  assert.ok(strong.pins <= 4);
});

test("report HTML escapes business names", () => {
  const r = buildAdsReport([post("business", 1, "<script>x</script>")], now);
  const html = formatAdsReportHtml(r);
  assert.ok(!html.includes("<script>x"));
});

test("pages are reported separately", () => {
  const r = buildAdsReport([post("business", 2, "A", "Derby"), post("business", 2, "B", "Wirksworth")], now);
  assert.equal(r.pages.length, 2);
});
