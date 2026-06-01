# Changelog

All notable changes to SarmaLink-AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (v2 ten-feature drop)
- **Intent auto-routing** (`lib/v2/auto-route.ts`). Regex pre-filter plus Groq Llama 3.3 fallback. Gated behind `ENABLE_AUTO_ROUTE=1`.
- **Multi-step agent runner** (`POST /api/v1/agent`, `lib/v2/agent-runner.ts`). Planner, workers, synthesiser, SSE event stream. Caps: 5 steps, 60 s per worker.
- **MCP-shaped tool catalog** (`POST /api/v1/mcp/catalog`, `lib/v2/mcp-catalog.ts`). Bearer-protected via `MCP_INTERNAL_KEY`. Three demo tools (`current_time`, `random_uuid`, `echo`) plus an extensible `ToolDef` registry.
- **TTS cascade** (`POST /api/v1/tts`, `lib/v2/tts.ts`). Cloudflare MeloTTS first, Gemini TTS as paid fallback. Supports EN, ES, FR, ZH, JP, KR.
- **STT route** (`POST /api/v1/stt`, `lib/v2/stt.ts`). Groq Whisper first, Cloudflare Whisper fallback.
- **Live-data tool functions** (`lib/tools/live.ts`). `getWeather` (Open-Meteo), `getExchangeRates` (Frankfurter), `getNews` (Hacker News Algolia). All free, no key.
- **Image generation with key rotation** (`POST /api/v1/images/generate`, `lib/v2/image-gen.ts`). FLUX across up to 4 Cloudflare account/token pairs, optional R2 upload.
- **Quota tracker** (`GET /api/v1/quota`, `lib/v2/quota.ts`, `supabase/migrations/20260601_ai_quota.sql`). Per-user-today and company-wide totals by tier.
- **Smart suggestions** (`POST /api/v1/suggestions`, `lib/v2/suggestions.ts`). Three follow-up prompts via Groq Llama 3.3, low temperature, 120 token cap.
- **Reasoning-leak stripper, PDF export, XLSX export** (`lib/sanitize/reasoning.ts`, `POST /api/v1/export/pdf`, `POST /api/v1/export/xlsx`). Stateful stream stripper for `<think>` blocks; pdfkit for PDF; exceljs for XLSX (single- or multi-sheet).

### Added
- **Frontier provider adapters.** A new `anthropic` provider type wired through Anthropic's OpenAI-compatible endpoint (with the `anthropic-version` header), so Opus 4.7 streams through the same pipeline as every other engine. Opus 4.7, GPT-5.5 (via GitHub Models) and Gemini 3.5 Pro are promoted to the head of the Smart, Reasoner, Coder and Live failover chains. Each step is skipped at runtime when its provider has no configured key, so free-only deployments fall straight through to the existing free-tier engines. `ANTHROPIC_API_KEY` (and `_2` and so on) plus optional `ANTHROPIC_VERSION` are collected in `lib/env/validate.ts`.
- **Cross-provider prompt caching** (`lib/providers/cache.ts`). Normalises Anthropic ephemeral `cache_control` breakpoints, the OpenAI-compatible `prompt_cache_key` prefix, and Gemini implicit caching behind one pure call. The failover runner applies it to the stable system prefix, keyed on the selected mode. On by default; set `ENABLE_PROMPT_CACHE=false` to disable. A no-op for prompts below 1 KB.
- **Structured streaming protocol** (`lib/streaming/events.ts`). A typed discriminated union for every SSE frame (`token`, `thinking`, `backend`, `auto_routed`, `image`, `sources`, `usage`, `done`, `error`) with a serialiser, a validating parser, and a usage reader that normalises OpenAI and Anthropic cache-hit accounting. The runner now emits a `usage` frame carrying prompt-cache hits before the `backend` frame.
- **MCP tool-call passthrough** (`lib/plugins/mcp.ts`, `app/api/v1/mcp/`). JSON-RPC 2.0 `tools/list` and `tools/call` against any Model Context Protocol server over the Streamable HTTP transport, parsing both plain-JSON and SSE response bodies. `GET /api/v1/mcp?plugin=<id>` lists tools, `POST /api/v1/mcp` invokes one; upstream auth is taken from the plugin's configured token env var.
- **Per-model cost dashboards** (`lib/providers/cost.ts`). A May-2026 list-price table, a pure per-turn cost function that bills cached prompt tokens at the cached rate, and an aggregator that rolls the `ai_events` log into a per-model USD breakdown with a paid/free split. The admin health endpoint returns this under a `cost` block.
- End-to-end test (`__tests__/e2e-frontier-flow.test.ts`) with fixtures exercising the full failover, prompt-caching, usage and cost path. Test count is now 151, up from 110.

### Changed
- README rewritten as a product page with a Mermaid architecture diagram, a one-line tagline, a three-sentence overview, the updated six-mode table, and sections for the new features.
- Reconciled the provider count across code and docs. The gateway has ten chat providers (Anthropic, GitHub Models, Gemini, Groq, SambaNova, Cerebras, OpenRouter, Cohere, Mistral, Ollama); Cloudflare and Tavily power tools rather than chat. README and wiki no longer claim "seven providers" or "36 engines".
- CI now runs on Node 24.
- `package.json` version bumped to 1.3.0 and the description updated to describe the gateway feature set.

### Security
- Security disclosure address corrected to `security@sarmalinux.com` and an explicit supported-versions table added to `SECURITY.md`.
- MCP passthrough never accepts an upstream secret from the client; it reads the bearer token from the plugin's configured env var only.

## [1.2.0] — 2026-05-03

