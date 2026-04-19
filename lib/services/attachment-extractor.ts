/**
 * Attachment extractor — handles PDF, Excel, and Word file extraction.
 *
 * Supports both legacy single-file fields (pdfBase64, excelBase64, wordBase64)
 * and the new multi-file `files[]` array.
 */

import { env } from '@/lib/env/validate'

export interface AttachmentFile {
    type: 'pdf' | 'excel' | 'word'
    name: string
    data: string
    text?: string
}

export interface AttachmentResult {
    fileContext: string
    fileLabel: string
    fileCount: number
    allFiles: AttachmentFile[]
}

// ── PDF extract via Gemini ──────────────────────────────────────────────────
async function extractPdf(pdfBase64: string): Promise<string> {
    const GEMINI_KEYS = env().providers.gemini
    for (const key of GEMINI_KEYS) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: 'Extract ALL text from this document exactly as written — every line, number, heading, and detail. Do not summarise or skip anything.' },
                        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
                    ]}],
                }),
            })
            if (res.status === 429) continue
            if (res.ok) {
                const data = await res.json()
                const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').slice(0, 15000)
                if (text) return text
            }
        } catch { continue }
    }
    return '[Could not read this PDF. Please try a smaller file or paste the text directly.]'
}

// ── Excel extract ───────────────────────────────────────────────────────────
async function extractExcel(base64: string): Promise<string> {
    try {
        const XLSX = require('xlsx')
        const buffer = Buffer.from(base64, 'base64')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        let result = ''
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName]
            const csv = XLSX.utils.sheet_to_csv(sheet)
            result += `Sheet: ${sheetName}\n${csv}\n\n`
        }
        return result.slice(0, 15000) || '[Empty spreadsheet]'
    } catch { return '[Could not read this Excel file.]' }
}

// ── Word extract via mammoth ────────────────────────────────────────────────
async function extractWord(base64: string): Promise<string> {
    try {
        const mammoth = require('mammoth')
        const buffer = Buffer.from(base64, 'base64')
        const result = await mammoth.extractRawText({ buffer })
        return result.value.slice(0, 15000) || '[Empty document]'
    } catch { return '[Could not read this Word file.]' }
}

/**
 * Collect and extract all attached files from the request body.
 * Returns an empty result if no files are attached.
 */
export async function extractAttachments(opts: {
    files?: AttachmentFile[]
    pdfBase64?: string
    excelBase64?: string
    wordBase64?: string
}): Promise<AttachmentResult> {
    const { files, pdfBase64, excelBase64, wordBase64 } = opts
    const allFiles: AttachmentFile[] = []
    if (Array.isArray(files)) allFiles.push(...files)
    if (pdfBase64)   allFiles.push({ type: 'pdf',   name: 'document.pdf',  data: pdfBase64 })
    if (excelBase64) allFiles.push({ type: 'excel', name: 'sheet.xlsx',    data: excelBase64 })
    if (wordBase64)  allFiles.push({ type: 'word',  name: 'document.docx', data: wordBase64 })

    if (allFiles.length === 0) {
        return { fileContext: '', fileLabel: '', fileCount: 0, allFiles }
    }

    const sections: string[] = []
    const totalBudget = 80000
    const perFileLimit = Math.min(Math.floor(totalBudget / allFiles.length), 10000)

    for (let i = 0; i < allFiles.length; i++) {
        const f = allFiles[i]
        let extracted = ''
        try {
            if (typeof f.text === 'string' && f.text.length > 0) {
                extracted = f.text
            } else if (typeof f.data === 'string' && f.data.length > 0) {
                if (f.type === 'pdf')   extracted = await extractPdf(f.data)
                if (f.type === 'excel') extracted = await extractExcel(f.data)
                if (f.type === 'word')  extracted = await extractWord(f.data)
            } else {
                extracted = `[Attachment ${f.name} has no extracted text available.]`
            }
        } catch (e: any) {
            extracted = `[Could not read this file: ${e?.message?.slice(0, 100) ?? 'unknown error'}]`
        }
        const trimmed = extracted.slice(0, perFileLimit)
        sections.push(`══════════ FILE ${i + 1} of ${allFiles.length}: ${f.name} (${f.type.toUpperCase()}) ══════════\n${trimmed}`)
    }

    const fileContext = sections.join('\n\n')
    const fileLabel = allFiles.length === 1
        ? `${allFiles[0].type === 'pdf' ? 'PDF' : allFiles[0].type === 'excel' ? 'Excel' : 'Word'} document`
        : `${allFiles.length} attached files`

    return { fileContext, fileLabel, fileCount: allFiles.length, allFiles }
}

/**
 * Build the full message text with file context prepended.
 * The instruction block ensures the model processes all files.
 */
export function buildFileMessage(
    message: string,
    attachment: AttachmentResult,
): string {
    if (!attachment.fileContext) return message || ''

    const { fileContext, fileLabel, fileCount, allFiles } = attachment
    const fileNames = allFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
    const instruction = fileCount > 1
        ? `[CRITICAL INSTRUCTION — ${fileCount} FILES ATTACHED]

You have been given ${fileCount} separate files. You MUST include information from EVERY file in your answer — none must be dropped, skipped, or summarised as "etc.". If the user asked for a table, it MUST have exactly ${fileCount} rows (one per file) unless the user explicitly asks for fewer.

Files you are receiving (in order):
${fileNames}

If you find yourself writing fewer than ${fileCount} rows/entries, STOP and re-read all the FILE markers below. Cross-check against the list above before responding. If any file is empty or unreadable, still include a row with "[unreadable]" — do NOT silently omit it.`
        : `[${fileLabel} content below]`

    return `${instruction}\n\n${fileContext}\n\n[User's question]: ${message || `Please analyse all ${fileCount > 1 ? fileCount + ' attached files' : 'this ' + fileLabel}.`}`
}
