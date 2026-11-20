# North Bear Console — Context for AI Sessions

This document is the standing brief for any AI (Claude Code or otherwise) picking up work on the North Bear Console. Read this first.

## What this is

Internal project management system for **North Bear Media**, a creative production company. Single-tenant, run by the team. Replaces a spreadsheet-based workflow with a real app that tracks **clients → tasks** (flat structure, no project layer), plus calendar / focus / today views, multi-assignee with manager sign-off, and an embedded AI assistant called **"The Bear"**.

Live at: deployed on **Railway** (not Render — the `render.yaml` is leftover but the docs in `README.md` reference Railway).

## Repo layout

```
/home/user/nbm/
├── project-management/        ← THE APP. Everything below this.
│   ├── server.js              Entry — middleware, route mounting, hourly backups
│   ├── database.js            SQLite schema + safe migrations + pre-migration backup
│   ├── middleware.js          Auth, security headers, file uploads, dataDir resolution
│   ├── lib/activity.js        Activity log helper (server-derived author)
│   ├── lib/claude.js          Shared Anthropic client: retry on 429/5xx, model fallback, friendly errors
│   ├── lib/intake.js          The intake robot: sources, Claude extraction, validation, scheduler
│   ├── lib/report.js          Monthly client report: gather (tasks/Pulse/Metricool), write, PDF
│   ├── lib/taskmap.js         Canonical ↔ shadow task field mapping
│   ├── assets/                Report PDF fonts (Archivo, Martian Mono — OFL) + light NBM logo
│   ├── routes/
│   │   ├── auth.js            Login / logout / session
│   │   ├── clients.js         Client CRUD + logo + history
│   │   ├── projects.js        Project CRUD (legacy — projects layer removed from UI)
│   │   ├── tasks.js           Task CRUD, attachments, comments, calendar, search,
│   │   │                       /summary, /workload-detail, /:id/duplicate, by-date
│   │   ├── users.js           User mgmt, avatars, passwords
│   │   ├── system.js          Health, global history, team, archived, Excel export,
│   │   │                       backups (list/create/download/restore)
│   │   ├── ai.js              The Bear — tool-use loop (model via lib/claude.js)
│   │   ├── intake.js          Robot: suggestion tray API, run/paste, settings, /capture/:token link
│   │   ├── reports.js         Monthly report: draft / edit / PDF / email, Metricool brand list
│   │   └── gmail.js, xero.js, whatsapp.js   Integrations (gmail.js also connects robot-only mailboxes)
│   ├── public/
│   │   ├── index.html         Entire UI in one file (all modals)
│   │   ├── app.js             ~5000 lines, all client logic, vanilla JS
│   │   ├── styles.css         Dark theme, North Bear green (#3eaf84) accents
│   │   └── login.html         (auth screen)
│   ├── package.json           ESM (`"type": "module"`)
│   ├── README.md              Deploy + env var docs
│   └── render.yaml            Stale — actual deploy is Railway
├── PLAN.md                    Older design doc
└── (root package.json/src)    Unrelated harness, ignore
```

## Branch convention

**All AI development happens on `claude/project-management-system-5iByI`.** Push there. The user merges to main themselves.

## Tech stack

- **Backend:** Node.js + Express (ESM), `better-sqlite3` (synchronous SQLite)
- **Frontend:** Vanilla JS, no framework, no build step. Cropper.js for image crop.
- **AI:** `@anthropic-ai/sdk` via `lib/claude.js` — model `CLAUDE_MODEL` env or `claude-opus-5-5`, falling
  back to `claude-opus-4-6` automatically if the API rejects the model. The Bear: manual tool-use loop.
  The robot and the report writer: one forced tool call each (`record_findings`, `write_report`).
- **PDF:** `pdfkit` (monthly client report), same visual language as Pulse's reports.
- **Excel export:** `xlsx` (SheetJS)
- **Auth:** scrypt-hashed passwords, httpOnly session cookies, 24h expiry
- **Deploy:** Railway. Persistent volume at `/data` (`RAILWAY_VOLUME_MOUNT_PATH=/data`). Hourly backups in `<dataDir>/backups/`.

## Critical safety rules — read before touching the database

The user previously lost data to a cascade-delete catastrophe. We instituted strict rules in `database.js`:

1. **NEVER write a destructive migration.** No `DROP TABLE`, no `DROP COLUMN`, no `DELETE FROM` outside an explicit user-triggered route. Only `ALTER TABLE ADD COLUMN`.
2. **A pre-migration backup runs synchronously** before any schema changes (`copyFileSync` to `backups/pre-migration-<ts>.db`). If you add a migration, that file must exist before the migration runs.
3. **Hourly rolling backups** keep the last 48 in `<dataDir>/backups/`. Owners can also download backups for off-site storage.
4. The owner has a **restore from backup** route — copies tables from a backup file with foreign keys disabled inside a transaction.
5. If you discover unexpected files/branches/state, **investigate before deleting**. Never use `git reset --hard` or `--no-verify` shortcuts.

