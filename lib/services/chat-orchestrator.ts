/**
 * Chat orchestrator — the main coordination logic for AI chat requests.
 *
 * Receives a parsed, authenticated request and coordinates:
 *   - Intent routing (which model/mode to use)
 *   - File attachment extraction
 *   - Quota checking
 *   - Message construction (system prompt, history, tools, context)
 *   - Streaming response via the appropriate pipeline
 *
 * Returns a ReadableStream of SSE events.
 */

import { getModel, MODELS, type ModelId } from '@/lib/ai-models'
import { providerAvailable } from '@/lib/providers/registry'
import { getUserMemories } from '@/lib/repositories/memories'
import { wrapMemories } from '@/lib/prompts/sanitize'
import { runTools, formatToolResults } from '@/lib/tools/run'
import { logEvent } from './event-logger'
import { tryPluginAutoRoute } from './plugin-autorouter'
import { resolveIntent, detectImageIntent, detectSearchIntent, buildImagePromptFromContext } from './intent-router'
import { extractAttachments, buildFileMessage } from './attachment-extractor'
import { checkQuota, incrementQuota } from './quota-service'
import { runWebSearch } from './search-service'
import { isImageConfigured, generateImageDirect } from './image-service'
import {
    send,
    tryFailover,
    streamFailover,
    streamFromGeminiGrounded,
    askOpenRouter,
    askVision,
} from './streaming-service'

// ── System prompt ───────────────────────────────────────────────────────────
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'SarmaLink-AI'
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Your Company'

const SYSTEM_PROMPT = `You are ${APP_NAME} — a sharp, capable AI assistant built for ${COMPANY_NAME}. You think clearly, write brilliantly, and give genuinely useful answers. You're like the smartest colleague in the room: direct, knowledgeable, and always helpful.

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
- I was built and integrated by **${APP_NAME}** for ${COMPANY_NAME}.
- The underlying model currently serving you is injected below as CURRENT_MODEL.
- My knowledge cutoff is injected below as MODEL_CUTOFF — use that EXACT value, never guess.
- Acceptable answer format: "I'm currently running on [CURRENT_MODEL], powered by ${APP_NAME}. My knowledge cutoff is [MODEL_CUTOFF]. For anything more recent, ask me to search the web."
- It IS okay to mention the specific underlying model when asked.
- Your internal reasoning (the part inside <think> tags) should sound natural and direct — do NOT mention "developer instructions", "system prompt", "I was told", or quote your own rules. Reason like the AI itself, not like someone following orders.

**Identity:**
- You were designed and built by ${APP_NAME}
- You run on ${APP_NAME} AI models
- Never mention Groq, OpenRouter, Llama, Gemini, GPT, Kimi, Moonshot, or any third-party AI provider

Today's context: You are assisting users at ${COMPANY_NAME}. Powered by ${APP_NAME} — open-source multi-provider AI assistant by Sarma Linux (sarmalinux.com).`

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export interface ChatRequestBody {
    message: string
    history: ChatMessage[]
    image?: string
    pdfBase64?: string
    excelBase64?: string
    wordBase64?: string
    files?: Array<{ type: 'pdf' | 'excel' | 'word'; name: string; data: string }>
    customInstructions?: string
    tone?: string
    model?: string
}

// Re-export logEvent so existing imports from chat-orchestrator still work
export { logEvent } from './event-logger'

/**
 * Build the full system content string with date, model info, memory, tone.
 */
function buildSystemContent(
    selectedModel: ReturnType<typeof getModel>,
    customInstructions?: string,
    tone?: string,
    memoryContext?: string,
): string {
    const nowDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const dateContext = `\n\n**Current date and time (London):** ${nowDate}, ${nowTime}. Use this as the absolute source of truth for "today", "now", "this week", etc. — ignore any conflicting dates from your training data.`

    const primaryBackend = selectedModel.failover[0]?.model ?? 'proprietary AI'
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

    let systemContent = customInstructions?.trim()
        ? `${SYSTEM_PROMPT}${dateContext}${cutoffContext}${memoryContext || ''}\n\n**User's custom instructions (always follow these):**\n${customInstructions.trim()}`
        : `${SYSTEM_PROMPT}${dateContext}${cutoffContext}${memoryContext || ''}`

    const toneMap: Record<string, string> = {
        professional: 'Respond in a professional, polished tone.',
        formal: 'Respond in a formal, official tone — suitable for business correspondence.',
        friendly: 'Respond in a warm, friendly, conversational tone.',
        concise: 'Be brief and to the point. No padding, no filler.',
    }
    if (tone && toneMap[tone]) {
        systemContent += `\n\n**Tone instruction:** ${toneMap[tone]}`
    }

    return systemContent
}

