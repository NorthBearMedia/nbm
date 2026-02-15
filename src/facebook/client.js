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
      fields: "id,message,from,created_time",
      limit: String(limit),
    },
  });
  return data.data || [];
}

/**
 * Publish a post to the Facebook page.
 */
export async function publishPost(message) {
  return graphRequest(`/${pageId}/feed`, {
    body: { message },
  });
}

/**
 * Send a reply within a conversation (to notify the sender).
 */
export async function sendReply(conversationId, message) {
  return graphRequest(`/${conversationId}/messages`, {
    body: { message },
  });
}

/**
 * Fetch new DMs from the page inbox.
 * Filters to only messages sent by users (not by the page itself),
 * and only messages newer than the given timestamp.
 */
export async function fetchNewSubmissions(sinceTimestamp) {
  const conversations = await getConversations();
  const newMessages = [];

  for (const convo of conversations) {
    const updatedTime = new Date(convo.updated_time).getTime();

    // Skip conversations not updated since last check
    if (sinceTimestamp && updatedTime <= sinceTimestamp) {
      continue;
    }

    const messages = await getMessages(convo.id, 5);

    for (const msg of messages) {
      // Skip messages from the page itself
      if (msg.from?.id === pageId) continue;

      const msgTime = new Date(msg.created_time).getTime();

      // Skip messages older than our last check
      if (sinceTimestamp && msgTime <= sinceTimestamp) continue;

      // Skip empty messages
      if (!msg.message?.trim()) continue;

      newMessages.push({
        id: msg.id,
        conversationId: convo.id,
        text: msg.message.trim(),
        senderName: msg.from?.name || "Anonymous",
        senderId: msg.from?.id,
        timestamp: msgTime,
      });
    }
  }

  return newMessages;
}
