# Open issues & invitations to contribute

SarmaLink-AI was audited by two external critics in April 2026. Their feedback made the project better. This doc is the public record of what they said, what was fixed immediately, and what is still open for contributors.

If any of these resonate, copy the heading into a GitHub issue and start a PR. Every item below is a real, bounded task, no "build a UI, good luck."

> **Shipped in v1.3.0 (2026-05-31).** Frontier adapters (Opus 4.7, GPT-5.5, Gemini 3.5 Pro), cross-provider prompt caching, a typed structured-streaming protocol, MCP tool-call passthrough, and per-model cost dashboards. The GitHub Models, Cohere and Mistral provider tasks from Round 3 below are now done. The dependency-major-bump tasks are tracked as separate GitHub issues.

---

## Round 1 — surface critique

### ✅ FIXED · README framing ("missing frontend")

**Critic:** *"Your README promises a fully working chat UI, but `app/page.tsx` just redirects. Developers will clone this expecting a ChatGPT clone and find only API routes."*

**Fix (shipped):** [README.md](../README.md) now opens with a "What this repo is" callout that explicitly states this is a **headless backend**. The UI lives in the hosted product. The "50 saved conversations + dark mode" line was rewritten as "SSE streaming API with separate `token` and `thinking` events — bring your own UI."

### ✅ FIXED · Test coverage on the failover path

**Critic:** *"Coverage for `/api/` logic is effectively 0%. A project whose selling point is 14-engine failover needs integration tests for 429 and 5xx."*

**Fix (shipped):** [__tests__/failover.test.ts](../__tests__/failover.test.ts) exercises six scenarios: step-1 success, 429-then-fallthrough, total 5xx exhaustion, thrown network errors, skipping unconfigured providers, and `<think>` block separation. An end-to-end test ([__tests__/e2e-frontier-flow.test.ts](../__tests__/e2e-frontier-flow.test.ts)) drives the full failover, prompt-caching, usage and cost path against fixtures. 151 tests pass total.

### ✅ FIXED · Supabase CLI bootstrap

**Critic:** *"Onboarding tells users to copy/paste SQL into a web dashboard. Ship `supabase/config.toml` so `npx supabase db push` works."*

**Fix (shipped):** [supabase/config.toml](../supabase/config.toml) + [supabase/seed.sql](../supabase/seed.sql) are in. `npx supabase start` and `npx supabase db push` now work.

### 🟡 OPEN · Move model definitions out of TypeScript

**Critic:** *"`lib/ai-models.ts` pins specific model versions. OpenRouter and Groq deprecate model strings constantly. Users shouldn't edit TS to add a model."*

**Good fit for:** someone who's comfortable with TypeScript + schema design.

**Acceptance criteria:**
- Add a `models.yaml` (or Supabase `models` table) loader
- Keep the existing `MODELS` export as the default, but allow override via config
- Validate the shape at load time (zod or similar)
- Document "how to swap DeepSeek V3.2 for V4 without touching TS"

**Scope:** one PR, ~1 day. Label: `good first issue` after the schema is agreed.

### ⚠️ INCORRECT · "No observability / admin dashboard"

**Critic:** *"If SambaNova dies, the system silently falls back and you never know."*

**Reality:** [app/api/admin/health/route.ts](../app/api/admin/health/route.ts) already exists. It returns per-provider success rate, median latency, rate-limit counts, error counts, and a `deadModels` list over the last 24h.

**What IS open:** there is no frontend for this endpoint yet. A simple `/admin/health` React page that polls and renders this JSON is a great first contribution.

---

## Round 2 — deeper critique (architecture / performance / security)

### 🟡 OPEN · Edge runtime for the router

**Critic:** *"`route.ts` defaults to Node serverless with 800–2000ms cold starts. That wipes out 41ms Groq."*

