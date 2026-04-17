/**
 * Session repository — typed data access for ai_chat_sessions.
 *
 * Wraps supabaseAdmin with proper TypeScript types, avoiding the `as any`
 * casts that pollute raw route handler code. All callers receive typed
 * rows and cannot accidentally destructure the wrong column.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { AiChatSession, SessionListItem, ChatMessageRow } from '@/lib/types/database'

type SessionsTable = {
    from: (table: 'ai_chat_sessions') => {
        select: (cols: string) => any
        insert: (row: any) => any
        update: (row: any) => any
        delete: () => any
    }
}

function db(): SessionsTable {
    return supabaseAdmin as unknown as SessionsTable
}

const MAX_SESSIONS = 50

export async function listSessions(userId: string): Promise<SessionListItem[]> {
    const { data } = await db()
        .from('ai_chat_sessions')
        .select('id, title, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(MAX_SESSIONS)
    return (data as SessionListItem[] | null) ?? []
}

export async function getSession(
    sessionId: string,
    userId: string
): Promise<Pick<AiChatSession, 'id' | 'title' | 'messages'> | null> {
    const { data } = await db()
        .from('ai_chat_sessions')
        .select('id, title, messages')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle()
    return (data as Pick<AiChatSession, 'id' | 'title' | 'messages'> | null) ?? null
}

export async function createSession(userId: string): Promise<string | null> {
    // Auto-delete oldest if at limit
    const { data: existing } = await db()
        .from('ai_chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: true })

    const rows = (existing as { id: string }[] | null) ?? []
    if (rows.length >= MAX_SESSIONS) {
        const toDelete = rows.slice(0, rows.length - MAX_SESSIONS + 1)
        for (const s of toDelete) {
            await db().from('ai_chat_sessions').delete().eq('id', s.id)
        }
    }

    const { data, error } = await db()
        .from('ai_chat_sessions')
        .insert({ user_id: userId, title: 'New Chat', messages: [] })
        .select('id')
        .single()
    if (error || !data) return null
    return (data as { id: string }).id
}

export async function updateSessionMessages(
    sessionId: string,
    userId: string,
    messages: ChatMessageRow[],
    title: string,
): Promise<void> {
    await db()
        .from('ai_chat_sessions')
        .update({ messages, title, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', userId)
}

export async function renameSession(sessionId: string, userId: string, title: string): Promise<void> {
    await db()
        .from('ai_chat_sessions')
        .update({ title: title.slice(0, 80) })
        .eq('id', sessionId)
        .eq('user_id', userId)
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
    await db()
        .from('ai_chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', userId)
}
