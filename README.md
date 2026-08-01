# Jarvis — MayDay & Co.

A personal AI assistant for MayDay & Co. Text it or talk to it, and it answers
grounded in your actual operating plan — pricing, routines, the $10k ramp,
guardrails — instead of generic dog-business advice. Runs your report cards
and calendar too, wired into the mayday-hub WordPress plugin.

Stack: Next.js (App Router) + Supabase (Postgres) + Anthropic (Claude,
tool-use). Ships as an installable PWA with push-to-talk voice using the
browser's built-in speech APIs, so there's no extra voice service to pay for.

## What's here

- `app/api/chat/route.ts` — chat API. Runs Claude with tool-use in a loop
  until it stops calling tools, then returns the final reply.
- `lib/chatEngine.ts` — the shared turn logic (system prompt + history +
  tool loop + current date/time injection). Used by the web chat route and
  the Twilio SMS route.
- `lib/tools.ts` — the tools Claude can call: `get_business_context`,
  `log_revenue`, `pace_check`, `daily_task`, `weekly_review`,
  `monthly_close`, `submit_report_card`, `schedule_reminder`,
  `google_calendar_read`, `wordpress_bookings_read`.
- `lib/planData.ts` — the ramped monthly targets, plan phases, and check-in
  questions, as structured data the tools compute against.
- `lib/reportCardFields.ts` — the exact field vocabulary the WordPress report
  card system understands, mirrored from the plugin. Claude is instructed to
  use only these values and never invent one.
- `lib/googleCalendar.ts` — Google Calendar read/write via a personal OAuth
  refresh token.
- `lib/sms.ts` — outbound SMS via Twilio's REST API.
- `lib/timezone.ts` — converts local (America/Denver) date/times to UTC
  correctly (DST-aware), and injects "right now" into the system prompt so
  Claude never has to guess the date.
- `lib/auth.ts` — the password-gate cookie logic.
- `content/business-context.md` — the full operating plan in prose. This is
  what actually grounds Jarvis. **Edit this file when your plan changes.**
- `components/ChatUI.tsx` — the PWA chat UI: password lock screen, text
  input, push-to-talk mic button, spoken replies, and history that survives
  page reloads.
- `app/api/twilio/sms/route.ts` — inbound-SMS webhook, off by default
  (`TWILIO_ENABLED=false`).
- `app/api/webhooks/booking/route.ts` — receives booking-confirmed events
  from the WordPress plugin and creates the Google Calendar event.
- `app/api/cron/reminders/route.ts` — polled by GitHub Actions every 5
  minutes; sends any due reminders as texts.
- `supabase/schema.sql` — `business_context`, `conversations`,
  `transactions`, `check_ins`, `reminders`.
