import { supabase } from './supabaseClient'
import { toKLDateISO } from './helpers'

export interface ClassRow {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export interface AttendanceCondition {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export interface StudentAttendance {
  id: string
  center_id: string
  student_id: string
  attendance_date: string
  arrived_at: string | null
  arrival_temp: number | null
  arrival_photo_url: string | null
  arrival_condition_ids: string[] | null
  arrived_by: string | null
  departed_at: string | null
  departure_condition_ids: string[] | null
  pickup_by_name: string | null
  pickup_photo_url: string | null
  departed_by: string | null
  care_note: string | null
  care_photo_url: string | null
  has_medicine: boolean
  medicine_photo_url: string | null
  medicine_dose_amount: number | null
  medicine_dose_unit: string | null
  medicine_instruction: string | null
}

// Lightweight projection of `students` for the check-in grid — the full
// Student type (billingApi.ts) carries billing/contact fields Entrance never
// needs.
export interface AttendanceStudent {
  id: string
  name: string
  photo_url: string | null
  parent_name: string | null
}

const CLASS_COLUMNS = 'id, name, sort_order, active'
const CONDITION_COLUMNS = 'id, name, sort_order, active'
const ATTENDANCE_COLUMNS =
  'id, center_id, student_id, attendance_date, arrived_at, arrival_temp, arrival_photo_url, arrival_condition_ids, arrived_by, departed_at, departure_condition_ids, pickup_by_name, pickup_photo_url, departed_by, care_note, care_photo_url, has_medicine, medicine_photo_url, medicine_dose_amount, medicine_dose_unit, medicine_instruction'

// --- Classes ---
// Not center-scoped, same as claim_categories/attendance_conditions — a
// single shared lookup list managed by admins.

export function fetchClasses() {
  return supabase.from('classes').select(CLASS_COLUMNS).order('sort_order', { ascending: true }).returns<ClassRow[]>()
}

export function fetchActiveClasses() {
  return supabase
    .from('classes')
    .select(CLASS_COLUMNS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .returns<ClassRow[]>()
}

export interface CreateClassPayload {
  name: string
  active?: boolean
  sort_order?: number
}

export function createClass(payload: CreateClassPayload) {
  return supabase.from('classes').insert(payload)
}

export interface UpdateClassPatch {
  name?: string
  active?: boolean
  sort_order?: number
}

export function updateClass(id: string, patch: UpdateClassPatch) {
  return supabase.from('classes').update(patch).eq('id', id)
}

export function toggleClassActive(id: string, active: boolean) {
  return supabase.from('classes').update({ active }).eq('id', id)
}

// --- Attendance conditions ---

export function fetchConditions() {
  return supabase
    .from('attendance_conditions')
    .select(CONDITION_COLUMNS)
    .order('sort_order', { ascending: true })
    .returns<AttendanceCondition[]>()
}

export function fetchActiveConditions() {
  return supabase
    .from('attendance_conditions')
    .select(CONDITION_COLUMNS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .returns<AttendanceCondition[]>()
}

export interface CreateConditionPayload {
  name: string
  active?: boolean
  sort_order?: number
}

export function createCondition(payload: CreateConditionPayload) {
  return supabase.from('attendance_conditions').insert(payload)
}

export interface UpdateConditionPatch {
  name?: string
  active?: boolean
  sort_order?: number
}

export function updateCondition(id: string, patch: UpdateConditionPatch) {
  return supabase.from('attendance_conditions').update(patch).eq('id', id)
}

export function toggleConditionActive(id: string, active: boolean) {
  return supabase.from('attendance_conditions').update({ active }).eq('id', id)
}

// --- Students by class ---

export function fetchStudentsByClass(centerId: string, classId: string) {
  return supabase
    .from('students')
    .select('id, name, photo_url, parent_name')
    .eq('center_id', centerId)
    .eq('class_id', classId)
    .eq('active', true)
    .order('name', { ascending: true })
    .returns<AttendanceStudent[]>()
}

// --- Today's attendance ---

// Returns rows keyed by student_id so the check-in grid can do an O(1)
// lookup per avatar instead of scanning the array per render.
export async function fetchTodayAttendance(
  centerId: string,
  date: string
): Promise<{ data: Map<string, StudentAttendance> | null; error: unknown }> {
  const { data, error } = await supabase
    .from('student_attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('center_id', centerId)
    .eq('attendance_date', date)
    .returns<StudentAttendance[]>()

  if (error || !data) return { data: null, error }

  return { data: new Map(data.map((row) => [row.student_id, row])), error: null }
}

// --- Arrival / departure ---

export interface ArrivalInput {
  arrival_temp: number
  arrival_condition_ids: string[]
  arrival_photo_url: string
  care_note?: string
  care_photo_url?: string
  has_medicine: boolean
  medicine_photo_url?: string | null
  medicine_dose_amount?: number | null
  medicine_dose_unit?: string | null
  medicine_instruction?: string | null
}

// Upsert on (student_id, attendance_date) — the row may not exist yet if
// this is the student's first check-in today.
export function upsertArrival(
  centerId: string,
  studentId: string,
  attendanceDate: string,
  arrivedBy: string,
  input: ArrivalInput
) {
  return supabase
    .from('student_attendance')
    .upsert(
      {
        center_id: centerId,
        student_id: studentId,
        attendance_date: attendanceDate,
        arrived_at: new Date().toISOString(),
        arrived_by: arrivedBy,
        ...input,
      },
      { onConflict: 'student_id,attendance_date' }
    )
    .select(ATTENDANCE_COLUMNS)
    .single()
    .returns<StudentAttendance>()
}

export interface DepartureInput {
  pickup_by_name: string
  pickup_photo_url?: string
  departure_condition_ids?: string[]
}

// Plain update, not upsert — a departure can only happen after the day's
// row already exists from the arrival check-in.
export function upsertDeparture(studentId: string, attendanceDate: string, departedBy: string, input: DepartureInput) {
  return supabase
    .from('student_attendance')
    .update({
      departed_at: new Date().toISOString(),
      departed_by: departedBy,
      ...input,
    })
    .eq('student_id', studentId)
    .eq('attendance_date', attendanceDate)
    .select(ATTENDANCE_COLUMNS)
    .single()
    .returns<StudentAttendance>()
}

export type AttendancePhotoKind = 'arrival' | 'pickup' | 'care' | 'medicine'

// Fixed path per student/day/kind (no extension, contentType carries the
// real MIME type) so re-taking a photo for the same event overwrites the
// same object via upsert instead of orphaning files. Mirrors
// uploadStudentPhoto in billingApi.ts.
export async function uploadAttendancePhoto(studentId: string, kind: AttendancePhotoKind, file: File) {
  const date = toKLDateISO(new Date())
  const path = `${studentId}/${date}-${kind}`
  const { error: uploadError } = await supabase.storage
    .from('attendance-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { publicUrl: null, error: uploadError }

  const { data } = supabase.storage.from('attendance-photos').getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}
