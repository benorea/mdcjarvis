-- Jarvis (MayDay & Co.) — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Single-user personal tool: the app talks to Supabase with the service-role
-- key from server-side routes only, so RLS is left off rather than faked.

create extension if not exists "pgcrypto";

-- Full operating-plan doc, versioned so you can update it over time without
-- losing history. The app always reads the latest row.
create table if not exists business_context (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  version int not null,
  created_at timestamptz not null default now()
);

create index if not exists business_context_version_idx
  on business_context (version desc);

-- Chat history (text + voice transcripts), one row per turn.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default 'default',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversations_session_created_idx
  on conversations (session_id, created_at);

-- Revenue log — the daily 2-minute non-negotiable.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10, 2) not null,
  stream text not null,
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_occurred_on_idx
  on transactions (occurred_on);

-- Weekly review / monthly close answers.
create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('weekly', 'monthly')),
  answers jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists check_ins_type_created_idx
  on check_ins (type, created_at);

-- Reminders ("don't let me forget to give Millie's meds at 6pm").
-- remind_at is the true UTC instant (converted from America/Denver wall-clock
-- time at scheduling time); a cron job polls for due, unsent rows and pushes them.
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  remind_at timestamptz not null,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reminders_due_idx
  on reminders (remind_at) where sent = false;

-- Web Push subscriptions — one row per browser/device that's enabled
-- notifications. A phone and a laptop both installing the PWA means two
-- rows; reminders push to all of them.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Content ideas + a REAL performance history (things Ashley actually told
-- Jarvis performed well/badly), so future suggestions can be grounded in
-- what's actually worked instead of invented "trend" claims. status tracks
-- an idea from conception through posted; performance_note is filled in
-- after the fact via log_post_performance.
create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  idea text not null,
  pillar text, -- 'transformation' | 'craft' | 'science', loosely — not enforced
  series text, -- one of the five recurring series, if it fits one
  status text not null default 'idea' check (status in ('idea', 'drafted', 'posted')),
  performance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_ideas_status_idx
  on content_ideas (status, created_at desc);

-- Daily snapshot of what a live web search turns up for the business name /
-- domain (reviews, mentions, how it shows up in search) — powers the
-- Dashboard's "Web presence" panel. One row per day via the cron job.
create table if not exists web_presence_snapshots (
  id uuid primary key default gen_random_uuid(),
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists web_presence_snapshots_created_idx
  on web_presence_snapshots (created_at desc);
