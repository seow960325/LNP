import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { fetchProfilesByIds } from './kudosApi'

export type ClaimStatus = 'pending' | 'approved' | 'rejected'

export interface ClaimCategory {
  id: string
  name: string
  active: boolean
  sort_order: number
}

export interface Claim {
  id: string
  claimant_id: string
  category_id: string | null
  description: string
  expense_date: string
  amount: number
  receipt_held: boolean
  status: ClaimStatus
  reject_reason: string | null
  approved_by: string | null
  approved_at: string | null
  period: string
  submitted_at: string
  updated_at: string
}

export interface ClaimWithCategory extends Claim {
  claim_categories?: ClaimCategory | null
}

// Used by both the teacher's own-claims view and the admin all-claims view —
// everyone benefits from seeing who approved a claim, not just admins.
export interface ClaimRow extends ClaimWithCategory {
  claimant_name: string
  approver_name: string | null
}

const CLAIM_CATEGORY_COLUMNS = 'id, name, active, sort_order'
const CLAIM_COLUMNS =
  'id, claimant_id, category_id, description, expense_date, amount, receipt_held, status, reject_reason, approved_by, approved_at, period, submitted_at, updated_at'

// --- Categories ---

export function fetchClaimCategories() {
  return supabase
    .from('claim_categories')
    .select(CLAIM_CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true })
    .returns<ClaimCategory[]>()
}

export function fetchActiveClaimCategories() {
  return supabase
    .from('claim_categories')
    .select(CLAIM_CATEGORY_COLUMNS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .returns<ClaimCategory[]>()
}

export interface CreateClaimCategoryPayload {
  name: string
  active?: boolean
  sort_order?: number
}

export function createClaimCategory(payload: CreateClaimCategoryPayload) {
  return supabase.from('claim_categories').insert(payload)
}

export interface UpdateClaimCategoryPatch {
  name?: string
  active?: boolean
  sort_order?: number
}

export function updateClaimCategory(id: string, patch: UpdateClaimCategoryPatch) {
  return supabase.from('claim_categories').update(patch).eq('id', id)
}

export function toggleClaimCategoryActive(id: string, active: boolean) {
  return supabase.from('claim_categories').update({ active }).eq('id', id)
}

// --- Claims ---

// Resolves claimant/approver display names in a second batched query rather
// than a PostgREST embed, since claims has two FKs into profiles (claimant_id,
// approved_by) and embedding both unambiguously needs the live FK constraint
// names, which we don't have on hand.
async function mergeClaimNames(
  rows: ClaimWithCategory[]
): Promise<{ data: ClaimRow[] | null; error: PostgrestError | null }> {
  const ids = Array.from(
    new Set(rows.flatMap((row) => [row.claimant_id, row.approved_by].filter((id): id is string => !!id)))
  )
  const { data: profiles, error: profilesError } = await fetchProfilesByIds(ids)
  if (profilesError) return { data: null, error: profilesError }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const merged: ClaimRow[] = rows.map((row) => ({
    ...row,
    claimant_name: nameById.get(row.claimant_id) ?? 'Unknown',
    approver_name: row.approved_by ? (nameById.get(row.approved_by) ?? 'Unknown') : null,
  }))

  return { data: merged, error: null }
}

// Teacher/staff own-claims view — RLS scopes this to the caller's own rows.
export async function fetchMyClaims(
  claimantId: string
): Promise<{ data: ClaimRow[] | null; error: PostgrestError | null }> {
  const { data: rows, error } = await supabase
    .from('claims')
    .select(`${CLAIM_COLUMNS}, claim_categories(${CLAIM_CATEGORY_COLUMNS})`)
    .eq('claimant_id', claimantId)
    .order('submitted_at', { ascending: false })
    .returns<ClaimWithCategory[]>()

  if (error || !rows) return { data: null, error }
  return mergeClaimNames(rows)
}

export interface ClaimFilters {
  status?: ClaimStatus
  period?: string
}

// Admin/super_admin view — RLS already scopes this to "all claims" for those
// roles.
export async function fetchAllClaims(
  filters: ClaimFilters = {}
): Promise<{ data: ClaimRow[] | null; error: PostgrestError | null }> {
  let query = supabase.from('claims').select(`${CLAIM_COLUMNS}, claim_categories(${CLAIM_CATEGORY_COLUMNS})`)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.period) query = query.eq('period', filters.period)

  const { data: rows, error } = await query
    .order('submitted_at', { ascending: false })
    .returns<ClaimWithCategory[]>()

  if (error || !rows) return { data: null, error }
  return mergeClaimNames(rows)
}

// receipt_held is deliberately excluded — it's an admin-only verification
// flag (ticked after checking the physical receipt), never set by the
// claimant. Inserts omit it entirely so the DB default (false) applies; see
// setClaimReceiptHeld for the admin-only toggle.
export interface ClaimFormInput {
  category_id: string
  description: string
  expense_date: string
  amount: number
}

export function createClaim(claimantId: string, input: ClaimFormInput) {
  return supabase
    .from('claims')
    .insert({ claimant_id: claimantId, status: 'pending', ...input })
    .select(CLAIM_COLUMNS)
    .single()
    .returns<Claim>()
}

// Used both for a plain edit (still pending) and a resubmit (was rejected —
// caller passes status: 'pending' to flip it back). Per spec, the DB trigger
// is responsible for clearing the approval trail and resetting submitted_at
// when status flips back to pending — this client never touches those columns.
export interface UpdateClaimPatch extends Partial<ClaimFormInput> {
  status?: 'pending'
}

export function updateClaim(id: string, patch: UpdateClaimPatch) {
  return supabase.from('claims').update(patch).eq('id', id).select(CLAIM_COLUMNS).single().returns<Claim>()
}

// approved_by/approved_at are set by the DB trigger, not the client.
export function approveClaim(id: string) {
  return supabase
    .from('claims')
    .update({ status: 'approved' })
    .eq('id', id)
    .select(CLAIM_COLUMNS)
    .single()
    .returns<Claim>()
}

export function rejectClaim(id: string, reason: string) {
  return supabase
    .from('claims')
    .update({ status: 'rejected', reject_reason: reason })
    .eq('id', id)
    .select(CLAIM_COLUMNS)
    .single()
    .returns<Claim>()
}

// Admin-only verification toggle — ticked after the physical receipt has
// been checked. The DB also guards this against non-admins; the UI only
// exposes it to admin/super_admin in the first place.
export function setClaimReceiptHeld(id: string, receiptHeld: boolean) {
  return supabase
    .from('claims')
    .update({ receipt_held: receiptHeld })
    .eq('id', id)
    .select(CLAIM_COLUMNS)
    .single()
    .returns<Claim>()
}