## Data model

```
users           id, username, email, password_hash, password_salt,
                display_name, role (owner|editor|viewer), avatar_color, status

clients         id, name, code (3 letters), agreement_type (recurring|ad-hoc),
                logo_url, gmail_link, drive_link, notes, sort_order,
                is_private (owner-only), archived, created_at,
                -- Client Control Board (Stage 1):
                client_type (retainer|project|ad-hoc|prospect), monthly_value,
                agreement_summary, recurring_deliverables, last_contact_date,
                next_scheduled_date, control_status (''=auto|green|amber|red|blue),
                risk_level (''=auto|low|medium|high), important_contacts,
                is_system (1 = the "📥 Unassigned" inbox bucket client)

projects        id, client_id, name, status, notes, sort_order, archived
                (LEGACY — table still exists but UI uses client_id on tasks directly)

tasks           id, client_id, project_id (legacy), title, assignee, secondary_assignee,
                deadline, planned_date, completed_at, estimated_hours,
                -- CANONICAL (Client Control Board):
                task_status (inbox|scheduled|in-progress|waiting-on-client|
                  waiting-on-me|done|cancelled),
                task_band (today|this-week|scheduled|waiting|someday),
                task_type (recurring|ad-hoc|urgent|sales|admin|waiting|idea),
                suggested_block,
                -- LEGACY SHADOW (kept in sync, do not surface in UI):
                progress (CHECK: not-started|in-progress|completed|stuck|
                  awaiting-client|awaiting-manager|ready-to-invoice|invoiced),
                priority (CHECK: critical|high|medium|low),
                references_text, notes, is_recurring, recur_interval, recur_unit,
                is_pinned, sort_order, archived, created_at

comments, task_attachments, checklist_items, team_members, pinned_items, activity_log,
gmail_tokens, xero_tokens, whatsapp_config, whatsapp_messages, analytics_config, app_meta,
notifications

-- The intake robot + monthly reports (Nov 2026). No foreign keys anywhere here — nothing cascades.
clients (+)       last_touch_summary, last_touch_at   the robot's one-line "latest" per client
                  pulse_link, metricool_blog_id, report_email   monthly report settings (owner-only)
suggestions       kind (new_task|complete|update), status (pending|accepted|dismissed|expired),
                  client_id, task_id, title, notes, deadline, new_status, confidence, evidence,
                  source, source_label, source_url, source_ref, contact, run_id, decided_*, result_task_id
intake_runs       one row per robot run: trigger_type, status, items, suggestions, tokens, detail JSON
intake_seen       (source, ref) of every message already read — never sent to Claude twice
intake_mailboxes  extra read-only Gmail accounts for the robot (OAuth tokens)
intake_captures   text sent to the capture link / pasted in the Inbox, until processed
contact_map       email/phone/chat id → client, learned when a suggestion is accepted
client_reports    client_id, period (YYYY-MM), content JSON {facts, draft}, sent_at, sent_to
app_meta keys     intake_enabled, intake_cursor_*, intake_last_*, capture_token, and the write-only
                  keys periskope_api_key / periskope_phone / granola_api_key / metricool_token /
                  metricool_user_id (env vars of the same name in caps win)
```

Tasks display as `NB###` (zero-padded id). Search supports `NB123` lookups.

### Task status/priority — CANONICAL vs SHADOW (critical to understand)

`tasks.progress` and `tasks.priority` have **locked SQLite CHECK constraints** that cannot be
altered without table recreation (forbidden — caused past data loss). So the Client Control Board
introduced **new columns** `task_status` / `task_band` / `task_type` as the **canonical** fields used
everywhere in the UI. `progress` / `priority` are kept as **synced shadow values** so legacy logic
(Excel export, recurring auto-create, completed_at, anything querying progress) keeps working.

- The mapping lives in **`lib/taskmap.js`** (`statusToProgress`, `bandToPriority`, reverse maps, validators).
- `routes/tasks.js` + `routes/ai.js` reconcile both directions on every write — whichever field a
  caller sends, both columns stay consistent. **When adding task writes, always set the canonical
  field and let the shadow follow (or call the taskmap helper).**
- "done" + "cancelled" both shadow to `progress='completed'`, so `progress NOT IN ('completed','invoiced')`
  still correctly means "open". `completed_at` and recurring auto-create fire on `task_status='done'`.
