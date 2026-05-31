# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in SarmaLink-AI, please do not open a public GitHub issue. Email me directly at **sarma@sarmalinux.com** with a clear description of the issue, steps to reproduce, the potential impact, and a suggested fix if you have one. I treat every report confidentially and will keep the details private until a fix is released.

## Response Policy

I respond to every security report within 7 days. That first reply will confirm I have received the report and tell you whether I have reproduced the issue and what the likely remediation timeline is. I aim to ship a fix within 14 days of confirming a valid vulnerability, and I credit reporters in the release notes unless they ask to remain anonymous.

## Scope

SarmaLink-AI is provided as-is under the MIT Licence. The core repository is a reference implementation that you deploy on your own infrastructure with your own API keys. In scope are prompt injection in the failover orchestrator, authentication bypass in server-side route handlers, privilege escalation through Supabase service-role misuse, information disclosure via error messages or logs, and unsafe handling of user-uploaded files. Out of scope are vulnerabilities in third-party providers (report those to the provider), issues in forks or modified versions, denial of service through rate-limit exhaustion (a free-tier constraint, not a bug), and anything requiring physical access to your deployment.

## Supported Versions

Only the latest released version receives security updates. I recommend running the most recent tagged release.

## Security Practices in This Project

- **Secrets** are never committed. `.env.example` contains only placeholders, and every API key is supplied through environment variables.
- **Authentication** is enforced on every server-side route handler, which checks the Supabase user session before acting.
- **Privileged access** through `supabaseAdmin` (service role) is used only for cross-user operations that cannot be expressed via row-level security, and every such call is preceded by an explicit role check.
- **File uploads** are capped at 15 MB per file and 10 files per request, with MIME types validated server-side.
- **Signed URLs** for image downloads expire after 7 days and can be regenerated on demand.
- **Prompt sanitisation** wraps untrusted content (file extracts, web search results, user memories) in explicit boundary markers and strips invisible control characters, so the model treats it as data rather than instructions.
