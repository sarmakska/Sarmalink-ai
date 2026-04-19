/**
 * Event logger — fire-and-forget logging to ai_events table.
 *
 * Used by the chat orchestrator and streaming services to record
 * events without blocking the request.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

export async function logEvent(args: {
    user_id?: string
    event_type: string
    model_id?: string
    backend?: string
    key_index?: number
    tokens_in?: number
    tokens_out?: number
    latency_ms?: number
    status?: string
    meta?: Record<string, unknown>
}) {
    try {
        await supabaseAdmin.from('ai_events').insert({ ...args })
    } catch { /* never block the chat for logging */ }
}
