/**
 * Cascade runner — the heart of the multi-provider failover system.
 *
 * Given a list of cascade steps (each specifying a provider + model), this
 * runner tries each step in order. Within each step, it rotates through the
 * provider's API key pool. If the model returns 429 (rate limit) or any
 * non-2xx error, it moves to the next key. If all keys exhaust, it moves
 * to the next cascade step. If the cascade fully exhausts, it returns
 * `{ ok: false }` so the caller can serve a graceful error.
 *
 * Streaming: tokens are parsed from the provider's SSE response and pushed
 * to the downstream controller as `data: {"type":"token","text":"..."}`
 * events. Reasoning blocks (either `<think>...</think>` in the content or
 * a separate `delta.reasoning` field) are separated into `thinking` events
 * so the UI can collapse them behind a toggle.
 */

import { providerEndpoint, providerKeys, providerHeaders } from './registry'
import type { CascadeStep } from '@/lib/ai-models'

export interface CascadeResult {
    ok: boolean
    backend?: string
    label?: string
    latencyMs?: number
    tokensOut?: number
}

export interface LogEvent {
    (event: {
        user_id?: string
        event_type: string
        model_id?: string
        backend?: string
        key_index?: number
        status?: string
        latency_ms?: number
        tokens_out?: number
        meta?: Record<string, unknown>
    }): void
}

interface CascadeOptions {
    cascade: CascadeStep[]
    messages: unknown[]
    maxTokens: number
    encoder: TextEncoder
    controller: ReadableStreamDefaultController
    userId: string
    selectedModel: string
    logEvent?: LogEvent
}

/**
 * Dispatches a chat request across a cascade of provider/model steps.
 * First successful step wins; all others are skipped.
 */
export async function tryCascade(opts: CascadeOptions): Promise<CascadeResult> {
    const { cascade, messages, maxTokens, encoder, controller, userId, selectedModel, logEvent } = opts
    const log = logEvent ?? (() => { })

    // Round-robin key rotation per request — spreads load so key 1 isn't
    // always tried first. Different requests start from different offsets,
    // giving every key in each pool roughly equal usage over time.
    const rotationSeed = Date.now()

    for (const step of cascade) {
        const endpoint = providerEndpoint(step.provider)
        const allKeys = providerKeys(step.provider)
        if (!endpoint || !allKeys.length) continue

        const offset = rotationSeed % allKeys.length
        const keys = [...allKeys.slice(offset), ...allKeys.slice(0, offset)]

        let keyIdx = 0
        for (const key of keys) {
            keyIdx++
            const startedAt = Date.now()
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: providerHeaders(step.provider, key),
                    body: JSON.stringify({
                        model: step.model,
                        messages,
                        temperature: 0.7,
                        max_tokens: maxTokens,
                        top_p: 0.9,
                        stream: true,
                    }),
                })

                if (res.status === 429) {
                    log({ user_id: userId, event_type: 'rate_limit', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: '429' })
                    continue
                }
                if (!res.ok) {
                    log({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: String(res.status) })
                    continue
                }
                if (!res.body) {
                    log({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: 'no_body' })
                    continue
                }

                const charCount = await streamResponseToController(res.body, controller, encoder)

                if (charCount === 0) {
                    log({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: 'empty_stream' })
                    continue
                }

                const latency = Date.now() - startedAt
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'backend', label: step.label })}\n\n`))
                return { ok: true, backend: step.model, label: step.label, latencyMs: latency, tokensOut: Math.ceil(charCount / 4) }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message.slice(0, 200) : 'unknown'
                log({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: 'exception', meta: { msg } })
                continue
            }
        }
    }
    return { ok: false }
}

/**
 * Parse an OpenAI-compatible SSE stream and forward tokens to the
 * downstream controller. Separates `<think>...</think>` content into
 * `thinking` events. Returns the total visible character count so the
 * caller can decide whether the stream was empty (fall through to next).
 */
async function streamResponseToController(
    body: ReadableStream<Uint8Array>,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
): Promise<number> {
    const reader = body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let charCount = 0
    let pendingText = ''
    let inThinkBlock = false

    const sendVisible = (text: string) => {
        charCount += text.length
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\n`))
    }
    const sendThinking = (text: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text })}\n\n`))
    }

    const flushVisibleText = (text: string) => {
        pendingText += text
        while (pendingText.length > 0) {
            if (inThinkBlock) {
                const closeIdx = pendingText.indexOf('</think>')
                if (closeIdx === -1) { if (pendingText) sendThinking(pendingText); pendingText = ''; return }
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
                        if (safe) sendVisible(safe); pendingText = tail
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
        for (const line of lines) {
            if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
            try {
                const data = JSON.parse(line.slice(6))
                const token = data.choices?.[0]?.delta?.content || ''
                const reasoning = data.choices?.[0]?.delta?.reasoning || ''
                if (reasoning) sendThinking(reasoning)
                if (token) flushVisibleText(token)
            } catch { /* skip malformed SSE line */ }
        }
    }
    if (inThinkBlock && pendingText.length > 0) { sendThinking(pendingText); pendingText = '' }
    else if (pendingText.length > 0) { sendVisible(pendingText); pendingText = '' }

    return charCount
}
