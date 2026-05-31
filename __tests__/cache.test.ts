import { describe, it, expect } from 'vitest'
import { buildCachedRequest, applyPromptCache, DEFAULT_CACHE_CONFIG } from '@/lib/providers/cache'
import type { CacheableMessage } from '@/lib/providers/cache'

const longSystem = 'You are a helpful assistant. '.repeat(60) // > 1024 chars
const shortSystem = 'Be brief.'

function messages(system: string): CacheableMessage[] {
    return [
        { role: 'system', content: system },
        { role: 'user', content: 'hello' },
    ]
}

const enabled = { ...DEFAULT_CACHE_CONFIG, enabled: true, cacheKey: 'k1' }

describe('buildCachedRequest', () => {
    it('applies an Anthropic ephemeral breakpoint on the system message', () => {
        const out = buildCachedRequest('anthropic', messages(longSystem), enabled)
        expect(out.applied).toBe(true)
        const sys = out.messages[0]
        expect(Array.isArray(sys.content)).toBe(true)
        const block = (sys.content as Array<Record<string, unknown>>)[0]
        expect(block.cache_control).toEqual({ type: 'ephemeral' })
        expect(out.bodyExtras.prompt_cache_key).toBe('k1')
    })

    it('sets a prompt_cache_key for OpenAI-compatible providers without rewriting messages', () => {
        const out = buildCachedRequest('github-models', messages(longSystem), enabled)
        expect(out.applied).toBe(true)
        expect(out.bodyExtras.prompt_cache_key).toBe('k1')
        // messages untouched (still a plain string system)
        expect(typeof out.messages[0].content).toBe('string')
    })

    it('is a no-op when the system prefix is shorter than the threshold', () => {
        const out = buildCachedRequest('anthropic', messages(shortSystem), enabled)
        expect(out.applied).toBe(false)
        expect(out.bodyExtras).toEqual({})
        expect(out.messages[0].content).toBe(shortSystem)
    })

    it('is a no-op when caching is disabled', () => {
        const out = buildCachedRequest('anthropic', messages(longSystem), { ...enabled, enabled: false })
        expect(out.applied).toBe(false)
    })

    it('does nothing for a provider with no caching support (gemini-grounded)', () => {
        const out = buildCachedRequest('gemini-grounded', messages(longSystem), enabled)
        expect(out.applied).toBe(false)
        expect(out.bodyExtras).toEqual({})
    })

    it('never mutates the input messages', () => {
        const input = messages(longSystem)
        const before = JSON.stringify(input)
        buildCachedRequest('anthropic', input, enabled)
        expect(JSON.stringify(input)).toBe(before)
    })
})

describe('applyPromptCache', () => {
    it('merges cache directives into a request body without mutating it', () => {
        const body = { model: 'claude-opus-4-7', messages: messages(longSystem), temperature: 0.7 }
        const out = applyPromptCache('anthropic', body, enabled)
        expect(out.prompt_cache_key).toBe('k1')
        expect(out.model).toBe('claude-opus-4-7')
        // original body untouched
        expect((body as Record<string, unknown>).prompt_cache_key).toBeUndefined()
    })
})
