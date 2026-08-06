import { config } from "../config.js";

const { graphApiBase } = config.facebook;

const REQUEST_TIMEOUT_MS = 30_000;
// Codes worth retrying on a READ: 1/2 (unknown/service) + 4/17/32/613 (throttling).
const TRANSIENT_FB_CODES = new Set([1, 2, 4, 17, 32, 613]);
// Codes a WRITE may retry on: ONLY explicit throttle rejections. Codes 1 and 2
// are ambiguous ("unknown"/"temporarily unavailable") — the write may already
// have landed, so retrying them could publish a duplicate post or DM.
const WRITE_RETRYABLE_FB_CODES = new Set([4, 17, 32, 613]);

export class FacebookError extends Error {
  constructor(message, { code = null, type = null, subcode = null, status = null } = {}) {
    super(message);
    this.name = "FacebookError";
    this.code = code;
    this.type = type;
    this.subcode = subcode;
    this.status = status;
  }

  /** Dead/expired token — the "bot silently down for days" failure. */
  get isAuthError() {
    return this.code === 190 || this.type === "OAuthException";
  }

  get isTransient() {
    if (this.isAuthError) return false;
    if (this.code !== null && TRANSIENT_FB_CODES.has(this.code)) return true;
    return this.status !== null && this.status >= 500;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create a Facebook API client bound to a specific page.
 * Returns an object with all API methods for that page.
 *
 * @param {{ id: string, token: string, name: string, template?: string }} page
 */
export function createPageClient(page) {
  const { id: pageId, token: pageAccessToken } = page;

  /**
   * Make an authenticated request to the Facebook Graph API.
   * - Token travels in the Authorization header, not the URL (keeps it out of logs).
   * - 30s timeout so one hung request can't stall the whole poll cycle.
   * - Transient failures (network, 5xx, FB throttling codes) retry twice with
   *   backoff. Auth errors surface immediately so token death is loud.
   */
  async function graphRequest(endpoint, options = {}) {
    const url = new URL(`${graphApiBase}${endpoint}`);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const fetchOptions = {
      method: options.method || "GET",
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    };

    if (options.body) {
      fetchOptions.method = "POST";
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    const maxAttempts = 3;
    // Writes (posts, replies, deletes) must NOT retry on ambiguous failures
    // (timeout/5xx — the request may have landed, and a retry would double-post).
    // They may only retry when Facebook explicitly REJECTED them with a
    // throttle code. Reads can retry on anything transient.
    const isWrite = (options.method || (options.body ? "POST" : "GET")) !== "GET";
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        const raw = await response.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          // A CDN 502 page etc. — not JSON. Treat as transient by status.
          throw new FacebookError(
            `Facebook returned non-JSON response (HTTP ${response.status})`,
            { status: response.status || 500 }
          );
        }

        if (data.error) {
          throw new FacebookError(
            `Facebook API error: ${data.error.message} (code ${data.error.code})`,
            {
              code: data.error.code ?? null,
              type: data.error.type ?? null,
              subcode: data.error.error_subcode ?? null,
              status: response.status,
            }
          );
        }

        return data;
      } catch (err) {
        // Normalize network-level failures (timeout, DNS, reset) as transient
        const fbErr =
          err instanceof FacebookError
            ? err
            : new FacebookError(`Facebook request failed: ${err.message}`, { status: 599 });

        lastError = fbErr;
        const writeRetryable = fbErr.code !== null && WRITE_RETRYABLE_FB_CODES.has(fbErr.code);
        const canRetry = fbErr.isTransient && (!isWrite || writeRetryable);
        if (!canRetry || attempt === maxAttempts) {
          throw fbErr;
        }
        const backoff = attempt * 2000 - 1000; // 1s, 3s
        console.warn(
          `[FB] [${page.name}] Transient error (attempt ${attempt}/${maxAttempts}), retrying in ${backoff}ms: ${fbErr.message}`
        );
        await sleep(backoff);
      }
    }

    throw lastError;
  }

