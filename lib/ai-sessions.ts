'use server'

/**
 * AI sessions — thin server action layer over the session repository.
 *
 * Responsibilities:
 *   1. Authenticate the calling user (never trust user_id from the client).
 *   2. Strip base64 image data URLs and persist to R2 instead, replacing
 *      the URLs in message content with 7-day signed R2 URLs.
 *   3. Auto-generate session titles from the first user message.
 *   4. Fire memory extraction in the background after every meaningful save.
 */

import { createClient } from '@/lib/supabase/server'
import { uploadToR2, signedDownloadUrl, r2Configured } from '@/lib/r2'
import {
    listSessions as repoListSessions,
    getSession as repoGetSession,
    createSession as repoCreateSession,
    updateSessionMessages as repoUpdateSessionMessages,
    renameSession as repoRenameSession,
    deleteSession as repoDeleteSession,
} from '@/lib/repositories/sessions'
import { getUserMemories, saveUserMemories } from '@/lib/repositories/memories'
import type { ChatMessageRow, SessionListItem } from '@/lib/types/database'

const MAX_MEMORIES = 30

// ── Session CRUD ──────────────────────────────────────────────────────────

export async function getSessions(): Promise<SessionListItem[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    return repoListSessions(user.id)
}

export async function getSession(sessionId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return repoGetSession(sessionId, user.id)
}

export async function createSession(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return repoCreateSession(user.id)
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    return repoRenameSession(sessionId, user.id, title)
}

export async function deleteSession(sessionId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    return repoDeleteSession(sessionId, user.id)
}

// ── Image persistence — base64 → R2 ──────────────────────────────────────

/**
 * Upload any base64 image data URLs in message content to R2, replacing them
 * with signed R2 URLs. Prevents the sessions table from bloating with
 * hundreds of KB of base64 per generated image and lets images survive
 * across page refreshes.
 *
 * Signed URL lifetime: 7 days. Short enough to limit blast radius if a URL
 * leaks, long enough that users don't need to regenerate for normal use.
 */
async function persistImages(messages: ChatMessageRow[], userId: string): Promise<ChatMessageRow[]> {
    const result: ChatMessageRow[] = []
    for (const m of messages) {
        const out: ChatMessageRow = { role: m.role, content: m.content ?? '' }
        if (out.content && out.content.includes('data:image') && r2Configured()) {
            const imgRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g
            let match
            while ((match = imgRegex.exec(out.content)) !== null) {
                const [fullMatch, alt, , mimeExt, b64Data] = match
                try {
                    const key = `${userId}/gen/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${mimeExt === 'jpeg' ? 'jpg' : 'png'}`
                    await uploadToR2({ key, base64: b64Data, contentType: `image/${mimeExt}` })
                    const url = await signedDownloadUrl(key, 7 * 24 * 3600)
                    out.content = out.content.replace(fullMatch, `![${alt}](${url})`)
                } catch {
                    out.content = out.content.replace(fullMatch, `![${alt || 'Generated image'} — refresh to reload]()`)
                }
            }
            out.content = out.content.replace(/data:image\/[^;\s)]+;base64,[A-Za-z0-9+/=]{100,}/g, '[image-data-stripped]')
        }
        result.push(out)
    }
    return result
}

// ── Session save + memory extraction ─────────────────────────────────────

export async function updateSession(sessionId: string, messages: ChatMessageRow[]): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const slim = await persistImages(messages, user.id)

    const firstUserMsg = slim.find(m => m.role === 'user')
    const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New Chat'

    await repoUpdateSessionMessages(sessionId, user.id, slim, title)

    if (slim.length >= 4) {
        extractMemoriesFromChat(user.id, slim).catch(() => { })
    }
}

// ── Memory layer ─────────────────────────────────────────────────────────

/**
 * Server-action wrapper around the memory repository.
 * (Plain re-exports aren't allowed in 'use server' files.)
 */
export async function getUserMemoriesForCurrentUser(): Promise<string[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    return getUserMemories(user.id)
}

/**
 * Extract long-term memories from a chat session using a cheap model. Runs
 * in the background after every session save — never blocks the user's
 * request.
 *
 * The extractor is itself an LLM, so we rely on the pattern stripping done
 * at prompt injection time (lib/prompts/sanitize.ts) to defend its input.
 */
export async function extractMemoriesFromChat(
    userId: string,
    messages: ChatMessageRow[]
): Promise<void> {
    const userMsgs = messages.filter(m => m.role === 'user')
    if (userMsgs.length < 2) return

    const chatSummary = messages
        .slice(-20)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`)
        .join('\n')

    const existingFacts = await getUserMemories(userId)
    const existingContext = existingFacts.length > 0
        ? `\nExisting memories (do NOT repeat these):\n${existingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
        : ''

    const prompt = `You are a memory extractor. Read this chat between a user and an AI. Extract ONLY new facts about the USER that would be useful in future conversations. Facts like: their name, role, department, preferences, writing style, topics they care about, people they work with, projects they're on.

Rules:
- Return ONLY a JSON array of short strings. Example: ["User prefers formal tone","User works in accounts"]
- Each fact must be a complete, self-contained sentence
- Skip anything already known (see existing memories below)
- If no new facts found, return []
- Max 5 new facts per extraction
- Do NOT include facts about what the AI said or did
${existingContext}

Chat:
${chatSummary}

Return ONLY a JSON array, nothing else:`

    const groqKeys = Array.from({ length: 15 }, (_, i) =>
        process.env[i === 0 ? 'GROQ_API_KEY' : `GROQ_API_KEY_${i + 1}`]
    ).filter(Boolean) as string[]

    for (const key of groqKeys) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 300,
                    temperature: 0.3,
                }),
            })
            if (res.status === 429) continue
            if (!res.ok) continue
            const data = await res.json() as { choices?: { message?: { content?: string } }[] }
            const text = data.choices?.[0]?.message?.content?.trim() ?? ''
            const match = text.match(/\[[\s\S]*\]/)
            if (!match) continue
            const newFacts: unknown = JSON.parse(match[0])
            if (!Array.isArray(newFacts) || newFacts.length === 0) return

            const merged = [...existingFacts]
            for (const fact of newFacts) {
                if (typeof fact !== 'string' || fact.length < 5) continue
                const isDupe = merged.some(existing =>
                    existing.toLowerCase().includes(fact.toLowerCase().slice(0, 30)) ||
                    fact.toLowerCase().includes(existing.toLowerCase().slice(0, 30))
                )
                if (!isDupe) merged.push(fact)
            }
            await saveUserMemories(userId, merged.slice(-MAX_MEMORIES))
            return
        } catch { continue }
    }
}
