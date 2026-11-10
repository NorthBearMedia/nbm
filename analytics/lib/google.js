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
      // Every Google call through this client (GA4, Search Console, Admin,
      // Site Verification and the token endpoint) is time-boxed and retried
      // on passing errors, so a stalled connection cannot hang the report
      // scheduler or an admin request. Our calls are read-only or idempotent,
      // except the GA4 creates in ops.js, which opt out with retry: 0.
      transporterOptions: {
        timeout: 30_000,
        retry: true,
        retryConfig: {
          retry: 2,
          retryDelay: 500,
          noResponseRetries: 1,
          httpMethodsToRetry: ['GET', 'POST', 'PUT'],
          statusCodesToRetry: [[429, 429], [500, 599]],
        },
      },
    }));
  }
  return clients.get(cacheKey);
}

export async function googleRequest(opts, clientOpts) {
  const res = await googleClient(clientOpts).request(opts);
  return res.data;
}
