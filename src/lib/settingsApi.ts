import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface WifiInfo {
  ssid: string
  password: string
}

const EMPTY_WIFI: WifiInfo = { ssid: '', password: '' }

export async function getWifi(centerId: string): Promise<{ data: WifiInfo; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('center_settings')
    .select('value')
    .eq('center_id', centerId)
    .eq('key', 'wifi')
    .maybeSingle()
    .returns<{ value: Partial<WifiInfo> | null }>()

  if (error) return { data: EMPTY_WIFI, error }

  const value = data?.value
  return {
    data: {
      ssid: typeof value?.ssid === 'string' ? value.ssid : '',
      password: typeof value?.password === 'string' ? value.password : '',
    },
    error: null,
  }
}

export async function updateWifi(centerId: string, ssid: string, password: string) {
  const { data: userData } = await supabase.auth.getUser()

  const { data: existing, error: fetchError } = await supabase
    .from('center_settings')
    .select('center_id, key')
    .eq('center_id', centerId)
    .eq('key', 'wifi')
    .maybeSingle()
    .returns<{ center_id: string; key: string }>()

  if (fetchError) return { error: fetchError }

  const patch = {
    value: { ssid, password } satisfies WifiInfo,
    updated_at: new Date().toISOString(),
    updated_by: userData.user?.id ?? null,
  }

  if (existing) {
    return supabase.from('center_settings').update(patch).eq('center_id', centerId).eq('key', 'wifi')
  }

  return supabase.from('center_settings').insert({ center_id: centerId, key: 'wifi', ...patch })
}
