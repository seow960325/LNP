import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
import { formatDate, toKLDateISO, shiftDateISO, sortBoardItems } from '../lib/helpers'
import { fetchBoardItems, createBoardItem, updateBoardItem, markDone } from '../lib/boardApi'
import type { BoardItemRow, CreateBoardItemPayload, UpdateBoardItemPatch } from '../lib/boardApi'
import { fetchCenterMembers, fetchProfilesByIds } from '../lib/kudosApi'
import type { CenterMember } from '../lib/kudosApi'
import type { BoardItemType, BoardPriority } from '../types'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

const TYPE_LABELS: Record<BoardItemType, string> = {
  task: 'Task',
  heads_up: 'Heads Up',
  reminder: 'Reminder',
}

const PRIORITY_LABELS: Record<BoardPriority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
}

const PRIORITY_STYLES: Record<BoardPriority, string> = {
  high: 'bg-danger/10 text-danger',
  normal: 'bg-cream text-ink',
  low: 'bg-line/60 text-muted',
}

interface BoardItemFormValues {
  title: string
  type: BoardItemType
  priority: BoardPriority
  body: string
  assignedTo: string
  date: string
}

function BoardItemForm({
  initial,
  members,
  membersError,
  submitting,
  onCancel,
  onSubmit,
}: {
  initial: BoardItemFormValues
  members: CenterMember[] | null
  membersError: string | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: BoardItemFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-card-md">
      <div>
        <label className="text-xs text-muted">Title</label>
        <input
          value={values.title}
          onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
          disabled={submitting}
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Type</label>
          <select
            value={values.type}
            onChange={(event) => setValues((v) => ({ ...v, type: event.target.value as BoardItemType }))}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="task">Task</option>
            <option value="heads_up">Heads Up</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Priority</label>
          <select
            value={values.priority}
            onChange={(event) => setValues((v) => ({ ...v, priority: event.target.value as BoardPriority }))}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted">Details (optional)</label>
        <textarea
          value={values.body}
          onChange={(event) => setValues((v) => ({ ...v, body: event.target.value }))}
          rows={3}
          disabled={submitting}
          className="mt-1 w-full rounded-xl border border-line p-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-xs text-muted">Assign to (optional)</label>
        {membersError ? (
          <ErrorState message={membersError} />
        ) : (
          <select
            value={values.assignedTo}
            onChange={(event) => setValues((v) => ({ ...v, assignedTo: event.target.value }))}
            disabled={submitting || members === null}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {(members ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(values)}
          disabled={submitting || values.title.trim().length === 0}
          className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function BoardItemCard({
  item,
  authorName,
  assignedName,
  canEdit,
  canDelete,
  onEdit,
  onMarkDone,
  onDelete,
  marking,
}: {
  item: BoardItemRow
  authorName: string
  assignedName: string | null
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onMarkDone: () => void
  onDelete: () => void
  marking: boolean
}) {
  const isDone = item.status === 'done'

  return (
    <li className={`space-y-2 rounded-xl bg-white p-4 shadow-card ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line bg-cream px-2 py-0.5 text-2xs text-muted">
          {TYPE_LABELS[item.type]}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-2xs ${PRIORITY_STYLES[item.priority]}`}>
          {PRIORITY_LABELS[item.priority]}
        </span>
        {isDone && <span className="rounded-full bg-success-soft px-2 py-0.5 text-2xs text-success">Done</span>}
      </div>

      <h3 className={`font-semibold text-ink ${isDone ? 'line-through' : ''}`}>{item.title}</h3>

      {item.body && <p className="text-sm text-muted">{item.body}</p>}

      <p className="text-xs text-muted/70">
        Added by {authorName}
        {assignedName && <> · Assigned to {assignedName}</>}
      </p>

      <div className="flex gap-2 pt-1">
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-tap rounded-xl border border-line px-3 text-sm text-muted"
          >
            Edit
          </button>
        )}
        {!isDone && (
          <button
            type="button"
            onClick={onMarkDone}
            disabled={marking}
            className="min-h-tap rounded-xl bg-accent px-3 text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
          >
            {marking ? 'Marking…' : 'Mark done'}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-tap rounded-xl border border-danger/20 px-3 text-sm text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; item: BoardItemRow }

export function BoardPage() {
  const { profile } = useAuth()

  const [selectedDate, setSelectedDate] = useState(() => toKLDateISO(new Date()))
  const [itemsState, setItemsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [items, setItems] = useState<BoardItemRow[]>([])
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map())
  const [refreshKey, setRefreshKey] = useState(0)

  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })
  const [members, setMembers] = useState<CenterMember[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<BoardItemRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!profile) return
    const centerId = profile.center_id
    let cancelled = false

    async function load() {
      setItemsState('loading')
      try {
        const { data, error } = await withTimeout(fetchBoardItems(centerId, selectedDate))
        if (cancelled) return
        if (error || !data) {
          setItemsError('Could not load the board. Please try again.')
          setItemsState('error')
          return
        }

        setItems(data)
        setItemsState('ready')

        const ids = Array.from(
          new Set(data.flatMap((item) => [item.author_id, item.assigned_to]).filter((id): id is string => Boolean(id)))
        )
        const { data: profiles } = await withTimeout(Promise.resolve(fetchProfilesByIds(ids)))
        if (cancelled) return
        setProfileNames(new Map((profiles ?? []).map((p) => [p.id, p.full_name])))
      } catch (err) {
        if (cancelled) return
        setItemsError(getUserErrorMessage(err))
        setItemsState('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile, selectedDate, refreshKey])

  useEffect(() => {
    if (!profile || formMode.kind === 'closed') return
    const centerId = profile.center_id
    let cancelled = false

    withTimeout(fetchCenterMembers(centerId))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setMembersError('Could not load members to assign.')
          return
        }
        setMembers(data ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setMembersError(getUserErrorMessage(err))
      })

    return () => {
      cancelled = true
    }
  }, [profile, formMode.kind])

  if (!profile) return null

  const sortedItems = sortBoardItems(items)
  const isToday = selectedDate === toKLDateISO(new Date())

  function canFullyEdit(item: BoardItemRow) {
    if (!profile) return false
    return profile.id === item.author_id || profile.role === 'admin' || profile.role === 'super_admin'
  }

  // Delete is admin/super_admin only — unlike canFullyEdit, the author is
  // deliberately NOT allowed to delete their own item.
  function canDelete() {
    if (!profile) return false
    return profile.role === 'admin' || profile.role === 'super_admin'
  }

  function closeForm() {
    setFormMode({ kind: 'closed' })
  }

  async function handleCreate(values: BoardItemFormValues) {
    if (!profile || saving) return
    setSaving(true)
    const payload: CreateBoardItemPayload = {
      center_id: profile.center_id,
      author_id: profile.id,
      date: values.date,
      type: values.type,
      title: values.title.trim(),
      body: values.body.trim().length > 0 ? values.body.trim() : null,
      priority: values.priority,
      assigned_to: values.assignedTo.length > 0 ? values.assignedTo : null,
      status: 'open',
    }
    const { error } = await createBoardItem(payload)
    setSaving(false)
    if (error) {
      toast.error('Could not create the item. Please try again.')
      return
    }
    closeForm()
    setRefreshKey((k) => k + 1)
    toast.success('Item added')
  }

  async function handleUpdate(item: BoardItemRow, values: BoardItemFormValues) {
    if (saving) return
    setSaving(true)
    const patch: UpdateBoardItemPatch = {
      title: values.title.trim(),
      body: values.body.trim().length > 0 ? values.body.trim() : null,
      type: values.type,
      priority: values.priority,
      assigned_to: values.assignedTo.length > 0 ? values.assignedTo : null,
      date: values.date,
    }
    const { error } = await updateBoardItem(item.id, patch)
    setSaving(false)
    if (error) {
      toast.error('Could not save changes. Please try again.')
      return
    }
    closeForm()
    setRefreshKey((k) => k + 1)
    toast.success('Item updated')
  }

  async function handleMarkDone(id: string) {
    if (markingId === id) return
    setMarkingId(id)
    const { error } = await markDone(id)
    setMarkingId(null)
    if (error) {
      toast.error('Could not mark the item done. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success('Item marked done')
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return
    setDeleting(true)

    const { error } = await supabase.from('board_items').delete().eq('id', deleteTarget.id)

    setDeleting(false)
    if (error) {
      toast.error(error.message || 'Could not delete this item. Please try again.')
      return
    }

    setItems((current) => current.filter((item) => item.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Item deleted')
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Daily Ops Board" />

        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDateISO(d, -1))}
            aria-label="Previous day"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-ink">{formatDate(selectedDate)}</p>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(toKLDateISO(new Date()))}
                className="text-xs text-accent hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDateISO(d, 1))}
            aria-label="Next day"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {formMode.kind === 'closed' && (
          <button
            type="button"
            onClick={() => setFormMode({ kind: 'create' })}
            className="w-full min-h-tap-lg rounded-xl bg-accent font-semibold text-white shadow-card hover:bg-accent-hover"
          >
            + Add item
          </button>
        )}

        {formMode.kind === 'create' && (
          <BoardItemForm
            initial={{ title: '', type: 'task', priority: 'normal', body: '', assignedTo: '', date: selectedDate }}
            members={members}
            membersError={membersError}
            submitting={saving}
            onCancel={closeForm}
            onSubmit={handleCreate}
          />
        )}

        {formMode.kind === 'edit' && (
          <BoardItemForm
            initial={{
              title: formMode.item.title,
              type: formMode.item.type,
              priority: formMode.item.priority,
              body: formMode.item.body ?? '',
              assignedTo: formMode.item.assigned_to ?? '',
              date: formMode.item.date,
            }}
            members={members}
            membersError={membersError}
            submitting={saving}
            onCancel={closeForm}
            onSubmit={(values) => handleUpdate(formMode.item, values)}
          />
        )}

        {itemsState === 'loading' && <LoadingState label="Loading the board…" />}
        {itemsState === 'error' && (
          <ErrorState message={itemsError ?? 'Something went wrong.'} onRetry={() => setRefreshKey((k) => k + 1)} />
        )}

        {itemsState === 'ready' && sortedItems.length === 0 && (
          <EmptyState message={`Nothing on the board for ${formatDate(selectedDate)}.`} />
        )}

        {itemsState === 'ready' && sortedItems.length > 0 && (
          <ul className="space-y-3">
            {sortedItems.map((item) => (
              <BoardItemCard
                key={item.id}
                item={item}
                authorName={profileNames.get(item.author_id) ?? 'Someone'}
                assignedName={item.assigned_to ? profileNames.get(item.assigned_to) ?? 'Someone' : null}
                canEdit={canFullyEdit(item)}
                canDelete={canDelete()}
                onEdit={() => setFormMode({ kind: 'edit', item })}
                onMarkDone={() => handleMarkDone(item.id)}
                onDelete={() => setDeleteTarget(item)}
                marking={markingId === item.id}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this board item?"
        message="This permanently deletes this board item. This cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
