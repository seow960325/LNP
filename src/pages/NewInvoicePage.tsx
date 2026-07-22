import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchStudents, createInvoice, fetchFeePackages } from '../lib/billingApi'
import type { StudentWithPackage, CreateInvoiceLineItemPayload, FeePackage } from '../lib/billingApi'
import { toKLDateISO } from '../lib/helpers'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return toKLDateISO(date)
}

function getTermLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const month = date.getMonth()
  const year = date.getFullYear()

  if (month <= 2) return `Term 1 ${year}`
  if (month <= 5) return `Term 2 ${year}`
  if (month <= 8) return `Term 3 ${year}`
  return `Term 4 ${year}`
}

export function NewInvoicePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentWithPackage[]>([])
  const [packages, setPackages] = useState<FeePackage[]>([])

  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [issueDate, setIssueDate] = useState(() => toKLDateISO(new Date()))
  const [termLabel, setTermLabel] = useState(() => getTermLabel(toKLDateISO(new Date())))
  const [termLabelManuallyEdited, setTermLabelManuallyEdited] = useState(false)
  const [dueDate, setDueDate] = useState(() => addDays(toKLDateISO(new Date()), 7))
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<CreateInvoiceLineItemPayload[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!profile) return
    setLoadState('loading')
    withTimeout(Promise.all([fetchStudents(profile.center_id), fetchFeePackages(profile.center_id)]))
      .then(([studentRes, packageRes]) => {
        if (studentRes.error || !studentRes.data || packageRes.error || !packageRes.data) {
          setLoadError('Could not load data. Please try again.')
          setLoadState('error')
          return
        }
        const activeStudents = studentRes.data.filter((s) => s.active)
        const activePackages = packageRes.data.filter((p) => p.active)
        setStudents(activeStudents)
        setPackages(activePackages)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }, [profile])

  if (!profile || !isAdmin) return null

  function handleStudentChange(studentId: string) {
    setSelectedStudentId(studentId)
    const student = students.find((s) => s.id === studentId)

    // Only prefill package if student has one AND there are no line items yet
    if (student && student.fee_packages && lineItems.length === 0) {
      setLineItems([
        {
          description: student.fee_packages.name,
          amount: student.fee_packages.default_price,
          sort_order: 0,
        },
      ])
    }
  }

  function handleIssueDateChange(newDate: string) {
    setIssueDate(newDate)
    setDueDate(addDays(newDate, 7))
    // Auto-update term label only if user hasn't manually edited it
    if (!termLabelManuallyEdited) {
      setTermLabel(getTermLabel(newDate))
    }
  }

  function handleTermLabelChange(newLabel: string) {
    setTermLabel(newLabel)
    setTermLabelManuallyEdited(!!newLabel.trim())
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        description: '',
        amount: 0,
        sort_order: prev.length,
      },
    ])
  }

  function addPackageLineItem() {
    if (!selectedPackageId) return
    const pkg = packages.find((p) => p.id === selectedPackageId)
    if (!pkg) return

    setLineItems((prev) => [
      ...prev,
      {
        description: pkg.name,
        amount: pkg.default_price,
        sort_order: prev.length,
      },
    ])
    setSelectedPackageId('')
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i })))
  }

  function updateLineItem(index: number, field: keyof CreateInvoiceLineItemPayload, value: string | number) {
    setLineItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!selectedStudentId) {
      toast.error('Please select a student')
      return
    }

    // Filter out empty rows (description empty AND amount 0)
    const validLineItems = lineItems.filter((item) => item.description.trim() !== '' || item.amount !== 0)

    if (validLineItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    if (!profile) return

    setSubmitting(true)

    try {
      const { data, error } = await withTimeout(
        createInvoice(profile.center_id, {
          student_id: selectedStudentId,
          term_label: termLabel.trim() || undefined,
          issue_date: issueDate,
          due_date: dueDate || undefined,
          discount: discount || undefined,
          notes: notes.trim() || undefined,
          line_items: validLineItems,
        }),
      )

      setSubmitting(false)

      if (error || !data) {
        toast.error('Failed to create invoice')
        return
      }

      toast.success(`Invoice ${data.invoice_no} created`)
      navigate(`/invoices/${data.id}`)
    } catch (err) {
      setSubmitting(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="New Invoice" />

        {loadState === 'loading' && <LoadingState label="Loading students…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl bg-white p-5 shadow-card">
              <p className="mb-3 font-semibold text-sm text-ink">Student</p>

              <select
                value={selectedStudentId}
                onChange={(e) => handleStudentChange(e.target.value)}
                disabled={submitting}
                required
                className="min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              >
                <option value="">Select a student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-white p-5 shadow-card">
              <div>
                <label className="text-xs text-muted">Term Label</label>
                <input
                  type="text"
                  value={termLabel}
                  onChange={(e) => handleTermLabelChange(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. Term 1 2026"
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Issue Date *</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => handleIssueDateChange(e.target.value)}
                  disabled={submitting}
                  required
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={submitting}
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Subtotal</label>
                <div className="mt-1 flex min-h-tap w-full items-center rounded-xl border border-line bg-cream px-3 py-2 text-sm font-bold text-ink">
                  RM {subtotal.toFixed(2)}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted">Discount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  disabled={submitting}
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Total (after discount)</label>
                <div className="mt-1 flex min-h-tap w-full items-center rounded-xl border border-line bg-cream px-3 py-2 text-sm font-bold text-accent-hover">
                  RM {Math.max(0, subtotal - discount).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-card">
              <p className="mb-3 font-semibold text-sm text-ink">Line Items</p>

              {packages.length > 0 && (
                <div className="mb-4 flex gap-2">
                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    disabled={submitting}
                    className="min-h-tap flex-1 rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                  >
                    <option value="">Add from package…</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} — RM {pkg.default_price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPackageLineItem}
                    disabled={submitting || !selectedPackageId}
                    className="min-h-tap rounded-xl bg-accent px-4 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''}</p>
                <button
                  type="button"
                  onClick={addLineItem}
                  disabled={submitting}
                  className="text-xs text-accent hover:underline disabled:opacity-60"
                >
                  + Add blank row
                </button>
              </div>

              <div className="space-y-2">
                {lineItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      disabled={submitting}
                      placeholder="Description"
                      className="min-h-tap flex-1 rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amount}
                      onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                      disabled={submitting}
                      placeholder="Amount"
                      className="min-h-tap w-24 rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      disabled={submitting}
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
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Payment terms, special instructions"
                className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create Invoice'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/invoices')}
                disabled={submitting}
                className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
