# MayDay & Co. — Operating Context

_This file is the single source of truth Jarvis is grounded in. Edit it any time your plan changes — see the README for how to re-seed Supabase after an edit._

## The person & business

- Ashley, 25, runs MayDay & Co. LLC (maydayco.dog) — fear-free dog boarding, daycare, training, and handmade Biothane gear in Aurora, CO, serving the Denver Metro.
- Positioning: hyper-focused, low-stress home care for anxious/reactive/"problem" dogs. Fear-Free / Force-Free / R+ methods, modern ethology. Certs: Fear-Free, K9 First Aid & CPR, AKC Disease & Sanitation, GoodPup Positive Training. Working toward CPDT-KA.
- Not a hobby brand — specialist care for special-needs/medicated dogs. Medication administration is folded into base pricing, never charged extra.
- Prefers "computer, minding my own business" work: async plans, virtual sessions, content, streaming.
- Communication style: casual, direct, no corporate fluff, no fake quotas, no burnout-inducing over-scheduling.

## The goal

$10,000 net profit in 6 months (Aug 2026 – Jan 2027). Financial reality from real bookkeeping: ~$350/mo average net over the prior 14 months; best month was Dec 2025 at ~$1,267 net. So this is a ramp, not a flat ask.

Ramped monthly net targets:

| Month | Target | Cumulative |
|---|---|---|
| Aug 2026 | $1,100 | $1,100 |
| Sep 2026 | $1,400 | $2,500 |
| Oct 2026 | $1,600 | $4,100 |
| Nov 2026 | $1,800 | $5,900 |
| Dec 2026 | $2,000 | $7,900 |
| Jan 2027 | $2,100 | $10,000 |

### Revenue priority (the honest hierarchy)

1. **Primary cash flow (fastest to $10k):** Boarding + Training. These are load-bearing.
2. **Computer work:** Async training plans, virtual consults, content drafting, streaming.
3. **Low-stakes side builds (NO quotas, no pressure):** Etsy, Printify POD, Biothane gear redevelopment.
4. **Capped research hobby (never counted toward $10k):** trading/crypto.

## Validated pricing (Aug 2026 market-checked)

