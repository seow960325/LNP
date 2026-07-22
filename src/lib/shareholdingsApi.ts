import { supabase } from './supabaseClient'

export interface Shareholding {
  id: string
  display_name: string
  share_code: string | null
  capital: number
  profile_id: string | null
  staff_member_id: string | null
  phone: string | null
  email: string | null
  photo_path: string | null
  active: boolean
}

// Contact fields pulled from the linked staff_members row when
// staff_member_id is set — editing either place then shows up in both.
// profile_avatar_url comes from a second-level embed (staff_members ->
// profiles) — the photo fallback chain per staff member is their own
// photo_path, then their linked login's avatar_url.
export interface LinkedStaffContact {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  photo_path: string | null
  profile_avatar_url: string | null
}

export interface ShareholderDirectoryEntry extends Shareholding {
  linked_staff: LinkedStaffContact | null
}

interface LinkedStaffRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  photo_path: string | null
  profiles: { avatar_url: string | null } | null
}

interface ShareholdingRow extends Shareholding {
  linked_staff: LinkedStaffRow | null
}

function toDirectoryEntry(row: ShareholdingRow): ShareholderDirectoryEntry {
  const { linked_staff, ...rest } = row
  if (!linked_staff) return { ...rest, linked_staff: null }
  const { profiles, ...staffRest } = linked_staff
  return { ...rest, linked_staff: { ...staffRest, profile_avatar_url: profiles?.avatar_url ?? null } }
}

const SHAREHOLDING_COLUMNS = 'id, display_name, share_code, capital, profile_id, staff_member_id, phone, email, photo_path, active'
const SHAREHOLDING_DIRECTORY_SELECT = `${SHAREHOLDING_COLUMNS}, linked_staff:staff_members(id, full_name, phone, email, photo_path, profiles(avatar_url))`

// No .returns()/.single() — the client has no Database generic to check the
// cast against, so the assertion below is just as honest about that as
// chaining .returns<T[]>() would be, without implying a compile-time
// guarantee that isn't there.
export async function fetchShareholdings() {
  const result = await supabase.from('shareholdings').select(SHAREHOLDING_COLUMNS).eq('active', true)

  return result as { data: Shareholding[] | null; error: unknown }
}

export async function fetchShareholdingsDirectory(centerId: string) {
  const { data, error } = (await supabase
    .from('shareholdings')
    .select(SHAREHOLDING_DIRECTORY_SELECT)
    .eq('center_id', centerId)
    .eq('active', true)
    .order('capital', { ascending: false })) as unknown as { data: ShareholdingRow[] | null; error: unknown }

  if (error || !data) return { data: null, error }
  return { data: data.map(toDirectoryEntry), error: null }
}

export async function fetchShareholderById(id: string) {
  const { data, error } = (await supabase
    .from('shareholdings')
    .select(SHAREHOLDING_DIRECTORY_SELECT)
    .eq('id', id)
    .maybeSingle()) as unknown as { data: ShareholdingRow | null; error: unknown }

  if (error || !data) return { data: null, error }
  return { data: toDirectoryEntry(data), error: null }
}

export interface UpdateShareholdingPatch {
  phone?: string | null
  email?: string | null
  photo_path?: string | null
  staff_member_id?: string | null
}

export function updateShareholding(id: string, patch: UpdateShareholdingPatch) {
  return supabase.from('shareholdings').update(patch).eq('id', id)
}
