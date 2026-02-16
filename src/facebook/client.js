import { config } from "../config.js";

const { graphApiBase, pageAccessToken, pageId } = config.facebook;

/**
 * Make an authenticated request to the Facebook Graph API.
 */
async function graphRequest(endpoint, options = {}) {
  const url = new URL(`${graphApiBase}${endpoint}`);
  url.searchParams.set("access_token", pageAccessToken);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions = { method: options.method || "GET" };

  if (options.body) {
    fetchOptions.method = "POST";
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json();

  if (data.error) {
    throw new Error(
      `Facebook API error: ${data.error.message} (code ${data.error.code})`
    );
  }

  return data;
}

/**
 * Fetch conversations (DM threads) from the page inbox.
 * Returns an array of conversation objects.
 */
export async function getConversations() {
  const data = await graphRequest(`/${pageId}/conversations`, {
    params: { fields: "id,updated_time,participants" },
  });
  return data.data || [];
}

/**
 * Fetch messages within a specific conversation.
 * Returns the most recent messages.
 */
export async function getMessages(conversationId, limit = 10) {
  const data = await graphRequest(`/${conversationId}/messages`, {
    params: {
      fields: "id,message,from,created_time,attachments",
      limit: String(limit),
    },
  });
  return data.data || [];
}

/**
 * Publish a text-only post to the Facebook page.
 */
export async function publishPost(message) {
  return graphRequest(`/${pageId}/feed`, {
    body: { message },
  });
}

/**
 * Publish a photo post to the Facebook page.
 * Uses a URL to the image (no need to download it first).
 */
export async function publishPhotoPost(imageUrl, caption) {
  return graphRequest(`/${pageId}/photos`, {
    body: { url: imageUrl, message: caption || "" },
  });
}

/**
 * Send a DM reply to a user via the Page Send API.
 * Uses the recipient's PSID (Page-Scoped ID).
 */
export async function sendReply(recipientId, message) {
  return graphRequest(`/${pageId}/messages`, {
    body: {
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: "RESPONSE",
    },
  });
}

/**
 * Fetch new DM conversations from the page inbox.
 * Returns whole conversations (with all recent messages) that have been
 * updated since the given timestamp, so the AI can analyse the full thread.
 */
export async function fetchUpdatedConversations(sinceTimestamp) {
  const conversations = await getConversations();
  const updated = [];

  for (const convo of conversations) {
    const updatedTime = new Date(convo.updated_time).getTime();

    // Skip conversations not updated since last check
    if (sinceTimestamp && updatedTime <= sinceTimestamp) {
      continue;
    }

    const messages = await getMessages(convo.id, 10);

    // Build the full thread (oldest first)
    const thread = [];
    for (const msg of messages.reverse()) {
      const isPage = msg.from?.id === pageId;

      // Extract image URLs from attachments
      const images = [];
      if (msg.attachments?.data) {
        for (const att of msg.attachments.data) {
          if (att.image_data?.url) {
            images.push(att.image_data.url);
          } else if (att.type === "image" && att.payload?.url) {
            images.push(att.payload.url);
          }
        }
      }

      thread.push({
        id: msg.id,
        text: msg.message?.trim() || "",
        images,
        isPage,
        senderName: msg.from?.name || "Anonymous",
        senderId: msg.from?.id,
        timestamp: new Date(msg.created_time).getTime(),
      });
    }

    // Only include if there are user messages
    const userMessages = thread.filter((m) => !m.isPage);
    if (userMessages.length === 0) continue;

    updated.push({
      conversationId: convo.id,
      updatedTime,
      senderName: userMessages[0].senderName,
      senderId: userMessages[0].senderId,
      thread,
    });
  }

  return updated;
}
