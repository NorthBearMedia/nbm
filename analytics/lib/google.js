// Shared Google service-account auth. Two modes:
//  · default — act as the robot itself (GA4 Viewer grants, etc.)
//  · impersonation — with Workspace domain-wide delegation authorised,
//    act AS a real user (read-only) so e.g. Search Console needs no
//    per-site grants at all.
// Clients are cached per credential/subject/scopes and rebuilt if the
// key changes.
import { JWT } from 'google-auth-library';
import { getGoogleServiceAccount } from './runtime-config.js';

const clients = new Map();

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export function googleClient({ scopes = DEFAULT_SCOPES, subject = null } = {}) {
  const sa = getGoogleServiceAccount();
  if (!sa) {
    throw new Error('Google is not connected yet — open the setup wizard in the admin console');
  }
  const cacheKey = [sa.client_email, (sa.private_key || '').slice(64, 96), subject || '-', scopes.join(' ')].join('|');
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes,
      subject: subject || undefined,
    }));
  }
  return clients.get(cacheKey);
}

export async function googleRequest(opts, clientOpts) {
  const res = await googleClient(clientOpts).request(opts);
  return res.data;
}
