/**
 * Tool orchestrator — runs every registered tool against a user message
 * and returns their results (already sanitized for prompt injection).
 *
 * This is the single entry point the route handler calls. Adding or
 * removing tools doesn't require touching the handler — just the registry.
 */

import { TOOLS, type ToolResult } from './registry'
import { wrapToolResult } from '@/lib/prompts/sanitize'

export interface ToolRunOptions {
    /**
     * Optional failure sink. Called whenever a tool throws or returns empty.
     * The orchestrator wires this to the ai_events logger so the Admin Health
     * endpoint can surface broken tools (revoked Tavily key, Open-Meteo outage,
     * etc.) instead of hiding them behind a silent `catch`.
     */
    onFailure?: (e: { tool: string; label: string; reason: 'error' | 'empty_output'; message?: string }) => void
}

/**
 * Run all tools whose `detect()` returns non-null for this message.
 * Returns an array of results in registry order. Callers should
 * concatenate these onto the user message before the failover fires.
 *
 * Tool failures never block the chat request, but they are now reported
 * through `onFailure` (when provided) so operators can see a revoked API key
 * or upstream outage in the health dashboard. A `console.error` also fires
 * unconditionally so at minimum the failure shows up in server logs.
 */
export async function runTools(message: string, opts: ToolRunOptions = {}): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const tool of TOOLS) {
        try {
            const args = tool.detect(message)
            if (args === null) continue

            const rawOutput = await tool.execute(args)
            if (!rawOutput) {
                console.error(`[tools] ${tool.name} returned empty output`)
                opts.onFailure?.({ tool: tool.name, label: tool.label, reason: 'empty_output' })
                continue
            }

            results.push({
                tool: tool.name,
                label: tool.label,
                output: wrapToolResult(tool.label, rawOutput),
            })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message.slice(0, 300) : 'unknown error'
            console.error(`[tools] ${tool.name} failed: ${msg}`)
            opts.onFailure?.({ tool: tool.name, label: tool.label, reason: 'error', message: msg })
            continue
        }
    }

    return results
}

/**
 * Summarize tool results into a single string ready for prompt injection.
 */
export function formatToolResults(results: ToolResult[]): string {
    if (results.length === 0) return ''
    return '\n\n' + results.map(r => r.output).join('\n\n')
}
