import { NextResponse } from 'next/server'

/**
 * Webhook receiver for Manus task completion callbacks.
 *
 * Manus posts a JSON body with the final task result. This handler
 * verifies the signature (if MANUS_WEBHOOK_SECRET is set) and persists
 * the result so consumers can pick it up by task id.
 *
 * Persistence is intentionally a stub — wire it to your storage of
 * choice (Postgres via Drizzle, Redis, or a Supabase row).
 */

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = process.env.MANUS_WEBHOOK_SECRET
  if (secret) {
    const sig = req.headers.get('x-manus-signature')
    if (sig !== secret) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // TODO: persist payload by id. Stub implementation logs and returns.
  console.log('[manus-webhook]', JSON.stringify(payload).slice(0, 500))

  return NextResponse.json({ received: true })
}
