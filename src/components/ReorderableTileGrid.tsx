import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fetchTileOrder, saveTileOrder } from '../lib/tileLayoutApi'

export interface ReorderableTile {
  key: string
  label: string
  to: string
  Icon: LucideIcon
}

// Orders `tiles` by `savedOrder`, appending any tile not in it (new tiles
// added since the layout was last saved) and silently dropping any saved
// key that no longer matches a visible tile (removed tiles, or tiles the
// current user's role doesn't see).
function applySavedOrder(tiles: ReorderableTile[], savedOrder: string[]): ReorderableTile[] {
  const remaining = new Map(tiles.map((tile) => [tile.key, tile]))
  const ordered: ReorderableTile[] = []

  for (const key of savedOrder) {
    const tile = remaining.get(key)
    if (tile) {
      ordered.push(tile)
      remaining.delete(key)
    }
  }
  for (const tile of tiles) {
    if (remaining.has(tile.key)) ordered.push(tile)
  }
  return ordered
}

function TileContents({ label, Icon }: { label: string; Icon: LucideIcon }) {
  return (
    <>
      <span className="tile-icon-circle flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
      </span>
      <span className="font-semibold text-sm text-ink">{label}</span>
    </>
  )
}

// NORMAL-mode tile — a plain navigating Link, styled identically to
// HomePage's original hand-rolled tiles (same press-bloom behavior).
function StaticTile({
  tile,
  pressed,
  onPressChange,
}: {
  tile: ReorderableTile
  pressed: boolean
  onPressChange: (pressed: boolean) => void
}) {
  return (
    <Link
      to={tile.to}
      onPointerDown={() => onPressChange(true)}
      onPointerUp={() => onPressChange(false)}
      onPointerLeave={() => onPressChange(false)}
      onPointerCancel={() => onPressChange(false)}
      className={`home-tile flex min-h-tap-lg flex-col items-center justify-center gap-3 rounded-xl bg-white p-5 text-center shadow-card hover:shadow-card-md motion-safe:hover:-translate-y-0.5 ${
        pressed ? 'tile-pressed' : ''
      }`}
    >
      <TileContents label={tile.label} Icon={tile.Icon} />
    </Link>
  )
}

// EDIT-mode tile — draggable via dnd-kit, not a Link (dragging shouldn't
// trigger navigation), with a grab affordance instead of the press bloom.
function DraggableTile({ tile }: { tile: ReorderableTile }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex min-h-tap-lg cursor-grab touch-none flex-col items-center justify-center gap-3 rounded-xl bg-white p-5 text-center shadow-card active:cursor-grabbing ${
        isDragging ? 'z-10 opacity-70 shadow-card-md' : ''
      }`}
    >
      <TileContents label={tile.label} Icon={tile.Icon} />
    </div>
  )
}

// Reusable, self-contained tile grid: renders `tiles` in the saved global
// order for `menuKey` (super_admin can drag-reorder and save via dnd-kit).
// Role gating happens entirely upstream — this component only orders and
// displays whatever tile list it's given.
export function ReorderableTileGrid({
  menuKey,
  tiles,
  canEdit,
}: {
  menuKey: string
  tiles: ReorderableTile[]
  canEdit: boolean
}) {
  const [savedOrder, setSavedOrder] = useState<string[]>([])
  const [orderedTiles, setOrderedTiles] = useState<ReorderableTile[]>(tiles)
  const [editing, setEditing] = useState(false)
  const [pressedTo, setPressedTo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchTileOrder(menuKey)
      .then((order) => {
        if (!cancelled) {
          setSavedOrder(order)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [menuKey])

  // Keyed on the tile keys (not the `tiles` array reference, which is a new
  // object every render) and skipped while editing, so an unrelated parent
  // re-render mid-drag can't clobber the in-progress reorder.
  const tileKeys = tiles.map((tile) => tile.key).join('|')
  useEffect(() => {
    if (editing) return
    setOrderedTiles(applySavedOrder(tiles, savedOrder))
  }, [tileKeys, savedOrder, editing])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedTiles((current) => {
      const oldIndex = current.findIndex((tile) => tile.key === active.id)
      const newIndex = current.findIndex((tile) => tile.key === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const order = orderedTiles.map((tile) => tile.key)
      const { error } = await saveTileOrder(menuKey, order)
      if (error) {
        toast.error('Could not save layout. Please try again.')
        return
      }
      setSavedOrder(order)
      setEditing(false)
      toast.success('Layout saved')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setOrderedTiles(applySavedOrder(tiles, savedOrder))
    setEditing(false)
  }

  return (
    <div className="space-y-3">
      {canEdit && loaded && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-tap items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-semibold text-muted hover:bg-cream"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit layout
        </button>
      )}

      {!loaded ? (
        <div className="grid grid-cols-2 gap-4" aria-hidden="true">
          {tiles.map((tile) => (
            <div key={tile.key} className="min-h-tap-lg invisible rounded-xl p-5" />
          ))}
        </div>
      ) : editing ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedTiles.map((tile) => tile.key)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-4">
                {orderedTiles.map((tile) => (
                  <DraggableTile key={tile.key} tile={tile} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="min-h-tap flex-1 rounded-xl border border-line bg-white font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {orderedTiles.map((tile) => (
            <StaticTile
              key={tile.key}
              tile={tile}
              pressed={pressedTo === tile.to}
              onPressChange={(pressed) => setPressedTo(pressed ? tile.to : null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
