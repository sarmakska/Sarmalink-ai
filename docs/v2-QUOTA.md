# Quota tracking

Apply the migration in `supabase/migrations/20260601_ai_quota.sql`.

It creates:

- `public.ai_chat_usage` (one row per chat completion call)
- `public.ai_usage_today` (view rolled up by user and tier for the current UTC day)
- Row-level security: a user can read their own rows.

## Logging from the chat path

```ts
import { logUsage } from '@/lib/v2/quota'

await logUsage({
    userId,
    tier: 'smart',
    model: 'llama-3.3-70b-versatile',
    promptTokens: 412,
    completionTokens: 188,
    totalTokens: 600,
    backend: 'groq',
    status: 'success',
})
```

## Reading the quota

`GET /api/v1/quota?user_id=<uuid>` returns:

```json
{
    "ok": true,
    "user":    [{ "tier": "smart", "calls": 12, "promptTokens": 4900, "completionTokens": 1800, "totalTokens": 6700 }],
    "company": [{ "tier": "smart", "calls": 380, "promptTokens": 121000, "completionTokens": 42000, "totalTokens": 163000 }]
}
```