  /**
   * Verify the page token actually works. Used at boot so the startup email
   * is a real health report, not unconditional good news.
   */
  async function verifyToken() {
    try {
      const data = await graphRequest(`/${pageId}`, { params: { fields: "name" } });
      return { ok: true, name: data.name };
    } catch (err) {
      return { ok: false, error: err.message, isAuthError: err.isAuthError === true };
    }
  }

  /**
   * Fetch the most recent conversations (DM threads) from the page inbox.
   * Only fetches a single page of results — we only care about recent activity.
   */
  async function getConversations() {
    const data = await graphRequest(`/${pageId}/conversations`, {
      params: { fields: "id,updated_time,participants", limit: "25" },
    });
    return data.data || [];
  }

  /**
   * Fetch messages within a specific conversation. 25 rather than the old 10 —
   * a chatty thread was pushing the actual submission out of the AI's view.
   */
  async function getMessages(conversationId, limit = 25) {
    const data = await graphRequest(`/${conversationId}/messages`, {
      params: {
        fields: "id,message,from,created_time,attachments",
        limit: String(limit),
      },
    });
    return data.data || [];
  }

  /**
   * Publish a post to the page feed — the single publish path for text-only,
   * single-photo, and multi-photo posts, optionally scheduled.
   *
   * Photos are uploaded unpublished and attached to one feed post, which also
   * fixes an old bug: POST /photos returns a PHOTO id, not a feed-post id, so
   * corrections/deletions of photo posts were targeting the wrong object.
   *
   * @param {{ message: string, imageUrls?: string[], scheduledAt?: Date|null }} opts
   * @returns {{ id: string }} the feed post id
   */
  async function publishFeedPost({ message, imageUrls = [], scheduledAt = null }) {
    const body = { message };

    if (imageUrls.length > 0) {
      const mediaIds = [];
      for (const imageUrl of imageUrls) {
        const photo = await graphRequest(`/${pageId}/photos`, {
          body: { url: imageUrl, published: false },
        });
        mediaIds.push(photo.id);
      }
      body.attached_media = mediaIds.map((id) => ({ media_fbid: id }));
    }

    if (scheduledAt) {
      body.published = false;
      body.scheduled_publish_time = Math.floor(scheduledAt.getTime() / 1000);
    }

    return graphRequest(`/${pageId}/feed`, { body });
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
   * Mark the conversation with a user as read ("Seen") in the Page inbox.
   * Facebook has no public API for the inbox "Done" folder (a UI-only action),
   * so this is the closest equivalent — it clears the unread state so the owner
   * can see at a glance which conversations the bot has already handled.
   */
  async function markSeen(recipientId) {
    return graphRequest(`/${pageId}/messages`, {
      body: {
        recipient: { id: recipientId },
        sender_action: "mark_seen",
      },
    });
  }

  /**
   * Fetch DM conversations from the page inbox with their recent messages.
   * @param {(id: string, updatedTime: number) => boolean} [shouldSkip] —
   *   optional callback; return true to skip fetching messages for a conversation.
   */
  async function fetchConversations(shouldSkip) {
    const conversations = await getConversations();
    const result = [];

    if (config.logging.debug) {
      console.log(
        `[DEBUG] [${page.name}] Facebook returned ${conversations.length} conversation(s)`
      );
    }

    for (const convo of conversations) {
      const updatedTime = new Date(convo.updated_time).getTime();

      if (shouldSkip && shouldSkip(convo.id, updatedTime)) {
        continue;
      }

      const messages = await getMessages(convo.id);

      const thread = [];
      for (const msg of messages.reverse()) {
        const isPage = msg.from?.id === pageId;

        const images = [];
        if (msg.attachments?.data) {
          for (const att of msg.attachments.data) {
            // Allow-list real photos only. Explicit image/photo types pass; an
            // untyped attachment is only treated as an image if it carries
            // image_data. This keeps stickers, shares, reels and GIFs (which
            // arrive untyped with just a payload URL) from posing as photos.
            const isImage =
              att.type === "image" ||
              att.type === "photo" ||
              (!att.type && !!att.image_data);
            if (!isImage) {
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
    template: page.template || "{text}",
    verifyToken,
    getConversations,
    getMessages,
    publishFeedPost,
    deletePost,
    sendReply,
    markSeen,
    fetchConversations,
  };
}
