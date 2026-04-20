# How SarmaLink-AI Works

The complete technical breakdown. How 36 engines across 7 providers deliver 99.9999% uptime at zero cost.

**Full visual version:** [sarmalinux.com/products/sarmalink-ai/how-it-works](https://sarmalinux.com/products/sarmalink-ai/how-it-works)

---

## The Problem

Every AI app has a single point of failure. You build on OpenAI — it returns 429 — your users see an error. You switch to Anthropic — it goes down for maintenance — same story.

The problem is not that providers are unreliable. They're remarkably reliable 99% of the time. The problem is that the 1% is unpredictable, and your users experience 100% of it.

## The Solution: Multi-Provider Failover

SarmaLink-AI treats every provider as a commodity. If one is busy, the next fires in under 50 milliseconds.

```
User sends: "Draft a follow-up email"

Auto-router → Smart mode (14-engine failover)

Step 1 · SambaNova · DeepSeek V3.2 (685B)
  → Key 3 (round-robin rotation across 8 keys)
  → 200 OK · First token in 820ms
  → Streaming...

User sees a polished email. No errors. No delay.
If Step 1 had returned 429, Step 2 fires in 47ms.
```

### The numbers

- **47ms** to fail over between providers (faster than a human blink)
- **14** maximum failover steps (Smart mode)
- **0** times a user has seen a full-chain exhaustion error

---

## Why Each Technology Was Chosen

### Next.js 14 (App Router)
**Why:** Server components keep API keys server-side. App Router gives file-based routing, streaming responses, and edge deployment. The entire backend is API routes — no separate server needed.

**Why not Express:** Requires a separate server, no SSR, no edge. Two repos instead of one.

### TypeScript
**Why:** Catches provider API shape changes at compile time. When SambaNova changes their response format, TypeScript finds every broken call site before users do.

**Why not JavaScript:** Runtime `undefined` errors are the #1 cause of production bugs. With 7 different API shapes, type safety is non-negotiable.

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
**Why:** 90 tests in 800ms. Same module resolution as Next.js. No config needed.

**Why not Jest:** Slower startup, requires ts-jest config, doesn't share Vite's module graph.

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
- 36 engines, 7 providers, <50ms failover
- Full app: auth, database, RLS, streaming, memory, tools
- AI-assisted setup: non-developers deploy in 15 minutes
- White-label via env vars: zero code changes
- **The only option with failover + full app + AI setup out of the box**

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

For comparison: ChatGPT Plus at $20/user/month for 15,000 users = **$300,000/month**.

SarmaLink-AI serves the same 15,000 users at **$0/month**.

---

Built by [Sarma Linux](https://sarmalinux.com) — MIT License — v1.1.0
