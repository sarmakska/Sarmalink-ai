// ============================================================================
// File content extractors — shared by chat API and attachment upload route.
// Returns plain text from PDF / Excel / Word, capped at ~15K chars per file
// to stay within model context budgets.
// ============================================================================

const GEMINI_KEYS = [
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY_2,
    process.env.GOOGLE_GEMINI_API_KEY_3,
    process.env.GEMINI_CHATBOT_KEY_1,
    process.env.GEMINI_CHATBOT_KEY_2,
    process.env.GEMINI_CHATBOT_KEY_3,
    process.env.GOOGLE_GEMINI_API_KEY_4,
    process.env.GOOGLE_GEMINI_API_KEY_5,
    process.env.GOOGLE_GEMINI_API_KEY_6,
    process.env.GOOGLE_GEMINI_API_KEY_7,
    process.env.GOOGLE_GEMINI_API_KEY_8,
    process.env.GOOGLE_GEMINI_API_KEY_9,
].filter(Boolean) as string[]

export async function extractPdf(pdfBase64: string): Promise<string> {
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
                const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
                const text = raw.slice(0, 15000)
                if (text) {
                    if (raw.length > 15000) return text + '\n\n⚠️ [Document truncated — only the first ~15,000 characters were extracted. The full document may contain more content.]'
                    return text
                }
            }
        } catch { continue }
    }
    return '[Could not read this PDF. Please try a smaller file or paste the text directly.]'
}

export async function extractExcel(base64: string): Promise<string> {
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
        if (result.length > 15000) return result.slice(0, 15000) + '\n\n⚠️ [Spreadsheet truncated — only the first ~15,000 characters were extracted.]'
        return result || '[Empty spreadsheet]'
    } catch { return '[Could not read this Excel file.]' }
}

export async function extractWord(base64: string): Promise<string> {
    try {
        const mammoth = require('mammoth')
        const buffer = Buffer.from(base64, 'base64')
        const result = await mammoth.extractRawText({ buffer })
        if (result.value.length > 15000) return result.value.slice(0, 15000) + '\n\n⚠️ [Document truncated — only the first ~15,000 characters were extracted.]'
        return result.value || '[Empty document]'
    } catch { return '[Could not read this Word file.]' }
}

export async function extractFromBase64(type: 'pdf' | 'excel' | 'word' | 'image', base64: string): Promise<string> {
    if (type === 'pdf')   return extractPdf(base64)
    if (type === 'excel') return extractExcel(base64)
    if (type === 'word')  return extractWord(base64)
    return ''
}
