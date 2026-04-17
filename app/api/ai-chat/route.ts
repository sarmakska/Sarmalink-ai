export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { MODELS, getModel, isValidModelId, autoRouteIntent, type ModelId } from '@/lib/ai-models'
import { getUserMemories } from '@/lib/ai-sessions'
import { getExchangeRates, getWeather, getTrackingLinks, convertCurrency } from '@/lib/ai-tools'

// ── Keys ──────────────────────────────────────────────────────────────────────
const GROQ_KEYS = Array.from({ length: 9 }, (_, i) =>
    process.env[i === 0 ? 'GROQ_API_KEY' : `GROQ_API_KEY_${i + 1}`]
).filter(Boolean) as string[]

const OR_KEYS = [process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEY_2].filter(Boolean) as string[]

const CEREBRAS_KEYS = Array.from({ length: 4 }, (_, i) =>
    process.env[i === 0 ? 'CEREBRAS_API_KEY' : `CEREBRAS_API_KEY_${i + 1}`]
).filter(Boolean) as string[]

const SAMBANOVA_KEYS = Array.from({ length: 4 }, (_, i) =>
    process.env[i === 0 ? 'SAMBANOVA_API_KEY' : `SAMBANOVA_API_KEY_${i + 1}`]
).filter(Boolean) as string[]

const GEMINI_KEYS = [
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY_2,
    process.env.GOOGLE_GEMINI_API_KEY_3,
    process.env.GEMINI_CHATBOT_KEY_1,
    process.env.GEMINI_CHATBOT_KEY_2,
    process.env.GEMINI_CHATBOT_KEY_3,
    process.env.GOOGLE_GEMINI_API_KEY_4,
    process.env.GOOGLE_GEMINI_API_KEY_5,
    process.env.GOOGLE_GEMINI_API_KEY_6,
    process.env.GOOGLE_GEMINI_API_KEY_7,
    process.env.GOOGLE_GEMINI_API_KEY_8,
    process.env.GOOGLE_GEMINI_API_KEY_9,
].filter(Boolean) as string[]

// ── Provider dispatch for generic OpenAI-compatible cascades ─────────────────
function providerEndpoint(provider: string): string | null {
    switch (provider) {
        case 'groq': return 'https://api.groq.com/openai/v1/chat/completions'
        case 'cerebras': return 'https://api.cerebras.ai/v1/chat/completions'
        case 'sambanova': return 'https://api.sambanova.ai/v1/chat/completions'
        case 'openrouter':
        case 'openrouter-free': return 'https://openrouter.ai/api/v1/chat/completions'
        default: return null
    }
}
function providerKeys(provider: string): string[] {
    switch (provider) {
        case 'groq': return GROQ_KEYS
        case 'cerebras': return CEREBRAS_KEYS
        case 'sambanova': return SAMBANOVA_KEYS
        case 'openrouter':
        case 'openrouter-free': return OR_KEYS
        default: return []
    }
}

const TAVILY_KEYS = Array.from({ length: 8 }, (_, i) =>
    process.env[`TAVILY_API_KEY_${i + 1}`]
).filter(Boolean) as string[]

const DAILY_LIMIT = 1000

// ── Model cascade: best quality → maximum capacity, all free on Groq ─────────
// Total capacity across 9 keys: ~165K req/day · ~16.2M tokens/day
// Verified live 2026-04-16 via scripts/probe-models.mjs — Kimi K2 was removed by Groq.
const MODELS_CASCADE = [
    'openai/gpt-oss-120b',                           // 120B — GPT-quality flagship (200K tpd × 9 = 1.8M)
    'llama-3.3-70b-versatile',                       // 70B — strong generalist
    'qwen/qwen3-32b',                                // 32B Qwen — solid quality (500K tpd × 9 = 4.5M)
    'meta-llama/llama-4-scout-17b-16e-instruct',    // 17B — fast, broad capability
    'llama-3.1-8b-instant',                          // 8B — huge safety net (14.4K rpd × 9 = 129K req/day)
]
const MODEL_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct'

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Cascade AI — a sharp, capable AI assistant built by Cascade AI for Your Company. You think clearly, write brilliantly, and give genuinely useful answers. You're like the smartest colleague in the room: direct, knowledgeable, and always helpful.

**Capabilities you have:**
- Write polished professional emails, letters, and documents — complete and ready to send, no filler commentary
- Answer questions with real depth and accuracy
- Analyse uploaded documents, spreadsheets, and PDFs
- Help with code in any language
- Translate text naturally (not word-for-word)
- Brainstorm and think creatively
- Search the web for current information when needed
- Generate images on request

**How to respond:**
- Match response length to the question — short questions get short answers, complex tasks get thorough treatment
- Use markdown (headers, bold, bullets, tables, code blocks) only when it genuinely helps readability
- For emails: write the complete email directly, ready to copy-paste. No meta-commentary like "Here is an email..."
- For code: always use fenced code blocks with the language name
- Be direct. Don't pad, hedge excessively, or repeat the question back
- If you don't know something, say so briefly and offer what you do know

**Answer first, ask only if genuinely blocked.**

DEFAULT BEHAVIOUR: do the task with reasonable assumptions, deliver a polished result, and briefly note your assumptions at the end so the user can adjust. This is what professional colleagues do — they don't interrogate you, they deliver something you can react to.

