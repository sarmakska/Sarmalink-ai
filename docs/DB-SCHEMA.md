# SarmaLink-AI Database Schema

All tables live in the `public` schema of a Supabase (PostgreSQL) project. Auth is handled by Supabase's built-in `auth.users` table.

Source: `supabase/migrations/001_sarmalink_ai.sql`

## Tables

### ai_chat_sessions

Stores chat conversations. Each user can have up to 50 sessions (oldest auto-deleted by application code in `lib/repositories/sessions.ts`).

```sql
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text NOT NULL DEFAULT 'New Chat',
    messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**messages JSONB structure:**
```json
[
  { "role": "user", "content": "Hello" },
  { "role": "assistant", "content": "Hi there!" }
]
```

Content can also be an array (for vision messages with image_url parts).

**Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user
    ON ai_chat_sessions(user_id, updated_at DESC);
```

Used by: session listing (most recent first), session cap enforcement.

---

### ai_chat_usage

Per-user, per-model, per-day message counter. Used for quota enforcement.

```sql
CREATE TABLE IF NOT EXISTS ai_chat_usage (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_id    text NOT NULL,
    date        date NOT NULL DEFAULT CURRENT_DATE,
    count       integer NOT NULL DEFAULT 1,
    CONSTRAINT ai_chat_usage_unique UNIQUE (user_id, model_id, date)
);
```

**Upsert pattern (in route handler):**
```sql
INSERT INTO ai_chat_usage (user_id, date, model_id, count)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, date, model_id)
DO UPDATE SET count = EXCLUDED.count;
```

No explicit index beyond the unique constraint (which creates an implicit B-tree on `(user_id, model_id, date)`).

---

### ai_events

Observability log for failover debugging, latency tracking, and error analysis. Inserts are fire-and-forget from the route handler.

```sql
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
```

**Event types:** `message`, `fallback`, `rate_limit`, `error`, `model_switch`

**Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_ai_events_user
    ON ai_events(user_id, created_at DESC);
```

Note: `user_id` is nullable (some error events may lack a user context). No foreign key constraint to `auth.users` -- this is intentional so logging never fails due to referential integrity.

---

### ai_user_memories

Persistent memory (ChatGPT-style). One row per user with a JSONB array of facts.

```sql
CREATE TABLE IF NOT EXISTS ai_user_memories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    facts       jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ai_user_memories_user_unique UNIQUE (user_id)
);
```

**facts JSONB structure:**
```json
["User's name is John", "Works in the buying department", "Prefers formal tone"]
```

Application code caps at 30 facts (`lib/repositories/memories.ts`).

---

## Views

### ai_usage_today

Aggregate view for admin dashboard. Shows per-model message counts and active user counts for the current day.

```sql
CREATE OR REPLACE VIEW ai_usage_today AS
SELECT
    model_id,
    SUM(count) AS total_messages,
    COUNT(DISTINCT user_id) AS active_users
FROM ai_chat_usage
WHERE date = CURRENT_DATE
GROUP BY model_id;
```

---

## Table Relationships

```
auth.users (Supabase built-in)
    |
    +-- 1:N --> ai_chat_sessions    (ON DELETE CASCADE)
    |
    +-- 1:N --> ai_chat_usage       (ON DELETE CASCADE)
    |
    +-- 1:1 --> ai_user_memories    (ON DELETE CASCADE, UNIQUE user_id)
    |
    +-- 1:N --> ai_events           (no FK -- nullable user_id)
```

All tables with user_id FK use `ON DELETE CASCADE`, so deleting a Supabase user cleans up all related data.

---

## RLS Policies

The migration file does not define Row Level Security policies. The application uses two Supabase clients:

- **Client-side (`lib/supabase/server.ts`)** -- cookie-based auth, respects RLS. Used only for `auth.getUser()`.
- **Admin (`lib/supabase/admin.ts`)** -- service role key, bypasses RLS entirely. Used for all data operations (sessions, usage, events, memories).

Since all data access goes through `supabaseAdmin`, RLS is effectively not enforced. If you want to add RLS, you would need policies like:

```sql
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own sessions"
    ON ai_chat_sessions FOR ALL
    USING (auth.uid() = user_id);
```

This is not currently implemented -- access control is handled at the application layer (every query filters by `user_id` from the authenticated session).

---

## Index Notes

| Table              | Index/Constraint                    | Type        | Columns                       |
|--------------------|-------------------------------------|-------------|-------------------------------|
| ai_chat_sessions   | `idx_ai_sessions_user`              | B-tree      | `(user_id, updated_at DESC)`  |
| ai_chat_usage      | `ai_chat_usage_unique`              | Unique      | `(user_id, model_id, date)`   |
| ai_events          | `idx_ai_events_user`                | B-tree      | `(user_id, created_at DESC)`  |
| ai_user_memories   | `ai_user_memories_user_unique`      | Unique      | `(user_id)`                   |

The `ai_events` table will grow continuously. Consider adding a retention policy (e.g., delete events older than 90 days) or partitioning by `created_at` if the table exceeds ~10M rows.
