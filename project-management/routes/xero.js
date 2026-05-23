import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../database.js';
import { requireAuth } from '../middleware.js';

const router = Router();

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_INVOICES_URL = 'https://api.xero.com/api.xro/2.0/Invoices';
const XERO_PAYMENTS_URL = 'https://api.xero.com/api.xro/2.0/Payments';

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

export default router;
