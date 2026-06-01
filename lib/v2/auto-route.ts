/**
 * Intent auto-router.
 *
 * Returns a model tier for a free-text user message. Two layers:
 *  1. Regex pre-filter for the obvious cases (code blocks, image verbs,
 *     time-sensitive words, vision-with-attachment hints).
 *  2. Optional LLM fallback for ambiguous messages, calling the same
 *     gateway's `fast` tier via Groq.
 *
 * Gated behind ENABLE_AUTO_ROUTE. When the flag is off the function is a
 * no-op and returns `smart` so callers can wire it in safely.
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const RoutedTierSchema = z.enum([
    'code',
    'live',
    'reasoner',
    'fast',
    'smart',
    'vision',
    'image',
])
export type RoutedTier = z.infer<typeof RoutedTierSchema>

export const AutoRouteInputSchema = z.object({
    message: z.string().min(1).max(8000),
    hasImageAttachment: z.boolean().optional().default(false),
})
export type AutoRouteInput = z.infer<typeof AutoRouteInputSchema>

export const AutoRouteOutputSchema = z.object({
    tier: RoutedTierSchema,
    method: z.enum(['disabled', 'regex', 'llm', 'fallback']),
    confidence: z.number().min(0).max(1),
})
export type AutoRouteOutput = z.infer<typeof AutoRouteOutputSchema>

function regexClassify(msg: string, hasImageAttachment: boolean): RoutedTier | null {
    if (hasImageAttachment) return 'vision'
    const lower = msg.toLowerCase()

    if (/```[\s\S]*```/.test(msg)) return 'code'
    if (/\b(function|class|const |let |var |def |import |#include|interface |type |sql|select .+ from|create table)\b/i.test(msg)) {
        return 'code'
    }
    if (/\b(fix|debug|refactor|review)\b.{0,30}\b(code|bug|function|script|module)\b/i.test(lower)) return 'code'

    if (/\b(generate|create|draw|paint|render|design)\b.{0,30}\b(image|picture|photo|logo|illustration|artwork|drawing|render|moodboard)\b/i.test(lower)) {
        return 'image'
    }
    if (/\b(image of|picture of|photo of|draw me)\b/i.test(lower)) return 'image'

    if (/\b(today|tonight|tomorrow|right now|currently|latest|breaking|live|news|weather|temperature|forecast|score|price|exchange rate|stock)\b/i.test(lower)) {
        return 'live'
    }

    if (/\b(prove|proof|theorem|derive|solve.+equation|step by step|chain of thought|reasoning)\b/i.test(lower)) {
        return 'reasoner'
    }

    const words = msg.trim().split(/\s+/).length
    if (words <= 8 && /\?/.test(msg)) return 'fast'

    return null
}

async function llmClassify(message: string): Promise<RoutedTier | null> {
    const cfg = env()
    if (!cfg.providers.groq.length) return null
    const key = cfg.providers.groq[Math.floor(Math.random() * cfg.providers.groq.length)]

    const prompt = `You are a fast classifier. Categorise the user message into ONE of: code, live, reasoner, fast, smart, vision, image. Reply with the single word only.

Message: ${JSON.stringify(message.slice(0, 600))}

One word:`

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4,
                temperature: 0,
            }),
            signal: AbortSignal.timeout(4000),
        })
        if (!res.ok) return null
        const data = await res.json()
        const raw = String(data?.choices?.[0]?.message?.content ?? '')
            .toLowerCase()
            .replace(/[^a-z]/g, '')
        const parsed = RoutedTierSchema.safeParse(raw)
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/**
 * Public API. Returns the routing decision.
 *
 * Honours ENABLE_AUTO_ROUTE. When disabled the function returns `smart`
 * with method `disabled` so callers can keep their existing default path.
 */
export async function autoRoute(input: AutoRouteInput): Promise<AutoRouteOutput> {
    const parsed = AutoRouteInputSchema.parse(input)
    if (process.env.ENABLE_AUTO_ROUTE !== '1') {
        return { tier: 'smart', method: 'disabled', confidence: 0 }
    }

    const regexHit = regexClassify(parsed.message, parsed.hasImageAttachment)
    if (regexHit) {
        return { tier: regexHit, method: 'regex', confidence: 0.85 }
    }

    const llmHit = await llmClassify(parsed.message)
    if (llmHit) {
        return { tier: llmHit, method: 'llm', confidence: 0.7 }
    }

    return { tier: 'smart', method: 'fallback', confidence: 0.4 }
}
