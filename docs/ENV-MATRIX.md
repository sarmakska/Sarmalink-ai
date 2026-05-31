# SarmaLink-AI Environment Variable Matrix

Source: `.env.example`, `lib/env/validate.ts`

## App Configuration

| Variable                    | Required | Default                  | If Missing                                      |
|-----------------------------|----------|--------------------------|--------------------------------------------------|
| `NEXT_PUBLIC_APP_URL`       | No       | (none)                   | OpenRouter headers use GitHub repo URL as referer |
| `NEXT_PUBLIC_APP_NAME`      | No       | `SarmaLink-AI`           | OpenRouter X-Title header falls back to default   |
| `NEXT_PUBLIC_COMPANY_NAME`  | No       | `Your Company`           | Cosmetic only -- shown in system prompt           |

## Supabase (Auth + Database)

| Variable                       | Required | Default                           | If Missing                                          |
|--------------------------------|----------|-----------------------------------|------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`     | Yes*     | `https://placeholder.supabase.co` | App loads but all auth fails; returns 401 on chat     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Yes*     | `placeholder`                     | Same -- auth.getUser() will fail on every request     |
| `SUPABASE_SERVICE_ROLE_KEY`    | Yes*     | `placeholder`                     | All data operations fail (sessions, usage, events)    |

*The app does not crash on startup without Supabase vars -- it falls back to placeholder values and fails at runtime. In practice, nothing works without valid Supabase credentials.

## Groq (Primary Chat Provider)

| Variable            | Required | Pool Size | If Missing                                         |
|---------------------|----------|-----------|----------------------------------------------------|
| `GROQ_API_KEY`      | No**     | Up to 15  | Groq failover steps skipped                        |
| `GROQ_API_KEY_2`    | No       |           | Fewer keys = lower rate-limit headroom             |
| `GROQ_API_KEY_3`    | No       |           |                                                    |
| ... through `_15`   | No       |           |                                                    |

Keys named `GROQ_API_KEY`, `GROQ_API_KEY_2`, ..., `GROQ_API_KEY_15`.

## SambaNova (Frontier Reasoning)

| Variable              | Required | Pool Size | If Missing                                       |
|-----------------------|----------|-----------|--------------------------------------------------|
| `SAMBANOVA_API_KEY`   | No**     | Up to 8   | SambaNova steps skipped in failover              |
| `SAMBANOVA_API_KEY_2` | No       |           |                                                  |
| ... through `_8`      | No       |           |                                                  |

## Cerebras (Ultra-Fast Inference)

| Variable              | Required | Pool Size | If Missing                                       |
|-----------------------|----------|-----------|--------------------------------------------------|
| `CEREBRAS_API_KEY`    | No**     | Up to 8   | Cerebras steps skipped; Auto-router falls back   |
|                       |          |           | to regex classifier (no AI classification)       |
| `CEREBRAS_API_KEY_2`  | No       |           |                                                  |
| ... through `_8`      | No       |           |                                                  |

Cerebras is also used for the Auto-mode AI intent classifier (Llama 3.1 8B, ~200ms). Without Cerebras keys, Auto mode still works but uses the regex-based `autoRouteIntent()` instead.

## Google Gemini (Live Search + PDF)

| Variable                   | Required | Pool Size | If Missing                                      |
|----------------------------|----------|-----------|-------------------------------------------------|
| `GOOGLE_GEMINI_API_KEY`    | No**     | Up to 12  | Live mode fails (falls back to Tavily + Groq)   |
|                            |          |           | PDF extraction fails (returns error message)    |
| `GOOGLE_GEMINI_API_KEY_2`  | No       |           |                                                 |
| ... through `_12`          | No       |           |                                                 |
| `GEMINI_CHATBOT_KEY`       | No       | Up to 6   | Additional Gemini key pool (merged with above)  |
| ... through `_6`           | No       |           |                                                 |

Total Gemini key capacity: up to 18 keys.

## OpenRouter (Free Model Fallback)

| Variable              | Required | Pool Size | If Missing                                       |
|-----------------------|----------|-----------|--------------------------------------------------|
| `OPENROUTER_API_KEY`  | No**     | Up to 5   | Free-tier fallback models unavailable            |
|                       |          |           | Last-resort non-streaming fallback disabled      |
| `OPENROUTER_API_KEY_2`| No       |           |                                                  |
| ... through `_5`      | No       |           |                                                  |

## Anthropic (Opus 4.7, PAID frontier)

| Variable              | Required | Pool Size | If Missing                                        |
|-----------------------|----------|-----------|---------------------------------------------------|
| `ANTHROPIC_API_KEY`   | No       | Up to 4   | Opus 4.7 steps skipped; chains run free-tier only |
| `ANTHROPIC_API_KEY_2` | No       |           |                                                   |
| `ANTHROPIC_VERSION`   | No       | `2023-06-01` | Version header pinned to the default            |

