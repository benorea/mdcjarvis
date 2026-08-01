# Jarvis — MayDay & Co.

A personal AI assistant for MayDay & Co. Text it or talk to it, and it answers
grounded in your actual operating plan — pricing, routines, the $10k ramp,
guardrails — instead of generic dog-business advice. Runs your report cards,
calendar, live pricing/bookings, invoice drafts, and reminders too, wired
into the mayday-hub WordPress plugin and Square.

Stack: Next.js (App Router) + Supabase (Postgres) + Anthropic (Claude,
tool-use). Ships as an installable PWA with push-to-talk voice using the
browser's built-in speech APIs, so there's no extra voice service to pay for.

## What's here

- `app/api/chat/route.ts` — chat API. Runs Claude with tool-use in a loop
  until it stops calling tools, then returns the final reply.
- `lib/chatEngine.ts` — the shared turn logic (system prompt + history +
  tool loop + current date/time injection). Used by the web chat route and
  the Twilio SMS route.
- `lib/tools.ts` — everything Claude can do: `get_business_context`,
  `log_revenue`, `pace_check`, `daily_task`, `weekly_review`,
  `monthly_close`, `submit_report_card`, `wordpress_pricing_read`,
  `wordpress_bookings_read`, `estimate_monthly_earnings`,
  `training_progress_read`, `schedule_reminder`, `create_invoice`,
  `google_calendar_read`.
- `lib/planData.ts` — the ramped monthly targets, plan phases, and check-in
  questions, as structured data the tools compute against.
- `lib/reportCardFields.ts` — the exact field vocabulary the WordPress report
  card system understands, mirrored from the plugin. Claude is instructed to
  use only these values and never invent one.
- `lib/googleCalendar.ts` — Google Calendar read/write via a personal OAuth
  refresh token.
- `lib/square.ts` — Square Orders + Invoices (DRAFT only — no publish/send
  capability exists in this file by design).
- `lib/webpush.ts` — free push-notification delivery (VAPID), used for
  reminders.
- `lib/timezone.ts` — converts local (America/Denver) date/times to UTC
  correctly (DST-aware), and injects "right now" into the system prompt so
  Claude never has to guess the date.
- `lib/auth.ts` — the password-gate cookie logic.
- `content/business-context.md` — the full operating plan in prose. This is
  what actually grounds Jarvis. **Edit this file when your plan changes.**
- `components/ChatUI.tsx` — the PWA chat UI: password lock screen, text
  input, voice notes, spoken replies, copy button on replies (handy for
  drafted texts), notification opt-in, tool-call activity chips, a Status
  panel, and history that survives page reloads.
- `components/Dashboard.tsx` — the summary view (today's task, money,
  bookings, reminders, content theme, training progress), toggled from the
  chat header.
- `app/api/twilio/sms/route.ts` — inbound-SMS webhook, off by default
  (`TWILIO_ENABLED=false`).
- `app/api/webhooks/booking/route.ts` — receives booking-confirmed events
  from the WordPress plugin and creates the Google Calendar event.
- `app/api/cron/reminders/route.ts` — polled by GitHub Actions every 5
  minutes; pushes any due reminders as notifications.
- `app/api/push/subscribe/route.ts` — stores a device's push subscription.
- `app/api/transcribe/route.ts` — voice note → text via OpenAI's Whisper API.
- `app/api/status/route.ts` — which integrations are actually connected
  (booleans only, never leaks key values) — powers the Status panel.
- `app/api/dashboard/route.ts` — aggregates everything the Dashboard shows,
  reusing the same tool handlers chat uses.
- `supabase/schema.sql` — `business_context`, `conversations`,
  `transactions`, `check_ins`, `reminders`, `push_subscriptions`.
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

