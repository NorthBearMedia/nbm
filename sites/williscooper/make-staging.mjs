#!/usr/bin/env node
// Build a STAGING-safe copy of the Willis Cooper static site.
//
// The source under sites/williscooper/ is a faithful clone of the LIVE site,
// so it still carries the live Google Analytics + Fathom tags and
// robots=index. Serving that verbatim on a public staging subdomain would
// pump test traffic into the live analytics and let search engines index a
// duplicate of the live site. This script emits a copy with those two things
// neutralised, leaving the source untouched.
//
// Usage:  node make-staging.mjs [outDir]
//   outDir defaults to ../williscooper-staging-build (a sibling of this folder)
//
// Flip either constant to false to opt out of that transform.
const NOINDEX = true;          // replace robots meta with noindex,nofollow
const DISABLE_ANALYTICS = true; // strip the live GA + Fathom tags

import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(SRC, '..', 'williscooper-staging-build');

// Dev/tooling files that should never be published to the live-facing site.
const SKIP = new Set(['make-staging.mjs', 'README.md', 'DEPLOY-STAGING.md', 'williscooper-staging.zip']);

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
    out = out.replace(
      /<meta name="robots" content="[^"]*">/,
      () => { robots = true; return '<meta name="robots" content="noindex, nofollow, noarchive">'; }
    );
    // Belt-and-braces: if a page somehow lacks a robots meta, inject one.
    if (!robots) {
      out = out.replace(/<head>/, '<head><meta name="robots" content="noindex, nofollow, noarchive">');
      robots = true;
    }
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

// Start clean so removed source files don't linger in a re-run.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let htmlCount = 0, gaStripped = 0, fathomStripped = 0, noindexSet = 0, assetCount = 0;

let droppedFiles = 0, robotsRewritten = 0;

for (const abs of walk(SRC)) {
  const rel = relative(SRC, abs);
  if (SKIP.has(rel)) continue;
  if (NOINDEX && DROP_WHEN_NOINDEX.has(rel)) { droppedFiles++; continue; }
  const dest = join(OUT, rel);
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
  } else {
    copyFileSync(abs, dest);
    assetCount++;
  }
}

console.log(`Staging build → ${OUT}`);
console.log(`  HTML pages processed : ${htmlCount}`);
console.log(`  noindex applied      : ${noindexSet}`);
console.log(`  GA tags removed      : ${gaStripped}`);
console.log(`  Fathom tags removed  : ${fathomStripped}`);
console.log(`  robots.txt rewritten : ${robotsRewritten}`);
console.log(`  sitemap/llms dropped : ${droppedFiles}`);
console.log(`  assets copied        : ${assetCount}`);
