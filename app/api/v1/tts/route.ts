/**
 * POST /api/v1/tts
 *
 * Body: { text, voice?, language? }
 * Returns: audio/wav bytes.
 */

import { synthesise, TtsInputSchema } from '@/lib/v2/tts'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = TtsInputSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }
    try {
        const result = await synthesise(parsed.data)
        const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer
        return new Response(buffer, {
            headers: {
                'Content-Type': result.contentType,
                'X-Provider': result.provider,
                'Cache-Control': 'no-store',
            },
        })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 502 })
    }
}
