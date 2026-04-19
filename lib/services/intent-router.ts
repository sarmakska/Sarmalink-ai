/**
 * Intent router — AI-based and regex-based intent classification.
 *
 * Classifies the user's message into a mode (smart, coder, live, reasoner,
 * fast, image) so the orchestrator knows which pipeline to run.
 */

import { env } from '@/lib/env/validate'
import { autoRouteIntent, type ModelId } from '@/lib/ai-models'

// ── Intent detection (from user message, not AI response) ───────────────────
export function detectImageIntent(msg: string): boolean {
    return /\b(generate|create|draw|make|design|produce)\s+(?:\w+\s+){0,3}(image|picture|photo|illustration|artwork|painting|drawing|logo|icon|portrait|scene)\b/i.test(msg)
        || /\b(image of|picture of|photo of|draw me|visualize|show me what .+ looks? like)\b/i.test(msg)
}

export function detectSearchIntent(msg: string): boolean {
    const explicit = /\b(search|look ?up|find out|latest news|current|today['s]?|right now|what['s]? happening|price of|weather|wether|wheather|temperature|tempreture|temp outside|outside|score of|recent|2025|2026|2027|this week|this month|this year|going on|news about|update on|status of|latest on|is it raining|is it snowing|is it sunny|rain today|rain now|sunny today)\b/i
    if (explicit.test(msg)) return true

    const timeSensitive = /\b(war|conflict|crisis|ceasefire|invasion|election|vote|referendum|president|prime minister|chancellor|stock|market|shares|inflation|interest rate|exchange rate|protest|strike|ukraine|russia|israel|iran|gaza|houthi|yemen|lebanon|syria|opec|nato|eu|brexit|covid|pandemic|recession|tariff|sanctions)\b/i
    if (timeSensitive.test(msg)) return true

    const questionStart = /\b(what (is|are) the (current|latest|recent|today'?s?|new)|how is the (current|latest|weather|wether|wheather|temperature|weather outside)|is there (a|an|any) (current|new|recent)|has there been)\b/i
    if (questionStart.test(msg)) return true

    const weatherish = /\b(how('?s| is)? the (weather|wether|wheather|temp|temperature|forecast)|what('?s| is)? the (weather|wether|wheather|temp|temperature|forecast)|how('?s| is) it (outside|today))\b/i
    if (weatherish.test(msg)) return true

    return false
}

// ── AI-based auto-router ────────────────────────────────────────────────────
export type RoutedIntent = 'smart' | 'coder' | 'live' | 'reasoner' | 'fast' | 'image'

/**
 * Strip <think>...</think> blocks and reasoning preambles from text.
 */
function stripReasoningLeak(text: string): string {
    if (!text) return text
    let clean = text
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
    clean = clean.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    const reasoningStarts = [
        /^okay,?\s+let\s+me\s+tackle\s+this[\s\S]*?(?=\n\n|$)/i,
        /^(okay|alright|hmm|well|let'?s?\s+see),?\s+[\s\S]{0,400}\b(the\s+user|user\s+wants|user\s+is\s+asking)\b[\s\S]*?(?=\n\n|$)/i,
        /^the\s+user\s+(wants|is\s+asking|needs)[\s\S]*?(?=\n\n|$)/i,
    ]
    for (const re of reasoningStarts) clean = clean.replace(re, '')
    return clean.trim()
}

export async function classifyIntentAI(message: string, history: any[]): Promise<RoutedIntent> {
    if (!env().providers.cerebras.length) return 'smart'
    const text = (message || '').slice(0, 600)
    if (!text.trim()) return 'smart'

    const lastAssistant = history?.slice().reverse().find((m: any) => m.role === 'assistant')?.content?.slice(0, 300) ?? ''

    const classifyPrompt = `You are a fast router. Classify the user's LATEST message into ONE category and reply with ONLY the category name (no explanation, no punctuation). Use the prior assistant message as context if the latest message is a follow-up.

Categories:
- image: user wants a VISUAL image file generated — "create image", "generate picture", "make a logo", "draw me X", "visual mockup", "illustration of". Or they're confirming a prior offer to generate an image.
- code: ONLY for actual software programming — writing, fixing, refactoring, debugging, or reviewing source code. Requires code context (fenced code blocks, file extensions .ts/.py/.sql, "function", "class", "bug"). Does NOT include "create a table of data", "make a list", "summarise", "analyse files", "extract information" — those are SMART tasks.
- live: anything current or time-sensitive — news, weather (including typos like "wether"), prices, scores, "today", "right now", "outside".
- reasoner: complex multi-step problems, proofs, heavy math, logic puzzles, deep step-by-step reasoning.
- fast: simple factual lookups, one-liner questions, quick definitions under 10 words.
- smart: EVERYTHING ELSE — emails, writing, brainstorming, translation, data extraction from files, creating tables/summaries/reports from uploaded documents, professional tasks. This is the DEFAULT — use smart whenever unsure.

${lastAssistant ? `Prior assistant message (for context):\n"""${lastAssistant.replace(/"/g, '\\"')}"""\n\n` : ''}Latest user message:
"""${text.replace(/"/g, '\\"')}"""

Reply with ONE word only from the 6 categories above.`

    const rotationOffset = Date.now() % env().providers.cerebras.length
    const keys = [...env().providers.cerebras.slice(rotationOffset), ...env().providers.cerebras.slice(0, rotationOffset)]

    for (const key of keys) {
        try {
            const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    model: 'llama3.1-8b',
                    messages: [{ role: 'user', content: classifyPrompt }],
                    max_tokens: 5,
                    temperature: 0,
                }),
            })
            if (!res.ok) continue
            const data = await res.json()
            const raw = (data.choices?.[0]?.message?.content || '').toLowerCase().trim().replace(/[^a-z]/g, '')
            if (raw === 'image' || raw === 'picture' || raw === 'draw') return 'image'
            if (raw === 'code') return 'coder'
            if (raw === 'live' || raw === 'search') return 'live'
            if (raw === 'reasoner' || raw === 'reason' || raw === 'reasoning') return 'reasoner'
            if (raw === 'fast') return 'fast'
            if (raw === 'smart') return 'smart'
            continue
        } catch { continue }
    }
    return 'smart'
}

/**
 * Determine if the user's message is a clear, descriptive image prompt
 * (as opposed to a short confirmation like "yes" or "do it").
 */
export function isClearImagePrompt(msg: string): boolean {
    const trimmed = msg.trim()
    if (!trimmed) return false
    const words = trimmed.split(/\s+/).length
    const confirmations = /^(yes|yeah|ok|okay|go|do it|sure|please|create|generate|draw|make|make it|go ahead|image|picture|do this)\b[\s\S]*$/i
    if (words <= 4 && confirmations.test(trimmed)) return false
    if (words >= 6) return true
    const visualMarkers = /\b(logo|dress|jumper|castle|landscape|portrait|photo|sketch|illustration|mockup|moodboard|pattern|print|flat|tile|background|scene|colou?r|style|painting|drawing|red|blue|green|yellow|burgundy|cream|black|white|vintage|modern|minimal|luxurious|editorial)\b/i
    return visualMarkers.test(trimmed)
}

/**
 * Build a proper image prompt from the user's message and conversation history.
 * Prioritises the user's actual message; only distills from history when the
 * message is a short confirmation.
 */
export async function buildImagePromptFromContext(userMsg: string, history: any[]): Promise<string> {
    const trimmed = userMsg.trim().replace(/^(please|could you|can you|go on and|now|then)\s+/i, '')

    // 1. User's message is itself a clear image prompt — use verbatim
    if (isClearImagePrompt(trimmed)) {
        return trimmed.replace(/\b(generate|create|draw|make|design|produce|render)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|drawing|render)(\s+of)?\s*/gi, '').trim() || trimmed
    }

    // 2. Short confirmation — look at LAST USER message that described something
    const lastUserDescription = history?.slice().reverse().find((m: any) => {
        if (m.role !== 'user') return false
        const c = (m.content || '').trim()
        return c.length > 20 && isClearImagePrompt(c)
    })?.content
    if (lastUserDescription) {
        return lastUserDescription.replace(/\b(generate|create|draw|make|design|produce|render)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|drawing|render)(\s+of)?\s*/gi, '').trim().slice(0, 400)
    }

    // 3. Fall back to the last assistant description, but STRICTLY distilled
    const lastAssistant = history?.slice().reverse().find((m: any) => m.role === 'assistant')?.content?.slice(0, 1500) ?? ''
    if (!lastAssistant || !env().providers.cerebras.length) {
        return trimmed || 'a clear, well-composed image'
    }
    try {
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env().providers.cerebras[0]}` },
            body: JSON.stringify({
                model: 'llama3.1-8b',
                messages: [{
                    role: 'user',
                    content: `Extract a concise visual image prompt (15-40 words) from the description below. Output ONLY the prompt itself — no preamble, no reasoning, no "Here is" or "The prompt is". Just the visual description.\n\nDescription:\n${lastAssistant}\n\nPrompt:`,
                }],
                max_tokens: 120,
                temperature: 0.2,
            }),
        })
        if (!res.ok) return trimmed || lastAssistant.slice(0, 200)
        const data = await res.json()
        let built = stripReasoningLeak((data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, ''))
        built = built.replace(/^(prompt:|image prompt:|here'?s?\s+(the|a)\s+prompt:?)\s*/i, '').trim()
        return built || trimmed || lastAssistant.slice(0, 200)
    } catch {
        return trimmed || lastAssistant.slice(0, 200)
    }
}

export interface IntentRouteResult {
    selectedModelId: ModelId
    autoRoutedFrom: ModelId | null
    autoRoutedToImage: boolean
}

/**
 * Resolve the model selection from the request, including auto-routing.
 */
export async function resolveIntent(opts: {
    requestedModel?: string
    message: string
    history: any[]
    hasImage: boolean
    hasFiles: boolean
}): Promise<IntentRouteResult> {
    const { requestedModel, message, history, hasImage, hasFiles } = opts
    let selectedModelId: ModelId = 'smart'
    let autoRoutedFrom: ModelId | null = null
    let autoRoutedToImage = false

    if (requestedModel && (await import('@/lib/ai-models')).isValidModelId(requestedModel)) {
        selectedModelId = requestedModel as ModelId
    }

    if (selectedModelId === 'auto' && !hasImage) {
        autoRoutedFrom = 'auto'
        if (hasFiles) {
            selectedModelId = 'smart'
        } else {
            try {
                const aiRouted = await classifyIntentAI(message ?? '', history ?? [])
                if (aiRouted === 'image') {
                    autoRoutedToImage = true
                    selectedModelId = 'smart'
                } else {
                    selectedModelId = aiRouted
                }
            } catch {
                selectedModelId = autoRouteIntent(message ?? '')
            }
        }
    }

    if (hasImage) {
        selectedModelId = 'vision'
    }

    return { selectedModelId, autoRoutedFrom, autoRoutedToImage }
}
