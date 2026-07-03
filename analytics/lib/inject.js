// Installs the Google Analytics (and Microsoft Clarity) tag on a Hostinger
// site with no human involvement.
//
// How: the sites live on standard Hostinger hosting (real public_html
// directories), and Hostinger's API can create cron jobs that run shell
// commands on that server. We create a one-shot cron job whose command
// injects the tag before </head> in every .html file — idempotent (marked
// so re-runs are no-ops), backing up each file to *.nbmbak first — read its
// captured output, then delete the cron job. Finally we fetch the live page
// to confirm the tag is really being served and the page still renders.
//
// This edits live website files, so callers should test on a demo site and
// verify before rolling out to client sites.
import { getHostingerToken } from './runtime-config.js';

const HB = 'https://developers.hostinger.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every North Bear site lives under this Hostinger account; public_html
// paths follow a fixed shape (confirmed by the website inventory).
export const HOSTINGER_USER = 'u275789987';
export const rootDirFor = domain => `/home/${HOSTINGER_USER}/domains/${domain}/public_html`;

async function hg(path, method = 'GET', body) {
  const token = getHostingerToken();
  if (!token) throw new Error('no Hostinger token in settings');
  const res = await fetch(HB + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Hostinger ${method} ${path} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.status === 204 ? {} : res.json();
}

// The tag, as a single line (keeps the server-side awk replace simple).
export function buildSnippet(measurementId, clarityId) {
  let s = '<!-- NBM-GA-TAG -->';
  if (measurementId) {
    s += `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');</script>`;
  }
  if (clarityId) {
    s += `<script type="text/javascript">(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");</script>`;
  }
  return s;
}

// The full idempotent, backup-first injector as a POSIX-sh script. Served
// by Pulse at a URL and fetched by the cron job (Hostinger caps a cron
// *command* at 255 chars, so the real work lives in this script). Snippet
// is base64-encoded so no quoting/escaping can break the shell or the HTML;
// a pipe-into-while loop avoids for/do keyword-adjacency pitfalls; awk
// replaces only the first </head> (& and \ never appear in our snippet).
// Idempotent via the NBM-GA-TAG marker; each edited file backed up to
// *.nbmbak first.
export function buildInjectorScript(rootDir, snippet) {
  const b64 = Buffer.from(snippet, 'utf8').toString('base64');
  const awkProg = 'BEGIN{d=0}{if(!d&&index($0,"</head>")>0){sub(/<\\/head>/,s"</head>");d=1}print}';
  return (
    `D='${rootDir}'\n` +
    // Diagnostic lines land in the captured cron output: distinguish
    // "no docroot" (builder-hosted site, nothing to edit) and "no .html
    // files" from a genuine injection pass.
    `if [ ! -d "$D" ]; then echo "NBM-NO-DOCROOT $D"; exit 0; fi\n` +
    `echo "NBM-HTML-COUNT $(find "$D" -type f -name '*.html' 2>/dev/null | wc -l)"\n` +
    `S=$(printf %s '${b64}' | base64 -d)\n` +
    `find "$D" -type f -name '*.html' 2>/dev/null | while read f; do\n` +
    `  if grep -q '</head>' "$f" && ! grep -q 'NBM-GA-TAG' "$f"; then\n` +
    `    cp "$f" "$f.nbmbak"\n` +
    `    awk -v s="$S" '${awkProg}' "$f" > "$f.nbmtmp" && mv "$f.nbmtmp" "$f" && echo "injected $f"\n` +
    `  fi\n` +
    `done\n` +
    `echo "NBM-INJECT-COMPLETE"\n`
  );
}

// Where the fetched injector script is staged on the host — the account's
// home directory (always writable), never inside public_html.
export const stagePathFor = domain => `/home/${HOSTINGER_USER}/nbm-ix-${domain}.sh`;

// The cron commands. Hostinger runs cron commands WITHOUT a shell — a
// pipeline here reached curl as literal argv ("option -qO-: is unknown")
// and stderr redirects were ignored — so each command must be a single
// program invocation with zero shell metacharacters: no pipes, quotes,
// redirects or ||. Two crons per site: one downloads the injector script,
// the other runs it. sh fails harmlessly for the minute or two until the
// download lands; both crons are deleted once the tag verifies.
export function buildCronCommands(scriptUrl, domain) {
  const stage = stagePathFor(domain);
  return [`curl -fsS -o ${stage} ${scriptUrl}`, `sh ${stage}`];
}

export async function listCrons(username) {
  const list = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs`);
  return Array.isArray(list) ? list : (list.data || []);
}

// Generic cron helpers (used by diagnostics like the docroot survey).
export async function ensureCron(username, command) {
  const existing = (await listCrons(username).catch(() => [])).find(j => (j.command || '').trim() === command);
  if (existing) return { uid: existing.uid || existing.id, created: false };
  const created = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs`, 'POST', { time: '* * * * *', command });
  return { uid: created?.uid || created?.id || created?.data?.uid || null, created: true };
}

