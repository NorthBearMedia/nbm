# AI Facebook Moderation System — Plan

## Overview

Automate the workflow for "Spotted" community Facebook pages:
1. **Receive** DMs submitted by community members
2. **Filter/Moderate** content using AI (approve, reject, flag for review)
3. **Auto-post** approved messages to the Facebook page

---

## Decisions Made

- **Input method:** DMs (Messenger) only
- **Pages:** Single page to start, expandable later
- **Posting:** Fully automatic — approved messages post immediately
- **Hosting:** Railway.app (recommended — simple, cheap, auto-deploys from GitHub)

---

## Architecture

```
[People DM the Spotted page]
        |
        v
[Node.js Server polls Facebook inbox every 60s]
        |
        v
[Claude AI evaluates each message]
        |
    APPROVE / REJECT / FLAG
        |
        v
APPROVE → Auto-post to page + notify sender
REJECT  → Notify sender with reason
FLAG    → Saved for manual review
```

---

## How It Works

1. The server polls the Facebook page inbox every 60 seconds for new DMs
2. Each new message is sent to Claude for moderation
3. Claude returns a decision (APPROVE/REJECT/FLAG) with a confidence score
4. If APPROVE with high confidence → automatically posted to the page
5. If REJECT with high confidence → sender is notified
6. If FLAG or low confidence → saved to database for you to review manually
7. All decisions are logged in a SQLite database for audit trail

---

## Status API Endpoints

The server exposes simple endpoints to check on things:

- `GET /` — Is the service running?
- `GET /stats` — How many approved/rejected/flagged
- `GET /messages` — Recent messages and their decisions
- `GET /flagged` — Messages that need your manual review

---

## File Structure

```
nbm/
├── src/
│   ├── index.js              # Entry point — starts server + polling
│   ├── config.js             # Loads environment variables
│   ├── facebook/
│   │   ├── client.js         # Facebook Graph API (read DMs, post)
│   │   └── poster.js         # Post approved messages, notify senders
│   ├── moderation/
│   │   └── moderator.js      # Claude AI moderation logic
│   ├── services/
│   │   ├── poller.js         # Polling loop (check inbox every 60s)
│   │   └── processor.js      # Pipeline: fetch → moderate → post
│   └── db/
│       └── database.js       # SQLite database for message history
├── .env.example              # Environment variable template
├── .gitignore
├── package.json
└── PLAN.md
```

---

## Setup Instructions

### 1. Facebook App Setup

1. Go to https://developers.facebook.com and create a new App
2. Choose "Business" type
3. Add the "Facebook Login" product
4. Go to your App Settings > Basic to get your App ID and Secret
5. Use the Graph API Explorer to generate a Page Access Token:
   - Select your app
   - Select your Spotted page
   - Add permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_messaging`, `pages_read_user_content`
   - Generate token
6. Convert to a long-lived token (short-lived tokens expire in ~1 hour)
7. Find your Page ID: go to your page → About → scroll down to see the Page ID

### 2. Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an account and add billing
3. Go to API Keys and create a new key

### 3. Environment Setup

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4. Install & Run

```bash
npm install
npm start
```

### 5. Deploy to Railway (recommended)

1. Push this repo to GitHub
2. Go to https://railway.app and sign in with GitHub
3. Click "New Project" → "Deploy from GitHub Repo"
4. Select this repository
5. Add your environment variables in Railway's dashboard
6. Railway auto-deploys on every push

---

## Future Enhancements (Phase 2+)

- **Webhooks** — Replace polling with real-time message notifications
- **Multi-page support** — Run multiple Spotted pages from one instance
- **Web dashboard** — Visual interface to review flagged messages
- **Custom rules per page** — Different moderation criteria for different pages
- **Analytics** — Approval rates, volume trends, peak times
