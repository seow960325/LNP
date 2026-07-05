import { supabase } from './supabaseClient'
import { toKLDateISO } from './helpers'

export interface Term {
  id: string
  center_id: string
  name: string
  start_date: string
  end_date: string
  created_at: string
}

export function fetchTerms(centerId: string) {
  return supabase
    .from('terms')
    .select('*')
    .eq('center_id', centerId)
    .order('start_date', { ascending: false })
    .returns<Term[]>()
}

export interface CreateTermPayload {
  center_id: string
  name: string
  start_date: string
  end_date: string
}

export function createTerm(payload: CreateTermPayload) {
  return supabase.from('terms').insert(payload)
}

export interface UpdateTermPatch {
  name?: string
  start_date?: string
  end_date?: string
}

export function updateTerm(id: string, patch: UpdateTermPatch) {
  return supabase.from('terms').update(patch).eq('id', id)
}

export function deleteTerm(id: string) {
  return supabase.from('terms').delete().eq('id', id)
}

// "Current" = today's local (Asia/Kuala_Lumpur) date falls within the term's
// range. Used to keep the active term off the data-deletion dropdown — a
// term still in progress should never be purgeable.
export function isCurrentTerm(term: Term): boolean {
  const today = toKLDateISO(new Date())
  return today >= term.start_date && today <= term.end_date
}
