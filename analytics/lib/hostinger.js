// Hostinger API — pulls the account's domain portfolio so every hosted
// website can be imported into Pulse in one click. Token comes from the
// settings (Settings → Hostinger API token) or HOSTINGER_API_TOKEN env.
import { getHostingerToken } from './runtime-config.js';

const BASE = 'https://developers.hostinger.com';

async function api(path) {
  const token = getHostingerToken();
  if (!token) throw new Error('Hostinger is not connected yet — add your API token in Settings');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(BASE + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error('Hostinger rejected the API token — generate a new one in hPanel → Account → API');
    if (!res.ok) throw new Error(`Hostinger API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

// Domain portfolio — defensively parsed, Hostinger's schema has shifted
// between SDK versions.
export async function listDomains() {
  const data = await api('/api/domains/v1/portfolio');
  const items = Array.isArray(data) ? data : (data.data || data.domains || []);
  return items
    .map(d => ({
      domain: String(d.domain || d.name || d.domain_name || '').toLowerCase().replace(/^www\./, ''),
      status: d.status || '',
      type: d.type || '',
    }))
    .filter(d => d.domain && d.domain.includes('.'))
    .filter(d => !d.status || ['active', 'registered', 'ok'].includes(String(d.status).toLowerCase()));
}

export async function testConnection() {
  await listDomains();
  return true;
}
