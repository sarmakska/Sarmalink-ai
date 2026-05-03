/**
 * /docs — Plugin registry reference.
 *
 * Lists every plugin in the registry with its id, purpose, accepted intents,
 * endpoint env var, and whether it is currently enabled (env var present).
 * Rendered server-side so the enabled status reflects the live process.env.
 */

import { PLUGIN_REGISTRY, type Plugin, type PluginIntent } from '@/lib/plugins/index'

// Map each plugin's endpoint env var so we can surface it in the UI.
const ENDPOINT_ENV: Record<string, string> = {
  'voice-agent-starter': 'PLUGIN_VOICE_AGENT_URL',
  'agent-orchestrator': 'PLUGIN_AGENT_ORCHESTRATOR_URL',
  'ai-eval-runner': 'PLUGIN_EVAL_RUNNER_URL',
  'local-llm-router': 'PLUGIN_LLM_ROUTER_URL',
  'mcp-server-toolkit': 'PLUGIN_MCP_SERVER_URL',
  'rag-over-pdf': 'PLUGIN_RAG_PDF_URL',
  'receipt-scanner': 'PLUGIN_RECEIPT_SCANNER_URL',
  'webhook-to-email': 'PLUGIN_WEBHOOK_EMAIL_URL',
  'k8s-ops-toolkit': '(no endpoint — tooling only)',
  'terraform-stack': '(no endpoint — tooling only)',
}

function intentBadge(intent: PluginIntent): string {
  const colours: Record<PluginIntent, string> = {
    voice: '#7c3aed',
    workflow: '#0369a1',
    eval: '#b45309',
    router: '#0f766e',
    mcp: '#6d28d9',
    rag: '#0891b2',
    ocr: '#be185d',
    webhook: '#4338ca',
    k8s: '#047857',
    iac: '#b45309',
    browse: '#1d4ed8',
  }
  return colours[intent] ?? '#555'
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const envVar = ENDPOINT_ENV[plugin.id] ?? '—'
  const isEnabled = plugin.enabled
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px 24px',
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>{plugin.id}</span>
            {plugin.intents.map(intent => (
              <span
                key={intent}
                style={{
                  background: intentBadge(intent),
                  color: '#fff',
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                {intent}
              </span>
            ))}
          </div>
          <p style={{ margin: '6px 0 10px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
            {plugin.purpose}
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: '#888' }}>
            <span>
              <strong style={{ color: '#333' }}>Repo:</strong>{' '}
              <a href={plugin.repo} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                {plugin.repo.replace('https://github.com/', '')}
              </a>
            </span>
            <span>
              <strong style={{ color: '#333' }}>Endpoint env:</strong>{' '}
              <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>{envVar}</code>
            </span>
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: isEnabled ? '#dcfce7' : '#f3f4f6',
            color: isEnabled ? '#166534' : '#6b7280',
            border: isEnabled ? '1px solid #86efac' : '1px solid #e5e7eb',
          }}
        >
          {isEnabled ? 'enabled' : 'disabled'}
        </span>
      </div>
    </div>
  )
}

export default function DocsPage() {
  const autoRouteEnabled = process.env.ENABLE_PLUGIN_AUTOROUTE === 'true'
  const enabledCount = PLUGIN_REGISTRY.filter(p => p.enabled).length

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#111' }}>Plugin Registry</h1>
          <a
            href="https://sarmalinux.com/products/sarmalink-ai"
            style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
          >
            sarmalinux.com
          </a>
        </div>
        <p style={{ margin: 0, color: '#555', fontSize: 14, lineHeight: 1.6 }}>
          SarmaLink-AI routes specialised tasks to sibling open-source projects via the plugin system.
          {' '}{enabledCount} of {PLUGIN_REGISTRY.length} plugins are currently enabled.
          Set the endpoint env var for any plugin to enable it.
        </p>
      </div>

      {/* Auto-route status */}
      <div
        style={{
          background: autoRouteEnabled ? '#eff6ff' : '#f9fafb',
          border: `1px solid ${autoRouteEnabled ? '#bfdbfe' : '#e5e7eb'}`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 32,
          fontSize: 13,
          color: '#374151',
        }}
      >
        <strong>Intent auto-routing:</strong>{' '}
        {autoRouteEnabled
          ? 'active — incoming chat messages are scanned for intent keywords before reaching the LLM. Set ENABLE_PLUGIN_AUTOROUTE=false to disable.'
          : 'disabled — set ENABLE_PLUGIN_AUTOROUTE=true to activate keyword-based plugin dispatch.'}
      </div>

      {/* Plugin list */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 16, marginTop: 0 }}>
        Plugins ({PLUGIN_REGISTRY.length})
      </h2>
      {PLUGIN_REGISTRY.map(plugin => (
        <PluginCard key={plugin.id} plugin={plugin} />
      ))}

      {/* Routes reference */}
      <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 16, marginTop: 0 }}>
          API Routes
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', color: '#374151', fontWeight: 600 }}>Route</th>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', color: '#374151', fontWeight: 600 }}>Method</th>
              <th style={{ textAlign: 'left', padding: '8px 0', color: '#374151', fontWeight: 600 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              { route: '/api/v1/plugins', method: 'GET', desc: 'List all registered plugins with enabled status' },
              { route: '/api/v1/plugins/invoke', method: 'POST', desc: 'Proxy a request to a plugin by id' },
              { route: '/api/v1/manus', method: 'POST', desc: 'Create a Manus autonomous task' },
              { route: '/api/v1/manus', method: 'GET?id=', desc: 'Poll Manus task status from Manus API' },
              { route: '/api/v1/manus/webhook', method: 'POST', desc: 'Receive Manus completion webhook; persists to manus_tasks table' },
              { route: '/api/v1/manus/tasks/:id', method: 'GET', desc: 'Retrieve persisted task row by id' },
              { route: '/api/v1/chat/completions', method: 'POST', desc: 'OpenAI-compatible proxy (ENABLE_OPENAI_PROXY=true required)' },
              { route: '/api/ai-chat', method: 'POST', desc: 'Primary chat endpoint with failover + plugin auto-routing' },
            ].map(row => (
              <tr key={row.route + row.method} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px 8px 0' }}>
                  <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 3, fontSize: 12 }}>{row.route}</code>
                </td>
                <td style={{ padding: '8px 12px 8px 0', color: '#2563eb', fontWeight: 500 }}>{row.method}</td>
                <td style={{ padding: '8px 0', color: '#555' }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: '#9ca3af' }}>
        Source:{' '}
        <a href="https://github.com/sarmakska/Sarmalink-ai" style={{ color: '#9ca3af' }}>
          github.com/sarmakska/Sarmalink-ai
        </a>
      </p>
    </div>
  )
}
