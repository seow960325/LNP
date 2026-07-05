import { supabase } from './supabaseClient'

export interface TileLayout {
  menu_key: string
  tile_order: string[]
  updated_at: string
}

// One row per menu — a global order shared by everyone, not per-user. RLS
// restricts writes to super_admin; any signed-in user can read it so the
// saved order applies to their own (role-filtered) tile set.
export async function fetchTileOrder(menuKey: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('tile_layouts')
    .select('tile_order')
    .eq('menu_key', menuKey)
    .maybeSingle()
    .returns<Pick<TileLayout, 'tile_order'>>()

  if (error || !data) return []
  return data.tile_order ?? []
}

export function saveTileOrder(menuKey: string, order: string[]) {
  return supabase
    .from('tile_layouts')
    .upsert({ menu_key: menuKey, tile_order: order, updated_at: new Date().toISOString() }, { onConflict: 'menu_key' })
}
