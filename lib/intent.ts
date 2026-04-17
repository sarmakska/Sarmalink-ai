/**
 * Intent detection — what is the user asking for?
 *
 * Separate from the mode-level auto-router in `lib/ai-models.ts`. This file
 * detects "side intents" that can happen inside any mode: does the user
 * want an image generated? Is this a web-search-worthy question? Etc.
 *
 * All detection is regex-based: instant, free, deterministic, auditable.
 * If a check grows complex enough to need an LLM classifier, first prove
 * the regex approach is measurably insufficient — usually it isn't.
 */

/**
 * Does this look like an image-generation request?
 * Matches both explicit ("generate an image of...") and implicit
 * ("draw me a sunset") phrasing.
 */
export function detectImageIntent(msg: string): boolean {
    const lower = msg.toLowerCase().trim()
    if (lower.length < 3) return false
    return /\b(generate|create|make|draw|render|paint|produce|design)\s+(?:an?\s+|the\s+|some\s+)?(image|picture|photo|artwork|illustration|logo|moodboard|render|drawing|painting)\b/i.test(lower)
        || /\b(image|picture|photo) of\b/i.test(lower)
        || /^(draw|paint|render|generate|create|make)\s+(me\s+)?(a|an|the)?\s+\w+/i.test(lower)
        || /\b(moodboard|tech ?flat|flat sketch|fashion illustration|pattern tile|seamless (pattern|tile))\b/i.test(lower)
}

/**
 * Strict check: is this message unambiguously asking for an image only?
 * Used to skip clarification and go straight to the image generator.
 */
export function isClearImagePrompt(msg: string): boolean {
    const lower = msg.toLowerCase().trim()
    const wordCount = lower.split(/\s+/).length
    if (wordCount < 3 || wordCount > 50) return false
    if (!detectImageIntent(msg)) return false
    // Not if it contains follow-up question markers
    if (/\?.*\?|how (do|can|should) i|explain|why does|what is the/i.test(lower)) return false
    return true
}

/**
 * Does the message want live web search? Not the same as Live mode —
 * this is used by Smart/Reasoner/Fast to inject web search results when
 * the user explicitly says "search" or "look up".
 */
export function detectSearchIntent(msg: string): boolean {
    const lower = msg.toLowerCase()
    if (/\b(search (the )?web|look up|google it?|find out about|fact[- ]check)\b/i.test(lower)) return true
    // "latest X" or "current X" — only if X is a concrete thing, not a concept
    if (/\b(latest|current|today's|this week's)\b.{0,30}\b(news|price|rate|score|release|version)\b/i.test(lower)) return true
    return false
}

/**
 * Extract container number from a tracking request.
 * ISO 6346 format: 4 uppercase letters + 7 digits. Most carriers use
 * "XXXU1234567" where U is the equipment category indicator.
 */
export function extractContainerNumber(msg: string): string | null {
    const m = msg.match(/\b([A-Z]{3}U\d{7})\b/i)
        ?? msg.match(/\b([A-Z]{4}\d{7})\b/i)
    return m ? m[1].toUpperCase() : null
}

/**
 * Extract a currency conversion request.
 * Matches "convert 500 GBP to EUR" and variants.
 */
export function extractCurrencyConversion(msg: string): { amount: number; from: string; to: string } | null {
    const m = msg.toLowerCase().match(/(?:convert\s+)?(\d[\d,.]*)\s*([a-z]{3})\s+(?:to|in|into)\s+([a-z]{3})/i)
    if (!m) return null
    return {
        amount: parseFloat(m[1].replace(/,/g, '')),
        from: m[2].toUpperCase(),
        to: m[3].toUpperCase(),
    }
}

/**
 * Extract a location for a weather query.
 * Returns the matched location or 'London' as a sensible default.
 */
export function extractWeatherLocation(msg: string): string {
    const m1 = msg.match(/weather\s+(?:in|for|at)\s+([a-z\s]+?)(?:\?|$|today|tomorrow|now)/i)
    const m2 = msg.match(/([a-z\s]+?)\s+weather/i)
    return (m1?.[1] ?? m2?.[1])?.trim() || 'London'
}
