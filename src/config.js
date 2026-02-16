import "dotenv/config";

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  facebook: {
    pageAccessToken: required("FACEBOOK_PAGE_ACCESS_TOKEN"),
    pageId: required("FACEBOOK_PAGE_ID"),
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
