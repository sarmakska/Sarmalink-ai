# SarmaLink-AI Architecture

## Overview

SarmaLink-AI is a multi-provider LLM gateway built on Next.js 16 (App Router), Supabase (auth + database), and Vercel (hosting). It routes user messages through ten chat providers with automatic failover, streaming responses via Server-Sent Events. May-2026 frontier engines (Opus 4.7, GPT-5.5, Gemini 3.5 Pro) sit at the head of the chain when premium keys are present, and the gateway caches the stable prompt prefix across every provider that supports it, tracking per-model cost as it goes.

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
|    (streaming)   |  Apply prompt caching to the system prefix
|                  |  (lib/providers/cache.ts), keyed on the mode.
|                  |  For each step in model.failover[]:
|                  |    Skip the step if the provider has no key.
|                  |    For each key (round-robin offset):
|                  |      POST to provider endpoint (streaming)
|                  |      429? -> next key. !ok? -> next key.
|                  |      Empty stream? -> next step.
|                  |      Success? -> stream tokens to client,
|                  |        capture usage (prompt-cache hits incl.)
|                  |  All failed? -> OpenRouter non-streaming last resort
+------------------+
        |
        v
+------------------+
| 9. SSE stream    |  ReadableStream -> Response (lib/streaming/events.ts)
|                  |  Typed events: token, thinking, image, auto_routed,
|                  |          sources, usage, backend, done, error
|                  |  <think> blocks -> "thinking" events (collapsed in UI)
|                  |  usage frame (cached tokens) emitted before backend
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
                             Maps ProviderType -> URL + keys + headers. Ten chat
                             providers including anthropic (Opus 4.7) and the
                             OpenAI-compatible GitHub Models catalogue (GPT-5.5).

    failover.ts             Core failover runner. Iterates failover steps,
                             rotates keys (round-robin offset per request),
                             applies prompt caching, streams SSE, parses
                             <think> blocks, captures token + cache usage.

    cache.ts                Cross-provider prompt caching. Anthropic ephemeral
                             breakpoints, OpenAI-compatible prompt_cache_key,
                             Gemini implicit. Pure; no-op for short prompts.

    cost.ts                  Per-model cost. List-price table + per-turn cost
                             (cached tokens at the cached rate) + aggregator
                             over ai_events for the admin dashboard.

  streaming/
    events.ts               Typed SSE event protocol: discriminated union,
                             serialiser, validating parser, provider usage
                             reader (OpenAI + Anthropic cache accounting).

  plugins/
    mcp.ts                   MCP JSON-RPC 2.0 passthrough: tools/list, tools/call
                             over Streamable HTTP, plain-JSON and SSE bodies.

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
                          +---> Anthropic (up to 4 keys, PAID)
                          |       Opus 4.7. Head of Smart/Reasoner/Coder.
                          |       OpenAI-compatible endpoint + version header.
                          |
                          +---> GitHub Models (up to 4 keys)
                          |       GPT-5.5, o3-mini, gpt-4o. Azure-hosted.
                          |
                          +---> Gemini (up to 18 keys)
                          |       Gemini 3.5 Pro / 2.5 Flash. Live mode grounded
                          |       search (proprietary API). PDF extraction.
                          |
Provider Registry --------+---> Groq (up to 15 keys)
(lib/providers/registry)  |       GPT-OSS-120B/20B, Llama 3.3 70B, Qwen3-32B,
                          |       Llama-4-Scout, Llama-3.1-8B
                          |
                          +---> SambaNova (up to 8 keys)
                          |       DeepSeek V3.2, V3.1, Maverick
                          |
                          +---> Cerebras (up to 8 keys)
                          |       Qwen 3 235B, Llama 3.1 8B
                          |
                          +---> Cohere / Mistral (up to 4 keys each)
                          |       Command R+ / Codestral + Pixtral
                          |
                          +---> OpenRouter (up to 5 keys)
                          |       Deep free-tier pool (:free suffix)
                          |
                          +---> Ollama (local, no key)
                                  Final offline fallback
```

## SSE Event Types

| Event         | Payload                        | Description                          |
|---------------|--------------------------------|--------------------------------------|
| `token`       | `{ text: string }`             | Visible response text chunk          |
| `thinking`    | `{ text: string }`             | Model reasoning (collapsed in UI)    |
| `image`       | `{ url, source }`              | Generated image (data URL)           |
| `sources`     | `{ sources: [...] }`           | Grounding sources for a Live answer  |
| `auto_routed` | `{ to, label }`                | Which model Auto mode selected       |
| `usage`       | `{ promptTokens, completionTokens, cachedTokens, cacheHit }` | Token + prompt-cache accounting, emitted before `backend` |
| `backend`     | `{ label }`                    | Which provider/model actually served |
| `done`        | `{ usage, model, tokensOut }`  | Stream complete, final metadata      |
| `error`       | `{ message, code }`            | Recoverable error surfaced to client |

The full union, serialiser, and parser live in `lib/streaming/events.ts`. Clients should ignore any event whose `type` they do not recognise, so the protocol can add events without breaking consumers.

## Key Design Decisions

1. **No streaming for Vision** -- Groq's vision endpoint doesn't support streaming; response is sent as a single `token` event.
2. **Round-robin key rotation** -- `Date.now() % keys.length` offset so different requests start from different keys, spreading rate-limit pressure evenly.
3. **Fire-and-forget logging** -- `ai_events` inserts never block the chat response. Errors are swallowed.
4. **50-session cap** -- Oldest sessions auto-deleted when a user creates session #51.
5. **Prompt injection defence** -- All untrusted content (files, search results, tool output, memories) wrapped with explicit boundary markers before prompt injection.
6. **Singleton env** -- `env()` loads and validates environment variables once per process, avoiding repeated `process.env` reads.
7. **Frontier engines are opt-in** -- premium steps (Opus 4.7, GPT-5.5, Gemini 3.5 Pro) sit at the head of the chains but are skipped at runtime when their key is absent, so a free-only deployment runs unchanged.
8. **Prompt caching is provider-normalised** -- one call in `cache.ts` applies the right mechanism for whichever engine wins the step, and it is a no-op for short prompts so it never adds a write penalty.
9. **Cost is data, not code** -- the `cost.ts` price table is editable for negotiated rates; an unpriced model is treated as free.