**Only ask clarifying questions when:**
- The request literally cannot be answered without a missing piece (e.g. "summarise this" with nothing attached — you literally don't have the text)
- Doing the task wrong would waste significant effort (e.g. "write a 5000-word report" with no topic)
- There's a safety/legal risk in guessing

**For EVERYTHING ELSE — just do it:**
- "Write a leave letter" → produce a good generic leave letter, note "I've written this for 3 days starting Monday — tell me if the dates or reason differ"
- "Make me a logo" → render something sensible, then offer variations
- "Help me with the database" → ask ONE short question ("SQL query, schema, or something else?") only if truly ambiguous — but better: assume the most common interpretation and do it
- "Create a report" → produce a reasonable short report on the inferred topic with clear sections

If you MUST ask, batch all questions in ONE numbered list (2-4 max) and keep it tight. Never rapid-fire single questions.

**The user's patience is the scarce resource, not the quality of the output.** A 90%-right answer now beats a 100%-right answer after 3 rounds of questions. Defer polish, not work.

**Offer format choice when exporting data:**
- If your answer contains multiple tables, data sets, or structured data the user might want to save, do NOT just dump raw markdown. Instead, end with a single line offering format choices:
  > _Want this exported? Reply with "excel", "csv", or "pdf" and I'll reformat._
- If the user explicitly says "export as X", tailor your response exactly to that format.
- For multiple tables that relate to one topic, ALWAYS combine them into one well-structured response (one Excel file with multiple sheets is cleaner than 7 separate files).

**Time-sensitive information — IMPORTANT:**
- Your training data has a cutoff — you do NOT reliably know about events, politics, prices, wars, elections, leaders, markets, sports, weather, news, or anything that may have changed since then.
- If the user asks about any of these topics and you have NOT been given live search results in the current message, do NOT make up specific dates, facts, or events from your training data.
- Instead say: "I don't have live data on that. Ask me to 'search for [topic]' and I'll look it up for you." — or simply suggest they ask you to search.
- NEVER present old training-data information as current fact on time-sensitive topics.
- If live search results are included in the message, use them as the authoritative source and cite them.

**When asked about your training, your model, or who built you:**
- I was built and integrated by **Sai (Cascade AI)** for Your Company as part of the Cascade AI platform.
- The underlying model currently serving you is injected below as CURRENT_MODEL.
- My knowledge cutoff is injected below as MODEL_CUTOFF — use that EXACT value, never guess.
- Acceptable answer format: "I'm currently running on [CURRENT_MODEL], integrated by Sai (Cascade AI). My knowledge cutoff is [MODEL_CUTOFF]. For anything more recent, ask me to search the web."
- It IS okay to mention the specific underlying model when asked.
- Your internal reasoning (the part inside <think> tags) should sound natural and direct — do NOT mention "developer instructions", "system prompt", "I was told", or quote your own rules. Reason like the AI itself, not like someone following orders.

**Identity:**
- You were designed and built by Cascade AI
- You run on Cascade AI proprietary AI models
- Never mention Groq, OpenRouter, Llama, Gemini, GPT, Kimi, Moonshot, or any third-party AI provider

Today's context: You are assisting staff at Your Company, a UK fashion company.`

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

// ── Nexus data integration ────────────────────────────────────────────────────
type NexusIntent = 'leave' | 'attendance' | 'office'

function detectNexusIntent(msg: string): NexusIntent | null {
    if (/\b(my leave|holiday|annual leave|days? off|time off|leave balance|days? remaining|how many days?|entitlement|carried over|sick leave|maternity|my (remaining|total|used) days?)\b/i.test(msg)) return 'leave'
    if (/\b(clock.?in|clock.?out|my hours?|hours? (worked|this week|today)|my timesheet|my attendance|worked today|my shift|what time did i)\b/i.test(msg)) return 'attendance'
    if (/\b(who[''s]? in|who is in|in the office|office today|staff.*today|working today|who.?s (working|wfh|on leave)|present today|working from home today)\b/i.test(msg)) return 'office'
    return null
}

async function fetchNexusData(userId: string, intent: NexusIntent): Promise<string> {
    try {
        const today = new Date().toISOString().split('T')[0]
        const year  = new Date().getFullYear()

        if (intent === 'leave') {
            const { data: balances } = await (supabaseAdmin as any)
                .from('leave_balances')
                .select('leave_type, total, used, pending')
                .eq('user_id', userId)
                .eq('year', year)
            if (!balances?.length) return '[No leave balance data found]'
            const lines = (balances as any[]).map((b: any) => {
                const remaining = Math.max(0, Number(b.total) - Number(b.used) - Number(b.pending))
                return `${b.leave_type}: ${remaining} days remaining (${b.used} used, ${b.pending} pending, ${b.total} total entitlement)`
            })
            return `Leave balances for ${year}:\n${lines.join('\n')}`
        }

        if (intent === 'attendance') {
            const weekStart = new Date()
            weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)) // Monday
            const weekStartStr = weekStart.toISOString().split('T')[0]
            const { data: records } = await (supabaseAdmin as any)
                .from('attendance')
                .select('work_date, clock_in, clock_out')
                .eq('user_id', userId)
                .gte('work_date', weekStartStr)
                .order('work_date', { ascending: false })
            if (!records?.length) return '[No attendance records found this week]'
            let totalMins = 0
            const lines = (records as any[]).map((r: any) => {
                let hrs = ''
                if (r.clock_in && r.clock_out) {
                    const mins = Math.round((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000)
                    totalMins += mins
                    hrs = ` — ${Math.floor(mins/60)}h ${mins%60}m`
                } else if (r.clock_in) {
                    hrs = ' — still clocked in'
                }
                const ci = r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'not recorded'
                const co = r.clock_out ? ', out ' + new Date(r.clock_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
                return `${r.work_date}: in ${ci}${co}${hrs}`
            })
            return `Your attendance this week:\n${lines.join('\n')}\nTotal hours so far: ${Math.floor(totalMins/60)}h ${totalMins%60}m`
        }

        if (intent === 'office') {
            const [{ data: attendance }, { data: profiles }] = await Promise.all([
                (supabaseAdmin as any).from('attendance').select('user_id, clock_in, clock_out, status').eq('work_date', today),
                (supabaseAdmin as any).from('user_profiles').select('id, full_name').eq('is_active', true),
            ])
            const attMap = new Map((attendance ?? []).map((a: any) => [a.user_id, a]))
            const inOffice: string[] = [], wfh: string[] = [], onLeave: string[] = [], absent: string[] = []
            for (const p of profiles ?? []) {
                const rec: any = attMap.get(p.id)
                if (!rec) { absent.push(p.full_name); continue }
                if (rec.status === 'wfh') { wfh.push(p.full_name); continue }
                if (rec.status === 'leave') { onLeave.push(p.full_name); continue }
                if (rec.clock_in && !rec.clock_out) { inOffice.push(p.full_name); continue }
                if (rec.clock_in && rec.clock_out) { absent.push(p.full_name + ' (clocked out)'); continue }
                absent.push(p.full_name)
            }
            const parts = [`Office status for today (${today}):`]
            if (inOffice.length)  parts.push(`In office: ${inOffice.join(', ')}`)
            if (wfh.length)       parts.push(`Working from home: ${wfh.join(', ')}`)
            if (onLeave.length)   parts.push(`On leave: ${onLeave.join(', ')}`)
            if (absent.length)    parts.push(`Not in / absent: ${absent.join(', ')}`)
            return parts.join('\n')
        }
    } catch (err: any) {
        console.error('[Nexus data]', err.message)
    }
    return ''
}

// ── Intent detection (from user message, not AI response) ─────────────────────
function detectImageIntent(msg: string): boolean {
    return /\b(generate|create|draw|make|design|produce)\s+(?:\w+\s+){0,3}(image|picture|photo|illustration|artwork|painting|drawing|logo|icon|portrait|scene)\b/i.test(msg)
        || /\b(image of|picture of|photo of|draw me|visualize|show me what .+ looks? like)\b/i.test(msg)
}

function detectSearchIntent(msg: string): boolean {
    // Explicit search triggers — user asks for live info
    const explicit = /\b(search|look ?up|find out|latest news|current|today['s]?|right now|what['s]? happening|price of|weather|wether|wheather|temperature|tempreture|temp outside|outside|score of|recent|2025|2026|2027|this week|this month|this year|going on|news about|update on|status of|latest on|is it raining|is it snowing|is it sunny|rain today|rain now|sunny today)\b/i
    if (explicit.test(msg)) return true

    // Time-sensitive event topics — wars, politics, markets, crises
    const timeSensitive = /\b(war|conflict|crisis|ceasefire|invasion|election|vote|referendum|president|prime minister|chancellor|stock|market|shares|inflation|interest rate|exchange rate|protest|strike|ukraine|russia|israel|iran|gaza|houthi|yemen|lebanon|syria|opec|nato|eu|brexit|covid|pandemic|recession|tariff|sanctions)\b/i
    if (timeSensitive.test(msg)) return true

    // "What is the X" / "How is the X" / "Is there a" — looking for facts
    const questionStart = /\b(what (is|are) the (current|latest|recent|today'?s?|new)|how is the (current|latest|weather|wether|wheather|temperature|weather outside)|is there (a|an|any) (current|new|recent)|has there been)\b/i
    if (questionStart.test(msg)) return true

    // "How's the weather [in X]" / "What's the temp" — common phrasings + typos
    const weatherish = /\b(how('?s| is)? the (weather|wether|wheather|temp|temperature|forecast)|what('?s| is)? the (weather|wether|wheather|temp|temperature|forecast)|how('?s| is) it (outside|today))\b/i
    if (weatherish.test(msg)) return true

    return false
}

// ── AI-based auto-router (replaces brittle regex) ────────────────────────────
// Uses Cerebras Llama 3.1 8B (free, ~200ms) to classify the user's intent
// and return the best-fit model id. Falls back to regex if the classifier
// call fails (rate limit, network, etc.).
type RoutedIntent = 'smart' | 'coder' | 'live' | 'reasoner' | 'fast' | 'image'

async function classifyIntentAI(message: string, history: any[]): Promise<RoutedIntent> {
    if (!CEREBRAS_KEYS.length) return 'smart'
    const text = (message || '').slice(0, 600)
    if (!text.trim()) return 'smart'

    // Include last assistant message as context — helps catch "create image" after
    // a long design description, or "what about tomorrow" after a weather question.
    const lastAssistant = history?.slice().reverse().find((m: any) => m.role === 'assistant')?.content?.slice(0, 300) ?? ''

    const classifyPrompt = `You are a fast router. Classify the user's LATEST message into ONE category and reply with ONLY the category name (no explanation, no punctuation). Use the prior assistant message as context if the latest message is a follow-up.

Categories:
- image: user wants a VISUAL image file generated — "create image", "generate picture", "make a logo", "draw me X", "visual mockup", "illustration of". Or they're confirming a prior offer to generate an image.
- code: ONLY for actual software programming — writing, fixing, refactoring, debugging, or reviewing source code. Requires code context (fenced code blocks, file extensions .ts/.py/.sql, "function", "class", "bug"). Does NOT include "create a table of data", "make a list", "summarise", "analyse files", "extract information" — those are SMART tasks.
- live: anything current or time-sensitive — news, weather (including typos like "wether"), prices, scores, "today", "right now", "outside".
- reasoner: complex multi-step problems, proofs, heavy math, logic puzzles, deep step-by-step reasoning.
- fast: simple factual lookups, one-liner questions, quick definitions under 10 words.
- smart: EVERYTHING ELSE — emails, writing, brainstorming, translation, data extraction from files, creating tables/summaries/reports from uploaded documents, professional tasks. This is the DEFAULT — use smart whenever unsure.

${lastAssistant ? `Prior assistant message (for context):\n"""${lastAssistant.replace(/"/g, '\\"')}"""\n\n` : ''}Latest user message:
"""${text.replace(/"/g, '\\"')}"""

Reply with ONE word only from the 6 categories above.`

    const rotationOffset = Date.now() % CEREBRAS_KEYS.length
    const keys = [...CEREBRAS_KEYS.slice(rotationOffset), ...CEREBRAS_KEYS.slice(0, rotationOffset)]

    for (const key of keys) {
        try {
            const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    model: 'llama3.1-8b',
                    messages: [{ role: 'user', content: classifyPrompt }],
                    max_tokens: 5,
                    temperature: 0,
                }),
            })
            if (!res.ok) continue
            const data = await res.json()
            const raw = (data.choices?.[0]?.message?.content || '').toLowerCase().trim().replace(/[^a-z]/g, '')
            if (raw === 'image' || raw === 'picture' || raw === 'draw') return 'image'
            if (raw === 'code') return 'coder'
            if (raw === 'live' || raw === 'search') return 'live'
            if (raw === 'reasoner' || raw === 'reason' || raw === 'reasoning') return 'reasoner'
            if (raw === 'fast') return 'fast'
            if (raw === 'smart') return 'smart'
            continue
        } catch { continue }
    }
    return 'smart'
}

// ── Shared Cloudflare FLUX helper — callable directly from chat stream,
// bypasses the self-fetch-to-/api/images/generate that breaks on Vercel.
const CF_PAIRS: { accountId: string; token: string }[] = [
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', token: process.env.CLOUDFLARE_API_TOKEN ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_2 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_3 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_3 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_4 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_4 ?? '' },
].filter(p => p.accountId && p.token)

async function generateImageDirect(prompt: string): Promise<{ dataUrl: string; source: string } | null> {
    for (const pair of CF_PAIRS) {
        try {
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${pair.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, steps: 8 }),
                }
            )
            if (!res.ok) continue
            const data = await res.json()
            const b64 = data?.result?.image
            if (!b64 || typeof b64 !== 'string' || b64.length < 100) continue
            return { dataUrl: `data:image/png;base64,${b64}`, source: 'Cloudflare FLUX.1-schnell (free)' }
        } catch { continue }
    }
    return null
}

