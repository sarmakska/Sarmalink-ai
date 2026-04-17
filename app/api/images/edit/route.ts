export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const CF_PAIRS: { accountId: string; token: string }[] = [
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', token: process.env.CLOUDFLARE_API_TOKEN ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_2 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_3 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_3 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_4 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_4 ?? '' },
].filter(p => p.accountId && p.token)

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return null
    return { bytes: new Uint8Array(Buffer.from(m[2], 'base64')), mime: m[1] }
}

type EditResult =
    | { ok: true; dataUrl: string; source: string; model: string }
    | { ok: false; error: string }

// FLUX.2 klein — unified gen/edit, multipart form data, returns base64 JSON.
async function editViaFluxKlein(
    pair: { accountId: string; token: string },
    model: '@cf/black-forest-labs/flux-2-klein-9b' | '@cf/black-forest-labs/flux-2-klein-4b',
    prompt: string,
    imageBytes: Uint8Array,
    mime: string,
): Promise<EditResult> {
    const fd = new FormData()
    fd.append('prompt', prompt)
    fd.append('image', new Blob([imageBytes], { type: mime || 'image/png' }), 'source.png')
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/${model}`,
        { method: 'POST', headers: { Authorization: `Bearer ${pair.token}` }, body: fd as any },
    )
    if (!res.ok) return { ok: false, error: `cf_${res.status}` }
    const data = await res.json().catch(() => null) as any
    const b64 = data?.result?.image
    if (typeof b64 !== 'string' || b64.length < 200) return { ok: false, error: 'no_image_in_response' }
    return {
        ok: true,
        dataUrl: `data:image/png;base64,${b64}`,
        source: `Cloudflare FLUX.2 klein ${model.endsWith('9b') ? '9B' : '4B'} (free)`,
        model,
    }
}

// SD1.5 img2img — last-resort fallback, raw PNG bytes back.
async function editViaSD15(
    pair: { accountId: string; token: string },
    prompt: string,
    imageBytes: Uint8Array,
    strength: number,
): Promise<EditResult> {
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${pair.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                image: Array.from(imageBytes),
                strength,
                num_steps: 20,
            }),
        },
    )
    if (!res.ok) return { ok: false, error: `cf_sd15_${res.status}` }
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('image/')) {
        const buf = await res.arrayBuffer()
        return {
            ok: true,
            dataUrl: `data:image/png;base64,${Buffer.from(buf).toString('base64')}`,
            source: 'Cloudflare SD1.5 img2img (free, fallback)',
            model: '@cf/runwayml/stable-diffusion-v1-5-img2img',
        }
    }
    const data = await res.json().catch(() => null) as any
    const b64 = data?.result?.image
    if (typeof b64 === 'string') {
        return {
            ok: true,
            dataUrl: `data:image/png;base64,${b64}`,
            source: 'Cloudflare SD1.5 img2img (free, fallback)',
            model: '@cf/runwayml/stable-diffusion-v1-5-img2img',
        }
    }
    return { ok: false, error: 'no_image_in_response' }
}

// Image editing cascade: FLUX.2 klein 9B → 4B → SD1.5 img2img.
// FLUX.2 klein is a unified generation/editing model that understands intent
// ("change the apple to green") rather than just applying noise like SD1.5.
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { prompt, imageDataUrl, strength = 0.7 } = await req.json().catch(() => ({}))
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
            return NextResponse.json({ error: 'Please describe the change you want' }, { status: 400 })
        }
        if (!imageDataUrl || typeof imageDataUrl !== 'string') {
            return NextResponse.json({ error: 'Missing source image' }, { status: 400 })
        }
        const img = dataUrlToBytes(imageDataUrl)
        if (!img) return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
        if (img.bytes.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 413 })

        const cleanPrompt = prompt.trim()
        const s = Math.min(Math.max(Number(strength) || 0.7, 0.1), 0.95)
        let lastError = ''
        let success: Extract<EditResult, { ok: true }> | null = null

        outer: for (const pair of CF_PAIRS) {
            // Try FLUX.2 klein 9B first (best quality)
            let r = await editViaFluxKlein(pair, '@cf/black-forest-labs/flux-2-klein-9b', cleanPrompt, img.bytes, img.mime)
            if (r.ok) { success = r; break outer }
            lastError = r.error
            // Then 4B (faster, still FLUX-quality)
            r = await editViaFluxKlein(pair, '@cf/black-forest-labs/flux-2-klein-4b', cleanPrompt, img.bytes, img.mime)
            if (r.ok) { success = r; break outer }
            lastError = r.error
            // Then SD1.5 img2img as last resort
            r = await editViaSD15(pair, cleanPrompt, img.bytes, s)
            if (r.ok) { success = r; break outer }
            lastError = r.error
        }

        if (!success) {
            ;(supabaseAdmin as any).from('ai_events').insert({
                user_id: user.id,
                event_type: 'error',
                model_id: 'image-edit',
                backend: 'flux-2-klein-cascade',
                status: 'failed',
                meta: { error: lastError.slice(0, 200) },
            }).then(() => { }, () => { })
            return NextResponse.json({ error: 'Image edit failed. ' + lastError }, { status: 502 })
        }

        ;(supabaseAdmin as any).from('ai_events').insert({
            user_id: user.id,
            event_type: 'message',
            model_id: 'image-edit',
            backend: success.model,
            status: 'success',
            meta: { prompt: cleanPrompt.slice(0, 200), strength: s },
        }).then(() => { }, () => { })

        return NextResponse.json({
            image: { dataUrl: success.dataUrl, mimeType: 'image/png', source: success.source },
            prompt: cleanPrompt,
        })
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Edit failed' }, { status: 500 })
    }
}
