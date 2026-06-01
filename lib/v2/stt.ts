/**
 * Speech-to-text cascade.
 *
 * Order:
 *   1. Groq Whisper (whisper-large-v3-turbo), rotating across all keys.
 *   2. Cloudflare Workers AI Whisper, rotating across account/token pairs.
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const SttOutputSchema = z.object({
    text: z.string(),
    language: z.string().optional(),
    provider: z.enum(['groq', 'cloudflare']),
})
export type SttOutput = z.infer<typeof SttOutputSchema>

async function tryGroq(file: Blob, filename: string): Promise<SttOutput | null> {
    const keys = env().providers.groq
    for (const key of keys) {
        try {
            const fd = new FormData()
            fd.append('file', file, filename)
            fd.append('model', 'whisper-large-v3-turbo')
            fd.append('response_format', 'verbose_json')
            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}` },
                body: fd,
                signal: AbortSignal.timeout(60_000),
            })
            if (!res.ok) continue
            const data = await res.json() as any
            return { text: String(data?.text ?? ''), language: data?.language, provider: 'groq' }
        } catch {
            continue
        }
    }
    return null
}

async function tryCloudflare(file: Blob): Promise<SttOutput | null> {
    const pairs = env().providers.cloudflare
    const buf = new Uint8Array(await file.arrayBuffer())
    for (const { accountId, token } of pairs) {
        try {
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
                    body: buf,
                    signal: AbortSignal.timeout(60_000),
                },
            )
            if (!res.ok) continue
            const data = await res.json() as any
            return { text: String(data?.result?.text ?? ''), provider: 'cloudflare' }
        } catch {
            continue
        }
    }
    return null
}

export async function transcribe(file: Blob, filename = 'audio.webm'): Promise<SttOutput> {
    const groq = await tryGroq(file, filename)
    if (groq) return groq
    const cf = await tryCloudflare(file)
    if (cf) return cf
    throw new Error('all STT providers failed')
}
