// Looks at a website's homepage and detects which tracking is already
// installed — GA4 measurement ID, Microsoft Clarity project ID, and Google
// Tag Manager. Lets sites be plugged in without hunting through page source.

const UA = 'Mozilla/5.0 (compatible; NorthBearPulse/1.0; +https://northbearmedia.co.uk)';

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.text()).slice(0, 2_000_000);
  } finally { clearTimeout(timer); }
}

export async function detectTracking(domain) {
  const host = String(domain).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host) throw new Error('No domain set for this site');

  let html = null, fetchedUrl = null, lastError = null;
  for (const url of [`https://${host}`, `https://www.${host}`]) {
    try { html = await fetchHtml(url); fetchedUrl = url; break; }
    catch (err) { lastError = err; }
  }
  if (html === null) {
    throw new Error(`Couldn't reach ${host} (${lastError?.message || 'unknown error'})`);
  }

  // GA4: gtag loader URL or an inline gtag('config', 'G-…') call.
  const ga4 =
    html.match(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]{4,14})/i)?.[1] ||
    html.match(/gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]{4,14})['"]/i)?.[1] ||
    null;

  // Microsoft Clarity: tag URL or the standard install snippet's third arg.
  const clarity =
    html.match(/clarity\.ms\/tag\/([a-z0-9]{6,16})/i)?.[1] ||
    html.match(/["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,16})["']/i)?.[1] ||
    null;

  // GTM container — GA4 might be configured inside it, which we can't read.
  const gtm = html.match(/\b(GTM-[A-Z0-9]{4,10})\b/)?.[1] || null;

  return {
    fetchedUrl,
    ga4MeasurementId: ga4 ? ga4.toUpperCase() : null,
    clarityProjectId: clarity ? clarity.toLowerCase() : null,
    gtmContainerId: gtm,
  };
}
