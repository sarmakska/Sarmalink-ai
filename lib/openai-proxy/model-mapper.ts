/**
 * OpenAI → SarmaLink mode mapper, extracted from the route handler so
 * Next.js doesn't complain about route files exporting non-route symbols.
 *
 * The rules intentionally cover the wide range of names clients send
 * (gpt-4o, o1, o3-mini, codestral, pixtral, llama-8b, etc.) without
 * requiring an exhaustive allow-list. Keep this function pure and
 * side-effect-free — it is covered by `__tests__/openai-proxy.test.ts`.
 */

import type { ModelId } from '@/lib/ai-models'

export interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface OpenAIChatRequest {
    model: string
    messages: OpenAIChatMessage[]
    stream?: boolean
    max_tokens?: number
    temperature?: number
}

export function mapOpenAIModelToMode(requested: string): ModelId {
    const m = (requested || '').toLowerCase()
    if (m.includes('code') || m.includes('coder') || m.includes('codestral')) return 'coder'
    if (m.includes('reason') || m.includes('o1') || m.includes('o3') || m.includes('think')) return 'reasoner'
    if (m.includes('vision') || m.includes('pixtral') || m.includes('scout')) return 'vision'
    if (m.includes('flash') || m.includes('fast') || m.includes('mini') || m.includes('8b')) return 'fast'
    return 'smart'
}
