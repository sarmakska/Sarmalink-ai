/**
 * Text-to-speech cascade.
 *
 * Order:
 *   1. Cloudflare Workers AI MeloTTS, rotating across up to 4 account/token
 *      pairs from env.
 *   2. Gemini TTS as a paid fallback, rotating across all configured Gemini
 *      keys.
 *
 * Returns raw WAV bytes (audio/wav). Supports EN, ES, FR, ZH, JP, KR.
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const TtsInputSchema = z.object({
    text: z.string().min(1).max(4000),
    voice: z.string().optional(),
    language: z.enum(['en', 'es', 'fr', 'zh', 'ja', 'ko']).optional().default('en'),
})
export type TtsInput = z.infer<typeof TtsInputSchema>

export interface TtsResult {
    bytes: Uint8Array
    contentType: string
    provider: 'cloudflare-melotts' | 'gemini'
}

const CF_MELOTTS_MODEL = '@cf/myshell-ai/melotts'

async function tryCloudflareMeloTTS(text: string, lang: string): Promise<TtsResult | null> {
    const pairs = env().providers.cloudflare
    for (const { accountId, token } of pairs) {
        try {
            const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MELOTTS_MODEL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ prompt: text, lang }),
                signal: AbortSignal.timeout(30_000),
            })
            if (!res.ok) continue
            const data = await res.json().catch(() => null) as any
            const audioB64: string | undefined = data?.result?.audio
            if (!audioB64) continue
            const bytes = Uint8Array.from(Buffer.from(audioB64, 'base64'))
            return { bytes, contentType: 'audio/wav', provider: 'cloudflare-melotts' }
        } catch {
            continue
        }
    }
    return null
}

async function tryGeminiTTS(text: string): Promise<TtsResult | null> {
    const keys = env().providers.gemini
    for (const key of keys) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text }] }],
                        generationConfig: { responseModalities: ['AUDIO'] },
                    }),
                    signal: AbortSignal.timeout(30_000),
                },
            )
            if (!res.ok) continue
            const data = await res.json() as any
            const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
            if (!inline) continue
            const bytes = Uint8Array.from(Buffer.from(inline, 'base64'))
            return { bytes, contentType: 'audio/wav', provider: 'gemini' }
        } catch {
            continue
        }
    }
    return null
}

export async function synthesise(input: TtsInput): Promise<TtsResult> {
    const parsed = TtsInputSchema.parse(input)
    const cf = await tryCloudflareMeloTTS(parsed.text, parsed.language)
    if (cf) return cf
    const gem = await tryGeminiTTS(parsed.text)
    if (gem) return gem
    throw new Error('all TTS providers failed')
}