**Why this isn't a one-line fix:** the orchestrator pulls in Supabase SSR cookies, PDF/Excel/Word parsers (`mammoth`, `xlsx`), and AWS SDK — none of which work on Edge runtime as-is.

**Acceptance criteria:**
- Split the router into a thin Edge handler that does auth + routing
- Move heavy parsers behind an internal Node-runtime endpoint invoked only when an attachment is present
- Measure cold-start delta before/after with `vercel logs --prod`
- Document any Supabase auth behaviour differences

**Scope:** 2–3 days. Label: `help wanted` · `performance`.

### 🟡 OPEN · Pre-auth IP rate limit

**Critic:** *"Every unauthenticated hit still calls `supabase.auth.getUser()` — a botnet burns your Supabase Auth free tier in minutes."*

**Acceptance criteria:**
- Add Upstash Redis-backed (or equivalent) IP rate limiter as middleware
- Reject >60 req/min per IP **before** Supabase is touched
- Make it opt-in via env vars so the default self-host path still works with zero Redis
- Add a counter event so abuse is visible in `/api/admin/health`

**Scope:** 1 day. Label: `help wanted` · `security`.

### ✅ FIXED · Silent tool failures

**Critic:** *"`lib/tools/run.ts` swallows every tool error with `continue`. Revoked Tavily key = invisible."*

**Fix (shipped):** [lib/tools/run.ts](../lib/tools/run.ts) now accepts an `onFailure` callback. The chat orchestrator wires this into `logEvent()` so every tool error lands in `ai_events` with `event_type: 'error'` and `backend: 'tool:<name>'`. A `console.error` also fires unconditionally. The admin health endpoint already aggregates these.

### 🟡 OPEN · Break up the chat orchestrator

**Critic:** *"`orchestrateChat` is a 400-line god function. Intent, quota, memory, attachments, tools, search, image, SSE — all one block."*

**Why this is a good contribution:** the orchestrator already imports 7+ service modules. The refactor is mostly extracting the flow into a pipeline, not inventing new abstractions.

**Acceptance criteria:**
- Define a `ChatContext` type carrying userId, model, messages, quota, etc.
- Extract three phases: `preprocess(ctx)`, `execute(ctx)`, `streamResponse(ctx)`
- Each service module returns a mutated context instead of being called inline
- Existing tests must still pass; add a test per phase

**Scope:** 2 days. Label: `refactor` · `help wanted`.

### 🟡 OPEN · Replace hand-rolled SSE parsing

**Critic:** *"`buf += dec.decode` in `failover.ts` is brittle across 7 providers. Use `eventsource-parser`."*

