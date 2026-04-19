export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { orchestrateChat, type ChatRequestBody } from '@/lib/services/chat-orchestrator'

/**
 * POST /api/ai-chat — thin route handler.
 *
 * Authenticates the user, validates the request body, then delegates all
 * business logic to the chat orchestrator (lib/services/chat-orchestrator.ts).
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const body = await request.json() as ChatRequestBody

        if (!body.message?.trim() && !body.image && !body.pdfBase64 && !body.excelBase64 && !body.wordBase64) {
            return NextResponse.json({ error: 'Empty message' }, { status: 400 })
        }

        return await orchestrateChat(user.id, body)
    } catch (err: any) {
        console.error('[AI Chat]', err.message)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
