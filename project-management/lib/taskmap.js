// Client Control Board enum mapping (Stage 1).
//
// task_status / task_band are the canonical fields used everywhere in the UI.
// progress / priority are legacy columns with locked CHECK constraints that we
// cannot alter without table recreation (forbidden — caused past data loss).
// We keep them as synced "shadow" values so legacy logic (Excel export, The Bear,
// recurring-task triggers, completed_at) never sees an illegal value.

// 'review' = staff have finished their part and want the owner's sign-off.
// task_status has no CHECK constraint, so this is safe to add; its legacy
// shadow is 'awaiting-manager' (which the old Focus sign-off flow used).
export const TASK_STATUSES = ['inbox', 'scheduled', 'in-progress', 'waiting-on-client', 'waiting-on-me', 'review', 'done', 'cancelled'];
export const TASK_BANDS = ['today', 'this-week', 'scheduled', 'waiting', 'someday'];
export const TASK_TYPES = ['recurring', 'ad-hoc', 'urgent', 'sales', 'admin', 'waiting', 'idea'];
export const CLIENT_TYPES = ['retainer', 'project', 'ad-hoc', 'prospect'];
export const CONTROL_STATUSES = ['green', 'amber', 'red', 'blue'];
export const RISK_LEVELS = ['low', 'medium', 'high'];

// task_status → legacy progress (CHECK-safe value)
const STATUS_TO_PROGRESS = {
  'inbox': 'not-started',
  'scheduled': 'not-started',
  'in-progress': 'in-progress',
  'waiting-on-client': 'awaiting-client',
  'waiting-on-me': 'awaiting-manager',
  'review': 'awaiting-manager',
  'done': 'completed',
  'cancelled': 'completed',
};

// task_band → legacy priority (CHECK-safe value)
const BAND_TO_PRIORITY = {
  'today': 'critical',
  'this-week': 'high',
  'scheduled': 'medium',
  'waiting': 'low',
  'someday': 'low',
};

export function statusToProgress(status) {
  return STATUS_TO_PROGRESS[status] || 'not-started';
}

export function bandToPriority(band) {
  return BAND_TO_PRIORITY[band] || 'medium';
}

// Reverse maps — used when a legacy caller sends progress/priority and we need to
// keep the canonical task_status/task_band consistent.
const PROGRESS_TO_STATUS = {
  'not-started': 'scheduled',
  'in-progress': 'in-progress',
  'completed': 'done',
  'invoiced': 'done',
  'ready-to-invoice': 'done',
  'stuck': 'waiting-on-me',
  'awaiting-manager': 'review',
  'awaiting-client': 'waiting-on-client',
};
const PRIORITY_TO_BAND = { 'critical': 'today', 'high': 'this-week', 'medium': 'scheduled', 'low': 'someday' };

export function progressToStatus(progress) {
  return PROGRESS_TO_STATUS[progress] || 'inbox';
}
export function priorityToBand(priority) {
  return PRIORITY_TO_BAND[priority] || 'scheduled';
}

export function isValidStatus(s) { return TASK_STATUSES.includes(s); }
export function isValidBand(b) { return TASK_BANDS.includes(b); }
export function isValidType(t) { return TASK_TYPES.includes(t); }
export function isValidClientType(t) { return CLIENT_TYPES.includes(t); }
export function isValidControlStatus(s) { return s === '' || CONTROL_STATUSES.includes(s); }
export function isValidRisk(r) { return r === '' || RISK_LEVELS.includes(r); }

// A task is "open" (counts toward outstanding/board logic) unless done or cancelled.
export function isOpenStatus(status) {
  return status !== 'done' && status !== 'cancelled';
}
