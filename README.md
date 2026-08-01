# Jarvis — MayDay & Co.

A personal AI assistant for MayDay & Co. Text it or talk to it, and it answers
grounded in your actual operating plan — pricing, routines, the $10k ramp,
guardrails — instead of generic dog-business advice.

Stack: Next.js (App Router) + Supabase (Postgres) + Anthropic (Claude,
tool-use). Ships as an installable PWA with push-to-talk voice using the
browser's built-in speech APIs, so there's no extra voice service to pay for.

## What's here

- `app/api/chat/route.ts` — chat API. Runs Claude with tool-use in a loop
  until it stops calling tools, then returns the final reply.
- `lib/chatEngine.ts` — the shared turn logic (system prompt + history +
  tool loop). Used by both the web chat route and the Twilio SMS stub.
- `lib/tools.ts` — the tools Claude can call: `get_business_context`,
  `log_revenue`, `pace_check`, `daily_task`, `weekly_review`,
  `monthly_close`, and the optional `google_calendar_read` /
  `wordpress_bookings_read` stubs.
- `lib/planData.ts` — the ramped monthly targets, plan phases, and check-in
  questions, as structured data the tools compute against.
- `content/business-context.md` — the full operating plan in prose. This is
  what actually grounds Jarvis. **Edit this file when your plan changes.**
- `components/ChatUI.tsx` — the PWA chat UI: text input + push-to-talk mic
  button (Web Speech API for speech-to-text) + spoken replies
  (speechSynthesis for text-to-speech, toggleable).
- `app/api/twilio/sms/route.ts` — optional inbound-SMS webhook, off by
  default (`TWILIO_ENABLED=false`).
- `supabase/schema.sql` — the four tables: `business_context`,
  `conversations`, `transactions`, `check_ins`.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). In the SQL
editor, run the contents of `supabase/schema.sql` once.

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

Everything else in `.env.example` is optional — Twilio SMS, higher-quality
TTS via ElevenLabs, and the read-only calendar/bookings integrations are all
off by default and the app runs fine without them.

### 5. Seed your business context into Supabase

```bash
npm run seed:context
```

This pushes `content/business-context.md` into the `business_context` table
as version 1. (If you skip this step, the chat route falls back to reading
the markdown file straight off disk, so the app still works — but seeding
means the doc is versioned and survives redeploys cleanly.)

### 6. Run it

```bash
npm run dev
```

Open http://localhost:3000.

## Installing the PWA on your phone

1. Deploy the app somewhere with HTTPS (Vercel is the path of least
   resistance for a Next.js app — `vercel deploy`), or use a tunnel like
   `ngrok` to test on your phone against local dev.
2. On iPhone: open the site in Safari → Share → **Add to Home Screen**.
3. On Android: open the site in Chrome → menu (⋮) → **Install app** (or
   **Add to Home Screen**).
4. Launch it from the home screen icon — it opens full-screen, no browser
   chrome.

Note: `public/icon.svg` is a placeholder icon. Swap in real PNG icons
(192x192 and 512x512 at minimum) and update `public/manifest.json` if you
want a polished home-screen icon — SVG works but isn't universally supported
for `apple-touch-icon`.

## Using voice

Tap and hold the 🎤 button to talk (push-to-talk — it stops listening when
you let go and sends what it heard). Toggle **Speak replies** in the header
to have Jarvis read its answers back with the browser's built-in
text-to-speech. Both use the free Web Speech API, so voice works with zero
extra setup or cost, and no audio ever leaves your device except as the text
transcript sent to `/api/chat`.

If you later want noticeably better-sounding speech, wire in ElevenLabs
behind `ELEVENLABS_API_KEY` — the audio layer is isolated in `ChatUI.tsx` so
that's a swap, not a rewrite. Ask before adding it; it's a paid service.

## Updating your business context

Your plan will change. To update what Jarvis knows:

1. Edit `content/business-context.md` directly (pricing changes, new
   guardrails, phase updates, whatever).
2. If you also change the ramped monthly targets or plan phases, update the
   matching structured data in `lib/planData.ts` — that file is what
   `pace_check` and `daily_task` actually compute against, so the numbers
   Jarvis quotes and the numbers you're chatting about should track the
   same edit.
3. Run `npm run seed:context` to push the new version to Supabase.

No redeploy needed — the chat route always reads the latest version at
request time.

## Texting Jarvis for real (optional, off by default)

The PWA is the default and needs no third-party service. If you want to
literally text a phone number instead:

1. Get a Twilio phone number.
2. Set `TWILIO_ENABLED=true`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_PHONE_NUMBER` in your env.
3. Point the number's **"A message comes in"** webhook at
   `https://<your-deployment>/api/twilio/sms`.

Each phone number gets its own conversation history (keyed as `sms:<number>`
in the `conversations` table), separate from your PWA session.

This is a paid service (Twilio) — don't turn it on without deciding that's
worth it to you.

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
