import { supabase } from './supabaseClient'
import { shiftDateISO } from './helpers'
import type { CenterMember } from './kudosApi'

// Roster-only member list — teachers and the principal (admin) are the only
// actual working staff who take shifts. super_admin (David — shareholder,
// not an employee), shareholder, staff (role being phased out), and parent
// are excluded here even though they may appear in the general center-member
// list (fetchCenterMembers in kudosApi.ts) used by Kudos/Board/Attendance.
export function fetchRosterMembers(centerId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, title')
    .eq('center_id', centerId)
    .eq('active', true)
    .in('role', ['teacher', 'admin'])
    .order('full_name')
    .returns<CenterMember[]>()
}

export interface RosterShiftRow {
  id: string
  user_id: string
  date: string
}

export function fetchWeekShifts(centerId: string, weekStartDate: string) {
  const weekEndDate = shiftDateISO(weekStartDate, 5) // Mon..Sat, 6 days

  return supabase
    .from('roster_shifts')
    .select('id, user_id, date')
    .eq('center_id', centerId)
    .gte('date', weekStartDate)
    .lte('date', weekEndDate)
    .returns<RosterShiftRow[]>()
}

export function addShift(centerId: string, userId: string, date: string) {
  // This center works full-day with no shift splitting — shift_start/shift_end
  // are NOT NULL placeholder columns and are never shown in the UI.
  return supabase.from('roster_shifts').insert({
    center_id: centerId,
    user_id: userId,
    date,
    shift_start: '00:00',
    shift_end: '00:00',
  })
}

export function removeShift(shiftId: string) {
  return supabase.from('roster_shifts').delete().eq('id', shiftId)
}

export interface RosterLeaveRow {
  user_id: string
  type: 'annual_leave' | 'medical_leave'
  start_date: string
  end_date: string | null
}

// Read-only overlay for the roster — approved leave never touches
// roster_shifts. end_date can be null (single-day leave), so the range
// filter below only narrows to candidate rows; RosterPage does the exact
// per-day containment check using (end_date ?? start_date).
export function fetchApprovedLeave(centerId: string, weekStartDate: string, weekEndDate: string) {
  return supabase
    .from('requests')
    .select('user_id, type, start_date, end_date')
    .eq('center_id', centerId)
    .eq('status', 'approved')
    .in('type', ['annual_leave', 'medical_leave'])
    .lte('start_date', weekEndDate)
    .or(`end_date.gte.${weekStartDate},end_date.is.null`)
    .returns<RosterLeaveRow[]>()
}
