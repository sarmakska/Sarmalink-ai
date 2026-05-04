/**
 * GET /api/v1/manus/tasks/:id
 *
 * Returns the persisted Manus task row received via webhook.
 * Returns 404 if the task has not been received yet (either it has not
 * completed, or the webhook was not configured).
 */

import { NextResponse } from 'next/server'
import { getManusTaskRow } from '@/lib/repositories/manus-tasks'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const row = await getManusTaskRow(id)
    if (!row) return NextResponse.json({ error: 'task not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[manus-tasks-get]', (e as Error).message)
    return NextResponse.json({ error: 'storage error' }, { status: 500 })
  }
}
