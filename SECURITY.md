# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in SarmaLink-AI, please **do not** open a public GitHub issue.

Instead, email **sarma@sarmalinux.com** with:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive an acknowledgement within 72 hours, and a resolution plan within 7 days.

## Scope

SarmaLink-AI is provided as-is under the MIT License. The core repository is a reference implementation; users deploy it under their own infrastructure with their own API keys.

**In scope:**

- Prompt injection vulnerabilities in the failover orchestrator
- Authentication bypass in server-side route handlers
- Privilege escalation via Supabase service-role misuse
- Information disclosure through error messages or logs
- Unsafe handling of user-uploaded files

**Out of scope:**

- Vulnerabilities in third-party providers (Groq, Gemini, etc.) — report to them directly
- Issues in forks or modified versions
- Denial of service via rate limit exhaustion (this is a free-tier constraint, not a bug)
- Issues requiring physical access to the deployment

## Supported Versions

Only the latest released version receives security updates. We recommend running the most recent tagged release.

## Disclosure Policy

- Security reports are kept confidential until a fix is released.
- Reporters are credited in the release notes unless they prefer to remain anonymous.
- Coordinated disclosure — we aim to publish a fix within 14 days of verification.

## Security Practices in This Project

- **Secrets** — never committed. `.env.example` contains only placeholders. Environment variables are required for all API keys.
- **Authentication** — every server-side route handler checks the Supabase user session before acting.
- **Privileged access** — `supabaseAdmin` (service role) is used only for cross-user operations that cannot be expressed via RLS. Every such call is preceded by an explicit role check.
- **File uploads** — capped at 15 MB per file, 10 files per request. MIME types validated server-side.
- **Signed URLs** — image download URLs expire after 7 days. Users can regenerate on demand.
- **Prompt sanitization** — untrusted content (file extracts, web search results, user memories) is wrapped in explicit boundary markers so the model treats it as data, not instructions.
