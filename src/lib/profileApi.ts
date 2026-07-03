import { supabase } from './supabaseClient'
import type { Profile, UserRole } from '../types'

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
