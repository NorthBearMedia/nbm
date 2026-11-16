import { config } from "../config.js";

/**
 * Exchange a Business Manager system user token for each page's own token.
 *
 * Tokens made from a personal login die whenever that login is disturbed
 * (password change, logged-out sessions, security checks). A system user token
 * belongs to the business and can be set to never expire, and page tokens
 * fetched with it don't expire either. So the owner pastes one token into
 * Railway and the bot does the exchange itself on every boot.
 *
 * Mutates config.facebook.pages[i].token in place. Must run before the page
 * clients are created. A page that fails keeps any FACEBOOK_PAGE_ACCESS_TOKEN
 * it already had, so this can never make things worse.
 */
export async function resolvePageTokens() {
  const systemToken = config.facebook.systemUserToken;
  if (!systemToken) return [];

  const results = [];
  for (const page of config.facebook.pages) {
    try {
      const url = new URL(`${config.facebook.graphApiBase}/${page.id}`);
      url.searchParams.set("fields", "access_token,name");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${systemToken}` },
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      if (data.error || !data.access_token) {
        throw new Error(
          data.error?.message ||
            "no page token returned (is this page assigned to the system user?)"
        );
      }
      page.token = data.access_token;
      results.push({ name: page.name, ok: true });
      console.log(`[TOKENS] Got page token for ${page.name} from the system user token`);
    } catch (err) {
      results.push({ name: page.name, ok: false, error: err.message });
      console.error(
        `[TOKENS] Could not get page token for ${page.name}: ${err.message}` +
          (page.token ? " (keeping the existing page token)" : "")
      );
    }
  }
  return results;
}
