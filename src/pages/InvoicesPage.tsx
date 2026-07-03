import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { fetchInvoices } from '../lib/billingApi'
import type { InvoiceWithDetails } from '../lib/billingApi'

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

export function InvoicesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')

  function loadInvoices() {
    if (!profile) return
    setLoadState('loading')
    fetchInvoices(profile.center_id, statusFilter || undefined).then(({ data, error }) => {
      if (error || !data) {
        setLoadError('Could not load invoices. Please try again.')
        setLoadState('error')
        return
      }
      setInvoices(data)
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadInvoices()
  }, [profile, statusFilter])

  if (!profile || !isAdmin) return null

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-MY')
  const formatCurrency = (amount: number) => `RM ${amount.toFixed(2)}`

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Invoices</h1>
        </div>

        <TabNav tabs={BILLING_TABS} />

        <div className="flex items-center gap-3">
          <Link
            to="/invoices/new"
            className="inline-flex min-h-tap items-center rounded-xl bg-accent px-4 py-2 font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
          >
            + New Invoice
          </Link>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-tap rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted shadow-card"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading invoices…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && invoices.length === 0 && (
          <EmptyState message="No invoices yet. Create one to get started." />
        )}

        {loadState === 'ready' && invoices.length > 0 && (
          <div className="rounded-xl bg-white shadow-card overflow-x-auto">
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
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-t border-line hover:bg-cream transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="font-bold text-accent hover:underline"
                      >
                        {invoice.invoice_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{invoice.students?.name}</td>
                    <td className="px-4 py-3 text-muted">{invoice.term_label || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-ink">
                      {formatCurrency(invoice.subtotal)}
                    </td>
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
    </div>
  )
}
