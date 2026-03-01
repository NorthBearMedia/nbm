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
 */
function parseFacebookPages() {
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

export const config = {
  facebook: {
    pages: parseFacebookPages(),
    graphApiBase: "https://graph.facebook.com/v21.0",
  },
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
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
  storage: {
    dataDir: process.env.DATA_DIR || "./data",
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    notifyTo: process.env.NOTIFICATION_EMAIL || "",
    from: process.env.EMAIL_FROM || "Spotted Moderator <onboarding@resend.dev>",
  },
};
