/**
 * MCP tool-call passthrough endpoint.
 *
 * GET  /api/v1/mcp?plugin=<id>           list the tools an MCP plugin exposes
 * POST /api/v1/mcp { plugin, tool, args } invoke one tool by name
 *
 * The target plugin must be registered with an `mcp` intent and have its
 * endpoint env var set. Auth to the upstream MCP server is taken from the
 * plugin's configured bearer-token env var, so no secret is ever accepted
 * from the client. See `lib/plugins/mcp.ts` for the JSON-RPC wire details.
 */

import { NextResponse } from 'next/server'
import { mcpListTools, mcpCallTool } from '@/lib/plugins/mcp'
import { logEvent } from '@/lib/services/event-logger'

export const runtime = 'nodejs'

const DEFAULT_PLUGIN = 'mcp-server-toolkit'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const plugin = searchParams.get('plugin') || DEFAULT_PLUGIN
    const result = await mcpListTools(plugin)
    return NextResponse.json(result, { status: result.ok ? 200 : result.status })
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null) as
        | { plugin?: string; tool?: string; args?: Record<string, unknown> }
        | null
    if (!body?.tool) {
        return NextResponse.json({ ok: false, error: 'tool required' }, { status: 400 })
    }
    const plugin = body.plugin || DEFAULT_PLUGIN
    const result = await mcpCallTool(plugin, body.tool, body.args ?? {})
    logEvent({
        event_type: result.ok ? 'mcp_call' : 'error',
        backend: `mcp:${plugin}`,
        status: result.ok ? 'success' : 'mcp_error',
        meta: { tool: body.tool, error: result.error },
    }).catch(() => { /* never block on logging */ })
    return NextResponse.json(result, { status: result.ok ? 200 : result.status })
}
