import { Router } from 'express';
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

function getAuthenticatedClient(req) {
  const row = db.prepare('SELECT * FROM gmail_tokens WHERE user_id = ?').get(req.user.id);
  if (!row) return null;
  const oauth2 = makeOAuth2(req);
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  });
  oauth2.on('tokens', (tokens) => {
    const updates = { access_token: tokens.access_token, expiry_date: tokens.expiry_date };
    if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;
    db.prepare(
      'UPDATE gmail_tokens SET access_token = ?, expiry_date = ?, refresh_token = COALESCE(?, refresh_token) WHERE user_id = ?'
    ).run(updates.access_token, updates.expiry_date, tokens.refresh_token || null, req.user.id);
  });
  return oauth2;
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
  const oauth2 = makeOAuth2(req);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
  res.redirect(url);
});

// OAuth callback
router.get('/auth/gmail/callback', requireAuth, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const oauth2 = makeOAuth2(req);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const people = google.people({ version: 'v1', auth: oauth2 });
    const me = await people.people.get({ resourceName: 'people/me', personFields: 'emailAddresses' });
    const email = me.data.emailAddresses?.[0]?.value || '';

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
    const labels = (result.data.labels || [])
      .filter(l => l.type === 'user' || ['INBOX', 'SENT', 'STARRED', 'IMPORTANT', 'DRAFT'].includes(l.id))
      .map(l => ({ id: l.id, name: l.name, type: l.type }));
    res.json({ labels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
