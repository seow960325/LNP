import { supabase } from './supabaseClient'
import { shiftDateISO } from './helpers'

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
