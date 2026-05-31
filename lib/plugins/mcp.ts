/**
 * MCP tool-call passthrough.
 *
 * The Model Context Protocol is how tools advertise themselves to and are
 * invoked by an LLM host. SarmaLink-AI already registers an MCP plugin
 * (`mcp-server-toolkit`) in the cross-repo registry; this module gives that
 * registration teeth by speaking the MCP JSON-RPC 2.0 wire protocol over the
 * Streamable HTTP transport. A deployment can list the tools a configured MCP
 * server exposes and invoke any of them, passing the structured result back to
 * the caller (or into a model turn).
 *
 * Two methods are implemented, which is all a passthrough needs:
 *   - `tools/list`  enumerate the server's tools
 *   - `tools/call`  invoke one tool by name with an arguments object
 *
 * Transport: a single POST per request with `Accept: application/json,
 * text/event-stream`, per the Streamable HTTP spec. Servers may answer with a
 * plain JSON body or an SSE stream carrying one JSON-RPC response; both are
 * handled. The JSON-RPC framing helpers are pure and unit-tested in
 * `__tests__/mcp.test.ts`.
 */

import { findPlugin } from '@/lib/plugins/index'

export interface McpTool {
    name: string
    description?: string
    inputSchema?: Record<string, unknown>
}

export interface JsonRpcRequest {
    jsonrpc: '2.0'
    id: number | string
    method: string
    params?: Record<string, unknown>
}

export interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0'
    id: number | string
    result?: T
    error?: { code: number; message: string; data?: unknown }
}

let _id = 0
function nextId(): number {
    _id = (_id + 1) % Number.MAX_SAFE_INTEGER
    return _id
}

/** Build a JSON-RPC 2.0 request envelope. Pure. */
export function buildRpcRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
    return { jsonrpc: '2.0', id: nextId(), method, ...(params ? { params } : {}) }
}

/**
 * Extract the JSON-RPC response from a raw transport body. Accepts either a
 * plain JSON object or an SSE stream whose `data:` lines carry the response.
 * Returns the parsed envelope or throws with a clear message. Pure.
 */
export function parseRpcBody(raw: string): JsonRpcResponse {
    const trimmed = raw.trim()
    if (trimmed === '') throw new Error('empty MCP response body')

    // Plain JSON path.
    if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed) as JsonRpcResponse
    }

    // SSE path: find the first well-formed JSON-RPC data frame.
    for (const line of trimmed.split('\n')) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const payload = l.slice(l.indexOf(':') + 1).trim()
        if (!payload || payload === '[DONE]') continue
        try {
            const obj = JSON.parse(payload)
            if (obj && obj.jsonrpc === '2.0') return obj as JsonRpcResponse
        } catch { /* keep scanning */ }
    }
    throw new Error('no JSON-RPC frame found in MCP response')
}

export interface McpCallResult<T = unknown> {
    ok: boolean
    status: number
    result?: T
    error?: string
}

async function rpc<T>(endpoint: string, headers: Record<string, string>, req: JsonRpcRequest): Promise<McpCallResult<T>> {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...headers,
            },
            body: JSON.stringify(req),
        })
        const text = await res.text()
        if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 300) || res.statusText }
        const parsed = parseRpcBody(text)
        if (parsed.error) return { ok: false, status: res.status, error: parsed.error.message }
        return { ok: true, status: res.status, result: parsed.result as T }
    } catch (e) {
        return { ok: false, status: 502, error: (e as Error).message }
    }
}

function resolveMcpEndpoint(pluginId: string): { endpoint: string; headers: Record<string, string> } | { error: string } {
    const plugin = findPlugin(pluginId)
    if (!plugin) return { error: `plugin not registered: ${pluginId}` }
    if (!plugin.enabled || !plugin.endpoint) return { error: `plugin not enabled: ${pluginId}` }
    if (!plugin.intents.includes('mcp')) return { error: `plugin ${pluginId} does not advertise an mcp intent` }

    const headers: Record<string, string> = {}
    if (plugin.auth?.type === 'bearer' && plugin.auth.envVar) {
        const token = process.env[plugin.auth.envVar]
        if (token) headers['authorization'] = `Bearer ${token}`
    }
    return { endpoint: plugin.endpoint, headers }
}

/** List the tools an MCP plugin exposes. */
export async function mcpListTools(pluginId: string): Promise<McpCallResult<{ tools: McpTool[] }>> {
    const resolved = resolveMcpEndpoint(pluginId)
    if ('error' in resolved) return { ok: false, status: 503, error: resolved.error }
    return rpc<{ tools: McpTool[] }>(resolved.endpoint, resolved.headers, buildRpcRequest('tools/list'))
}

/** Invoke a single tool on an MCP plugin by name with an arguments object. */
export async function mcpCallTool(
    pluginId: string,
    toolName: string,
    args: Record<string, unknown> = {},
): Promise<McpCallResult> {
    if (!toolName) return { ok: false, status: 400, error: 'tool name required' }
    const resolved = resolveMcpEndpoint(pluginId)
    if ('error' in resolved) return { ok: false, status: 503, error: resolved.error }
    return rpc(resolved.endpoint, resolved.headers, buildRpcRequest('tools/call', { name: toolName, arguments: args }))
}
