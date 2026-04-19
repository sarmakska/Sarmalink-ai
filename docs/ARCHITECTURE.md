# SarmaLink-AI Architecture

## Overview

SarmaLink-AI is a multi-provider AI chat assistant built on Next.js 14 (App Router), Supabase (auth + database), and Vercel (hosting). It routes user messages through free-tier AI providers with automatic failover, streaming responses via Server-Sent Events.

## Request Lifecycle

```
User types message
        |
        v
+------------------+
| POST /api/ai-chat|  (app/api/ai-chat/route.ts)
+------------------+
        |
        v
+------------------+
| 1. Auth check    |  Supabase auth.getUser() -- reject 401 if no session
+------------------+
        |
        v
+------------------+
| 2. Model select  |  body.model -> ModelId lookup (lib/ai-models.ts)
|    + Auto-route  |  If "auto": Cerebras Llama 8B classifies intent (~200ms)
|                  |  Falls back to regex autoRouteIntent() on failure
|                  |  Image attached? Force "vision" mode
+------------------+
        |
        v
+------------------+
| 3. Quota check   |  ai_chat_usage table: per-user, per-model, per-day
|                  |  Exceeds limit? Return JSON error (no stream)
+------------------+
        |
        v
+------------------+
| 4. File extract  |  PDF -> Gemini 2.5 Flash (key rotation on 429)
|                  |  Excel -> xlsx library (server-side)
|                  |  Word -> mammoth library (server-side)
|                  |  Pre-extracted text from R2 used when available
+------------------+
        |
        v
+------------------+
| 5. Build prompt  |  System prompt + date/time + model identity
|                  |  + user memories (lib/repositories/memories.ts)
|                  |  + custom instructions + tone
|                  |  + last 50 history messages
|                  |  + file context (if any)
+------------------+
        |
        v
+------------------+
| 6. Run tools     |  lib/tools/run.ts -> registry.ts
|                  |  Each tool: detect(msg) -> execute(args)
|                  |  Weather, exchange rates, container tracking
|                  |  Results wrapped with sanitize markers
+------------------+
        |
        v
+------------------+
| 7. Intent branch |  Image? -> Cloudflare FLUX (CF_PAIRS rotation)
|                  |  Search? -> Tavily/DDG -> re-ask via Groq
|                  |  Vision? -> Groq Llama-4-Scout (non-streaming)
|                  |  Live?   -> Gemini grounded + Google Search
|                  |  Other?  -> Full failover chain
+------------------+
        |
        v
+------------------+
| 8. Failover      |  lib/providers/failover.ts
|    (streaming)   |  For each step in model.failover[]:
|                  |    For each key (round-robin offset):
|                  |      POST to provider endpoint (streaming)
|                  |      429? -> next key. !ok? -> next key.
|                  |      Empty stream? -> next step.
|                  |      Success? -> stream tokens to client.
|                  |  All failed? -> OpenRouter non-streaming last resort
+------------------+
        |
        v
+------------------+
| 9. SSE stream    |  ReadableStream -> Response
|                  |  Events: token, thinking, image, auto_routed,
|                  |          backend, done
|                  |  <think> blocks -> "thinking" events (collapsed in UI)
|                  |  Sanitized: invisible chars stripped, chunk validated
+------------------+
        |
        v
+------------------+
| 10. Persist      |  Client saves messages to ai_chat_sessions
|                  |  Assistant text sanitized (invisible chars stripped)
|                  |  ai_events logged (fire-and-forget via supabaseAdmin)
+------------------+
```

## Module Map

```
app/
  api/
    ai-chat/route.ts        Main POST handler. Orchestrates auth, routing,
                             file extraction, tool execution, streaming.

lib/
  ai-models.ts              Model registry. 7 ModelIds (auto, smart, reasoner,
                             live, fast, vision, coder). Each has failover[],
                             daily limits, cutoff dates. Also: autoRouteIntent()
                             regex fallback router.

  intent.ts                 Side-intent detection (image, search, container,
                             currency, weather). Regex-based, deterministic.

  env/
    validate.ts             Environment variable loader. Singleton. Collects
                             key pools (GROQ_API_KEY, _2, _3...), validates
                             Supabase config, detects R2. No hard crash on
                             missing providers in production.

  providers/
    registry.ts             Provider endpoint URLs, key pools, header builders.
                             Maps ProviderType -> URL + keys + headers.

    failover.ts             Core failover runner. Iterates failover steps,
                             rotates keys (round-robin offset per request),
                             streams SSE, parses <think> blocks, counts chars.

  prompts/
    sanitize.ts             Prompt injection defence. Wraps untrusted content
                             (files, search, memory, tools) with boundary
                             markers. Strips injection patterns. Strips
                             invisible Unicode from streamed output.

  tools/
    registry.ts             Tool plugin system. Each tool: detect() + execute().
                             Currently: exchange-rates, weather, container-tracking.

    run.ts                  Tool orchestrator. Runs all matching tools, wraps
                             results with sanitize markers, returns formatted
                             string for prompt injection.

    search.ts               Web search: Tavily (primary) -> DuckDuckGo HTML
                             (fallback). Used by Live fallback and explicit
                             search intent.

  repositories/
    sessions.ts             CRUD for ai_chat_sessions. Auto-deletes oldest
                             when user hits 50-session cap. Sanitizes assistant
                             messages on persist.

    memories.ts             Read/write ai_user_memories. Single JSONB row per
                             user, max 30 facts.

  supabase/
    server.ts               Client-side Supabase (cookie-based auth)
    admin.ts                Service-role Supabase (server-only, bypasses RLS)
```

