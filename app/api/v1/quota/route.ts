/**
 * GET /api/v1/quota?user_id=<uuid>
 *
 * Returns the current UTC day's usage for the given user plus company-wide
 * totals, broken down by tier.
 */

import { readQuota } from '@/lib/v2/quota'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    const userId = new URL(req.url).searchParams.get('user_id')
    try {
        const data = await readQuota(userId)
        return Response.json({ ok: true, ...data })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500 })
    }
}
