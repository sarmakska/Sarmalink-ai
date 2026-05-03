/**
 * Webhook receiver for Manus task completion callbacks.
 *
 * Manus posts a JSON body with the final task result. This handler
 * verifies the HMAC-SHA256 signature using MANUS_WEBHOOK_SECRET (if set)
 * and upserts the task row into manus_tasks via the Supabase admin client.
 *
 * Expected payload shape:
 *   { id: string, status: string, output?: unknown, artifacts?: unknown, ... }
 *
 * Signature header: x-manus-signature — hex-encoded HMAC-SHA256 of the raw
 * request body, keyed with MANUS_WEBHOOK_SECRET.
 */

import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { upsertManusTask } from '@/lib/repositories/manus-tasks'

export const runtime = 'nodejs'

async function verifySignature(secret: string, body: Buffer, sig: string | null): Promise<boolean> {
  if (!sig) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.MANUS_WEBHOOK_SECRET
  const rawBuffer = Buffer.from(await req.arrayBuffer())

  if (secret) {
    const sig = req.headers.get('x-manus-signature')
    const valid = await verifySignature(secret, rawBuffer, sig)
    if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBuffer.toString('utf8')) as Record<string, unknown>
    if (!payload || typeof payload !== 'object') throw new Error('not an object')
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const id = typeof payload.id === 'string' ? payload.id : null
  const status = typeof payload.status === 'string' ? payload.status : 'unknown'
  if (!id) return NextResponse.json({ error: 'payload missing id' }, { status: 400 })

  try {
    await upsertManusTask(
      id,
      status,
      payload.output ?? null,
      payload.artifacts ?? null,
    )
  } catch (e) {
    console.error('[manus-webhook] persist failed', (e as Error).message)
    return NextResponse.json({ error: 'storage error' }, { status: 500 })
  }

  console.log('[manus-webhook] persisted', id, status)
  return NextResponse.json({ received: true, id })
}
