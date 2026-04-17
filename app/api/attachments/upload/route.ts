export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2, buildAttachmentKey, r2Configured } from '@/lib/r2'
import { extractFromBase64 } from '@/lib/file-extract'

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB per file

type AttachmentType = 'image' | 'pdf' | 'excel' | 'word'

function detectType(name: string, mimeHint?: string): AttachmentType | null {
    const lower = name.toLowerCase()
    if (mimeHint?.startsWith('image/')) return 'image'
    if (lower.endsWith('.pdf')) return 'pdf'
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel'
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word'
    if (/\.(png|jpe?g|gif|webp|heic|avif)$/i.test(lower)) return 'image'
    return null
}

function contentTypeForAttachment(type: AttachmentType): string {
    switch (type) {
        case 'image': return 'image/*'
        case 'pdf': return 'application/pdf'
        case 'excel': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        case 'word': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!r2Configured()) {
            return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 })
        }
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json().catch(() => null) as null | {
            name?: string
            type?: AttachmentType
            data?: string        // base64 (may include the data URL prefix)
            mime?: string
            sessionId?: string
        }
        if (!body?.name || !body.data) {
            return NextResponse.json({ error: 'Missing name or data' }, { status: 400 })
        }

        // Strip data URL prefix if present
        let b64 = body.data
        const commaIdx = b64.indexOf(',')
        if (b64.startsWith('data:') && commaIdx > 0) b64 = b64.slice(commaIdx + 1)

        // Size check (base64 bloats ~33%, but Buffer length is accurate)
        const sizeBytes = Math.floor(b64.length * 0.75)
        if (sizeBytes > MAX_SIZE) {
            return NextResponse.json({ error: `File too large (max ${Math.round(MAX_SIZE / 1024 / 1024)} MB)` }, { status: 413 })
        }

        const type = body.type ?? detectType(body.name, body.mime)
        if (!type) {
            return NextResponse.json({ error: 'Unsupported file type. Allowed: images, PDF, Excel, Word.' }, { status: 415 })
        }

        const key = buildAttachmentKey(user.id, body.sessionId ?? null, body.name)

        // Upload to R2 AND extract text in parallel — saves ~1-2s per upload
        const [_, text] = await Promise.all([
            uploadToR2({
                key,
                base64: b64,
                contentType: body.mime ?? contentTypeForAttachment(type),
            }),
            type !== 'image' ? extractFromBase64(type, b64) : Promise.resolve(''),
        ])

        return NextResponse.json({
            key,
            name: body.name,
            type,
            size: sizeBytes,
            text,  // empty for images (they're handled by vision model at chat time)
            bucket: process.env.R2_BUCKET_NAME,
        })
    } catch (err: any) {
        console.error('[attachments/upload]', err?.message)
        return NextResponse.json({ error: err?.message ?? 'Upload failed' }, { status: 500 })
    }
}
