import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mapOpenAIModelToMode } from '@/lib/openai-proxy/model-mapper'
import { POST } from '@/app/api/v1/chat/completions/route'

describe('mapOpenAIModelToMode', () => {
    it('maps code-ish names to coder', () => {
        expect(mapOpenAIModelToMode('codestral-latest')).toBe('coder')
        expect(mapOpenAIModelToMode('qwen-coder-32b')).toBe('coder')
        expect(mapOpenAIModelToMode('some-code-model')).toBe('coder')
    })

    it('maps reasoning model names to reasoner', () => {
        expect(mapOpenAIModelToMode('o1')).toBe('reasoner')
        expect(mapOpenAIModelToMode('o3-mini')).toBe('reasoner')
        expect(mapOpenAIModelToMode('deepseek-reasoner')).toBe('reasoner')
        expect(mapOpenAIModelToMode('qwen-thinking')).toBe('reasoner')
    })

    it('maps vision-ish names to vision', () => {
        expect(mapOpenAIModelToMode('pixtral-12b')).toBe('vision')
        expect(mapOpenAIModelToMode('llama-4-scout')).toBe('vision')
        expect(mapOpenAIModelToMode('gpt-4-vision')).toBe('vision')
    })

    it('maps fast-ish names to fast', () => {
        expect(mapOpenAIModelToMode('gemini-flash')).toBe('fast')
        expect(mapOpenAIModelToMode('llama-3.1-8b')).toBe('fast')
        expect(mapOpenAIModelToMode('gpt-4o-mini')).toBe('fast')
        expect(mapOpenAIModelToMode('something-fast')).toBe('fast')
    })

    it('falls back to smart for everything else', () => {
        expect(mapOpenAIModelToMode('gpt-4o')).toBe('smart')
        expect(mapOpenAIModelToMode('claude-3-opus')).toBe('smart')
        expect(mapOpenAIModelToMode('anything')).toBe('smart')
        expect(mapOpenAIModelToMode('')).toBe('smart')
    })

    it('is case-insensitive', () => {
        expect(mapOpenAIModelToMode('CODESTRAL-LATEST')).toBe('coder')
        expect(mapOpenAIModelToMode('Pixtral-Large')).toBe('vision')
    })
})

describe('POST /api/v1/chat/completions', () => {
    const originalEnv = process.env.ENABLE_OPENAI_PROXY

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.ENABLE_OPENAI_PROXY
        else process.env.ENABLE_OPENAI_PROXY = originalEnv
    })

    it('returns 404 when ENABLE_OPENAI_PROXY is unset', async () => {
        delete process.env.ENABLE_OPENAI_PROXY
        const res = await POST(new Request('http://localhost/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer some-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
        }))
        expect(res.status).toBe(404)
    })

    it('returns 404 when ENABLE_OPENAI_PROXY is false', async () => {
        process.env.ENABLE_OPENAI_PROXY = 'false'
        const res = await POST(new Request('http://localhost/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer some-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
        }))
        expect(res.status).toBe(404)
    })

    it('returns 401 when Authorization header missing', async () => {
        process.env.ENABLE_OPENAI_PROXY = 'true'
        const res = await POST(new Request('http://localhost/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
        }))
        expect(res.status).toBe(401)
        const body = await res.json() as any
        expect(body.error?.code).toBe('missing_auth')
    })

    it('returns 401 when bearer token is empty string', async () => {
        process.env.ENABLE_OPENAI_PROXY = 'true'
        const res = await POST(new Request('http://localhost/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
        }))
        expect(res.status).toBe(401)
    })
})