- `.github/workflows/reminders.yml` — the free 5-minute reminder poller.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). In the SQL
editor, run the contents of `supabase/schema.sql` once (safe to re-run later
if you pull an update — everything's `if not exists`).

Grab your `SUPABASE_URL` and `service_role` key from **Project Settings →
API**.

### 3. Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com).

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in at minimum:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_PASSWORD` — defaults to `mayday` if you leave it out, but set it
  explicitly once you're live.

Everything else is optional and the app runs fine without it — Twilio,
report cards, Google Calendar, and reminders are all inert until configured
(each tool tells you plainly it's "not set up" instead of pretending to work).

### 5. Seed your business context into Supabase

```bash
npm run seed:context
```

This pushes `content/business-context.md` into the `business_context` table
as a new version. (If you skip this, the chat route falls back to reading
the markdown file straight off disk — the app still works, seeding just
versions it properly.)

### 6. Run it

```bash
npm run dev
```

Open http://localhost:3000 — you'll hit the password screen first
(`mayday` unless you changed `APP_PASSWORD`).

## Installing the PWA on your phone

1. Deploy the app somewhere with HTTPS (Vercel is the path of least
   resistance for a Next.js app — connect the GitHub repo at vercel.com and
   add your env vars there), or use a tunnel like `ngrok` to test on your
   phone against local dev.
2. On iPhone: open the site in Safari → Share → **Add to Home Screen**.
3. On Android: open the site in Chrome → menu (⋮) → **Install app** (or
   **Add to Home Screen**).
4. Launch it from the home screen icon — it opens full-screen, no browser
   chrome. It'll ask for the password once and remember you for 30 days.

Note: `public/icon.svg` is a placeholder icon. Swap in real PNG icons
(192x192 and 512x512 at minimum) and update `public/manifest.json` if you
want a polished home-screen icon.

## Using voice

Press and hold the 🎤 button to talk (push-to-talk — release to send what it
heard). Toggle **Speak replies** in the header for spoken answers. Both use
the free Web Speech API — zero extra cost, and no audio leaves your device
except as the text transcript sent to `/api/chat`.

If push-to-talk doesn't seem to work on a given phone/browser: Safari on
iPhone doesn't support the Web Speech API's speech recognition at all (the
mic button won't show), and if the mic button shows but errors immediately,
it'll now say why in the chat (e.g. mic permission blocked) instead of
silently failing.

## Security — what's actually protecting your keys

- **API keys never touch the browser.** `ANTHROPIC_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, Twilio credentials, Google OAuth secrets —
  all of it only exists in server-side code (API routes) and your
  deployment platform's encrypted environment variables. The client bundle
  never references them, so there's nothing to find by inspecting the app.
- **Nothing is committed to git.** `.env.local` is gitignored; only
  `.env.example` (blank placeholders) is in the repo.
- **The PWA itself is password-gated** (`APP_PASSWORD`, default `mayday`):
  a server-side httpOnly cookie, checked on every `/api/chat` and
  `/api/conversations` request — not just a client-side curtain someone
  could bypass by viewing page source.
- **Every webhook/integration endpoint requires its own shared secret**,
  compared with a timing-safe check: the WordPress report-card endpoint
  (Bearer token), the booking-confirmed webhook (`X-Jarvis-Secret`), and
  the reminders cron endpoint (`X-Cron-Secret`). None of them are open.
- **The WordPress plugin doesn't hardcode anything either** — its secrets
  live in the WP options table (set from the admin UI), not in the PHP
  source, so the plugin zip itself is safe to hand around.

Known limitation: `/api/auth` (the password check) has no rate-limiting, so
it's a casual lock (like a phone passcode), not a defense against a
determined brute-force attempt. Fine for "someone picks up my phone,"
not fine for "someone is actively trying to break in." Say the word if you
want that hardened later.

## Report cards by voice

Say (or type) something like: *"Report card for Millie, it was a walk, she
had a great appetite, normal potty, super social at the park, no reactivity."*
Jarvis maps what you said onto the WordPress report card system's actual
fields and writes it — same as the staff wizard, showing up on Millie's
profile page immediately. Anything you didn't clearly say is left blank
(never guessed), and a plain-language summary always gets saved to notes too
so nothing you said is lost even if it didn't map to a specific field.

**Setup (one-time, in WordPress):**

1. Install the updated `mayday-hub` plugin (see the zip that came with this).
2. Go to **MayDay Co. → Jarvis Integration** in WP admin.
3. Copy the **Endpoint URL** and **Shared secret** shown there into your env
   as `WORDPRESS_API_URL` (just the site root, e.g. `https://maydayco.dog`)
   and `WORDPRESS_API_KEY`.

## Calendar sync when a booking comes in

When a booking is confirmed on the site, the plugin now POSTs it straight to
Jarvis, which creates the Google Calendar event at the right date/time —
no waiting on Google's slow ICS-subscription refresh cycle.

**Setup (one-time):**

1. **Google Cloud, ~5 minutes:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com),
     create a project (or use an existing one).
   - **APIs & Services → Library** → enable **Google Calendar API**.
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
     Application type: **Desktop app**. Note the Client ID and Client Secret.
   - **OAuth consent screen**: set it to **External**, add yourself as a
     test user (this is fine for personal use — you don't need Google's
     review process for a single-user tool).
