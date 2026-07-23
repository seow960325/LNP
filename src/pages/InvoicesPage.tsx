import { useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { fetchZohoInvoices, fetchZohoInvoicePdf } from '../lib/zohoApi'
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
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>(() => loadExpandedYears())
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  function loadInvoices() {
    if (!profile) return
    setLoadState('loading')
    // Reads the zoho_invoices mirror (all 711+ real invoices) — the app
    // `invoices` table is currently empty; app-created invoices that push to
    // Zoho are a separate, later feature. No status filter — every status
    // shows here.
    withTimeout(fetchZohoInvoices())
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load invoices. Please try again.')
          setLoadState('error')
          return
        }
        setInvoices(data)
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

  if (!profile || !isAdmin) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader title="Invoices" />

        <TabNav tabs={BILLING_TABS} />

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/invoices/new"
            className="inline-flex min-h-tap items-center rounded-xl bg-accent px-4 py-2 font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
          >
            + New Invoice
          </Link>
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
                        {yearInvoices.map((invoice) => (
                          <tr key={invoice.invoice_id} className="border-t border-line hover:bg-cream transition-colors">
                            <td className="px-4 py-3 font-bold text-ink">{invoice.invoice_number ?? invoice.invoice_id}</td>
                            <td className="px-4 py-3 text-ink">{invoice.customer_name ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-bold text-ink">{formatMYR(invoice.total)}</td>
                            <td className="px-4 py-3 text-right text-muted">{formatMYR(invoice.balance)}</td>
                            <td className="px-4 py-3 capitalize text-muted">{invoice.status ?? '—'}</td>
                            <td className="px-4 py-3 text-muted">{invoice.date ? formatDate(invoice.date) : '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleViewPdf(invoice.invoice_id)}
                                disabled={downloadingId === invoice.invoice_id}
                                className="min-h-tap shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-muted hover:bg-cream disabled:opacity-60"
                              >
                                {downloadingId === invoice.invoice_id ? 'Loading…' : 'View PDF'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
