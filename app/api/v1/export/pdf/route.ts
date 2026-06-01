/**
 * POST /api/v1/export/pdf
 *
 * Body: { content: string (markdown), filename?: string }
 * Returns: application/pdf bytes.
 *
 * Uses pdfkit. Markdown handling is intentionally minimal: heading lines
 * (`# `, `## `, `### `), blank-line paragraphs, and plain bullets (`- `).
 * For rich rendering, post-process the markdown upstream.
 */

import PDFDocument from 'pdfkit'
import { z } from 'zod'

export const runtime = 'nodejs'

const InputSchema = z.object({
    content: z.string().min(1).max(200_000),
    filename: z.string().optional(),
})

function renderToBuffer(markdown: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 56 })
        const chunks: Buffer[] = []
        doc.on('data', (c) => chunks.push(c as Buffer))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const lines = markdown.split(/\r?\n/)
        for (const raw of lines) {
            const line = raw.replace(/\s+$/, '')
            if (!line.trim()) {
                doc.moveDown(0.5)
                continue
            }
            if (line.startsWith('### ')) {
                doc.font('Helvetica-Bold').fontSize(13).text(line.slice(4))
            } else if (line.startsWith('## ')) {
                doc.font('Helvetica-Bold').fontSize(15).text(line.slice(3))
            } else if (line.startsWith('# ')) {
                doc.font('Helvetica-Bold').fontSize(18).text(line.slice(2))
            } else if (/^[\-\*]\s+/.test(line)) {
                doc.font('Helvetica').fontSize(11).text(`• ${line.replace(/^[\-\*]\s+/, '')}`)
            } else {
                doc.font('Helvetica').fontSize(11).text(line)
            }
            doc.moveDown(0.3)
        }

        doc.end()
    })
}

export async function POST(req: Request) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 })
    }
    const parsed = InputSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify({ ok: false, error: parsed.error.message }), { status: 400 })
    }
    try {
        const pdf = await renderToBuffer(parsed.data.content)
        const filename = (parsed.data.filename || 'export').replace(/[^a-z0-9_\-\.]/gi, '_')
        return new Response(new Uint8Array(pdf), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            },
        })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500 })
    }
}
