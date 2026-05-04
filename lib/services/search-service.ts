/**
 * Search service — Tavily web search with DuckDuckGo fallbacks.
 *
 * Used by the chat orchestrator for:
 * 1. Non-live modes when the user explicitly asks for search
 * 2. Live mode fallback when Gemini grounded search fails
 */

import { env } from '@/lib/env/validate'

/**
 * Primary Tavily search, falling back through all configured keys.
 */
async function tavilySearch(query: string): Promise<string> {
    const TAVILY_KEYS = env().providers.tavily
    for (const key of TAVILY_KEYS) {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ query, max_results: 5, include_answer: true, include_raw_content: false }),
            })
            if (res.status === 429 || res.status === 403 || res.status === 401) continue
            if (res.ok) {
                const data = await res.json()
                const parts: string[] = []
                if (data.answer) parts.push(`**Summary:** ${data.answer}`)
                for (const r of (data.results ?? []).slice(0, 5)) {
                    if (r.content) parts.push(`**${r.title}**\n${r.content}\nSource: ${r.url}`)
                }
                if (parts.length) return parts.join('\n\n')
            }
        } catch { continue }
    }
    return ''
}

/**
 * DuckDuckGo HTML fallback — scrapes snippets from the HTML search page.
 */
async function duckDuckGoSearch(query: string): Promise<string> {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=uk-en`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        })
        if (!res.ok) return await ddgInstant(query)
        const html = await res.text()
        const snippets: string[] = []
        const { decode } = await import('he')
        const matches = html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)
        for (const m of matches) {
            const stripped = m[1].replace(/<[^>]+>/g, '')
            const text = decode(stripped).trim()
            if (text) snippets.push(text)
            if (snippets.length >= 5) break
        }
        return snippets.length ? snippets.join('\n\n') : await ddgInstant(query)
    } catch { return await ddgInstant(query) }
}

/**
 * DuckDuckGo Instant Answer API — last resort.
 */
async function ddgInstant(query: string): Promise<string> {
    try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`)
        if (!res.ok) return `No search results found for "${query}".`
        const data = await res.json()
        const parts: string[] = []
        if (data.AbstractText) parts.push(`${data.AbstractText}`)
        if (data.Answer) parts.push(`${data.Answer}`)
        for (const t of (data.RelatedTopics ?? []).slice(0, 4)) {
            if (t.Text) parts.push(t.Text)
        }
        return parts.length ? parts.join('\n\n') : `No results found for "${query}".`
    } catch { return `Search unavailable.` }
}

/**
 * Run a web search: Tavily first, then DuckDuckGo fallbacks.
 */
export async function runWebSearch(query: string): Promise<string> {
    const tavily = await tavilySearch(query)
    if (tavily) return tavily
    return await duckDuckGoSearch(query)
}
