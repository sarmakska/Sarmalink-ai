# Intent auto-routing

`lib/v2/auto-route.ts` exposes `autoRoute({ message, hasImageAttachment })`. It returns a `{ tier, method, confidence }` object where `tier` is one of `code`, `live`, `reasoner`, `fast`, `smart`, `vision`, `image`.

Two-layer design:

1. A regex pre-filter handles the obvious cases (fenced code blocks, image verbs, time-sensitive keywords, attached images).
2. If the regex returns nothing, the function asks the gateway's fast tier (Groq Llama 3.3 70B) for a one-word classification. Token budget is four tokens; timeout is four seconds.

Gating: the function is a no-op unless `ENABLE_AUTO_ROUTE=1` is set. When disabled it returns `{ tier: 'smart', method: 'disabled', confidence: 0 }`.

## Wiring into a chat route

```ts
import { autoRoute } from '@/lib/v2/auto-route'

const decision = await autoRoute({ message: userText, hasImageAttachment })
const tier = decision.tier
```

The classifier is deliberately small. Add tiers by editing both the Zod enum and the prompt; the regex pass can be left alone if the new tier is only LLM-resolvable.
