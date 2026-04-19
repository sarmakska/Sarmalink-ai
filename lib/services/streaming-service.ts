/**
 * Streaming service — SSE stream construction helpers.
 *
 * Provides helper functions for building SSE events and Gemini grounded
 * streaming. All SSE events follow the same format:
 *   data: {"type":"token"|"thinking"|"image"|"done"|...,"text":"..."}\n\n
 */

import { env } from '@/lib/env/validate'
import { tryFailover as tryFailoverModule } from '@/lib/providers/failover'
import type { FailoverStep } from '@/lib/ai-models'
import { logEvent } from './event-logger'

// ── Provider redaction — disabled per user request ──────────────────────────
// User decided model disclosure is OK, so this is now a passthrough.
export function redactProviderNames(text: string): string {
    return text
}

// ── Thinking redaction — strip meta-references to system prompt / dev instructions
export function redactThinkingMeta(text: string): string {
    if (!text) return text
    return text
        .split(/(?<=[.!?])\s+/)
        .filter(sentence => !/\b(developer|system prompt|instructions|told to|must answer with|must follow|must not mention|guidelines say|prompt says|i was instructed|according to (my|the) (instructions|prompt|rules|guidelines))\b/i.test(sentence))
        .join(" ")
}

// ── Model failover: best quality → maximum capacity, all free on Groq ───────
const MODELS_FAILOVER = [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'qwen/qwen3-32b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.1-8b-instant',
]

const MODEL_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct'

/** SSE helper — enqueue a typed JSON event */
export function send(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    obj: object,
): void {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
}

/** Wrapper around the shared failover runner for Groq-only paths */
async function streamFromGroqModels(
    models: string[],
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string,
    selectedModel: string,
): Promise<{ ok: boolean; backend?: string; latencyMs?: number; tokensOut?: number }> {
    const failover: FailoverStep[] = models.map(m => ({ provider: 'groq', model: m, label: `Groq ${m}` }))
    return tryFailoverModule({
        failover, messages, maxTokens, encoder, controller, userId, selectedModel,
        logEvent: (e) => { logEvent(e).catch(() => { }) },
    })
}

/** Route handler wrapper around the shared failover runner */
export async function tryFailover(
    failover: { provider: string; model: string; label: string }[],
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string,
    selectedModel: string,
): Promise<{ ok: boolean; backend?: string; label?: string; latencyMs?: number; tokensOut?: number }> {
    return tryFailoverModule({
        failover: failover as FailoverStep[],
        messages, maxTokens, encoder, controller, userId, selectedModel,
        logEvent: (e) => { logEvent(e).catch(() => { }) },
    })
}

/** Smart-mode fallback for Live-mode search composition */
export async function streamFailover(
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
): Promise<boolean> {
    const result = await streamFromGroqModels(MODELS_FAILOVER, messages, maxTokens, encoder, controller, '', 'smart')
    return result.ok
}

