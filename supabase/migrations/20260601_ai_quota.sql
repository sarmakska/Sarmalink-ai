-- v2 quota tracking.
--
-- Records one row per chat completion call so we can show per-user and
-- company-wide usage by model tier for the current UTC day.

create table if not exists public.ai_chat_usage (
    id           bigserial primary key,
    created_at   timestamptz not null default now(),
    user_id      uuid,
    tier         text not null,
    model        text,
    prompt_tokens   integer not null default 0,
    completion_tokens integer not null default 0,
    total_tokens integer not null default 0,
    backend      text,
    status       text not null default 'success'
);

create index if not exists ai_chat_usage_user_day_idx
    on public.ai_chat_usage (user_id, created_at);

create index if not exists ai_chat_usage_tier_day_idx
    on public.ai_chat_usage (tier, created_at);

-- Roll-up view for today's usage. UTC day window.
create or replace view public.ai_usage_today as
select
    user_id,
    tier,
    count(*)               as calls,
    sum(prompt_tokens)     as prompt_tokens,
    sum(completion_tokens) as completion_tokens,
    sum(total_tokens)      as total_tokens
from public.ai_chat_usage
where created_at >= date_trunc('day', now() at time zone 'utc')
group by user_id, tier;

alter table public.ai_chat_usage enable row level security;

create policy "ai_chat_usage_self_select" on public.ai_chat_usage
    for select
    using (auth.uid() = user_id);
