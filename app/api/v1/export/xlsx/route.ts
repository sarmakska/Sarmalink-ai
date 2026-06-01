/**
 * POST /api/v1/export/xlsx
 *
 * Body shape A (single sheet):
 *   { headers: string[], rows: (string|number|null)[][], filename?: string }
 *
 * Body shape B (multi-sheet):
 *   { sheets: [{ name, headers, rows }], filename?: string }
 *
 * Returns: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 */

import ExcelJS from 'exceljs'
import { z } from 'zod'

export const runtime = 'nodejs'

const CellValue = z.union([z.string(), z.number(), z.boolean(), z.null()])
const SheetSchema = z.object({
    name: z.string().min(1).max(31),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(CellValue)),
})

const InputSchema = z.union([
    z.object({
        sheets: z.array(SheetSchema).min(1).max(20),
        filename: z.string().optional(),
    }),
    z.object({
        headers: z.array(z.string()).min(1),
        rows: z.array(z.array(CellValue)),
        filename: z.string().optional(),
    }),
])

function normalise(input: z.infer<typeof InputSchema>): { sheets: z.infer<typeof SheetSchema>[]; filename: string } {
    const filename = (input.filename || 'export').replace(/[^a-z0-9_\-\.]/gi, '_')
    if ('sheets' in input) return { sheets: input.sheets, filename }
    return {
        sheets: [{ name: 'Sheet1', headers: input.headers, rows: input.rows }],
        filename,
    }
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

    const { sheets, filename } = normalise(parsed.data)
    const wb = new ExcelJS.Workbook()
    wb.created = new Date()

    for (const s of sheets) {
        const ws = wb.addWorksheet(s.name)
        ws.addRow(s.headers).font = { bold: true }
        for (const row of s.rows) ws.addRow(row)
        ws.columns.forEach((col) => {
            let max = 10
            col.eachCell?.((cell) => {
                const len = String(cell.value ?? '').length
                if (len > max) max = len
            })
            col.width = Math.min(max + 2, 60)
        })
    }

    const buf = await wb.xlsx.writeBuffer()
    return new Response(new Uint8Array(buf), {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
    })
}
