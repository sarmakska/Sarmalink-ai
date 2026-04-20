/**
 * Health / observability endpoint.
 *
 * Returns provider configuration status, per-provider success rates over
 * the last 24 hours, median latency per provider, and dead-model flags.
 *
 * This is the dashboard data feed — build a `/admin/health` UI that polls
 * this endpoint to see failover behaviour in real time.
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
import { MODELS } from '@/lib/ai-models'
import type { ProviderType, ModelId } from '@/lib/ai-models'

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

interface StepWinner {
    backendLabel: string
    wins: number
    percentage: number
}

interface FallbackUsage {
    modelId: string
    totalSuccesses: number
    stepWinners: StepWinner[]
    failureRate: number
    stepDepthHistogram: { step1: number; step2to3: number; step4plus: number }
}

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin check — restrict to specific user IDs or emails
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (adminIds.length > 0 || adminEmails.length > 0) {
        const isAdmin = adminIds.includes(user.id) || adminEmails.includes(user.email || '')
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
        }
    }

    const e = env()
    const providers: ProviderType[] = ['groq', 'cerebras', 'sambanova', 'openrouter', 'openrouter-free', 'gemini-grounded']

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    // Pull last 24h of events — include model_id so we can build per-mode
    // fallback usage stats below.
    const { data: rawEvents } = await supabaseAdmin
        .from('ai_events')
        .select('backend, event_type, latency_ms, model_id')
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

    /**
     * fallbackUsage — per user-facing mode (smart/coder/reasoner/…) this
     * summarises how deep the failover chain had to go in the last 24h.
     *
     * For each mode we count successful responses (event_type='message'),
     * group by the winning backend label, and map that label back to its
     * position in MODELS[mode].failover so we can bucket winners into
     * step1 / step2to3 / step4plus. A backend that isn't in the configured
     * failover list falls into step4plus (it was likely introduced by the
     * Auto router at runtime, or the config was edited after the event was
     * logged).
     *
     * How to read it: if step1 stays close to totalSuccesses, your primary
     * provider is healthy. If step2to3 or step4plus grows, primaries are
     * being skipped (rate-limited, erroring, or dead) and the failover is
     * quietly saving your users. Rising failureRate means even the full
     * chain is exhausting — time to add more providers or keys.
     */
    const modeIds = Object.keys(MODELS) as ModelId[]
    const fallbackUsage: FallbackUsage[] = modeIds.map(modeId => {
        const modeEvents = events.filter(ev => ev.model_id === modeId)
        const successes = modeEvents.filter(ev => ev.event_type === 'message')
        const failures = modeEvents.filter(ev => ev.event_type === 'error').length
        const totalSuccesses = successes.length

        const winCounts = new Map<string, number>()
        for (const ev of successes) {
            if (!ev.backend) continue
            winCounts.set(ev.backend, (winCounts.get(ev.backend) ?? 0) + 1)
        }

        const stepWinners: StepWinner[] = Array.from(winCounts.entries())
            .map(([backendLabel, wins]) => ({
                backendLabel,
                wins,
                percentage: totalSuccesses > 0
                    ? Math.round((wins / totalSuccesses) * 1000) / 10
                    : 0,
            }))
            .sort((a, b) => b.wins - a.wins)

        const failover = MODELS[modeId].failover
        const indexOf = (label: string) =>
            failover.findIndex(step => step.label === label)

        const histogram = { step1: 0, step2to3: 0, step4plus: 0 }
        for (const [label, wins] of winCounts) {
            const idx = indexOf(label)
            if (idx === 0) histogram.step1 += wins
            else if (idx === 1 || idx === 2) histogram.step2to3 += wins
            else histogram.step4plus += wins
        }

        // Failure rate — error events vs successful messages for this mode.
        // A denominator of 0 means no traffic at all; report 0 rather than NaN.
        const denominator = totalSuccesses + failures
        const failureRate = denominator > 0
            ? Math.round((failures / denominator) * 1000) / 10
            : 0

        return {
            modelId: modeId,
            totalSuccesses,
            stepWinners,
            failureRate,
            stepDepthHistogram: histogram,
        }
    })

    return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        providers: stats,
        deadModels,
        fallbackUsage,
        summary: {
            providersConfigured: stats.filter(s => s.configured).length,
            providersTotal: stats.length,
            totalEvents24h: events.length,
            totalSuccess24h: events.filter(e => e.event_type === 'message').length,
        },
    })
}
