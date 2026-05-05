/**
 * Plain JavaScript example — no SDK, just fetch + manual SSE parsing.
 *
 * Run:    node examples/javascript.js
 *
 * Useful when you do not want a dependency, or when you are calling from
 * an environment without a Node-friendly SDK (Cloudflare Workers, Deno,
 * Bun, the browser).
 */

const BASE_URL = process.env.SARMALINK_AI_URL ?? 'http://localhost:3000'
const API_KEY = process.env.SARMALINK_AI_KEY ?? 'sk-set-this'

async function nonStreaming() {
  console.log('── Non-streaming ──')
  const res = await fetch(`${BASE_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'smart',
      messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
    }),
  })
  const json = await res.json()
  console.log(json.choices[0]?.message?.content)
}

async function streaming() {
  console.log('\n── Streaming ──')
  const res = await fetch(`${BASE_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'smart',
      messages: [{ role: 'user', content: 'List three UK cities, one per line.' }],
      stream: true,
    }),
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames end with a blank line; data lines start with "data: ".
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) process.stdout.write(delta)
        } catch {
          // ignore non-JSON keep-alives
        }
      }
    }
  }
  console.log()
}

await nonStreaming()
await streaming()