2. **Get a refresh token, ~2 minutes:** go to
   [Google's OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
   - Click the gear icon (top right) → check **"Use your own OAuth
     credentials"** → paste your Client ID and Client Secret.
   - In the left panel, find **Google Calendar API v3** → select the scope
     `https://www.googleapis.com/auth/calendar`.
   - Click **Authorize APIs**, sign in with the Google account whose
     calendar you want to use, allow access.
   - Click **Exchange authorization code for tokens** → copy the
     **Refresh token** shown.
3. Set in your env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN` (from steps above), and optionally
   `GOOGLE_CALENDAR_ID` if you don't want your primary calendar (defaults to
   `primary`).
4. Generate any random string for `JARVIS_CALENDAR_WEBHOOK_SECRET` in your
   env (e.g. run `openssl rand -hex 24`).
5. In WP admin → **MayDay Co. → Jarvis Integration → Calendar sync**, paste
   your Jarvis URL + `/api/webhooks/booking` as the webhook URL, and the
   same secret from step 4.

A refresh token doesn't expire from normal use, so this is genuinely
one-time. You already had a zero-setup fallback too: the plugin's ICS feed
(**MayDay Bookings → Settings**) still works if you just want a quick
read-only calendar subscription without any of this.

## Text reminders

Text Jarvis (or tell it in the PWA) something like *"don't let me forget to
give Millie's meds at 6pm"* — it'll text you back at 6pm America/Denver
time. This needs a real Twilio account (small recurring cost, roughly
$1-2/month for the number plus fractions of a cent per message) since actual
SMS isn't free.

**Setup:**

1. Create a [Twilio](https://twilio.com) account, buy a phone number.
2. Set `TWILIO_ENABLED=true`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER` in env.
3. Set `OWNER_PHONE_NUMBER` to your own number (E.164 format, e.g.
   `+17205551234`) — this is where reminders get sent.
4. Generate a random string for `CRON_SECRET` (e.g. `openssl rand -hex 24`).
5. In your GitHub repo → **Settings → Secrets and variables → Actions**, add
   two repo secrets: `CRON_SECRET` (same value as step 4) and
   `JARVIS_APP_URL` (your deployed URL, no trailing slash).

That's it — `.github/workflows/reminders.yml` checks for due reminders every
5 minutes and texts them, for free. (Vercel's own free-tier Cron only runs
once a day, which isn't precise enough for "at 6pm," so this uses GitHub
Actions instead — same idea, just a scheduler that isn't rate-limited that
way.)

Reminders are one-way: you ask Jarvis to remind you, it eventually texts
you. It doesn't (yet) let you reply to that text and have Jarvis do
anything with the reply — that's a possible future add if you want it.

## Texting Jarvis for real (separate from reminders)

The PWA is the default and needs no third-party service. If you want to
have an actual back-and-forth conversation over SMS instead of the app:

1. Same Twilio setup as above.
2. Point the number's **"A message comes in"** webhook at
   `https://<your-deployment>/api/twilio/sms`.

Each phone number gets its own conversation history (keyed as `sms:<number>`
in the `conversations` table), separate from your PWA session.

## Updating your business context

Your plan will change. To update what Jarvis knows:

1. Edit `content/business-context.md` directly (pricing changes, new
   guardrails, phase updates, whatever).
2. If you also change the ramped monthly targets or plan phases, update the
   matching structured data in `lib/planData.ts`.
3. Run `npm run seed:context` to push the new version to Supabase.

No redeploy needed — the chat route always reads the latest version at
request time.

## Daily / weekly / monthly use

- **Daily:** ask "what's my one task today?" — pulls from the current phase
  of the 6-month plan. Tell it what you earned ("log $58 boarding today")
  and it logs it via `log_revenue` and tells you where that puts you on
  pace.
- **Weekly:** ask for your "weekly review" — it asks the saved check-in
  questions, then stores your answers once you give them.
- **Monthly:** ask for "monthly close" — same pattern, monthly questions,
  stored in `check_ins`.
- **Anytime:** ask "am I on pace?" — sums this month's logged transactions
  against that month's ramped target ($1,100 Aug → $2,100 Jan) and tells you
  straight if you're ahead or behind.

Jarvis won't sugarcoat it. That's the point.
