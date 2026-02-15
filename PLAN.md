# AI Facebook Moderation System — Plan

## Overview

Automate the workflow for "Spotted" community Facebook pages:
1. **Receive** messages submitted by community members
2. **Filter/Moderate** content using AI (approve, reject, flag for review)
3. **Post** approved messages to the Facebook page

---

## Architecture

```
[Facebook Page Inbox / Webhooks]
        |
        v
[Node.js Server (Express)]
        |
        v
[AI Moderation Layer (Claude API)]
        |
    Approve / Reject / Flag
        |
        v
[Post to Facebook via Graph API]  or  [Queue for manual review]
```

---

## Components

### 1. Facebook Integration (Graph API)

- **Read incoming messages**: Use Facebook Graph API to fetch messages/conversations from page inbox
- **Post approved content**: Publish approved messages as page posts
- **Webhook listener**: Receive real-time notifications when new messages arrive
- **Required**: Facebook App, Page Access Token with `pages_messaging`, `pages_manage_posts` permissions

### 2. AI Moderation Engine (Claude API)

The AI reviews each submission and decides:
- **APPROVE** — Post it to the page
- **REJECT** — Block (spam, inappropriate, etc.)
- **FLAG** — Needs human review (borderline cases)

Moderation criteria (configurable per page):
- No hate speech, harassment, or threats
- No personal information (phone numbers, addresses)
- No spam or advertising
- No illegal content
- Follows the specific "Spotted" page rules
- Content relevance check

### 3. Web Dashboard (optional, phase 2)

- View pending/approved/rejected messages
- Override AI decisions
- Configure moderation rules per page
- Analytics (volume, approval rate, etc.)

### 4. Database

- Store messages and their moderation status
- Store page configurations and rules
- Audit trail of AI decisions

---

## Tech Stack

| Component          | Technology                     |
|--------------------|--------------------------------|
| Runtime            | Node.js (v20+)                 |
| Framework          | Express.js                     |
| AI                 | Anthropic Claude API           |
| Facebook           | Facebook Graph API v21.0       |
| Database           | SQLite (simple) or PostgreSQL  |
| Queue              | Bull (Redis) or simple in-memory |
| Config             | dotenv                         |

---

## Implementation Phases

### Phase 1 — Core Pipeline (MVP)

1. **Project setup** — Node.js project, dependencies, config
2. **Facebook API client** — Authenticate, fetch messages, post to page
3. **AI moderation module** — Send message to Claude, parse decision
4. **Polling service** — Periodically check for new messages
5. **Auto-post service** — Post approved messages to the page
6. **Basic logging** — Console + file logging of all decisions

### Phase 2 — Production Hardening

7. **Webhook support** — Replace polling with real-time webhooks
8. **Multi-page support** — Handle multiple Spotted pages from one instance
9. **SQLite database** — Persist messages, decisions, audit trail
10. **Rate limiting** — Respect Facebook API limits
11. **Error handling & retries** — Robust failure recovery

### Phase 3 — Dashboard & Management

12. **Web dashboard** — View and override moderation decisions
13. **Per-page rules config** — Customise moderation rules per page
14. **Analytics** — Approval rates, volume trends, common rejections

---

## Facebook Setup Required

1. Create a **Facebook App** at https://developers.facebook.com
2. Add the **Facebook Login** and **Messenger** products
3. Generate a **Page Access Token** (long-lived) for each Spotted page
4. Required permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_messaging`
   - `pages_read_user_content`
5. For webhooks: set up a callback URL (needs public HTTPS endpoint)

---

## AI Moderation Prompt Strategy

Each incoming message will be evaluated with a structured prompt:

```
You are a content moderator for a local community "Spotted" page on Facebook.
People submit anonymous messages about things they've spotted in the local area.

Rules:
- APPROVE: Lighthearted, funny, community-relevant sightings
- REJECT: Hate speech, personal info, spam, threats, illegal content
- FLAG: Borderline — could go either way, needs human review

Respond with JSON:
{
  "decision": "APPROVE" | "REJECT" | "FLAG",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}
```

---

## File Structure (Planned)

```
nbm/
├── src/
│   ├── index.js              # Entry point
│   ├── config.js             # Configuration loader
│   ├── facebook/
│   │   ├── client.js         # Facebook Graph API client
│   │   ├── webhook.js        # Webhook handler
│   │   └── poster.js         # Post approved messages
│   ├── moderation/
│   │   ├── moderator.js      # AI moderation logic
│   │   └── rules.js          # Configurable rules per page
│   ├── services/
│   │   ├── poller.js         # Polling service for new messages
│   │   └── processor.js      # Message processing pipeline
│   └── db/
│       ├── database.js       # Database connection
│       └── schema.sql        # Database schema
├── .env.example              # Environment variable template
├── package.json
├── PLAN.md                   # This file
└── README.md
```

---

## Environment Variables Needed

```
# Facebook
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
FACEBOOK_VERIFY_TOKEN=

# Anthropic
ANTHROPIC_API_KEY=

# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=./data/moderation.db
```

---

## Key Decisions to Make

1. **Polling vs Webhooks** — Polling is simpler to start; webhooks need a public URL
2. **Auto-post vs queue** — Should approved messages post immediately, or queue for batch posting?
3. **Multiple pages** — How many Spotted pages need support from day one?
4. **Hosting** — Where will this run? (VPS, cloud function, local machine?)
5. **Message format** — Do submissions follow a template, or are they freeform?
