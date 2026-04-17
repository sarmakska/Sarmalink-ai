// ============================================================
// Supabase Admin Client — Service Role
// ONLY used in server-side trusted code (Route Handlers, Server Actions).
// NEVER import this in any client component.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// This client bypasses RLS entirely.
// Use only for admin operations that are explicitly guarded by server-side role checks.
export const supabaseAdmin = createClient<Database>(url, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})

