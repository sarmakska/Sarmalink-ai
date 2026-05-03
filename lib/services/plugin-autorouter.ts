/**
 * Plugin auto-router.
 *
 * When ENABLE_PLUGIN_AUTOROUTE=true, the first user message is scanned for
 * intent keywords before the request reaches the LLM. If a match is found
 * and the target plugin is enabled, the plugin is invoked and its response
 * is returned as a synthetic assistant message — no LLM call is made.
 *
 * Keyword → intent → plugin mapping:
 *   research / investigate / look up / find out  → manus (autonomous agent)
 *   voice / transcribe / speech / audio          → voice-agent-starter
 *   eval / evaluate / benchmark / run evals      → ai-eval-runner
 *   workflow / orchestrate / chain agents        → agent-orchestrator
 *   ingest pdf / embed / rag / retrieve          → rag-over-pdf
 *   scan receipt / ocr receipt                   → receipt-scanner
 *
 * If the flag is off, or no keyword matches, or the matched plugin is not
 * enabled, this returns null and the caller falls through to the normal
 * LLM path.
 */

import { PLUGIN_REGISTRY, invokePlugin, type PluginIntent } from '@/lib/plugins/index'

interface KeywordRule {
  patterns: RegExp
  intent: PluginIntent
  pluginId: string
}

// Order matters: more specific rules first.
const RULES: KeywordRule[] = [
  {
    patterns: /\b(research|investigate|look up|find out|web search for|deep research)\b/i,
    intent: 'browse',
    pluginId: 'agent-orchestrator',
  },
  {
    patterns: /\b(manus|autonomous agent|run a task on manus)\b/i,
    intent: 'browse',
    pluginId: 'agent-orchestrator',
  },
  {
    patterns: /\b(transcribe|voice loop|speech to text|real-?time voice|voice agent)\b/i,
    intent: 'voice',
    pluginId: 'voice-agent-starter',
  },
  {
    patterns: /\b(run eval|run evals|evaluate model|benchmark model|eval runner|eval dataset)\b/i,
    intent: 'eval',
    pluginId: 'ai-eval-runner',
  },
  {
    patterns: /\b(orchestrate|multi-?agent workflow|durable workflow|agent chain)\b/i,
    intent: 'workflow',
    pluginId: 'agent-orchestrator',
  },
  {
    patterns: /\b(ingest pdf|embed pdf|rag over|retrieval augmented|vector search)\b/i,
    intent: 'rag',
    pluginId: 'rag-over-pdf',
  },
  {
    patterns: /\b(scan receipt|ocr receipt|receipt scanner|parse receipt)\b/i,
    intent: 'ocr',
    pluginId: 'receipt-scanner',
  },
]

export type AutoRouteResult =
  | { matched: true; pluginId: string; intent: PluginIntent; reply: string }
  | { matched: false }

/**
 * Attempt to auto-route the message to a plugin.
 * Returns a result object — caller checks `.matched` to decide whether to
 * skip the LLM path.
 */
export async function tryPluginAutoRoute(message: string): Promise<AutoRouteResult> {
  if (process.env.ENABLE_PLUGIN_AUTOROUTE !== 'true') return { matched: false }
  if (!message || !message.trim()) return { matched: false }

  for (const rule of RULES) {
    if (!rule.patterns.test(message)) continue

    const plugin = PLUGIN_REGISTRY.find(p => p.id === rule.pluginId)
    if (!plugin || !plugin.enabled) continue

    // Invoke the plugin with the raw user message as the prompt body.
    const result = await invokePlugin<{ reply?: string; output?: string; message?: string }>(
      rule.pluginId,
      {
        method: 'POST',
        body: { message, prompt: message },
      },
    )

    if (!result.ok) {
      // Plugin call failed — fall through to LLM rather than returning an error.
      console.warn(`[plugin-autorouter] ${rule.pluginId} returned ${result.status}: ${result.error}`)
      return { matched: false }
    }

    const data = result.data
    const replyText =
      (typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>).reply as string
          ?? (data as Record<string, unknown>).output as string
          ?? (data as Record<string, unknown>).message as string
        : null)
      ?? JSON.stringify(data)

    return {
      matched: true,
      pluginId: rule.pluginId,
      intent: rule.intent,
      reply: replyText,
    }
  }

  return { matched: false }
}
