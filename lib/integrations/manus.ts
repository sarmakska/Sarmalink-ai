/**
 * Manus integration.
 *
 * Manus is an autonomous agent platform with a long-running task model.
 * Unlike a chat-completion provider, you submit a task and poll (or
 * receive a webhook) for the result. This module is the SarmaLink-AI
 * client for the Manus API.
 *
 * Set MANUS_API_KEY in env. Optionally MANUS_BASE_URL (defaults to the
 * public endpoint). Webhook callbacks should be terminated at
 * /api/v1/manus/webhook (handler in app/api/v1/manus/webhook/route.ts).
 */

const DEFAULT_BASE = 'https://api.manus.im/v1'

function baseUrl(): string {
  return process.env.MANUS_BASE_URL || DEFAULT_BASE
}

function authHeaders(): Record<string, string> {
  const key = process.env.MANUS_API_KEY
  if (!key) throw new Error('MANUS_API_KEY not set')
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
}

export interface ManusTaskInput {
  prompt: string
  files?: Array<{ name: string; url: string }>
  context?: Record<string, unknown>
  webhookUrl?: string
  budget?: { maxSteps?: number; maxUSD?: number }
  metadata?: Record<string, string>
}

export interface ManusTaskCreated {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
}

export interface ManusTaskResult {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  output?: string
  artifacts?: Array<{ name: string; url: string; mimeType: string }>
  steps?: Array<{ at: string; type: string; summary: string }>
  costUSD?: number
  error?: string
}

export async function createManusTask(input: ManusTaskInput): Promise<ManusTaskCreated> {
  const r = await fetch(`${baseUrl()}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(`Manus createTask ${r.status}: ${await r.text()}`)
  return r.json() as Promise<ManusTaskCreated>
}

export async function getManusTask(id: string): Promise<ManusTaskResult> {
  const r = await fetch(`${baseUrl()}/tasks/${encodeURIComponent(id)}`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`Manus getTask ${r.status}: ${await r.text()}`)
  return r.json() as Promise<ManusTaskResult>
}

export async function cancelManusTask(id: string): Promise<void> {
  const r = await fetch(`${baseUrl()}/tasks/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(`Manus cancelTask ${r.status}: ${await r.text()}`)
}

/**
 * Poll a task until it reaches a terminal state.
 * Use this only when you cannot register a webhook. Defaults: 2s interval,
 * 15 minute hard cap.
 */
export async function awaitManusTask(
  id: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ManusTaskResult> {
  const interval = opts.intervalMs ?? 2000
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60 * 1000)
  while (Date.now() < deadline) {
    const t = await getManusTask(id)
    if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') return t
    await new Promise(r => setTimeout(r, interval))
  }
  throw new Error(`Manus task ${id} did not finish before timeout`)
}
