# SarmaLink-AI Failure Modes

How the system behaves when things go wrong.

## Provider Down (Full Outage)

**What happens:** The failover runner (`lib/providers/failover.ts`) tries each step in the model's `failover[]` array. If a provider is completely unreachable, `fetch()` throws an exception. The runner catches it, logs an `error` event to `ai_events`, and moves to the next failover step.

**User impact:** Transparent. The user sees a slightly slower response (each failed attempt adds network timeout latency). The `backend` SSE event tells the UI which provider actually served the response.

**Failover depth per model:**
- Smart: 14 steps (SambaNova -> Groq -> Cerebras -> OpenRouter free)
- Reasoner: 10 steps
- Coder: 9 steps
- Fast: 9 steps
- Vision: 6 steps
- Live: 4 steps (Gemini grounded -> Groq + Tavily search)

**All providers down:** If every step in the failover chain fails, the route handler calls `askOpenRouter()` as a non-streaming last resort. If that also fails, the user sees: "All N [model name] engines are rate-limited right now. Try Fast mode or wait a minute."

## Rate Limit (HTTP 429)

**What happens:** On a 429 response, the failover runner logs a `rate_limit` event and moves to the next API key in the current provider's pool. If all keys for that provider are exhausted, it moves to the next failover step (different provider/model).

**Key rotation strategy:** Keys are rotated round-robin per request using `Date.now() % keys.length` as the starting offset. This spreads load across keys so no single key is always tried first.

**Key pool sizes:**
```
Groq:       up to 15 keys
Cerebras:   up to 8 keys
SambaNova:  up to 8 keys
Gemini:     up to 18 keys
OpenRouter: up to 5 keys
Tavily:     up to 8 keys
Cloudflare: up to 4 account pairs
```

**User impact:** Usually invisible. With 15 Groq keys and 5 failover models, there are 75 attempts before Groq is fully exhausted. Combined with SambaNova, Cerebras, and OpenRouter, the total attempt count can exceed 100.

## Bad or Expired API Key

**What happens:** The provider returns a non-2xx status (typically 401 or 403). The failover runner treats this the same as any error -- logs it and moves to the next key. No distinction is made between rate limits, auth failures, and server errors beyond the status code logged.

**Detection:** Check `ai_events` for repeated `error` events with `status: '401'` or `status: '403'` on a specific `key_index`. There is no automated alerting -- this requires manual review.

**User impact:** Same as rate limiting. The bad key is skipped and the next key is tried. If the bad key is consistently first in rotation, it adds ~500ms latency per request until it rotates away.

## Network Outage (Timeouts)

**What happens:** `fetch()` calls to provider APIs use the runtime's default timeout (Vercel: 10s for serverless, longer for streaming). If a network timeout occurs, `fetch()` throws, the runner catches it, and moves to the next step.

**Vercel function timeout:** The entire route handler is a serverless function. Vercel's default timeout is 10 seconds for Hobby plans, 60 seconds for Pro. If the total failover exceeds this, Vercel kills the function and the client sees a broken stream.

**Mitigation:** The failover is ordered by quality AND speed. Fast providers (Groq ~44ms TTFT, Cerebras ~2000 tok/sec) are tried before slower ones. The OpenRouter free-tier fallback is last because it's the slowest.

**Client-side:** The SSE connection may timeout or close. The frontend should handle `EventSource` errors and show a retry prompt.

## Supabase Down

**What still works:** Nothing that requires a database. Specifically:

| Feature           | Works? | Why                                                 |
|-------------------|--------|-----------------------------------------------------|
| Auth check        | No     | `auth.getUser()` fails -> 401 for all requests      |
| Chat              | No     | Auth fails before reaching the model                |
| Session save      | No     | `ai_chat_sessions` unreachable                      |
| Usage quota       | No     | `ai_chat_usage` unreachable                         |
| Memory injection  | No*    | `ai_user_memories` unreachable                      |
| Event logging     | No*    | `ai_events` unreachable                             |
| Landing page      | Yes    | Static Next.js page, no DB dependency               |

*Memory fetch and event logging fail silently (try/catch, continue without). But since auth fails first, these code paths are never reached.

**Bottom line:** Supabase is a hard dependency. If it's down, no authenticated feature works.

## R2 Down (Cloudflare Object Storage)

**What happens:** File uploads that use the R2 persistence path fail. The application has two file-handling paths:

1. **R2 path (preferred):** File uploaded -> stored in R2 -> text pre-extracted -> sent to chat as `{ text: "..." }`.
2. **Base64 fallback:** File sent as raw base64 from the client -> extracted server-side in the route handler.

**If R2 is unreachable:**
- New file uploads fail if the upload flow depends on R2.
- Files already extracted (text cached in the chat message) continue to work.
- The route handler's fallback path (`f.data` base64) still processes files without R2.

**Image generation:** Not affected. Images use Cloudflare Workers AI (separate service from R2). Generated images are returned as inline data URLs, not stored in R2.

**User impact:** "Could not upload file" errors on the upload step. Chat itself continues working for text-only messages.

## Gemini Down (Live Mode + PDF)

**Live mode:** Gemini grounded search is the primary path. If all Gemini keys return 429 or errors:
1. Route handler logs `gemini_failed` fallback event.
2. Falls back to Tavily web search + Groq streaming.
3. If Tavily also fails, DuckDuckGo HTML scrape is tried.
4. Worst case: raw search results are shown without model summarization.

**PDF extraction:** If all Gemini keys fail, PDF extraction returns: `[Could not read this PDF. Please try a smaller file or paste the text directly.]` The chat continues without the file content.

## Cerebras Down (Auto-Router)

**Auto-mode AI classifier** uses Cerebras Llama 3.1 8B for intent classification. If Cerebras is down:
1. `classifyIntentAI()` tries all Cerebras keys, all fail.
2. Returns `'smart'` as the default intent.
3. The regex-based `autoRouteIntent()` is also available as a catch-all fallback.

**User impact:** Auto mode may route to Smart instead of the optimal model. The chat still works, just with potentially suboptimal model selection.

## Image Generation Failures

**Cloudflare FLUX** tries up to 4 account pairs. If all fail:
- User sees: "All 4 free image engines are busy right now -- try again in a minute."
- No image is generated. The text response is returned normally.
- There is a secondary Pollinations.ai URL generator (`generateImageUrl()`) defined but not used in the primary image path.

## Tavily Down (Web Search)

**Fallback chain:**
1. Tavily (all keys) -- structured results, relevance-scored
2. DuckDuckGo HTML scrape -- regex parsing of HTML results page
3. DuckDuckGo Instant Answer API -- `api.duckduckgo.com` JSON endpoint

If all three fail, the search returns `"Search unavailable."` and the model responds without live data.

## Summary: Resilience by Feature

```
Feature              Single point of failure?    Fallback depth
-----------------------------------------------------------------
Text chat            No                          14 steps (Smart)
Live search          No                          Gemini -> Tavily -> DDG
Image generation     Yes (Cloudflare only)       4 account pairs
PDF extraction       Yes (Gemini only)           Up to 18 keys
Excel extraction     No (local xlsx library)     Always works
Word extraction      No (local mammoth library)  Always works
Auth                 Yes (Supabase)              None
Session storage      Yes (Supabase)              None
```
