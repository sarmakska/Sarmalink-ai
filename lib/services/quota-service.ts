/**
 * Quota service — daily per-model usage checking and enforcement.
 *
 * Checks the user's daily message count against the model's per-user limit
 * and increments the counter on success.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ModelDefinition, ModelId } from '@/lib/ai-models'

export interface QuotaCheckResult {
    allowed: boolean
    currentCount: number
    /** Pre-built JSON error body when `allowed` is false */
    errorBody?: {
        error: string
        reply: string
        usage: number
        model: ModelId
    }
}

/**
 * Check whether the user still has quota for this model today.
 * Does NOT increment — call `incrementQuota` after the request succeeds.
 */
export async function checkQuota(
    userId: string,
    modelId: ModelId,
    model: ModelDefinition,
): Promise<QuotaCheckResult> {
    const today = new Date().toISOString().split('T')[0]
    const { data: usageRow } = await supabaseAdmin
        .from('ai_chat_usage')
        .select('count')
        .eq('user_id', userId)
        .eq('date', today)
        .eq('model_id', modelId)
        .maybeSingle()

    const currentCount = usageRow?.count ?? 0

    if (currentCount >= model.perUserDailyLimit) {
        return {
            allowed: false,
            currentCount,
            errorBody: {
                error: 'limit',
                reply: `You've used your daily ${model.name} limit (${model.perUserDailyLimit} messages). Try ⚡ Fast (unlimited) or wait until midnight.`,
                usage: currentCount,
                model: modelId,
            },
        }
    }

    return { allowed: true, currentCount }
}

/**
 * Increment the per-model usage counter for a user.
 * Uses upsert so the row is created on first use each day.
 */
export async function incrementQuota(
    userId: string,
    modelId: ModelId,
    currentCount: number,
): Promise<void> {
    const today = new Date().toISOString().split('T')[0]
    await supabaseAdmin
        .from('ai_chat_usage')
        .upsert(
            { user_id: userId, date: today, model_id: modelId, count: currentCount + 1 },
            { onConflict: 'user_id,date,model_id' }
        )
}