// Strip <think>...</think> blocks and common reasoning preambles from text.
// Kimi K2 + other models sometimes emit their internal reasoning as content;
// we never want that leaking into user-visible captions.
function stripReasoningLeak(text: string): string {
    if (!text) return text
    let clean = text
    // Remove think blocks (both closed and unclosed)
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
    clean = clean.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    // Drop reasoning preambles — the model talking to itself before the answer
    const reasoningStarts = [
        /^okay,?\s+let\s+me\s+tackle\s+this[\s\S]*?(?=\n\n|$)/i,
        /^(okay|alright|hmm|well|let'?s?\s+see),?\s+[\s\S]{0,400}\b(the\s+user|user\s+wants|user\s+is\s+asking)\b[\s\S]*?(?=\n\n|$)/i,
        /^the\s+user\s+(wants|is\s+asking|needs)[\s\S]*?(?=\n\n|$)/i,
    ]
    for (const re of reasoningStarts) clean = clean.replace(re, '')
    return clean.trim()
}

// Decide if the user's current message is itself a clear image-prompt, or
// if it's a "do it"-style confirmation that needs context to build a prompt.
function isClearImagePrompt(msg: string): boolean {
    const trimmed = msg.trim()
    if (!trimmed) return false
    const words = trimmed.split(/\s+/).length
    // Short confirmations like "yes", "do it", "create image", "go", etc.
    const confirmations = /^(yes|yeah|ok|okay|go|do it|sure|please|create|generate|draw|make|make it|go ahead|image|picture|do this)\b[\s\S]*$/i
    if (words <= 4 && confirmations.test(trimmed)) return false
    if (words >= 6) return true
    // Medium length: look for concrete visual nouns/adjectives
    const visualMarkers = /\b(logo|dress|jumper|castle|landscape|portrait|photo|sketch|illustration|mockup|moodboard|pattern|print|flat|tile|background|scene|colou?r|style|painting|drawing|red|blue|green|yellow|burgundy|cream|black|white|vintage|modern|minimal|luxurious|editorial)\b/i
    return visualMarkers.test(trimmed)
}

// Build a proper image prompt. Prioritises the user's actual message.
// Only distills from history when the message is a short confirmation AND
// the history contains a recent design description from the assistant.
async function buildImagePromptFromContext(userMsg: string, history: any[]): Promise<string> {
    const trimmed = userMsg.trim().replace(/^(please|could you|can you|go on and|now|then)\s+/i, '')

    // 1. User's message is itself a clear image prompt — use verbatim
    if (isClearImagePrompt(trimmed)) {
        return trimmed.replace(/\b(generate|create|draw|make|design|produce|render)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|drawing|render)(\s+of)?\s*/gi, '').trim() || trimmed
    }

    // 2. Short confirmation — look at LAST USER message that described something
    // (not the last assistant message, which might have gone off on a tangent)
    const lastUserDescription = history?.slice().reverse().find((m: any) => {
        if (m.role !== 'user') return false
        const c = (m.content || '').trim()
        return c.length > 20 && isClearImagePrompt(c)
    })?.content
    if (lastUserDescription) {
        return lastUserDescription.replace(/\b(generate|create|draw|make|design|produce|render)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|drawing|render)(\s+of)?\s*/gi, '').trim().slice(0, 400)
    }

    // 3. Fall back to the last assistant description, but STRICTLY distilled
    const lastAssistant = history?.slice().reverse().find((m: any) => m.role === 'assistant')?.content?.slice(0, 1500) ?? ''
    if (!lastAssistant || !CEREBRAS_KEYS.length) {
        return trimmed || 'a clear, well-composed image'
    }
    try {
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CEREBRAS_KEYS[0]}` },
            body: JSON.stringify({
                model: 'llama3.1-8b',
                messages: [{
                    role: 'user',
                    content: `Extract a concise visual image prompt (15-40 words) from the description below. Output ONLY the prompt itself — no preamble, no reasoning, no "Here is" or "The prompt is". Just the visual description.\n\nDescription:\n${lastAssistant}\n\nPrompt:`,
                }],
                max_tokens: 120,
                temperature: 0.2,
            }),
        })
        if (!res.ok) return trimmed || lastAssistant.slice(0, 200)
        const data = await res.json()
        let built = stripReasoningLeak((data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, ''))
        built = built.replace(/^(prompt:|image prompt:|here'?s?\s+(the|a)\s+prompt:?)\s*/i, '').trim()
        return built || trimmed || lastAssistant.slice(0, 200)
    } catch {
        return trimmed || lastAssistant.slice(0, 200)
    }
}

// ── Web search: Tavily → DuckDuckGo HTML fallback ─────────────────────────────
async function webSearch(query: string): Promise<string> {
    // 1. Try Tavily keys
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

    // 2. DuckDuckGo HTML fallback
    return await duckDuckGoSearch(query)
}

async function duckDuckGoSearch(query: string): Promise<string> {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=uk-en`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        })
        if (!res.ok) return await ddgInstant(query)
        const html = await res.text()
        const snippets: string[] = []
        const matches = html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)
        for (const m of matches) {
            const text = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim()
            if (text) snippets.push(text)
            if (snippets.length >= 5) break
        }
        return snippets.length ? snippets.join('\n\n') : await ddgInstant(query)
    } catch { return await ddgInstant(query) }
}

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

