/**
 * Per-model cost accounting.
 *
 * Most of SarmaLink-AI runs on free tiers, but the moment a deployment adds a
 * premium key (Opus 4.7, GPT-5.5, Gemini 3.5 Pro) it is spending real money,
 * and an operator needs to see where. This module holds a published price
 * table (USD per million tokens), a pure function to cost a single turn from
 * its token counts, and an aggregator that rolls the `ai_events` log up into a
 * per-model cost breakdown for the admin dashboard.
 *
 * Prices are list prices as of May 2026 and are deliberately data, not code,
 * so an operator can correct them for negotiated rates without touching logic.
 * A model not in the table is treated as free (0.00), which is correct for the
 * free-tier engines that make up most of the failover chains.
 *
 * Covered by `__tests__/cost.test.ts`.
 */

export interface ModelPrice {
    /** USD per million input (prompt) tokens. */
    inputPerMillion: number
    /** USD per million output (completion) tokens. */
    outputPerMillion: number
    /** USD per million cached input tokens (cache reads). Defaults to a tenth of input. */
    cachedInputPerMillion?: number
}

/**
 * List prices keyed by the model string used in the failover chains. Free-tier
 * engines are intentionally absent and cost 0.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
    // Anthropic Opus 4.7 — premium frontier
    'claude-opus-4-7': { inputPerMillion: 15, outputPerMillion: 75, cachedInputPerMillion: 1.5 },
    // OpenAI GPT-5.5 via GitHub Models
    'gpt-5.5': { inputPerMillion: 5, outputPerMillion: 15, cachedInputPerMillion: 0.5 },
    // Google Gemini 3.5 Pro
    'gemini-3.5-pro': { inputPerMillion: 2.5, outputPerMillion: 10, cachedInputPerMillion: 0.25 },
    // Mistral Codestral — modest paid tier
    'codestral-latest': { inputPerMillion: 0.3, outputPerMillion: 0.9 },
}

export interface TurnUsage {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
}

/**
 * Cost a single turn in USD. Cached tokens are billed at the cached rate and
 * subtracted from the input total so they are never double-counted. Pure.
 */
export function costTurnUsd(model: string, usage: TurnUsage): number {
    const price = MODEL_PRICES[model]
    if (!price) return 0

    const prompt = Math.max(0, usage.promptTokens ?? 0)
    const completion = Math.max(0, usage.completionTokens ?? 0)
    const cached = Math.min(Math.max(0, usage.cachedTokens ?? 0), prompt)
    const freshInput = prompt - cached
    const cachedRate = price.cachedInputPerMillion ?? price.inputPerMillion / 10

    const cost =
        (freshInput / 1_000_000) * price.inputPerMillion +
        (cached / 1_000_000) * cachedRate +
        (completion / 1_000_000) * price.outputPerMillion

    // Round to 6 decimal places (micro-dollar precision).
    return Math.round(cost * 1_000_000) / 1_000_000
}

/** Does any model in the table carry a non-zero price? Used to flag paid usage. */
export function isPaidModel(model: string): boolean {
    const p = MODEL_PRICES[model]
    return !!p && (p.inputPerMillion > 0 || p.outputPerMillion > 0)
}

export interface CostEvent {
    backend?: string | null
    model_id?: string | null
    tokens_out?: number | null
    meta?: Record<string, unknown> | null
}

export interface ModelCostRow {
    /** The user-facing mode id (smart, coder, …). */
    modelId: string
    /** The winning backend engine model string, if resolvable. */
    backend: string
    turns: number
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedUsd: number
}

export interface CostSummary {
    totalEstimatedUsd: number
    paidTurns: number
    freeTurns: number
    byModel: ModelCostRow[]
}

/**
 * Map a human backend label back to a priced model key. Labels in the failover
 * chains read like "Anthropic Opus 4.7" or "GitHub GPT-5.5 (code)"; this
 * matches them to the price-table key by substring. Returns the matched key
 * or the original label when nothing matches (so it costs 0). Pure.
 */
export function backendToModelKey(label: string): string {
    const l = (label || '').toLowerCase()
    if (l.includes('opus 4.7')) return 'claude-opus-4-7'
    if (l.includes('gpt-5.5')) return 'gpt-5.5'
    if (l.includes('gemini 3.5')) return 'gemini-3.5-pro'
    if (l.includes('codestral')) return 'codestral-latest'
    return label
}

/**
 * Aggregate a window of `ai_events` rows into a per-model cost breakdown.
 * Only successful `message`/`proxy_request` events with token counts
 * contribute. Token-in counts default to four times tokens-out when the event
 * did not record an input count, matching the runner's char/4 heuristic. Pure.
 */
export function summariseCost(events: CostEvent[]): CostSummary {
    const rows = new Map<string, ModelCostRow>()
    let paidTurns = 0
    let freeTurns = 0

    for (const ev of events) {
        if (!ev.backend) continue
        const modelKey = backendToModelKey(ev.backend)
        const meta = (ev.meta ?? {}) as Record<string, unknown>
        const cachedTokens = typeof meta.cached_tokens === 'number' ? meta.cached_tokens : 0
        const completion = typeof ev.tokens_out === 'number' ? ev.tokens_out : 0
        const promptTokens = typeof meta.prompt_tokens === 'number'
            ? (meta.prompt_tokens as number)
            : completion * 4

        const usd = costTurnUsd(modelKey, { promptTokens, completionTokens: completion, cachedTokens })
        if (usd > 0) paidTurns++
        else freeTurns++

        const rowKey = `${ev.model_id ?? 'unknown'}::${ev.backend}`
        const row = rows.get(rowKey) ?? {
            modelId: ev.model_id ?? 'unknown',
            backend: ev.backend,
            turns: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            estimatedUsd: 0,
        }
        row.turns += 1
        row.promptTokens += promptTokens
        row.completionTokens += completion
        row.cachedTokens += cachedTokens
        row.estimatedUsd = Math.round((row.estimatedUsd + usd) * 1_000_000) / 1_000_000
        rows.set(rowKey, row)
    }

    const byModel = Array.from(rows.values()).sort((a, b) => b.estimatedUsd - a.estimatedUsd)
    const totalEstimatedUsd = Math.round(byModel.reduce((s, r) => s + r.estimatedUsd, 0) * 1_000_000) / 1_000_000

    return { totalEstimatedUsd, paidTurns, freeTurns, byModel }
}
