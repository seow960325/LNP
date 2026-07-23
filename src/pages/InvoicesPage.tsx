import { useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { InvoiceForm } from '../components/InvoiceForm'
import { extractInvokeError } from '../components/RegisterStaffForm'
import { fetchZohoInvoices, fetchZohoInvoicePdf, fetchAppInvoiceOriginIds, deleteZohoInvoice } from '../lib/zohoApi'
import type { ZohoInvoice } from '../lib/zohoApi'
import { formatMYR } from '../lib/zohoFinance'
import { formatDate, toKLDateISO } from '../lib/helpers'
import { openPdfFromBase64 } from '../lib/pdfUtils'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const YEAR_EXPANDED_STORAGE_KEY = 'center-ops:invoices-year-expanded'
// Sentinel bucket for the (expected-rare) row with no Zoho invoice date —
// sorts after every real year rather than crashing the numeric ordering.
const UNKNOWN_YEAR = 'unknown'

function loadExpandedYears(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(YEAR_EXPANDED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveExpandedYears(state: Record<string, boolean>) {
  try {
    localStorage.setItem(YEAR_EXPANDED_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing / storage disabled — expand state just won't persist.
  }
}

interface YearGroup {
  key: string
  label: string
  invoices: ZohoInvoice[]
}

export function InvoicesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<ZohoInvoice[]>([])
  // zoho_invoices rows that originated from THIS app (via zoho-invoice-create)
  // rather than pre-existing Zoho data — drives the "created in app" badge
  // and whether Edit/Delete show at all. Read-only from the client; never
  // written here (see lib/zohoApi.ts fetchAppInvoiceOriginIds).
  const [appOriginIds, setAppOriginIds] = useState<Set<string>>(new Set())
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>(() => loadExpandedYears())
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<ZohoInvoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ZohoInvoice | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadInvoices() {
    if (!profile) return
    setLoadState('loading')
    // Reads the zoho_invoices mirror (all 711+ real invoices) — the app
    // `invoices` table is unused; every invoice, whether pulled in by
    // zoho-sync or created through this app, lives in zoho_invoices. No
    // status filter — every status shows here.
    withTimeout(Promise.all([fetchZohoInvoices(), fetchAppInvoiceOriginIds()]))
      .then(([invoicesRes, originsRes]) => {
        if (invoicesRes.error || !invoicesRes.data) {
          setLoadError('Could not load invoices. Please try again.')
          setLoadState('error')
          return
        }
        setInvoices(invoicesRes.data)
        if (originsRes.error) {
          console.error(originsRes.error)
          setAppOriginIds(new Set())
        } else {
          setAppOriginIds(new Set((originsRes.data ?? []).map((row) => row.zoho_invoice_id)))
        }
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const currentYear = Number(toKLDateISO(new Date()).slice(0, 4))

  // Grouped by calendar year from zoho_invoices.date — current year first,
  // then prior years descending; latest invoice first within each year.
  // Years with no invoices simply don't get a group.
  const yearGroups: YearGroup[] = useMemo(() => {
    const byYear = new Map<string, ZohoInvoice[]>()
    for (const invoice of invoices) {
      const key = invoice.date ? invoice.date.slice(0, 4) : UNKNOWN_YEAR
      const bucket = byYear.get(key)
      if (bucket) {
        bucket.push(invoice)
      } else {
        byYear.set(key, [invoice])
      }
    }

    const numericYears = [...byYear.keys()].filter((k) => k !== UNKNOWN_YEAR).sort((a, b) => Number(b) - Number(a))
    const orderedKeys = [String(currentYear), ...numericYears.filter((y) => y !== String(currentYear))].filter((y) =>
      byYear.has(y),
    )
    if (byYear.has(UNKNOWN_YEAR)) orderedKeys.push(UNKNOWN_YEAR)

    return orderedKeys.map((key) => ({
      key,
      label: key === UNKNOWN_YEAR ? 'Unknown date' : key,
      invoices: [...byYear.get(key)!].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    }))
  }, [invoices, currentYear])

  // Default-expand the current year if it has invoices; otherwise the most
  // recent year that does (yearGroups[0] — already ordered current-year-
  // first-then-descending, filtered to groups with data) — so the newest
  // invoices are never hidden behind an empty current-year default.
  const defaultExpandedKey = yearGroups[0]?.key ?? String(currentYear)

  function isYearExpanded(key: string): boolean {
    return expandedYears[key] ?? key === defaultExpandedKey
  }

  function toggleYear(key: string) {
    setExpandedYears((current) => {
      const next = { ...current, [key]: !isYearExpanded(key) }
      saveExpandedYears(next)
      return next
    })
  }

  async function handleViewPdf(invoiceId: string) {
    setDownloadingId(invoiceId)
    const { data, error } = await fetchZohoInvoicePdf(invoiceId)
    setDownloadingId(null)

    if (error || !data?.pdf_base64) {
      let message = 'Could not load the invoice PDF. Please try again.'
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json()
          if (body?.error) message = body.error
        } catch {
          // Body wasn't JSON — fall back to the generic message.
        }
      }
      toast.error(message)
      return
    }

    openPdfFromBase64(data.pdf_base64)
  }

  function handleFormSaved() {
    setShowCreateForm(false)
    setEditingInvoice(null)
    loadInvoices()
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { data, error } = await deleteZohoInvoice(deleteTarget.invoice_id)
    setDeleting(false)

    if (error || !data?.ok) {
      // Zoho's own rejection (e.g. "this invoice has payments applied")
      // must reach the admin verbatim, not a generic failure message.
      toast.error(await extractInvokeError(error, 'Could not delete the invoice. Please try again.'))
      return
    }

    toast.success('Invoice deleted')
    const deletedId = deleteTarget.invoice_id
    setInvoices((current) => current.filter((inv) => inv.invoice_id !== deletedId))
    setAppOriginIds((current) => {
      const next = new Set(current)
      next.delete(deletedId)
      return next
    })
    setDeleteTarget(null)
  }

  if (!profile || !isAdmin) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader title="Invoices" />

        <TabNav tabs={BILLING_TABS} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex min-h-tap items-center rounded-xl bg-accent px-4 py-2 font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
          >
            + New Invoice
          </button>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading invoices…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && invoices.length === 0 && (
          <EmptyState message="No invoices yet." />
        )}

        {loadState === 'ready' &&
          yearGroups.map(({ key, label, invoices: yearInvoices }) => {
            const expanded = isYearExpanded(key)
            return (
              <div key={key} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleYear(key)}
                  aria-expanded={expanded}
                  className="flex min-h-tap w-full items-center gap-2 rounded-xl bg-white px-4 py-3 text-left shadow-card hover:bg-cream"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <span className="font-bold text-ink">
                    {label} <span className="font-normal text-muted">({yearInvoices.length})</span>
                  </span>
                </button>

                {expanded && (
                  <div className="overflow-x-auto rounded-xl bg-white shadow-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Invoice No.</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Customer</th>
                          <th className="px-4 py-3 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Total</th>
                          <th className="px-4 py-3 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Balance</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Status</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearInvoices.map((invoice) => {
                          const isAppOrigin = appOriginIds.has(invoice.invoice_id)
                          return (
                            <tr key={invoice.invoice_id} className="border-t border-line hover:bg-cream transition-colors">
                              <td className="px-4 py-3 font-bold text-ink">
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                  {invoice.invoice_number ?? invoice.invoice_id}
                                  {isAppOrigin && (
                                    <span title="Created in app" aria-label="Created in app" className="inline-flex shrink-0">
                                      <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-ink">{invoice.customer_name ?? '—'}</td>
                              <td className="px-4 py-3 text-right font-bold text-ink">{formatMYR(invoice.total)}</td>
                              <td className="px-4 py-3 text-right text-muted">{formatMYR(invoice.balance)}</td>
                              <td className="px-4 py-3 capitalize text-muted">{invoice.status ?? '—'}</td>
                              <td className="px-4 py-3 text-muted">{invoice.date ? formatDate(invoice.date) : '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleViewPdf(invoice.invoice_id)}
                                    disabled={downloadingId === invoice.invoice_id}
                                    className="min-h-tap shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-muted hover:bg-cream disabled:opacity-60"
                                  >
                                    {downloadingId === invoice.invoice_id ? 'Loading…' : 'View PDF'}
                                  </button>
                                  {isAppOrigin && isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setEditingInvoice(invoice)}
                                        aria-label="Edit invoice"
                                        className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:bg-cream"
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(invoice)}
                                        aria-label="Delete invoice"
                                        className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl border border-line text-danger hover:bg-danger/10"
                                      >
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {showCreateForm && profile && (
        <InvoiceForm
          mode="create"
          centerId={profile.center_id}
          onClose={() => setShowCreateForm(false)}
          onSaved={handleFormSaved}
        />
      )}

      {editingInvoice && profile && (
        <InvoiceForm
          mode="edit"
          centerId={profile.center_id}
          editingInvoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={handleFormSaved}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-card-lg">
            <h2 className="font-semibold text-lg text-ink">Delete invoice?</h2>
            <p className="text-sm text-muted">
              This permanently deletes invoice{' '}
              <span className="font-semibold text-ink">
                {deleteTarget.invoice_number ?? deleteTarget.invoice_id}
              </span>{' '}
              from Zoho. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="min-h-tap flex-1 rounded-xl bg-danger font-semibold text-sm text-white shadow-card hover:bg-danger/90 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
