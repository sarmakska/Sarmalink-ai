export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Image generation is 100% free — OpenRouter $5 image credit was refunded on
// 2026-04-16. FLUX.2 klein (9B/4B) is the new flagship — sharper, better
// prompt adherence than FLUX.1-schnell. Cascade: 9B → 4B → flux-1-schnell.

type ImgOut = { dataUrl: string; mimeType: string; source: string; paid: boolean }

const CF_PAIRS: { accountId: string; token: string }[] = [
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', token: process.env.CLOUDFLARE_API_TOKEN ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_2 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_3 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_3 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_4 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_4 ?? '' },
].filter(p => p.accountId && p.token)

async function generateViaFluxKlein(
    pair: { accountId: string; token: string },
    model: '@cf/black-forest-labs/flux-2-klein-9b' | '@cf/black-forest-labs/flux-2-klein-4b',
    prompt: string,
): Promise<ImgOut | null> {
    try {
        const fd = new FormData()
        fd.append('prompt', prompt)
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/${model}`,
            { method: 'POST', headers: { Authorization: `Bearer ${pair.token}` }, body: fd as any },
        )
        if (!res.ok) return null
        const data = await res.json().catch(() => null) as any
        const b64 = data?.result?.image
        if (typeof b64 !== 'string' || b64.length < 200) return null
        return {
            dataUrl: `data:image/png;base64,${b64}`,
            mimeType: 'image/png',
            source: `Cloudflare FLUX.2 klein ${model.endsWith('9b') ? '9B' : '4B'} (free)`,
            paid: false,
        }
    } catch { return null }
}

async function generateViaFluxSchnell(
    pair: { accountId: string; token: string },
    prompt: string,
): Promise<ImgOut | null> {
    try {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${pair.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, steps: 8 }),
            },
        )
        if (!res.ok) return null
        const data = await res.json().catch(() => null) as any
        const b64 = data?.result?.image
        if (typeof b64 !== 'string' || b64.length < 100) return null
        return {
            dataUrl: `data:image/png;base64,${b64}`,
            mimeType: 'image/png',
            source: 'Cloudflare FLUX.1-schnell (free)',
            paid: false,
        }
    } catch { return null }
}

async function generatePollinations(prompt: string, seed: number): Promise<ImgOut | null> {
    try {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (!res.ok) return null
        const buffer = await res.arrayBuffer()
        if (buffer.byteLength < 2000) return null
        return {
            dataUrl: `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`,
            mimeType: 'image/jpeg',
            source: 'Pollinations Flux (free)',
            paid: false,
        }
    } catch { return null }
}

async function generateFree(prompt: string, seed: number): Promise<ImgOut | null> {
    for (const pair of CF_PAIRS) {
        const klein9 = await generateViaFluxKlein(pair, '@cf/black-forest-labs/flux-2-klein-9b', prompt)
        if (klein9) return klein9
        const klein4 = await generateViaFluxKlein(pair, '@cf/black-forest-labs/flux-2-klein-4b', prompt)
        if (klein4) return klein4
        const schnell = await generateViaFluxSchnell(pair, prompt)
        if (schnell) return schnell
    }
    return await generatePollinations(prompt, seed)
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { prompt, count = 1 } = await req.json().catch(() => ({}))
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
            return NextResponse.json({ error: 'Please enter a prompt' }, { status: 400 })
        }

        if (CF_PAIRS.length === 0) {
            return NextResponse.json({ error: 'Image generation isn\'t configured — no Cloudflare accounts set up.' }, { status: 503 })
        }

        const n = Math.min(Math.max(parseInt(String(count), 10) || 1, 1), 10)
        const trimmedPrompt = prompt.trim()
        let modelUsed = ''

        async function attemptOnce(seed: number): Promise<ImgOut | null> {
            const result = await generateFree(trimmedPrompt, seed)
            if (result) {
                modelUsed = result.source
                return result
            }
            return null
        }

        // Fire N attempts in parallel — 10 images in ~6s instead of ~60s.
        const seedBase = Date.now() % 1_000_000
        const results = await Promise.all(
            Array.from({ length: n }, (_, i) => attemptOnce(seedBase + i * 17))
        )
        const images: ImgOut[] = results.filter((r): r is ImgOut => r !== null)

        if (!images.length) {
            ;(supabaseAdmin as any).from('ai_events').insert({
                user_id: user.id,
                event_type: 'error',
                model_id: 'image-generate',
                backend: 'cloudflare',
                status: 'failed',
                meta: { prompt: trimmedPrompt.slice(0, 200) },
            }).then(() => { }, () => { })

            return NextResponse.json({
                error: 'All free image engines are busy right now — try again in a minute.',
            }, { status: 502 })
        }

        ;(supabaseAdmin as any).from('ai_events').insert({
            user_id: user.id,
            event_type: 'message',
            model_id: 'image-generate',
            backend: modelUsed || 'cloudflare-flux-free',
            status: 'success',
            meta: { prompt: trimmedPrompt.slice(0, 200), count: images.length },
        }).then(() => { }, () => { })

        return NextResponse.json({ images, prompt: trimmedPrompt, model: modelUsed })
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Generation failed' }, { status: 500 })
    }
}
