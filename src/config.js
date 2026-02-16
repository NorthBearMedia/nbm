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
 * Option A – JSON array in FACEBOOK_PAGES:
 *   [{"id":"123","token":"abc","name":"Spotted Derby"}, ...]
 *
 * Option B – legacy single-page env vars (backwards compatible):
 *   FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN
 */
function parseFacebookPages() {
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

  // Fallback: single page from legacy env vars
  return [
    {
      id: required("FACEBOOK_PAGE_ID"),
      token: required("FACEBOOK_PAGE_ACCESS_TOKEN"),
      name: process.env.FACEBOOK_PAGE_NAME || "Spotted",
    },
  ];
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
      process.env.CONFIDENCE_THRESHOLD || "0.85"
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
