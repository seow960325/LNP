import { supabase } from './supabaseClient'
import type { JobTitle } from '../types'

const JOB_TITLE_COLUMNS = 'id, center_id, name, sort_order, active, created_at'

export function fetchJobTitles(centerId: string) {
  return supabase
    .from('job_titles')
    .select(JOB_TITLE_COLUMNS)
    .eq('center_id', centerId)
    .order('sort_order', { ascending: true })
    .returns<JobTitle[]>()
}

export interface CreateJobTitlePayload {
  name: string
  sort_order: number
}

export function createJobTitle(centerId: string, payload: CreateJobTitlePayload) {
  return supabase.from('job_titles').insert({ center_id: centerId, ...payload })
}

export interface UpdateJobTitlePatch {
  name?: string
  sort_order?: number
  active?: boolean
}

// centerId guards against writing through a stale id from another center —
// same pattern as classes/attendance conditions.
export function updateJobTitle(id: string, centerId: string, patch: UpdateJobTitlePatch) {
  return supabase.from('job_titles').update(patch).eq('id', id).eq('center_id', centerId)
}

export function toggleJobTitleActive(id: string, centerId: string, active: boolean) {
  return supabase.from('job_titles').update({ active }).eq('id', id).eq('center_id', centerId)
}

// Swaps sort_order between two adjacent rows — the up/down reorder control.
// Two updates rather than a single batch since sort_order has no unique
// constraint to fight with either way.
export async function swapJobTitleSortOrder(
  centerId: string,
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
) {
  const [first, second] = await Promise.all([
    updateJobTitle(a.id, centerId, { sort_order: b.sort_order }),
    updateJobTitle(b.id, centerId, { sort_order: a.sort_order }),
  ])
  return first.error ? first : second
}

export type DeleteJobTitleResult = { error: null } | { error: 'in_use'; count: number } | { error: 'failed' }

// Hard delete, but only when nothing references it — the FK is
// ON DELETE SET NULL, so the database itself would happily silently detach
// every affected staff member instead of blocking; that's not what an admin
// clicking Delete expects, so this checks and blocks in the app instead of
// relying on FK behavior.
export async function deleteJobTitle(id: string): Promise<DeleteJobTitleResult> {
  const { count, error: countError } = await supabase
    .from('staff_members')
    .select('id', { count: 'exact', head: true })
    .eq('job_title_id', id)

  if (countError) return { error: 'failed' }
  if ((count ?? 0) > 0) return { error: 'in_use', count: count ?? 0 }

  const { error } = await supabase.from('job_titles').delete().eq('id', id)
  if (error) return { error: 'failed' }
  return { error: null }
}
