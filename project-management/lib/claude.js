// lib/claude.js — the one place the app talks to the Claude API.
//
// Used by The Bear (routes/ai.js), the intake robot (lib/intake.js) and the
// client report writer (lib/report.js), so they share retries, the model
// choice and the human-readable error messages.

import Anthropic from '@anthropic-ai/sdk';

// Newest model by default; CLAUDE_MODEL overrides it. If the API rejects the
// primary model (unknown id, or a parameter it doesn't support), every later
// call in this process uses the long-proven fallback instead — so a model
// rename can never take The Bear or the robot down.
const PRIMARY_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const FALLBACK_MODEL = 'claude-opus-4-6';
let activeModel = PRIMARY_MODEL;

let client = null;
export function getClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function currentModel() { return activeModel; }

function modelRejected(err) {
  const status = err?.status;
  const msg = String(err?.message || '');
  if (status === 404) return true;
  return status === 400 && /model|thinking|not supported|unsupported/i.test(msg);
}

// The API throws transient 529 'Overloaded' errors at busy times. The SDK's
// built-in retries are quick and short; this adds patient spaced retries so a
// busy minute doesn't surface as a failure. `params.model` is filled in here.
export async function callClaude(c, params) {
  const delays = [1500, 4000, 8000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await c.messages.create({ ...params, model: activeModel });
    } catch (err) {
      if (activeModel !== FALLBACK_MODEL && modelRejected(err)) {
        console.warn(`[AI] ${activeModel} rejected (${err?.status}: ${String(err?.message || '').slice(0, 140)}) — falling back to ${FALLBACK_MODEL}`);
        activeModel = FALLBACK_MODEL;
        attempt = -1;
        continue;
      }
      const status = err?.status;
      const retriable = status === 429 || (status >= 500 && status <= 599);
      if (!retriable || attempt >= delays.length) throw err;
      console.warn(`[AI] ${status} from API — retry ${attempt + 1}/${delays.length} in ${delays[attempt]}ms`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
}

// When an error genuinely persists, the user gets a sentence, never a raw blob.
export function friendlyAIError(err) {
  const status = err?.status;
  if (status === 529 || /overloaded/i.test(err?.message || '')) {
    return 'The Bear’s brain (the Claude API) is overloaded right now — nothing wrong on your end. Give it a minute and ask again.';
  }
  if (status === 429) return 'The Bear is being rate-limited — wait a minute and try again.';
  if (status === 401) return 'The Bear’s API key isn’t working — check ANTHROPIC_API_KEY on Railway.';
  if (status >= 500) return 'The Claude API had a hiccup — try again in a moment.';
  return 'The Bear couldn’t answer that one — try again, or rephrase.';
}
