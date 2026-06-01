/**
 * MCP-shaped HTTP tool catalog.
 *
 * A minimal in-process tool registry, addressable over HTTP with a request
 * shape similar to the MCP `tools/call` JSON-RPC method. Bearer-protected
 * via MCP_INTERNAL_KEY.
 *
 * To register your own tool, push a `ToolDef` onto the exported `tools`
 * array (or call `registerTool`). Each tool declares a Zod schema for its
 * arguments so invalid calls are rejected before the handler runs.
 */

import { z, type ZodTypeAny } from 'zod'
import { randomUUID } from 'node:crypto'

export interface ToolDef<Schema extends ZodTypeAny = ZodTypeAny> {
    name: string
    description: string
    inputSchema: Schema
    handler: (args: z.infer<Schema>) => Promise<unknown> | unknown
}

const registry = new Map<string, ToolDef>()

export function registerTool<S extends ZodTypeAny>(def: ToolDef<S>): void {
    registry.set(def.name, def as ToolDef)
}

export function listTools(): { name: string; description: string; inputSchema: unknown }[] {
    return Array.from(registry.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonish(t.inputSchema),
    }))
}

export async function callTool(name: string, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const def = registry.get(name)
    if (!def) return { ok: false, error: `unknown tool: ${name}` }
    const parsed = def.inputSchema.safeParse(args ?? {})
    if (!parsed.success) return { ok: false, error: `invalid args: ${parsed.error.message}` }
    try {
        const result = await def.handler(parsed.data)
        return { ok: true, result }
    } catch (err) {
        return { ok: false, error: (err as Error).message }
    }
}

/**
 * Tiny Zod-to-JSON-ish describer. Good enough for a catalog response. For
 * full JSON Schema, swap in zod-to-json-schema.
 */
function zodToJsonish(schema: ZodTypeAny): unknown {
    const def: any = (schema as any)._def
    if (!def) return { type: 'object' }
    if (def.typeName === 'ZodObject') {
        const shape = def.shape()
        const properties: Record<string, unknown> = {}
        for (const k of Object.keys(shape)) properties[k] = zodToJsonish(shape[k])
        return { type: 'object', properties }
    }
    if (def.typeName === 'ZodString') return { type: 'string' }
    if (def.typeName === 'ZodNumber') return { type: 'number' }
    if (def.typeName === 'ZodBoolean') return { type: 'boolean' }
    if (def.typeName === 'ZodOptional') return zodToJsonish(def.innerType)
    if (def.typeName === 'ZodDefault') return zodToJsonish(def.innerType)
    return { type: 'unknown' }
}

// ── Demo tools ──────────────────────────────────────────────────────────────

registerTool({
    name: 'current_time',
    description: 'Return the current server time as ISO 8601 UTC.',
    inputSchema: z.object({}),
    handler: () => ({ now: new Date().toISOString() }),
})

registerTool({
    name: 'random_uuid',
    description: 'Generate a random v4 UUID.',
    inputSchema: z.object({}),
    handler: () => ({ uuid: randomUUID() }),
})

registerTool({
    name: 'echo',
    description: 'Echo back the supplied message.',
    inputSchema: z.object({ message: z.string().min(1).max(2000) }),
    handler: ({ message }) => ({ message }),
})

// ── Request shape ───────────────────────────────────────────────────────────

export const McpRequestSchema = z.union([
    z.object({ tool: z.literal('list_tools') }),
    z.object({ tool: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() }),
])
export type McpRequest = z.infer<typeof McpRequestSchema>
