import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildRpcRequest, parseRpcBody, mcpListTools, mcpCallTool } from '@/lib/plugins/mcp'

describe('buildRpcRequest', () => {
    it('builds a JSON-RPC 2.0 envelope with an id', () => {
        const req = buildRpcRequest('tools/list')
        expect(req.jsonrpc).toBe('2.0')
        expect(req.method).toBe('tools/list')
        expect(typeof req.id).toBe('number')
        expect(req.params).toBeUndefined()
    })

    it('includes params when provided', () => {
        const req = buildRpcRequest('tools/call', { name: 'echo', arguments: { x: 1 } })
        expect(req.params).toEqual({ name: 'echo', arguments: { x: 1 } })
    })
})

describe('parseRpcBody', () => {
    it('parses a plain JSON response', () => {
        const r = parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}')
        expect(r.result).toEqual({ tools: [] })
    })

    it('parses a JSON-RPC frame out of an SSE body', () => {
        const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n'
        const r = parseRpcBody(sse)
        expect(r.result).toEqual({ ok: true })
    })

    it('throws on an empty body', () => {
        expect(() => parseRpcBody('   ')).toThrow(/empty/)
    })

    it('throws when no JSON-RPC frame is present', () => {
        expect(() => parseRpcBody('event: ping\ndata: [DONE]\n')).toThrow(/no JSON-RPC frame/)
    })
})

describe('mcpListTools / mcpCallTool routing', () => {
    const ENV = 'PLUGIN_MCP_SERVER_URL'
    const TOK = 'PLUGIN_MCP_SERVER_TOKEN'
    const prevUrl = process.env[ENV]
    const prevTok = process.env[TOK]

    afterEach(() => {
        vi.restoreAllMocks()
        if (prevUrl === undefined) delete process.env[ENV]; else process.env[ENV] = prevUrl
        if (prevTok === undefined) delete process.env[TOK]; else process.env[TOK] = prevTok
        vi.resetModules()
    })

    it('returns 503 when the MCP plugin is not enabled', async () => {
        delete process.env[ENV]
        vi.resetModules()
        const { mcpListTools: listFresh } = await import('@/lib/plugins/mcp')
        const r = await listFresh('mcp-server-toolkit')
        expect(r.ok).toBe(false)
        expect(r.status).toBe(503)
    })

    it('lists tools when the plugin is enabled, sending bearer auth from env', async () => {
        process.env[ENV] = 'https://mcp.example.com/rpc'
        process.env[TOK] = 'secret-token'
        vi.resetModules()
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'search' }] } }),
        })
        vi.stubGlobal('fetch', fetchMock)
        const { mcpListTools: listFresh } = await import('@/lib/plugins/mcp')
        const r = await listFresh('mcp-server-toolkit')
        expect(r.ok).toBe(true)
        expect(r.result?.tools?.[0]?.name).toBe('search')
        const [, init] = fetchMock.mock.calls[0]
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
        const sentBody = JSON.parse(init.body as string)
        expect(sentBody.method).toBe('tools/list')
    })

    it('calls a tool by name and forwards arguments', async () => {
        process.env[ENV] = 'https://mcp.example.com/rpc'
        vi.resetModules()
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'done' }] } }),
        })
        vi.stubGlobal('fetch', fetchMock)
        const { mcpCallTool: callFresh } = await import('@/lib/plugins/mcp')
        const r = await callFresh('mcp-server-toolkit', 'search', { q: 'hi' })
        expect(r.ok).toBe(true)
        const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
        expect(sentBody.method).toBe('tools/call')
        expect(sentBody.params).toEqual({ name: 'search', arguments: { q: 'hi' } })
    })

    it('rejects a tool call with no tool name', async () => {
        const r = await mcpCallTool('mcp-server-toolkit', '')
        expect(r.ok).toBe(false)
        expect(r.status).toBe(400)
    })
})
