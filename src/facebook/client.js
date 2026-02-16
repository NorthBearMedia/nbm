import { config } from "../config.js";

const { graphApiBase } = config.facebook;

/**
 * Create a Facebook API client bound to a specific page.
 * Returns an object with all API methods for that page.
 *
 * @param {{ id: string, token: string, name: string }} page
 */
export function createPageClient(page) {
  const { id: pageId, token: pageAccessToken } = page;

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
   * Follows pagination to get all conversations (up to a reasonable limit).
   */
  async function getConversations() {
    const allConversations = [];
    const url = `/${pageId}/conversations`;
    let params = { fields: "id,updated_time,participants", limit: "25" };
    const maxPages = 5;

    for (let pg = 0; pg < maxPages; pg++) {
      const data = await graphRequest(url, { params });
      const items = data.data || [];
      allConversations.push(...items);

      if (data.paging?.cursors?.after) {
        params = {
          fields: "id,updated_time,participants",
          limit: "25",
          after: data.paging.cursors.after,
        };
      } else {
        break;
      }
    }

    return allConversations;
  }

  /**
   * Fetch messages within a specific conversation.
   */
  async function getMessages(conversationId, limit = 10) {
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
  async function publishPost(message) {
    return graphRequest(`/${pageId}/feed`, {
      body: { message },
    });
  }

  /**
   * Publish a photo post to the Facebook page.
   */
  async function publishPhotoPost(imageUrl, caption) {
    return graphRequest(`/${pageId}/photos`, {
      body: { url: imageUrl, message: caption || "" },
    });
  }

  /**
   * Delete a post from the Facebook page by its post ID.
   */
  async function deletePost(postId) {
    return graphRequest(`/${postId}`, { method: "DELETE" });
  }

  /**
   * Send a DM reply to a user via the Page Send API.
   */
  async function sendReply(recipientId, message) {
    return graphRequest(`/${pageId}/messages`, {
      body: {
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: "RESPONSE",
      },
    });
  }

  /**
   * Fetch DM conversations from the page inbox with their recent messages.
   */
  async function fetchConversations() {
    const conversations = await getConversations();
    const result = [];

    console.log(
      `[DEBUG] [${page.name}] Facebook returned ${conversations.length} conversation(s)`
    );

    for (const convo of conversations) {
      const updatedTime = new Date(convo.updated_time).getTime();

      const messages = await getMessages(convo.id, 10);

      const thread = [];
      for (const msg of messages.reverse()) {
        const isPage = msg.from?.id === pageId;

        const images = [];
        if (msg.attachments?.data) {
          for (const att of msg.attachments.data) {
            if (att.type && att.type !== "image" && att.type !== "photo") {
              continue;
            }

            const imgUrl = att.image_data?.url || att.payload?.url;
            if (!imgUrl) continue;

            if (
              imgUrl.includes("/p50x50/") ||
              imgUrl.includes("/p75x75/") ||
              imgUrl.includes("/p100x100/") ||
              imgUrl.includes("profilepic") ||
              imgUrl.includes("platform/profilepic")
            ) {
              continue;
            }

            const w = att.image_data?.width || 0;
            const h = att.image_data?.height || 0;
            if (w > 0 && h > 0 && (w < 200 || h < 200)) {
              continue;
            }

            images.push(imgUrl);
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

      const userMessages = thread.filter((m) => !m.isPage);
      if (userMessages.length === 0) continue;

      result.push({
        conversationId: convo.id,
        updatedTime,
        senderName: userMessages[0].senderName,
        senderId: userMessages[0].senderId,
        thread,
      });
    }

    return result;
  }

  return {
    pageId,
    pageName: page.name,
    getConversations,
    getMessages,
    publishPost,
    publishPhotoPost,
    deletePost,
    sendReply,
    fetchConversations,
  };
}
