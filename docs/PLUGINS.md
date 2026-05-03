# Cross-repo plugin system

SarmaLink-AI is the front door for a small constellation of open-source
tools that live in their own repos. The plugin system is the wiring that
lets a single SarmaLink-AI deployment route specialised tasks to the
right tool.

## Why a plugin system

The Sarma open-source toolkit is intentionally split into focused repos:

- `voice-agent-starter` — real-time voice loop
- `agent-orchestrator` — durable multi-agent workflows
- `ai-eval-runner` — evals as code
- `local-llm-router` — OpenAI-compatible policy router
- `mcp-server-toolkit` — Model Context Protocol server
- `rag-over-pdf` — PDF retrieval + Q&A
- `receipt-scanner` — vision OCR for receipts
- `webhook-to-email` — webhook to email
- `k8s-ops-toolkit` — Helm + observability stack
- `terraform-stack` — Vercel + Supabase + Cloudflare + DO

Each ships standalone. SarmaLink-AI optionally orchestrates them.

## How it works

Plugins are declared in [`lib/plugins/index.ts`](../lib/plugins/index.ts).
Each entry advertises:

- `id` — short identifier
- `repo` — public GitHub URL
- `purpose` — one-line description
- `intents` — what kinds of tasks it accepts
- `endpoint` — base URL of a deployed instance (env-driven)
- `auth` — bearer token from an env var (optional)
- `enabled` — true only when the endpoint env var is set

A plugin is **enabled** if its endpoint env var is set. There is no
discovery, no dynamic loading, no dependency injection. Add a plugin to
the registry, deploy with the env var, the plugin lights up.

## API

### List plugins

```
GET /api/v1/plugins
GET /api/v1/plugins?intent=workflow
```

Returns the registered plugins (optionally filtered by intent).

### Invoke a plugin

```
POST /api/v1/plugins/invoke
{
  "id": "agent-orchestrator",
  "path": "/runs",
  "method": "POST",
  "body": { ... }
}
```

The proxy layer adds the configured auth header and forwards the
request. The response is the plugin's response, plus the originating
plugin id.

## Adding a plugin

1. Edit `lib/plugins/index.ts` and add an entry.
2. Add the env vars to your deployment (`PLUGIN_X_URL`, `PLUGIN_X_TOKEN`).
3. Redeploy. The plugin shows up in `GET /api/v1/plugins` once enabled.

## Why this is small on purpose

SarmaLink-AI is a backend for personal projects, not a generic platform.
The plugin system has no marketplace, no signed manifests, no
lifecycle hooks. If you need those, build them on top — the registry is
straightforward to extend.

The point is: when I want SarmaLink-AI to delegate a long-running task
to agent-orchestrator, or hand a voice request to voice-agent-starter,
I want one place to wire it and one shape of call. That is what this
gives you.