// ── Gemini grounded streaming — Live mode ───────────────────────────────────
export async function streamFromGeminiGrounded(
    messages: any[],
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string,
): Promise<{ ok: boolean; latencyMs?: number; sources?: any[] }> {
    const GEMINI_KEYS = env().providers.gemini

    const systemMsg = messages.find((m: any) => m.role === 'system')?.content ?? ''
    const userMsgs = messages.filter((m: any) => m.role !== 'system')
    const geminiContents = userMsgs.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }))

    let keyIdx = 0
    for (const key of GEMINI_KEYS) {
        keyIdx++
        const startedAt = Date.now()
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify({
                        contents: geminiContents,
                        systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
                        tools: [{ googleSearch: {} }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
                    }),
                }
            )
            if (res.status === 429) {
                logEvent({ user_id: userId, event_type: 'rate_limit', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: '429' })
                continue
            }
            if (!res.ok) {
                logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: String(res.status) })
                continue
            }

            const reader = res.body!.getReader()
            const dec = new TextDecoder()
            let buf = ''
            let charCount = 0
            const sources: any[] = []
            let pendingText = ''
            let inThinkBlock = false

            const sendVisible = (text: string) => {
                const clean = redactProviderNames(text)
                if (!clean) return
                charCount += clean.length
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: clean })}\n\n`))
            }
            const sendThinking = (text: string) => {
                const clean = redactProviderNames(text)
                if (!clean) return
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: clean })}\n\n`))
            }

            const flushVisibleText = (text: string) => {
                pendingText += text
                while (pendingText.length > 0) {
                    if (inThinkBlock) {
                        const closeIdx = pendingText.indexOf('</think>')
                        if (closeIdx === -1) {
                            if (pendingText) sendThinking(pendingText)
                            pendingText = ''
                            return
                        }
                        const thinkPart = pendingText.slice(0, closeIdx)
                        if (thinkPart) sendThinking(thinkPart)
                        pendingText = pendingText.slice(closeIdx + '</think>'.length)
                        inThinkBlock = false
                    } else {
                        const openIdx = pendingText.indexOf('<think>')
                        if (openIdx === -1) {
                            if (pendingText.length > 7) {
                                const safe = pendingText.slice(0, pendingText.length - 7)
                                const tail = pendingText.slice(pendingText.length - 7)
                                if (safe) sendVisible(safe)
                                pendingText = tail
                            }
                            return
                        }
                        const visible = pendingText.slice(0, openIdx)
                        if (visible) sendVisible(visible)
                        pendingText = pendingText.slice(openIdx + '<think>'.length)
                        inThinkBlock = true
                    }
                }
            }

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const rawLine of lines) {
                    const line = rawLine.trim()
                    if (!line.startsWith('data: ')) continue
                    try {
                        const data = JSON.parse(line.slice(6))
                        const parts = data?.candidates?.[0]?.content?.parts ?? []
                        for (const p of parts) {
                            if (p.text) flushVisibleText(p.text)
                        }
                        const groundingMeta = data?.candidates?.[0]?.groundingMetadata
                        if (groundingMeta?.groundingChunks) {
                            for (const g of groundingMeta.groundingChunks) {
                                if (g.web) sources.push({ title: g.web.title, uri: g.web.uri })
                            }
                        }
                    } catch { /* skip malformed line */ }
                }
            }
            if (!inThinkBlock && pendingText.length > 0) {
                charCount += pendingText.length
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: pendingText })}\n\n`))
                pendingText = ''
            }
            if (charCount === 0) {
                logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: 'empty_stream' })
                continue
            }
            return { ok: true, latencyMs: Date.now() - startedAt, sources }
        } catch (e: any) {
            logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: 'exception', meta: { msg: e?.message?.slice(0, 200) } })
            continue
        }
    }
    return { ok: false }
}

// ── Full (non-streaming) Groq call — for re-asking after search ─────────────
export async function askGroqFull(messages: any[], maxTokens = 2000): Promise<string> {
    for (const model of MODELS_FAILOVER) {
        for (const key of env().providers.groq) {
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, top_p: 0.9 }),
                })
                if (res.status === 429) continue
                if (!res.ok) continue
                const data = await res.json()
                const reply = data.choices?.[0]?.message?.content ?? ''
                if (reply) return reply
            } catch { continue }
        }
    }
    return ''
}

// ── OpenRouter fallback (non-streaming, last resort) ────────────────────────
export async function askOpenRouter(messages: any[]): Promise<string> {
    const models = ['openai/gpt-oss-120b:free', 'nvidia/nemotron-3-super-120b-a12b:free']
    for (const key of env().providers.openrouter) {
        for (const model of models) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2000 }),
                })
                if (!res.ok) continue
                const data = await res.json()
                const reply = data.choices?.[0]?.message?.content ?? ''
                if (reply) return reply
            } catch { continue }
        }
    }
    return ''
}

/** Vision — non-streaming Groq call with the vision model */
export async function askVision(
    messages: any[],
    userId: string,
): Promise<string> {
    let keyIdx = 0
    for (const key of env().providers.groq) {
        keyIdx++
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model: MODEL_VISION, messages, temperature: 0.7, max_tokens: 2000 }),
            })
            if (res.status === 429) {
                logEvent({ user_id: userId, event_type: 'rate_limit', model_id: 'vision', backend: MODEL_VISION, key_index: keyIdx, status: '429' })
                continue
            }
            if (!res.ok) continue
            const data = await res.json()
            const reply = data.choices?.[0]?.message?.content ?? ''
            if (reply) {
                logEvent({ user_id: userId, event_type: 'message', model_id: 'vision', backend: MODEL_VISION, key_index: keyIdx, status: 'success' })
                return reply
            }
        } catch { continue }
    }
    return ''
}