### Added
- **Cross-repo plugin system** — `lib/plugins/index.ts` registers the 10 sibling open-source repos as routable tools (voice-agent-starter, agent-orchestrator, ai-eval-runner, local-llm-router, mcp-server-toolkit, rag-over-pdf, receipt-scanner, webhook-to-email, k8s-ops-toolkit, terraform-stack). Each plugin is enabled when its endpoint env var is set; no dynamic discovery. See [`docs/PLUGINS.md`](docs/PLUGINS.md).
- **Intent-based plugin auto-routing** — `lib/services/plugin-autorouter.ts` detects task intent (research / voice / eval / workflow / rag / ocr) from user input pre-LLM and dispatches to the matching plugin endpoint when one is enabled. Gated by `ENABLE_PLUGIN_AUTOROUTE` env (default off). Falls through to the normal LLM path when no plugin matches.
- **Manus integration** — full client + webhook for [Manus](https://manus.im). Submit long-running browser/research tasks from chat; results stream back in. Real HMAC-SHA256 signature verification on the webhook.
- **Manus webhook persistence** — `supabase/migrations/002_manus_tasks.sql` schema + `lib/repositories/manus-tasks.ts` repository. Webhook upserts task state into `manus_tasks` table; new `GET /api/v1/manus/tasks/[id]` route serves the persisted record. Forkers apply the migration in their own Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in their Vercel env.
- **`/docs` page** — server-rendered list of all 10 plugins with badges, env-var status, repo links, and a Manus referral CTA. The CTA is on by default and overridable per-deployment via `NEXT_PUBLIC_MANUS_INVITE_CODE`.
- **`docs/MANUS.md`** — Manus integration guide (env vars, webhook setup, task lifecycle).
- **`docs/MAKE-IT-YOURS.md`** — full white-label guide. Copy-paste v0 prompt that generates a complete branded front end (home, pricing, docs, login, signup, dashboard with usage charts and API key CRUD), instructions for swapping logo/colours/copy, and the full Supabase + Vercel deploy path. Pairs with [terraform-stack](https://github.com/sarmakska/terraform-stack) for one-command reproducibility.

### Changed
- README updated with Manus invite link (`AIRTDVWVEWKCK4R`), cross-repo plugin section, and white-label guide pointer. Forkers are explicitly told to swap the invite code for their own — see `docs/MAKE-IT-YOURS.md`.
- Stale self-TODOs replaced with fork-swap guidance in `MANUS.md` and the white-label guide.

## [1.1.0] — 2026-04-19

### Added
- GitHub Actions CI (lint, typecheck, test, build) on every push and PR
- CodeQL security scanning
- Dependabot for weekly dependency updates
- Vitest test suite with unit tests for auto-router and failover ordering
- Zod-based environment variable validation at startup
- Prompt sanitization layer — untrusted content (file extracts, search results, user memories) is wrapped in explicit boundary markers
- `SECURITY.md` — vulnerability disclosure policy
- `CONTRIBUTING.md` — how to add providers, tools, and submit PRs
- Pull request template enforcing test/typecheck/lint checks
- `docs/ARCHITECTURE.md`, `docs/DB-SCHEMA.md`, `docs/ENV-MATRIX.md`, `docs/FAILURE-MODES.md`, `docs/DEPLOY.md` — engineering documentation
- Unified intent router (`lib/router/index.ts`) consolidating all detection logic into one entrypoint

### Changed
- Extracted provider registry (`lib/providers/registry.ts`) from monolithic route
- Extracted failover runner (`lib/providers/failover.ts`) from monolithic route
- Extracted system prompt builder (`lib/prompts/system.ts`) from monolithic route
- Replaced all `(x as any)` casts with typed Supabase repositories
- Shortened R2 image URL expiry from 30 days to 7 days
- Image gen endpoint now validates MIME types server-side
- README Quick Start split into "Minimum Setup" (Groq + Supabase, 3 env vars) and "Full Setup" (all 7 providers) to lower onboarding friction
- Extracted chat route into focused service modules (`lib/services/`) — route handler is now a thin coordinator

### Fixed
- `.env.example` listed `TAVILY_API_KEY_1` but `lib/env/validate.ts` expected `TAVILY_API_KEY` (no `_1` suffix) as the first key — aligned `.env.example` to match

### Security
- SSE stream chunk validator (`sanitizeStreamChunk`) — rejects non-string chunks, enforces 32KB cap, strips SSE protocol injection
- Invisible character stripping (`stripInvisibleChars`) — removes zero-width, bidi overrides, BOM, and soft-hyphen characters before database persistence
- All user-supplied content (files, search results, memories) now wrapped in structured markers before injection into the model context
- `supabaseAdmin` usage minimised — read paths moved to anon client with RLS where possible
- Environment variable validation prevents application boot with missing critical keys

## [1.0.0] — 2026-04-17

Initial public release.

### Added
- Multi-provider failover architecture across Groq, SambaNova, Cerebras, Google Gemini, OpenRouter, Cloudflare, and Tavily
- 6 specialised modes (Smart, Reasoner, Live, Fast, Coder, Vision) with 7–14 engine failover depth
- Auto-router detects intent from message text and routes to the right mode
- Live tools — exchange rates (ECB), weather (Open-Meteo), container tracking (9 shipping lines)
- Image generation and instruction-following editing via FLUX.2 klein
- Persistent memory — extracts user facts after conversations and injects them into future chats
- Document analysis for PDF, Excel, and Word files (up to 10 per conversation)
- Per-user daily quota enforcement
- Real-time SSE streaming with markdown rendering
- 50 saved conversations per user with oldest auto-deletion
- Supabase Auth integration
- Cloudflare R2 file storage
- MIT License
