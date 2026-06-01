# Smart follow-up suggestions

`POST /api/v1/suggestions`

Body:

```json
{
    "userMsg": "How does a CDN cache invalidation work?",
    "aiMsg": "A CDN cache invalidation is..."
}
```

Returns:

```json
{ "ok": true, "suggestions": [
    "What's the cost of a global purge?",
    "How fast is stale-while-revalidate?",
    "Show me a sample purge API call."
] }
```

Backed by Groq Llama 3.3 70B, temperature 0.3, max 120 tokens, JSON response mode.

Use this to power a follow-up chip strip below the assistant reply in your UI.
