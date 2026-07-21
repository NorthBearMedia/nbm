import { Router } from 'express';
import { randomBytes } from 'crypto';
import { google } from 'googleapis';
import db from '../database.js';
import { requireAuth } from '../middleware.js';

const router = Router();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/auth/gmail/callback`;
}

function makeOAuth2(req) {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, getRedirectUri(req));
}

// Token-refresh needs only client id/secret + the stored refresh token — no
// redirect URI — so this works without a request context. Exported for The
// Bear's email tools (routes/ai.js), which run per-user server-side.
export function gmailClientForUser(userId) {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const row = db.prepare('SELECT * FROM gmail_tokens WHERE user_id = ?').get(userId);
  if (!row) return null;
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  });
  oauth2.on('tokens', (tokens) => {
    db.prepare(
      'UPDATE gmail_tokens SET access_token = ?, expiry_date = ?, refresh_token = COALESCE(?, refresh_token) WHERE user_id = ?'
    ).run(tokens.access_token, tokens.expiry_date, tokens.refresh_token || null, userId);
  });
  return oauth2;
}

function getAuthenticatedClient(req) {
  return gmailClientForUser(req.user.id);
}

// Check if Gmail is configured and user is connected
router.get('/api/gmail/status', requireAuth, (req, res) => {
  const configured = !!(CLIENT_ID && CLIENT_SECRET);
  const row = db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(req.user.id);
  res.json({ configured, connected: !!row, email: row?.email || '' });
});

// Start OAuth flow
router.get('/auth/gmail/connect', requireAuth, (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(503).send('Gmail not configured');
  // CSRF protection: bind this flow to the browser via a random state nonce,
  // so an attacker can't complete a forged callback and attach THEIR Gmail
  // account to the victim's session.
  const state = randomBytes(16).toString('hex');
  res.cookie('gmail_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, secure: !!(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') });
  const oauth2 = makeOAuth2(req);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  });
  res.redirect(url);
});

// OAuth callback
router.get('/auth/gmail/callback', requireAuth, async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  const expected = req.cookies?.gmail_oauth_state;
  res.clearCookie('gmail_oauth_state');
  if (!expected || state !== expected) return res.status(403).send('OAuth state mismatch — please retry connecting Gmail.');
  try {
    const oauth2 = makeOAuth2(req);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress || '';

    db.prepare(
      'INSERT INTO gmail_tokens (user_id, access_token, refresh_token, expiry_date, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET access_token=?, refresh_token=?, expiry_date=?, email=?'
    ).run(
      req.user.id, tokens.access_token, tokens.refresh_token, tokens.expiry_date, email,
      tokens.access_token, tokens.refresh_token, tokens.expiry_date, email
    );

    res.redirect('/#email');
  } catch (err) {
    console.error('[Gmail] OAuth error:', err.message);
    res.status(500).send('Gmail authentication failed: ' + err.message);
  }
});

// Disconnect Gmail
router.post('/api/gmail/disconnect', requireAuth, (req, res) => {
  db.prepare('DELETE FROM gmail_tokens WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Inbox — list messages
router.get('/api/gmail/inbox', requireAuth, async (req, res) => {
  const auth = getAuthenticatedClient(req);
  if (!auth) return res.status(401).json({ error: 'Gmail not connected' });

  const gmail = google.gmail({ version: 'v1', auth });
  const label = req.query.label || 'INBOX';
  const q = req.query.q || '';
  const pageToken = req.query.pageToken || undefined;

  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: q ? undefined : [label],
      q: q || undefined,
      maxResults: 25,
      pageToken,
    });

    if (!list.data.messages?.length) {
      return res.json({ messages: [], nextPageToken: null });
    }

    const details = await Promise.all(
      list.data.messages.map(m =>
        gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })
      )
    );

    const messages = details.map(d => {
      const headers = d.data.payload?.headers || [];
      const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: d.data.id,
        threadId: d.data.threadId,
        snippet: d.data.snippet,
        from: get('From'),
        subject: get('Subject'),
        date: get('Date'),
        labelIds: d.data.labelIds || [],
        unread: (d.data.labelIds || []).includes('UNREAD'),
      };
    });

    res.json({ messages, nextPageToken: list.data.nextPageToken || null });
  } catch (err) {
    console.error('[Gmail] inbox error:', err.message);
    if (err.code === 401) {
      db.prepare('DELETE FROM gmail_tokens WHERE user_id = ?').run(req.user.id);
      return res.status(401).json({ error: 'Gmail session expired — please reconnect' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Read a thread
router.get('/api/gmail/thread/:id', requireAuth, async (req, res) => {
  const auth = getAuthenticatedClient(req);
  if (!auth) return res.status(401).json({ error: 'Gmail not connected' });

  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const thread = await gmail.users.threads.get({ userId: 'me', id: req.params.id, format: 'full' });
    const messages = (thread.data.messages || []).map(m => {
      const headers = m.payload?.headers || [];
      const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      let body = '';
      if (m.payload?.body?.data) {
        body = Buffer.from(m.payload.body.data, 'base64url').toString('utf-8');
      } else if (m.payload?.parts) {
        const textPart = m.payload.parts.find(p => p.mimeType === 'text/plain') || m.payload.parts.find(p => p.mimeType === 'text/html');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
        }
      }
      return {
        id: m.id,
        from: get('From'),
        to: get('To'),
        subject: get('Subject'),
        date: get('Date'),
        body,
        mimeType: m.payload?.mimeType || 'text/plain',
        labelIds: m.labelIds || [],
      };
    });
    res.json({ messages });
  } catch (err) {
    console.error('[Gmail] thread error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List labels
router.get('/api/gmail/labels', requireAuth, async (req, res) => {
  const auth = getAuthenticatedClient(req);
  if (!auth) return res.status(401).json({ error: 'Gmail not connected' });

  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const result = await gmail.users.labels.list({ userId: 'me' });
    const systemOrder = ['INBOX', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH'];
    const systemLabels = [];
    const userLabels = [];
    for (const l of (result.data.labels || [])) {
      if (l.labelListVisibility === 'labelHide' && l.type === 'system') continue;
      if (['CHAT', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_PROMOTIONS', 'CATEGORY_FORUMS'].includes(l.id)) continue;
      const entry = { id: l.id, name: l.name, type: l.type };
      if (l.type === 'system' && systemOrder.includes(l.id)) systemLabels.push(entry);
      else if (l.type === 'user') userLabels.push(entry);
    }
    systemLabels.sort((a, b) => systemOrder.indexOf(a.id) - systemOrder.indexOf(b.id));
    userLabels.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ labels: [...systemLabels, ...userLabels] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a new email
router.post('/api/gmail/send', requireAuth, async (req, res) => {
  const auth = getAuthenticatedClient(req);
  if (!auth) return res.status(401).json({ error: 'Gmail not connected' });

  const { to, subject, body } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient required' });

  const gmail = google.gmail({ version: 'v1', auth });
  const row = db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(req.user.id);
  const from = row?.email || req.user.email || '';

  const rawMessage = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject || '(no subject)'}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body || '',
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  try {
    const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
    res.json({ success: true, id: sent.data.id });
  } catch (err) {
    console.error('[Gmail] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reply to a thread
router.post('/api/gmail/reply', requireAuth, async (req, res) => {
  const auth = getAuthenticatedClient(req);
  if (!auth) return res.status(401).json({ error: 'Gmail not connected' });

  const { threadId, messageId, to, subject, body } = req.body;
  if (!threadId || !to) return res.status(400).json({ error: 'threadId and to required' });

  const gmail = google.gmail({ version: 'v1', auth });
  const row = db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(req.user.id);
  const from = row?.email || '';

  const rawMessage = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject?.startsWith('Re:') ? subject : 'Re: ' + (subject || '')}`,
    `In-Reply-To: ${messageId || ''}`,
    `References: ${messageId || ''}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body || '',
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  try {
    const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded, threadId } });
    res.json({ success: true, id: sent.data.id });
  } catch (err) {
    console.error('[Gmail] reply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
