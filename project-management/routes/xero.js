import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../database.js';
import { requireAuth, requireRole } from '../middleware.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_INVOICES_URL = 'https://api.xero.com/api.xro/2.0/Invoices';
const XERO_PAYMENTS_URL = 'https://api.xero.com/api.xro/2.0/Payments';
const XERO_REPEATING_URL = 'https://api.xero.com/api.xro/2.0/RepeatingInvoices';

const SCOPES = 'openid profile email accounting.transactions.read accounting.contacts.read accounting.settings.read offline_access';

function getCredentials() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function buildRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/auth/xero/callback`;
}

function getStoredTokens(userId) {
  return db.prepare('SELECT * FROM xero_tokens WHERE user_id = ?').get(userId);
}

function storeTokens(userId, accessToken, refreshToken, expiresIn, tenantId) {
  const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();
  const existing = db.prepare('SELECT user_id FROM xero_tokens WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`
      UPDATE xero_tokens
      SET access_token = ?, refresh_token = ?, expiry_date = ?, tenant_id = ?
      WHERE user_id = ?
    `).run(accessToken, refreshToken, expiryDate, tenantId, userId);
  } else {
    db.prepare(`
      INSERT INTO xero_tokens (user_id, access_token, refresh_token, expiry_date, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, accessToken, refreshToken, expiryDate, tenantId);
  }
}

function deleteTokens(userId) {
  db.prepare('DELETE FROM xero_tokens WHERE user_id = ?').run(userId);
}

async function refreshAccessToken(userId) {
  const creds = getCredentials();
  if (!creds) throw new Error('Xero credentials not configured');

  const tokens = getStoredTokens(userId);
  if (!tokens) throw new Error('No Xero connection found');

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    deleteTokens(userId);
    throw new Error(`Token refresh failed: ${body}`);
  }

  const data = await res.json();
  storeTokens(userId, data.access_token, data.refresh_token, data.expires_in, tokens.tenant_id);
  return { accessToken: data.access_token, tenantId: tokens.tenant_id };
}

async function getValidToken(userId) {
  const tokens = getStoredTokens(userId);
  if (!tokens) throw new Error('No Xero connection found');

  const expiresAt = new Date(tokens.expiry_date).getTime();
  const bufferMs = 60 * 1000;

  if (Date.now() >= expiresAt - bufferMs) {
    return refreshAccessToken(userId);
  }

  return { accessToken: tokens.access_token, tenantId: tokens.tenant_id };
}

async function xeroGet(userId, url, params = {}) {
  const { accessToken, tenantId } = await getValidToken(userId);

  const query = new URLSearchParams(params).toString();
  const fullUrl = query ? `${url}?${query}` : url;

  const res = await fetch(fullUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xero API error ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Status ──────────────────────────────────────────────

router.get('/api/xero/status', requireAuth, (req, res) => {
  const creds = getCredentials();
  const configured = !!creds;
  const tokens = getStoredTokens(req.user.id);
  const connected = !!tokens;

  let expired = false;
  if (tokens) {
    expired = Date.now() >= new Date(tokens.expiry_date).getTime();
  }

  res.json({ configured, connected, expired });
});

// ─── OAuth2 Connect ──────────────────────────────────────

router.get('/auth/xero/connect', requireAuth, (req, res) => {
  const creds = getCredentials();
  if (!creds) return res.status(500).json({ error: 'Xero credentials not configured' });

  const state = randomBytes(16).toString('hex');

  // Store state in a short-lived cookie for CSRF validation
  res.cookie('xero_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    sameSite: 'lax',
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: creds.clientId,
    redirect_uri: buildRedirectUri(req),
    scope: SCOPES,
    state,
  });

  res.redirect(`${XERO_AUTH_URL}?${params}`);
});

// ─── OAuth2 Callback ─────────────────────────────────────

router.get('/auth/xero/callback', requireAuth, async (req, res) => {
  try {
    const { code, state } = req.query;
    const storedState = req.cookies?.xero_oauth_state;

    if (!code) return res.status(400).send('Missing authorization code');
    if (!storedState || state !== storedState) return res.status(403).send('Invalid OAuth state');

    res.clearCookie('xero_oauth_state');

    const creds = getCredentials();
    if (!creds) return res.status(500).send('Xero credentials not configured');

    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: buildRedirectUri(req),
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      return res.status(502).send(`Token exchange failed: ${body}`);
    }

    const tokenData = await tokenRes.json();

    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    if (!connRes.ok) {
      const body = await connRes.text();
      return res.status(502).send(`Failed to fetch Xero connections: ${body}`);
    }

    const connections = await connRes.json();
    if (!connections.length) return res.status(400).send('No Xero organisations found');

    const tenantId = connections[0].tenantId;
    storeTokens(req.user.id, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, tenantId);

    res.redirect('/?xero=connected');
  } catch (err) {
    console.error('[Xero] Callback error:', err);
    res.status(500).send('Xero connection failed');
  }
});

