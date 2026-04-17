/**
 * Provider Registry — single source of truth for AI provider configuration.
 *
 * Every AI provider is defined here: its OpenAI-compatible endpoint, its
 * API key pool (loaded from environment variables), and its health state.
 *
 * The cascade runner (lib/providers/cascade.ts) dispatches on `ProviderType`
 * and uses the functions exported here to look up the endpoint and rotate
 * through keys.
 *
 * Adding a new provider: edit `ProviderType` in `lib/ai-models.ts`, then
 * add the `case` branches to `providerEndpoint()` and `providerKeys()` below.
 */

import { env } from '@/lib/env/validate'
import type { ProviderType } from '@/lib/ai-models'

/**
 * Return the chat completions endpoint URL for a provider.
 * All supported providers expose an OpenAI-compatible endpoint.
 *
 * Gemini is handled separately (see lib/providers/gemini.ts) because it
 * uses Google's proprietary generative-language API for grounded search.
 */
export function providerEndpoint(provider: ProviderType): string | null {
    switch (provider) {
        case 'groq': return 'https://api.groq.com/openai/v1/chat/completions'
        case 'cerebras': return 'https://api.cerebras.ai/v1/chat/completions'
        case 'sambanova': return 'https://api.sambanova.ai/v1/chat/completions'
        case 'openrouter':
        case 'openrouter-free': return 'https://openrouter.ai/api/v1/chat/completions'
        default: return null
    }
}

/**
 * Return the list of API keys configured for a provider.
 * The cascade rotates through this list per request so no single key is
 * always hit first.
 */
export function providerKeys(provider: ProviderType): string[] {
    const e = env()
    switch (provider) {
        case 'groq': return e.providers.groq
        case 'cerebras': return e.providers.cerebras
        case 'sambanova': return e.providers.sambanova
        case 'openrouter':
        case 'openrouter-free': return e.providers.openrouter
        default: return []
    }
}

/**
 * Does a provider have at least one configured key?
 * Used by health checks and cascade pruning.
 */
export function providerAvailable(provider: ProviderType): boolean {
    return providerKeys(provider).length > 0
}

/**
 * Build request headers for a provider. OpenRouter requires extra
 * identification headers; other providers just need the bearer token.
 */
export function providerHeaders(provider: ProviderType, key: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
    }
    if (provider === 'openrouter' || provider === 'openrouter-free') {
        headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://github.com/sarmakska/cascade-ai'
        headers['X-Title'] = process.env.NEXT_PUBLIC_APP_NAME || 'Cascade AI'
    }
    return headers
}
