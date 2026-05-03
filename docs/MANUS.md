# Manus integration

Manus is an autonomous agent platform with a long-running task model.
You submit a task, it works on it for minutes-to-hours across browsing,
code, files, and tools, and you get back a result with artefacts.

This is different from a chat-completion provider. There is no streaming
token output you tail; there is a task you create, monitor, and collect.

## When to use Manus from SarmaLink-AI

Use Manus when:

- The task takes 5+ minutes of agentic work (research, multi-step
  analysis, scraping + summarising, comparing across many sources).
- The task requires browsing or file work the LLM cannot do alone.
- The task should run async — the user submits it and comes back later.

Do not use Manus when:

- A single chat completion would do (use the failover gateway).
- The task is short and time-sensitive.
- You need streaming output to a user.

## API surface (SarmaLink-AI)

### Create a task

```
POST /api/v1/manus
{
  "prompt": "Research the cheapest EU-hosted Postgres options for a 50GB workload, write a one-page memo, output as Markdown.",
  "context": { "industry": "saas", "user_region": "uk" },
  "webhookUrl": "https://your-app/api/v1/manus/webhook",
  "budget": { "maxSteps": 80, "maxUSD": 2.00 }
}
```

Returns the task id, status, and createdAt timestamp.

### Poll a task

```
GET /api/v1/manus?id=task_abc123
```

Returns current status. When `status === "completed"`, `output` and
`artifacts` are populated.

### Cancel a task

```
DELETE /api/v1/manus?id=task_abc123
```

### Webhook callback

Manus posts to your registered webhook on completion:

```
POST /api/v1/manus/webhook
x-manus-signature: <secret>
{ "id": "task_abc123", "status": "completed", "output": "...", ... }
```

The handler verifies the signature against `MANUS_WEBHOOK_SECRET` if
set, and persists the result. The persistence layer is a stub — wire it
to your storage of choice.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `MANUS_API_KEY` | Yes | Bearer token from Manus dashboard |
| `MANUS_BASE_URL` | No | Override (defaults to `https://api.manus.im/v1`) |
| `MANUS_WEBHOOK_SECRET` | No | Shared secret for webhook signature check |

## Cost shape

Manus charges per step within a task plus a small per-task overhead. A
typical research task ranges from $0.20 to $2.00 depending on browsing
volume. Always set a `budget` so a runaway task is bounded.

## Try Manus

Manus runs on a credit system. New users who sign up via this link get
500 extra credits on top of the standard free tier:

> **Sign up:** https://manus.im/invitation/REPLACE_WITH_YOUR_CODE

(Replace the URL above with your invite code; the doc keeps a
recognisable placeholder so it is easy to update without a code search.)

## Roadmap

- Persist webhook results to Supabase so consumers can poll by id without hitting Manus.
- Stream the step log to the SarmaLink-AI Inspector UI for live progress.
- Route specific intents (research, comparison, scraping) to Manus
  automatically when the failover gateway sees them.
