/**
 * Reasoning-leak stripper.
 *
 * Some models emit internal scratchpad content inside `<think>…</think>`
 * tags or as a chatty preamble before the real answer. This module strips
 * both, for both batched text and streamed chunks.
 *
 *   stripReasoning(text)     for a complete string
 *   createStreamStripper()   for token-by-token output; call .push(chunk)
 *                            and read the safe-to-emit text from the
 *                            returned value.
 */

const THINK_TAG = /<think>[\s\S]*?<\/think>/gi
const OPEN_TAG_TAIL = /<think>[\s\S]*$/i
const PREAMBLE_PATTERNS: RegExp[] = [
    /^okay,?\s+let\s+me\s+(?:think|tackle|work)[\s\S]*?(?=\n\n|$)/i,
    /^(?:hmm|alright|well|let'?s?\s+see),?\s+[\s\S]{0,400}\b(?:the\s+user|user\s+wants|user\s+is\s+asking)\b[\s\S]*?(?=\n\n|$)/i,
    /^the\s+user\s+(?:wants|is\s+asking|needs)[\s\S]*?(?=\n\n|$)/i,
    /^here'?s?\s+my\s+(?:reasoning|thinking|thought\s+process)[:\s][\s\S]*?(?=\n\n|$)/i,
    /^let\s+me\s+think[\s\S]*?(?=\n\n|$)/i,
]

export function stripReasoning(text: string): string {
    if (!text) return text
    let clean = text.replace(THINK_TAG, '').replace(OPEN_TAG_TAIL, '')
    for (const p of PREAMBLE_PATTERNS) clean = clean.replace(p, '')
    return clean.replace(/^\s*\n+/, '').trim()
}

export interface StreamStripper {
    push(chunk: string): string
    flush(): string
}

/**
 * Stateful stripper for streamed token output. Buffers anything inside an
 * open <think> block until the closing tag arrives (or stream ends).
 */
export function createStreamStripper(): StreamStripper {
    let buffer = ''
    let inThink = false

    return {
        push(chunk: string): string {
            buffer += chunk
            let out = ''
            while (buffer.length) {
                if (inThink) {
                    const close = buffer.search(/<\/think>/i)
                    if (close === -1) {
                        // Stay buffered; wait for close.
                        buffer = ''
                        return out
                    }
                    buffer = buffer.slice(close + '</think>'.length)
                    inThink = false
                    continue
                }
                const open = buffer.search(/<think>/i)
                if (open === -1) {
                    out += buffer
                    buffer = ''
                    return out
                }
                out += buffer.slice(0, open)
                buffer = buffer.slice(open + '<think>'.length)
                inThink = true
            }
            return out
        },
        flush(): string {
            const remainder = inThink ? '' : buffer
            buffer = ''
            inThink = false
            return stripReasoning(remainder)
        },
    }
}
