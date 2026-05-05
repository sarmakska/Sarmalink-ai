/**
 * TypeScript / Node example — uses the official `openai` SDK.
 *
 * Install:    npm install openai
 * Run:        npx tsx examples/typescript.ts
 *
 * The trick: every OpenAI-compatible SDK accepts a custom baseURL.
 * Point it at your SarmaLink-AI deployment and your existing code keeps working.
 */

import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: `${process.env.SARMALINK_AI_URL ?? 'http://localhost:3000'}/api/v1`,
  apiKey: process.env.SARMALINK_AI_KEY ?? 'sk-set-this',
})

async function nonStreaming() {
  console.log('── Non-streaming ──')
  const completion = await client.chat.completions.create({
    model: 'smart',
    messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
  })
  console.log(completion.choices[0]?.message?.content)
}

async function streaming() {
  console.log('\n── Streaming ──')
  const stream = await client.chat.completions.create({
    model: 'smart',
    messages: [{ role: 'user', content: 'List three UK cities, one per line.' }],
    stream: true,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) process.stdout.write(delta)
  }
  console.log()
}

await nonStreaming()
await streaming()
