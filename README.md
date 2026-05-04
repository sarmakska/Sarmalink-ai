# SarmaLink-AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-R2_%2B_Workers_AI-F38020?logo=cloudflare&logoColor=white)](https://cloudflare.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)
[![Open Source](https://img.shields.io/badge/Open_Source-%E2%9D%A4-red)](https://github.com/sarmakska/sarmalink-ai)

[![AI Engines](https://img.shields.io/badge/AI_Engines-36-blueviolet)](#architecture)
[![Providers](https://img.shields.io/badge/Providers-7-blue)](#powered-by-7-providers)
[![Failover Depth](https://img.shields.io/badge/Max_Failover-14_engines-green)](#the-6-modes)
[![Fastest Response](https://img.shields.io/badge/Fastest-41ms-brightgreen)](#the-6-modes)
[![DeepSeek V3.2](https://img.shields.io/badge/Primary-DeepSeek_V3.2_(685B)-purple)](#the-6-modes)

## Star History

<a href="https://www.star-history.com/#sarmakska/Sarmalink-ai&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sarmakska/Sarmalink-ai&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sarmakska/Sarmalink-ai&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sarmakska/Sarmalink-ai&type=Date" />
 </picture>
</a>

**An open-source, multi-provider AI backend with automatic failover.**

Built by [Sarma Linux](https://sarmalinux.com) — 17 months of development, open-sourced for everyone.

> 🚀 **v1.1.0 shipped on 2026-04-20** — OpenAI-compatible proxy at `/api/v1/chat/completions`, four new free-tier providers (GitHub Models · Cohere · Mistral · Ollama local fallback), per-step fallback metrics, 110 tests green. See [CHANGELOG.md](CHANGELOG.md) for the full list and [docs/OPEN-ISSUES.md](docs/OPEN-ISSUES.md) for what's open for contributors.

> **What this repo is:** a headless Next.js **backend** — the failover engine, auto-router, live tools, Supabase schema, and REST/SSE API (`/api/ai-chat`). It is **not** a drop-in ChatGPT clone UI. If you want the full hosted product with dark mode, markdown rendering, and thinking traces, see [sarmalinux.com/products/sarmalink-ai](https://sarmalinux.com/products/sarmalink-ai). To build your own UI on top, point any chat client at the SSE endpoint — see [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the streaming protocol.

---

## What is SarmaLink-AI?

SarmaLink-AI is a production-ready AI chat backend that routes every message through a **failover** of AI engines. If one engine is busy, the next fires in under 50 milliseconds. Users never see errors — they always get an answer.

- **36 AI engines** across 7 providers (Groq, SambaNova, Cerebras, Google Gemini, OpenRouter, Cloudflare, Tavily)
- **Smart auto-routing** — detects whether you're asking for code, web search, quick answers, or deep reasoning, and picks the right model automatically
- **Live tools** — real-time exchange rates (ECB), weather (any city), container/shipment tracking (9 shipping lines)
- **Image generation & editing** — FLUX.2 klein (instruction-following, not noise-based)
- **Persistent memory** — learns who you are across conversations (like ChatGPT memory)
- **Document analysis** — upload PDFs, Excel, Word files (up to 10 at once)
- **50 saved conversations** per user, oldest auto-deleted
- **SSE streaming API** with separate `token` and `thinking` event types — bring your own UI, or consume from any HTTP client

**Total cost: the providers' free tiers. No credit card needed for any of them.**

---

## Architecture

```
User sends message
    ↓
Auto-router (regex, instant) → Smart / Reasoner / Live / Fast / Coder / Vision
    ↓
Live tools fire first (exchange rates, weather, tracking)
    ↓
Failover engine (up to 14 steps):
    Step 1: SambaNova DeepSeek V3.2 (685B) → try all keys
    Step 2: Groq GPT-OSS 120B → try all keys
    Step 3: Llama 4 Maverick → try all keys
    ...
    Step 14: OpenRouter Nemotron Nano 30B :free
    ↓
Each step: if 429/5xx → next step in <50ms
    ↓
Stream tokens via SSE → render markdown → save to Supabase
    ↓
Extract memories in background (Groq Llama 8B)
```

---

## The 6 Modes

| Mode | Primary Engine | Failover Depth | Best For |
|---|---|---|---|
| **Smart** | DeepSeek V3.2 (685B MoE) | 14 engines | Emails, summaries, analysis, writing |
| **Reasoner** | DeepSeek V3.2 + V3.1 | 10 engines | Complex logic, maths, strategy |
| **Live** | Gemini 2.5 Flash + Google Search | 4 engines | Current events, weather, prices |
| **Fast** | Groq GPT-OSS 20B (41ms) | 9 engines | Quick lookups, one-liners |
| **Coder** | DeepSeek V3.2 | 9 engines | Code generation, debugging, refactoring |
| **Vision** | Llama-4 Scout 17B | 6 engines | Image understanding, OCR, charts |

---

## Built-in Live Tools (no API keys needed)

| Tool | Provider | What it does |
|---|---|---|
| **Exchange rates** | frankfurter.app (ECB) | "Convert 500 GBP to EUR" → instant live rate |
| **Weather** | Open-Meteo | "Weather in London" → current + 3-day forecast |
| **Container tracking** | Tavily + carrier detection | "Track MSCU1234567" → detects carrier, searches status |

---

## AI-Powered Setup (Recommended)

**Don't want to read docs? Let AI set it up for you.**

SarmaLink-AI ships with a built-in setup skill. Open the repo in any AI coding tool, paste one prompt, and the AI walks you through everything — Supabase, API keys, deployment. Zero terminal knowledge needed.

| Tool | How to start |
|---|---|
| **Claude Code** | Open repo in terminal → the skill loads automatically. Say "help me set up SarmaLink-AI" |
| **Cursor** | Open repo → Cmd+K → paste the prompt from [`docs/SETUP-AI.md`](docs/SETUP-AI.md) |
| **VS Code + Copilot** | Open repo → Copilot Chat → paste the prompt |
| **ChatGPT / Gemini** | Paste the prompt from [`docs/SETUP-AI.md`](docs/SETUP-AI.md) |

> **Total time: ~15 minutes. The AI handles dependencies, environment configuration, database migration, key validation, and optional Vercel deployment.**

If you prefer manual setup, follow the steps below.

---

## Quick Start — Minimum Setup (3 env vars, ~10 min)

You only need **Supabase** (database + auth) and **Groq** (chat inference) to get a working assistant. Everything else is optional.

### 1. Clone & install

```bash
git clone https://github.com/sarmakska/sarmalink-ai.git
cd sarmalink-ai
npm install
```

### 2. Get two free API keys

| Provider | Sign up | What you get |
|---|---|---|
| **Supabase** | [supabase.com](https://supabase.com) | Database + auth (1GB free) |
| **Groq** | [console.groq.com](https://console.groq.com) | GPT-OSS 120B, Llama 3.3, Qwen 3 — fastest inference |

### 3. Configure

```bash
cp .env.example .env.local
```

Set these 3 variables in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
GROQ_API_KEY="gsk_your_key_here"
```

### 4. Set up the database

Run the SQL in `supabase/migrations/001_sarmalink_ai.sql` in your Supabase SQL editor.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll have a fully working chat with Fast and Smart modes via Groq.

---

## Full Setup (all 7 providers)

Adding more providers unlocks all 36 engines, 6 modes, and 14-step failover. Every provider below is free with no credit card.

| Provider | Sign up | What it unlocks |
|---|---|---|
| **SambaNova** | [cloud.sambanova.ai](https://cloud.sambanova.ai) | DeepSeek V3.2 (685B) — primary Smart/Reasoner/Coder engine |
| **Cerebras** | [cloud.cerebras.ai](https://cloud.cerebras.ai) | 2,000 tok/sec inference — Fast mode fallback |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Live web search grounding — Live mode |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | 17+ free models — ultimate failover safety net |
| **Tavily** | [app.tavily.com](https://app.tavily.com) | Web search (1,000/month) — container tracking, research |
| **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) | FLUX.2 image gen + R2 file storage |

Add each key to `.env.local` — see `.env.example` for the full list. The failover architecture automatically picks up any configured provider.

> **Deep dive:** See the [Complete Setup Guide](https://github.com/sarmakska/sarmalink-ai/wiki/Complete-Setup-Guide) in the wiki for step-by-step instructions, database schema setup, and deployment to Vercel.

---

## Documentation

| Resource | Description |
|---|---|
| **[How It Works](https://sarmalinux.com/products/sarmalink-ai/how-it-works)** | Complete technical breakdown — failover, tech choices, vs alternatives |
| **[How It Works (GitHub)](docs/HOW-IT-WORKS.md)** | Same content as markdown in the repo |
| **[Wiki](https://github.com/sarmakska/sarmalink-ai/wiki)** | 22-page knowledge base — setup guides, architecture, provider signup walkthroughs |
| **[Complete Setup Guide](https://github.com/sarmakska/sarmalink-ai/wiki/Complete-Setup-Guide)** | Step-by-step from zero to production |
| **[Architecture Overview](https://github.com/sarmakska/sarmalink-ai/wiki/Architecture-Overview)** | How the failover engine, auto-router, and live tools work |
| **[How Failover Works](https://github.com/sarmakska/sarmalink-ai/wiki/How-Failover-Works)** | Deep dive into the multi-provider failover logic |
| **[Environment Variables](https://github.com/sarmakska/sarmalink-ai/wiki/Environment-Variables)** | Every env var explained — required vs optional |
| **[Database Schema](https://github.com/sarmakska/sarmalink-ai/wiki/Database-Schema)** | Tables, RLS policies, and migration files |
| **[Adding a New Provider](https://github.com/sarmakska/sarmalink-ai/wiki/Adding-a-New-Provider)** | How to integrate any OpenAI-compatible API |
| **[Adding a New Live Tool](https://github.com/sarmakska/sarmalink-ai/wiki/Adding-a-New-Live-Tool)** | Build and register custom real-time tools |
| **[Deploying to Vercel](https://github.com/sarmakska/sarmalink-ai/wiki/Deploying-to-Vercel)** | Production deployment checklist |
| **[Security & Prompt Injection](https://github.com/sarmakska/sarmalink-ai/wiki/Security-and-Prompt-Injection)** | How user content is sandboxed |
| **[FAQ](https://github.com/sarmakska/sarmalink-ai/wiki/FAQ)** | Common questions and troubleshooting |

Engineering docs are also available in the [`docs/`](docs/) folder: architecture, DB schema, env matrix, failure modes, deployment guides, the [cross-repo plugin system](docs/PLUGINS.md), the [Manus integration](docs/MANUS.md), and the full white-label [**Make It Yours**](docs/MAKE-IT-YOURS.md) guide (fork → v0 front end → Supabase → deploy).

### Make it yours

Want to ship your own AI gateway under your brand? **Read [`docs/MAKE-IT-YOURS.md`](docs/MAKE-IT-YOURS.md)** — it has a copy-paste [v0](https://v0.dev) prompt that generates a complete branded front end (home, pricing, docs, login, signup, dashboard with usage charts and API key CRUD), instructions for swapping logo, colours, and copy, and the full Supabase + Vercel deploy path. Pair it with [terraform-stack](https://github.com/sarmakska/terraform-stack) for one-command reproducibility.

### Try Manus (extra credits)

The Manus integration in this repo lets you delegate long-running agentic tasks. New users signing up via this link get **500 extra credits**:

> [Sign up for Manus →](https://manus.im/invitation/AIRTDVWVEWKCK4R)
>
> *Forking this repo? Swap the code above for your own Manus invite — see [`docs/MAKE-IT-YOURS.md`](docs/MAKE-IT-YOURS.md) for the full white-label checklist.*

---

## Scaling Tips

- **More capacity**: Create additional accounts on each provider (Gmail `+alias` trick works for most). Add the keys as `GROQ_API_KEY_2`, `_3`, etc. The failover automatically picks them up.
- **More models**: Add entries to `lib/ai-models.ts`. Any OpenAI-compatible provider works — just add the endpoint URL to `providerEndpoint()` and the key pool to `providerKeys()`.
- **More providers**: The failover architecture is provider-agnostic. Adding a new provider takes ~10 lines of code.

---

## Tech Stack

- **Framework**: Next.js 14 App Router + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth)
- **File Storage**: Cloudflare R2 (S3-compatible, 10GB free)
- **Image Gen**: Cloudflare Workers AI (FLUX.2 klein)
- **Deployment**: Vercel (or any Next.js host)

---

## Acknowledgements

SarmaLink-AI is built on the generous free tiers of these incredible platforms. A huge thank you to each team for making cutting-edge AI accessible to everyone:

- **[Groq](https://groq.com)** — For LPU inference chips that deliver tokens in 41ms. The fastest commercially available AI hardware.
- **[SambaNova](https://sambanova.ai)** — For hosting DeepSeek V3.2 (685B parameters) on their free cloud. This frontier model rivals GPT-4o and powers the Smart, Reasoner, and Coder modes.
- **[Cerebras](https://cerebras.ai)** — For the WSE-3 wafer-scale engine. 2,000 tokens per second on their free tier is genuinely mind-blowing.
- **[Google](https://ai.google.dev)** — For Gemini 2.5 Flash with built-in Google Search grounding. The Live mode wouldn't exist without it.
- **[OpenRouter](https://openrouter.ai)** — For aggregating 17+ free models into a single API. The ultimate safety net for failover fallback.
- **[Cloudflare](https://cloudflare.com)** — For Workers AI (FLUX.2 klein image generation), R2 storage (10GB free, unlimited egress), and rock-solid infrastructure.
- **[Tavily](https://tavily.com)** — For structured web search that actually returns useful results. Powers the weather, exchange rate, and container tracking tools.
- **[Black Forest Labs](https://blackforestlabs.ai)** — For FLUX.2 klein, the image model that actually follows editing instructions ("change to emerald green" and it does).
- **[DeepSeek](https://deepseek.com)** — For open-sourcing V3.2, a 685B MoE model that outscores GPT-4o on maths (MATH-500: 90.2% vs 76.6%) and code (HumanEval: 92.7% vs 90.2%).
- **[Meta](https://ai.meta.com)** — For the Llama model family. Llama-4 Scout, Llama 3.3 70B, and Llama 3.1 8B are backbone models across multiple failover steps.
- **[Alibaba/Qwen](https://qwenlm.github.io)** — For Qwen 3 235B and Qwen 3 32B. Excellent multilingual reasoning at no cost.
- **[Open-Meteo](https://open-meteo.com)** — For truly free weather data with no API key required. Global coverage, 3-day forecasts, geocoding included.
- **[European Central Bank / Frankfurter](https://frankfurter.app)** — For real-time exchange rate data, free forever, no key needed.

Without these teams, SarmaLink-AI would cost thousands per month. Instead, it costs nothing.

---

## Build on this

This is a backend. You're invited to build on top of it. Some ideas that are fully open for contributors — grab an issue or open a PR:

- **Reference UI** — a clean Next.js chat UI in `/examples/ui` that consumes `/api/ai-chat` SSE. Start with the markdown renderer + thinking-block toggle.
- **Discord/Slack bot** — wrap the SSE endpoint in a bot. The failover engine already handles rate limits, so you just stream tokens into a message.
- **CLI client** — `npx sarmalink-chat "hello"` that streams a response from your deployment.
- **Python / Go / Rust SDK** — a thin client for the `/api/ai-chat` contract. The protocol is documented in [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
- **New providers** — Mistral, Anthropic, Together, Fireworks, DeepInfra. Adding a provider is ~10 lines (see [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-new-ai-provider)).
- **New live tools** — stock prices, flight status, package tracking, calendar, email search. The tool-calling loop is already wired.
- **Config-driven models** — move `lib/ai-models.ts` definitions to `models.yaml` or a Supabase `models` table so operators can tune failover without editing TypeScript.
- **Admin dashboard UI** — `/api/admin/health` already returns per-provider stats, dead-model detection, and 24h latency. Build the React page that reads it.
- **Supabase CLI migration** — `supabase/config.toml` is shipped (run `npx supabase db push`), but a seed script with a demo user would make first-boot even smoother.

See [`good first issue`](https://github.com/sarmakska/sarmalink-ai/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/sarmakska/sarmalink-ai/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) on the issue tracker.

---

## OpenAI-compatible proxy

SarmaLink-AI can expose its failover engine at `/api/v1/chat/completions` using the OpenAI chat-completions JSON contract. That means any tool that already speaks OpenAI — Cursor, VS Code AI plugins, AnythingLLM, LangChain, LlamaIndex, the official `openai` Python/Node SDKs — can be pointed at your SarmaLink deployment as a drop-in replacement for `api.openai.com`.

**Opt-in:** set `ENABLE_OPENAI_PROXY=true` in your environment. When unset, the route returns 404.

**Example (streaming):**

```bash
curl https://your-deploy.vercel.app/api/v1/chat/completions \
  -H "Authorization: Bearer any-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

**Model mapping:** the `model` field in the request is mapped to a SarmaLink mode based on keyword heuristics — `gpt-4o` / `claude` → Smart, `o1` / `o3-mini` / `deepseek-reasoner` → Reasoner, `codestral` / `qwen-coder` → Coder, `pixtral` / `llama-scout` → Vision, `gemini-flash` / `gpt-4o-mini` / `llama-8b` → Fast. The original model string you sent is echoed back in every response chunk so clients stay happy.

**Who uses this:** point Cursor's "Override OpenAI base URL" at `https://your-deploy.vercel.app/api/v1`, or paste the same URL into AnythingLLM's custom OpenAI endpoint field. Any non-empty bearer token is accepted.

**Security warning:** the endpoint trusts any bearer token. Protect it with a firewall, a reverse proxy (Cloudflare Access, Tailscale, nginx `auth_basic`), or simply leave `ENABLE_OPENAI_PROXY` unset in production if this concerns you. There is no per-user quota on this route — it's designed for personal/team use of your own deployment.

---

## License

MIT License — see [LICENSE](LICENSE).

Built with care by [Sarma Linux](https://sarmalinux.com).

---

## More open source by Sarma

Part of a portfolio of twelve production-shaped open-source repositories built and maintained by [Sarma](https://sarmalinux.com).

| Repository | What it is |
|---|---|
| [Sarmalink-ai](https://github.com/sarmakska/Sarmalink-ai) | Multi-provider OpenAI-compatible AI gateway with 14-engine failover and intent-based plugin auto-routing |
| [agent-orchestrator](https://github.com/sarmakska/agent-orchestrator) | Durable multi-agent workflows in TypeScript with deterministic replay and Inspector UI |
| [voice-agent-starter](https://github.com/sarmakska/voice-agent-starter) | Sub-second full-duplex voice agent loop. WebRTC, mediasoup, pluggable STT / LLM / TTS |
| [ai-eval-runner](https://github.com/sarmakska/ai-eval-runner) | Evals as code. Python, DuckDB, FastAPI viewer, regression mode for CI |
| [mcp-server-toolkit](https://github.com/sarmakska/mcp-server-toolkit) | Production Model Context Protocol server starter (Python / FastAPI) |
| [local-llm-router](https://github.com/sarmakska/local-llm-router) | OpenAI-compatible proxy that routes to Ollama or cloud providers based on policy |
| [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf) | Minimal end-to-end RAG starter for PDF corpora |
| [receipt-scanner](https://github.com/sarmakska/receipt-scanner) | Vision OCR for receipts with Zod-validated JSON output |
| [webhook-to-email](https://github.com/sarmakska/webhook-to-email) | Webhook receiver that forwards events to email via Resend |
| [k8s-ops-toolkit](https://github.com/sarmakska/k8s-ops-toolkit) | Helm chart for shipping Next.js to Kubernetes with full observability stack |
| [terraform-stack](https://github.com/sarmakska/terraform-stack) | Vercel + Supabase + Cloudflare + DigitalOcean modules in one Terraform repo |
| [staff-portal](https://github.com/sarmakska/staff-portal) | Open-source HR / ops portal — leave, attendance, expenses, kiosk mode |

Engineering essays at [sarmalinux.com/blog](https://sarmalinux.com/blog) &middot; All projects at [sarmalinux.com/open-source](https://sarmalinux.com/open-source)
