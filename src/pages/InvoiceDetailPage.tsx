import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  fetchInvoice,
  updateInvoice,
  updateInvoiceLineItems,
  markInvoicePaid,
  voidInvoice,
  deleteInvoice,
} from '../lib/billingApi'
import type { InvoiceWithDetails, CreateInvoiceLineItemPayload, UpdateInvoicePatch } from '../lib/billingApi'
import { formatDate } from '../lib/helpers'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editingTermLabel, setEditingTermLabel] = useState('')
  const [editingIssueDate, setEditingIssueDate] = useState('')
  const [editingDueDate, setEditingDueDate] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [editingDiscount, setEditingDiscount] = useState(0)
  const [editingLineItems, setEditingLineItems] = useState<CreateInvoiceLineItemPayload[]>([])
  const [saving, setSaving] = useState(false)

  const [paymentMethodForPaid, setPaymentMethodForPaid] = useState('')
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false)
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(fetchInvoice(id))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load invoice. Please try again.')
          setLoadState('error')
          return
        }
        setInvoice(data)
        setEditingTermLabel(data.term_label || '')
        setEditingIssueDate(data.issue_date)
        setEditingDueDate(data.due_date || '')
        setEditingNotes(data.notes || '')
        setEditingDiscount(data.discount || 0)
        setEditingLineItems(
          (data.invoice_line_items || []).map((item) => ({
            description: item.description,
            amount: item.amount,
            sort_order: item.sort_order,
          }))
        )
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [id, retryKey])

  if (!profile || !isAdmin || !id) return null

  const canEdit = invoice && (invoice.status === 'draft' || invoice.status === 'sent')
  const subtotal = editingLineItems.reduce((sum, item) => sum + item.amount, 0)
  const editingTotal = Math.max(0, subtotal - editingDiscount)
  const invoiceTotal = invoice ? Math.max(0, invoice.subtotal - invoice.discount) : 0
  const formatCurrency = (amount: number) => `RM ${amount.toFixed(2)}`

  async function handleSave() {
    if (!invoice || saving) return

    const validLineItems = editingLineItems.filter((item) => item.description.trim() !== '' || item.amount !== 0)
    if (validLineItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    setSaving(true)

    const updates: UpdateInvoicePatch = {
      term_label: editingTermLabel.trim() || undefined,
      issue_date: editingIssueDate,
      due_date: editingDueDate || undefined,
      notes: editingNotes.trim() || undefined,
      discount: editingDiscount,
    }

    try {
      const { error: updateError } = await withTimeout(updateInvoice(invoice.id, updates))
      if (updateError) {
        toast.error('Failed to update invoice')
        setSaving(false)
        return
      }

      const { error: lineItemsError } = await withTimeout(updateInvoiceLineItems(invoice.id, validLineItems))
      if (lineItemsError) {
        toast.error('Failed to update line items')
        setSaving(false)
        return
      }

      setSaving(false)
      setIsEditing(false)
      toast.success('Invoice updated')

      if (id) {
        fetchInvoice(id).then(({ data }) => {
          if (data) setInvoice(data)
        })
      }
    } catch (err) {
      setSaving(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  async function handleMarkPaid() {
    if (confirming) return
    if (!invoice || !paymentMethodForPaid.trim()) {
      toast.error('Please select a payment method')
      return
    }

    setConfirming(true)
    const { data, error } = await markInvoicePaid(invoice.id, paymentMethodForPaid.trim())
    setConfirming(false)

    if (error || !data) {
      toast.error('Failed to mark invoice as paid')
      return
    }

    setConfirmPaidOpen(false)
    setPaymentMethodForPaid('')
    toast.success('Invoice marked as paid')
    setInvoice(data)
  }

  async function handleVoid() {
    if (!invoice || confirming) return
    setConfirming(true)

    const { data, error } = await voidInvoice(invoice.id)
    setConfirming(false)

    if (error || !data) {
      toast.error('Failed to void invoice')
      return
    }

    setConfirmVoidOpen(false)
    toast.success('Invoice voided')
    setInvoice(data)
  }

  async function handleDelete() {
    if (!invoice || confirming) return
    setConfirming(true)

    const { error } = await deleteInvoice(invoice.id)
    setConfirming(false)

    if (error) {
      toast.error('Failed to delete invoice')
      return
    }

    setConfirmDeleteOpen(false)
    toast.success('Invoice deleted')
    navigate('/invoices')
  }

  function addLineItem() {
    setEditingLineItems((prev) => [
      ...prev,
      {
        description: '',
        amount: 0,
        sort_order: prev.length,
      },
    ])
  }

  function removeLineItem(index: number) {
    setEditingLineItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i })))
  }

  async function handleDownloadPdf() {
    if (!invoice) return
    try {
      // Loaded on demand — pdfmake and its embedded fonts are ~1.3 MB and only
      // needed when an admin actually downloads a PDF.
      const { downloadInvoicePdf } = await import('../lib/invoicePdf')
      await downloadInvoicePdf(invoice)
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  function updateLineItem(index: number, field: keyof CreateInvoiceLineItemPayload, value: string | number) {
    setEditingLineItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Invoice" />

        {loadState === 'loading' && <LoadingState label="Loading invoice…" />}
        {loadState === 'error' && (
          <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={() => setRetryKey((k) => k + 1)} />
        )}

        {loadState === 'ready' && invoice && (
          <>
            <div className="rounded-xl bg-white p-5 shadow-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold text-ink">{invoice.invoice_no}</p>
                  <p className="text-sm text-muted">{invoice.students?.name}</p>
                </div>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                    invoice.status === 'draft'
                      ? 'bg-line/60 text-muted'
                      : invoice.status === 'sent'
                        ? 'bg-accent-soft text-accent-hover'
                        : invoice.status === 'paid'
                          ? 'bg-success-soft text-success'
                          : 'bg-danger/10 text-danger'
                  }`}
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>
            </div>

            {isEditing ? (
              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-white p-5 shadow-card">
                  <div>
                    <label className="text-xs text-muted">Term Label</label>
                    <input
                      type="text"
                      value={editingTermLabel}
                      onChange={(e) => setEditingTermLabel(e.target.value)}
                      disabled={saving}
                      placeholder="e.g. Term 1 2026"
                      className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted">Issue Date</label>
                    <input
                      type="date"
                      value={editingIssueDate}
                      onChange={(e) => setEditingIssueDate(e.target.value)}
                      disabled={saving}
                      className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted">Due Date</label>
                    <input
                      type="date"
                      value={editingDueDate}
                      onChange={(e) => setEditingDueDate(e.target.value)}
                      disabled={saving}
                      className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted">Subtotal</label>
                    <div className="mt-1 flex min-h-tap w-full items-center rounded-xl border border-line bg-cream px-3 py-2 text-sm font-bold text-ink">
                      {formatCurrency(subtotal)}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted">Discount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingDiscount}
                      onChange={(e) => setEditingDiscount(parseFloat(e.target.value) || 0)}
                      disabled={saving}
                      className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted">Total (after discount)</label>
                    <div className="mt-1 flex min-h-tap w-full items-center rounded-xl border border-line bg-cream px-3 py-2 text-sm font-bold text-ink">
                      {formatCurrency(editingTotal)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-card">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold text-sm text-ink">Line Items</p>
                    <button
                      type="button"
                      onClick={addLineItem}
                      disabled={saving}
                      className="text-xs text-accent hover:underline disabled:opacity-60"
                    >
                      + Add row
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editingLineItems.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          disabled={saving}
                          placeholder="Description"
                          className="min-h-tap flex-1 rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.amount}
                          onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                          disabled={saving}
                          placeholder="Amount"
                          className="min-h-tap w-24 rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={saving}
                          className="min-h-tap rounded-xl border border-danger/20 px-3 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-card">
                  <label className="text-xs text-muted">Notes</label>
                  <textarea
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    disabled={saving}
                    className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="rounded-xl bg-white p-5 shadow-card space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted">Issue Date</p>
                      <p className="text-lg font-bold text-ink">{formatDate(invoice.issue_date)}</p>
                    </div>
                    {invoice.due_date && (
                      <div>
                        <p className="text-xs text-muted">Due Date</p>
                        <p className="text-lg font-bold text-ink">{formatDate(invoice.due_date)}</p>
                      </div>
                    )}
                  </div>

                  {invoice.term_label && (
                    <div>
                      <p className="text-xs text-muted">Term</p>
                      <p className="text-ink">{invoice.term_label}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted">Line Items</p>
                    <div className="mt-2 space-y-1">
                      {(invoice.invoice_line_items || []).map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-ink">{item.description}</span>
                          <span className="font-bold text-ink">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-line pt-3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">Subtotal</span>
                      <span className="text-sm text-ink">{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    {invoice.discount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted">Discount</span>
                        <span className="text-sm text-ink">-{formatCurrency(invoice.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-lg font-bold text-ink">Total</span>
                      <span className="text-lg font-bold text-accent-hover">{formatCurrency(invoiceTotal)}</span>
                    </div>
                  </div>

                  {invoice.notes && (
                    <div>
                      <p className="text-xs text-muted">Notes</p>
                      <p className="text-sm text-ink">{invoice.notes}</p>
                    </div>
                  )}

                  {invoice.payment_method && invoice.status === 'paid' && (
                    <div>
                      <p className="text-xs text-muted">Payment Method</p>
                      <p className="text-sm text-ink">{invoice.payment_method}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="min-h-tap rounded-xl border border-line px-4 font-semibold text-sm text-muted hover:bg-cream"
                    >
                      Edit
                    </button>
                  )}

                  {invoice.status !== 'paid' && invoice.status !== 'void' && (
                    <button
                      type="button"
                      onClick={() => setConfirmPaidOpen(true)}
                      className="min-h-tap rounded-xl border border-success/30 px-4 font-semibold text-sm text-success hover:bg-success-soft"
                    >
                      Mark as Paid
                    </button>
                  )}

                  {invoice.status !== 'void' && (
                    <button
                      type="button"
                      onClick={() => setConfirmVoidOpen(true)}
                      className="min-h-tap rounded-xl border border-danger/20 px-4 font-semibold text-sm text-danger hover:bg-danger/10"
                    >
                      Void
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="min-h-tap rounded-xl border border-accent/30 px-4 font-semibold text-sm text-accent hover:bg-accent-soft"
                  >
                    Download PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="min-h-tap rounded-xl border border-danger/20 px-4 font-semibold text-sm text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {confirmPaidOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-card-lg animate-fade-in">
            <h2 className="font-semibold text-lg text-ink">Mark invoice as paid?</h2>
            <p className="text-sm text-muted">Select payment method:</p>
            <select
              value={paymentMethodForPaid}
              onChange={(e) => setPaymentMethodForPaid(e.target.value)}
              disabled={confirming}
              className="min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
            >
              <option value="">Select payment method</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="FPX">FPX</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmPaidOpen(false)
                  setPaymentMethodForPaid('')
                }}
                disabled={confirming}
                className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={confirming || !paymentMethodForPaid.trim()}
                className="min-h-tap flex-1 rounded-xl bg-success font-semibold text-sm text-white shadow-card hover:bg-success/90 disabled:opacity-60"
              >
                {confirming ? 'Marking…' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmVoidOpen}
        title="Void this invoice?"
        message="The invoice will be marked as void and cannot be changed."
        confirmLabel="Void"
        onConfirm={handleVoid}
        onCancel={() => setConfirmVoidOpen(false)}
        loading={confirming}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this invoice?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        loading={confirming}
      />
    </div>
  )
}
