import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.FACEBOOK_SYSTEM_USER_TOKEN = "SYS";
process.env.FACEBOOK_PAGE_ID = "p1";
process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "OLD1";
process.env.FACEBOOK_PAGE_ID_2 = "p2"; // no per-page token: allowed with a system token

const { config } = await import("../src/config.js");
const { resolvePageTokens } = await import("../src/facebook/tokens.js");

test("a page without its own token is accepted when a system token is set", () => {
  assert.deepEqual(config.facebook.pages.map((p) => p.id), ["p1", "p2"]);
});

test("page tokens are swapped in; a failure keeps the existing token", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(opts.headers.Authorization, "Bearer SYS");
    const id = new URL(url).pathname.split("/").pop();
    const body = id === "p2"
      ? { access_token: "NEW2", name: "Wirksworth" }
      : { error: { message: "page not assigned", code: 200 } };
    return { json: async () => body };
  };
  try {
    const results = await resolvePageTokens();
    const [p1, p2] = config.facebook.pages;
    assert.equal(p1.token, "OLD1"); // failure: kept the old one
    assert.equal(p2.token, "NEW2");
    assert.equal(results[0].ok, false);
    assert.equal(results[1].ok, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});
