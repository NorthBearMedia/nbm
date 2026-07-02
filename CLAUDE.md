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
│   ├── routes/
│   │   ├── auth.js            Login / logout / session
│   │   ├── clients.js         Client CRUD + logo + history
│   │   ├── projects.js        Project CRUD (legacy — projects layer removed from UI)
│   │   ├── tasks.js           Task CRUD, attachments, comments, calendar, search,
│   │   │                       /summary, /workload-detail, /:id/duplicate, by-date
│   │   ├── users.js           User mgmt, avatars, passwords
│   │   ├── system.js          Health, global history, team, archived, Excel export,
│   │   │                       backups (list/create/download/restore)
│   │   └── ai.js              The Bear — Claude Opus 4.6 + tool-use loop
│   ├── public/
│   │   ├── index.html         Entire UI in one file (all modals)
│   │   ├── app.js             ~2100 lines, all client logic, vanilla JS
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
- **AI:** `@anthropic-ai/sdk` — model `claude-opus-4-6`, adaptive thinking, manual tool-use loop
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
gmail_tokens, xero_tokens, whatsapp_config, whatsapp_messages, analytics_config, app_meta
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
| `ANTHROPIC_API_KEY` | No | — | Enables The Bear AI assistant |

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
