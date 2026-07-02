import db from '../database.js';

/**
 * Log an activity and touch the parent client's updated_at timestamp.
 * Wrapped in try/catch so logging failures never crash a request.
 */
export function logActivity(entityType, entityId, action, author, details) {
  try {
    db.prepare(
      'INSERT INTO activity_log (entity_type, entity_id, action, author, details) VALUES (?, ?, ?, ?, ?)'
    ).run(entityType, entityId, action, author || 'System', details || '');

    // Touch client updated_at for "recently changed" sorting
    if (entityType === 'client') {
      db.prepare("UPDATE clients SET updated_at = datetime('now') WHERE id = ?").run(entityId);
    } else if (entityType === 'project') {
      db.prepare("UPDATE clients SET updated_at = datetime('now') WHERE id = (SELECT client_id FROM projects WHERE id = ?)").run(entityId);
    } else if (entityType === 'task') {
      db.prepare("UPDATE clients SET updated_at = datetime('now') WHERE id = (SELECT client_id FROM tasks WHERE id = ?)").run(entityId);
    }
  } catch (err) {
    console.error('logActivity error:', err);
  }
}
