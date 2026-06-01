/**
 * POST /api/v1/stt
 *
 * multipart/form-data with field `file` containing the audio.
 * Returns: { text, language?, provider }
 */

import { transcribe } from '@/lib/v2/stt'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    let form: FormData
    try {
        form = await req.formData()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'expected multipart/form-data' }), { status: 400 })
    }
    const file = form.get('file')
    if (!(file instanceof Blob)) {
        return new Response(JSON.stringify({ ok: false, error: 'file field required' }), { status: 400 })
    }
    try {
        const result = await transcribe(file, (file as File).name || 'audio.webm')
        return Response.json({ ok: true, ...result })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 502 })
    }
}
