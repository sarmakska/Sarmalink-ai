/**
 * POST /api/v1/images/generate
 *
 * Body: { prompt: string, model?: string }
 * Returns: { base64, url, provider }
 */

import { generateImage, ImageGenInputSchema } from '@/lib/v2/image-gen'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = ImageGenInputSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }
    try {
        const result = await generateImage(parsed.data)
        return Response.json({ ok: true, ...result })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 502 })
    }
}
