-- ENUM for sentiment
do $$ begin
  create type sentiment_label as enum ('bullish','bearish','neutral');
exception when duplicate_object then null; end $$;

-- Raw messages
create table if not exists telegram_messages (
  id uuid primary key default gen_random_uuid(),
  telegram_msg_id text,
  chat_id text,
  chat_title text,
  username text,
  message text not null,
  timestamp timestamptz default now(),
  processed boolean default false
);

-- Per-message extracted tokens
create table if not exists telegram_message_tokens (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references telegram_messages(id) on delete cascade,
  token text not null,
  source text default 'regex',
  created_at timestamptz default now()
);

-- Batch summaries (one row per summarization run)
create table if not exists telegram_summaries (
  id uuid primary key default gen_random_uuid(),
  summary text not null,
  overall_sentiment sentiment_label,
  total_messages int,
  model text,
  created_at timestamptz default now()
);

-- Per-token insights for a summary run
create table if not exists token_insights (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid references telegram_summaries(id) on delete cascade,
  token text not null,
  sentiment sentiment_label,
  confidence numeric,
  mentions int default 0,
  notes text,
  created_at timestamptz default now()
);

-- Helpful view for frontend (latest summary + tokens)
create or replace view v_latest_telegram_intel as
select s.*, ti.token, ti.sentiment, ti.confidence, ti.mentions, ti.notes
from telegram_summaries s
left join token_insights ti on ti.summary_id = s.id
where s.created_at = (select max(created_at) from telegram_summaries);

-- RLS
alter table telegram_messages enable row level security;
alter table telegram_message_tokens enable row level security;
alter table telegram_summaries enable row level security;
alter table token_insights enable row level security;

-- only service role can touch raw
create policy if not exists "svc read/write raw" on telegram_messages
  for all to service_role using (true) with check (true);

create policy if not exists "svc read/write raw tokens" on telegram_message_tokens
  for all to service_role using (true) with check (true);

-- public read of aggregate intel
create policy if not exists "public read summaries" on telegram_summaries
  for select to anon using (true);

create policy if not exists "public read token insights" on token_insights
  for select to anon using (true);

-- Aggregates for per-chat heatmap and time series

-- Token mentions per chat per hour (last 24h)
create or replace view v_token_mentions_by_chat_hour as
select
  date_trunc('hour', tm.timestamp) as ts_hour,
  tm.chat_id,
  coalesce(tm.chat_title, tm.chat_id) as chat_title,
  tmt.token,
  count(*) as mentions
from telegram_messages tm
join telegram_message_tokens tmt on tmt.message_id = tm.id
where tm.timestamp >= now() - interval '24 hours'
group by 1,2,3,4;

-- Token mentions per chat per day (last 7 days)
create or replace view v_token_mentions_by_chat_day as
select
  date_trunc('day', tm.timestamp) as ts_day,
  tm.chat_id,
  coalesce(tm.chat_title, tm.chat_id) as chat_title,
  tmt.token,
  count(*) as mentions
from telegram_messages tm
join telegram_message_tokens tmt on tmt.message_id = tm.id
where tm.timestamp >= now() - interval '7 days'
group by 1,2,3,4;