Everything else is optional and the app runs fine without it — report cards,
Google Calendar, reminders, and Square are all inert until configured (each
tool tells you plainly it's "not set up" instead of pretending to work).

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

Press and hold the 🎤 button to record a voice note — release to send it.
It's recorded on-device (`MediaRecorder`), uploaded, and transcribed via
`/api/transcribe`, then handled exactly like a typed message. Toggle
**Speak replies** in the header for spoken answers back (browser
`speechSynthesis`, free, no setup).

This deliberately isn't the browser's built-in speech recognition API —
that one is inconsistent enough across platforms (it silently does nothing
in an installed iOS PWA, a real Apple limitation with no code-level fix) to
not be worth depending on. Record + transcribe works identically on every
device, including the installed iPhone app, at the cost of needing
`OPENAI_API_KEY` set (see below) and a beat of upload/transcription latency
instead of instant recognition.

**Setup:** get a key at [platform.openai.com](https://platform.openai.com)
→ API keys, set `OPENAI_API_KEY` in env. Costs ~$0.006/minute of audio —
call it a few cents a month at personal-use volume. Voice notes don't work
at all until this is set (the mic button still shows, but you'll get a
clear "not configured" message instead of it silently failing).

## Security — what's actually protecting your keys

- **API keys never touch the browser.** `ANTHROPIC_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, Google OAuth secrets, `SQUARE_ACCESS_TOKEN` —
  all of it only exists in server-side code (API routes) and your
  deployment platform's encrypted environment variables. The client bundle
  never references them, so there's nothing to find by inspecting the app.
  (The one deliberate exception is `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — that's
  the *public* half of a push-notification keypair, meant to be public,
  same idea as a public key in any asymmetric crypto setup.)
- **Nothing is committed to git.** `.env.local` is gitignored; only
  `.env.example` (blank placeholders) is in the repo.
- **The PWA itself is password-gated** (`APP_PASSWORD`, default `mayday`):
  a server-side httpOnly cookie, checked on every `/api/chat` and
  `/api/conversations` request — not just a client-side curtain someone
  could bypass by viewing page source.
- **Every webhook/integration endpoint requires its own shared secret**,
  compared with a timing-safe check: the WordPress API endpoints (Bearer
  token), the booking-confirmed webhook (`X-Jarvis-Secret`), and the
  reminders cron endpoint (`X-Cron-Secret`). None of them are open.
- **The WordPress plugin doesn't hardcode anything either** — its secrets
  live in the WP options table (set from the admin UI), not in the PHP
  source, so the plugin zip itself is safe to hand around.
- **Square invoices are draft-only, structurally.** `lib/square.ts` has no
  function that publishes or sends an invoice — that capability doesn't
  exist in the codebase, not just "isn't called." Sending happens only when
  you personally do it from the Square Dashboard.

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
3. Copy the **Site URL** and **Shared secret** shown there into your env as
   `WORDPRESS_API_URL` and `WORDPRESS_API_KEY`. This one key also unlocks
   live pricing and live bookings below — it's the same connection.

## Live pricing & bookings (no more stale numbers)

Once `WORDPRESS_API_URL`/`WORDPRESS_API_KEY` are set (same setup as report
cards, above), three more things work:

- **`wordpress_pricing_read`** — the actual current prices from MayDay
  Bookings → Pricing, live off the site. Ask "what do I charge for boarding
  right now?" and it'll never be out of date with `business-context.md`.
- **`wordpress_bookings_read`** — upgrades automatically from the basic ICS
  feed to full detail (dollar amounts, dog names, per-booking breakdown) for
  the next 45 days.
- **`estimate_monthly_earnings`** — sums this month's already-*confirmed*
  bookings' actual saved prices and compares to the ramped target. This is
  explicitly a projection ("booked"), not the same number `pace_check` gives
  you (which is what you've actually logged as earned) — Jarvis is told to
  keep those two numbers distinct rather than blur them together.
- **`training_progress_read`** — real CPDT-KA hours logged (vs. the 300-hour
  requirement) and the other cert numbers, straight from the Training Log
  module — same math the plugin's own progress page uses.

Nothing to configure beyond the one WordPress connection above.

## Dashboard (the "what's actually going on" view)

Tap **📊 Dashboard** in the header to flip from chat to a summary view:
today's one task, reminders due today, this month's money (logged vs.
booked-but-not-earned vs. target), upcoming bookings, this month's content
theme, and CPDT-KA progress. It's one API call (`/api/dashboard`) that
reuses the exact same tool logic chat uses — so the dashboard and Jarvis's
answers in chat never quietly disagree with each other. Same password gate
as everything else; sections that aren't configured yet just say so instead
of showing broken/blank data.

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

## Drafting texts, emails, replies

This isn't a separate feature to set up — it's just what Jarvis does when
you ask. "Draft a text to the Hendersons about their late pickup" gets you
something ready to copy and send, written in your voice. There's a small
**copy** link under any reply so you can grab it fast. Jarvis never sends
anything itself (texts, emails, invoices) — it drafts, you send.

## Invoices (Square, draft-only)

Say "invoice Sarah Chen $68 for the virtual session" and Jarvis creates a
**draft** invoice in Square — a real customer + order + invoice, sitting in
DRAFT status. Nothing gets emailed or charged until you open your Square
Dashboard and publish it yourself. This uses the same Square account already
processing booking payments, just a different API credential.

**Setup:**

1. Go to [developer.squareup.com](https://developer.squareup.com) → sign in
   with your existing Square account → **Create an app** (or use an
   existing one) → **Credentials** tab → copy the **Production** access
   token (not sandbox, unless you want to test with fake money first).
2. Same app → **Locations** tab → copy your **Location ID**.
3. Set `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` in env.
   `SQUARE_ENVIRONMENT` defaults to `production`; set it to `sandbox` only
   if you're testing with a sandbox token.

Treat `SQUARE_ACCESS_TOKEN` like a password to your Square account — it can
create real customers, orders, and invoices (draft-only here, but a leaked
token isn't limited to what this app does with it). Standard env-var
handling (never commit it, only in Vercel's encrypted vars) is what protects
it, same as every other key.

## Reminders (free push notifications)

Tell Jarvis *"don't let me forget to give Millie's meds at 6pm"* and it'll
push a notification to your phone at 6pm America/Denver time — no texting
service, no recurring cost. Uses the Web Push standard (the same mechanism
behind every site that asks "allow notifications?").

**Setup:**

1. Generate a VAPID keypair once:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Set the public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key
   as `VAPID_PRIVATE_KEY` in env.
2. Generate a random string for `CRON_SECRET` (e.g. `openssl rand -hex 24`).
3. In your GitHub repo → **Settings → Secrets and variables → Actions**, add
   two repo secrets: `CRON_SECRET` (same value as step 2) and
   `JARVIS_APP_URL` (your deployed URL, no trailing slash).
4. Open the installed PWA, tap **🔔 Enable reminders** in the header, allow
   notifications when the browser asks.

That's it — `.github/workflows/reminders.yml` checks for due reminders every
5 minutes and pushes them, for free. (Vercel's own free-tier Cron only runs
once a day, which isn't precise enough for "at 6pm," so this uses GitHub
Actions instead.)

Notes:
- **iPhone:** push notifications only work once the PWA is installed to your
  home screen (Share → Add to Home Screen) — a regular Safari tab can't ask
  for notification permission on iOS.
- Multiple devices can each tap "Enable reminders" — a reminder pushes to
  all of them.
- Reminders are one-way: Jarvis eventually notifies you, you can't reply to
  the notification itself and have it do anything.

## Texting Jarvis for real (separate from reminders)

The PWA is the default and needs no third-party service. If you want an
actual back-and-forth conversation over real SMS instead of the app:

1. Create a [Twilio](https://twilio.com) account, buy a phone number
   (small recurring cost — your call whether it's worth it).
2. Set `TWILIO_ENABLED=true` and `TWILIO_AUTH_TOKEN` in env.
3. Point the number's **"A message comes in"** webhook at
   `https://<your-deployment>/api/twilio/sms`.

Each phone number gets its own conversation history (keyed as `sms:<number>`
in the `conversations` table), separate from your PWA session. This is
unrelated to reminders, which use free push notifications instead.

## Updating your business context

Your plan will change. To update what Jarvis knows:

1. Edit `content/business-context.md` directly (pricing changes, new
   guardrails, phase updates, whatever) — though for pricing specifically,
   `wordpress_pricing_read` now pulls live numbers instead, so the doc
   matters less for that one thing.
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
  straight if you're ahead or behind. Ask "what am I projected to make this
  month?" for the separate booked-but-not-yet-earned number instead.

Jarvis won't sugarcoat it. That's the point.
