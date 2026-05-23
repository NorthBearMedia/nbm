import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole } from '../middleware.js';

const router = Router();

// ─── Config endpoints ───────────────────────────────────

router.get('/api/whatsapp/config', requireAuth, (req, res) => {
  const configs = db.prepare('SELECT id, label, phone_number_id, waba_id, verify_token, enabled FROM whatsapp_config').all();
  res.json(configs);
});

router.post('/api/whatsapp/config', requireAuth, requireRole('owner'), (req, res) => {
  const { label, phone_number_id, waba_id, access_token, verify_token } = req.body;

  if (!label || !phone_number_id || !waba_id || !access_token || !verify_token) {
    return res.status(400).json({ error: 'All fields are required: label, phone_number_id, waba_id, access_token, verify_token' });
  }

  const existing = db.prepare('SELECT id FROM whatsapp_config WHERE phone_number_id = ?').get(phone_number_id);

  if (existing) {
    db.prepare(
      'UPDATE whatsapp_config SET label = ?, waba_id = ?, access_token = ?, verify_token = ?, enabled = 1 WHERE id = ?'
    ).run(label, waba_id, access_token, verify_token, existing.id);
    return res.json({ id: existing.id, updated: true });
  }

  const count = db.prepare('SELECT COUNT(*) as cnt FROM whatsapp_config').get().cnt;
  if (count >= 2) {
    return res.status(400).json({ error: 'Maximum of 2 WhatsApp configs allowed' });
  }

  const result = db.prepare(
    'INSERT INTO whatsapp_config (label, phone_number_id, waba_id, access_token, verify_token, enabled) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(label, phone_number_id, waba_id, access_token, verify_token);

  res.json({ id: result.lastInsertRowid, created: true });
});

router.delete('/api/whatsapp/config/:id', requireAuth, requireRole('owner'), (req, res) => {
  const result = db.prepare('DELETE FROM whatsapp_config WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Config not found' });
  res.json({ deleted: true });
});

// ─── Messages ───────────────────────────────────────────

router.get('/api/whatsapp/messages/:configId', requireAuth, (req, res) => {
  const config = db.prepare('SELECT id FROM whatsapp_config WHERE id = ?').get(req.params.configId);
  if (!config) return res.status(404).json({ error: 'Config not found' });

  const messages = db.prepare(
    'SELECT * FROM whatsapp_messages WHERE config_id = ? ORDER BY timestamp DESC LIMIT 50'
  ).all(req.params.configId);

  res.json(messages);
});

// ─── Send ───────────────────────────────────────────────

router.post('/api/whatsapp/send', requireAuth, async (req, res) => {
  const { configId, to, body } = req.body;

  if (!configId || !to || !body) {
    return res.status(400).json({ error: 'configId, to, and body are required' });
  }

  const config = db.prepare('SELECT * FROM whatsapp_config WHERE id = ? AND enabled = 1').get(configId);
  if (!config) return res.status(404).json({ error: 'WhatsApp config not found or disabled' });

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Meta API error', detail: data });
    }

    const waMessageId = data.messages?.[0]?.id || null;

    db.prepare(
      'INSERT INTO whatsapp_messages (config_id, direction, from_number, to_number, contact_name, body, timestamp, wa_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(configId, 'outbound', config.phone_number_id, to, req.user.display_name, body, new Date().toISOString(), waMessageId);

    res.json({ success: true, wa_message_id: waMessageId });
  } catch (err) {
    console.error('[WhatsApp] Send error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── Webhook verification (Meta calls this — no auth) ──

router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) {
    return res.sendStatus(403);
  }

  const match = db.prepare('SELECT id FROM whatsapp_config WHERE verify_token = ?').get(token);
  if (!match) return res.sendStatus(403);

  res.status(200).send(challenge);
});

// ─── Webhook inbound messages (Meta calls this — no auth)

router.post('/webhooks/whatsapp', (req, res) => {
  try {
    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        if (!phoneNumberId || messages.length === 0) continue;

        const config = db.prepare('SELECT id FROM whatsapp_config WHERE phone_number_id = ?').get(phoneNumberId);
        if (!config) continue;

        for (const msg of messages) {
          if (msg.type !== 'text') continue;

          const contact = contacts.find(c => c.wa_id === msg.from);
          const contactName = contact?.profile?.name || msg.from;

          db.prepare(
            'INSERT INTO whatsapp_messages (config_id, direction, from_number, to_number, contact_name, body, timestamp, wa_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            config.id,
            'inbound',
            msg.from,
            phoneNumberId,
            contactName,
            msg.text?.body || '',
            new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            msg.id
          );
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] Webhook processing error:', err);
  }

  res.sendStatus(200);
});

// ─── Dashboard summary ─────────────────────────────────

router.get('/api/whatsapp/dashboard', requireAuth, (req, res) => {
  const configs = db.prepare('SELECT id, label, phone_number_id, enabled FROM whatsapp_config').all();

  const unreadStmt = db.prepare(
    "SELECT COUNT(*) as count FROM whatsapp_messages WHERE config_id = ? AND direction = 'inbound' AND read = 0"
  );

  const latestStmt = db.prepare(
    'SELECT * FROM whatsapp_messages WHERE config_id = ? ORDER BY timestamp DESC LIMIT 3'
  );

  const summary = configs.map(config => ({
    config_id: config.id,
    label: config.label,
    phone_number_id: config.phone_number_id,
    enabled: config.enabled,
    unread_count: unreadStmt.get(config.id).count,
    latest_messages: latestStmt.all(config.id),
  }));

  res.json(summary);
});

export default router;
