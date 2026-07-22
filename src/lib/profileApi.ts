import { supabase } from './supabaseClient'
import type { Profile, StaffMember, UserRole } from '../types'

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file.'
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Image must be smaller than 2MB.'
  }
  return null
}

// Fixed path per user (no extension, contentType carries the real MIME type)
// so re-uploading always overwrites the same object via upsert, instead of
// leaving old files orphaned in the bucket under a different extension.
export async function uploadAvatar(userId: string, file: File) {
  const path = `${userId}/avatar`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { publicUrl: null, error: uploadError }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

export interface ProfilePatch {
  full_name?: string
  phone?: string | null
  avatar_url?: string
}

export function updateOwnProfile(userId: string, patch: ProfilePatch) {
  return supabase.from('profiles').update(patch).eq('id', userId)
}

export interface StaffDirectoryEntry {
  id: string
  full_name: string
  role: UserRole
  title: string | null
  phone: string | null
  avatar_url: string | null
  // Internal protection flag only — never render an "owner" label/badge
  // anywhere. David's displayed title stays "Shareholder" as normal.
  is_app_owner: boolean
}

export function fetchStaffDirectory(centerId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, role, title, phone, avatar_url, is_app_owner')
    .eq('center_id', centerId)
    .eq('active', true)
    .order('full_name')
    .returns<StaffDirectoryEntry[]>()
}

export async function fetchProfileById(id: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  return { data: data as Profile | null, error }
}

// staff_members is the directory of record (name/job title/contact info for
// everyone who works here); profiles is login accounts only. profile_id
// optionally links a row to its login, when one exists.
const STAFF_MEMBER_COLUMNS =
  'id, center_id, profile_id, full_name, job_title, phone, email, zoho_account_id, in_duty_roster, active, notes, created_at'

export function fetchStaffMembers(centerId: string) {
  return supabase
    .from('staff_members')
    .select(STAFF_MEMBER_COLUMNS)
    .eq('center_id', centerId)
    .order('full_name', { ascending: true })
    .returns<StaffMember[]>()
}

export interface CreateStaffMemberPayload {
  full_name: string
  job_title?: string
  phone?: string
  email?: string
  in_duty_roster?: boolean
  notes?: string
}

export function createStaffMember(centerId: string, payload: CreateStaffMemberPayload) {
  return supabase.from('staff_members').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateStaffMemberPatch {
  full_name?: string
  job_title?: string
  phone?: string
  email?: string
  in_duty_roster?: boolean
  active?: boolean
  notes?: string
  profile_id?: string | null
}

export function updateStaffMember(id: string, patch: UpdateStaffMemberPatch) {
  return supabase.from('staff_members').update(patch).eq('id', id)
}

export function toggleStaffMemberActive(id: string, active: boolean) {
  return supabase.from('staff_members').update({ active }).eq('id', id)
}

// Candidates for the "Link login" picker — the caller (StaffDirectoryPage)
// already has the full staff_members list loaded and filters out any
// profile_id already claimed by another row client-side.
export interface LinkableProfile {
  id: string
  full_name: string
  role: UserRole
}

export function fetchProfilesForLinking(centerId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('center_id', centerId)
    .eq('active', true)
    .order('full_name')
    .returns<LinkableProfile[]>()
}
