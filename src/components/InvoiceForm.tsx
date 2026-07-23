import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { X, Plus, Trash2 } from 'lucide-react'
import { SearchableSelect } from './SearchableSelect'
import { extractInvokeError } from './RegisterStaffForm'
import {
  fetchZohoItemsCatalog,
  fetchZohoLinkedStudents,
  createZohoInvoice,
  updateZohoInvoice,
} from '../lib/zohoApi'
import type { ZohoItem, ZohoLinkedStudent, ZohoInvoice, ZohoInvoiceLineItemInput } from '../lib/zohoApi'
import { formatMYR } from '../lib/zohoFinance'
import { toKLDateISO } from '../lib/helpers'

interface LineItemRow {
  rowId: string
  item: ZohoItem | null
  quantity: string
  rateOverride: string
}

// React list keys only — local to this form, never persisted or sent
// anywhere, so a random UUID (crypto.randomUUID, which requires a secure
// context and is undefined over plain-http LAN dev) is unnecessary; a
// plain incrementing counter is enough to keep rows unique.
let rowIdSeq = 0
const nextRowId = () => `row-${++rowIdSeq}`

function newRow(): LineItemRow {
  return { rowId: nextRowId(), item: null, quantity: '1', rateOverride: '' }
}

// The override field wins when it's a valid number; otherwise the catalog's
// own rate applies (matches what Zoho itself does when a line item is sent
// without a `rate`).
function effectiveRate(row: LineItemRow): number {
  if (!row.item) return 0
  const override = row.rateOverride.trim()
  return override !== '' && Number.isFinite(Number(override)) ? Number(override) : row.item.rate
}

function rowSubtotal(row: LineItemRow): number {
  const qty = Number(row.quantity)
  if (!row.item || !Number.isFinite(qty) || qty <= 0) return 0
  return qty * effectiveRate(row)
}

