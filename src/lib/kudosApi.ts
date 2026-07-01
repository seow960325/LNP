import { supabase } from './supabaseClient'

export interface CenterMember {
  id: string
  full_name: string
  title: string | null
}

export function fetchCenterMembers(centerId: string, excludeUserId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, title')
    .eq('center_id', centerId)
    .eq('active', true)
    .neq('id', excludeUserId)
    .order('full_name')
    .returns<CenterMember[]>()
}

export interface KudosValueOption {
  id: string
  name: string
  description: string
  icon_key: string
}

export function fetchActiveKudosValues(centerId: string) {
  return supabase
    .from('kudos_values')
    .select('id, name, description, icon_key')
    .eq('center_id', centerId)
    .eq('active', true)
    .order('sort_order')
    .returns<KudosValueOption[]>()
}

export interface SendKudosPayload {
  center_id: string
  from_user_id: string
  to_user_id: string
  value_id: string
  message: string | null
  is_from_parent: boolean
}

export function sendKudos(payload: SendKudosPayload) {
  return supabase.from('kudos').insert(payload)
}

export interface KudosFeedRow {
  id: string
  from_user_id: string
  to_user_id: string
  value_id: string
  message: string | null
  created_at: string
}

export function fetchKudosFeed(centerId: string) {
  return supabase
    .from('kudos')
    .select('id, from_user_id, to_user_id, value_id, message, created_at')
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .returns<KudosFeedRow[]>()
}

export interface NamedProfile {
  id: string
  full_name: string
}

export function fetchProfilesByIds(ids: string[]) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as NamedProfile[], error: null })
  }
  return supabase.from('profiles').select('id, full_name').in('id', ids).returns<NamedProfile[]>()
}

export interface NamedKudosValue {
  id: string
  name: string
  icon_key: string
}

export function fetchKudosValuesByIds(ids: string[]) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as NamedKudosValue[], error: null })
  }
  return supabase
    .from('kudos_values')
    .select('id, name, icon_key')
    .in('id', ids)
    .returns<NamedKudosValue[]>()
}

export interface ReceivedKudosRow {
  id: string
  created_at: string
}

export function fetchKudosReceivedBy(centerId: string, userId: string) {
  return supabase
    .from('kudos')
    .select('id, created_at')
    .eq('center_id', centerId)
    .eq('to_user_id', userId)
    .returns<ReceivedKudosRow[]>()
}

export interface TopRecipient {
  to_user_id: string
  full_name: string
  kudos_count: number
}

export function fetchTopRecipient() {
  return supabase.rpc('kudos_top_recipient').returns<TopRecipient[]>()
}
