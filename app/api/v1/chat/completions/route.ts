/**
 * OpenAI-compatible proxy endpoint.
 *
 * Exposes SarmaLink-AI's failover engine at `/api/v1/chat/completions`
 * using the OpenAI chat-completions JSON contract, so third-party tools
 * (Cursor, VS Code AI plugins, AnythingLLM, etc.) can point at this
 * deployment as a drop-in replacement for `api.openai.com`.
 *
 * Opt-in via `ENABLE_OPENAI_PROXY=true`. When disabled the route returns
 * 404 so the endpoint is invisible in production unless explicitly
 * enabled. Any non-empty bearer token is accepted — protect the endpoint
 * behind a firewall or reverse-proxy layer for real auth.
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { MODELS } from '@/lib/ai-models'
import { tryFailover } from '@/lib/providers/failover'
import { logEvent } from '@/lib/services/event-logger'
import { mapOpenAIModelToMode, type OpenAIChatRequest } from '@/lib/openai-proxy/model-mapper'

/**
 * POST /api/v1/chat/completions — OpenAI-compatible chat proxy.
 */
export async function POST(request: Request) {
    // Feature flag: route does not exist unless explicitly enabled
    if (process.env.ENABLE_OPENAI_PROXY !== 'true') {
        return new NextResponse('Not Found', { status: 404 })
    }

    // Bearer auth — any non-empty token passes, but the `Bearer ` prefix is required
    const auth = request.headers.get('authorization') || request.headers.get('Authorization') || ''
    const match = auth.match(/^Bearer\s+(.+)$/i)
    const token = match ? match[1].trim() : ''
    if (!token) {
        return NextResponse.json(
            { error: { message: 'Missing bearer token', type: 'invalid_request_error', code: 'missing_auth' } },
            { status: 401 },
        )
    }

    let body: OpenAIChatRequest
    try {
        body = await request.json() as OpenAIChatRequest
    } catch {
        return NextResponse.json(
            { error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } },
            { status: 400 },
        )
    }

    const requestedModel = typeof body.model === 'string' && body.model ? body.model : 'gpt-4o'
    const messages = Array.isArray(body.messages) ? body.messages : []
    const streamRequested = body.stream !== false   // default true, matching OpenAI's most-common client usage
    const maxTokens = typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : 4000

    if (messages.length === 0) {
        return NextResponse.json(
            { error: { message: 'messages[] is required and must be non-empty', type: 'invalid_request_error', code: 'empty_messages' } },
            { status: 400 },
        )
    }

    const mode = mapOpenAIModelToMode(requestedModel)
    const selectedModel = MODELS[mode]
    const failoverSteps = selectedModel.failover.map(s => ({ provider: s.provider, model: s.model, label: s.label }))

    const chatId = `chatcmpl-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))}`
    const created = Math.floor(Date.now() / 1000)

    // Consume SarmaLink's internal SSE events from an inner stream, filter
    // thinking/backend events, re-emit token events in OpenAI chunk shape.
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    // Inner controller receives SarmaLink-native events produced by tryFailover
    let innerController: ReadableStreamDefaultController<Uint8Array>
    const innerStream = new ReadableStream<Uint8Array>({
        start(c) { innerController = c },
    })

    // Kick off the failover in the background; it writes tokens to innerController
    const failoverPromise = (async () => {
        try {
            const result = await tryFailover({
                failover: failoverSteps,
                messages,
                maxTokens,
                encoder,
                controller: innerController!,
                userId: `proxy:${token.slice(0, 8)}`,
                selectedModel: mode,
                logEvent: () => { /* proxy_request logged at end; skip internal per-key spam */ },
            })
            return result
        } finally {
            try { innerController!.close() } catch { /* already closed */ }
        }
    })()

    // Helper: walk the inner SSE stream, yield plain text tokens
    async function* readTokens(): AsyncGenerator<string> {
        const reader = innerStream.getReader()
        let buf = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                try {
                    const evt = JSON.parse(line.slice(6))
                    if (evt.type === 'token' && typeof evt.text === 'string') {
                        yield evt.text
                    }
                    // thinking/backend/done events are filtered out of the OpenAI response
                } catch { /* malformed event, skip */ }
            }
        }
    }

    // ── Streaming response ─────────────────────────────────────────────
    if (streamRequested) {
        const outStream = new ReadableStream<Uint8Array>({
            async start(controller) {
                let totalChars = 0
                let errorResult: { ok: boolean } | null = null
                let finalBackend = ''

                try {
                    for await (const text of readTokens()) {
                        totalChars += text.length
                        const chunk = {
                            id: chatId,
                            object: 'chat.completion.chunk',
                            created,
                            model: requestedModel,
                            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
                        }
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
                    }

                    const result = await failoverPromise
                    errorResult = result
                    finalBackend = result.label ?? result.backend ?? ''

                    if (!result.ok || totalChars === 0) {
                        // OpenAI clients treat a missing finish_reason + error shape poorly,
                        // so emit an error chunk and still terminate with [DONE].
                        const errChunk = {
                            id: chatId,
                            object: 'chat.completion.chunk',
                            created,
                            model: requestedModel,
                            choices: [{
                                index: 0,
                                delta: { content: '' },
                                finish_reason: 'stop',
                            }],
                            error: {
                                message: 'All providers exhausted',
                                type: 'service_unavailable',
                                code: 'provider_exhausted',
                            },
                        }
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`))
                    } else {
                        const finalChunk = {
                            id: chatId,
                            object: 'chat.completion.chunk',
                            created,
                            model: requestedModel,
                            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                        }
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`))
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                } catch (err: any) {
                    console.error('[OpenAI Proxy Stream]', err?.message)
                    const errChunk = {
                        id: chatId,
                        object: 'chat.completion.chunk',
                        created,
                        model: requestedModel,
                        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
                        error: {
                            message: 'Internal proxy error',
                            type: 'server_error',
                            code: 'internal_error',
                        },
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`))
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                } finally {
                    controller.close()
                    // Fire-and-forget logging — never let it break the response
                    logEvent({
                        event_type: 'proxy_request',
                        model_id: mode,
                        backend: finalBackend || requestedModel,
                        status: errorResult?.ok ? 'success' : 'provider_exhausted',
                        tokens_out: Math.ceil(totalChars / 4),
                        meta: { requested_model: requestedModel, stream: true },
                    }).catch(() => { /* swallow */ })
                }
            },
        })

        return new Response(outStream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
            },
        })
    }

    // ── Non-streaming response ─────────────────────────────────────────
    let full = ''
    for await (const text of readTokens()) full += text
    const result = await failoverPromise

    if (!result.ok || full.length === 0) {
        logEvent({
            event_type: 'proxy_request',
            model_id: mode,
            backend: requestedModel,
            status: 'provider_exhausted',
            meta: { requested_model: requestedModel, stream: false },
        }).catch(() => { /* swallow */ })
        return NextResponse.json(
            { error: { message: 'All providers exhausted', type: 'service_unavailable', code: 'provider_exhausted' } },
            { status: 503 },
        )
    }

    const totalChars = full.length
    const completionTokens = Math.ceil(totalChars / 4)
    logEvent({
        event_type: 'proxy_request',
        model_id: mode,
        backend: result.label ?? result.backend ?? requestedModel,
        status: 'success',
        tokens_out: completionTokens,
        latency_ms: result.latencyMs,
        meta: { requested_model: requestedModel, stream: false },
    }).catch(() => { /* swallow */ })

    return NextResponse.json({
        id: chatId,
        object: 'chat.completion',
        created,
        model: requestedModel,
        choices: [{
            index: 0,
            message: { role: 'assistant', content: full },
            finish_reason: 'stop',
        }],
        usage: {
            prompt_tokens: 0,
            completion_tokens: completionTokens,
            total_tokens: completionTokens,
        },
    })
}
