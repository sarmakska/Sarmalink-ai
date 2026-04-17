export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { MODELS, MODEL_LIST, type ModelId } from '@/lib/ai-models'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]

    // 1) Pull this user's per-model usage today
    const { data: userRows } = await (supabaseAdmin as any)
      .from('ai_chat_usage')
      .select('model_id, count')
      .eq('user_id', user.id)
      .eq('date', today)

    const userUsage: Record<string, number> = {}
    for (const row of (userRows ?? [])) {
      userUsage[row.model_id] = (userUsage[row.model_id] ?? 0) + (row.count ?? 0)
    }

    // 2) Pull company-wide per-model totals today (from the view)
    const { data: companyRows } = await (supabaseAdmin as any)
      .from('ai_usage_today')
      .select('model_id, total_messages, active_users')

    const companyUsage: Record<string, { total: number; activeUsers: number }> = {}
    for (const row of (companyRows ?? [])) {
      companyUsage[row.model_id] = {
        total: row.total_messages ?? 0,
        activeUsers: row.active_users ?? 0,
      }
    }

    // 3) Build per-model quota response
    const quotas = MODEL_LIST.map((m) => {
      const used = userUsage[m.id] ?? 0
      const remaining = Math.max(0, m.perUserDailyLimit - used)
      const company = companyUsage[m.id] ?? { total: 0, activeUsers: 0 }
      const poolRemaining = Math.max(0, m.totalDailyCapacity - company.total)

      return {
        id: m.id,
        name: m.name,
        emoji: m.emoji,
        tagline: m.tagline,
        knowledge: m.knowledge,
        badge: m.badge ?? null,
        recommended: m.recommended,
        // Personal
        used,
        limit: m.perUserDailyLimit,
        remaining,
        unlimited: m.perUserDailyLimit >= 10000,
        // Company-wide
        poolUsed: company.total,
        poolLimit: m.totalDailyCapacity,
        poolRemaining,
        activeUsersOnModel: company.activeUsers,
      }
    })

    return NextResponse.json({
      ok: true,
      date: today,
      quotas,
    })
  } catch (err: any) {
    console.error('[ai-quota]', err.message)
    return NextResponse.json({ error: 'Failed to fetch quota' }, { status: 500 })
  }
}
