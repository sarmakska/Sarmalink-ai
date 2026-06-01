/**
 * Quota tracking.
 *
 * Logs one row per chat completion call into `ai_chat_usage`. The chat
 * route should call `logUsage` after every completion (success or failure)
 * with the token counts and model tier used.
 *
 * The GET /api/v1/quota endpoint reads the `ai_usage_today` view.
 */

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env/validate'

export const UsageRowSchema = z.object({
    userId: z.string().nullable(),
    tier: z.string(),
    model: z.string().optional(),
    promptTokens: z.number().int().nonnegative().default(0),
    completionTokens: z.number().int().nonnegative().default(0),
    totalTokens: z.number().int().nonnegative().default(0),
    backend: z.string().optional(),
    status: z.string().default('success'),
})
export type UsageRow = z.infer<typeof UsageRowSchema>

export const QuotaTierSummarySchema = z.object({
    tier: z.string(),
    calls: z.number(),
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
})

export const QuotaResponseSchema = z.object({
    user: z.array(QuotaTierSummarySchema),
    company: z.array(QuotaTierSummarySchema),
})
export type QuotaResponse = z.infer<typeof QuotaResponseSchema>

function client() {
    const cfg = env().supabase
    return createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } })
}

export async function logUsage(row: UsageRow): Promise<void> {
    const parsed = UsageRowSchema.parse(row)
    try {
        const sb = client()
        await sb.from('ai_chat_usage').insert({
            user_id: parsed.userId,
            tier: parsed.tier,
            model: parsed.model,
            prompt_tokens: parsed.promptTokens,
            completion_tokens: parsed.completionTokens,
            total_tokens: parsed.totalTokens,
            backend: parsed.backend,
            status: parsed.status,
        })
    } catch {
        // Logging never blocks completions.
    }
}

export async function readQuota(userId: string | null): Promise<QuotaResponse> {
    const sb = client()
    const [{ data: companyData }, { data: userData }] = await Promise.all([
        sb.from('ai_usage_today').select('tier, calls, prompt_tokens, completion_tokens, total_tokens'),
        userId
            ? sb.from('ai_usage_today').select('tier, calls, prompt_tokens, completion_tokens, total_tokens').eq('user_id', userId)
            : Promise.resolve({ data: [] as any[] }),
    ])

    const companyByTier = new Map<string, { calls: number; prompt: number; completion: number; total: number }>()
    for (const r of companyData ?? []) {
        const k = String(r.tier)
        const prev = companyByTier.get(k) ?? { calls: 0, prompt: 0, completion: 0, total: 0 }
        prev.calls += Number(r.calls ?? 0)
        prev.prompt += Number(r.prompt_tokens ?? 0)
        prev.completion += Number(r.completion_tokens ?? 0)
        prev.total += Number(r.total_tokens ?? 0)
        companyByTier.set(k, prev)
    }

    const toSummary = (rows: any[] | null | undefined) =>
        (rows ?? []).map((r) => ({
            tier: String(r.tier),
            calls: Number(r.calls ?? 0),
            promptTokens: Number(r.prompt_tokens ?? 0),
            completionTokens: Number(r.completion_tokens ?? 0),
            totalTokens: Number(r.total_tokens ?? 0),
        }))

    return QuotaResponseSchema.parse({
        user: toSummary(userData ?? []),
        company: Array.from(companyByTier.entries()).map(([tier, v]) => ({
            tier,
            calls: v.calls,
            promptTokens: v.prompt,
            completionTokens: v.completion,
            totalTokens: v.total,
        })),
    })
}
