/**
 * Cross-repo plugin system.
 *
 * SarmaLink-AI is the front door — a multi-provider LLM gateway with
 * automatic failover. The plugin system lets other Sarma open-source
 * projects register themselves so a single SarmaLink-AI deployment can
 * route specialised tasks to the right tool: voice loops to
 * voice-agent-starter, multi-agent workflows to agent-orchestrator,
 * evals to ai-eval-runner, and so on.
 *
 * Each plugin advertises:
 *   - id, repo URL, purpose
 *   - the kinds of intents it accepts
 *   - the endpoint(s) where its API lives (HTTP or MCP)
 *   - optional auth scheme
 *
 * The registry is intentionally static. Discovery and dynamic loading
 * are out of scope for v1; if you want a plugin loaded, add it here and
 * deploy. That keeps the security surface small.
 */

export type PluginIntent =
  | 'voice'
  | 'workflow'
  | 'eval'
  | 'router'
  | 'mcp'
  | 'rag'
  | 'ocr'
  | 'webhook'
  | 'k8s'
  | 'iac'
  | 'browse'

export interface PluginAuth {
  type: 'none' | 'bearer' | 'header'
  envVar?: string
  headerName?: string
}

export interface Plugin {
  id: string
  repo: string
  purpose: string
  intents: PluginIntent[]
  endpoint?: string
  auth?: PluginAuth
  enabled: boolean
}

export const PLUGIN_REGISTRY: Plugin[] = [
  {
    id: 'voice-agent-starter',
    repo: 'https://github.com/sarmakska/voice-agent-starter',
    purpose: 'Real-time voice agent loop. WebRTC + STT/LLM/TTS pipeline.',
    intents: ['voice'],
    endpoint: process.env.PLUGIN_VOICE_AGENT_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_VOICE_AGENT_TOKEN' },
    enabled: !!process.env.PLUGIN_VOICE_AGENT_URL,
  },
  {
    id: 'agent-orchestrator',
    repo: 'https://github.com/sarmakska/agent-orchestrator',
    purpose: 'Durable multi-agent workflows with deterministic replay.',
    intents: ['workflow', 'browse'],
    endpoint: process.env.PLUGIN_AGENT_ORCHESTRATOR_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_AGENT_ORCHESTRATOR_TOKEN' },
    enabled: !!process.env.PLUGIN_AGENT_ORCHESTRATOR_URL,
  },
  {
    id: 'ai-eval-runner',
    repo: 'https://github.com/sarmakska/ai-eval-runner',
    purpose: 'Run datasets through models, score, store traces, regression detect.',
    intents: ['eval'],
    endpoint: process.env.PLUGIN_EVAL_RUNNER_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_EVAL_RUNNER_TOKEN' },
    enabled: !!process.env.PLUGIN_EVAL_RUNNER_URL,
  },
  {
    id: 'local-llm-router',
    repo: 'https://github.com/sarmakska/local-llm-router',
    purpose: 'OpenAI-compatible proxy that routes to local Ollama or cloud LLMs by policy.',
    intents: ['router'],
    endpoint: process.env.PLUGIN_LLM_ROUTER_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_LLM_ROUTER_TOKEN' },
    enabled: !!process.env.PLUGIN_LLM_ROUTER_URL,
  },
  {
    id: 'mcp-server-toolkit',
    repo: 'https://github.com/sarmakska/mcp-server-toolkit',
    purpose: 'Production-ready Model Context Protocol server starter.',
    intents: ['mcp'],
    endpoint: process.env.PLUGIN_MCP_SERVER_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_MCP_SERVER_TOKEN' },
    enabled: !!process.env.PLUGIN_MCP_SERVER_URL,
  },
  {
    id: 'rag-over-pdf',
    repo: 'https://github.com/sarmakska/rag-over-pdf',
    purpose: 'PDF ingestion + retrieval-augmented Q&A.',
    intents: ['rag'],
    endpoint: process.env.PLUGIN_RAG_PDF_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_RAG_PDF_TOKEN' },
    enabled: !!process.env.PLUGIN_RAG_PDF_URL,
  },
  {
    id: 'receipt-scanner',
    repo: 'https://github.com/sarmakska/receipt-scanner',
    purpose: 'OCR receipts to structured JSON via vision models.',
    intents: ['ocr'],
    endpoint: process.env.PLUGIN_RECEIPT_SCANNER_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_RECEIPT_SCANNER_TOKEN' },
    enabled: !!process.env.PLUGIN_RECEIPT_SCANNER_URL,
  },
  {
    id: 'webhook-to-email',
    repo: 'https://github.com/sarmakska/webhook-to-email',
    purpose: 'POST anything, get an email.',
    intents: ['webhook'],
    endpoint: process.env.PLUGIN_WEBHOOK_EMAIL_URL,
    auth: { type: 'bearer', envVar: 'PLUGIN_WEBHOOK_EMAIL_TOKEN' },
    enabled: !!process.env.PLUGIN_WEBHOOK_EMAIL_URL,
  },
  {
    id: 'k8s-ops-toolkit',
    repo: 'https://github.com/sarmakska/k8s-ops-toolkit',
    purpose: 'Helm bundles + observability stack for Next.js on Kubernetes.',
    intents: ['k8s'],
    enabled: false,
  },
  {
    id: 'terraform-stack',
    repo: 'https://github.com/sarmakska/terraform-stack',
    purpose: 'Vercel + Supabase + Cloudflare + DigitalOcean Terraform modules.',
    intents: ['iac'],
    enabled: false,
  },
]

export function pluginsByIntent(intent: PluginIntent): Plugin[] {
  return PLUGIN_REGISTRY.filter(p => p.enabled && p.intents.includes(intent))
}

export function findPlugin(id: string): Plugin | undefined {
  return PLUGIN_REGISTRY.find(p => p.id === id)
}

export interface PluginInvokeArgs {
  path?: string
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
}

export interface PluginInvokeResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
  pluginId: string
}

export async function invokePlugin<T = unknown>(
  id: string,
  args: PluginInvokeArgs = {},
): Promise<PluginInvokeResult<T>> {
  const plugin = findPlugin(id)
  if (!plugin) return { ok: false, status: 404, error: 'plugin not registered', pluginId: id }
  if (!plugin.enabled || !plugin.endpoint) {
    return { ok: false, status: 503, error: 'plugin not enabled (set endpoint env var)', pluginId: id }
  }

  const url = new URL(args.path || '/', plugin.endpoint).toString()
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(args.headers || {}) }

  if (plugin.auth?.type === 'bearer' && plugin.auth.envVar) {
    const token = process.env[plugin.auth.envVar]
    if (token) headers['authorization'] = `Bearer ${token}`
  } else if (plugin.auth?.type === 'header' && plugin.auth.envVar && plugin.auth.headerName) {
    const token = process.env[plugin.auth.envVar]
    if (token) headers[plugin.auth.headerName] = token
  }

  try {
    const r = await fetch(url, {
      method: args.method || (args.body ? 'POST' : 'GET'),
      headers,
      body: args.body ? JSON.stringify(args.body) : undefined,
    })
    const text = await r.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = text }
    return { ok: r.ok, status: r.status, data: data as T, pluginId: id }
  } catch (e) {
    return { ok: false, status: 502, error: (e as Error).message, pluginId: id }
  }
}
