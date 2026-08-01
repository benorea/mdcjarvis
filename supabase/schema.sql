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
