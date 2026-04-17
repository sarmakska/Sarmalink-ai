// ============================================================================
// Cloudflare R2 — file attachment storage client
// Used by /api/attachments/upload, /api/attachments/get, and the chat API
// to persist uploaded files without bloating Supabase (on the free tier).
// ============================================================================

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ENDPOINT = process.env.R2_ENDPOINT ?? ''
const BUCKET = process.env.R2_BUCKET_NAME ?? 'cascade-ai-attachments'
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? ''
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? ''

let _client: S3Client | null = null

export function r2Client(): S3Client {
    if (_client) return _client
    if (!ENDPOINT || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
        throw new Error('R2 is not configured. Missing R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY env vars.')
    }
    _client = new S3Client({
        region: 'auto',
        endpoint: ENDPOINT,
        credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    })
    return _client
}

export function r2Configured(): boolean {
    return !!(ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY)
}

// Build a stable, per-user per-session key
export function buildAttachmentKey(userId: string, sessionId: string | null, filename: string): string {
    const safeSession = sessionId ? sessionId.replace(/[^a-zA-Z0-9-]/g, '') : 'unassigned'
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const stamp = Date.now().toString(36)
    return `${userId}/${safeSession}/${stamp}-${safeName}`
}

// Upload a base64-encoded file to R2. Returns the key.
export async function uploadToR2(opts: {
    key: string
    base64: string
    contentType: string
}): Promise<void> {
    const body = Buffer.from(opts.base64, 'base64')
    await r2Client().send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: opts.key,
        Body: body,
        ContentType: opts.contentType,
    }))
}

// Fetch a file from R2 as raw bytes.
export async function getFromR2(key: string): Promise<Buffer> {
    const res = await r2Client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const body = res.Body as any
    // AWS SDK v3 returns a stream — convert to Buffer
    if (typeof body.transformToByteArray === 'function') {
        const arr = await body.transformToByteArray()
        return Buffer.from(arr)
    }
    // Fallback for older environments
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
}

// Fetch and return as base64 (for vision models that need image bytes)
export async function getFromR2Base64(key: string): Promise<string> {
    const buf = await getFromR2(key)
    return buf.toString('base64')
}

// Delete one object
export async function deleteFromR2(key: string): Promise<void> {
    await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// Check existence (cheap HEAD request)
export async function existsInR2(key: string): Promise<boolean> {
    try {
        await r2Client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
        return true
    } catch {
        return false
    }
}

// Signed URL — for client-side download (1 hour by default)
export async function signedDownloadUrl(key: string, expiresSeconds = 3600): Promise<string> {
    return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: expiresSeconds })
}
