import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { fetchProfilesByIds } from './kudosApi'

export type LeaveType = 'AL' | 'MC'
export type LeaveSegment = 'full' | 'am' | 'pm'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveBalance {
  id: string
  profile_id: string
  year: number
  leave_type: LeaveType
  entitled_days: number
}

export interface LeaveRequest {
  id: string
  profile_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  segment: LeaveSegment
  days: number
  reason: string | null
  status: LeaveStatus
  reject_reason: string | null
  approved_by: string | null
  approved_at: string | null
  submitted_at: string
}

// Used by both the teacher's own-requests view and the admin all-requests
// view (mirrors ClaimRow in claimsApi.ts).
export interface LeaveRequestRow extends LeaveRequest {
  claimant_name: string
  approver_name: string | null
}

const LEAVE_BALANCE_COLUMNS = 'id, profile_id, year, leave_type, entitled_days'
const LEAVE_REQUEST_COLUMNS =
  'id, profile_id, leave_type, start_date, end_date, segment, days, reason, status, reject_reason, approved_by, approved_at, submitted_at'

// --- Balances ---

// Teacher/staff own-balance view. RLS blocks non-admins from reading MC
// balance rows entirely, so this naturally returns AL-only for a teacher
// even without an explicit leave_type filter.
export function fetchMyLeaveBalances(profileId: string, year: number) {
  return supabase
    .from('leave_balances')
    .select(LEAVE_BALANCE_COLUMNS)
    .eq('profile_id', profileId)
    .eq('year', year)
    .returns<LeaveBalance[]>()
}

// Admin/super_admin — RLS scopes this to "all balances" for those roles.
export function fetchAllLeaveBalances(year: number) {
  return supabase.from('leave_balances').select(LEAVE_BALANCE_COLUMNS).eq('year', year).returns<LeaveBalance[]>()
}

export function upsertLeaveBalance(profileId: string, year: number, leaveType: LeaveType, entitledDays: number) {
  return supabase
    .from('leave_balances')
    .upsert(
      { profile_id: profileId, year, leave_type: leaveType, entitled_days: entitledDays },
      { onConflict: 'profile_id,year,leave_type' }
    )
}

// --- Requests ---

// Resolves claimant/approver display names in a second batched query (mirrors
// mergeClaimNames in claimsApi.ts) rather than a PostgREST embed, since
// leave_requests has two FKs into profiles (profile_id, approved_by).
async function mergeLeaveNames(
  rows: LeaveRequest[]
): Promise<{ data: LeaveRequestRow[] | null; error: PostgrestError | null }> {
  const ids = Array.from(
    new Set(rows.flatMap((row) => [row.profile_id, row.approved_by].filter((id): id is string => !!id)))
  )
  const { data: profiles, error: profilesError } = await fetchProfilesByIds(ids)
  if (profilesError) return { data: null, error: profilesError }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const merged: LeaveRequestRow[] = rows.map((row) => ({
    ...row,
    claimant_name: nameById.get(row.profile_id) ?? 'Unknown',
    approver_name: row.approved_by ? (nameById.get(row.approved_by) ?? 'Unknown') : null,
  }))

  return { data: merged, error: null }
}

// Teacher/staff own-requests view — RLS scopes this to the caller's own rows.
export async function fetchMyLeaveRequests(
  profileId: string
): Promise<{ data: LeaveRequestRow[] | null; error: PostgrestError | null }> {
  const { data: rows, error } = await supabase
    .from('leave_requests')
    .select(LEAVE_REQUEST_COLUMNS)
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })
    .returns<LeaveRequest[]>()

  if (error || !rows) return { data: null, error }
  return mergeLeaveNames(rows)
}

export interface LeaveRequestFilters {
  status?: LeaveStatus
  leave_type?: LeaveType
  year?: number
}

// Admin/super_admin view — RLS already scopes this to "all requests" for
// those roles. Year filters by start_date, matching how balances are scoped.
export async function fetchAllLeaveRequests(
  filters: LeaveRequestFilters = {}
): Promise<{ data: LeaveRequestRow[] | null; error: PostgrestError | null }> {
  let query = supabase.from('leave_requests').select(LEAVE_REQUEST_COLUMNS)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.leave_type) query = query.eq('leave_type', filters.leave_type)
  if (filters.year) {
    query = query.gte('start_date', `${filters.year}-01-01`).lte('start_date', `${filters.year}-12-31`)
  }

  const { data: rows, error } = await query.order('submitted_at', { ascending: false }).returns<LeaveRequest[]>()

  if (error || !rows) return { data: null, error }
  return mergeLeaveNames(rows)
}

export interface LeaveRequestFormInput {
  leave_type: LeaveType
  start_date: string
  end_date: string
  segment: LeaveSegment
  reason: string | null
}

// `days` is never sent — a DB trigger computes it from start_date/end_date/
// segment. approved_by/approved_at are also trigger-owned.
export function createLeaveRequest(profileId: string, input: LeaveRequestFormInput) {
  return supabase
    .from('leave_requests')
    .insert({ profile_id: profileId, status: 'pending', ...input })
    .select(LEAVE_REQUEST_COLUMNS)
    .single()
    .returns<LeaveRequest>()
}

// Used both for a plain edit (still pending) and a resubmit (was rejected —
// caller passes status: 'pending' to flip it back). The DB trigger clears the
// approval trail and resets submitted_at when status flips back to pending —
// this client never touches those columns directly.
export interface UpdateLeaveRequestPatch extends Partial<LeaveRequestFormInput> {
  status?: 'pending'
}

export function updateLeaveRequest(id: string, patch: UpdateLeaveRequestPatch) {
  return supabase
    .from('leave_requests')
    .update(patch)
    .eq('id', id)
    .select(LEAVE_REQUEST_COLUMNS)
    .single()
    .returns<LeaveRequest>()
}

// approved_by/approved_at are set by the DB trigger, not the client.
export function approveLeaveRequest(id: string) {
  return supabase
    .from('leave_requests')
    .update({ status: 'approved' })
    .eq('id', id)
    .select(LEAVE_REQUEST_COLUMNS)
    .single()
    .returns<LeaveRequest>()
}

export function rejectLeaveRequest(id: string, reason: string) {
  return supabase
    .from('leave_requests')
    .update({ status: 'rejected', reject_reason: reason })
    .eq('id', id)
    .select(LEAVE_REQUEST_COLUMNS)
    .single()
    .returns<LeaveRequest>()
}