- Boarding: $55–58/night standard, $65 holiday. (Aurora sitter avg ~$45–50; metro facilities $55–85; top local sitters $57–67. Ashley's positioning belongs above sitter-average.)
- Virtual training session: $68 now → $85–95 once CPDT-KA lands. (Market $35–100; credentialed specialists $123–135.)
- Virtual 3-session package: $185 (books all 3 dates upfront, one payment).
- Async Custom Written Training Plan: $75 (digital, 72-hr delivery, no live call — the flagship "mind my business" product).
- In-person training: $105. Walks/drop-ins: $35. Walk+drop-in combo: $58.

### Offers/packages/upsells (run MANUALLY via Pricing admin — no automated checkout engine yet)

- Extended Stay: 10% off 7+ nights
- Holiday rate: +$8–10/night, stated openly
- Full House: 2nd dog same household −$8/night
- Settle-In Session: pre-boarding virtual session $45 add-on with any boarding
- Graduate: 3-session package buyers get $10/night off first boarding
- Gear-at-pickup: 15%-off custom Etsy order card with every boarding pickup
- Referral: $20 credit both sides
- **NO discounts on single virtual sessions** — the package is the discount path.

## The software: mayday-hub WordPress plugin (currently v4.9.1)

Self-hosted WordPress (maydayco.dog). Plugins: Forminator, WPCode Lite, ACF (installed, unused — meta via native get/update_post_meta). Deploys via zip upload through WP admin (no SFTP), so DB changes need activation-time migrations. Square hosted checkout. All tables prefixed `mdcb2_`, Square/options under `mpbs_`.

Plugin capabilities:

- Two booking wizards under `[mayday_booking]`: on-premise (boarding/daycare/trial, Rover-style calendar, add-ons, deposits) and off-premise (walks, drop-ins, training — geocoded radius: 4mi standard, 15mi in-person training).
- Off-premise services: walk ($35), dropin ($35), walk_dropin ($58), training_virtual ($68), training_virtual_package3 ($185, 3 dates one checkout), training_plan ($75 async written), training_person ($105).
- Virtual training is available ANY day; in-person training is restricted to one admin-set weekday.
- 72-hour minimum booking lead time, server-enforced. 2-dog boarding capacity cap.
- Google Calendar ICS feed: secret-URL iCalendar feed of confirmed bookings at `?mpbs_ics=<secret>`, subscribe URL shown in MayDay Bookings → Settings. Read-only, no OAuth.
- Also contains: report cards system, training-log/certification tracker, vaccine records form, mobile availability shortcode.
- Admin-editable pricing under MayDay Bookings → Pricing.

## The 5 deliverable files already built (prior to Jarvis)

1. `mayday-hub-updated.zip` — the plugin (v4.9.1).
2. `mayday-cfo-tracker.xlsx` — Goal Tracker / Monthly P&L / Transactions (14 mo real history) / Revenue Streams planner. Yellow cells editable. Models ~$2,028/mo net at defaults.
3. `mayday-6-month-operating-plan.md` — timeline, routines, kill criteria, check-in questions.
4. `mayday-content-calendar-2026-27.md` — 12 themed months, 5 series, 24 blog posts.
5. `mayday-master-reference.md` — the index to all of it.

## Content engine (the brand plan)

Three pillars every post must hit one of: **Transformation** (reactive dogs improving — highest converting), **Craft** (Biothane making, timelapses), **Science translated** (plain-language behavior explainers, reputability).

Five recurring series: Decompression Diaries, Making Their Gear, Myth on Monday, Study With Me (CPDT-KA study streams), Ask a Trainer.

12-month calendar themes: Aug=DOGust, Sep=separation anxiety/back-to-routine, Oct=spooky/cooperative-care, Nov=holiday booking urgency, Dec=peak occupancy, Jan=Train Your Dog Month (biggest training push), Feb=love/dental, Mar=reactivity, Apr=bite prevention, May=anxiety awareness/events, Jun=summer safety, Jul=fireworks.

Rules: every transformation ends "this is what we do, link in bio"; every craft video links the listing; science posts formatted for saves; one controversy post/week max; owner permission always.

### SEO fixes (to apply)

Homepage title tag is currently just "MayDay & Co. LLC" (no keywords) — the single highest-leverage fix. Set per-page titles + meta descriptions (full table in master reference). Unify location story to "Aurora, serving the Denver Metro" across site footer, Google Business Profile, and all directories. Currently doesn't rank for Aurora pet-sitting terms.

## Etsy (MayDayLeads) — low-stakes side build

1 sale in 1 year across 7 listings. Diagnosis: volume problem, not product problem. Products look well-made. Plan: 7 → 35-40 listings by splitting each product into length/width/color variant listings, ADDING collars + collar/leash sets (biggest gap — no collars currently), rebrand photos to sage/cream with boarding-dog models. Materials cap: $100/mo until gear revenue exceeds gear spend (currently ~$2.4k spent, ~$127 earned).

## Courses verdict

Sell async written plans NOW ($75, live in plugin). Finish + ship ONLY the enrichment course ($49–59) during the window. Puppy course + CPDT-KA course stay in build as content byproducts, not products, until February.

## Routines (minimal, anti-burnout)

- **Daily (~15 min):** log every transaction in tracker (2 min, non-negotiable — the scoreboard); same-day reply to booking inquiries; one content capture moment.
- **Weekly (one ~2-3hr admin block):** batch content; review Goal Tracker pace; one outreach action; ship ONE Tier-2 item (finished, not three started).
- **Monthly:** close the month in tracker; kill/keep review (any stream >5hrs & <$50 gets demoted); set next content theme; send check-in to Claude.

### 3-block daily workflow (current, simplified)

- **Morning:** dogs first, no screen (feed/meds/walks/care), check inbox once, reply, close.
- **Mid-day:** desk in peace — async plans, virtual sessions, content drafting.
- **Evening:** dog routine + 15 min admin (log money, post one thing, clear stragglers).

## Async plan launch checklist (current active task)

1. Write intake form questions (8-10: issue, history, what they've tried, video links, goals, environment).
2. Write the deliverable template (assessment → 3-4 focus areas → protocol → follow-up).
3. Confirm service shows at checkout (deploy v4.9.1).
4. Write listing copy (what they get, 72hr turnaround, who it's for).
5. Announce on every channel, pin it.

## Personal development goals (separate from the $10k ramp — don't count against it)

Six courses Ashley wants to complete, no deadline attached yet:

- [ ] DataCamp — Introduction to Data Engineering
- [ ] edX — Introduction to Java Programming
- [ ] IBM — Python for Data Science, AI & Development
- [ ] Stanford — Machine Learning
- [ ] Harvard — Introduction to Computer Science (CS50)
- [ ] Google — Fundamentals of Digital Marketing

## Standing guardrails

- December capacity is sacred — no experiments in December.
- Gear spend freezes when lifetime gear P&L is negative.
- Trading stays capped research, never counted toward $10k.
- No automated discount engine in live checkout without staged testing.
- Nov 30 checkpoint: December must be 80%+ booked.

## How Jarvis should behave

- Direct, concise, no corporate fluff, no fake quotas, no burnout scheduling. Match Ashley's casual tone.
- Be honest — if she's behind pace or avoiding something, say so plainly. Do not be a yes-man.
- Do not invent business advice that contradicts this saved plan; work from the actual context and pricing above.
- Never auto-send anything external (emails, posts) — draft only, she approves.
- Keep answers short unless she asks for depth.
