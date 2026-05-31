/**
 * Fixture: an OpenAI-compatible SSE stream as Anthropic's compatibility
 * endpoint emits it for Opus 4.7, including a terminal usage block that
 * reports a prompt-cache read. Used by the end-to-end test to exercise the
 * full failover -> stream -> usage -> cost path without a live network call.
 */

export const ANTHROPIC_SSE_CHUNKS: string[] = [
    'data: {"choices":[{"delta":{"content":"The capital of "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"France is Paris."}}]}\n\n',
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":2000,"completion_tokens":8,"cache_read_input_tokens":1800}}\n\n',
    'data: [DONE]\n\n',
]

/** A long, stable system prompt so prompt caching engages (> 1024 chars). */
export const LONG_SYSTEM_PROMPT =
    'You are SarmaLink-AI, a sharp and capable assistant. ' +
    'Answer clearly, write well, and be direct. '.repeat(40)

export function anthropicSseBody(chunks: string[] = ANTHROPIC_SSE_CHUNKS): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c))
            controller.close()
        },
    })
}