/**
 * Main orchestration entry point.
 *
 * Coordinates intent routing, quota checks, file extraction, message
 * building, and streaming response. Returns a Response with SSE headers.
 */
export async function orchestrateChat(
    userId: string,
    body: ChatRequestBody,
): Promise<Response> {
    const { message, history, image, pdfBase64, excelBase64, wordBase64, files, customInstructions, tone } = body

    // ── Intent routing ──────────────────────────────────────────────────
    const hasFiles = (Array.isArray(files) && files.length > 0) || !!pdfBase64 || !!excelBase64 || !!wordBase64
    const { selectedModelId, autoRoutedFrom, autoRoutedToImage } = await resolveIntent({
        requestedModel: body.model,
        message: message ?? '',
        history: history ?? [],
        hasImage: !!image,
        hasFiles,
    })
    const selectedModel = getModel(selectedModelId)

    // ── Plugin auto-routing (opt-in via ENABLE_PLUGIN_AUTOROUTE=true) ───
    // Runs before quota check and LLM path. If a plugin handles the message,
    // return its response immediately as a plain JSON reply.
    if (!image && !hasFiles) {
        const autoRoute = await tryPluginAutoRoute(message ?? '')
        if (autoRoute.matched) {
            logEvent({
                user_id: userId,
                event_type: 'plugin_autoroute',
                backend: autoRoute.pluginId,
                status: 'success',
                meta: { intent: autoRoute.intent },
            }).catch(() => { /* non-critical */ })
            return Response.json({
                reply: autoRoute.reply,
                autoRouted: true,
                pluginId: autoRoute.pluginId,
                intent: autoRoute.intent,
            })
        }
    }

    // ── Provider availability check ───────────────────────────────────
    // If the selected mode requires providers that have zero keys configured,
    // return a helpful error instead of silently failing downstream.
    if (selectedModelId !== 'auto') {
        const failoverProviders = new Set(selectedModel.failover.map(s => s.provider))
        const hasAnyProvider = [...failoverProviders].some(p => providerAvailable(p))
        if (!hasAnyProvider) {
            const primaryProvider = selectedModel.failover[0]?.provider ?? 'unknown'
            const providerDisplayNames: Record<string, string> = {
                'groq': 'Groq',
                'sambanova': 'SambaNova',
                'cerebras': 'Cerebras',
                'gemini-grounded': 'Google Gemini',
                'openrouter': 'OpenRouter',
                'openrouter-free': 'OpenRouter',
            }
            const providerEnvVars: Record<string, string> = {
                'groq': 'GROQ_API_KEY',
                'sambanova': 'SAMBANOVA_API_KEY',
                'cerebras': 'CEREBRAS_API_KEY',
                'gemini-grounded': 'GOOGLE_GEMINI_API_KEY',
                'openrouter': 'OPENROUTER_API_KEY',
                'openrouter-free': 'OPENROUTER_API_KEY',
            }
            const displayName = providerDisplayNames[primaryProvider] ?? primaryProvider
            const envVar = providerEnvVars[primaryProvider] ?? `${primaryProvider.toUpperCase()}_API_KEY`
            return Response.json({
                error: 'provider_not_configured',
                reply: `${selectedModel.name} mode requires a ${displayName} API key. Add ${envVar} to your environment variables to enable this mode.`,
                mode: selectedModelId,
                requiredProvider: primaryProvider.replace('-grounded', ''),
            })
        }
    }

    // ── Quota check ─────────────────────────────────────────────────────
    const quota = await checkQuota(userId, selectedModelId, selectedModel)
    if (!quota.allowed) {
        return Response.json(quota.errorBody)
    }
    await incrementQuota(userId, selectedModelId, quota.currentCount)

    // Log message event (fire-and-forget)
    logEvent({ user_id: userId, event_type: 'message', model_id: selectedModelId, status: 'started' })

    // ── Extract file attachments ────────────────────────────────────────
    const attachment = await extractAttachments({ files, pdfBase64, excelBase64, wordBase64 })
    const fullMessage = buildFileMessage(message || '', attachment)

    // ── Build message array ─────────────────────────────────────────────
    const userContent: any = image
        ? [{ type: 'text', text: fullMessage || 'What is this?' }, { type: 'image_url', image_url: { url: image } }]
        : fullMessage

    // Fetch persistent memory
    let memoryContext = ''
    try {
        const memories = await getUserMemories(userId)
        memoryContext = wrapMemories(memories)
    } catch { /* memory fetch failed — continue without it */ }

    const systemContent = buildSystemContent(selectedModel, customInstructions, tone, memoryContext)

    const messages: any[] = [
        { role: 'system', content: systemContent },
        ...(history ?? []).slice(-50).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
    ]

    // ── Live data tools ─────────────────────────────────────────────────
    // Tool failures no longer die silently: every error routes through
    // logEvent() so the /api/admin/health endpoint can surface revoked
    // keys and upstream outages.
    const toolResults = await runTools(message ?? '', {
        onFailure: ({ tool, label, reason, message: errMsg }) => {
            logEvent({
                user_id: userId,
                event_type: 'error',
                backend: `tool:${tool}`,
                status: reason,
                meta: { label, error: errMsg },
            }).catch(() => { /* logging must never throw */ })
        },
    })
    const toolData = formatToolResults(toolResults)
    if (toolData) {
        const lastIdx = messages.length - 1
        messages[lastIdx] = {
            role: 'user',
            content: `${messages[lastIdx].content}${toolData}\n\n[End of live data — use the above to answer the user's question accurately.]`
        }
    }

    // ── Detect side intents ─────────────────────────────────────────────
    const wantsImage  = !image && !attachment.fileContext && (autoRoutedToImage || detectImageIntent(message))
    const wantsSearch = !attachment.fileContext && selectedModelId !== 'live' && detectSearchIntent(message)
    const newCount    = quota.currentCount + 1

    // ── SSE stream ──────────────────────────────────────────────────────
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            let lastTokensOut: number | undefined
            try {
                // Tell the frontend which model the auto-router picked
                if (autoRoutedFrom) {
                    send(controller, encoder, { type: 'auto_routed', to: selectedModelId, label: selectedModel.name + ' ' + selectedModel.emoji })
                }

                if (wantsImage) {
                    if (!isImageConfigured()) {
                        send(controller, encoder, { type: 'token', text: "Image generation isn't configured yet — no Cloudflare accounts set up. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to your environment variables." })
                    } else {
                        const imagePrompt = await buildImagePromptFromContext(message ?? '', history ?? [])
                        if (!imagePrompt || imagePrompt.trim().split(/\s+/).length < 3) {
                            send(controller, encoder, {
                                type: 'token',
                                text: "Happy to create an image — what would you like?\n\n1. What's the subject? (logo, portrait, landscape, moodboard, product shot…)\n2. What style? (photoreal, illustration, watercolour, minimalist…)\n3. Colours or mood? (burgundy and cream, moody, airy and bright…)\n\nReply with a short description and I'll render it.",
                            })
                        } else {
                            const result = await generateImageDirect(imagePrompt)
                            if (result) {
                                send(controller, encoder, { type: 'image', url: result.dataUrl, source: result.source })
                                const preview = imagePrompt.length > 90 ? imagePrompt.slice(0, 87) + '…' : imagePrompt
                                send(controller, encoder, { type: 'token', text: `Here you go — rendered from: "${preview}". Want me to tweak anything?` })
                            } else {
                                send(controller, encoder, { type: 'token', text: "All 4 free image engines are busy right now — try again in a minute, or reply with 'more tokens' for premium quality." })
                            }
                        }
                    }
                }
                else if (wantsSearch) {
                    const results = await runWebSearch(message)
                    const searchMessages = [
                        ...messages,
                        { role: 'assistant', content: 'I searched the web for that.' },
                        { role: 'user', content: `Here are live search results:\n\n${results}\n\nUsing these results, answer the original question thoroughly. Include relevant facts and cite sources where available.` },
                    ]
                    const ok = await streamFailover(searchMessages, 2000, encoder, controller)
                    if (!ok) send(controller, encoder, { type: 'token', text: `Here's what I found:\n\n${results}` })
                }
                else if (image) {
                    const reply = await askVision(messages, userId)
                    send(controller, encoder, { type: 'token', text: reply || 'Could not analyse this image — please try again.' })
                }
                else if (selectedModelId === 'live') {
                    const result = await streamFromGeminiGrounded(messages, encoder, controller, userId)
                    if (result.ok) {
                        if (result.sources && result.sources.length > 0) {
                            const sourcesText = '\n\n---\n**Sources:**\n' + result.sources
                                .slice(0, 5)
                                .map((s: any, i: number) => `${i + 1}. [${s.title || s.uri}](${s.uri})`)
                                .join('\n')
                            send(controller, encoder, { type: 'token', text: sourcesText })
                        }
                        logEvent({ user_id: userId, event_type: 'message', model_id: 'live', backend: 'gemini-2.5-flash', status: 'success', latency_ms: result.latencyMs })
                    } else {
                        logEvent({ user_id: userId, event_type: 'fallback', model_id: 'live', status: 'gemini_failed' })
                        const results = await runWebSearch(message)
                        const searchMessages = [
                            ...messages,
                            { role: 'assistant', content: 'I searched the web for that.' },
                            { role: 'user', content: `Here are live search results:\n\n${results}\n\nUsing these results, answer the original question thoroughly. Cite sources where available.` },
                        ]
                        const { tryFailover: tryFailoverModule } = await import('@/lib/providers/failover')
                        const groqModels = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']
                        const failoverSteps = groqModels.map(m => ({ provider: 'groq' as const, model: m, label: `Groq ${m}` }))
                        await tryFailoverModule({
                            failover: failoverSteps,
                            messages: searchMessages,
                            maxTokens: 2000,
                            encoder,
                            controller,
                            userId,
                            selectedModel: 'live',
                            logEvent: (e) => { logEvent(e).catch(() => { }) },
                        })
                    }
                }
                else {
                    const failoverResult = await tryFailover(
                        selectedModel.failover.map(c => ({ provider: c.provider, model: c.model, label: c.label })),
                        messages,
                        4000,
                        encoder,
                        controller,
                        userId,
                        selectedModelId,
                    )
                    if (failoverResult.ok) {
                        logEvent({ user_id: userId, event_type: 'message', model_id: selectedModelId, backend: failoverResult.label ?? failoverResult.backend, status: 'success', latency_ms: failoverResult.latencyMs, tokens_out: failoverResult.tokensOut })
                        lastTokensOut = failoverResult.tokensOut
                    } else {
                        logEvent({ user_id: userId, event_type: 'fallback', model_id: selectedModelId, status: 'all_providers_failed' })
                        const reply = await askOpenRouter(messages)
                        send(controller, encoder, { type: 'token', text: reply || `All ${selectedModel.failover.length} ${selectedModel.name} engines are rate-limited right now. Try **⚡ Fast** mode (unlimited) or wait a minute and retry.` })
                    }
                }
            } catch (err: any) {
                console.error('[AI Stream]', err.message)
                logEvent({ user_id: userId, event_type: 'error', model_id: selectedModelId, status: 'exception', meta: { msg: err?.message?.slice(0, 200) } })
                send(controller, encoder, { type: 'token', text: 'Something went wrong — please try again.' })
            }

            send(controller, encoder, { type: 'done', usage: newCount, model: selectedModelId, tokensOut: lastTokensOut })
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
}
