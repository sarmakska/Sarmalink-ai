/**
 * POST /api/v1/mcp/catalog
 *
 * Bearer-protected catalog endpoint. The token comes from MCP_INTERNAL_KEY.
 *
 *   Authorization: Bearer <MCP_INTERNAL_KEY>
 *
 * Request body shapes:
 *   { "tool": "list_tools" }
 *   { "tool": "<tool_name>", "args": { ... } }
 *
 * See lib/v2/mcp-catalog.ts for registered tools.
 */

import { McpRequestSchema, callTool, listTools } from '@/lib/v2/mcp-catalog'

export const runtime = 'nodejs'

function unauthorised() {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorised' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
    })
}

export async function POST(req: Request) {
    const required = process.env.MCP_INTERNAL_KEY
    if (!required) {
        return new Response(JSON.stringify({ ok: false, error: 'MCP_INTERNAL_KEY not configured' }), { status: 500 })
    }
    const auth = req.headers.get('authorization') || ''
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    if (token !== required) return unauthorised()

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = McpRequestSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }

    if (parsed.data.tool === 'list_tools') {
        return Response.json({ ok: true, tools: listTools() })
    }

    const result = await callTool(parsed.data.tool, (parsed.data as any).args)
    return Response.json(result, { status: result.ok ? 200 : 400 })
}