// Last captured output of the first cron whose command contains `substr`,
// or null if the cron is missing / has produced no output yet.
export async function cronOutputMatching(username, substr) {
  try {
    const job = (await listCrons(username)).find(j => (j.command || '').includes(substr));
    if (!job) return null;
    const out = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${job.uid || job.id}/output`);
    const text = typeof out === 'string' ? out : (out.output || out.data || '');
    return text && String(text).trim() ? String(text) : null;
  } catch { return null; }
}

export async function deleteCronsMatching(username, substr) {
  let removed = 0;
  try {
    for (const job of await listCrons(username)) {
      if ((job.command || '').includes(substr) && (job.uid || job.id)) {
        try { await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${job.uid || job.id}`, 'DELETE'); removed++; } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return removed;
}

// An injector cron is recognisable by the /ix/ script URL (downloader) or
// the nbm-ix- staging path (runner), plus its domain.
function isInjectCron(job, domain) {
  const cmd = job.command || '';
  if (!cmd.includes('/ix/') && !cmd.includes('nbm-ix-')) return false;
  return !domain || cmd.includes(domain);
}

export async function deleteInjectCrons(username, domain = null) {
  let removed = 0;
  try {
    for (const job of await listCrons(username)) {
      if (isInjectCron(job, domain) && (job.uid || job.id)) {
        try { await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${job.uid || job.id}`, 'DELETE'); removed++; } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return removed;
}

// Ensure the injector cron pair exists for this site. We DON'T wait for
// them here — Hostinger can take several minutes to activate a new cron.
// A background pass (verifyPendingInjections) confirms via the live page and
// then removes the crons. Returns immediately after ensuring they exist.
export async function ensureInjectCron({ username, domain, scriptUrl }) {
  const existing = await listCrons(username).catch(() => []);
  let created = 0;
  for (const command of buildCronCommands(scriptUrl, domain)) {
    if (existing.some(j => (j.command || '').trim() === command)) continue;
    // Same program + staging path but different command text = a stale
    // variant (e.g. an old app_url baked into the download URL). Replace
    // it, or the cron would keep fetching from the dead address forever.
    const prog = command.split(' ')[0];
    const stale = existing.filter(j => {
      const c = (j.command || '').trim();
      return c.startsWith(prog + ' ') && c.includes(`nbm-ix-${domain}.sh`) && c !== command;
    });
    for (const j of stale) {
      try { await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${j.uid || j.id}`, 'DELETE'); } catch { /* ignore */ }
    }
    await hg(`/api/hosting/v1/accounts/${username}/cron-jobs`, 'POST', { time: '* * * * *', command });
    created++;
  }
  return { created };
}

// Best-effort read of the inject crons' last captured output (diagnostics).
// Labels each piece with the program it came from ([curl] download step,
// [sh] injector run).
export async function injectCronOutput(username, domain) {
  try {
    const jobs = (await listCrons(username)).filter(j => isInjectCron(j, domain));
    if (!jobs.length) return '(no inject cron present)';
    const parts = [];
    for (const job of jobs) {
      try {
        const out = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${job.uid || job.id}/output`);
        const text = (typeof out === 'string' ? out : (out.output || out.data || JSON.stringify(out))) || '(empty)';
        parts.push(`[${(job.command || '?').split(' ')[0]}] ${text.trim() || '(empty)'}`);
      } catch { /* ignore */ }
    }
    return parts.join(' • ') || '(no output captured)';
  } catch (e) { return '(output unavailable: ' + e.message.slice(0, 80) + ')'; }
}

// Confirm the tag is actually being served on the live page.
export async function verifyTag(domain, measurementId) {
  for (const url of [`https://${domain}`, `https://www.${domain}`]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'NorthBearPulse/1.0' }, redirect: 'follow' });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 2_000_000);
      const hasGa = measurementId ? html.includes(measurementId) : /gtag\/js\?id=/.test(html);
      const hasMarker = html.includes('NBM-GA-TAG');
      if (hasGa || hasMarker) return { verified: true, url };
    } catch { /* try next */ }
  }
  return { verified: false };
}

