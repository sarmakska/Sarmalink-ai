# Changelog

All notable changes to SarmaLink-AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
