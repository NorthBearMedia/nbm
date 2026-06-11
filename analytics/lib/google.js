// Shared Google service-account client. One service account is granted
// Viewer access on every client's GA4 property and Search Console property,
// so a single key connects all sites. Credentials come from the setup
// wizard (or .env) and the client is rebuilt if they change.
import { JWT } from 'google-auth-library';
import { getGoogleServiceAccount } from './runtime-config.js';

let client = null;
let clientKey = '';

export function googleClient() {
  const sa = getGoogleServiceAccount();
  if (!sa) {
    throw new Error('Google is not connected yet — open the setup wizard in the admin console');
  }
  const key = `${sa.client_email}:${(sa.private_key || '').slice(64, 96)}`;
  if (!client || clientKey !== key) {
    client = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
    });
    clientKey = key;
  }
  return client;
}

export async function googleRequest(opts) {
  const res = await googleClient().request(opts);
  return res.data;
}
