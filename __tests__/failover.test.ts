/**
 * Failover integration tests.
 *
 * Exercises the core promise of SarmaLink-AI: when a provider returns 429 or
 * 5xx, the runner transparently moves to the next key, then the next step.
 * We mock `fetch` to simulate each failure mode and assert that:
 *   1. A single 200 on step 1, key 1 wins immediately.
 *   2. 429 on every key of step 1 falls through to step 2.
 *   3. 5xx on every step returns `{ ok: false }` without throwing.
 *   4. The `logEvent` hook sees rate_limit / error / success transitions.
 *   5. Tokens from the SSE stream are forwarded to the controller.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Seed keys BEFORE importing registry (env() is memoised on first call).
beforeAll(() => {
    process.env.GROQ_API_KEY = 'test-groq-1'
    process.env.GROQ_API_KEY_2 = 'test-groq-2'
    process.env.SAMBANOVA_API_KEY = 'test-samba-1'
    process.env.OPENROUTER_API_KEY = 'test-or-1'
})

import { tryFailover } from '@/lib/providers/failover'
import type { FailoverStep } from '@/lib/ai-models'

function sseBody(tokens: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const t of tokens) {
                const line = `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`
                controller.enqueue(enc.encode(line))
            }
            controller.enqueue(enc.encode('data: [DONE]\n\n'))
            controller.close()
        },
    })
}

function fakeResponse(status: number, body: ReadableStream<Uint8Array> | null): Response {
    return { ok: status >= 200 && status < 300, status, body } as unknown as Response
}

function collector() {
    const chunks: string[] = []
    const controller = {
        enqueue(v: Uint8Array) { chunks.push(new TextDecoder().decode(v)) },
        close() { },
        error() { },
    } as unknown as ReadableStreamDefaultController
    return { controller, chunks }
}

const SIMPLE_FAILOVER: FailoverStep[] = [
    { provider: 'groq', model: 'gpt-oss-120b', label: 'Groq GPT-OSS' },
    { provider: 'sambanova', model: 'DeepSeek-V3.2', label: 'SambaNova DeepSeek' },
    { provider: 'openrouter', model: 'free-model', label: 'OpenRouter Free' },
]

describe('tryFailover', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('wins on step 1 when the first provider returns 200', async () => {
        // Use a longer final token so the <think>-safety buffer (7-char hold) flushes
        // the full string before the stream closes.
        const fetchMock = vi.fn().mockResolvedValueOnce(
            fakeResponse(200, sseBody(['The quick brown fox jumps over the lazy dog.']))
        )
        vi.stubGlobal('fetch', fetchMock)

        const { controller, chunks } = collector()

        const result = await tryFailover({
            failover: SIMPLE_FAILOVER,
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'smart',
            logEvent: () => { },
        })

        expect(result.ok).toBe(true)
        expect(result.label).toBe('Groq GPT-OSS')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const merged = chunks.join('')
        // Tokens are forwarded as SSE events, potentially split by the think-buffer.
        // Assert on substrings that survive the split.
        expect(merged).toContain('quick brown fox')
        expect(merged).toContain('"type":"backend"')
    })

    it('falls through all step-1 keys on 429 then succeeds on step 2', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(fakeResponse(429, null))         // groq key 1 rate-limited
            .mockResolvedValueOnce(fakeResponse(429, null))         // groq key 2 rate-limited
            .mockResolvedValueOnce(fakeResponse(200, sseBody(['ok']))) // sambanova key 1 wins
        vi.stubGlobal('fetch', fetchMock)

        const { controller } = collector()
        const events: Array<{ type: string; backend?: string }> = []

        const result = await tryFailover({
            failover: SIMPLE_FAILOVER,
            messages: [],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'smart',
            logEvent: e => events.push({ type: e.event_type, backend: e.backend }),
        })

        expect(result.ok).toBe(true)
        expect(result.label).toBe('SambaNova DeepSeek')
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(events.filter(e => e.type === 'rate_limit')).toHaveLength(2)
        expect(events.filter(e => e.type === 'rate_limit').every(e => e.backend === 'Groq GPT-OSS')).toBe(true)
    })

    it('returns ok:false when every provider returns 5xx — never throws', async () => {
        const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, null))
        vi.stubGlobal('fetch', fetchMock)

        const { controller } = collector()
        const events: string[] = []

        const result = await tryFailover({
            failover: SIMPLE_FAILOVER,
            messages: [],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'smart',
            logEvent: e => events.push(e.event_type),
        })

        expect(result.ok).toBe(false)
        expect(result.backend).toBeUndefined()
        // 2 groq keys + 1 samba key + 1 openrouter key = 4 attempts
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(events.filter(e => e === 'error').length).toBe(4)
    })

    it('treats a thrown network error as a step failure and continues', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockResolvedValueOnce(fakeResponse(200, sseBody(['recovered'])))
        vi.stubGlobal('fetch', fetchMock)

        const { controller } = collector()
        const events: Array<{ type: string; status?: string }> = []

        const result = await tryFailover({
            failover: SIMPLE_FAILOVER,
            messages: [],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'smart',
            logEvent: e => events.push({ type: e.event_type, status: e.status }),
        })

        expect(result.ok).toBe(true)
        expect(result.label).toBe('SambaNova DeepSeek')
        expect(events.filter(e => e.status === 'exception')).toHaveLength(2)
    })

    it('skips a step entirely when a non-configured provider has no keys', async () => {
        // 'gemini-grounded' has no keys in this test env — it should be silently skipped
        const failover: FailoverStep[] = [
            { provider: 'gemini-grounded', model: 'gemini-2.5-flash', label: 'Gemini Grounded' },
            { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Groq Fast' },
        ]
        const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse(200, sseBody(['fast'])))
        vi.stubGlobal('fetch', fetchMock)

        const { controller } = collector()
        const result = await tryFailover({
            failover,
            messages: [],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'fast',
            logEvent: () => { },
        })

        expect(result.ok).toBe(true)
        expect(result.label).toBe('Groq Fast')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('separates <think> blocks into thinking events', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            fakeResponse(200, sseBody(['<think>reasoning here</think>', 'visible answer']))
        )
        vi.stubGlobal('fetch', fetchMock)

        const { controller, chunks } = collector()
        await tryFailover({
            failover: SIMPLE_FAILOVER,
            messages: [],
            maxTokens: 128,
            encoder: new TextEncoder(),
            controller,
            userId: 'u1',
            selectedModel: 'reasoner',
            logEvent: () => { },
        })

        const merged = chunks.join('')
        expect(merged).toMatch(/"type":"thinking"/)
        expect(merged).toMatch(/"type":"token"/)
        expect(merged).toContain('reasoning here')
        expect(merged).toContain('visible')
        expect(merged).toContain('answer')
    })
})
