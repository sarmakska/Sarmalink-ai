/**
 * POST /api/v1/suggestions
 *
 * Body: { userMsg: string, aiMsg: string }
 * Returns: { suggestions: string[] } (up to 3 entries)
 */

import { SuggestionInputSchema, generateSuggestions } from '@/lib/v2/suggestions'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = SuggestionInputSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }
    const result = await generateSuggestions(parsed.data)
    return Response.json({ ok: true, ...result })
}
