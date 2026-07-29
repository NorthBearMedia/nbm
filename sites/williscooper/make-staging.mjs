#!/usr/bin/env node
// Build a deployable copy of the Willis Cooper static site.
//
// Two modes:
//
// STAGING (default) — the source under sites/williscooper/ is a faithful
// clone of the LIVE site, so it still carries the live Google Analytics +
// Fathom tags and robots=index. Serving that verbatim on a public staging
// URL would pump test traffic into the live analytics and let search engines
// index a duplicate. Staging mode emits a copy with those neutralised.
//
// PRODUCTION (--production) — for deploying to williscooper.com itself:
// pages are copied verbatim (analytics on, indexable, robots.txt/sitemap/
// llms.txt kept). Only the repo tooling files (this script, README, deploy
// docs, zips) are excluded.
//
// Usage:  node make-staging.mjs [outDir] [--production]
//   outDir defaults to ../williscooper-staging-build
//   (or ../williscooper-live-build with --production)

import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const f of flags) {
  if (f !== '--production') {
    // A typo'd flag must not silently produce the wrong build (a staging
    // build uploaded to the live site would noindex + de-analytics it).
    console.error(`Unknown flag: ${f} (the only flag is --production)`);
    process.exit(1);
  }
}
const PRODUCTION = flags.includes('--production');

const NOINDEX = !PRODUCTION;           // replace robots meta with noindex,nofollow
const DISABLE_ANALYTICS = !PRODUCTION; // strip the live GA + Fathom tags

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = positional[0] || join(SRC, '..', PRODUCTION ? 'williscooper-live-build' : 'williscooper-staging-build');

// Dev/tooling files that should never be published to the live-facing site.
const SKIP = new Set([
  'make-staging.mjs', 'README.md', 'DEPLOY.md', 'DEPLOY-STAGING.md',
  '.variant-manifest.json',
  'events.json', 'events.sample.json', 'build-events.mjs', 'events-demo.html',
  'locations.json', 'build-locations.mjs',
  'williscooper-staging.zip', 'williscooper-live.zip',
]);

// Crawler-facing files that describe the LIVE site. On staging we don't want a
// sitemap or llms manifest advertising content, so drop them when noindexing.
const DROP_WHEN_NOINDEX = new Set(['sitemap.xml', 'llms.txt', 'llms-full.txt']);

// A staging robots.txt must block everything (the source one invites all
// crawlers + AI agents with Allow: /).
const STAGING_ROBOTS = '# Staging copy of williscooper.com — do not index.\nUser-agent: *\nDisallow: /\n';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function transformHtml(html) {
  let out = html;
  let robots = false, ga = false, fathom = false;

  if (NOINDEX) {
    // Strip every robots meta (any attribute order), then inject exactly one
    // noindex right after <head …>. `robots` is only set if the injection
    // actually happened — the caller aborts the build if any page missed it.
    out = out.replace(/<meta\b[^>]*\bname="robots"[^>]*>/gi, '');
    out = out.replace(/<head[^>]*>/i,
      m => { robots = true; return m + '<meta name="robots" content="noindex, nofollow, noarchive">'; });
  }

  if (DISABLE_ANALYTICS) {
    // Both GA <script> tags carry data-el-id="script-google-analytics[-async]".
    out = out.replace(/<script\b[^>]*data-el-id="script-google-analytics[^"]*"[^>]*>[\s\S]*?<\/script>/g,
      () => { ga = true; return ''; });
    // Fathom loader.
    out = out.replace(/<script\b[^>]*usefathom\.com[^>]*>\s*<\/script>/g,
      () => { fathom = true; return ''; });
  }

  return { out, robots, ga, fathom };
}

// Start clean so removed source files don't linger in a re-run — but OUT is
// user-supplied and gets recursively DELETED, so refuse anything dangerous:
// the source dir itself, any ancestor of it (would wipe the source), anything
// inside it (would get re-copied as "source" next run), or an existing
// directory that doesn't look like a previous build of this site.
const OUT_ABS = resolve(OUT);
const outPrefix = OUT_ABS.endsWith(sep) ? OUT_ABS : OUT_ABS + sep;
if (OUT_ABS === SRC || SRC.startsWith(outPrefix) || OUT_ABS.startsWith(SRC + sep)) {
  console.error(`Refusing outDir ${OUT_ABS}: it is, contains, or is inside the source directory ${SRC}.`);
  process.exit(1);
}
if (existsSync(OUT_ABS)) {
  const entries = readdirSync(OUT_ABS);
  if (entries.length && !(entries.includes('index.html') && entries.includes('assets'))) {
    console.error(`Refusing to delete ${OUT_ABS}: not empty and doesn't look like a previous build (expected index.html + assets/).`);
    process.exit(1);
  }
}
rmSync(OUT_ABS, { recursive: true, force: true });
mkdirSync(OUT_ABS, { recursive: true });

let htmlCount = 0, gaStripped = 0, fathomStripped = 0, noindexSet = 0, assetCount = 0;

let droppedFiles = 0, robotsRewritten = 0;
const failedPages = [];

for (const abs of walk(SRC)) {
  const rel = relative(SRC, abs);
  if (SKIP.has(rel)) continue;
  if (NOINDEX && DROP_WHEN_NOINDEX.has(rel)) { droppedFiles++; continue; }
  const dest = join(OUT_ABS, rel);
  mkdirSync(dirname(dest), { recursive: true });

  if (NOINDEX && rel === 'robots.txt') {
    writeFileSync(dest, STAGING_ROBOTS);
    robotsRewritten++;
  } else if (abs.endsWith('.html')) {
    const { out, robots, ga, fathom } = transformHtml(readFileSync(abs, 'utf8'));
    writeFileSync(dest, out);
    htmlCount++;
    if (robots) noindexSet++;
    if (ga) gaStripped++;
    if (fathom) fathomStripped++;
    // Enforce the staging invariants per page — a transform regex that
    // stopped matching (e.g. a future builder re-export changes markup)
    // must fail the build, not silently ship an unsafe page.
    if (NOINDEX && !robots) failedPages.push(`${rel}: noindex meta was not injected`);
    if (DISABLE_ANALYTICS && /googletagmanager|usefathom/i.test(out)) failedPages.push(`${rel}: analytics still present after strip`);
  } else {
    copyFileSync(abs, dest);
    assetCount++;
  }
}

console.log(`${PRODUCTION ? 'PRODUCTION' : 'Staging'} build → ${OUT_ABS}`);
console.log(`  HTML pages processed : ${htmlCount}`);
console.log(`  noindex applied      : ${noindexSet}`);
console.log(`  GA tags removed      : ${gaStripped}`);
console.log(`  Fathom tags removed  : ${fathomStripped}`);
console.log(`  robots.txt rewritten : ${robotsRewritten}`);
console.log(`  sitemap/llms dropped : ${droppedFiles}`);
console.log(`  assets copied        : ${assetCount}`);

if (failedPages.length) {
  console.error(`\nFATAL — staging invariants violated on ${failedPages.length} page(s):`);
  for (const f of failedPages) console.error(`  - ${f}`);
  console.error('The build output is NOT safe to deploy. Aborting with failure.');
  process.exit(1);
}
