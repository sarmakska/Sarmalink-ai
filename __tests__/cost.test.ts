import { describe, it, expect } from 'vitest'
import { costTurnUsd, isPaidModel, backendToModelKey, summariseCost, type CostEvent } from '@/lib/providers/cost'

describe('costTurnUsd', () => {
    it('costs an Opus 4.7 turn at list price', () => {
        // 1M input @ $15 + 1M output @ $75 = $90
        expect(costTurnUsd('claude-opus-4-7', { promptTokens: 1_000_000, completionTokens: 1_000_000 })).toBe(90)
    })

    it('bills cached tokens at the cached rate and never double-counts', () => {
        // 1M prompt of which 1M cached @ $1.5 + 0 output = $1.5 (not $15)
        expect(costTurnUsd('claude-opus-4-7', { promptTokens: 1_000_000, cachedTokens: 1_000_000 })).toBe(1.5)
    })

    it('treats a model absent from the table as free', () => {
        expect(costTurnUsd('openai/gpt-oss-120b', { promptTokens: 1_000_000, completionTokens: 1_000_000 })).toBe(0)
    })

    it('clamps cached tokens to the prompt total', () => {
        // cached > prompt should not produce a negative fresh-input cost
        const usd = costTurnUsd('gpt-5.5', { promptTokens: 100, cachedTokens: 999, completionTokens: 0 })
        expect(usd).toBeGreaterThanOrEqual(0)
    })
})

describe('isPaidModel', () => {
    it('flags premium engines as paid and free engines as not', () => {
        expect(isPaidModel('claude-opus-4-7')).toBe(true)
        expect(isPaidModel('gpt-5.5')).toBe(true)
        expect(isPaidModel('llama-3.1-8b-instant')).toBe(false)
    })
})

describe('backendToModelKey', () => {
    it('maps human labels to priced keys', () => {
        expect(backendToModelKey('Anthropic Opus 4.7')).toBe('claude-opus-4-7')
        expect(backendToModelKey('GitHub GPT-5.5 (code)')).toBe('gpt-5.5')
        expect(backendToModelKey('Gemini 3.5 Pro + Google Search')).toBe('gemini-3.5-pro')
        expect(backendToModelKey('Groq GPT-OSS 120B')).toBe('Groq GPT-OSS 120B')
    })
})

describe('summariseCost', () => {
    it('aggregates a window into a per-model breakdown with paid/free split', () => {
        const events: CostEvent[] = [
            { backend: 'Anthropic Opus 4.7', model_id: 'smart', tokens_out: 1_000_000, meta: { prompt_tokens: 1_000_000 } },
            { backend: 'Groq GPT-OSS 120B', model_id: 'smart', tokens_out: 500, meta: {} },
            { backend: 'Groq GPT-OSS 120B', model_id: 'fast', tokens_out: 200, meta: {} },
        ]
        const summary = summariseCost(events)
        expect(summary.paidTurns).toBe(1)
        expect(summary.freeTurns).toBe(2)
        // Opus row: 1M in @ $15 + 1M out @ $75 = $90
        const opus = summary.byModel.find(r => r.backend === 'Anthropic Opus 4.7')
        expect(opus?.estimatedUsd).toBe(90)
        expect(summary.totalEstimatedUsd).toBe(90)
        // sorted by cost descending — Opus first
        expect(summary.byModel[0].backend).toBe('Anthropic Opus 4.7')
    })

    it('returns zeros for an all-free window', () => {
        const summary = summariseCost([
            { backend: 'Groq GPT-OSS 120B', model_id: 'smart', tokens_out: 100, meta: {} },
        ])
        expect(summary.totalEstimatedUsd).toBe(0)
        expect(summary.paidTurns).toBe(0)
    })
})
