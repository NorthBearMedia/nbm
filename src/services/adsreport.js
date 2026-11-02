import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readPostLog } from "./postlog.js";
import { sendAlert, emailEnabled } from "./notifier.js";
import { escapeHtml } from "../utils/text.js";

/**
 * Paid-ads report: reads the post log the bot already keeps, works out how
 * many business posts each page actually gets, and projects revenue against
 * the proposed tiers. Emailed to the owner weekly (first one shortly after
 * deploy) so the numbers arrive without anyone downloading anything.
 */

export const PRICES = { story: 5, post: 15, pin: 40 };

const SCENARIOS = [
  { name: "Cautious", payRate: 0.3 },
  { name: "Realistic", payRate: 0.5 },
  { name: "Strong", payRate: 0.7 },
];

const WEEK_MS = 7 * 24 * 3600_000;
const WEEKS_PER_MONTH = 52 / 12;
const MAX_PINS_PER_MONTH = 4; // one pinned slot, sold by the week

/**
 * Pure calculation — no I/O, so it's unit-testable.
 */
export function buildAdsReport(records, now = Date.now()) {
  // Only posts the AI actually classified. Backfilled history is "unknown".
  const published = records.filter(
    (r) => r.type === "published" && r.category && r.category !== "unknown"
  );
  if (published.length === 0) {
    return { hasData: false, pages: [], weeks: 0, since: null };
  }

  const firstAt = Math.min(...published.map((r) => r.at || now));
  const weeks = Math.max(1, (now - firstAt) / WEEK_MS);

  const byPage = new Map();
  for (const r of published) {
    const name = r.pageName || "Unknown page";
    if (!byPage.has(name)) byPage.set(name, { page: name, counts: {}, senders: new Map() });
    const p = byPage.get(name);
    p.counts[r.category] = (p.counts[r.category] || 0) + 1;
    if (r.category === "business") {
      const who = r.senderName || "Unknown";
      p.senders.set(who, (p.senders.get(who) || 0) + 1);
    }
  }

  const pages = [...byPage.values()].map((p) => {
    const business = p.counts.business || 0;
    const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
    const businessPerWeek = business / weeks;
    const businessPerMonth = businessPerWeek * WEEKS_PER_MONTH;

    const scenarios = SCENARIOS.map((s) => {
      const paying = businessPerMonth * s.payRate;
      // Roughly 1 in 10 paying businesses upgrades to a pinned week.
      const pins = Math.min(MAX_PINS_PER_MONTH, Math.round(paying / 10));
      const rest = Math.max(0, paying - pins);
      const stories = rest / 2;
      const posts = rest / 2;
      const monthly = stories * PRICES.story + posts * PRICES.post + pins * PRICES.pin;
      return {
        name: s.name,
        payRate: s.payRate,
        stories: Math.round(stories),
        posts: Math.round(posts),
        pins,
        monthly: Math.round(monthly),
        yearly: Math.round(monthly * 12),
      };
    });

    const topBusinesses = [...p.senders.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      page: p.page,
      counts: p.counts,
      total,
      business,
      businessShare: total ? business / total : 0,
      businessPerWeek,
      scenarios,
      topBusinesses,
    };
  });

  return { hasData: true, pages, weeks, since: firstAt };
}

const gbp = (n) => `£${Math.round(n).toLocaleString("en-GB")}`;

