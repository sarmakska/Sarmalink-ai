# Cascade AI

**An open-source, multi-provider AI assistant with automatic failover.**

Built by [Sarma Linux](https://sarmalinux.com) — 17 months of development, open-sourced for everyone.

---

## What is Cascade AI?

Cascade AI is a production-ready AI chat assistant that routes every message through a **cascade** of AI engines. If one engine is busy, the next fires in under 50 milliseconds. Users never see errors — they always get an answer.

- **36 AI engines** across 7 providers (Groq, SambaNova, Cerebras, Google Gemini, OpenRouter, Cloudflare, Tavily)
- **Smart auto-routing** — detects whether you're asking for code, web search, quick answers, or deep reasoning, and picks the right model automatically
- **Live tools** — real-time exchange rates (ECB), weather (any city), container/shipment tracking (9 shipping lines)
- **Image generation & editing** — FLUX.2 klein (instruction-following, not noise-based)
- **Persistent memory** — learns who you are across conversations (like ChatGPT memory)
- **Document analysis** — upload PDFs, Excel, Word files (up to 10 at once)
- **50 saved conversations** per user, oldest auto-deleted
- **Dark & light mode**, markdown rendering, code highlighting, thinking traces

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
Cascade engine (up to 14 steps):
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

| Mode | Primary Engine | Cascade Depth | Best For |
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

## Quick Start

### 1. Clone

```bash
git clone https://github.com/sarmakska/cascade-ai.git
cd cascade-ai
npm install
```

### 2. Get your API keys (all free, no credit card)

| Provider | Sign up | What you get |
|---|---|---|
| **Supabase** | [supabase.com](https://supabase.com) | Database + auth (1GB free) |
| **Groq** | [console.groq.com](https://console.groq.com) | GPT-OSS 120B, Llama 3.3, Qwen 3 |
| **SambaNova** | [cloud.sambanova.ai](https://cloud.sambanova.ai) | DeepSeek V3.2 (685B frontier model) |
| **Cerebras** | [cloud.cerebras.ai](https://cloud.cerebras.ai) | 2,000 tok/sec inference |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Live web search grounding |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | 17+ free models as fallback |
| **Tavily** | [app.tavily.com](https://app.tavily.com) | Web search (1,000/month free) |
| **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) | FLUX.2 image gen + R2 storage |

### 3. Configure

```bash
cp .env.example .env.local
# Edit .env.local with your keys
```

### 4. Set up the database

Run the SQL in `supabase/migrations/001_cascade_ai.sql` in your Supabase SQL editor.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scaling Tips

- **More capacity**: Create additional accounts on each provider (Gmail `+alias` trick works for most). Add the keys as `GROQ_API_KEY_2`, `_3`, etc. The cascade automatically picks them up.
- **More models**: Add entries to `lib/ai-models.ts`. Any OpenAI-compatible provider works — just add the endpoint URL to `providerEndpoint()` and the key pool to `providerKeys()`.
- **More providers**: The cascade architecture is provider-agnostic. Adding a new provider takes ~10 lines of code.

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

Cascade AI is built on the generous free tiers of these incredible platforms. A huge thank you to each team for making cutting-edge AI accessible to everyone:

- **[Groq](https://groq.com)** — For LPU inference chips that deliver tokens in 41ms. The fastest commercially available AI hardware.
- **[SambaNova](https://sambanova.ai)** — For hosting DeepSeek V3.2 (685B parameters) on their free cloud. This frontier model rivals GPT-4o and powers the Smart, Reasoner, and Coder modes.
- **[Cerebras](https://cerebras.ai)** — For the WSE-3 wafer-scale engine. 2,000 tokens per second on their free tier is genuinely mind-blowing.
- **[Google](https://ai.google.dev)** — For Gemini 2.5 Flash with built-in Google Search grounding. The Live mode wouldn't exist without it.
- **[OpenRouter](https://openrouter.ai)** — For aggregating 17+ free models into a single API. The ultimate safety net for cascade fallback.
- **[Cloudflare](https://cloudflare.com)** — For Workers AI (FLUX.2 klein image generation), R2 storage (10GB free, unlimited egress), and rock-solid infrastructure.
- **[Tavily](https://tavily.com)** — For structured web search that actually returns useful results. Powers the weather, exchange rate, and container tracking tools.
- **[Black Forest Labs](https://blackforestlabs.ai)** — For FLUX.2 klein, the image model that actually follows editing instructions ("change to emerald green" and it does).
- **[DeepSeek](https://deepseek.com)** — For open-sourcing V3.2, a 685B MoE model that outscores GPT-4o on maths (MATH-500: 90.2% vs 76.6%) and code (HumanEval: 92.7% vs 90.2%).
- **[Meta](https://ai.meta.com)** — For the Llama model family. Llama-4 Scout, Llama 3.3 70B, and Llama 3.1 8B are backbone models across multiple cascade steps.
- **[Alibaba/Qwen](https://qwenlm.github.io)** — For Qwen 3 235B and Qwen 3 32B. Excellent multilingual reasoning at no cost.
- **[Open-Meteo](https://open-meteo.com)** — For truly free weather data with no API key required. Global coverage, 3-day forecasts, geocoding included.
- **[European Central Bank / Frankfurter](https://frankfurter.app)** — For real-time exchange rate data, free forever, no key needed.

Without these teams, Cascade AI would cost thousands per month. Instead, it costs nothing.

---

## License

MIT License — see [LICENSE](LICENSE).

Built with care by [Sarma Linux](https://sarmalinux.com).
