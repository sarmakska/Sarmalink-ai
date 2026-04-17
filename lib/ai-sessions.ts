'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { uploadToR2, signedDownloadUrl, r2Configured } from '@/lib/r2'

const MAX_SESSIONS = 50
const MAX_MEMORIES = 30  // max facts per user (prunes oldest when exceeded)

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    image?: string
}

// ── Get all sessions for current user ─────────────────────
export async function getSessions(): Promise<{ id: string; title: string; updated_at: string }[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .select('id, title, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(MAX_SESSIONS)

    return (data ?? []) as any[]
}

// ── Get a single session with messages ────────────────────
export async function getSession(sessionId: string): Promise<{ id: string; title: string; messages: ChatMessage[] } | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .select('id, title, messages')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()

    return data as any
}

// ── Create a new session ──────────────────────────────────
export async function createSession(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Auto-delete oldest if at limit
    const { data: existing } = await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: true })

    if (existing && existing.length >= MAX_SESSIONS) {
        const toDelete = existing.slice(0, existing.length - MAX_SESSIONS + 1)
        for (const s of toDelete) {
            await (supabaseAdmin as any).from('ai_chat_sessions').delete().eq('id', s.id)
        }
    }

    const { data, error } = await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .insert({ user_id: user.id, title: 'New Chat', messages: [] })
        .select('id')
        .single()

    return error ? null : data.id
}

// ── Update session messages + auto-title ──────────────────
// Strip base64 image data URLs from content + any image field so sessions
// don't bloat the DB (a single generated image is 100-500KB, multiplied per
// save). We replace with a tiny marker so the UI can still render "[image]"
// Upload base64 images to R2, replace data URLs with signed R2 URLs.
// This way images persist across page refreshes — no more "regenerate to see".
async function persistImages(messages: ChatMessage[], userId: string): Promise<ChatMessage[]> {
    const result: ChatMessage[] = []
    for (const m of messages) {
        const out: ChatMessage = { role: m.role, content: m.content ?? '' }
        // Find all base64 image data URLs in content
        if (out.content && out.content.includes('data:image') && r2Configured()) {
            const imgRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g
            let match
            while ((match = imgRegex.exec(out.content)) !== null) {
                const [fullMatch, alt, , mimeExt, b64Data] = match
                try {
                    const key = `${userId}/gen/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${mimeExt === 'jpeg' ? 'jpg' : 'png'}`
                    await uploadToR2({ key, base64: b64Data, contentType: `image/${mimeExt}` })
                    const url = await signedDownloadUrl(key, 86400 * 30) // 30 day URL
                    out.content = out.content.replace(fullMatch, `![${alt}](${url})`)
                } catch {
                    // If R2 upload fails, strip with placeholder
                    out.content = out.content.replace(fullMatch, `![${alt || 'Generated image'} — refresh to reload]()`)
                }
            }
            // Clean any remaining raw base64 that wasn't in markdown image syntax
            out.content = out.content.replace(/data:image\/[^;\s)]+;base64,[A-Za-z0-9+/=]{100,}/g, '[image-data-stripped]')
        }
        // Strip base64 from user image attachments (vision model uses them live, not from history)
        if (m.image) { /* don't persist raw base64 */ }
        result.push(out)
    }
    return result
}

export async function updateSession(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const slim = await persistImages(messages, user.id)

    // Auto-generate title from first user message
    const firstUserMsg = slim.find(m => m.role === 'user')
    const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New Chat'

    await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .update({ messages: slim, title, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', user.id)

    // Extract memories in background (non-blocking — don't slow down the save)
    if (slim.length >= 4) {
        extractMemoriesFromChat(user.id, slim).catch(() => {})
    }
}

// ── Rename a session ──────────────────────────────────────
export async function renameSession(sessionId: string, title: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .update({ title: title.slice(0, 80) })
        .eq('id', sessionId)
        .eq('user_id', user.id)
}

// ── Delete a session ──────────────────────────────────────
export async function deleteSession(sessionId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await (supabaseAdmin as any)
        .from('ai_chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id)
}

// ============================================================================
// AI MEMORY — persistent facts across all chats (ChatGPT-style memory)
// ============================================================================

// ── Get user memories ────────────────────────────────────
export async function getUserMemories(userId: string): Promise<string[]> {
    const { data } = await (supabaseAdmin as any)
        .from('ai_user_memories')
        .select('facts')
        .eq('user_id', userId)
        .maybeSingle()
    return (data?.facts as string[]) ?? []
}

// ── Save user memories ───────────────────────────────────
export async function saveUserMemories(userId: string, facts: string[]): Promise<void> {
    // Keep only the most recent MAX_MEMORIES facts
    const trimmed = facts.slice(-MAX_MEMORIES)
    await (supabaseAdmin as any)
        .from('ai_user_memories')
        .upsert({ user_id: userId, facts: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}

// ── Extract memories from a chat session ─────────────────
// Uses a cheap fast model (Groq Llama 3.1 8B) to extract key facts
// the user revealed about themselves. Called when a session is saved.
export async function extractMemoriesFromChat(userId: string, messages: ChatMessage[]): Promise<void> {
    // Only extract if there's meaningful conversation (>= 4 messages)
    const userMsgs = messages.filter(m => m.role === 'user')
    if (userMsgs.length < 2) return

    // Build a summary of the conversation for extraction
    const chatSummary = messages
        .slice(-20) // last 20 messages max
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`)
        .join('\n')

    const existingFacts = await getUserMemories(userId)
    const existingContext = existingFacts.length > 0
        ? `\nExisting memories (do NOT repeat these):\n${existingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
        : ''

    const prompt = `You are a memory extractor. Read this chat between a user and Cascade AI. Extract ONLY new facts about the USER that would be useful in future conversations. Facts like: their name, role, department, preferences, writing style, topics they care about, people they work with, projects they're on.

Rules:
- Return ONLY a JSON array of short strings. Example: ["User prefers formal tone","User works in accounts","User's manager is Sarah"]
- Each fact must be a complete, self-contained sentence
- Skip anything already known (see existing memories below)
- If no new facts found, return []
- Max 5 new facts per extraction
- Do NOT include facts about what the AI said or did
${existingContext}

Chat:
${chatSummary}

Return ONLY a JSON array, nothing else:`

    // Use Groq Llama 3.1 8B — cheapest, fastest
    const groqKeys = Array.from({ length: 9 }, (_, i) =>
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
            const data = await res.json()
            const text = data.choices?.[0]?.message?.content?.trim() ?? ''
            // Parse JSON array from response
            const match = text.match(/\[[\s\S]*\]/)
            if (!match) continue
            const newFacts: string[] = JSON.parse(match[0])
            if (!Array.isArray(newFacts) || newFacts.length === 0) return
            // Merge with existing, dedup
            const merged = [...existingFacts]
            for (const fact of newFacts) {
                if (typeof fact !== 'string' || fact.length < 5) continue
                // Simple dedup: skip if very similar to existing
                const isDupe = merged.some(existing =>
                    existing.toLowerCase().includes(fact.toLowerCase().slice(0, 30)) ||
                    fact.toLowerCase().includes(existing.toLowerCase().slice(0, 30))
                )
                if (!isDupe) merged.push(fact)
            }
            await saveUserMemories(userId, merged)
            return
        } catch { continue }
    }
}
