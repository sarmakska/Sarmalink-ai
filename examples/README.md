# SarmaLink-AI client examples

Minimal, working examples in four languages calling the OpenAI-compatible endpoint at `POST /api/v1/chat/completions`.

| Example | Streaming | Notes |
|---|---|---|
| [`curl.sh`](./curl.sh) | yes | Quickest sanity check from a terminal. |
| [`typescript.ts`](./typescript.ts) | yes | Uses the `openai` npm package — point its `baseURL` at SarmaLink-AI. |
| [`python.py`](./python.py) | yes | Uses the `openai` Python package — same pattern. |
| [`javascript.js`](./javascript.js) | yes | Plain `fetch` + manual SSE parsing, no SDK. Works in Node 18+ and modern browsers. |

## Setup

Set two environment variables before running any example:

```bash
export SARMALINK_AI_URL="https://your-deployment.vercel.app"   # or http://localhost:3000 for local dev
export SARMALINK_AI_KEY="sk-..."                               # generated in the SarmaLink-AI admin
```

If you do not have a deployment yet, follow [`docs/MAKE-IT-YOURS.md`](../docs/MAKE-IT-YOURS.md) to fork and deploy in under fifteen minutes.

## Why an OpenAI-compatible shape

Every modern chat client speaks the OpenAI Chat Completions protocol. Pointing a client's `baseURL` at SarmaLink-AI gives you instant access to:

- **14-engine multi-provider failover** (Groq → SambaNova → Cerebras → Google → Cloudflare → OpenRouter → ...) — invisible to the client
- **Intent-based plugin auto-routing** (research → rag-over-pdf, voice → voice-agent-starter, etc.) when `ENABLE_PLUGIN_AUTOROUTE=true`
- **Persistent memory** via Supabase (set the `user_id` field on requests)
- **Streaming** with proper SSE chunking that any OpenAI-compatible parser handles

No client code change is needed. Switch the base URL, keep using the SDK you already use.

## What you cannot do via this endpoint

- Image generation — separate endpoint at `POST /api/images/generate`
- Image editing — `POST /api/images/edit`
- File attachment extraction — `POST /api/attachments/upload`
- Manus task delegation — `POST /api/v1/manus`

See [`docs/HOW-IT-WORKS.md`](../docs/HOW-IT-WORKS.md) for the full surface.
