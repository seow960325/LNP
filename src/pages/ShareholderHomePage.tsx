import { useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Receipt,
  RefreshCw,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { RevenueExpenseChart } from '../components/RevenueExpenseChart'
import { LedgerRow } from '../components/LedgerRow'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import { formatDate, formatTimeKL } from '../lib/helpers'
import {
  fetchZohoInvoices,
  fetchZohoExpenses,
  fetchZohoBankAccounts,
  fetchZohoBankTransactions,
  fetchFamilyArSummary,
  fetchLatestSyncLog,
  fetchZohoReport,
  fetchLatestZohoReport,
  triggerZohoSync,
} from '../lib/zohoApi'
import type {
  ZohoInvoice,
  ZohoExpense,
  ZohoBankAccount,
  ZohoBankTransaction,
  FamilyArSummary,
  ZohoSyncLog,
  ZohoReportRow,
} from '../lib/zohoApi'
import {
  currentFyStartYear,
  fyLabel,
  fyDateRange,
  isDateInFy,
  isBillableInvoice,
  monthlyRevenueExpense,
  formatMYR,
  formatPercent,
} from '../lib/zohoFinance'
import { parsePnl, parseBalanceSheet, findOperatingIncomeNode, sectionLineItems, formatMYROrDash } from '../lib/zohoReportParsing'
import type { PnlSummary } from '../lib/zohoReportParsing'
import { withRunningBalance } from '../lib/zohoBankStatement'

type LoadState = 'loading' | 'ready' | 'error'
type TabKey = 'overview' | 'pl' | 'bank' | 'balance'
type DrilldownKey = 'revenue' | 'cash' | 'outstanding' | null

// In-page tabs (not routes, unlike TabNav elsewhere) deliberately: all four
// views share the FY selector below and most of their data is fetched once.
// Styled to match TabNav exactly so it's visually indistinguishable.
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'pl', label: 'P&L' },
  { key: 'bank', label: 'Bank' },
  { key: 'balance', label: 'Balance Sheet' },
]

const PNL_ROWS: { label: string; key: keyof PnlSummary }[] = [
  { label: 'Operating Income', key: 'operatingIncome' },
  { label: 'Cost of Goods Sold', key: 'costOfGoodsSold' },
  { label: 'Gross Profit', key: 'grossProfit' },
  { label: 'Operating Expense', key: 'operatingExpense' },
  { label: 'Operating Profit', key: 'operatingProfit' },
  { label: 'Net Profit', key: 'netProfit' },
]

