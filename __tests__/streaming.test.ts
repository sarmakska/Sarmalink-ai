import { describe, it, expect } from 'vitest'
import {
    serialiseEvent,
    parseEventLine,
    isKnownEventType,
    readUsageFromProviderPayload,
    type StreamEvent,
} from '@/lib/streaming/events'

describe('serialiseEvent', () => {
    it('frames a token event as an SSE data line', () => {
        const frame = serialiseEvent({ type: 'token', text: 'hi' })
        expect(frame).toBe('data: {"type":"token","text":"hi"}\n\n')
    })

    it('throws on an unknown event type', () => {
        expect(() => serialiseEvent({ type: 'nonsense' } as unknown as StreamEvent)).toThrow(/unknown stream event/)
    })
})

describe('parseEventLine', () => {
    it('round-trips a serialised event', () => {
        const original: StreamEvent = { type: 'usage', completionTokens: 42, cachedTokens: 10, cacheHit: true }
        const frame = serialiseEvent(original).trim()
        const result = parseEventLine(frame)
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.event).toEqual(original)
    })

    it('rejects the [DONE] terminator', () => {
        expect(parseEventLine('data: [DONE]').ok).toBe(false)
    })

    it('rejects a non-data line', () => {
        expect(parseEventLine('event: ping').ok).toBe(false)
    })

    it('rejects malformed JSON', () => {
        const r = parseEventLine('data: {not json')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe('invalid json')
    })

    it('rejects an unknown event type', () => {
        const r = parseEventLine('data: {"type":"mystery"}')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toContain('unknown type')
    })
})

describe('isKnownEventType', () => {
    it('recognises every documented type', () => {
        for (const t of ['token', 'thinking', 'backend', 'auto_routed', 'image', 'sources', 'usage', 'done', 'error']) {
            expect(isKnownEventType(t)).toBe(true)
        }
    })
    it('rejects unknown strings and non-strings', () => {
        expect(isKnownEventType('foo')).toBe(false)
        expect(isKnownEventType(42)).toBe(false)
    })
})

describe('readUsageFromProviderPayload', () => {
    it('reads OpenAI-compatible cached_tokens', () => {
        const u = readUsageFromProviderPayload({
            usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 800 } },
        })
        expect(u).toEqual({ type: 'usage', promptTokens: 1000, completionTokens: 200, cachedTokens: 800, cacheHit: true })
    })

    it('reads Anthropic cache_read_input_tokens and output_tokens', () => {
        const u = readUsageFromProviderPayload({
            usage: { input_tokens: 500, output_tokens: 120, cache_read_input_tokens: 0 },
        })
        expect(u?.promptTokens).toBe(500)
        expect(u?.completionTokens).toBe(120)
        expect(u?.cachedTokens).toBe(0)
        expect(u?.cacheHit).toBe(false)
    })

    it('returns undefined when there is no usage block', () => {
        expect(readUsageFromProviderPayload({ choices: [] })).toBeUndefined()
        expect(readUsageFromProviderPayload(null)).toBeUndefined()
    })
})
