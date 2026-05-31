/**
 * Structured streaming protocol.
 *
 * Every SSE frame SarmaLink-AI emits is one of the typed events below. Until
 * now the event shapes lived as ad-hoc object literals scattered across the
 * orchestrator and failover runner, which meant a client integrating against
 * the stream had to reverse-engineer the contract from the source. This module
 * makes the contract explicit: a discriminated union, a serialiser that frames
 * an event as a `data: ...\n\n` line, and a parser that validates an incoming
 * frame back into a typed event (or rejects it).
 *
 * The protocol is additive and forwards-compatible. A client should ignore any
 * event whose `type` it does not recognise rather than erroring, so new event
 * types can ship without breaking existing consumers.
 *
 * Covered by `__tests__/streaming.test.ts`.
 */

/** Visible answer token. */
export interface TokenEvent { type: 'token'; text: string }
/** Reasoning token, separated so a UI can collapse it behind a toggle. */
export interface ThinkingEvent { type: 'thinking'; text: string }
/** Which backend engine served the turn. */
export interface BackendEvent { type: 'backend'; label: string }
/** The auto-router picked a mode different from the request. */
export interface AutoRoutedEvent { type: 'auto_routed'; to: string; label: string }
/** A generated or edited image. */
export interface ImageEvent { type: 'image'; url: string; source?: string }
/** Grounding sources for a Live-mode answer. */
export interface SourcesEvent { type: 'sources'; sources: Array<{ title?: string; uri: string }> }
/**
 * Token accounting for the turn, including prompt-cache hits. Emitted once,
 * just before `done`, so a dashboard can attribute cost accurately.
 */
export interface UsageEvent {
    type: 'usage'
    backend?: string
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
    cacheHit?: boolean
}
/** Terminal event. No further frames follow. */
export interface DoneEvent {
    type: 'done'
    usage?: number
    model?: string
    tokensOut?: number
}
/** A recoverable error surfaced to the client. */
export interface ErrorEvent { type: 'error'; message: string; code?: string }

export type StreamEvent =
    | TokenEvent
    | ThinkingEvent
    | BackendEvent
    | AutoRoutedEvent
    | ImageEvent
    | SourcesEvent
    | UsageEvent
    | DoneEvent
    | ErrorEvent

export const STREAM_EVENT_TYPES = [
    'token', 'thinking', 'backend', 'auto_routed', 'image', 'sources', 'usage', 'done', 'error',
] as const

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number]

/** Type guard: is this string a known event type? */
export function isKnownEventType(t: unknown): t is StreamEventType {
    return typeof t === 'string' && (STREAM_EVENT_TYPES as readonly string[]).includes(t)
}

/**
 * Serialise an event as an SSE frame: `data: <json>\n\n`.
 * Throws on an unknown event type so a bug never ships a malformed frame.
 */
export function serialiseEvent(event: StreamEvent): string {
    if (!isKnownEventType((event as { type?: unknown }).type)) {
        throw new Error(`unknown stream event type: ${String((event as { type?: unknown }).type)}`)
    }
    return `data: ${JSON.stringify(event)}\n\n`
}

/** Enqueue a typed event onto a stream controller. */
export function emit(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    event: StreamEvent,
): void {
    controller.enqueue(encoder.encode(serialiseEvent(event)))
}

export type ParseResult =
    | { ok: true; event: StreamEvent }
    | { ok: false; reason: string }

/**
 * Parse a single SSE `data:` line back into a typed event.
 * Returns `{ ok: false }` for the `[DONE]` sentinel, non-data lines, malformed
 * JSON, or an unrecognised event type, so callers can skip rather than throw.
 */
export function parseEventLine(line: string): ParseResult {
    if (!line.startsWith('data:')) return { ok: false, reason: 'not a data line' }
    const payload = line.slice(line.indexOf(':') + 1).trim()
    if (payload === '[DONE]' || payload === '') return { ok: false, reason: 'terminator' }
    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch {
        return { ok: false, reason: 'invalid json' }
    }
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'not an object' }
    const type = (parsed as { type?: unknown }).type
    if (!isKnownEventType(type)) return { ok: false, reason: `unknown type: ${String(type)}` }
    return { ok: true, event: parsed as StreamEvent }
}

/**
 * Read prompt-cache and token usage out of a provider's terminal SSE/JSON
 * payload, normalising the OpenAI-compatible and Anthropic shapes. Returns
 * undefined when the payload carries no usage block.
 */
export function readUsageFromProviderPayload(payload: unknown): UsageEvent | undefined {
    if (typeof payload !== 'object' || payload === null) return undefined
    const usage = (payload as { usage?: Record<string, unknown> }).usage
    if (!usage || typeof usage !== 'object') return undefined

    const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

    // OpenAI-compatible: usage.prompt_tokens_details.cached_tokens
    const details = (usage as { prompt_tokens_details?: Record<string, unknown> }).prompt_tokens_details
    const openAiCached = details ? num(details.cached_tokens) : undefined

    // Anthropic: usage.cache_read_input_tokens
    const anthropicCached = num((usage as Record<string, unknown>).cache_read_input_tokens)

    const cachedTokens = openAiCached ?? anthropicCached
    const promptTokens = num((usage as Record<string, unknown>).prompt_tokens)
        ?? num((usage as Record<string, unknown>).input_tokens)
    const completionTokens = num((usage as Record<string, unknown>).completion_tokens)
        ?? num((usage as Record<string, unknown>).output_tokens)

    if (cachedTokens === undefined && promptTokens === undefined && completionTokens === undefined) {
        return undefined
    }

    return {
        type: 'usage',
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheHit: typeof cachedTokens === 'number' && cachedTokens > 0,
    }
}
