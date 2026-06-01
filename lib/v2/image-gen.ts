/**
 * Image generation cascade.
 *
 * Cascades across all configured Cloudflare account/token pairs running
 * FLUX (@cf/black-forest-labs/flux-1-schnell). Returns base64 PNG bytes
 * plus a URL when R2 is configured.
 *
 * Required env (any of up to 4 pairs):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID_2, CLOUDFLARE_API_TOKEN_2
 *   CLOUDFLARE_ACCOUNT_ID_3, CLOUDFLARE_API_TOKEN_3
 *   CLOUDFLARE_ACCOUNT_ID_4, CLOUDFLARE_API_TOKEN_4
 *
 * Optional R2 upload (if R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME are set):
 *   the returned `url` points at the uploaded object.
 */

import { z } from 'zod'
import { env } from '@/lib/env/validate'

export const ImageGenInputSchema = z.object({
    prompt: z.string().min(1).max(2000),
    model: z.string().optional().default('@cf/black-forest-labs/flux-1-schnell'),
})
export type ImageGenInput = z.infer<typeof ImageGenInputSchema>

export const ImageGenOutputSchema = z.object({
    base64: z.string(),
    url: z.string().nullable(),
    provider: z.literal('cloudflare-flux'),
})
export type ImageGenOutput = z.infer<typeof ImageGenOutputSchema>

async function uploadToR2IfConfigured(bytes: Uint8Array, key: string): Promise<string | null> {
    const cfg = env().r2
    if (!cfg) return null
    try {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
        const client = new S3Client({
            region: 'auto',
            endpoint: cfg.endpoint,
            credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        })
        await client.send(new PutObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
            Body: bytes,
            ContentType: 'image/png',
        }))
        return `${cfg.endpoint.replace(/\/+$/, '')}/${cfg.bucket}/${key}`
    } catch {
        return null
    }
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenOutput> {
    const parsed = ImageGenInputSchema.parse(input)
    const pairs = env().providers.cloudflare
    if (!pairs.length) throw new Error('no Cloudflare account/token pair configured')

    for (const { accountId, token } of pairs) {
        try {
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${parsed.model}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ prompt: parsed.prompt }),
                    signal: AbortSignal.timeout(60_000),
                },
            )
            if (!res.ok) continue
            const data = await res.json() as any
            const b64: string | undefined = data?.result?.image ?? data?.image
            if (!b64) continue
            const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
            const key = `images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
            const url = await uploadToR2IfConfigured(bytes, key)
            return { base64: b64, url, provider: 'cloudflare-flux' }
        } catch {
            continue
        }
    }
    throw new Error('all Cloudflare image providers failed')
}
