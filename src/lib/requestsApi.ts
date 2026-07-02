import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { fetchProfilesByIds } from './kudosApi'

export type RequestType = 'annual_leave' | 'medical_leave' | 'ot' | 'claim'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface RequestRow {
  id: string
  center_id: string
  user_id: string
  type: RequestType
  start_date: string
  end_date: string | null
  hours: number | null
  amount: number | null
  reason: string | null
  attachment_url: string | null
  status: RequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

const REQUEST_COLUMNS =
  'id, center_id, user_id, type, start_date, end_date, hours, amount, reason, attachment_url, status, reviewed_by, reviewed_at, created_at'

export function fetchMyRequests(centerId: string, userId: string) {
  return supabase
    .from('requests')
    .select(REQUEST_COLUMNS)
    .eq('center_id', centerId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<RequestRow[]>()
}

export interface RequestFormInput {
  type: RequestType
  start_date: string
  end_date: string | null
  hours: number | null
  amount: number | null
  reason: string | null
}

export function createRequest(centerId: string, userId: string, input: RequestFormInput) {
  return supabase
    .from('requests')
    .insert({ center_id: centerId, user_id: userId, ...input })
    .select(REQUEST_COLUMNS)
    .single()
    .returns<RequestRow>()
}

// Only valid while the request is still 'pending' — RLS + the requests_guard
// trigger reject edits once it has been reviewed.
export function updateRequest(requestId: string, input: RequestFormInput) {
  return supabase
    .from('requests')
    .update(input)
    .eq('id', requestId)
    .select(REQUEST_COLUMNS)
    .single()
    .returns<RequestRow>()
}

export function cancelRequest(requestId: string) {
  return supabase.from('requests').delete().eq('id', requestId)
}

export interface AdminRequestRow extends RequestRow {
  full_name: string
}

export async function fetchAllRequestsForCenter(
  centerId: string
): Promise<{ data: AdminRequestRow[] | null; error: PostgrestError | null }> {
  const { data: rows, error } = await supabase
    .from('requests')
    .select(REQUEST_COLUMNS)
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .returns<RequestRow[]>()

  if (error) return { data: null, error }

  const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)))
  const { data: profiles, error: profilesError } = await fetchProfilesByIds(userIds)
  if (profilesError) return { data: null, error: profilesError }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const merged: AdminRequestRow[] = (rows ?? []).map((row) => ({
    ...row,
    full_name: nameById.get(row.user_id) ?? 'Unknown',
  }))

  return { data: merged, error: null }
}

export function reviewRequest(requestId: string, status: 'approved' | 'rejected', reviewedBy: string) {
  return supabase
    .from('requests')
    .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .select(REQUEST_COLUMNS)
    .single()
    .returns<RequestRow>()
}
