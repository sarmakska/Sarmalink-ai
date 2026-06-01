/**
 * POST /api/v1/agent
 *
 * Body: { goal: string }
 * Response: text/event-stream of agent events. See lib/v2/agent-runner.ts
 * for the event shape.
 */

import { AgentInputSchema, runAgentSSE } from '@/lib/v2/agent-runner'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = AgentInputSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }

    const stream = runAgentSSE(parsed.data)
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    })
}
