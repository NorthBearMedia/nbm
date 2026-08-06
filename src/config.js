import "dotenv/config";

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/**
 * Parse Facebook page configs.
 *
 * Option A – JSON array in FACEBOOK_PAGES env var
 * Option B – Numbered env vars (auto-detected):
 *   FACEBOOK_PAGE_ID   + FACEBOOK_PAGE_ACCESS_TOKEN   + FACEBOOK_PAGE_NAME
 *   FACEBOOK_PAGE_ID_2 + FACEBOOK_PAGE_ACCESS_TOKEN_2 + FACEBOOK_PAGE_NAME_2
 *   FACEBOOK_PAGE_ID_3 + ...
 *
 * Each page may set FACEBOOK_PAGE_TEMPLATE (or _2, _3...) to style its posts.
 * The template must contain "{text}" — e.g. "📢 Spotted Submission\n\n{text}".
 * Default is "{text}" (no change to the post body).
 */
function parseFacebookPages() {
  // Railway env vars can't hold real newlines — a typed "\n" arrives as two
  // literal characters. Convert so multi-line post templates work.
  const cleanTemplate = (t) => (t ? t.replaceAll("\\n", "\n") : t);
  const defaultTemplate = cleanTemplate(process.env.POST_TEMPLATE) || "{text}";

  // Option A: JSON array
  if (process.env.FACEBOOK_PAGES) {
    try {
      const pages = JSON.parse(process.env.FACEBOOK_PAGES);
      if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error("FACEBOOK_PAGES must be a non-empty JSON array");
      }
      for (const p of pages) {
        if (!p.id || !p.token) {
          throw new Error(
            'Each entry in FACEBOOK_PAGES must have "id" and "token" fields'
          );
        }
        p.name = p.name || `Page ${p.id}`;
        p.template = cleanTemplate(p.template) || defaultTemplate;
      }
      return pages;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`FACEBOOK_PAGES is not valid JSON: ${err.message}`);
      }
      throw err;
    }
  }

  // Option B: numbered env vars
  const pages = [];

  // First page (no suffix)
  if (process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    pages.push({
      id: process.env.FACEBOOK_PAGE_ID,
      token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      name: process.env.FACEBOOK_PAGE_NAME || "Spotted",
      template: cleanTemplate(process.env.FACEBOOK_PAGE_TEMPLATE) || defaultTemplate,
    });
  }

  // Additional pages (_2, _3, _4, ...)
  for (let i = 2; i <= 10; i++) {
    const id = process.env[`FACEBOOK_PAGE_ID_${i}`];
    const token = process.env[`FACEBOOK_PAGE_ACCESS_TOKEN_${i}`];
    if (id && token) {
      pages.push({
        id,
        token,
        name: process.env[`FACEBOOK_PAGE_NAME_${i}`] || `Spotted ${i}`,
        template: cleanTemplate(process.env[`FACEBOOK_PAGE_TEMPLATE_${i}`]) || defaultTemplate,
      });
    }
  }

  if (pages.length === 0) {
    throw new Error(
      "No Facebook pages configured. Set FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN, or FACEBOOK_PAGES JSON."
    );
  }

  return pages;
}

/**
 * Parse POSTING_HOURS like "7-22" → { start: 7, end: 22 }.
 * Unset or invalid → null (post immediately at any hour — current behaviour).
 */
function parsePostingHours(raw) {
  if (!raw) return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw.trim());
  if (!match) {
    console.warn(`[CONFIG] POSTING_HOURS "${raw}" is invalid (expected e.g. "7-22") — ignoring`);
    return null;
  }
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  if (start >= end || start < 0 || end > 24) {
    console.warn(`[CONFIG] POSTING_HOURS "${raw}" is invalid — ignoring`);
    return null;
  }
  return { start, end };
}

export const config = {
  facebook: {
    pages: parseFacebookPages(),
    graphApiBase: "https://graph.facebook.com/v21.0",
    // Mark each handled conversation as "Seen" in the Page inbox (there is no
    // API for the "Done" folder). Set MARK_SEEN=false to disable.
    markSeen: process.env.MARK_SEEN !== "false",
  },
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    // Public base URL of this service (e.g. https://nbm-production.up.railway.app).
    // Needed for the approve/reject links in FLAG emails.
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
    // Secret key required to read /stats, /messages, /flagged, /admin.
    // While unset, those endpoints return 503 instead of exposing DM content.
    adminKey: process.env.ADMIN_KEY || "",
    // Secret for signing one-tap approve/reject links in FLAG emails.
    // While unset, emails simply have no action buttons.
    actionSecret: process.env.ACTION_SECRET || "",
  },
  polling: {
    intervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10),
    paused: process.env.PAUSED === "true",
  },
  moderation: {
    confidenceThreshold: parseFloat(
      process.env.CONFIDENCE_THRESHOLD || "0.7"
    ),
  },
  posting: {
    // e.g. "7-22" → posts only go live between 07:00 and 22:00 (timezone below);
    // overnight submissions are scheduled for the next window open.
    hours: parsePostingHours(process.env.POSTING_HOURS),
    timezone: process.env.POSTING_TIMEZONE || "Europe/London",
  },
  storage: {
    dataDir: process.env.DATA_DIR || "./data",
  },
  logging: {
    debug: process.env.LOG_DEBUG === "true",
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    notifyTo: process.env.NOTIFICATION_EMAIL || "",
    from: process.env.EMAIL_FROM || "Spotted Moderator <onboarding@resend.dev>",
  },
};
