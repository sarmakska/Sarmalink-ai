/**
 * Cross-provider prompt caching.
 *
 * The system prompt SarmaLink-AI sends is large and stable: it is identical
 * for every turn within a mode, only the trailing user content changes. Every
 * frontier provider now bills a cached prefix at a fraction of the input rate,
 * but each does it differently. This module normalises those differences so
 * the failover runner can opt in with a single call, regardless of which
 * engine wins the step.
 *
 * Provider behaviour:
 *   - Anthropic (Opus 4.7): explicit `cache_control: { type: "ephemeral" }`
 *     breakpoints on the system message. We mark the system content so the
 *     long prefix is cached and re-read at ~10 per cent of the input price.
 *   - OpenAI-compatible (GPT-5.5 via GitHub Models, Groq, OpenRouter): implicit
 *     prefix caching keyed on a stable `prompt_cache_key`. Identical prefixes
 *     within the key hit the cache automatically.
 *   - Gemini (3.5 Pro): implicit caching is automatic on the grounded path; we
 *     surface a stable cache key so callers can correlate hits in telemetry.
 *
 * The functions here are pure. They take a request body and return a new body
 * with the right caching directives applied; they never mutate the input. They
 * are covered by `__tests__/cache.test.ts`.
 */

import type { ProviderType } from '@/lib/ai-models'

/** Providers that support an explicit Anthropic-style cache breakpoint. */
const EXPLICIT_BREAKPOINT_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
    'anthropic',
])

/** Providers that honour an implicit prefix cache keyed by `prompt_cache_key`. */
const IMPLICIT_PREFIX_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
    'anthropic',
    'github-models',
    'openrouter',
    'openrouter-free',
    'groq',
    'cerebras',
    'mistral',
])

export interface CacheableMessage {
    role: string
    content: unknown
}

export interface PromptCacheConfig {
    /** Master switch. When false, applyPromptCache returns the body unchanged. */
    enabled: boolean
    /**
     * Stable identifier for the cacheable prefix. Two requests sharing this key
     * and the same prefix will hit the cache. Defaults to the mode id.
     */
    cacheKey: string
    /**
     * Minimum number of characters in the system content before caching is
     * worthwhile. Short prompts gain nothing from caching and can incur a
     * write penalty, so we skip them.
     */
    minPrefixChars: number
}

export const DEFAULT_CACHE_CONFIG: PromptCacheConfig = {
    enabled: process.env.ENABLE_PROMPT_CACHE !== 'false',
    cacheKey: 'sarmalink-default',
    minPrefixChars: 1024,
}

/** Read the master switch from the environment with the same default. */
export function promptCacheEnabled(): boolean {
    return process.env.ENABLE_PROMPT_CACHE !== 'false'
}

function systemCharCount(messages: CacheableMessage[]): number {
    let n = 0
    for (const m of messages) {
        if (m.role !== 'system') continue
        if (typeof m.content === 'string') n += m.content.length
        else if (Array.isArray(m.content)) {
            for (const part of m.content) {
                if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
                    n += (part as { text: string }).text.length
                }
            }
        }
    }
    return n
}

/**
 * Convert a string system message into the structured-content form Anthropic
 * needs for a cache breakpoint, tagging the final block as ephemeral.
 */
function withAnthropicBreakpoint(messages: CacheableMessage[]): CacheableMessage[] {
    return messages.map(m => {
        if (m.role !== 'system') return m
        const text = typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
                ? m.content.map(p => (p as { text?: string }).text ?? '').join('')
                : String(m.content ?? '')
        return {
            role: 'system',
            content: [
                { type: 'text', text, cache_control: { type: 'ephemeral' } },
            ],
        }
    })
}

export interface CachedRequest {
    /** Messages with any explicit breakpoints applied. */
    messages: CacheableMessage[]
    /** Extra top-level body fields to merge (e.g. prompt_cache_key). */
    bodyExtras: Record<string, unknown>
    /** Whether any caching directive was actually applied. */
    applied: boolean
}

/**
 * Produce the caching directives for a provider. Returns the (possibly
 * rewritten) messages plus body fields to merge into the request. Pure.
 */
export function buildCachedRequest(
    provider: ProviderType,
    messages: CacheableMessage[],
    config: PromptCacheConfig = DEFAULT_CACHE_CONFIG,
): CachedRequest {
    const base: CachedRequest = { messages, bodyExtras: {}, applied: false }
    if (!config.enabled) return base
    if (systemCharCount(messages) < config.minPrefixChars) return base

    let outMessages = messages
    const bodyExtras: Record<string, unknown> = {}
    let applied = false

    if (EXPLICIT_BREAKPOINT_PROVIDERS.has(provider)) {
        outMessages = withAnthropicBreakpoint(messages)
        applied = true
    }
    if (IMPLICIT_PREFIX_PROVIDERS.has(provider)) {
        bodyExtras.prompt_cache_key = config.cacheKey
        applied = true
    }

    return { messages: outMessages, bodyExtras, applied }
}

/**
 * Convenience wrapper: merge the cache directives straight into an existing
 * request-body object. Returns a new object; never mutates the input.
 */
export function applyPromptCache(
    provider: ProviderType,
    body: Record<string, unknown> & { messages: CacheableMessage[] },
    config: PromptCacheConfig = DEFAULT_CACHE_CONFIG,
): Record<string, unknown> & { messages: CacheableMessage[] } {
    const cached = buildCachedRequest(provider, body.messages, config)
    return { ...body, ...cached.bodyExtras, messages: cached.messages }
}