// ─── Disconnect ──────────────────────────────────────────

router.post('/api/xero/disconnect', requireAuth, (req, res) => {
  deleteTokens(req.user.id);
  res.json({ ok: true });
});

// ─── Dashboard ───────────────────────────────────────────

router.get('/api/xero/dashboard', requireAuth, async (req, res) => {
  try {
    const tokens = getStoredTokens(req.user.id);
    if (!tokens) return res.status(400).json({ error: 'Not connected to Xero' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const [outstandingData, overdueData, paymentsData] = await Promise.all([
      xeroGet(req.user.id, XERO_INVOICES_URL, {
        where: 'Status=="AUTHORISED"&&Type=="ACCREC"',
        order: 'DueDateString ASC',
      }),
      xeroGet(req.user.id, XERO_INVOICES_URL, {
        where: `Status=="AUTHORISED"&&Type=="ACCREC"&&DueDate<DateTime(${now.getFullYear()},${now.getMonth() + 1},${now.getDate()})`,
        order: 'DueDateString ASC',
      }),
      xeroGet(req.user.id, XERO_PAYMENTS_URL, {
        where: `Date>=DateTime(${now.getFullYear()},${now.getMonth() + 1},1)`,
        order: 'Date DESC',
      }),
    ]);

    const outstanding = (outstandingData.Invoices || []).map(inv => ({
      id: inv.InvoiceID,
      number: inv.InvoiceNumber,
      contact: inv.Contact?.Name,
      amount: inv.AmountDue,
      currency: inv.CurrencyCode,
      dueDate: inv.DueDateString,
      total: inv.Total,
    }));

    const overdue = (overdueData.Invoices || []).map(inv => ({
      id: inv.InvoiceID,
      number: inv.InvoiceNumber,
      contact: inv.Contact?.Name,
      amount: inv.AmountDue,
      currency: inv.CurrencyCode,
      dueDate: inv.DueDateString,
      total: inv.Total,
    }));

    const recentPayments = (paymentsData.Payments || []).slice(0, 20).map(p => ({
      id: p.PaymentID,
      date: p.DateString,
      amount: p.Amount,
      reference: p.Reference,
      invoiceNumber: p.Invoice?.InvoiceNumber,
      contact: p.Invoice?.Contact?.Name,
    }));

    const revenueThisMonth = (paymentsData.Payments || []).reduce((sum, p) => sum + (p.Amount || 0), 0);

    const outstandingTotal = outstanding.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const overdueTotal = overdue.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    res.json({
      outstanding: { count: outstanding.length, total: outstandingTotal, invoices: outstanding },
      overdue: { count: overdue.length, total: overdueTotal, invoices: overdue },
      recentPayments,
      revenueThisMonth,
    });
  } catch (err) {
    console.error('[Xero] Dashboard error:', err);
    if (err.message.includes('No Xero connection')) {
      return res.status(400).json({ error: 'Not connected to Xero' });
    }
    res.status(500).json({ error: 'Failed to fetch Xero data' });
  }
});

// ─── Retainers: is each client's monthly value what Xero actually bills? ───
// Xero's active repeating sales invoices give each contact's monthly amount
// (ex VAT). A client is matched to a contact by an explicit link
// (clients.xero_contact_id) or, failing that, by an unambiguous name match.
// Linked clients follow Xero: their monthly value is kept in step.

// Xero sends dates as "/Date(1764547200000+0000)/" (or an ISO "…String").
function xeroDay(v) {
  const m = String(v || '').match(/\/Date\((\d+)/);
  if (m) return new Date(+m[1]).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '';
}
function monthlyOf(ri) {
  const sub = Number(ri.SubTotal) || 0;
  const every = Number(ri.Schedule?.Period) || 1;
  return String(ri.Schedule?.Unit || 'MONTHLY').toUpperCase() === 'WEEKLY' ? (sub * 52) / 12 / every : sub / every;
}
// "Smartmove Homes (Derbyshire) Ltd" and "Smartmove Homes" are the same business.
export const normName = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ')
  .replace(/\b(ltd|limited|plc|llp|the|company|co|group|uk)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const retainerCache = new Map();   // userId → { at, contacts }
async function xeroRetainerContacts(userId, fresh) {
  const hit = retainerCache.get(userId);
  if (hit && !fresh && Date.now() - hit.at < 15 * 60 * 1000) return hit;
  const data = await xeroGet(userId, XERO_REPEATING_URL);
  const today = new Date().toISOString().slice(0, 10);
  const byContact = new Map();
  for (const ri of data.RepeatingInvoices || []) {
    if (ri.Type !== 'ACCREC' || ri.Status !== 'AUTHORISED' || !ri.Contact?.ContactID) continue;
    const end = xeroDay(ri.Schedule?.EndDateString || ri.Schedule?.EndDate);
    if (end && end < today) continue;                         // a schedule that has finished
    const id = ri.Contact.ContactID.toLowerCase();
    if (!byContact.has(id)) byContact.set(id, { contactId: id, name: ri.Contact.Name || '', monthly: 0, templates: [] });
    const c = byContact.get(id);
    const m = monthlyOf(ri);
    c.monthly += m;
    c.templates.push({ reference: String(ri.Reference || '').slice(0, 80), monthly: Math.round(m * 100) / 100,
      next: xeroDay(ri.Schedule?.NextScheduledDateString || ri.Schedule?.NextScheduledDate) });
  }
  const contacts = [...byContact.values()].map(c => ({ ...c, monthly: Math.round(c.monthly * 100) / 100 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entry = { at: Date.now(), contacts };
  retainerCache.set(userId, entry);
  return entry;
}

function matchClients(contacts, { includeArchived = false } = {}) {
  const out = {};
  for (const c of db.prepare(`SELECT id, name, aliases, xero_contact_id FROM clients WHERE is_system = 0 ${includeArchived ? '' : 'AND archived = 0'}`).all()) {
    let hit = null, by = '';
    if (c.xero_contact_id) {
      hit = contacts.find(x => x.contactId === c.xero_contact_id) || { contactId: c.xero_contact_id, name: '', monthly: 0, templates: [] };
      by = 'linked';
    } else {
      // The client's name or any "also known as" name (Keto & Clarity → "Uni Nutrition").
      const names = [c.name, ...String(c.aliases || '').split(',')].map(normName).filter(Boolean);
      const cands = contacts.filter(x => {
        const m = normName(x.name);
        return m && names.some(n => m === n || (Math.min(m.length, n.length) >= 5 && (m.includes(n) || n.includes(m))));
      });
      if (cands.length === 1) { hit = cands[0]; by = 'name'; }
    }
    out[c.id] = hit ? { ...hit, by } : null;
  }
  return out;
}

router.get('/api/xero/retainers', requireAuth, requireRole('owner'), async (req, res) => {
  if (!getCredentials() || !getStoredTokens(req.user.id)) return res.json({ connected: false });
  try {
    const { at, contacts } = await xeroRetainerContacts(req.user.id, req.query.fresh === '1');
    const matches = matchClients(contacts);
    // Linked clients follow Xero (only to a real amount — a paused schedule
    // shows as a warning instead of zeroing the client).
    const synced = [];
    for (const [cid, m] of Object.entries(matches)) {
      if (!m || m.by !== 'linked' || !m.monthly) continue;
      const row = db.prepare('SELECT monthly_value FROM clients WHERE id = ?').get(cid);
      if (Math.abs((row?.monthly_value || 0) - m.monthly) < 0.5) continue;
      db.prepare('UPDATE clients SET monthly_value = ? WHERE id = ?').run(m.monthly, cid);
      logActivity('client', +cid, 'updated', req.user.display_name,
        `Monthly value £${row?.monthly_value || 0} → £${m.monthly} (from Xero repeating invoices)`);
      synced.push(+cid);
    }
    // Retainers billed in Xero with no client in Console at all (archived
    // clients count as "in Console" — taken off on purpose).
    const known = new Set(Object.values(matchClients(contacts, { includeArchived: true })).filter(Boolean).map(m => m.contactId));
    const unmatched = contacts.filter(x => !known.has(x.contactId) && x.monthly > 0).sort((a, b) => b.monthly - a.monthly);
    res.json({ connected: true, checkedAt: new Date(at).toISOString(), contacts, matches, synced, unmatched });
  } catch (err) {
    console.error('[Xero] Retainers error:', err.message);
    const gone = /No Xero connection|refresh failed|invalid_grant|401/i.test(err.message);
    res.status(502).json({ connected: !gone, error: gone ? 'Xero needs reconnecting (Workspace strip on the Dashboard)' : 'Couldn’t reach Xero just now' });
  }
});

export default router;
