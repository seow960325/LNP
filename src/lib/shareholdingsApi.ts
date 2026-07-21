import { supabase } from './supabaseClient'

export interface Shareholding {
  display_name: string
  share_code: string | null
  capital: number
  profile_id: string | null
}

// No .returns()/.single() — the client has no Database generic to check the
// cast against, so the assertion below is just as honest about that as
// chaining .returns<T[]>() would be, without implying a compile-time
// guarantee that isn't there.
export async function fetchShareholdings() {
  const result = await supabase.from('shareholdings').select('display_name, share_code, capital, profile_id').eq('active', true)

  return result as { data: Shareholding[] | null; error: unknown }
}
