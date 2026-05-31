# How SarmaLink-AI Works

The complete technical breakdown. How 74 engine entries across ten chat providers deliver near-continuous uptime, free on the free tiers and frontier-grade when you add a premium key.

**Full visual version:** [sarmalinux.com/products/sarmalink-ai/how-it-works](https://sarmalinux.com/products/sarmalink-ai/how-it-works)

---

## The Problem

Every AI app has a single point of failure. You build on one provider, it returns a 429, and your users see an error. You switch to another, it goes down for maintenance, and you are back to the same story.

The problem is not that providers are unreliable. They are remarkably reliable 99 per cent of the time. The problem is that the 1 per cent is unpredictable, and your users experience 100 per cent of it.

## The Solution: Multi-Provider Failover

SarmaLink-AI treats every provider as a commodity. If one is busy, the next fires in under 50 milliseconds.

```
User sends: "Draft a follow-up email"

Auto-router -> Smart mode (up to 20-step failover)

Step 1 - Anthropic - Opus 4.7   (skipped if no ANTHROPIC_API_KEY)
Step 2 - GitHub Models - GPT-5.5 (skipped if no token)
Step 3 - Gemini 3.5 Pro          (skipped if no key)
Step 4 - SambaNova - DeepSeek V3.2 (685B)
  -> Key 3 (round-robin rotation across 8 keys)
  -> 200 OK - first token in 820ms
  -> the system prefix is served from the prompt cache
  -> Streaming...

User sees a polished email. No errors. No delay.
If a step returns 429, the next fires in 47ms.
```

### The numbers

- **47ms** to fail over between providers (faster than a human blink)
- **20** maximum failover steps (Smart mode)
- **74** engine entries across the six modes
- **0** times a user has seen a full-chain exhaustion error

---

## Why Each Technology Was Chosen

### Next.js 16 (App Router)
**Why:** Server components keep API keys server-side. App Router gives file-based routing, streaming responses, and edge deployment. The entire backend is API routes, no separate server needed.

**Why not Express:** Requires a separate server, no SSR, no edge. Two repos instead of one.

### TypeScript
**Why:** Catches provider API shape changes at compile time. When SambaNova changes their response format, TypeScript finds every broken call site before users do.

**Why not JavaScript:** Runtime `undefined` errors are the number-one cause of production bugs. With ten different provider API shapes, type safety is non-negotiable.

### Supabase (PostgreSQL)
**Why:** Auth, database, and Row-Level Security in one service. RLS means even if the code has a bug, PostgreSQL refuses to serve User A's data to User B. Free tier: 1GB storage, unlimited API calls.

**Why not Firebase:** NoSQL makes analytics queries painful. No row-level security at the database level. Firestore pricing punishes high-read workloads like chat.

### Vercel
**Why:** Zero-config Next.js deployment. Push to GitHub, live in 60 seconds. Edge functions for streaming. But the app runs on ANY Next.js host — not locked in.

**Why not AWS/GCP:** 50x more configuration (ECS, ALB, Route53, ACM, CloudFront) for the same result. Complexity is the enemy for a solo dev shipping open source.

### SSE (Server-Sent Events)
**Why:** One-way server→client streaming — exactly what chat needs. Works through every proxy, CDN, and firewall. Native browser support. No library needed.

**Why not WebSockets:** Bidirectional, but chat only needs one direction. WebSockets break through corporate proxies and don't work on Vercel Edge.

### Cloudflare R2
**Why:** S3-compatible with zero egress fees. 10GB free. Stores uploads and generated images. Signed URLs expire in 7 days.

**Why not S3:** Egress fees. Why not Vercel Blob: limited free tier and vendor-locked.

### Vitest
**Why:** 151 tests in under a second. Same module resolution as Next.js. No config needed.

**Why not Jest:** Slower startup, requires ts-jest config, doesn't share Vite's module graph.

---

## What v1.3.0 adds

### Frontier adapters (opt-in)
Opus 4.7, GPT-5.5 and Gemini 3.5 Pro sit at the head of the Smart, Reasoner, Coder and Live chains. They are pure additions to the failover list: a step with no configured key is skipped at runtime, so a free-only deployment is unchanged. Anthropic is wired through its OpenAI-compatible endpoint, so it streams through the same pipeline as every other engine.

### Cross-provider prompt caching
The system prefix is large and identical across turns in a mode. `lib/providers/cache.ts` marks it cacheable using whatever the winning provider supports: Anthropic ephemeral breakpoints, an OpenAI-compatible `prompt_cache_key`, or Gemini implicit caching. Cache reads bill at a fraction of the input rate, and the cost dashboard accounts for them. Disable with `ENABLE_PROMPT_CACHE=false`.

### Structured streaming
Every SSE frame is a typed event from a documented union (`lib/streaming/events.ts`). A `usage` frame carrying prompt-cache hits is emitted just before `done`. Unknown event types should be ignored by clients, so the protocol grows without breaking consumers.

### MCP tool-call passthrough
`GET /api/v1/mcp` lists the tools a configured Model Context Protocol server exposes; `POST /api/v1/mcp` invokes one by name over JSON-RPC 2.0. Upstream auth comes from the plugin's configured token env var, never from the client.

### Per-model cost dashboards
`lib/providers/cost.ts` carries a list-price table and rolls the event log into a per-model USD breakdown with a paid/free split. The admin health endpoint returns it under a `cost` block. Free-tier-only deployments report zero.

---

## vs Alternatives

### ChatGPT Plus ($20/month)
- One provider, no failover
- No self-hosting, no data ownership
- Can't customize the system prompt
- Great product, but you're renting it

### LibreChat (free, open source)
- Supports multiple providers, but no automatic failover
- Requires Docker to deploy
- No AI-assisted setup
- Closest alternative, but a 429 = user sees an error

### OpenWebUI (free, open source)
- Beautiful UI, great Ollama integration
- Designed for local models — cloud failover is secondary
- Requires Docker
- Best choice for local LLMs, not cloud failover

### LobeChat (free, open source)
- Beautiful design, plugin marketplace
- Client-side API calls expose keys in the browser
- No server-side auth or RLS
- Fine for personal use, risky for teams

### LiteLLM (free, library)
- Supports 100+ providers, excellent failover config
- But it's a library — no UI, no auth, no database, no streaming
- You're building the entire app from scratch

### SarmaLink-AI (free, open source)
- 74 engine entries, ten chat providers, sub-50ms failover, optional frontier engines
- Cross-provider prompt caching, structured streaming, MCP passthrough, per-model cost dashboards
- Full app: auth, database, RLS, streaming, memory, tools
- AI-assisted setup: non-developers deploy in 15 minutes
- White-label via env vars: zero code changes
- **The only option with failover plus a full app plus an AI setup out of the box**

---

## AI-Assisted Setup

Every other open-source AI project requires Docker, terminal commands, and documentation reading.

SarmaLink-AI ships with a setup skill. Clone the repo, open in any AI coding tool, say "help me set up":

```
git clone https://github.com/sarmakska/sarmalink-ai.git
cd sarmalink-ai
claude   # or open in Cursor / VS Code
> "Help me set up SarmaLink-AI"
```

The AI installs deps, walks you through free account creation, creates `.env.local`, runs the migration, tests every key, and deploys. 15 minutes, zero terminal knowledge.

Works with: Claude Code, Cursor, VS Code + Copilot, ChatGPT, Gemini.

See [docs/SETUP-AI.md](SETUP-AI.md) for the full setup prompt.

---

## The Economics

| Provider | Free tier | With key rotation | Daily capacity |
|---|---|---|---|
| Groq | 14,000 req/day/key | 9 keys | 126,000 req/day |
| SambaNova | 5,000 req/day/key | 8 keys | 40,000 req/day |
| Cerebras | 5,000 req/day/key | 4 keys | 20,000 req/day |
| Google Gemini | 250 req/day/key | 12 keys | 3,000 req/day |
| OpenRouter | 1,000 req/day | 5 keys | 5,000 req/day |
| Cloudflare | 10,000 neurons/day | Workers AI | 10,000 images/day |
| **Total** | | | **207,000+ req/day** |

For comparison: ChatGPT Plus at $20/user/month for 15,000 users is **$300,000/month**.

SarmaLink-AI serves the same 15,000 users at **$0/month** on the free tiers. Add a premium key for the cases that warrant it, and the per-model cost dashboard shows exactly what that spend is.

---

Built by [Sarma Linux](https://sarmalinux.com). MIT Licence. v1.3.0