This is the one paid provider. Wired through the OpenAI-compatible endpoint, so it streams through the same pipeline as every other engine.

## GitHub Models (GPT-5.5, o3-mini)

| Variable               | Required | Pool Size | If Missing                                  |
|------------------------|----------|-----------|---------------------------------------------|
| `GITHUB_MODELS_TOKEN`  | No       | Up to 4   | GPT-5.5 / o3-mini / gpt-4o steps skipped    |
| `GITHUB_MODELS_TOKEN_2`| No       |           |                                             |

## Cohere / Mistral

| Variable          | Required | Pool Size | If Missing                          |
|-------------------|----------|-----------|-------------------------------------|
| `COHERE_API_KEY`  | No       | Up to 4   | Command R+ steps skipped            |
| `MISTRAL_API_KEY` | No       | Up to 4   | Codestral and Pixtral steps skipped |

## Ollama (Local Fallback)

| Variable      | Required | Default                  | If Missing                                  |
|---------------|----------|--------------------------|---------------------------------------------|
| `OLLAMA_URL`  | No       | (unset; step disabled)   | Local offline fallback step is skipped      |

Set to your Ollama host URL (for example `http://localhost:11434`) to enable the final local failover step.

## Feature Toggles

| Variable                  | Required | Default | Effect                                                        |
|---------------------------|----------|---------|---------------------------------------------------------------|
| `ENABLE_PROMPT_CACHE`     | No       | `true`  | Set to `false` to disable cross-provider prompt caching       |
| `ENABLE_OPENAI_PROXY`     | No       | (unset) | Set to `true` to expose `/api/v1/chat/completions`            |
| `ENABLE_PLUGIN_AUTOROUTE` | No       | (unset) | Set to `true` to dispatch matched intents to sibling plugins  |
| `PLUGIN_MCP_SERVER_URL`   | No       | (unset) | MCP server endpoint for `/api/v1/mcp`                         |
| `PLUGIN_MCP_SERVER_TOKEN` | No       | (unset) | Bearer token sent to the MCP server                          |

## Tavily (Web Search)

| Variable           | Required | Pool Size | If Missing                                        |
|--------------------|----------|-----------|---------------------------------------------------|
| `TAVILY_API_KEY_1` | No       | Up to 8   | Search falls back to DuckDuckGo HTML scraping     |
| `TAVILY_API_KEY_2` | No       |           |                                                   |
| ... through `_8`   | No       |           |                                                   |

Note: Tavily keys use `_1` suffix for the first key (not bare `TAVILY_API_KEY`).

## Cloudflare Workers AI (Image Generation)

| Variable                   | Required | Pool Size | If Missing                                     |
|----------------------------|----------|-----------|------------------------------------------------|
| `CLOUDFLARE_ACCOUNT_ID`   | No       | Up to 4   | Image generation disabled; user sees error msg |
| `CLOUDFLARE_API_TOKEN`    | No       | pairs     | "Image generation isn't configured yet"        |
| `CLOUDFLARE_ACCOUNT_ID_2` | No       |           |                                                |
| `CLOUDFLARE_API_TOKEN_2`  | No       |           |                                                |
| ... through `_4`           | No       |           |                                                |

Account ID and API token must both be present to form a valid pair. Up to 4 pairs supported.

## Cloudflare R2 (File Storage)

| Variable               | Required | Default                         | If Missing                                   |
|------------------------|----------|---------------------------------|----------------------------------------------|
| `R2_ACCOUNT_ID`        | No       | (none)                          | File upload/storage disabled                 |
| `R2_ENDPOINT`          | No       | (none)                          | Files processed in-memory only (no persist)  |
| `R2_BUCKET_NAME`       | No       | `sarmalink-ai-attachments`      | Uses default bucket name                     |
| `R2_ACCESS_KEY_ID`     | No       | (none)                          | R2 config returns null; files not persisted  |
| `R2_SECRET_ACCESS_KEY` | No       | (none)                          | Same as above                                |

R2 is only enabled if `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are all set.

---

## Minimum Viable Configuration

The absolute minimum to get chat working:

1. Supabase: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
2. At least one chat provider key: `GROQ_API_KEY` or `SAMBANOVA_API_KEY` or `CEREBRAS_API_KEY` or `GOOGLE_GEMINI_API_KEY` or `OPENROUTER_API_KEY`

**Without any chat provider keys:** The app starts, the landing page renders, auth works, but every chat request will fail with "All providers failed" after exhausting an empty failover chain.

## Key Naming Convention

```
PROVIDER_API_KEY       -- first key (bare name)
PROVIDER_API_KEY_2     -- second key
PROVIDER_API_KEY_3     -- third key
...
```

Exception: Tavily uses `TAVILY_API_KEY_1` for the first key. Cloudflare uses paired `_ACCOUNT_ID` / `_API_TOKEN` suffixes.

Keys containing the string `placeholder` are ignored by the loader.
