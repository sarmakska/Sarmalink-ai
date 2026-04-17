/**
 * Event log repository — typed access to ai_events.
 *
 * Every cascade step logs here: which provider was tried, which key, what
 * status code, how long it took. Powers the admin dashboard and lets you
 * spot dead models in aggregate.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

export interface EventLogInput {
    user_id?: string | null
    event_type: 'message' | 'rate_limit' | 'error' | 'fallback'
    model_id?: string | null
    backend?: string | null
    key_index?: number | null
    status?: string | null
    latency_ms?: number | null
    tokens_out?: number | null
    meta?: Record<string, unknown> | null
}

function db() {
    return supabaseAdmin as unknown as {
        from: (table: 'ai_events') => {
            insert: (row: EventLogInput) => Promise<unknown>
        }
    }
}

/**
 * Fire-and-forget event logging. Never blocks the request.
 * If logging fails, we swallow the error — the user's request must not fail
 * because of a logging problem.
 */
export function logEvent(event: EventLogInput): void {
    db().from('ai_events').insert(event).then(() => { }, () => { })
}