- Frontend `app.js` mirrors this via the `TASK_STATUS` / `TASK_BAND` / `TASK_TYPE` / `CONTROL_STATUS` /
  `RISK` config objects + `statusLabel`/`bandLabel`/`statusOptions`/`isOpenTask` helpers.
- Clientless quick-captures (Inbox) land on the system **"📥 Unassigned"** client (`is_system=1`),
  which is excluded from the Control Board and Excel export.

### Privacy model

- Clients can be `is_private = 1` — only `role = 'owner'` sees them.
- Every list/read endpoint that returns clients/projects/tasks must add `AND c.is_private = 0` for non-owners. Pattern is everywhere; copy it.
- Owners get full access; editors can write but not delete; viewers are read-only.
- Staff (non-owners) only get tasks assigned to them (primary or secondary) — enforced in `GET /api/clients`.
- Owner-only: client money, the robot (suggestions, settings, `last_touch_summary`), monthly reports and
  report settings — `routes/clients.js#hideOwnerFields` strips them for staff.

## Existing features (post-Apr 2026)

- **Client Control Board (landing page):** The Dashboard is now the Control Board — greeting + global
  stat strip, RAG client cards (auto status green/amber/red/blue + risk, manual override wins), filter/
  sort, and a client detail modal. Auto-RAG logic lives in `routes/clients.js#computeControl`
  (Red = overdue/urgent/past-deadline-on-us; Amber = no schedule/due-soon/stale-contact; Blue = all
  waiting on client). Integrations (email/Xero/WhatsApp/activity) are preserved in a collapsible
  "Workspace" strip below — see the REVERT NOTE in `index.html`.
- **Task Inbox:** Fast quick-capture (defaults `task_status='inbox'`, client optional) + triage list.
- **Weekly Planning:** Overdue / Today / This Week / Waiting / retainers-with-no-scheduled-work /
  high-risk clients / sales / admin — computed client-side.
- **Tasks (flat list):** the former flat home, now driven by task_status/task_band/task_type.
- **Today view:** All tasks for a date, grouped by assignee.
- **Calendar view:** Monthly grid, per-person filter.
- **Focus view:** Working Now / Up Next / Blocked / Needs Your Sign-off (when manager).
- **My Tasks (flat view):** When user clicks "My Tasks", a flat sorted list across all clients with small client logos, ordered by deadline then priority. Has a bulk-reschedule bar for shifting overdue tasks forward.
- **Workload summary cards:** Today / Tomorrow / This Week / Next Week / Overdue / Done Today — all clickable, opens detail modal with date picker.
- **Inline editing:** Deadline, planned date, estimated hours editable directly in task rows (transparent border, appears on hover).
- **Multi-assignee:** Tasks have `assignee` + `secondary_assignee`. Setting status to `awaiting-manager` auto-tags the owner as secondary.
- **Recurring tasks:** Auto-create next occurrence on completion.
- **Activity log:** Cascade-proof audit trail. Owner-only Global History view.
- **Hourly + pre-migration backups + restore-from-backup.**
- **Excel export:** `/api/export/excel` — Tasks + Clients sheets; Tasks excludes done/cancelled and the
  system Unassigned client; Clients sheet includes monthly value, RAG status, risk, next/last dates.
- **The Bear (AI assistant):** Floating chat panel in bottom-right. Tools: list_clients, list_team_members, create_task, update_task, search_tasks, get_workload_summary, list_tasks_for_user. create/update speak the new status/band/type vocabulary (mapped to shadows). All actions log activity with "(via AI assistant)". Hidden when `ANTHROPIC_API_KEY` unset.
- **Integrations:** Gmail (`routes/gmail.js`), Xero (`routes/xero.js`), WhatsApp Cloud API
  (`routes/whatsapp.js`) — env-gated; surfaced in the dashboard Workspace strip.
- **The intake robot (Nov 2026, owner-only):** Mon–Fri 08:00–18:00 UK, hourly, it reads new messages from
  the owner's work Gmail (inbox + sent), extra read-only Gmail accounts, WhatsApp Business
  (`whatsapp_messages`), personal WhatsApp via the Periskope API, Granola meeting notes, and anything sent to
  the no-login capture link (`/capture/<token>` — phone home-screen page / Shortcut / pasted AI answers).
  Claude proposes new tasks, "looks done" tick-offs and status changes, each with a quoted line of evidence;
  they wait in the **Suggested tray at the top of the Inbox** (✨ count beside the Inbox badge) — nothing
  touches the task list until accepted. Validation in `lib/intake.js#applyFindings`: ids checked against the DB,
  near-duplicates of open/pending/rejected titles dropped (`sameJob`), message text fenced as untrusted, source
  label/link copied from the message not the model. Accepting goes through `createTaskCore`/`updateTaskCore`
  in `routes/tasks.js` (same path as manual edits). Settings: ☰ → Robot & sources.
