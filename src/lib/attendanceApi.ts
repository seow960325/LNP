import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { fetchCenterMembers } from './kudosApi'
import { toKLDateISO } from './helpers'

export type AttendanceSource = 'app' | 'manual'

export interface AttendanceRow {
  id: string
  center_id: string
  user_id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  source: AttendanceSource
  note: string | null
}

const ATTENDANCE_COLUMNS = 'id, center_id, user_id, date, clock_in, clock_out, source, note'

export function getTodayAttendance(centerId: string, userId: string) {
  const today = toKLDateISO(new Date())
  return supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('center_id', centerId)
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()
    .returns<AttendanceRow>()
}

export async function clockIn(centerId: string, userId: string) {
  const today = toKLDateISO(new Date())

  // Guard against creating a second row for today — the table has no unique
  // constraint on (user_id, date), so this check has to happen client-side.
  const { data: existing, error: fetchError } = await getTodayAttendance(centerId, userId)
  if (fetchError) return { data: null, error: fetchError }
  if (existing) return { data: existing, error: null }

  return supabase
    .from('attendance')
    .insert({
      center_id: centerId,
      user_id: userId,
      date: today,
      clock_in: new Date().toISOString(),
      source: 'app' satisfies AttendanceSource,
    })
    .select(ATTENDANCE_COLUMNS)
    .single()
    .returns<AttendanceRow>()
}

export function clockOut(attendanceId: string) {
  return supabase
    .from('attendance')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', attendanceId)
    .select(ATTENDANCE_COLUMNS)
    .single()
    .returns<AttendanceRow>()
}

export interface MemberAttendance {
  user_id: string
  full_name: string
  attendance_id: string | null
  clock_in: string | null
  clock_out: string | null
  note: string | null
}

export async function fetchDayAttendanceForCenter(
  centerId: string,
  dateISO: string
): Promise<{ data: MemberAttendance[] | null; error: PostgrestError | null }> {
  const [{ data: members, error: membersError }, { data: rows, error: rowsError }] = await Promise.all([
    fetchCenterMembers(centerId),
    supabase
      .from('attendance')
      .select('id, user_id, clock_in, clock_out, note')
      .eq('center_id', centerId)
      .eq('date', dateISO)
      .returns<Pick<AttendanceRow, 'id' | 'user_id' | 'clock_in' | 'clock_out' | 'note'>[]>(),
  ])

  if (membersError) return { data: null, error: membersError }
  if (rowsError) return { data: null, error: rowsError }

  const byUserId = new Map((rows ?? []).map((row) => [row.user_id, row]))

  const merged: MemberAttendance[] = (members ?? []).map((member) => {
    const row = byUserId.get(member.id)
    return {
      user_id: member.id,
      full_name: member.full_name,
      attendance_id: row?.id ?? null,
      clock_in: row?.clock_in ?? null,
      clock_out: row?.clock_out ?? null,
      note: row?.note ?? null,
    }
  })

  return { data: merged, error: null }
}

export async function adminUpsertAttendance(
  centerId: string,
  userId: string,
  dateISO: string,
  clockInISO: string | null,
  clockOutISO: string | null,
  note: string | null
) {
  const { data: existing, error: fetchError } = await supabase
    .from('attendance')
    .select('id')
    .eq('center_id', centerId)
    .eq('user_id', userId)
    .eq('date', dateISO)
    .maybeSingle()
    .returns<{ id: string }>()

  if (fetchError) return { data: null, error: fetchError }

  const patch = {
    clock_in: clockInISO,
    clock_out: clockOutISO,
    note,
    source: 'manual' satisfies AttendanceSource,
  }

  if (existing) {
    return supabase
      .from('attendance')
      .update(patch)
      .eq('id', existing.id)
      .select(ATTENDANCE_COLUMNS)
      .single()
      .returns<AttendanceRow>()
  }

  return supabase
    .from('attendance')
    .insert({ center_id: centerId, user_id: userId, date: dateISO, ...patch })
    .select(ATTENDANCE_COLUMNS)
    .single()
    .returns<AttendanceRow>()
}
