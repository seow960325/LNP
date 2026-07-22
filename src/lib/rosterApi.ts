import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { buildSlots, computeAssignmentsForDate, orderPool } from './rosterAlgorithm'

// --- Duty types ---

export interface DutyType {
  id: string
  name: string
  headcount: number
  sort_order: number
  active: boolean
}

const DUTY_TYPE_COLUMNS = 'id, name, headcount, sort_order, active'

export function fetchDutyTypes() {
  return supabase
    .from('duty_types')
    .select(DUTY_TYPE_COLUMNS)
    .order('sort_order', { ascending: true })
    .returns<DutyType[]>()
}

export function fetchActiveDutyTypes() {
  return supabase
    .from('duty_types')
    .select(DUTY_TYPE_COLUMNS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .returns<DutyType[]>()
}

export interface CreateDutyTypePayload {
  name: string
  headcount?: number
  sort_order?: number
  active?: boolean
}

export function createDutyType(payload: CreateDutyTypePayload) {
  return supabase.from('duty_types').insert(payload)
}

export interface UpdateDutyTypePatch {
  name?: string
  headcount?: number
  sort_order?: number
  active?: boolean
}

export function updateDutyType(id: string, patch: UpdateDutyTypePatch) {
  return supabase.from('duty_types').update(patch).eq('id', id)
}

export function toggleDutyTypeActive(id: string, active: boolean) {
  return supabase.from('duty_types').update({ active }).eq('id', id)
}

// --- Rotation pool ---

export interface RotationPoolMember {
  id: string
  full_name: string
  display_name: string | null
}

// The rotation pool: active staff opted into duty roster via
// staff_members.in_duty_roster (toggled from the staff directory). Ordered
// by full_name so the DB round-trip already matches the algorithm's stable
// order in the common case, though callers should still run this through
// orderPool() before feeding it to computeAssignmentsForDate — that's the
// one true source of the tie-break rule.
export function fetchRotationPool(centerId: string) {
  return supabase
    .from('staff_members')
    .select('id, full_name, display_name')
    .eq('center_id', centerId)
    .eq('active', true)
    .eq('in_duty_roster', true)
    .order('full_name')
    .returns<RotationPoolMember[]>()
}

// --- Active staff (for the cell picker) ---

export interface RosterStaffOption {
  id: string
  full_name: string
  display_name: string | null
  in_duty_roster: boolean
}

// Every active staff member, not just those in the rotation pool — the cell
// picker lets an admin assign anyone active to cover a slot, even someone not
// normally on the roster. in_duty_roster is included so the picker can list
// pool members first.
export function fetchActiveStaffMembers(centerId: string) {
  return supabase
    .from('staff_members')
    .select('id, full_name, display_name, in_duty_roster')
    .eq('center_id', centerId)
    .eq('active', true)
    .order('full_name')
    .returns<RosterStaffOption[]>()
}

// --- Duty assignments ---

export interface DutyAssignment {
  id: string
  work_date: string
  duty_type_id: string
  staff_member_id: string
  is_manual: boolean
}

export interface DutyAssignmentRow extends DutyAssignment {
  full_name: string
  display_name: string | null
}

export async function fetchWeekAssignments(
  weekStart: string,
  weekEnd: string
): Promise<{ data: DutyAssignmentRow[] | null; error: PostgrestError | null }> {
  const { data: rows, error } = await supabase
    .from('duty_assignments')
    .select('id, work_date, duty_type_id, staff_member_id, is_manual')
    .gte('work_date', weekStart)
    .lte('work_date', weekEnd)
    .order('work_date', { ascending: true })
    .returns<DutyAssignment[]>()

  if (error || !rows) return { data: null, error }

  const ids = Array.from(new Set(rows.map((row) => row.staff_member_id)))
  type StaffLookup = { id: string; full_name: string; display_name: string | null }
  const { data: staffMembers, error: staffMembersError } =
    ids.length === 0
      ? { data: [] as StaffLookup[], error: null }
      : await supabase.from('staff_members').select('id, full_name, display_name').in('id', ids).returns<StaffLookup[]>()
  if (staffMembersError) return { data: null, error: staffMembersError }

  const staffById = new Map((staffMembers ?? []).map((s) => [s.id, s]))
  const merged: DutyAssignmentRow[] = rows.map((row) => {
    const staff = staffById.get(row.staff_member_id)
    return {
      ...row,
      full_name: staff?.full_name ?? 'Unknown',
      display_name: staff?.display_name ?? null,
    }
  })

  return { data: merged, error: null }
}

// Generates (or regenerates) a Mon-Fri week of assignments.
//
// Manual cells are preserved: any staff member with an is_manual=true row on a
// given date is skipped entirely by the recompute for that date (their
// existing row, whatever duty it points to, is left untouched) — only the
// is_manual=false rows for the week are deleted and reinserted. This is
// only collision-safe because manual edits are always made via
// swapDutyAssignments below, which moves exactly two people between their
// two slots — so the set of duty_type_ids "consumed" by manual rows on a
// date always exactly matches removing those people (and only those
// people) from the pool the formula would otherwise fill those same slots
// with.
export async function generateWeek(
  centerId: string,
  weekDates: string[]
): Promise<{ error: string | null }> {
  const [dutyTypesRes, poolRes] = await Promise.all([fetchActiveDutyTypes(), fetchRotationPool(centerId)])

  if (dutyTypesRes.error || !dutyTypesRes.data) return { error: 'Could not load duty types. Please try again.' }
  if (poolRes.error || !poolRes.data) return { error: 'Could not load the rotation pool. Please try again.' }

  const slots = buildSlots(dutyTypesRes.data)
  const orderedPool = orderPool(poolRes.data)

  if (slots.length !== orderedPool.length) {
    return {
      error: `Duty slots (${slots.length}) must equal ticked staff (${orderedPool.length}). Adjust headcount or ticked staff.`,
    }
  }

  const weekStart = weekDates[0]
  const weekEnd = weekDates[weekDates.length - 1]

  const { data: manualRows, error: manualError } = await supabase
    .from('duty_assignments')
    .select('work_date, staff_member_id')
    .gte('work_date', weekStart)
    .lte('work_date', weekEnd)
    .eq('is_manual', true)
    .returns<{ work_date: string; staff_member_id: string }[]>()

  if (manualError) return { error: 'Could not check existing manual assignments. Please try again.' }

  const pinnedByDate = new Map<string, Set<string>>()
  for (const row of manualRows ?? []) {
    const set = pinnedByDate.get(row.work_date) ?? new Set<string>()
    set.add(row.staff_member_id)
    pinnedByDate.set(row.work_date, set)
  }

  const rowsToInsert: { work_date: string; duty_type_id: string; staff_member_id: string; is_manual: boolean }[] = []
  for (const date of weekDates) {
    const pinned = pinnedByDate.get(date) ?? new Set<string>()
    for (const assignment of computeAssignmentsForDate(orderedPool, slots, date)) {
      if (pinned.has(assignment.staff_member_id)) continue
      rowsToInsert.push({
        work_date: date,
        duty_type_id: assignment.duty_type_id,
        staff_member_id: assignment.staff_member_id,
        is_manual: false,
      })
    }
  }

  // Atomic server-side write (Postgres function, one transaction) — see
  // supabase/migrations/20260708090100_roster_write_rpcs.sql. Fixes
  // AUDIT_PHASE2 H4: delete-then-insert used to be two independent
  // client-side calls, so a failed insert left the week's non-manual roster
  // completely empty with nothing to replace it. A failed RPC call rolls
  // back the delete too — the previous week is left untouched.
  const { error: applyError } = await supabase.rpc('apply_roster_week', {
    p_week_start: weekStart,
    p_week_end: weekEnd,
    p_rows: rowsToInsert,
  })

  if (applyError) {
    return { error: applyError.message || 'Could not save the new assignments. Please try again.' }
  }

  return { error: null }
}

// Manual reassignment for one date: swaps the duty_type_id of two people's
// rows and marks both is_manual=true. This is a swap rather than a free
// overwrite so the one-duty-per-person-per-day bijection that the
// generation algorithm relies on is never broken by a manual edit — see
// generateWeek's note above.
//
// Atomic server-side write (Postgres function, one transaction) — see
// supabase/migrations/20260708090100_roster_write_rpcs.sql. Fixes
// AUDIT_PHASE2 M3: this used to be two independent client-side UPDATEs, so a
// failure between them left one person moved and the other not. The RPC also
// reads each person's CURRENT duty_type_id itself (row-locked) instead of
// trusting values the caller read earlier — the duty_type_id params this
// function used to take are gone, since the server now sources them fresh.
export async function swapDutyAssignments(
  workDate: string,
  staffIdA: string,
  staffIdB: string
): Promise<{ error: PostgrestError | null }> {
  if (staffIdA === staffIdB) return { error: null }

  const { error } = await supabase.rpc('swap_duty_assignments', {
    p_work_date: workDate,
    p_staff_a: staffIdA,
    p_staff_b: staffIdB,
  })

  return { error }
}

// Reassigns exactly one cell (one duty_type_id slot on one work_date) to a
// different staff member — unlike swapDutyAssignments above, this never
// touches any other row. If assignmentId is null the slot has no row yet
// (an empty cell), so this inserts one instead of updating; otherwise it
// updates that row in place and marks it is_manual so generateWeek's
// pinning logic (see its comment above) leaves it alone on the next
// regenerate. The (work_date, staff_member_id) unique constraint means this
// fails with Postgres code 23505 if the chosen person already has a
// different slot that day — callers must surface that as a normal
// "already on duty" message, not a generic error.
export async function reassignDutyCell(params: {
  assignmentId: string | null
  workDate: string
  dutyTypeId: string
  centerId: string
  staffMemberId: string
}): Promise<{ data: { id: string } | null; error: PostgrestError | null }> {
  if (params.assignmentId) {
    const { data, error } = await supabase
      .from('duty_assignments')
      .update({ staff_member_id: params.staffMemberId, is_manual: true })
      .eq('id', params.assignmentId)
      .select('id')
      .single()
    return { data, error }
  }

  const { data, error } = await supabase
    .from('duty_assignments')
    .insert({
      work_date: params.workDate,
      duty_type_id: params.dutyTypeId,
      staff_member_id: params.staffMemberId,
      is_manual: true,
      center_id: params.centerId,
    })
    .select('id')
    .single()
  return { data, error }
}
