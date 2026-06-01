/**
 * Multi-step agent runner.
 *
 * Decomposes a goal into a small plan, runs each step against the fast
 * tier, then synthesises the final answer. Streams Server-Sent Events.
 *
 * Hard caps:
 *  - 5 steps maximum
 *  - 60 seconds per worker call
 *  - One synthesiser call at the end
 *
 * Events emitted:
 *   step          { index, title }
 *   token         { index, text }
 *   step_done     { index, output }
 *   done          { summary }
 *   error         { message }
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const AgentInputSchema = z.object({
    goal: z.string().min(3).max(2000),
})
export type AgentInput = z.infer<typeof AgentInputSchema>

export const AgentEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('step'), index: z.number(), title: z.string() }),
    z.object({ type: z.literal('token'), index: z.number(), text: z.string() }),
    z.object({ type: z.literal('step_done'), index: z.number(), output: z.string() }),
    z.object({ type: z.literal('done'), summary: z.string() }),
    z.object({ type: z.literal('error'), message: z.string() }),
])
export type AgentEvent = z.infer<typeof AgentEventSchema>

const MAX_STEPS = 5
const WORKER_TIMEOUT_MS = 60_000

function pickGroqKey(): string | null {
    const keys = env().providers.groq
    if (!keys.length) return null
    return keys[Math.floor(Math.random() * keys.length)]
}

async function groqChat(messages: { role: string; content: string }[], maxTokens: number, timeoutMs: number): Promise<string> {
    const key = pickGroqKey()
    if (!key) throw new Error('no Groq key configured')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            max_tokens: maxTokens,
            temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`groq ${res.status}`)
    const data = await res.json()
    return String(data?.choices?.[0]?.message?.content ?? '')
}

async function plan(goal: string): Promise<string[]> {
    const out = await groqChat(
        [{
            role: 'user',
            content: `Decompose the goal below into at most ${MAX_STEPS} concrete sub-tasks. One per line. No numbering, no preamble.

Goal: ${goal}`,
        }],
        300,
        15_000,
    )
    return out
        .split('\n')
        .map((s) => s.replace(/^[\s\-\*\d\.\)]+/, '').trim())
        .filter((s) => s.length > 0)
        .slice(0, MAX_STEPS)
}

async function worker(goal: string, step: string, priorOutputs: string[]): Promise<string> {
    return groqChat(
        [{
            role: 'user',
            content: `Goal: ${goal}

Prior step outputs:
${priorOutputs.map((o, i) => `${i + 1}. ${o}`).join('\n') || '(none yet)'}

Current sub-task: ${step}

Produce the output for this sub-task. Be specific. No preamble.`,
        }],
        700,
        WORKER_TIMEOUT_MS,
    )
}

async function synthesise(goal: string, outputs: string[]): Promise<string> {
    return groqChat(
        [{
            role: 'user',
            content: `Goal: ${goal}

Sub-task outputs:
${outputs.map((o, i) => `Step ${i + 1}: ${o}`).join('\n\n')}

Write the final answer to the goal. Clear, concise, well structured.`,
        }],
        800,
        30_000,
    )
}

function sseLine(event: AgentEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Build a ReadableStream of SSE events for the supplied goal.
 */
export function runAgentSSE(input: AgentInput): ReadableStream<Uint8Array> {
    const parsed = AgentInputSchema.parse(input)
    const encoder = new TextEncoder()

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (ev: AgentEvent) => controller.enqueue(encoder.encode(sseLine(ev)))
            try {
                const steps = await plan(parsed.goal)
                if (!steps.length) {
                    send({ type: 'error', message: 'planner returned no steps' })
                    controller.close()
                    return
                }

                const outputs: string[] = []
                for (let i = 0; i < steps.length; i++) {
                    send({ type: 'step', index: i, title: steps[i] })
                    try {
                        const out = await worker(parsed.goal, steps[i], outputs)
                        // emit token chunks of approx 60 chars for streaming feel
                        for (let p = 0; p < out.length; p += 60) {
                            send({ type: 'token', index: i, text: out.slice(p, p + 60) })
                        }
                        outputs.push(out)
                        send({ type: 'step_done', index: i, output: out })
                    } catch (err) {
                        send({ type: 'error', message: `step ${i + 1}: ${(err as Error).message}` })
                        outputs.push('(step failed)')
                    }
                }

                const summary = await synthesise(parsed.goal, outputs)
                send({ type: 'done', summary })
            } catch (err) {
                send({ type: 'error', message: (err as Error).message })
            } finally {
                controller.close()
            }
        },
    })
}
