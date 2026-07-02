# North Bear Console

Internal project management system for North Bear Media. Built with Express + SQLite + vanilla JS.

## Quick Start (Local Dev)

```bash
cd project-management
npm install
npm run dev          # starts with --watch
```

Open `http://localhost:3001`. Default admin: `norton@northbearmedia.co.uk` / `Nbm2026!`

## Architecture

```
server.js          Entry point — middleware setup, route mounting, backups
database.js        SQLite schema + migrations
middleware.js      Auth, security headers, rate limiting, file upload configs
lib/activity.js    Activity logging helper
routes/
  auth.js          Login, logout, session management
  clients.js       Client CRUD + logo upload + history
  projects.js      Project CRUD
  tasks.js         Task CRUD, attachments, comments, calendar, search
  users.js         User management, avatars, passwords
  system.js        Health check, global history, team, backups, archived
```

## Railway Deployment

### Required Setup

1. **Volume**: Mount a persistent volume at `/data` — this is where the database, uploads, and backups are stored.
   - In Railway: Service → Settings → Volumes → Add volume with mount path `/data`

2. **Environment Variables**:

   | Variable | Required | Default | Description |
   |----------|----------|---------|-------------|
   | `PORT` | No | `3001` | Server port (Railway sets this automatically) |
   | `RAILWAY_VOLUME_MOUNT_PATH` | Yes | — | Set to `/data` (path where you mounted the volume) |
   | `NODE_ENV` | Recommended | — | Set to `production` for secure cookies + HSTS |
   | `SEED_ADMIN` | First deploy only | — | Set to `1` to create the default admin user |
   | `ANTHROPIC_API_KEY` | No | — | Enables the in-app Claude assistant. Get one from https://console.anthropic.com/settings/keys |

3. **Root Directory**: Set to `project-management` in Railway service settings.

### First Deploy

1. Push to branch, Railway auto-deploys
2. Set `SEED_ADMIN=1` for the first deploy to create the admin user
3. Log in and change the default password immediately
4. Remove `SEED_ADMIN` env var after first login

### Health Check

`GET /api/health` returns `{"status":"ok"}` when the server and database are healthy.

## Security

- Passwords hashed with scrypt (Node.js crypto, per-user salts)
- 24-hour session expiry with httpOnly cookies
- Rate limiting: 10 login attempts per 15 minutes per IP
- Security headers: X-Content-Type-Options, X-Frame-Options, HSTS, etc.
- All audit trail entries derived from server-side session (not client-supplied)
- File uploads validated by MIME type
- Owner role required for destructive operations (delete)

## Data Model

- **Clients** → **Projects** → **Tasks** (cascading deletes)
- Tasks have: assignee, deadline, planned date, estimated hours, priority, progress status, recurring support
- Comments and attachments on tasks
- Activity log tracks all changes with server-derived author identity
- Users have roles: `owner` (full access), `editor` (create/edit), `viewer` (read-only)
