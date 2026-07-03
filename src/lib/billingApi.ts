import { supabase } from './supabaseClient'

export interface FeePackage {
  id: string
  center_id: string
  name: string
  default_price: number
  description: string | null
  active: boolean
  created_at: string
}

export interface Student {
  id: string
  center_id: string
  name: string
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  package_id: string | null
  enrolled_at: string | null
  dob: string | null
  notes: string | null
  active: boolean
  created_at: string
}

export interface StudentWithPackage extends Student {
  fee_packages?: FeePackage | null
}

const PACKAGE_COLUMNS = 'id, center_id, name, default_price, description, active, created_at'
const STUDENT_COLUMNS = 'id, center_id, name, parent_name, parent_phone, parent_email, package_id, enrolled_at, dob, notes, active, created_at'

export function fetchFeePackages(centerId: string) {
  return supabase
    .from('fee_packages')
    .select(PACKAGE_COLUMNS)
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .returns<FeePackage[]>()
}

export function fetchActiveFeePackages(centerId: string) {
  return supabase
    .from('fee_packages')
    .select(PACKAGE_COLUMNS)
    .eq('center_id', centerId)
    .eq('active', true)
    .order('name', { ascending: true })
    .returns<FeePackage[]>()
}

export interface CreateFeePackagePayload {
  name: string
  default_price: number
  description?: string
}

export function createFeePackage(centerId: string, payload: CreateFeePackagePayload) {
  return supabase.from('fee_packages').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateFeePackagePatch {
  name?: string
  default_price?: number
  description?: string
  active?: boolean
}

export function updateFeePackage(id: string, patch: UpdateFeePackagePatch) {
  return supabase.from('fee_packages').update(patch).eq('id', id)
}

export function toggleFeePackageActive(id: string, active: boolean) {
  return supabase.from('fee_packages').update({ active }).eq('id', id)
}

export function fetchStudents(centerId: string) {
  return supabase
    .from('students')
    .select(`${STUDENT_COLUMNS}, fee_packages!left(${PACKAGE_COLUMNS})`)
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .returns<StudentWithPackage[]>()
}

export interface CreateStudentPayload {
  name: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  package_id?: string
  enrolled_at?: string
  dob?: string
  notes?: string
}

export function createStudent(centerId: string, payload: CreateStudentPayload) {
  return supabase.from('students').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateStudentPatch {
  name?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  package_id?: string
  enrolled_at?: string
  dob?: string
  notes?: string
  active?: boolean
}

export function updateStudent(id: string, patch: UpdateStudentPatch) {
  return supabase.from('students').update(patch).eq('id', id)
}

export function toggleStudentActive(id: string, active: boolean) {
  return supabase.from('students').update({ active }).eq('id', id)
}

export function deleteFeePackage(id: string) {
  return supabase.from('fee_packages').delete().eq('id', id)
}

export function deleteStudent(id: string) {
  return supabase.from('students').delete().eq('id', id)
}