**Fair point.** The hand-rolled parser handles our current providers fine (the new tests cover 5 providers' SSE shapes), but migrating to `eventsource-parser` would be safer long-term and probably smaller.

**Acceptance criteria:**
- Swap the manual `buf.split('\n')` loop in [lib/providers/failover.ts](../lib/providers/failover.ts) for `eventsource-parser`
- `<think>` and `delta.reasoning` handling must still work
- All failover tests + 39 router tests must stay green
- Bundle-size delta noted in the PR

**Scope:** 1 day. Label: `good first issue` · `refactor`.

---

---

## Round 3 — free-tier provider expansion

A third reviewer pointed out that SarmaLink-AI is leaving frontier models on the table that are currently free. Every one of these is an OpenAI-compatible (or thin-wrapper) provider that can slot into the existing failover with ~10 lines of code per provider. Every one is a great first PR — scoped, bounded, and immediately user-visible.

### ✅ FIXED · GitHub Models (now GPT-5.5, `o3-mini`, `gpt-4o`, `gpt-4o-mini`)

**Shipped.** `github-models` is in `ProviderType` and the registry, authed with `GITHUB_MODELS_TOKEN`. GPT-5.5 leads Smart/Reasoner/Coder when a token is present, with o3-mini and gpt-4o-mini deeper in the chains. Rate limits documented in [ENV-MATRIX.md](ENV-MATRIX.md).

### 🟡 OPEN · Google Gemini 2.5 **Pro** (2M token context)

**Why it matters:** we already use Gemini 2.5 Flash for `Live` mode. Pro has a 2-million-token context window and is the *only* free engine that can ingest a full 800-page PDF in one request.

**Acceptance criteria:**
- Add `gemini-2.5-pro` as a new model entry
- Wire into a new `document` mode (or as step 1 of `smart` when a large attachment is present)
- Respect the 50 req/day free-tier limit — add quota tracking in `quota-service.ts`
- Fallthrough to Flash when quota is exhausted

**Scope:** 1 day. Label: `good first issue` · `providers`.

### ✅ FIXED · Cohere Command R+

**Shipped.** `cohere` is in `ProviderType`, using Cohere's OpenAI-compatibility endpoint. `command-r-plus-08-2024` is slotted into the Smart and Live chains.

### ✅ FIXED · Mistral La Plateforme (`Codestral`, `Pixtral-12B`)

**Shipped.** `mistral` is in `ProviderType` with the `https://api.mistral.ai/v1/chat/completions` endpoint. `codestral-latest` sits in the Coder chain and `pixtral-12b-2409` in the Vision chain. Free-tier limits documented in [ENV-MATRIX.md](ENV-MATRIX.md).

### 🟡 OPEN · Hugging Face Serverless Inference (the infinite fallback)

**Why it matters:** thousands of models, OpenAI-compatible `/v1/chat/completions` on each model's inference endpoint. Heavily rate-limited per hour but perfect as a step-14 failover — guarantees the engine almost never returns a hard failure.

**Acceptance criteria:**
- Add `huggingface` to `ProviderType`
- Endpoint pattern: `https://api-inference.huggingface.co/models/<model>/v1/chat/completions`
- Append `meta-llama/Llama-3.3-70B-Instruct` and `Qwen/Qwen2.5-72B-Instruct` to every failover as last-resort step
- Bonus: wire `black-forest-labs/FLUX.1-schnell` into `image-service.ts` as an alternative to Cloudflare Workers AI

**Scope:** 1–2 days. Label: `help wanted` · `providers` · `reliability`.

### 🟡 OPEN · Hyperbolic AI and NVIDIA NIM

**Why it matters:** Hyperbolic offers free Llama 3.1 70B and Qwen-Coder access. NVIDIA NIM (`build.nvidia.com`) gives 1,000 free credits against optimized Nemotron-70B.

**Acceptance criteria:**
- Add both providers to `ProviderType`
- Endpoints are OpenAI-compatible, so registry changes are minimal
- Add as failover fallbacks in `fast` and `coder` modes

**Scope:** 0.5 days each. Label: `good first issue` · `providers`.

### 🎯 Meta-goal: the "Ultimate `Coder` Mode stack"

Once all six providers above land, the `coder` failover can look like this:

```
Step 1: GitHub Models    → o3-mini           (deepest reasoning)
Step 2: Mistral          → codestral-latest  (code specialist)
Step 3: SambaNova        → DeepSeek V3.2     (speed + syntax)
Step 4: Cohere           → command-r-plus    (tool use)
Step 5: Groq             → gpt-oss-120b      (current default)
Step 6: Cerebras         → qwen-3-coder      (2000 tok/sec)
...
Step N: Hugging Face     → Llama-3.3-70B     (infinite safety net)
```

Zero dollars. Zero credit cards. The definitive free multi-model assistant.

---

## How to claim one

1. Open an issue using the **"Feature request"** template, paste the heading above, and say you're working on it.
2. Open a draft PR early — you'll get faster review.
3. All tests must pass (`npm test`), typecheck clean (`npx tsc --noEmit`), and `npm run build` must succeed.

CI will enforce all three. See [CONTRIBUTING.md](../CONTRIBUTING.md).
