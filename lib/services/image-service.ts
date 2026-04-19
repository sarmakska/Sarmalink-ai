/**
 * Image service — generates images via Cloudflare Workers AI (FLUX.1-schnell).
 *
 * Rotates through up to 4 Cloudflare account/token pairs for capacity.
 * Also provides a Pollinations.ai URL fallback (not currently used in the
 * main flow, but retained for backwards compatibility).
 */

const CF_PAIRS: { accountId: string; token: string }[] = [
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', token: process.env.CLOUDFLARE_API_TOKEN ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_2 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_3 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_3 ?? '' },
    { accountId: process.env.CLOUDFLARE_ACCOUNT_ID_4 ?? '', token: process.env.CLOUDFLARE_API_TOKEN_4 ?? '' },
].filter(p => p.accountId && p.token)

/**
 * Whether Cloudflare image generation is configured.
 */
export function isImageConfigured(): boolean {
    return CF_PAIRS.length > 0
}

/**
 * Generate an image directly via Cloudflare FLUX.1-schnell.
 * Returns a data URL on success, null if all pairs are exhausted.
 */
export async function generateImageDirect(prompt: string): Promise<{ dataUrl: string; source: string } | null> {
    for (const pair of CF_PAIRS) {
        try {
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${pair.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${pair.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, steps: 8 }),
                }
            )
            if (!res.ok) continue
            const data = await res.json()
            const b64 = data?.result?.image
            if (!b64 || typeof b64 !== 'string' || b64.length < 100) continue
            return { dataUrl: `data:image/png;base64,${b64}`, source: 'Cloudflare FLUX.1-schnell (free)' }
        } catch { continue }
    }
    return null
}

/**
 * Generate an image URL via Pollinations.ai (no API key needed).
 */
export function generateImageUrl(prompt: string): string {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`
}
