# Changelog

All notable changes to SarmaLink-AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
