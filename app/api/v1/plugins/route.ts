import { NextResponse } from 'next/server'
import { PLUGIN_REGISTRY, pluginsByIntent, type PluginIntent } from '@/lib/plugins'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const intent = searchParams.get('intent') as PluginIntent | null

  const list = intent ? pluginsByIntent(intent) : PLUGIN_REGISTRY
  return NextResponse.json({
    count: list.length,
    plugins: list.map(p => ({
      id: p.id,
      repo: p.repo,
      purpose: p.purpose,
      intents: p.intents,
      enabled: p.enabled,
    })),
  })
}
