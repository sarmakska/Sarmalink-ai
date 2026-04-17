/**
 * Web search — primary: Tavily, fallback: DuckDuckGo HTML.
 *
 * Search is used by Live mode when the grounded-Gemini path fails, and
 * by other modes when the user's message explicitly asks for current
 * information that the model's training cutoff can't cover.
 *
 * Results are returned as pre-formatted text blocks ready to inject into
 * the model prompt. Callers should wrap the output with `wrapUntrusted`
 * from `lib/prompts/sanitize.ts` before concatenating into the prompt.
 */

import { env } from '@/lib/env/validate'

/**
 * Primary search: Tavily. Structured results, relevance-scored.
 * Returns empty string if all keys exhausted or upstream is unreachable.
 */
async function tavilySearch(query: string): Promise<string> {
    for (const key of env().providers.tavily) {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: 'basic' }),
            })
            if (res.status === 429) continue
            if (!res.ok) continue
            const data = await res.json() as { results?: Array<{ title?: string; content?: string; url?: string }> }
            if (!data.results?.length) continue
            return data.results
                .slice(0, 5)
                .map(r => `- ${r.title ?? ''}\n  ${(r.content ?? '').slice(0, 300)}\n  ${r.url ?? ''}`)
                .join('\n\n')
        } catch { continue }
    }
    return ''
}

/**
 * Fallback: DuckDuckGo HTML scrape. Fragile (class names can change) but
 * requires no API key and no sign-up. Used only when Tavily returns nothing.
 */
async function duckDuckGoHtml(query: string): Promise<string> {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (cascade-ai-search/1.0)' },
        })
        if (!res.ok) return ''
        const html = await res.text()

        // Extract snippets — best-effort regex scraping
        const results: string[] = []
        const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g
        let m: RegExpExecArray | null
        let count = 0
        while ((m = resultRegex.exec(html)) !== null && count < 5) {
            const [, href, title, snippet] = m
            results.push(`- ${title.trim()}\n  ${snippet.trim()}\n  ${href}`)
            count++
        }
        return results.join('\n\n')
    } catch {
        return ''
    }
}

/**
 * Public entry point. Tries Tavily first, falls back to DuckDuckGo.
 * Returns empty string if both fail — callers must handle the empty case.
 */
export async function webSearch(query: string): Promise<string> {
    const tavily = await tavilySearch(query)
    if (tavily) return tavily
    return duckDuckGoHtml(query)
}

/**
 * Heuristic: does this message look like it needs web search?
 * Used by non-Live modes to proactively fetch real-time data when the
 * user's phrasing clearly references current events.
 */
export function detectSearchIntent(msg: string): boolean {
    const lower = msg.toLowerCase()
    return /\b(search (the )?web|look up|google|find out about|what is|current|recent|latest)\b/i.test(lower) &&
        /\b(today|yesterday|now|currently|latest|breaking|news|weather|price|rate|score|recent|this (week|month|year))\b/i.test(lower)
}
