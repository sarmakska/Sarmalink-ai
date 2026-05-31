/**
 * End-to-end test: the May-2026 frontier path.
 *
 * Exercises the whole new pipeline in one flow against fixtures:
 *   1. tryFailover dispatches to the Anthropic Opus 4.7 step.
 *   2. The outgoing request body carries cross-provider prompt-cache
 *      directives (ephemeral breakpoint + prompt_cache_key).
 *   3. The fixture stream's tokens are forwarded as structured `token` frames.
 *   4. The terminal usage block (with a cache read) is surfaced as a `usage`
 *      frame and on the FailoverResult.
 *   5. summariseCost prices the resulting event, billing the cached prefix at
 *      the cached rate.
 *
 * No network is touched; fetch is stubbed with the fixture.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'

beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    process.env.GROQ_API_KEY = 'test-groq-key'
    process.env.ENABLE_PROMPT_CACHE = 'true'
})

import { tryFailover } from '@/lib/providers/failover'
import { parseEventLine } from '@/lib/streaming/events'
import { summariseCost } from '@/lib/providers/cost'
import type { FailoverStep } from '@/lib/ai-models'
import { ANTHROPIC_SSE_CHUNKS, LONG_SYSTEM_PROMPT, anthropicSseBody } from './fixtures/anthropic-stream'

function collector() {
    const chunks: string[] = []
    const controller = {
        enqueue(v: Uint8Array) { chunks.push(new TextDecoder().decode(v)) },
        close() { },
        error() { },
    } as unknown as ReadableStreamDefaultController
    return { controller, chunks }
}

const FRONTIER_FAILOVER: FailoverStep[] = [
    { provider: 'anthropic', model: 'claude-opus-4-7', label: 'Anthropic Opus 4.7' },
    { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B' },
]

describe('frontier flow (Opus 4.7 + prompt cache + usage + cost)', () => {
    it('streams the answer, applies caching, reports usage, and prices the turn', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            body: anthropicSseBody(ANTHROPIC_SSE_CHUNKS),
        } as unknown as Response)
        vi.stubGlobal('fetch', fetchMock)

        const { controller, chunks } = collector()
        const logged: Array<{ event_type: string; backend?: string }> = []

        const result = await tryFailover({
            failover: FRONTIER_FAILOVER,
            messages: [
                { role: 'system', content: LONG_SYSTEM_PROMPT },
                { role: 'user', content: 'What is the capital of France?' },
            ],
            maxTokens: 256,
            encoder: new TextEncoder(),
            controller,
            userId: 'e2e-user',
            selectedModel: 'smart',
            logEvent: e => logged.push({ event_type: e.event_type, backend: e.backend }),
        })

        // 1. Won on the Opus step.
        expect(result.ok).toBe(true)
        expect(result.label).toBe('Anthropic Opus 4.7')

        // 2. Outgoing body carried prompt-cache directives.
        const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
        expect(sentBody.prompt_cache_key).toBe('sarmalink-smart')
        const systemMsg = sentBody.messages.find((m: { role: string }) => m.role === 'system')
        expect(Array.isArray(systemMsg.content)).toBe(true)
        expect(systemMsg.content[0].cache_control).toEqual({ type: 'ephemeral' })

        // 3. Tokens forwarded as structured `token` frames. The think-safety
        //    buffer can split a word across frames, so reassemble the visible
        //    text from the token events before asserting on content.
        const visibleText = chunks
            .map(c => parseEventLine(c.trim()))
            .filter(r => r.ok && r.event.type === 'token')
            .map(r => (r.ok && r.event.type === 'token' ? r.event.text : ''))
            .join('')
        expect(visibleText).toContain('capital of')
        expect(visibleText).toContain('Paris')

        // 4. A usage frame was emitted with the cache read, and the result
        //    carries the cache hit.
        const usageFrames = chunks
            .map(c => parseEventLine(c.trim()))
            .filter(r => r.ok && r.event.type === 'usage')
        expect(usageFrames.length).toBe(1)
        expect(result.cachedTokens).toBe(1800)
        expect(result.cacheHit).toBe(true)

        // 5. Cost the turn. 200 fresh input tokens @ $15/M + 1800 cached @
        //    $1.5/M + 8 output @ $75/M, summed across a single event.
        const summary = summariseCost([
            { backend: 'Anthropic Opus 4.7', model_id: 'smart', tokens_out: result.tokensOut, meta: { prompt_tokens: 2000, cached_tokens: 1800 } },
        ])
        expect(summary.paidTurns).toBe(1)
        expect(summary.totalEstimatedUsd).toBeGreaterThan(0)
        expect(summary.byModel[0].backend).toBe('Anthropic Opus 4.7')
    })

    it('falls over to Groq when the Opus step errors, and that turn is free', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 500, body: null } as unknown as Response)
            .mockResolvedValueOnce({ ok: true, status: 200, body: anthropicSseBody([
                'data: {"choices":[{"delta":{"content":"Fallback answer here."}}]}\n\n',
                'data: [DONE]\n\n',
            ]) } as unknown as Response)
        vi.stubGlobal('fetch', fetchMock)

        const { controller } = collector()
        const result = await tryFailover({
            failover: FRONTIER_FAILOVER,
            messages: [
                { role: 'system', content: LONG_SYSTEM_PROMPT },
                { role: 'user', content: 'hello' },
            ],
            maxTokens: 256,
            encoder: new TextEncoder(),
            controller,
            userId: 'e2e-user',
            selectedModel: 'smart',
            logEvent: () => { },
        })

        expect(result.ok).toBe(true)
        expect(result.label).toBe('Groq GPT-OSS 120B')
        const summary = summariseCost([
            { backend: 'Groq GPT-OSS 120B', model_id: 'smart', tokens_out: result.tokensOut, meta: {} },
        ])
        expect(summary.totalEstimatedUsd).toBe(0)
        expect(summary.freeTurns).toBe(1)
    })
})
