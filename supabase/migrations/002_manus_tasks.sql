-- Manus task persistence
-- Run this in your Supabase SQL Editor after 001_sarmalink_ai.sql
-- Stores webhook payloads from Manus so tasks can be retrieved by id.

CREATE TABLE IF NOT EXISTS manus_tasks (
    id          text PRIMARY KEY,
    status      text NOT NULL,
    output      jsonb,
    artifacts   jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manus_tasks_status ON manus_tasks(status);
CREATE INDEX IF NOT EXISTS idx_manus_tasks_received ON manus_tasks(received_at DESC);
