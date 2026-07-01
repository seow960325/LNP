import { supabase } from './supabaseClient'
import type { BoardItemType, BoardPriority, BoardStatus } from '../types'

export interface BoardItemRow {
  id: string
  center_id: string
  date: string
  author_id: string
  type: BoardItemType
  title: string
  body: string | null
  priority: BoardPriority
  status: BoardStatus
  assigned_to: string | null
  created_at: string
  updated_at: string
}

const BOARD_ITEM_COLUMNS =
  'id, center_id, date, author_id, type, title, body, priority, status, assigned_to, created_at, updated_at'

export function fetchBoardItems(centerId: string, dateISO: string) {
  return supabase
    .from('board_items')
    .select(BOARD_ITEM_COLUMNS)
    .eq('center_id', centerId)
    .eq('date', dateISO)
    .returns<BoardItemRow[]>()
}

export interface CreateBoardItemPayload {
  center_id: string
  author_id: string
  date: string
  type: BoardItemType
  title: string
  body: string | null
  priority: BoardPriority
  assigned_to: string | null
  status: BoardStatus
}

export function createBoardItem(payload: CreateBoardItemPayload) {
  return supabase.from('board_items').insert(payload)
}

export interface UpdateBoardItemPatch {
  title?: string
  body?: string | null
  type?: BoardItemType
  priority?: BoardPriority
  assigned_to?: string | null
  date?: string
}

export function updateBoardItem(id: string, patch: UpdateBoardItemPatch) {
  return supabase.from('board_items').update(patch).eq('id', id)
}

export function markDone(id: string) {
  return supabase.from('board_items').update({ status: 'done' satisfies BoardStatus }).eq('id', id)
}

export function fetchOpenTodayCount(centerId: string, dateISO: string) {
  return supabase
    .from('board_items')
    .select('id', { count: 'exact', head: true })
    .eq('center_id', centerId)
    .eq('date', dateISO)
    .eq('status', 'open')
}