// ── PDF extract via Gemini ────────────────────────────────────────────────────
async function extractPdf(pdfBase64: string): Promise<string> {
    for (const key of GEMINI_KEYS) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: 'Extract ALL text from this document exactly as written — every line, number, heading, and detail. Do not summarise or skip anything.' },
                        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
                    ]}],
                }),
            })
            if (res.status === 429) continue
            if (res.ok) {
                const data = await res.json()
                const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').slice(0, 15000)
                if (text) return text
            }
        } catch { continue }
    }
    return '[Could not read this PDF. Please try a smaller file or paste the text directly.]'
}

// ── Excel extract ─────────────────────────────────────────────────────────────
async function extractExcel(base64: string): Promise<string> {
    try {
        const XLSX = require('xlsx')
        const buffer = Buffer.from(base64, 'base64')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        let result = ''
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName]
            const csv = XLSX.utils.sheet_to_csv(sheet)
            result += `Sheet: ${sheetName}\n${csv}\n\n`
        }
        return result.slice(0, 15000) || '[Empty spreadsheet]'
    } catch { return '[Could not read this Excel file.]' }
}

// ── Word extract via mammoth ──────────────────────────────────────────────────
async function extractWord(base64: string): Promise<string> {
    try {
        const mammoth = require('mammoth')
        const buffer = Buffer.from(base64, 'base64')
        const result = await mammoth.extractRawText({ buffer })
        return result.value.slice(0, 15000) || '[Empty document]'
    } catch { return '[Could not read this Word file.]' }
}

