import { NextResponse } from 'next/server'
import { createManusTask, getManusTask, cancelManusTask, type ManusTaskInput } from '@/lib/integrations/manus'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ManusTaskInput | null
  if (!body?.prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  try {
    const created = await createManusTask(body)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    return NextResponse.json(await getManusTask(id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await cancelManusTask(id)
    return NextResponse.json({ cancelled: true, id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