## Data Flow Across Database Tables

```
+-------------------+         +-------------------+
| auth.users        |         | ai_chat_sessions  |
| (Supabase built-in)|<------| user_id (FK)      |
| id, email, etc.   |        | title, messages    |
+-------------------+        | (JSONB array)      |
        |                    +-------------------+
        |
        |   +-------------------+
        +-->| ai_chat_usage     |
        |   | user_id, model_id |
        |   | date, count       |
        |   | (unique per day   |
        |   |  per model)       |
        |   +-------------------+
        |
        |   +-------------------+
        +-->| ai_user_memories  |
        |   | user_id (unique)  |
        |   | facts (JSONB[])   |
        |   +-------------------+
        |
        |   +-------------------+
        +-->| ai_events         |
            | user_id, event_type|
            | model_id, backend |
            | key_index, status |
            | latency_ms, meta  |
            +-------------------+
                    |
                    v
            +-------------------+
            | ai_usage_today    |
            | (VIEW)            |
            | model_id,         |
            | total_messages,   |
            | active_users      |
            +-------------------+
```

**Write path:** Route handler increments `ai_chat_usage` on every request (upsert). Logs to `ai_events` fire-and-forget. Client persists messages to `ai_chat_sessions` after stream completes. Memory extraction updates `ai_user_memories` at session end.

**Read path:** Auth check reads `auth.users`. Quota check reads `ai_chat_usage`. Memory injection reads `ai_user_memories`. Session restore reads `ai_chat_sessions`.

## Provider Architecture

```
                          +---> Groq (up to 15 keys)
                          |       Models: GPT-OSS-120B, Llama 3.3 70B,
                          |       Qwen3-32B, Llama-4-Scout, Llama-3.1-8B
                          |
Provider Registry --------+---> SambaNova (up to 8 keys)
(lib/providers/registry)  |       Models: DeepSeek V3.2, V3.1, Maverick
                          |
                          +---> Cerebras (up to 8 keys)
                          |       Models: Qwen 3 235B, Llama 3.1 8B
                          |
                          +---> Gemini (up to 18 keys)
                          |       Live mode: grounded search (proprietary API)
                          |       PDF extraction: Gemini 2.5 Flash
                          |
                          +---> OpenRouter (up to 5 keys)
                                  Free-tier models (:free suffix)
                                  Last-resort non-streaming fallback
```

## SSE Event Types

| Event         | Payload                        | Description                          |
|---------------|--------------------------------|--------------------------------------|
| `token`       | `{ text: string }`             | Visible response text chunk          |
| `thinking`    | `{ text: string }`             | Model reasoning (collapsed in UI)    |
| `image`       | `{ url, source }`              | Generated image (data URL)           |
| `auto_routed` | `{ to, label }`                | Which model Auto mode selected       |
| `backend`     | `{ label }`                    | Which provider/model actually served |
| `done`        | `{ usage, model, tokensOut }`  | Stream complete, final metadata      |

## Key Design Decisions

1. **No streaming for Vision** -- Groq's vision endpoint doesn't support streaming; response is sent as a single `token` event.
2. **Round-robin key rotation** -- `Date.now() % keys.length` offset so different requests start from different keys, spreading rate-limit pressure evenly.
3. **Fire-and-forget logging** -- `ai_events` inserts never block the chat response. Errors are swallowed.
4. **50-session cap** -- Oldest sessions auto-deleted when a user creates session #51.
5. **Prompt injection defence** -- All untrusted content (files, search results, tool output, memories) wrapped with explicit boundary markers before prompt injection.
6. **Singleton env** -- `env()` loads and validates environment variables once per process, avoiding repeated `process.env` reads.
