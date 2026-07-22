import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { fetchInvoices } from '../lib/billingApi'
import type { InvoiceWithDetails } from '../lib/billingApi'
import { formatDate, toKLDateISO } from '../lib/helpers'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-line/60 text-muted',
  sent: 'bg-accent-soft text-accent-hover',
  paid: 'bg-success-soft text-success',
  void: 'bg-danger/10 text-danger',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  void: 'Void',
}

const YEAR_EXPANDED_STORAGE_KEY = 'center-ops:invoices-year-expanded'

function loadExpandedYears(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(YEAR_EXPANDED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveExpandedYears(state: Record<number, boolean>) {
  try {
    localStorage.setItem(YEAR_EXPANDED_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing / storage disabled — expand state just won't persist.
  }
}

interface YearGroup {
  year: number
  invoices: InvoiceWithDetails[]
}

export function InvoicesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([])
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>(() => loadExpandedYears())

  function loadInvoices() {
    if (!profile) return
    setLoadState('loading')
    // No status filter here — this view shows every status, grouped by year.
    withTimeout(fetchInvoices(profile.center_id))
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

  // Grouped by calendar year (from issue_date, not created_at) — current
  // year first, then prior years descending; latest invoice first within
  // each year. Years with no invoices simply don't get a group.
  const yearGroups: YearGroup[] = useMemo(() => {
    const byYear = new Map<number, InvoiceWithDetails[]>()
    for (const invoice of invoices) {
      const year = Number(invoice.issue_date.slice(0, 4))
      const bucket = byYear.get(year)
      if (bucket) {
        bucket.push(invoice)
      } else {
        byYear.set(year, [invoice])
      }
    }

    const years = [...byYear.keys()].sort((a, b) => b - a)
    const orderedYears = [currentYear, ...years.filter((y) => y !== currentYear)].filter((y) => byYear.has(y))

    return orderedYears.map((year) => ({
      year,
      invoices: [...byYear.get(year)!].sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
    }))
  }, [invoices, currentYear])

  function isYearExpanded(year: number): boolean {
    return expandedYears[year] ?? year === currentYear
  }

  function toggleYear(year: number) {
    setExpandedYears((current) => {
      const next = { ...current, [year]: !isYearExpanded(year) }
      saveExpandedYears(next)
      return next
    })
  }

  if (!profile || !isAdmin) return null

  const formatCurrency = (amount: number) => `RM ${amount.toFixed(2)}`

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
          <EmptyState message="No invoices yet. Create one to get started." />
        )}

        {loadState === 'ready' &&
          yearGroups.map(({ year, invoices: yearInvoices }) => {
            const expanded = isYearExpanded(year)
            return (
              <div key={year} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  aria-expanded={expanded}
                  className="flex min-h-tap w-full items-center gap-2 rounded-xl bg-white px-4 py-3 text-left shadow-card hover:bg-cream"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <span className="font-bold text-ink">
                    {year} <span className="font-normal text-muted">({yearInvoices.length})</span>
                  </span>
                </button>

                {expanded && (
                  <div className="overflow-x-auto rounded-xl bg-white shadow-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Invoice No.</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Student</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Term</th>
                          <th className="px-4 py-3 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Subtotal</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Status</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Issue Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearInvoices.map((invoice) => (
                          <tr key={invoice.id} className="border-t border-line hover:bg-cream transition-colors">
                            <td className="px-4 py-3">
                              <Link to={`/invoices/${invoice.id}`} className="font-bold text-accent hover:underline">
                                {invoice.invoice_no}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-ink">{invoice.students?.name}</td>
                            <td className="px-4 py-3 text-muted">{invoice.term_label || '—'}</td>
                            <td className="px-4 py-3 text-right font-bold text-ink">{formatCurrency(invoice.subtotal)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full px-2.5 py-1 text-2xs font-semibold ${
                                  STATUS_STYLES[invoice.status]
                                }`}
                              >
                                {STATUS_LABELS[invoice.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted">{formatDate(invoice.issue_date)}</td>
                            <td className="px-4 py-3 text-muted">{invoice.due_date ? formatDate(invoice.due_date) : '—'}</td>
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
