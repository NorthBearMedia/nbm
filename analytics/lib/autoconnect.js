// "Wire this site up for me": combines Google auto-discovery and homepage
// tag detection to fill in a site's blank connection fields automatically.
// Only ever fills blanks — anything set by hand is left alone.
import db from '../database.js';
import { discoverAll, matchForDomain } from './discovery.js';
import { detectTracking } from './detect.js';
import { getGoogleServiceAccount } from './runtime-config.js';

export async function autoConnectSite(siteId) {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) throw new Error('Site not found');
  if (!site.domain) return { filled: {}, notes: ['Set a domain for this site first — auto-connect works from the website address.'] };

  const filled = {};
  const notes = [];

  // 1. What does the Google account already know about this domain?
  if (getGoogleServiceAccount()) {
    try {
      const discovered = await discoverAll();
      const match = matchForDomain(site.domain, discovered);
      if (match.ga4) {
        if (!site.ga4_property_id) filled.ga4_property_id = match.ga4.propertyId;
        if (!site.ga4_measurement_id && match.ga4.measurementId) filled.ga4_measurement_id = match.ga4.measurementId;
      } else if (!site.ga4_property_id) {
        notes.push(discovered.errors.ga4 || `No GA4 property for ${site.domain} is visible to the service account yet — grant it Viewer access in that GA4 property (or account), then run auto-connect again.`);
      }
      if (match.gsc) {
        if (!site.gsc_site_url) filled.gsc_site_url = match.gsc;
      } else if (!site.gsc_site_url) {
        notes.push(discovered.errors.gsc || `No Search Console property for ${site.domain} is visible to the service account yet — add it as a user in Search Console, then run auto-connect again.`);
      }
    } catch (err) {
      notes.push(`Google scan failed: ${err.message}`);
    }
  } else {
    notes.push('Google isn\'t connected yet — finish the Google step in the setup wizard to auto-fill Analytics and Search Console.');
  }

  // 2. What tracking is already installed on the website itself?
  try {
    const tags = await detectTracking(site.domain);
    if (tags.ga4MeasurementId && !site.ga4_measurement_id && !filled.ga4_measurement_id) {
      filled.ga4_measurement_id = tags.ga4MeasurementId;
    }
    if (tags.clarityProjectId && !site.clarity_project_id) {
      filled.clarity_project_id = tags.clarityProjectId;
      if (!site.clarity_api_token) notes.push('Clarity is installed on the site ✓ — just add its API token (Clarity → Settings → Data Export) so reports can include it.');
    }
    if (!tags.ga4MeasurementId && tags.gtmContainerId && !site.ga4_property_id && !filled.ga4_property_id) {
      notes.push(`The site uses Google Tag Manager (${tags.gtmContainerId}) — GA4 may be configured inside it. The Google scan above is the reliable way to connect it.`);
    }
  } catch (err) {
    notes.push(`Couldn't scan the website for existing tags: ${err.message}`);
  }

  const keys = Object.keys(filled);
  if (keys.length) {
    db.prepare(`UPDATE sites SET ${keys.map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`)
      .run({ ...filled, id: site.id });
  }
  return { filled, notes };
}
