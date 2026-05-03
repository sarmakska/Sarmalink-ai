/**
 * Persistence layer for Manus task webhook payloads.
 *
 * Uses the Supabase admin client (service-role key) so the webhook route
 * does not need a user session. Upserts by task id — repeated webhooks
 * for the same task are safe (last write wins on status/output/artifacts).
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

export interface ManusTaskRow {
  id: string
  status: string
  output: unknown | null
  artifacts: unknown | null
  received_at: string
  updated_at: string
}

export async function upsertManusTask(
  id: string,
  status: string,
  output: unknown | null,
  artifacts: unknown | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('manus_tasks')
    .upsert(
      { id, status, output, artifacts, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
  if (error) throw new Error(`manus_tasks upsert failed: ${error.message}`)
}

export async function getManusTaskRow(id: string): Promise<ManusTaskRow | null> {
  const { data, error } = await supabaseAdmin
    .from('manus_tasks')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // no rows
    throw new Error(`manus_tasks select failed: ${error.message}`)
  }
  return data as ManusTaskRow
}
