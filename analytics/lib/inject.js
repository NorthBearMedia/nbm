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

// Build the idempotent, backup-first injector shell command as a single
// POSIX-sh line (cron runs one command). The snippet is base64-encoded so
// no quoting/escaping can break the shell or the HTML; a pipe-into-while
// loop avoids for/do keyword-adjacency pitfalls; awk replaces only the
// first </head> (& and \ never appear in our snippet). Idempotent via the
// NBM-GA-TAG marker; each edited file is backed up to *.nbmbak first.
export function buildCommand(rootDir, snippet) {
  const b64 = Buffer.from(snippet, 'utf8').toString('base64');
  const awkProg = 'BEGIN{d=0}{if(!d&&index($0,"</head>")>0){sub(/<\\/head>/,s"</head>");d=1}print}';
  return (
    `D='${rootDir}'; ` +
    `S=$(printf %s '${b64}' | base64 -d); ` +
    `find "$D" -type f -name '*.html' 2>/dev/null | while read f; do ` +
    `if grep -q '</head>' "$f" && ! grep -q 'NBM-GA-TAG' "$f"; then ` +
    `cp "$f" "$f.nbmbak"; ` +
    `awk -v s="$S" '${awkProg}' "$f" > "$f.nbmtmp" && mv "$f.nbmtmp" "$f" && echo "injected $f"; ` +
    `fi; done; ` +
    `echo "NBM-INJECT-COMPLETE"`
  );
}

async function findCronUid(username, command) {
  const list = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs`);
  const jobs = Array.isArray(list) ? list : (list.data || []);
  const match = jobs.find(j => (j.command || '') === command) || jobs[jobs.length - 1];
  return match?.uid || match?.id || null;
}

// Runs the injector on one site via a one-shot cron job. Returns the
// captured server output (or a timeout note).
export async function injectViaCron({ username, rootDir, measurementId, clarityId }, { pollMs = 150_000 } = {}) {
  const snippet = buildSnippet(measurementId, clarityId);
  const command = buildCommand(rootDir, snippet);
  const created = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs`, 'POST', { time: '* * * * *', command });
  let uid = created?.uid || created?.id || created?.data?.uid || null;
  if (!uid) { try { uid = await findCronUid(username, command); } catch { /* ignore */ } }

  let output = '';
  const deadline = Date.now() + pollMs;
  while (Date.now() < deadline) {
    await sleep(15_000);
    if (!uid) { try { uid = await findCronUid(username, command); } catch { /* ignore */ } }
    if (uid) {
      try {
        const out = await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${uid}/output`);
        output = (typeof out === 'string' ? out : (out.output || out.data || JSON.stringify(out))) || '';
        if (output.includes('NBM-INJECT-COMPLETE')) break;
      } catch { /* not run yet */ }
    }
  }
  // Clean up the cron job so it doesn't keep firing.
  if (uid) { try { await hg(`/api/hosting/v1/accounts/${username}/cron-jobs/${uid}`, 'DELETE'); } catch { /* leave it; harmless & idempotent */ } }
  return { uid, ran: output.includes('NBM-INJECT-COMPLETE'), output: output.slice(0, 1000) };
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

// Full flow for one site.
export async function installTag({ username, rootDir, domain, measurementId, clarityId }) {
  const inject = await injectViaCron({ username, rootDir, measurementId, clarityId });
  await sleep(3000);
  const check = await verifyTag(domain, measurementId);
  return { domain, ...inject, ...check };
}
