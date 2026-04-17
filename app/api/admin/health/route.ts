/**
 * Health / observability endpoint.
 *
 * Returns provider configuration status, per-provider success rates over
 * the last 24 hours, median latency per provider, and dead-model flags.
 *
 * This is the dashboard data feed — build a `/admin/health` UI that polls
 * this endpoint to see cascade behaviour in real time.
 *
 * Access control: in production, you MUST protect this endpoint. Options:
 *   1. Require an ADMIN_EMAIL env match against the authenticated user
 *   2. Add a shared secret header check
 *   3. Restrict by IP
 *
 * As shipped, the endpoint requires Supabase auth but does NOT check for
 * admin role — the deploying operator needs to add that check.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env/validate'
import { providerAvailable } from '@/lib/providers/registry'
import type { ProviderType } from '@/lib/ai-models'

export const dynamic = 'force-dynamic'

interface ProviderStats {
    provider: string
    configured: boolean
    keysConfigured: number
    last24h: {
        total: number
        success: number
        rateLimit: number
        error: number
        successRate: number
        medianLatencyMs: number | null
    }
}

export async function GET() {
    // Auth check — require a valid user. Add your own admin role check here.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const e = env()
    const providers: ProviderType[] = ['groq', 'cerebras', 'sambanova', 'openrouter', 'openrouter-free', 'gemini-grounded']

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    // Pull last 24h of events (cast as any — ai_events isn't in the generated types)
    const { data: rawEvents } = await (supabaseAdmin as unknown as {
        from: (t: string) => {
            select: (c: string) => {
                gte: (col: string, v: string) => Promise<{ data: Array<{ backend: string | null; event_type: string; latency_ms: number | null }> | null }>
            }
        }
    })
        .from('ai_events')
        .select('backend, event_type, latency_ms')
        .gte('created_at', since)

    const events = rawEvents ?? []

    const stats: ProviderStats[] = providers.map(p => {
        const keyCount = p === 'gemini-grounded'
            ? e.providers.gemini.length
            : p === 'groq' ? e.providers.groq.length
                : p === 'cerebras' ? e.providers.cerebras.length
                    : p === 'sambanova' ? e.providers.sambanova.length
                        : e.providers.openrouter.length

        // Filter events that mention this provider (match by backend label containing provider name)
        const providerEvents = events.filter(ev =>
            ev.backend?.toLowerCase().includes(p.replace('-grounded', '').replace('-free', ''))
        )

        const success = providerEvents.filter(ev => ev.event_type === 'message').length
        const rateLimit = providerEvents.filter(ev => ev.event_type === 'rate_limit').length
        const error = providerEvents.filter(ev => ev.event_type === 'error').length
        const total = providerEvents.length

        const latencies = providerEvents
            .filter(ev => typeof ev.latency_ms === 'number' && ev.latency_ms > 0)
            .map(ev => ev.latency_ms as number)
            .sort((a, b) => a - b)

        const median = latencies.length
            ? latencies[Math.floor(latencies.length / 2)]
            : null

        return {
            provider: p,
            configured: providerAvailable(p) || (p === 'gemini-grounded' && keyCount > 0),
            keysConfigured: keyCount,
            last24h: {
                total,
                success,
                rateLimit,
                error,
                successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
                medianLatencyMs: median,
            },
        }
    })

    // Dead-model detection: backends with 100% error rate over the last 24h
    const backendStats = new Map<string, { success: number; error: number; rateLimit: number }>()
    for (const ev of events) {
        if (!ev.backend) continue
        const cur = backendStats.get(ev.backend) ?? { success: 0, error: 0, rateLimit: 0 }
        if (ev.event_type === 'message') cur.success++
        else if (ev.event_type === 'error') cur.error++
        else if (ev.event_type === 'rate_limit') cur.rateLimit++
        backendStats.set(ev.backend, cur)
    }

    const deadModels: string[] = []
    for (const [backend, s] of backendStats) {
        if (s.success === 0 && s.error > 3) deadModels.push(backend)
    }

    return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        providers: stats,
        deadModels,
        summary: {
            providersConfigured: stats.filter(s => s.configured).length,
            providersTotal: stats.length,
            totalEvents24h: events.length,
            totalSuccess24h: events.filter(e => e.event_type === 'message').length,
        },
    })
}