// ── Image generation via Pollinations.ai ──────────────────────────────────────
function generateImageUrl(prompt: string): string {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`
}

// ── Provider redaction — disabled per user request ───────────────────────────
// User decided model disclosure is OK, so this is now a passthrough.
// Kept as a function in case we need to re-enable selective filtering later.
function redactProviderNames(text: string): string {
    return text
}

// ── Thinking redaction — strip meta-references to system prompt / dev instructions ──
// The AI's reasoning should sound natural, not like it's quoting orders.
function redactThinkingMeta(text: string): string {
    if (!text) return text
    // Drop any sentence that references developer/system/instructions
    return text
        .split(/(?<=[.!?])\s+/)
        .filter(sentence => !/\b(developer|system prompt|instructions|told to|must answer with|must follow|must not mention|guidelines say|prompt says|i was instructed|according to (my|the) (instructions|prompt|rules|guidelines))\b/i.test(sentence))
        .join(" ")
}

// ── Event logging (fire-and-forget) ──────────────────────────────────────────
async function logEvent(args: {
    user_id: string
    event_type: 'message' | 'fallback' | 'rate_limit' | 'error' | 'model_switch'
    model_id: string
    backend?: string
    key_index?: number
    tokens_in?: number
    tokens_out?: number
    latency_ms?: number
    status?: string
    meta?: any
}) {
    try {
        await (supabaseAdmin as any).from('ai_events').insert({ ...args })
    } catch { /* never block the chat for logging */ }
}

// ── Stream from a custom Groq cascade (for model-specific routing) ────────────
async function streamFromGroqModels(
    models: string[],
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string,
    selectedModel: string
): Promise<{ ok: boolean; backend?: string; latencyMs?: number; tokensOut?: number }> {
    const rotationSeed = Date.now()
    const offset = GROQ_KEYS.length ? rotationSeed % GROQ_KEYS.length : 0
    const rotatedKeys = [...GROQ_KEYS.slice(offset), ...GROQ_KEYS.slice(0, offset)]
    for (const model of models) {
        let keyIdx = 0
        for (const key of rotatedKeys) {
            keyIdx++
            const startedAt = Date.now()
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, top_p: 0.9, stream: true }),
                })
                if (res.status === 429) {
                    logEvent({ user_id: userId, event_type: 'rate_limit', model_id: selectedModel, backend: model, key_index: keyIdx, status: '429' })
                    continue
                }
                if (!res.ok) {
                    logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: model, key_index: keyIdx, status: String(res.status) })
                    continue
                }

                const reader = res.body!.getReader()
                const dec = new TextDecoder()
                let buf = ''
                let charCount = 0
                // Filter state for stripping <think>...</think> blocks AND capturing them as thinking events
                let pendingText = ''
                let inThinkBlock = false

                const sendVisible = (text: string) => {
                    const clean = redactProviderNames(text)
                    if (!clean) return
                    charCount += clean.length
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: clean })}\n\n`))
                }
                const sendThinking = (text: string) => {
                    const clean = redactThinkingMeta(redactProviderNames(text))
                    if (!clean) return
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: clean })}\n\n`))
                }

                const flushVisibleText = (text: string) => {
                    pendingText += text
                    while (pendingText.length > 0) {
                        if (inThinkBlock) {
                            const closeIdx = pendingText.indexOf('</think>')
                            if (closeIdx === -1) {
                                if (pendingText) sendThinking(pendingText)
                                pendingText = ''
                                return
                            }
                            const thinkPart = pendingText.slice(0, closeIdx)
                            if (thinkPart) sendThinking(thinkPart)
                            pendingText = pendingText.slice(closeIdx + '</think>'.length)
                            inThinkBlock = false
                        } else {
                            const openIdx = pendingText.indexOf('<think>')
                            if (openIdx === -1) {
                                if (pendingText.length > 7) {
                                    const safe = pendingText.slice(0, pendingText.length - 7)
                                    const tail = pendingText.slice(pendingText.length - 7)
                                    if (safe) sendVisible(safe)
                                    pendingText = tail
                                }
                                return
                            }
                            const visible = pendingText.slice(0, openIdx)
                            if (visible) sendVisible(visible)
                            pendingText = pendingText.slice(openIdx + '<think>'.length)
                            inThinkBlock = true
                        }
                    }
                }

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buf += dec.decode(value, { stream: true })
                    const lines = buf.split('\n')
                    buf = lines.pop() ?? ''
                    for (const line of lines) {
                        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
                        try {
                            const data = JSON.parse(line.slice(6))
                            const token = data.choices?.[0]?.delta?.content || ''
                            const reasoning = data.choices?.[0]?.delta?.reasoning || ''
                            if (reasoning) sendThinking(reasoning)
                            if (token) flushVisibleText(token)
                        } catch { /* skip malformed SSE line */ }
                    }
                }
                if (inThinkBlock && pendingText.length > 0) {
                    sendThinking(pendingText)
                    pendingText = ''
                } else if (pendingText.length > 0) {
                    sendVisible(pendingText)
                    pendingText = ''
                }
                // If nothing visible came through, this attempt was empty — rotate to next key
                if (charCount === 0) {
                    logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: model, key_index: keyIdx, status: 'empty_stream' })
                    continue
                }
                const latency = Date.now() - startedAt
                return { ok: true, backend: model, latencyMs: latency, tokensOut: Math.ceil(charCount / 4) }
            } catch (e: any) {
                logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: model, key_index: keyIdx, status: 'exception', meta: { msg: e?.message?.slice(0, 200) } })
                continue
            }
        }
    }
    return { ok: false }
}

// ── Generic cascade dispatcher — works across Groq, Cerebras, SambaNova, OR ─
// Iterates cascade steps in order. For each step, tries every key in the
// provider's pool before falling through. Same streaming + <think> parsing
// logic as streamFromGroqModels, just parameterised by provider endpoint.
async function tryCascade(
    cascade: { provider: string; model: string; label: string }[],
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string,
    selectedModel: string
): Promise<{ ok: boolean; backend?: string; label?: string; latencyMs?: number; tokensOut?: number }> {
    // Round-robin key rotation per request — spreads load so key 1 isn't
    // always hit first. Different requests start from different offsets,
    // giving every key in each pool roughly equal usage over time.
    const rotationSeed = Date.now()

    for (const step of cascade) {
        const endpoint = providerEndpoint(step.provider)
        const allKeys = providerKeys(step.provider)
        if (!endpoint || !allKeys.length) continue
        const offset = rotationSeed % allKeys.length
        const keys = [...allKeys.slice(offset), ...allKeys.slice(0, offset)]

        let keyIdx = 0
        for (const key of keys) {
            keyIdx++
            const startedAt = Date.now()
            try {
                const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
                if (step.provider === 'openrouter' || step.provider === 'openrouter-free') {
                    headers['HTTP-Referer'] = 'https://ai.example.com'
                    headers['X-Title'] = 'Cascade AI'
                }
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ model: step.model, messages, temperature: 0.7, max_tokens: maxTokens, top_p: 0.9, stream: true }),
                })
                if (res.status === 429) {
                    logEvent({ user_id: userId, event_type: 'rate_limit', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: '429' })
                    continue
                }
                if (!res.ok) {
                    logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: String(res.status) })
                    continue
                }

                const reader = res.body!.getReader()
                const dec = new TextDecoder()
                let buf = ''
                let charCount = 0
                let pendingText = ''
                let inThinkBlock = false

                const sendVisible = (text: string) => {
                    const clean = redactProviderNames(text)
                    if (!clean) return
                    charCount += clean.length
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: clean })}\n\n`))
                }
                const sendThinking = (text: string) => {
                    const clean = redactThinkingMeta(redactProviderNames(text))
                    if (!clean) return
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: clean })}\n\n`))
                }
                const flushVisibleText = (text: string) => {
                    pendingText += text
                    while (pendingText.length > 0) {
                        if (inThinkBlock) {
                            const closeIdx = pendingText.indexOf('</think>')
                            if (closeIdx === -1) { if (pendingText) sendThinking(pendingText); pendingText = ''; return }
                            const thinkPart = pendingText.slice(0, closeIdx)
                            if (thinkPart) sendThinking(thinkPart)
                            pendingText = pendingText.slice(closeIdx + '</think>'.length)
                            inThinkBlock = false
                        } else {
                            const openIdx = pendingText.indexOf('<think>')
                            if (openIdx === -1) {
                                if (pendingText.length > 7) {
                                    const safe = pendingText.slice(0, pendingText.length - 7)
                                    const tail = pendingText.slice(pendingText.length - 7)
                                    if (safe) sendVisible(safe); pendingText = tail
                                }
                                return
                            }
                            const visible = pendingText.slice(0, openIdx)
                            if (visible) sendVisible(visible)
                            pendingText = pendingText.slice(openIdx + '<think>'.length)
                            inThinkBlock = true
                        }
                    }
                }

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buf += dec.decode(value, { stream: true })
                    const lines = buf.split('\n')
                    buf = lines.pop() ?? ''
                    for (const line of lines) {
                        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
                        try {
                            const data = JSON.parse(line.slice(6))
                            const token = data.choices?.[0]?.delta?.content || ''
                            const reasoning = data.choices?.[0]?.delta?.reasoning || ''
                            if (reasoning) sendThinking(reasoning)
                            if (token) flushVisibleText(token)
                        } catch { /* skip malformed SSE line */ }
                    }
                }
                if (inThinkBlock && pendingText.length > 0) { sendThinking(pendingText); pendingText = '' }
                else if (pendingText.length > 0) { sendVisible(pendingText); pendingText = '' }

                if (charCount === 0) {
                    logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: 'empty_stream' })
                    continue
                }
                const latency = Date.now() - startedAt
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'backend', label: step.label })}\n\n`))
                return { ok: true, backend: step.model, label: step.label, latencyMs: latency, tokensOut: Math.ceil(charCount / 4) }
            } catch (e: any) {
                logEvent({ user_id: userId, event_type: 'error', model_id: selectedModel, backend: step.label, key_index: keyIdx, status: 'exception', meta: { msg: e?.message?.slice(0, 200) } })
                continue
            }
        }
    }
    return { ok: false }
}

// ── Backwards compat — old streamCascade name still used by other paths ─────
async function streamCascade(
    messages: any[],
    maxTokens: number,
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController
): Promise<boolean> {
    const result = await streamFromGroqModels(MODELS_CASCADE, messages, maxTokens, encoder, controller, '', 'smart')
    return result.ok
}

