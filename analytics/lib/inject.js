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
// IMPORTANT: the snippet must never contain '&' or '\' — it travels through
// awk sub()/-v where both are escape-active. (No '&&' in the banner JS.)
//
// v2 blocks carry an end marker so the injector can REPLACE an existing
// block in place (upgrades: adding Clarity later, turning the consent
// banner on/off) — v1 blocks (start marker only) sit immediately before
// </head> or </body> by construction, so they're replaceable too.
export function buildSnippet(measurementId, clarityId, { consentBanner = false, fathomId = '' } = {}) {
  let load = '';
  if (measurementId) {
    load += consentBanner
      ? `var g=d.createElement('script');g.async=1;g.src='https://www.googletagmanager.com/gtag/js?id=${measurementId}';d.head.appendChild(g);w.dataLayer=w.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');`
      : `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');</script>`;
  }
  if (clarityId) {
    const clarityJs = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`;
    load += consentBanner ? clarityJs : `<script type="text/javascript">${clarityJs}</script>`;
  }
  if (fathomId) {
    load += consentBanner
      ? `var f=d.createElement('script');f.src='https://cdn.usefathom.com/script.js';f.setAttribute('data-site','${fathomId}');f.defer=true;d.head.appendChild(f);`
      : `<script src="https://cdn.usefathom.com/script.js" data-site="${fathomId}" defer></script>`;
  }
  if (!consentBanner) return `<!-- NBM-GA-TAG -->${load}<!-- /NBM-GA-TAG -->`;
  // Consent-gated variant: nothing loads until the visitor accepts; the
  // choice is remembered. Stricter than Consent Mode, dead simple, and
  // compliant for UK PECR. (nbmConsent doubles as the retrofit's marker
  // that the banner build is live on a page.)
  return `<!-- NBM-GA-TAG --><script>(function(){var w=window,d=document;function go(){${load}}`
    + `var c=null;try{c=localStorage.getItem('nbmConsent');}catch(e){}`
    + `if(c==='yes'){go();return;}if(c==='no'){return;}`
    + `function fin(v){try{localStorage.setItem('nbmConsent',v);}catch(e){}var el=d.getElementById('nbm-consent');if(el){el.parentNode.removeChild(el);}if(v==='yes'){go();}}`
    + `function show(){if(d.getElementById('nbm-consent')){return;}var b=d.createElement('div');b.id='nbm-consent';`
    + `b.setAttribute('style','position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#221f20;color:#fff;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;box-shadow:0 -2px 12px rgba(0,0,0,0.35)');`
    + `b.innerHTML='<span>This site uses cookies to understand visitor numbers and improve the site (Google Analytics, Microsoft Clarity).</span>'`
    + `+'<button id="nbm-consent-yes" style="background:#2eaa7b;color:#fff;border:0;border-radius:6px;padding:9px 18px;font-size:14px;font-weight:bold;cursor:pointer">Accept</button>'`
    + `+'<button id="nbm-consent-no" style="background:transparent;color:#c9cdd4;border:1px solid #555;border-radius:6px;padding:9px 14px;font-size:14px;cursor:pointer">No thanks</button>';`
    + `d.body.appendChild(b);d.getElementById('nbm-consent-yes').onclick=function(){fin('yes');};d.getElementById('nbm-consent-no').onclick=function(){fin('no');};}`
    + `if(d.readyState==='loading'){d.addEventListener('DOMContentLoaded',show);}else{show();}`
    + `})();</script><!-- /NBM-GA-TAG -->`;
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
  const awkHead = 'BEGIN{d=0}{if(!d&&index($0,"</head>")>0){sub(/<\\/head>/,s"</head>");d=1}print}';
  // Fallback for pages with no </head> (minified/odd builds): put the
  // snippet before </body> instead — GA and Clarity work from there too.
  const awkBody = 'BEGIN{d=0}{if(!d&&index($0,"</body>")>0){sub(/<\\/body>/,s"</body>");d=1}print}';
  // Replace an existing NBM block in place (upgrades: Clarity added later,
  // consent banner toggled). v2 blocks span start→end marker; v1 blocks
  // (no end marker) sit immediately before </head> or </body> by
  // construction, so marker→close-tag bounds them exactly.
  const awkRepl = 'BEGIN{d=0}{'
    + 'if(!d){i=index($0,"<!-- NBM-GA-TAG -->");'
    + 'if(i>0){r=substr($0,i);'
    + 'e=index(r,"<!-- /NBM-GA-TAG -->");'
    + 'if(e>0){$0=substr($0,1,i-1) s substr(r,e+20);d=1}'
    + 'else{h=index(r,"</head>");if(h==0){h=index(r,"</body>")}'
    + 'if(h>0){$0=substr($0,1,i-1) s substr(r,h);d=1}}'
    + '}}print}';
  return (
    `D='${rootDir}'\n` +
    // Diagnostic lines land in the captured cron output: distinguish
    // "no docroot" (builder-hosted site, nothing to edit), "no .html
    // files", and "file has neither </head> nor </body>" from a genuine
    // injection pass.
    `if [ ! -d "$D" ]; then echo "NBM-NO-DOCROOT $D"; exit 0; fi\n` +
    `echo "NBM-HTML-COUNT $(find "$D" -type f -name '*.html' 2>/dev/null | wc -l)"\n` +
    `S=$(printf %s '${b64}' | base64 -d)\n` +
    `find "$D" -type f -name '*.html' 2>/dev/null | while read f; do\n` +
    // The original pre-NBM backup is precious — never overwrite it on a
    // replace pass.
    `  if grep -q 'NBM-GA-TAG' "$f"; then\n` +
    `    if grep -qF "$S" "$f"; then echo "already $f"\n` +
    `    else\n` +
    `      [ -f "$f.nbmbak" ] || cp "$f" "$f.nbmbak"\n` +
    `      awk -v s="$S" '${awkRepl}' "$f" > "$f.nbmtmp" && mv "$f.nbmtmp" "$f" && echo "replaced $f"\n` +
    `    fi\n` +
    `  elif grep -q '</head>' "$f"; then\n` +
    `    [ -f "$f.nbmbak" ] || cp "$f" "$f.nbmbak"\n` +
    `    awk -v s="$S" '${awkHead}' "$f" > "$f.nbmtmp" && mv "$f.nbmtmp" "$f" && echo "injected $f"\n` +
    `  elif grep -q '</body>' "$f"; then\n` +
    `    [ -f "$f.nbmbak" ] || cp "$f" "$f.nbmbak"\n` +
    `    awk -v s="$S" '${awkBody}' "$f" > "$f.nbmtmp" && mv "$f.nbmtmp" "$f" && echo "injected-body $f"\n` +
    `  else echo "NBM-NO-HEAD $f"\n` +
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

// Confirm the tag is actually being served on the live page. The unique
// query string busts page caches (LiteSpeed etc.) that could serve stale
// HTML from before the injection.
export async function verifyTag(domain, measurementId) {
  const bust = `?nbmv=${Date.now()}`;
  for (const url of [`https://${domain}/${bust}`, `https://www.${domain}/${bust}`]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'NorthBearPulse/1.0', 'Cache-Control': 'no-cache' }, redirect: 'follow' });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 2_000_000);
      const hasGa = measurementId ? html.includes(measurementId) : /gtag\/js\?id=/.test(html);
      const hasMarker = html.includes('NBM-GA-TAG');
      if (hasGa || hasMarker) return { verified: true, url };
    } catch { /* try next */ }
  }
  return { verified: false };
}

