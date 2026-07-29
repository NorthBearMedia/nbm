# Adding an event to williscooper.com/events

All events live in one file: **`sites/williscooper/events.json`**. Add an entry,
run one command, deploy. You never mark an event as finished — it greys itself
out the day after it happens.

## 1. Add the event

Open `events.json` and add an object to the `events` list:

```json
{
  "id": "payroll-clinic-2026-10",
  "title": "Year-end payroll clinic",
  "type": "Drop-in clinic",
  "accent": "rose",
  "date": "2026-10-08",
  "timeLabel": "9am – 4pm, drop in any time",
  "startTime": "09:00",
  "location": "Willis Cooper, Unit 6, Heritage Business Centre, Derby Rd, Belper, DE56 1SW",
  "cost": "Free to attend",
  "description": "One or two sentences on what the session covers.",
  "ctaLabel": "Book a place",
  "ctaUrl": "/contact-us",
  "pastNote": "This clinic has now taken place — get in touch to hear about the next one.",
  "pastCtaLabel": "Ask about the next one"
}
```

| Field | Needed? | Notes |
|---|---|---|
| `title`, `type`, `date` | **yes** | `date` must be `YYYY-MM-DD`. `type` is free text and becomes a filter button. |
| `accent` | no | Colour stripe: `teal`, `blue`, `plum`, `gold` or `rose`. Defaults to blue. |
| `endDate` | no | For multi-day events. The event greys out after this date. |
| `precision` | no | Set to `"month"` when only the month is known. Use the 1st of that month as `date`; it prints as "September 2026" and stays upcoming until the month is over. |
| `dateNote` | no | Small italic note after the date, e.g. `"date to be confirmed"`. |
| `logo` | no | Path to a logo shown on the card, e.g. `"assets/images/xero-logo.png"`. Pair with `logoAlt` for the alt text. |
| `timeLabel` | no | Shown as-is, e.g. `10am – 12pm`, or `Time to be confirmed`. |
| `startTime` | no | 24-hour `HH:MM`, used for Google's event listings. |
| `location`, `cost`, `description` | no | Omit any and that line disappears. |
| `ctaLabel` / `ctaUrl` | no | Button text and destination. Default: "Register your interest" → /contact-us. |
| `pastNote` / `pastCtaLabel` | no | Swapped in once the event has passed. |
| `id` | no | Lets you link straight to a card: `/events#event-payroll-clinic-2026-10`. |

## 2. Rebuild the page

```bash
node sites/williscooper/build-events.mjs
```

It prints every event with its status so you can check before deploying. It
also refuses to build on a bad date or an unknown accent colour, rather than
producing a broken page.

## 3. Deploy

Build and deploy as normal (`make-staging.mjs --production`, then upload).

## Handling events that are not fully confirmed

Everything can be filled in later — put in what you know:

- **Month known, day not:** `"date": "2026-09-01"`, `"precision": "month"`,
  `"dateNote": "date to be confirmed"`. It shows as *September 2026, date to
  be confirmed* and stays in Upcoming until September is over.
- **Time not settled:** `"timeLabel": "Time to be confirmed"`.
- **Anything else unknown:** leave the field out and that line simply does not
  appear on the card.

## How it behaves

- **Two sections:** Upcoming events and Past events, each with its own heading
  and a count. An event moves from one to the other on its own.
- **Order:** upcoming events soonest first; past events most recent first.
- **Greying out:** a past event moves into Past events, turns grey, its date
  is struck through, any logo desaturates, the
  badge changes to "Completed", and the button becomes "Ask about the next
  one". This is re-checked in the visitor's browser on every visit, so an event
  greys itself the morning after **without a redeploy**.
- **Filter and sort controls** appear automatically once there are two or more
  events, with a filter button per event type.
- **With JavaScript off** the cards still render, in the right order, with past
  ones already greyed — the greying is baked in at build time as well.
- **Empty diary:** when nothing is upcoming, a note invites people to get in
  touch. It disappears on its own as soon as you add a future event.

## Previewing locally before you deploy

```bash
node sites/williscooper/build-events.mjs events.sample.json --out events-demo.html
```

Then serve the folder and open the demo page in a browser:

```bash
python3 -m http.server 8778 -d sites/williscooper
```

`events.sample.json` holds six invented events covering every colour and a mix
of past and upcoming, so you can see the filters, sorting and greying working.
Pages built from it show a "Demo data" banner, and `events.json`,
`events.sample.json`, `build-events.mjs` and `events-demo.html` are all
excluded from `make-staging.mjs` builds, so none of them can reach the live
site.