// ── Gemini grounded streaming — Live mode ─────────────────────────────────────
// Calls Gemini 2.5 Flash with Google Search grounding tool enabled.
// Falls through 9 keys on rate-limit / error.
async function streamFromGeminiGrounded(
    messages: any[],
    encoder: TextEncoder,
    controller: ReadableStreamDefaultController,
    userId: string
): Promise<{ ok: boolean; latencyMs?: number; sources?: any[] }> {
    // Gemini expects a different message format — convert from OpenAI-style
    const systemMsg = messages.find((m: any) => m.role === 'system')?.content ?? ''
    const userMsgs = messages.filter((m: any) => m.role !== 'system')
    const geminiContents = userMsgs.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }))

    let keyIdx = 0
    for (const key of GEMINI_KEYS) {
        keyIdx++
        const startedAt = Date.now()
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify({
                        contents: geminiContents,
                        systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
                        tools: [{ googleSearch: {} }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
                    }),
                }
            )
            if (res.status === 429) {
                logEvent({ user_id: userId, event_type: 'rate_limit', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: '429' })
                continue
            }
            if (!res.ok) {
                logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: String(res.status) })
                continue
            }

            const reader = res.body!.getReader()
            const dec = new TextDecoder()
            let buf = ''
            let charCount = 0
            const sources: any[] = []
            let pendingText = ''
            let inThinkBlock = false

            const sendVisible = (text: string) => {
                const clean = redactProviderNames(text)
                if (!clean) return
                charCount += clean.length
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: clean })}\n\n`))
            }
            const sendThinking = (text: string) => {
                const clean = redactProviderNames(text)
                if (!clean) return
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: clean })}\n\n`))
            }

            const flushVisibleText = (text: string) => {
                pendingText += text
                while (pendingText.length > 0) {
                    if (inThinkBlock) {
                        const closeIdx = pendingText.indexOf('</think>')
                        if (closeIdx === -1) {
                            if (pendingText) sendThinking(pendingText)
                            pendingText = ''
                            return
                        }
                        const thinkPart = pendingText.slice(0, closeIdx)
                        if (thinkPart) sendThinking(thinkPart)
                        pendingText = pendingText.slice(closeIdx + '</think>'.length)
                        inThinkBlock = false
                    } else {
                        const openIdx = pendingText.indexOf('<think>')
                        if (openIdx === -1) {
                            if (pendingText.length > 7) {
                                const safe = pendingText.slice(0, pendingText.length - 7)
                                const tail = pendingText.slice(pendingText.length - 7)
                                if (safe) sendVisible(safe)
                                pendingText = tail
                            }
                            return
                        }
                        const visible = pendingText.slice(0, openIdx)
                        if (visible) sendVisible(visible)
                        pendingText = pendingText.slice(openIdx + '<think>'.length)
                        inThinkBlock = true
                    }
                }
            }

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                // Gemini SSE uses single-newline separation like Groq
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const rawLine of lines) {
                    const line = rawLine.trim()
                    if (!line.startsWith('data: ')) continue
                    try {
                        const data = JSON.parse(line.slice(6))
                        const parts = data?.candidates?.[0]?.content?.parts ?? []
                        for (const p of parts) {
                            if (p.text) flushVisibleText(p.text)
                        }
                        // Capture grounding sources
                        const groundingMeta = data?.candidates?.[0]?.groundingMetadata
                        if (groundingMeta?.groundingChunks) {
                            for (const g of groundingMeta.groundingChunks) {
                                if (g.web) sources.push({ title: g.web.title, uri: g.web.uri })
                            }
                        }
                    } catch { /* skip malformed line */ }
                }
            }
            // Flush remaining pending text
            if (!inThinkBlock && pendingText.length > 0) {
                charCount += pendingText.length
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: pendingText })}\n\n`))
                pendingText = ''
            }
            // Only count as success if at least one character streamed
            if (charCount === 0) {
                logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: 'empty_stream' })
                continue
            }
            return { ok: true, latencyMs: Date.now() - startedAt, sources }
        } catch (e: any) {
            logEvent({ user_id: userId, event_type: 'error', model_id: 'live', backend: 'gemini-2.5-flash', key_index: keyIdx, status: 'exception', meta: { msg: e?.message?.slice(0, 200) } })
            continue
        }
    }
    return { ok: false }
}

// ── Full (non-streaming) Groq call — for re-asking after search ───────────────
async function askGroqFull(messages: any[], maxTokens = 2000): Promise<string> {
    for (const model of MODELS_CASCADE) {
        for (const key of GROQ_KEYS) {
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, top_p: 0.9 }),
                })
                if (res.status === 429) continue
                if (!res.ok) continue
                const data = await res.json()
                const reply = data.choices?.[0]?.message?.content ?? ''
                if (reply) return reply
            } catch { continue }
        }
    }
    return ''
}

// ── OpenRouter fallback (non-streaming, last resort) ──────────────────────────
async function askOpenRouter(messages: any[]): Promise<string> {
    const models = ['openai/gpt-oss-120b:free', 'nvidia/nemotron-3-super-120b-a12b:free']
    for (const key of OR_KEYS) {
        for (const model of models) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2000 }),
                })
                if (!res.ok) continue
                const data = await res.json()
                const reply = data.choices?.[0]?.message?.content ?? ''
                if (reply) return reply
            } catch { continue }
        }
    }
    return ''
}

// ── Main route ────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const body = await request.json() as {
            message: string
            history: ChatMessage[]
            image?: string
            pdfBase64?: string                // legacy single
            excelBase64?: string              // legacy single
            wordBase64?: string               // legacy single
            files?: Array<{ type: 'pdf' | 'excel' | 'word'; name: string; data: string }>
            customInstructions?: string
            tone?: string
            model?: string
        }
        const { message, history, image, pdfBase64, excelBase64, wordBase64, files, customInstructions, tone } = body

        if (!message?.trim() && !image && !pdfBase64 && !excelBase64 && !wordBase64) {
            return NextResponse.json({ error: 'Empty message' }, { status: 400 })
        }

        // ── Model selection ──────────────────────────────────────────────────
        // Vision auto-override: if image attached, force Vision regardless of selection
        let selectedModelId: ModelId = 'smart'
        let autoRoutedFrom: ModelId | null = null
        if (body.model && isValidModelId(body.model)) {
            selectedModelId = body.model as ModelId
        }
        // Auto mode: use the AI classifier (Cerebras Llama 8B, ~200ms) for
        // accurate routing that handles typos, paraphrases, novel phrasings,
        // and follow-up context ("create image" after a design description).
        // Falls back to regex if the classifier call fails.
        let autoRoutedToImage = false
        if (selectedModelId === 'auto' && !image) {
            autoRoutedFrom = 'auto'
            // Files attached means data extraction / analysis → always Smart,
            // never Coder. "Create table from these PDFs" is a SMART task.
            const hasFiles = Array.isArray(body.files) && body.files.length > 0
            if (hasFiles || pdfBase64 || excelBase64 || wordBase64) {
                selectedModelId = 'smart'
            } else {
                try {
                    const aiRouted = await classifyIntentAI(message ?? '', history ?? [])
                    if (aiRouted === 'image') {
                        autoRoutedToImage = true
                        selectedModelId = 'smart'
                    } else {
                        selectedModelId = aiRouted
                    }
                } catch {
                    selectedModelId = autoRouteIntent(message ?? '')
                }
            }
        }
        if (image) {
            selectedModelId = 'vision'
        }
        const selectedModel = getModel(selectedModelId)

        // ── Per-model quota check ────────────────────────────────────────────
        const today = new Date().toISOString().split('T')[0]
        const { data: usageRow } = await (supabaseAdmin as any)
            .from('ai_chat_usage')
            .select('count')
            .eq('user_id', user.id)
            .eq('date', today)
            .eq('model_id', selectedModelId)
            .maybeSingle()
        const currentCount = usageRow?.count ?? 0

        if (currentCount >= selectedModel.perUserDailyLimit) {
            return NextResponse.json({
                error: 'limit',
                reply: `You've used your daily ${selectedModel.name} limit (${selectedModel.perUserDailyLimit} messages). Try ⚡ Fast (unlimited) or wait until midnight.`,
                usage: currentCount,
                model: selectedModelId,
            })
        }

        // Increment per-model usage
        await (supabaseAdmin as any)
            .from('ai_chat_usage')
            .upsert(
                { user_id: user.id, date: today, model_id: selectedModelId, count: currentCount + 1 },
                { onConflict: 'user_id,date,model_id' }
            )

        // Log message event (fire-and-forget)
        logEvent({
            user_id: user.id,
            event_type: 'message',
            model_id: selectedModelId,
            status: 'started',
        })

        // ── Extract content from ALL attached files ──────────────────────────
        // Supports both legacy single-file fields AND new files[] array (multi-file)
        let fileContext = ''
        let fileLabel = ''
        const allFiles: Array<{ type: 'pdf' | 'excel' | 'word'; name: string; data: string }> = []
        if (Array.isArray(files)) allFiles.push(...files)
        if (pdfBase64)   allFiles.push({ type: 'pdf',   name: 'document.pdf',  data: pdfBase64 })
        if (excelBase64) allFiles.push({ type: 'excel', name: 'sheet.xlsx',    data: excelBase64 })
        if (wordBase64)  allFiles.push({ type: 'word',  name: 'document.docx', data: wordBase64 })

        if (allFiles.length > 0) {
            const sections: string[] = []
            // Per-file budget — scale with file count. For many small files
            // (invoices, receipts) we want 5-8K each; for a few big files we
            // want more. Total budget up to 80K chars (Kimi K2 handles 128K ctx).
            const totalBudget = 80000
            const perFileLimit = Math.min(Math.floor(totalBudget / allFiles.length), 10000)
            for (let i = 0; i < allFiles.length; i++) {
                const f = allFiles[i] as any
                let extracted = ''
                try {
                    // Fast path: text was pre-extracted at upload time (R2 flow)
                    if (typeof f.text === 'string' && f.text.length > 0) {
                        extracted = f.text
                    }
                    // Slow path: still got base64 from client — extract now
                    else if (typeof f.data === 'string' && f.data.length > 0) {
                        if (f.type === 'pdf')   extracted = await extractPdf(f.data)
                        if (f.type === 'excel') extracted = await extractExcel(f.data)
                        if (f.type === 'word')  extracted = await extractWord(f.data)
                    }
                    // Edge case: neither text nor data — attachment uploaded but text wasn't cached
                    else {
                        extracted = `[Attachment ${f.name} has no extracted text available.]`
                    }
                } catch (e: any) {
                    extracted = `[Could not read this file: ${e?.message?.slice(0, 100) ?? 'unknown error'}]`
                }
                const trimmed = extracted.slice(0, perFileLimit)
                sections.push(`══════════ FILE ${i + 1} of ${allFiles.length}: ${f.name} (${f.type.toUpperCase()}) ══════════\n${trimmed}`)
            }
            fileContext = sections.join('\n\n')
            fileLabel = allFiles.length === 1
                ? `${allFiles[0].type === 'pdf' ? 'PDF' : allFiles[0].type === 'excel' ? 'Excel' : 'Word'} document`
                : `${allFiles.length} attached files`
        }

        // Nexus data injection (only for plain-text messages, not file uploads)
        let nexusContext = ''
        if (!fileContext && !image && message?.trim()) {
            const nexusIntent = detectNexusIntent(message)
            if (nexusIntent) {
                nexusContext = await fetchNexusData(user.id, nexusIntent)
            }
        }

        let fullMessage = message || ''
        if (fileContext) {
            const fileCount = allFiles.length
            const fileNames = allFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
            const instruction = fileCount > 1
                ? `[CRITICAL INSTRUCTION — ${fileCount} FILES ATTACHED]

You have been given ${fileCount} separate files. You MUST include information from EVERY file in your answer — none must be dropped, skipped, or summarised as "etc.". If the user asked for a table, it MUST have exactly ${fileCount} rows (one per file) unless the user explicitly asks for fewer.

Files you are receiving (in order):
${fileNames}

If you find yourself writing fewer than ${fileCount} rows/entries, STOP and re-read all the FILE markers below. Cross-check against the list above before responding. If any file is empty or unreadable, still include a row with "[unreadable]" — do NOT silently omit it.`
                : `[${fileLabel} content below]`
            fullMessage = `${instruction}\n\n${fileContext}\n\n[User's question]: ${message || `Please analyse all ${fileCount > 1 ? fileCount + ' attached files' : 'this ' + fileLabel}.`}`
        }
        if (nexusContext) {
            fullMessage = `[Real-time data from Nexus — use this to answer the question accurately]\n${nexusContext}\n\n[User's question]: ${fullMessage || message}`
        }

        // Build message array — last 20 messages for context
        const userContent: any = image
            ? [{ type: 'text', text: fullMessage || 'What is this?' }, { type: 'image_url', image_url: { url: image } }]
            : fullMessage

        // Inject today's real date so the model knows what "now" means
        const nowDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        const dateContext = `\n\n**Current date and time (London):** ${nowDate}, ${nowTime}. Use this as the absolute source of truth for "today", "now", "this week", etc. — ignore any conflicting dates from your training data.`

        // Inject the exact knowledge cutoff AND the current underlying model
        const primaryBackend = selectedModel.cascade[0]?.model ?? 'proprietary AI'
        const friendlyBackend = (() => {
            const m = primaryBackend.toLowerCase()
            if (m.includes('gpt-oss-120b')) return 'GPT-OSS 120B by OpenAI'
            if (m.includes('gpt-oss-20b')) return 'GPT-OSS 20B by OpenAI'
            if (m.includes('qwen3')) return 'Qwen 3 32B by Alibaba'
            if (m.includes('llama-3.1-8b')) return 'Llama 3.1 8B Instant by Meta'
            if (m.includes('llama-3.3-70b')) return 'Llama 3.3 70B by Meta'
            if (m.includes('llama-4-scout')) return 'Llama 4 Scout 17B (vision) by Meta'
            if (m.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash with Google Search grounding'
            return primaryBackend
        })()
        const cutoffContext = `\n\n**CURRENT_MODEL:** ${friendlyBackend}\n**MODEL_CUTOFF:** ${selectedModel.cutoffDate}\nIf asked about your model or training, you may mention CURRENT_MODEL by name. For knowledge cutoff use the exact MODEL_CUTOFF value above — never guess.`

        // Fetch persistent memory for this user (ChatGPT-style memory across all chats)
        let memoryContext = ''
        try {
            const memories = await getUserMemories(user.id)
            if (memories.length > 0) {
                memoryContext = `\n\n**MEMORY (persistent facts you know about this user from past conversations):**\n${memories.map((f, i) => `${i + 1}. ${f}`).join('\n')}\nUse these facts naturally — don't list them back unless asked. If a fact is relevant, weave it in.`
            }
        } catch { /* memory fetch failed — continue without it */ }

        let systemContent = customInstructions?.trim()
            ? `${SYSTEM_PROMPT}${dateContext}${cutoffContext}${memoryContext}\n\n**User's custom instructions (always follow these):**\n${customInstructions.trim()}`
            : `${SYSTEM_PROMPT}${dateContext}${cutoffContext}${memoryContext}`

        const toneMap: Record<string, string> = {
            professional: 'Respond in a professional, polished tone.',
            formal: 'Respond in a formal, official tone — suitable for business correspondence.',
            friendly: 'Respond in a warm, friendly, conversational tone.',
            concise: 'Be brief and to the point. No padding, no filler.',
        }
        if (tone && toneMap[tone]) {
            systemContent += `\n\n**Tone instruction:** ${toneMap[tone]}`
        }

        const messages: any[] = [
            { role: 'system', content: systemContent },
            ...(history ?? []).slice(-50).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userContent },
        ]

        // ── Live data tools — inject real-time data into context ──────────
        // These fire BEFORE the model cascade so the AI can format the data naturally.
        const lowerMsg = (message ?? '').toLowerCase()
        let toolData = ''
        try {
            // Exchange rates
            if (/\b(exchange rate|currency|convert|gbp to|usd to|eur to|how much is .+ in|£.+to|\bfx\b|forex)\b/i.test(lowerMsg)) {
                // Check for specific conversion: "convert 500 GBP to EUR"
                const convMatch = lowerMsg.match(/(?:convert\s+)?(\d[\d,.]*)\s*([a-z]{3})\s+(?:to|in|into)\s+([a-z]{3})/i)
                if (convMatch) {
                    toolData += '\n\n' + await convertCurrency(parseFloat(convMatch[1].replace(/,/g, '')), convMatch[2], convMatch[3])
                } else {
                    toolData += '\n\n' + await getExchangeRates()
                }
            }
            // Weather
            if (/\b(weather|temperature|forecast|rain|sunny|cloudy|wind|humidity|umbrella|cold|hot|warm)\b/i.test(lowerMsg)) {
                // Extract location — "weather in London" or "London weather" or just "weather" (default London)
                const locMatch = lowerMsg.match(/weather\s+(?:in|for|at)\s+([a-z\s]+?)(?:\?|$|today|tomorrow|now)/i)
                    ?? lowerMsg.match(/([a-z\s]+?)\s+weather/i)
                const location = locMatch?.[1]?.trim() || 'London'
                toolData += '\n\n' + await getWeather(location)
            }
            // Container tracking — only trigger if a real container number is present
            // Container numbers: 4 letters (usually ending U) + 7 digits, e.g. MSCU1234567, TGBU6512798
            {
                const containerMatch = (message ?? '').match(/\b([A-Z]{3}U\d{7})\b/i)
                    ?? (message ?? '').match(/\b([A-Z]{4}\d{7})\b/i)
                if (containerMatch) {
                    toolData += '\n\n' + await getTrackingLinks(containerMatch[1] ?? containerMatch[0])
                }
            }
        } catch { /* tool errors shouldn't block the chat */ }

        // If tools returned data, inject it into the user message so the model can format it
        if (toolData) {
            const lastIdx = messages.length - 1
            messages[lastIdx] = {
                role: 'user',
                content: `${messages[lastIdx].content}\n\n**[Live data retrieved — use this to answer the question:]**${toolData}`
            }
        }

        // Intent (only check on plain text messages)
        const wantsImage  = !image && !fileContext && (autoRoutedToImage || detectImageIntent(message))
        // Search intent only matters when not on Live mode (Live always grounds)
        const wantsSearch = !fileContext && selectedModelId !== 'live' && detectSearchIntent(message)
        const newCount    = currentCount + 1

        // ── SSE stream ─────────────────────────────────────────────────────────
        const encoder = new TextEncoder()
        const send = (controller: ReadableStreamDefaultController, obj: object) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        const stream = new ReadableStream({
            async start(controller) {
                let lastTokensOut: number | undefined
                try {
                    // Tell the frontend which model the auto-router picked, so the UI can show it
                    if (autoRoutedFrom) {
                        send(controller, { type: 'auto_routed', to: selectedModelId, label: selectedModel.name + ' ' + selectedModel.emoji })
                    }
                    if (wantsImage) {
                        // Guard: if CF is not configured at all, say so clearly
                        if (CF_PAIRS.length === 0) {
                            send(controller, { type: 'token', text: "Image generation isn't configured yet — no Cloudflare accounts set up. Tell Sai to add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN." })
                        } else {
                            const imagePrompt = await buildImagePromptFromContext(message ?? '', history ?? [])
                            // If the prompt is too short/ambiguous to produce a meaningful image,
                            // clarify rather than generate random art (respects SYSTEM_PROMPT protocol)
                            if (!imagePrompt || imagePrompt.trim().split(/\s+/).length < 3) {
                                send(controller, {
                                    type: 'token',
                                    text: "Happy to create an image — what would you like?\n\n1. What's the subject? (logo, portrait, landscape, moodboard, product shot…)\n2. What style? (photoreal, illustration, watercolour, minimalist…)\n3. Colours or mood? (burgundy and cream, moody, airy and bright…)\n\nReply with a short description and I'll render it.",
                                })
                            } else {
                                const result = await generateImageDirect(imagePrompt)
                                if (result) {
                                    send(controller, { type: 'image', url: result.dataUrl, source: result.source })
                                    // Use a deterministic friendly caption — no LLM call — so reasoning
                                    // tokens can NEVER leak into the user-facing text.
                                    const preview = imagePrompt.length > 90 ? imagePrompt.slice(0, 87) + '…' : imagePrompt
                                    send(controller, { type: 'token', text: `Here you go — rendered from: "${preview}". Want me to tweak anything?` })
                                } else {
                                    send(controller, { type: 'token', text: "All 4 free image engines are busy right now — try again in a minute, or reply with 'more tokens' for premium quality." })
                                }
                            }
                        }
                    }
                    else if (wantsSearch) {
                        // Search → re-ask with results
                        const results = await webSearch(message)
                        const searchMessages = [
                            ...messages,
                            { role: 'assistant', content: 'I searched the web for that.' },
                            { role: 'user', content: `Here are live search results:\n\n${results}\n\nUsing these results, answer the original question thoroughly. Include relevant facts and cite sources where available.` },
                        ]
                        const ok = await streamCascade(searchMessages, 2000, encoder, controller)
                        if (!ok) send(controller, { type: 'token', text: `Here's what I found:\n\n${results}` })
                    }
                    else if (image) {
                        // Vision — use vision model directly (no streaming)
                        let reply = ''
                        let keyIdx = 0
                        for (const key of GROQ_KEYS) {
                            keyIdx++
                            try {
                                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                                    body: JSON.stringify({ model: MODEL_VISION, messages, temperature: 0.7, max_tokens: 2000 }),
                                })
                                if (res.status === 429) {
                                    logEvent({ user_id: user.id, event_type: 'rate_limit', model_id: 'vision', backend: MODEL_VISION, key_index: keyIdx, status: '429' })
                                    continue
                                }
                                if (!res.ok) continue
                                const data = await res.json()
                                reply = data.choices?.[0]?.message?.content ?? ''
                                if (reply) {
                                    logEvent({ user_id: user.id, event_type: 'message', model_id: 'vision', backend: MODEL_VISION, key_index: keyIdx, status: 'success' })
                                    break
                                }
                            } catch { continue }
                        }
                        send(controller, { type: 'token', text: reply || 'Could not analyse this image — please try again.' })
                    }
                    else if (selectedModelId === 'live') {
                        // Live mode → Gemini 2.5 Flash with Google Search grounding
                        const result = await streamFromGeminiGrounded(messages, encoder, controller, user.id)
                        if (result.ok) {
                            // Append source citations if Gemini returned grounding sources
                            if (result.sources && result.sources.length > 0) {
                                const sourcesText = '\n\n---\n**Sources:**\n' + result.sources
                                    .slice(0, 5)
                                    .map((s: any, i: number) => `${i + 1}. [${s.title || s.uri}](${s.uri})`)
                                    .join('\n')
                                send(controller, { type: 'token', text: sourcesText })
                            }
                            logEvent({ user_id: user.id, event_type: 'message', model_id: 'live', backend: 'gemini-2.5-flash', status: 'success', latency_ms: result.latencyMs })
                        } else {
                            // Live mode failed — rescue with Tavily + Kimi
                            logEvent({ user_id: user.id, event_type: 'fallback', model_id: 'live', status: 'gemini_failed' })
                            const results = await webSearch(message)
                            const searchMessages = [
                                ...messages,
                                { role: 'assistant', content: 'I searched the web for that.' },
                                { role: 'user', content: `Here are live search results:\n\n${results}\n\nUsing these results, answer the original question thoroughly. Cite sources where available.` },
                            ]
                            await streamFromGroqModels(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'], searchMessages, 2000, encoder, controller, user.id, 'live')
                        }
                    }
                    else {
                        // Other models: route through the full cascade (Groq + Cerebras + SambaNova + OR :free)
                        const cascadeResult = await tryCascade(
                            selectedModel.cascade.map(c => ({ provider: c.provider, model: c.model, label: c.label })),
                            messages,
                            4000,
                            encoder,
                            controller,
                            user.id,
                            selectedModelId
                        )
                        if (cascadeResult.ok) {
                            logEvent({ user_id: user.id, event_type: 'message', model_id: selectedModelId, backend: cascadeResult.label ?? cascadeResult.backend, status: 'success', latency_ms: cascadeResult.latencyMs, tokens_out: cascadeResult.tokensOut })
                            lastTokensOut = cascadeResult.tokensOut
                        } else {
                            logEvent({ user_id: user.id, event_type: 'fallback', model_id: selectedModelId, status: 'all_providers_failed' })
                            const reply = await askOpenRouter(messages)
                            send(controller, { type: 'token', text: reply || `All ${selectedModel.cascade.length} ${selectedModel.name} engines are rate-limited right now. Try **⚡ Fast** mode (unlimited) or wait a minute and retry.` })
                        }
                    }
                } catch (err: any) {
                    console.error('[AI Stream]', err.message)
                    logEvent({ user_id: user.id, event_type: 'error', model_id: selectedModelId, status: 'exception', meta: { msg: err?.message?.slice(0, 200) } })
                    send(controller, { type: 'token', text: 'Something went wrong — please try again.' })
                }

                send(controller, { type: 'done', usage: newCount, model: selectedModelId, tokensOut: lastTokensOut })
                controller.close()
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
            },
        })
    } catch (err: any) {
        console.error('[AI Chat]', err.message)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