- **Whiteboard view (Nov 2026):** one zone per client — status colour, last spoke, the robot's latest line, its
  suggestions with yes/no, To do (tick / +1 day), Waiting on them, Done this month, quick add. Quiet clients
  collapse to one row. Same tasks and code paths as the Notebook (`nbTick`, `nbPush1`).
- **Monthly client report (Nov 2026, owner-only):** client detail → 📊 Monthly report. Gathers jobs ticked off
  that month + Pulse website figures (client's dashboard link → `/api/client/<token>/data?range=30`, a rolling
  30 days to yesterday, so draft early in the following month) + Metricool posts per network (brand id), Claude
  words it, owner edits, PDF preview, email from the owner's Gmail with the PDF attached.

## Conventions

- **Tone:** The user is busy and direct. Be concise. Don't add features they didn't ask for. Don't refactor proactively.
- **No premature abstractions.** Three similar lines beats a clever helper.
- **No new files** unless necessary. Prefer extending existing routes/modules.
- **No destructive shell ops** (`rm -rf`, `git reset --hard`, `--force`, `--no-verify`) without explicit ask.
- **CSS variables:** `--primary` is `#3eaf84` (NBM green). Use existing variables, don't hardcode colors.
- **Cache busting:** `app.js` and `styles.css` are loaded with `?v=N` query params in `index.html`. Bump the version when changing them so users don't see stale cached assets.
- **Activity logging:** Every meaningful mutation calls `logActivity(entityType, entityId, action, displayName, detail)`. The author always comes from `req.user.display_name`, never the request body.
- **Privacy filter:** Every SQL query that lists clients/tasks must respect `is_private` for non-owners. The pattern is `const priv = isOwner ? '' : 'AND c.is_private = 0';`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server port (Railway sets this automatically) |
| `RAILWAY_VOLUME_MOUNT_PATH` | Yes | — | Persistent volume mount, usually `/data` |
| `NODE_ENV` | Recommended | — | Set to `production` for secure cookies + HSTS |
| `SEED_ADMIN` | First deploy only | — | `1` to create default admin |
| `ANTHROPIC_API_KEY` | No | — | Enables The Bear, the intake robot and the report writer |
| `CLAUDE_MODEL` | No | `claude-opus-5-5` | Model for all three; falls back to `claude-opus-4-6` if rejected |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | No | — | Google OAuth app for Gmail (email tab, robot, sending reports) |
| `PERISKOPE_API_KEY` / `PERISKOPE_PHONE` | No | — | Personal WhatsApp for the robot (can be set in the UI instead) |
| `GRANOLA_API_KEY` | No | — | Granola meeting notes for the robot (or set in the UI) |
| `METRICOOL_TOKEN` / `METRICOOL_USER_ID` | No | — | Social figures for monthly reports (or set in the UI) |

## Testing notes

- In the cloud sandbox, never write to `nbm-projects.db` from a second process while the server is running:
  the WAL index isn't shared reliably between processes there and the server's later writes can vanish.
  Stop the server first, or point scripts at a copy with `DB_PATH=/path/to/copy.db`. (Production is one process.)
- The robot and report writer take an injected client (`runIntake({ claude, sources })`,
  `draftReport(id, period, { claude })`) so they can be tested without network or an API key.
  `METRICOOL_API_BASE` overrides the Metricool host for tests only.

## How to run locally

```bash
cd project-management
npm install
ANTHROPIC_API_KEY=sk-ant-xxx npm run dev   # --watch mode
# open http://localhost:3001
# default admin: norton@northbearmedia.co.uk / Nbm2026!
```

## Deferred / parked ideas (mentioned but not built)

- Status changes were reverted: the user once asked to remove `invoiced`/`ready-to-invoice` and add `planned`/`finalising` — pending.
- Focus view improvements (sorting, rank numbers, hours display, drag-and-drop reorder) — pending.
- Streaming for The Bear (SSE) — could be added if latency feels bad.
- Calendar / Gmail integration — MCP tools are sometimes available in this harness, but the live app has none.

## When picking up work

1. **Read this file.**
2. Check `git status` and `git log -10 --oneline` to see the latest state.
3. Confirm you're on `claude/project-management-system-5iByI`.
4. For DB changes: write the migration as `ALTER TABLE ADD COLUMN` only; verify the pre-migration backup logic still runs.
5. For UI changes: bump the `?v=N` cache buster on `app.js` / `styles.css`.
6. Commit with a clear "why", push to the same branch. Do not open PRs unless asked.