// Create AND edit share this form, but edit is deliberately date/notes
// only — no line-items editor at all. Zoho's PUT /invoices/{id} REPLACES
// the entire line_items array rather than merging, and zoho_invoices (the
// local mirror) has no line_items column to prefill from, so there is no
// way to show the admin what's already on the invoice before they'd be
// asked to edit it. Letting them add rows to an apparently-empty list would
// silently wipe every line they can't see. Changing line items is done by
// deleting the invoice and creating a new one instead (see the helper text
// in the edit header below).
export function InvoiceForm({
  mode,
  centerId,
  editingInvoice,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  centerId: string
  editingInvoice?: ZohoInvoice
  onClose: () => void
  onSaved: () => void
}) {
  const [students, setStudents] = useState<ZohoLinkedStudent[]>([])
  const [items, setItems] = useState<ZohoItem[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const [selectedStudent, setSelectedStudent] = useState<ZohoLinkedStudent | null>(null)
  const initialDate = editingInvoice?.date ?? toKLDateISO(new Date())
  const [date, setDate] = useState(initialDate)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<LineItemRow[]>(mode === 'create' ? [newRow()] : [])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Edit mode has no line-items UI at all (see the header comment on this
    // component) and can't change the student, so it needs neither the item
    // catalog nor the student list — skip both network calls entirely.
    if (mode === 'edit') {
      setLoadingOptions(false)
      return
    }

    let cancelled = false
    setLoadingOptions(true)
    setOptionsError(null)

    Promise.all([fetchZohoLinkedStudents(centerId), fetchZohoItemsCatalog()])
      .then(([studentsRes, itemsRes]) => {
        if (cancelled) return
        if (studentsRes.error || itemsRes.error || !itemsRes.data?.ok) {
          setOptionsError('Could not load the student list or item catalog. Please try again.')
          return
        }
        setStudents(studentsRes.data ?? [])
        setItems(itemsRes.data.items)
      })
      .catch(() => {
        if (!cancelled) setOptionsError('Could not load the student list or item catalog. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })

    return () => {
      cancelled = true
    }
  }, [mode, centerId])

  const validRows = useMemo(() => rows.filter((r) => r.item && Number(r.quantity) > 0), [rows])
  const total = useMemo(() => validRows.reduce((sum, r) => sum + rowSubtotal(r), 0), [validRows])

  function updateRow(rowId: string, patch: Partial<LineItemRow>) {
    setRows((current) => current.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((current) => [...current, newRow()])
  }

  function removeRow(rowId: string) {
    setRows((current) => current.filter((r) => r.rowId !== rowId))
  }

  function buildLineItemsPayload(): ZohoInvoiceLineItemInput[] {
    return validRows.map((r) => ({
      item_id: r.item!.item_id,
      quantity: Number(r.quantity),
      ...(r.rateOverride.trim() !== '' ? { rate: Number(r.rateOverride) } : {}),
    }))
  }

  const dateChanged = mode === 'edit' && date !== initialDate
  const notesProvided = notes.trim() !== ''

  // Edit mode never touches line items (Zoho's PUT replaces the whole
  // array, and there's nowhere locally to have shown the existing ones —
  // see the component header comment), so only date/notes can trigger it.
  const canSubmit =
    mode === 'create' ? !!selectedStudent && !!date && validRows.length > 0 : dateChanged || notesProvided

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)

    if (mode === 'create') {
      const { data, error } = await createZohoInvoice({
        student_id: selectedStudent!.id,
        date,
        line_items: buildLineItemsPayload(),
        notes: notesProvided ? notes.trim() : undefined,
      })
      setSubmitting(false)
      if (error || !data?.ok) {
        toast.error(await extractInvokeError(error, 'Could not create the invoice. Please try again.'))
        return
      }
      toast.success('Invoice created')
      onSaved()
      return
    }

    // Never line_items here — Zoho's PUT replaces the entire array, and
    // edit mode has no way to show what's already on the invoice, so
    // sending anything here (even an empty array) risks silently wiping
    // lines the admin can't see. Only date/notes are ever sent on update.
    const payload: { zoho_invoice_id: string; date?: string; notes?: string } = {
      zoho_invoice_id: editingInvoice!.invoice_id,
    }
    if (dateChanged) payload.date = date
    if (notesProvided) payload.notes = notes.trim()

    const { data, error } = await updateZohoInvoice(payload)
    setSubmitting(false)
    if (error || !data?.ok) {
      toast.error(await extractInvokeError(error, 'Could not update the invoice. Please try again.'))
      return
    }
    toast.success('Invoice updated')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center">
      <div className="my-6 w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-card-lg sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-lg text-ink">
            {mode === 'create' ? 'New invoice' : `Edit invoice ${editingInvoice?.invoice_number ?? editingInvoice?.invoice_id}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl text-muted hover:bg-cream disabled:opacity-60"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {mode === 'edit' && (
          <p className="text-xs text-muted">To change line items, delete this draft and create a new invoice.</p>
        )}

        {loadingOptions && <p className="text-sm text-muted">Loading…</p>}
        {optionsError && <p className="text-sm text-danger">{optionsError}</p>}

        {!loadingOptions && !optionsError && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted">Student</label>
              {mode === 'create' ? (
                <div className="mt-1">
                  <SearchableSelect
                    items={students}
                    value={selectedStudent}
                    onChange={setSelectedStudent}
                    getLabel={(s) => s.name}
                    getKey={(s) => s.id}
                    placeholder="Search students…"
                    emptyLabel="No matching student is linked to a Zoho contact"
                  />
                </div>
              ) : (
                <p className="mt-1 min-h-tap rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink">
                  {editingInvoice?.customer_name ?? '—'}
                  <span className="ml-2 text-xs text-muted">(fixed — Zoho invoices can't change customer)</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted">Date</label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={submitting}
                required
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            {mode === 'create' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted">Line items</label>
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={submitting}
                    className="flex min-h-tap items-center gap-1 rounded-xl border border-accent/30 px-3 text-xs font-semibold text-accent-hover hover:bg-accent-soft disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add item
                  </button>
                </div>

                {rows.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-muted">
                    No line items added.
                  </p>
                )}

                <div className="space-y-3">
                  {rows.map((row) => (
                    <div key={row.rowId} className="space-y-2 rounded-xl border border-line p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <SearchableSelect
                            items={items}
                            value={row.item}
                            onChange={(item) => updateRow(row.rowId, { item, rateOverride: '' })}
                            getLabel={(i) => i.name}
                            getKey={(i) => i.item_id}
                            placeholder="Search items…"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(row.rowId)}
                          disabled={submitting}
                          aria-label="Remove line item"
                          className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:bg-cream disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-2xs text-muted">Quantity</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.quantity}
                            onChange={(event) => updateRow(row.rowId, { quantity: event.target.value })}
                            disabled={submitting}
                            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="text-2xs text-muted">Rate (optional override)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.rateOverride}
                            onChange={(event) => updateRow(row.rowId, { rateOverride: event.target.value })}
                            disabled={submitting || !row.item}
                            placeholder={row.item ? row.item.rate.toFixed(2) : '—'}
                            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted">Notes {mode === 'edit' && '(leave blank to keep existing)'}</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={submitting}
                rows={2}
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            {mode === 'create' && validRows.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
                <span className="text-xs text-muted">Estimated total — Zoho computes the final total incl. tax</span>
                <span className="font-bold tabular-nums text-ink">{formatMYR(total)}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
            >
              {submitting ? 'Saving…' : mode === 'create' ? 'Create invoice' : 'Save changes'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
