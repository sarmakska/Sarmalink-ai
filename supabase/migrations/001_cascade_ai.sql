-- Cascade AI — Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new)

-- Chat sessions (50 per user, oldest auto-deleted)
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text NOT NULL DEFAULT 'New Chat',
    messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON ai_chat_sessions(user_id, updated_at DESC);

-- Per-user daily usage tracking
CREATE TABLE IF NOT EXISTS ai_chat_usage (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_id    text NOT NULL,
    date        date NOT NULL DEFAULT CURRENT_DATE,
    count       integer NOT NULL DEFAULT 1,
    CONSTRAINT ai_chat_usage_unique UNIQUE (user_id, model_id, date)
);

-- Event log (cascade debugging, latency tracking)
CREATE TABLE IF NOT EXISTS ai_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid,
    event_type  text NOT NULL,
    model_id    text,
    backend     text,
    key_index   integer,
    status      text,
    latency_ms  integer,
    tokens_out  integer,
    meta        jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_events_user ON ai_events(user_id, created_at DESC);

-- Persistent memory (ChatGPT-style, per user)
CREATE TABLE IF NOT EXISTS ai_user_memories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    facts       jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ai_user_memories_user_unique UNIQUE (user_id)
);

-- Company-wide usage view (for admin dashboard)
CREATE OR REPLACE VIEW ai_usage_today AS
SELECT
    model_id,
    SUM(count) AS total_messages,
    COUNT(DISTINCT user_id) AS active_users
FROM ai_chat_usage
WHERE date = CURRENT_DATE
GROUP BY model_id;
