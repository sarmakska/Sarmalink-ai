import { NextResponse } from 'next/server'
import { invokePlugin } from '@/lib/plugins'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as
    | { id?: string; path?: string; method?: 'GET' | 'POST'; body?: unknown }
    | null
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const result = await invokePlugin(body.id, {
    path: body.path,
    method: body.method,
    body: body.body,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : result.status })
}
