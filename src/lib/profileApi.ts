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

  if (uploadError) return { path: null, error: uploadError }
  return { path, error: null }
}

// avatars is a private bucket — profiles.avatar_url stores a storage path for
// every upload going forward, but rows written before the bucket went private
// still hold a full public URL. Detect which by shape: a path never starts
// with a scheme, so `http(s)://` is the discriminator — pass it through
// as-is, otherwise sign it fresh (matches getDirectoryPhotoSignedUrl's
// pattern for the same private-bucket problem on staff/shareholder photos).
export async function resolveAvatarUrl(avatarValue: string | null): Promise<string | null> {
  if (!avatarValue) return null
  if (/^https?:\/\//i.test(avatarValue)) return avatarValue
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(avatarValue, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export interface ProfilePatch {
  full_name?: string
  phone?: string | null
  avatar_url?: string
}

export function updateOwnProfile(userId: string, patch: ProfilePatch) {
  return supabase.from('profiles').update(patch).eq('id', userId)
}

// profiles select excludes phone/email — column-level grants (see H3
// migration) revoke SELECT on those columns for anon/authenticated. Only
// get_own_profile() (AuthContext) can see the caller's own contact fields.
export const PROFILE_COLUMNS =
  'id, center_id, full_name, role, title, avatar_url, active, created_at, must_change_password, is_paid_employee, is_app_owner, in_duty_roster'

export type ProfileSummary = Omit<Profile, 'phone' | 'email'>

export async function fetchProfileById(id: string) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
  return { data: data as ProfileSummary | null, error }
}

// staff_members is the directory of record (name/job title/contact info for
// everyone who works here); profiles is login accounts only. profile_id
// optionally links a row to its login, when one exists.
const STAFF_MEMBER_COLUMNS =
  'id, center_id, profile_id, full_name, display_name, job_title, job_title_id, in_duty_roster, in_directory, photo_path, active, created_at'

// staff_members.phone/email are column-grant-revoked for anon/authenticated
// (see H3 migration) — contacts are fetched separately via the staff_contacts()
// SECURITY DEFINER RPC, which applies its own role-based visibility, then
// merged onto directory rows client-side.
export async function fetchStaffContacts(
  centerId: string,
): Promise<Map<string, { phone: string | null; email: string | null }>> {
  const { data, error } = await supabase.rpc('staff_contacts', { p_center_id: centerId })
  if (error || !data) return new Map()

  const contacts = data as { staff_member_id: string; phone: string | null; email: string | null }[]
  return new Map(contacts.map((c) => [c.staff_member_id, { phone: c.phone, email: c.email }]))
}

export function fetchStaffMembers(centerId: string) {
  return supabase
    .from('staff_members')
    .select(STAFF_MEMBER_COLUMNS)
    .eq('center_id', centerId)
    .order('full_name', { ascending: true })
    .returns<StaffMember[]>()
}

// Directory-flavored staff row — adds the linked login's avatar + activation
// state via an embedded select on profiles!staff_members_profile_id_fkey.
// Kept separate from StaffMember/fetchStaffMembers/STAFF_MEMBER_COLUMNS so
// the roster fetchers and other plain consumers are untouched.
export interface StaffDirectoryMember extends StaffMember {
  linked_avatar_url: string | null
  must_change_password: boolean | null
  // Resolved via job_title_id -> job_titles.name — the same authoritative
  // source the job-title tiles group/label by. The legacy free-text
  // job_title column is populated independently and can be null for staff
  // assigned a job title through the UI (which only sets job_title_id), so
  // display must never read job_title directly.
  job_title_name: string | null
}

interface StaffDirectoryRow extends StaffMember {
  profiles: { avatar_url: string | null; must_change_password: boolean } | null
  job_titles: { name: string } | null
}

function toDirectoryMember(
  row: StaffDirectoryRow,
  contacts: Map<string, { phone: string | null; email: string | null }>,
): StaffDirectoryMember {
  const { profiles, job_titles, ...rest } = row
  const contact = contacts.get(row.id)
  return {
    ...rest,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    linked_avatar_url: profiles?.avatar_url ?? null,
    must_change_password: profiles?.must_change_password ?? null,
    job_title_name: job_titles?.name ?? null,
  }
}

// forTiles=true (the tiled Directory — job-title tile counts AND the
// card list within a tile) filters to active in_directory rows, so
// deactivated staff and owner-only-login rows never appear or get counted
// there. forTiles=false (Past Staff) returns every row regardless, same
// photo/badge fidelity, filtered to inactive client-side.
export async function fetchStaffDirectoryMembers(centerId: string, forTiles: boolean) {
  let query = supabase
    .from('staff_members')
    .select(`${STAFF_MEMBER_COLUMNS}, profiles(avatar_url, must_change_password), job_titles(name)`)
    .eq('center_id', centerId)
  if (forTiles) query = query.eq('in_directory', true).eq('active', true)

  const { data, error } = await query.order('full_name', { ascending: true }).returns<StaffDirectoryRow[]>()

  if (error || !data) return { data: null, error }
  const contacts = await fetchStaffContacts(centerId)
  return { data: data.map((row) => toDirectoryMember(row, contacts)), error: null }
}

export async function fetchStaffMemberById(id: string) {
  const { data, error } = await supabase
    .from('staff_members')
    .select(`${STAFF_MEMBER_COLUMNS}, profiles(avatar_url, must_change_password), job_titles(name)`)
    .eq('id', id)
    .maybeSingle<StaffDirectoryRow>()

  if (error || !data) return { data: null, error }
  const contacts = await fetchStaffContacts(data.center_id)
  return { data: toDirectoryMember(data, contacts), error: null }
}

export interface CreateStaffMemberPayload {
  full_name: string
  display_name?: string | null
  job_title?: string
  job_title_id?: string | null
  phone?: string
  email?: string
  in_duty_roster?: boolean
}

export function createStaffMember(centerId: string, payload: CreateStaffMemberPayload) {
  return supabase.from('staff_members').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateStaffMemberPatch {
  full_name?: string
  display_name?: string | null
  job_title?: string
  job_title_id?: string | null
  phone?: string
  email?: string
  in_duty_roster?: boolean
  active?: boolean
  profile_id?: string | null
  photo_path?: string | null
}

export function updateStaffMember(id: string, patch: UpdateStaffMemberPatch) {
  return supabase.from('staff_members').update(patch).eq('id', id)
}

export function toggleStaffMemberActive(id: string, active: boolean) {
  return supabase.from('staff_members').update({ active }).eq('id', id)
}

// super_admin only at the DB level (staff_members_delete RLS policy) — a
// BEFORE DELETE trigger also raises if the row has a linked login or any
// duty_assignments, so this only ever succeeds for empty placeholder rows.
// The DB is the sole authority here; no client-side eligibility check.
export function deleteStaffMember(id: string) {
  return supabase.from('staff_members').delete().eq('id', id)
}

// Candidates for the "Link login" picker — the caller (StaffJobTitleMembersPage)
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