export function formatAdsReportHtml(report) {
  if (!report.hasData) {
    return `<h2>💷 Paid ads report</h2>
      <p>No classified posts in the log yet, so there's nothing to project from.
      The next report will have numbers once some posts have gone out.</p>`;
  }

  const since = new Date(report.since).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  const weeks = report.weeks.toFixed(1);

  const sections = report.pages.map((p) => {
    const counts = ["business", "selling", "event", "community"]
      .map((c) => `<tr><td>${c}</td><td>${p.counts[c] || 0}</td></tr>`)
      .join("");
    const scen = p.scenarios
      .map(
        (s) => `<tr><td>${s.name} (${Math.round(s.payRate * 100)}% pay)</td>
          <td>${s.stories}</td><td>${s.posts}</td><td>${s.pins}</td>
          <td><strong>${gbp(s.monthly)}</strong></td><td>${gbp(s.yearly)}</td></tr>`
      )
      .join("");
    const top = p.topBusinesses.length
      ? `<ol>${p.topBusinesses.map((b) => `<li>${escapeHtml(b.name)}: ${b.count} post${b.count === 1 ? "" : "s"}</li>`).join("")}</ol>`
      : "<p><em>No business posts yet.</em></p>";

    return `
      <h3>${escapeHtml(p.page)}</h3>
      <p><strong>${p.business}</strong> business posts out of ${p.total}
        (${Math.round(p.businessShare * 100)}%), about
        <strong>${p.businessPerWeek.toFixed(1)} a week</strong>.</p>
      <table border="1" cellpadding="5" style="border-collapse:collapse;">
        <tr><th>Type</th><th>Posts</th></tr>${counts}
      </table>
      <p><strong>Projected revenue</strong> if businesses had to pay:</p>
      <table border="1" cellpadding="5" style="border-collapse:collapse;">
        <tr><th>Scenario</th><th>Stories</th><th>Posts</th><th>Pins</th><th>Per month</th><th>Per year</th></tr>
        ${scen}
      </table>
      <p><strong>Businesses posting most</strong> (your first people to approach):</p>
      ${top}`;
  });

  const realisticTotal = report.pages.reduce(
    (sum, p) => sum + (p.scenarios.find((s) => s.name === "Realistic")?.monthly || 0),
    0
  );

  return `
    <h2>💷 Paid ads report</h2>
    <p>Based on <strong>${weeks} weeks</strong> of classified posts (since ${since}).
      Realistic estimate across all pages: <strong>${gbp(realisticTotal)} a month</strong>.</p>
    ${sections.join("<hr>")}
    <hr>
    <p style="color:#666;font-size:12px;">
      Assumptions: story ${gbp(PRICES.story)}, post ${gbp(PRICES.post)}, pinned week ${gbp(PRICES.pin)}.
      The scenarios assume 30%, 50% or 70% of businesses currently posting for free would pay once
      it's charged. Paying businesses split evenly between stories and posts, roughly 1 in 10 takes a
      pinned week (max ${MAX_PINS_PER_MONTH} a month). Monthly packages aren't included, so they're
      extra on top. Posts from before categorisation started are excluded.
      Private sellers (the "selling" row) are assumed to stay free.
    </p>`;
}

/**
 * Send the report shortly after boot (if one hasn't gone out in the last
 * week), then check every 6 hours. A marker file on the volume stops
 * restarts from re-sending it.
 */
export function scheduleAdsReport(dataDir) {
  const markerPath = join(dataDir, "ads-report.json");
  const lastSentAt = () => {
    try {
      return JSON.parse(readFileSync(markerPath, "utf-8")).lastSentAt || 0;
    } catch {
      return 0;
    }
  };

  const run = async () => {
    if (!emailEnabled()) return;
    if (Date.now() - lastSentAt() < WEEK_MS - 12 * 3600_000) return;
    const report = buildAdsReport(readPostLog());
    const realistic = report.pages.reduce(
      (sum, p) => sum + (p.scenarios.find((s) => s.name === "Realistic")?.monthly || 0),
      0
    );
    const subject = report.hasData
      ? `💷 Paid ads report: about ${gbp(realistic)}/month on current numbers`
      : "💷 Paid ads report: not enough data yet";
    await sendAlert(subject, formatAdsReportHtml(report));
    writeFileSync(markerPath, JSON.stringify({ lastSentAt: Date.now() }));
    console.log("[ADS] Weekly ads report sent");
  };

  setTimeout(() => run().catch((e) => console.error(`[ADS] Report failed: ${e.message}`)), 60_000);
  setInterval(
    () => run().catch((e) => console.error(`[ADS] Report failed: ${e.message}`)),
    6 * 3600_000
  );
}
