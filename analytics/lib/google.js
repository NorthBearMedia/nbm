// Shared Google service-account client. One service account is granted
// Viewer access on every client's GA4 property and Search Console property,
// so a single key connects all sites.
import { JWT } from 'google-auth-library';
import { config } from '../config.js';

let client = null;

export function googleClient() {
  if (!config.googleServiceAccount) {
    throw new Error('Google service account not configured — see README.md');
  }
  if (!client) {
    client = new JWT({
      email: config.googleServiceAccount.client_email,
      key: config.googleServiceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
    });
  }
  return client;
}

export async function googleRequest(opts) {
  const res = await googleClient().request(opts);
  return res.data;
}