function KpiCard({
  label,
  value,
  Icon,
  sub,
  valueClassName = 'text-ink',
  onClick,
}: {
  label: string
  value: string
  Icon: LucideIcon
  sub?: string
  valueClassName?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-2xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-1.5 text-xl font-bold ${valueClassName}`}>{value}</div>
      {sub && <div className="text-2xs text-muted">{sub}</div>}
    </>
  )

  if (!onClick) {
    return <div className="rounded-xl bg-white p-4 shadow-card">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-white p-4 text-left shadow-card transition-shadow hover:shadow-card-md active:scale-[0.98]"
    >
      {content}
    </button>
  )
}

function ParseWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function DrilldownHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex min-h-tap min-w-tap items-center justify-center rounded-lg text-muted hover:bg-accent-soft/40 hover:text-ink"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <h2 className="font-bold text-lg text-ink">{title}</h2>
    </div>
  )
}

export function ShareholderHomePage() {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<ZohoInvoice[]>([])
  const [expenses, setExpenses] = useState<ZohoExpense[]>([])
  const [bankAccounts, setBankAccounts] = useState<ZohoBankAccount[]>([])
  const [familyAr, setFamilyAr] = useState<FamilyArSummary | null>(null)
  const [syncLog, setSyncLog] = useState<ZohoSyncLog | null>(null)

  const [reportsState, setReportsState] = useState<LoadState>('loading')
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [pnlCurrent, setPnlCurrent] = useState<ZohoReportRow | null>(null)
  const [pnlPrior, setPnlPrior] = useState<ZohoReportRow | null>(null)
  const [balanceSheetReport, setBalanceSheetReport] = useState<ZohoReportRow | null>(null)

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [drilldown, setDrilldown] = useState<DrilldownKey>(null)
  const [fyStartYear, setFyStartYear] = useState(() => currentFyStartYear())
  const [syncing, setSyncing] = useState(false)

  // Bank transactions: fetched lazily, only when the Cash drill-down opens.
  const [bankTxns, setBankTxns] = useState<ZohoBankTransaction[]>([])
  const [bankTxnsLoaded, setBankTxnsLoaded] = useState(false)
  const [bankTxnsState, setBankTxnsState] = useState<LoadState>('loading')
  const [bankTxnsError, setBankTxnsError] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  function loadBase() {
    setLoadState('loading')
    withTimeout(
      Promise.all([
        fetchZohoInvoices(),
        fetchZohoExpenses(),
        fetchZohoBankAccounts(),
        fetchFamilyArSummary(),
        fetchLatestSyncLog(),
      ]),
    )
      .then(([invRes, expRes, bankRes, arRes, logRes]) => {
        if (invRes.error || expRes.error || bankRes.error || arRes.error || logRes.error) {
          setLoadError('Could not load financial data. Please try again.')
          setLoadState('error')
          return
        }
        setInvoices(invRes.data ?? [])
        setExpenses(expRes.data ?? [])
        setBankAccounts(bankRes.data ?? [])
        setFamilyAr(arRes.data ?? null)
        setSyncLog(logRes.data ?? null)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  function loadReports(year: number) {
    setReportsState('loading')
    const current = fyDateRange(year)
    const prior = fyDateRange(year - 1)
    withTimeout(
      Promise.all([
        fetchZohoReport('pnl', current.start, current.end),
        fetchZohoReport('pnl', prior.start, prior.end),
        fetchLatestZohoReport('balancesheet'),
      ]),
    )
      .then(([curRes, priorRes, bsRes]) => {
        if (curRes.error || priorRes.error || bsRes.error) {
          setReportsError('Could not load Zoho reports. Please try again.')
          setReportsState('error')
          return
        }
        setPnlCurrent(curRes.data ?? null)
        setPnlPrior(priorRes.data ?? null)
        setBalanceSheetReport(bsRes.data ?? null)
        setReportsState('ready')
      })
      .catch((err) => {
        setReportsError(getUserErrorMessage(err))
        setReportsState('error')
      })
  }

  useEffect(() => {
    loadBase()
  }, [])

  useEffect(() => {
    loadReports(fyStartYear)
  }, [fyStartYear])

  // Default the bank-statement account filter to the first account once
  // bank accounts have loaded.
  useEffect(() => {
    if (!selectedAccountId && bankAccounts.length > 0) setSelectedAccountId(bankAccounts[0].account_id)
  }, [bankAccounts, selectedAccountId])

  // Lazy-load bank transactions the first time the Cash drill-down opens.
  useEffect(() => {
    if (drilldown !== 'cash' || bankTxnsLoaded) return
    setBankTxnsState('loading')
    withTimeout(fetchZohoBankTransactions())
      .then(({ data, error }) => {
        if (error) {
          setBankTxnsError('Could not load bank transactions. Please try again.')
          setBankTxnsState('error')
          return
        }
        setBankTxns(data ?? [])
        setBankTxnsState('ready')
        setBankTxnsLoaded(true)
      })
      .catch((err) => {
        setBankTxnsError(getUserErrorMessage(err))
        setBankTxnsState('error')
      })
  }, [drilldown, bankTxnsLoaded])

  function handleFyStep(delta: number) {
    const next = fyStartYear + delta
    if (next > currentFyStartYear()) return // no future fiscal years
    setFyStartYear(next)
  }

  async function handleSyncNow() {
    setSyncing(true)
    const { data, error } = await triggerZohoSync()
    setSyncing(false)

    if (error) {
      let message = 'Could not sync with Zoho. Please try again.'
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

    toast.success(`Synced ${data?.records ?? 0} record${data?.records === 1 ? '' : 's'} from Zoho`)
    loadBase()
    loadReports(fyStartYear)
    // Bank transactions aren't re-fetched automatically on sync (they're
    // lazy-loaded) — force a re-fetch next time the drill-down opens.
    setBankTxnsLoaded(false)
  }

  const chartData = useMemo(
    () => monthlyRevenueExpense(fyStartYear, invoices, expenses),
    [fyStartYear, invoices, expenses],
  )

  const cash = useMemo(() => bankAccounts.reduce((sum, a) => sum + (a.current_balance ?? 0), 0), [bankAccounts])

  const pnlCurrentSummary = useMemo(() => (pnlCurrent ? parsePnl(pnlCurrent.data) : null), [pnlCurrent])
  const pnlPriorSummary = useMemo(() => (pnlPrior ? parsePnl(pnlPrior.data) : null), [pnlPrior])
  const balanceSheetSummary = useMemo(
    () => (balanceSheetReport ? parseBalanceSheet(balanceSheetReport.data) : null),
    [balanceSheetReport],
  )

  const netMargin =
    pnlCurrentSummary?.netProfit != null && pnlCurrentSummary?.operatingIncome
      ? (pnlCurrentSummary.netProfit / pnlCurrentSummary.operatingIncome) * 100
      : null

  const bsBalanced =
    balanceSheetSummary &&
    balanceSheetSummary.totalAssets !== null &&
    balanceSheetSummary.totalLiabilities !== null &&
    balanceSheetSummary.totalEquity !== null
      ? Math.abs(balanceSheetSummary.totalAssets - (balanceSheetSummary.totalLiabilities + balanceSheetSummary.totalEquity)) < 0.01
      : null // null = couldn't parse enough of the report to check, not "unbalanced"

  const lastSyncedLabel = syncLog?.ran_at ? `${formatDate(syncLog.ran_at)}, ${formatTimeKL(syncLog.ran_at)}` : 'Never'

  // --- Revenue drill-down data ---
  const operatingIncomeNode = useMemo(() => (pnlCurrent ? findOperatingIncomeNode(pnlCurrent.data) : null), [pnlCurrent])
  const incomeLineItems = useMemo(() => sectionLineItems(operatingIncomeNode), [operatingIncomeNode])
  const incomeLineItemsSum = useMemo(() => incomeLineItems.reduce((sum, item) => sum + item.total, 0), [incomeLineItems])
  // Positive lines (largest first) vs contra lines (Discount, General Income
  // adjustments, etc.) — detected by sign, never by hardcoded name, since
  // Zoho's exact line names aren't guaranteed.
  const positiveIncomeLines = useMemo(
    () => incomeLineItems.filter((item) => item.total > 0).sort((a, b) => b.total - a.total),
    [incomeLineItems],
  )
  const contraIncomeLines = useMemo(() => incomeLineItems.filter((item) => item.total < 0), [incomeLineItems])

  const periodInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => isBillableInvoice(inv) && isDateInFy(inv.date, fyStartYear))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [invoices, fyStartYear],
  )
  const periodInvoicedTotal = useMemo(() => periodInvoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0), [periodInvoices])
  const periodDiscountTotal = useMemo(() => periodInvoices.reduce((sum, inv) => sum + (inv.discount ?? 0), 0), [periodInvoices])
  const netInvoiced = periodInvoicedTotal - periodDiscountTotal
  const netOperatingIncomeFromReport = pnlCurrentSummary?.operatingIncome ?? null
  // Net invoiced normally exceeds recognised P&L income (timing, refundable
  // deposits, etc.), so this is netInvoiced minus the report figure — NOT
  // the other way round — so the normal case reads as a positive gap.
  const reconciliationGap = netOperatingIncomeFromReport !== null ? netInvoiced - netOperatingIncomeFromReport : null

  // --- Outstanding AR drill-down data ---
  const outstandingInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => isBillableInvoice(inv) && (inv.balance ?? 0) > 0)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [invoices],
  )

  // --- Cash / bank statement drill-down data ---
  const selectedAccount = bankAccounts.find((a) => a.account_id === selectedAccountId) ?? null
  const statementRows = useMemo(() => {
    if (!selectedAccount) return []
    const txnsForAccount = bankTxns.filter((t) => t.account_id === selectedAccount.account_id)
    return withRunningBalance(txnsForAccount)
  }, [bankTxns, selectedAccount])

  const showFyStepper = !drilldown && (activeTab === 'overview' || activeTab === 'pl')

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader title="Shareholder Financials" fallback="/" />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-card">
          <span className="text-xs text-muted">Last synced: {lastSyncedLabel}</span>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="inline-flex min-h-tap items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 font-semibold text-xs text-accent-hover hover:bg-accent-soft/70 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {!drilldown && (
          <nav aria-label="Financial report tabs" className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex min-h-tap flex-1 items-center justify-center rounded-lg font-semibold text-sm transition-colors duration-150 ${
                  activeTab === tab.key
                    ? 'bg-accent-soft text-accent-hover'
                    : 'text-muted hover:bg-accent-soft/40 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {loadState === 'loading' && <LoadingState label="Loading financial data…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && (
          <>
            {showFyStepper && (
              <div className="flex items-center justify-center gap-1 rounded-xl bg-white p-3 shadow-card">
                <button
                  type="button"
                  onClick={() => handleFyStep(-1)}
                  aria-label="Previous fiscal year"
                  className="flex min-h-tap min-w-tap items-center justify-center rounded-lg text-muted hover:bg-accent-soft/40 hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-20 text-center font-semibold text-sm text-ink">{fyLabel(fyStartYear)}</span>
                <button
                  type="button"
                  onClick={() => handleFyStep(1)}
                  disabled={fyStartYear >= currentFyStartYear()}
                  aria-label="Next fiscal year"
                  className="flex min-h-tap min-w-tap items-center justify-center rounded-lg text-muted hover:bg-accent-soft/40 hover:text-ink disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {drilldown === 'revenue' && (
              <div className="space-y-4">
                <DrilldownHeader title={`Revenue — ${fyLabel(fyStartYear)}`} onBack={() => setDrilldown(null)} />

                <div className="space-y-2 rounded-xl border border-line bg-white p-4 shadow-card">
                  <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">P&L income breakdown</h3>
                  {incomeLineItems.length === 0 ? (
                    <p className="py-2 text-sm text-muted">Could not read the income breakdown from the Zoho report.</p>
                  ) : (
                    <>
                      {positiveIncomeLines.map((item) => (
                        <LedgerRow key={item.name} label={item.name} amount={item.total} />
                      ))}
                      {contraIncomeLines.map((item) => (
                        <LedgerRow key={item.name} label={`Less: ${item.name}`} amount={item.total} negative />
                      ))}
                    </>
                  )}
                  <div className="border-t border-line pt-2">
                    <LedgerRow label="Net operating income" amount={netOperatingIncomeFromReport ?? 0} bold />
                  </div>
                  {incomeLineItems.length > 0 && netOperatingIncomeFromReport !== null && Math.abs(incomeLineItemsSum - netOperatingIncomeFromReport) > 0.01 && (
                    <p className="pt-1 text-2xs text-danger">
                      Sum of lines doesn't match Zoho's stated total — the line-item parser may be reading the wrong section.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-white p-4 shadow-card">
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
                    Invoices — {fyLabel(fyStartYear)}
                  </h3>
                  {periodInvoices.length === 0 ? (
                    <p className="py-2 text-sm text-muted">No invoices in this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <thead>
                          <tr className="border-b border-line">
                            <th className="py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Date</th>
                            <th className="py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Customer</th>
                            <th className="py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Amount</th>
                            <th className="py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Discount</th>
                            <th className="py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {periodInvoices.map((inv) => (
                            <tr key={inv.invoice_id}>
                              <td className="py-2 text-muted">{inv.date ? formatDate(inv.date) : '—'}</td>
                              <td className="py-2 text-ink">{inv.customer_name ?? '—'}</td>
                              <td className="py-2 text-right tabular-nums text-ink">{formatMYR(inv.total)}</td>
                              <td className="py-2 text-right tabular-nums text-muted">{inv.discount ? formatMYR(inv.discount) : '—'}</td>
                              <td className="py-2 text-muted capitalize">{inv.status ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-line bg-cream p-4 shadow-card">
                  <LedgerRow label="Gross invoiced" amount={periodInvoicedTotal} />
                  <LedgerRow label="Less: discounts" amount={periodDiscountTotal} negative muted />
                  <div className="border-t border-line pt-2">
                    <LedgerRow label="Net invoiced" amount={netInvoiced} bold />
                  </div>
                  <LedgerRow label="Net operating income (Zoho P&L)" amount={netOperatingIncomeFromReport ?? 0} muted />
                  <div className="space-y-1 border-t border-line pt-2">
                    <LedgerRow label="Unreconciled difference" amount={reconciliationGap ?? 0} bold />
                    <p className="text-2xs text-muted">
                      Timing differences, refundable deposits, and other items not yet recognised in the P&L.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {drilldown === 'cash' && (
              <div className="space-y-4">
                <DrilldownHeader title="Bank Statement" onBack={() => setDrilldown(null)} />

                {bankAccounts.length > 1 && (
                  <select
                    value={selectedAccountId ?? ''}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="min-h-tap rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    {bankAccounts.map((a) => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.account_name ?? a.account_id}
                      </option>
                    ))}
                  </select>
                )}

                {bankTxnsState === 'loading' && <LoadingState label="Loading transactions…" />}
                {bankTxnsState === 'error' && <ErrorState message={bankTxnsError ?? 'Could not load transactions.'} />}

                {bankTxnsState === 'ready' &&
                  (statementRows.length === 0 ? (
                    <EmptyState message="No transactions synced for this account yet." />
                  ) : (
                    <div className="overflow-x-auto rounded-xl bg-white shadow-card">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-b border-line">
                            <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Date</th>
                            <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">
                              Description
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                              Deposit
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                              Withdrawal
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {statementRows.map((row) => (
                            <tr key={row.transaction_id}>
                              <td className="px-3 py-2 text-muted">{row.date ? formatDate(row.date) : '—'}</td>
                              <td className="px-3 py-2 text-ink">{row.payee ?? row.description ?? '—'}</td>
                              <td className="px-3 py-2 text-right text-success">
                                {row.signedAmount > 0 ? formatMYR(row.signedAmount) : ''}
                              </td>
                              <td className="px-3 py-2 text-right text-danger">
                                {row.signedAmount < 0 ? formatMYR(Math.abs(row.signedAmount)) : ''}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-ink">
                                {formatMYROrDash(row.running_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}

            {drilldown === 'outstanding' && (
              <div className="space-y-4">
                <DrilldownHeader title="Outstanding Invoices" onBack={() => setDrilldown(null)} />
                {outstandingInvoices.length === 0 ? (
                  <EmptyState message="No outstanding invoices." />
                ) : (
                  <div className="overflow-x-auto rounded-xl bg-white shadow-card">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">
                            Invoice No.
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">
                            Customer
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                            Balance
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {outstandingInvoices.map((inv) => (
                          <tr key={inv.invoice_id}>
                            <td className="px-3 py-2 text-muted">{inv.date ? formatDate(inv.date) : '—'}</td>
                            <td className="px-3 py-2 text-ink">{inv.invoice_number ?? inv.invoice_id}</td>
                            <td className="px-3 py-2 text-ink">{inv.customer_name ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-danger">{formatMYR(inv.balance)}</td>
                            <td className="px-3 py-2 capitalize text-muted">{inv.status ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {!drilldown && activeTab === 'overview' && (
              <div className="space-y-4">
                {reportsState === 'error' && <ErrorState message={reportsError ?? 'Could not load Zoho reports.'} />}
                {reportsState === 'ready' && !pnlCurrent && (
                  <ParseWarning
                    message={`No accrual P&L synced for ${fyLabel(fyStartYear)} yet — Revenue and Net Profit below are unavailable until the next sync.`}
                  />
                )}
                {reportsState === 'ready' && pnlCurrent && pnlCurrentSummary?.netProfit === null && (
                  <ParseWarning message="Could not read Net Profit from the synced Zoho report. The raw payload is stored in zoho_reports — check its shape against src/lib/zohoReportParsing.ts." />
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Revenue"
                    value={formatMYROrDash(pnlCurrentSummary?.operatingIncome ?? null)}
                    Icon={Receipt}
                    onClick={() => setDrilldown('revenue')}
                  />
                  <KpiCard
                    label="Net Profit"
                    value={formatMYROrDash(pnlCurrentSummary?.netProfit ?? null)}
                    sub={netMargin !== null ? `${formatPercent(netMargin)} margin` : undefined}
                    Icon={TrendingUp}
                    valueClassName={
                      pnlCurrentSummary?.netProfit == null ? 'text-ink' : pnlCurrentSummary.netProfit >= 0 ? 'text-success' : 'text-danger'
                    }
                    onClick={() => setActiveTab('pl')}
                  />
                  <KpiCard label="Cash at Bank" value={formatMYR(cash)} Icon={Landmark} onClick={() => setDrilldown('cash')} />
                  <KpiCard
                    label="Outstanding AR"
                    value={formatMYR(familyAr?.total_outstanding ?? 0)}
                    Icon={Wallet}
                    onClick={() => setDrilldown('outstanding')}
                  />
                </div>

                <div className="rounded-xl bg-white p-4 shadow-card">
                  <h2 className="mb-1 font-semibold text-sm text-ink">
                    Invoiced sales vs recorded expenses (billing trend) — {fyLabel(fyStartYear)}
                  </h2>
                  <p className="mb-3 text-2xs text-muted">
                    Billing activity, not the accrual P&L — see the P&L tab for Zoho's actual profit figures.
                  </p>
                  <RevenueExpenseChart data={chartData} />
                </div>
              </div>
            )}

            {!drilldown && activeTab === 'pl' && (
              <div className="space-y-4">
                {reportsState === 'loading' && <LoadingState label="Loading Zoho report…" />}
                {reportsState === 'error' && <ErrorState message={reportsError ?? 'Could not load Zoho reports.'} />}

                {reportsState === 'ready' && (
                  <div className="rounded-xl bg-white p-4 shadow-card">
                    {!pnlCurrent && !pnlPrior ? (
                      <EmptyState message={`No accrual P&L synced for ${fyLabel(fyStartYear)} or ${fyLabel(fyStartYear - 1)} yet.`} />
                    ) : (
                      <>
                        {pnlCurrent && pnlCurrentSummary?.netProfit === null && (
                          <div className="mb-3">
                            <ParseWarning message="Could not read Net Profit from the synced Zoho report — see zoho_reports.data." />
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[420px] text-sm">
                            <thead>
                              <tr className="border-b border-line">
                                <th className="py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Line</th>
                                <th className="py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                                  {fyLabel(fyStartYear)}
                                </th>
                                <th className="py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">
                                  {fyLabel(fyStartYear - 1)}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {PNL_ROWS.map((row) => {
                                const isNet = row.key === 'netProfit'
                                const currentValue = pnlCurrentSummary?.[row.key] ?? null
                                return (
                                  <tr key={row.key} className={isNet ? 'font-bold' : ''}>
                                    <td className="py-2 text-ink">{row.label}</td>
                                    <td
                                      className={`py-2 text-right ${
                                        isNet ? (currentValue == null ? 'text-ink' : currentValue >= 0 ? 'text-success' : 'text-danger') : 'text-ink'
                                      }`}
                                    >
                                      {formatMYROrDash(currentValue)}
                                    </td>
                                    <td className="py-2 text-right text-muted">{formatMYROrDash(pnlPriorSummary?.[row.key] ?? null)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!drilldown &&
              activeTab === 'bank' &&
              (bankAccounts.length === 0 ? (
                <EmptyState message="No bank accounts synced yet." />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {bankAccounts.map((account) => (
                      <div key={account.account_id} className="rounded-xl bg-white p-4 shadow-card">
                        <div className="flex items-center gap-1.5 text-muted">
                          <Landmark className="h-4 w-4" aria-hidden="true" />
                          <span className="text-2xs font-semibold uppercase tracking-wider">
                            {account.account_type ?? 'Bank'}
                          </span>
                        </div>
                        <div className="mt-1.5 font-bold text-ink">{account.account_name ?? 'Unnamed account'}</div>
                        <div className="text-lg font-bold text-accent">{formatMYR(account.current_balance)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-card">
                    <span className="font-semibold text-sm text-ink">Total Cash at Bank</span>
                    <span className="font-bold text-lg text-accent">{formatMYR(cash)}</span>
                  </div>
                </div>
              ))}

            {!drilldown && activeTab === 'balance' && (
              <div className="space-y-4">
                {reportsState === 'loading' && <LoadingState label="Loading Zoho report…" />}
                {reportsState === 'error' && <ErrorState message={reportsError ?? 'Could not load Zoho reports.'} />}

                {reportsState === 'ready' &&
                  (!balanceSheetReport ? (
                    <EmptyState message="Balance Sheet syncing — available soon. This report will appear automatically once it's synced from Zoho." />
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-white p-4 shadow-card">
                        <p className="mb-2 text-2xs text-muted">As of {formatDate(balanceSheetReport.period_end)}</p>
                        <ul className="divide-y divide-line">
                          <li className="flex items-center justify-between py-2 text-sm">
                            <span className="font-semibold text-ink">Assets</span>
                            <span className="font-bold text-ink">{formatMYROrDash(balanceSheetSummary?.totalAssets ?? null)}</span>
                          </li>
                          <li className="flex items-center justify-between py-2 text-sm">
                            <span className="font-semibold text-ink">Liabilities</span>
                            <span className="font-bold text-ink">
                              {formatMYROrDash(balanceSheetSummary?.totalLiabilities ?? null)}
                            </span>
                          </li>
                          <li className="flex items-center justify-between py-2 text-sm">
                            <span className="font-semibold text-ink">Equity</span>
                            <span className="font-bold text-ink">{formatMYROrDash(balanceSheetSummary?.totalEquity ?? null)}</span>
                          </li>
                        </ul>
                      </div>

                      {bsBalanced === null ? (
                        <ParseWarning message="Could not verify Assets = Liabilities + Equity — one or more totals couldn't be read from the Zoho report. See zoho_reports.data." />
                      ) : (
                        <div
                          className={`flex items-center gap-2 rounded-xl p-4 shadow-card ${
                            bsBalanced ? 'bg-success-soft text-success' : 'bg-danger/10 text-danger'
                          }`}
                        >
                          <Scale className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="text-sm font-semibold">
                            Assets {formatMYROrDash(balanceSheetSummary?.totalAssets ?? null)} {bsBalanced ? '=' : '≠'} Liabilities +
                            Equity {formatMYROrDash((balanceSheetSummary?.totalLiabilities ?? 0) + (balanceSheetSummary?.totalEquity ?? 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
