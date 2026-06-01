/**
 * Smart follow-up suggestions.
 *
 * Given the last user message and the assistant's reply, asks Groq Llama
 * 3.3 70B to propose three short follow-ups the user might want to send
 * next. Low temperature, capped at 120 tokens.
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const SuggestionInputSchema = z.object({
    userMsg: z.string().min(1).max(4000),
    aiMsg: z.string().min(1).max(8000),
})
export type SuggestionInput = z.infer<typeof SuggestionInputSchema>

export const SuggestionOutputSchema = z.object({
    suggestions: z.array(z.string()).max(3),
})
export type SuggestionOutput = z.infer<typeof SuggestionOutputSchema>

export async function generateSuggestions(input: SuggestionInput): Promise<SuggestionOutput> {
    const parsed = SuggestionInputSchema.parse(input)
    const keys = env().providers.groq
    if (!keys.length) return { suggestions: [] }
    const key = keys[Math.floor(Math.random() * keys.length)]

    const prompt = `You generate three short follow-up questions a user might want to send next in a chat. Reply with ONLY a JSON array of three short strings, no commentary, no markdown.

User said: ${JSON.stringify(parsed.userMsg.slice(0, 1500))}
Assistant replied: ${JSON.stringify(parsed.aiMsg.slice(0, 2000))}

JSON:`

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 120,
                temperature: 0.3,
                response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return { suggestions: [] }
        const data = await res.json() as any
        const raw = String(data?.choices?.[0]?.message?.content ?? '')
        const arr = extractStringArray(raw)
        return { suggestions: arr.slice(0, 3) }
    } catch {
        return { suggestions: [] }
    }
}

function extractStringArray(raw: string): string[] {
    // Accept either a JSON array, or an object containing one.
    try {
        const v = JSON.parse(raw)
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
        if (v && typeof v === 'object') {
            for (const key of Object.keys(v)) {
                if (Array.isArray((v as any)[key])) return (v as any)[key].filter((x: unknown) => typeof x === 'string')
            }
        }
    } catch {
        // fall through
    }
    const m = raw.match(/\[[\s\S]*\]/)
    if (m) {
        try {
            const v = JSON.parse(m[0])
            if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
        } catch {
            // ignore
        }
    }
    return []
}
