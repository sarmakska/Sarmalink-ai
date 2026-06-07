# SarmaLink-AI

Open-source multi-provider AI assistant with automatic failover. Built by Sarma Linux (sarmalinux.com).

## Architecture

- **Framework:** Next.js 16 App Router + TypeScript
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **File storage:** Cloudflare R2 (optional)
- **Image gen:** Cloudflare Workers AI FLUX.2 klein (optional)
- **Deployment:** Vercel (or any Next.js host)

## Key directories

- `app/api/ai-chat/route.ts` — thin route handler (~30 lines), delegates to orchestrator
- `lib/services/` — 8 service modules (chat-orchestrator, intent-router, quota-service, streaming-service, etc.)
- `lib/router/index.ts` — unified intent detection with `routeIntent()` entrypoint
- `lib/providers/` — provider registry, failover runner, prompt caching (`cache.ts`), cost accounting (`cost.ts`)
- `lib/streaming/events.ts` — typed structured-streaming SSE protocol
- `lib/plugins/mcp.ts` — MCP JSON-RPC tool-call passthrough
- `lib/env/validate.ts` — environment variable validation
- `lib/supabase/` — Supabase client setup (server + admin)
- `supabase/migrations/001_sarmalink_ai.sql` — database schema (4 tables)
- `__tests__/` — 153 tests across 11 suites (vitest), including an end-to-end frontier flow with fixtures
- `docs/` — ARCHITECTURE, DB-SCHEMA, ENV-MATRIX, FAILURE-MODES, DEPLOY

## Environment variables

See `.env.example` for the full list. Minimum required:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `GROQ_API_KEY` — at least one chat provider

Optional chat providers: SambaNova, Cerebras, Google Gemini, GitHub Models (GPT-5.5, o3-mini), Anthropic (Opus 4.7, paid), OpenRouter, Cohere, Mistral, Ollama. Optional tool providers: Tavily (search), Cloudflare (image gen + R2). Optional toggles: `ENABLE_PROMPT_CACHE`, `ENABLE_OPENAI_PROXY`, `ENABLE_PLUGIN_AUTOROUTE`.

## Commands

- `npm test` — run vitest suite (153 tests)
- `npx tsc --noEmit` — typecheck
- `npm run build` — production build
- `npm run dev` — development server

## Setup for new deployers

If someone asks you to help them set up SarmaLink-AI, follow the guide in `docs/SETUP-AI.md`. It walks through every step: Supabase project creation, API key collection, `.env.local` creation, database migration, build verification, and optional Vercel deployment.

## Contributing

PRs welcome. Run `npm test` and `npx tsc --noEmit` before committing. See `CONTRIBUTING.md` for details. If you fix something during setup, please submit a PR back to the upstream repo at github.com/sarmakska/sarmalink-ai.
