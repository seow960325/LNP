// src/lib/zohoFinance.ts — pure helpers for the shareholder financial page.
// Fiscal year = 1 Jul – 30 Jun (Center Ops convention, not the calendar year).
//
// Headline P&L / Balance Sheet figures come from Zoho's own report
// endpoints (see zohoReportParsing.ts) — NOT computed from zoho_invoices/
// zoho_expenses here. That computation used to overstate FY25/26 net profit
// ~3x (206,964 shown vs Zoho's real accrual 64,438.52) because the
// transaction tables miss bills/payroll/COGS and include refundable
// deposits. The invoice/expense helpers below are kept ONLY for the
// "Invoiced sales vs recorded expenses (billing trend)" chart, which is
// explicitly labeled as a billing trend, not a P&L.

import type { ZohoInvoice, ZohoExpense } from './zohoApi'

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// FY keyed by its starting calendar year: fyStartYear=2025 -> FY 1 Jul 2025 – 30 Jun 2026.
export function currentFyStartYear(today: Date = new Date()): number {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  return m >= 7 ? y : y - 1
}

export function fyLabel(fyStartYear: number): string {
  return `FY${fyStartYear}/${String((fyStartYear + 1) % 100).padStart(2, '0')}`
}

export function fyDateRange(fyStartYear: number): { start: string; end: string } {
  return { start: `${fyStartYear}-07-01`, end: `${fyStartYear + 1}-06-30` }
}

export interface FyMonth {
  key: string // 'YYYY-MM'
  label: string // 'Jul 2025'
  year: number
  month: number // 1-12 calendar month
}

export function fyMonths(fyStartYear: number): FyMonth[] {
  const months: FyMonth[] = []
  for (let i = 0; i < 12; i++) {
    const month = ((6 + i) % 12) + 1
    const year = month >= 7 ? fyStartYear : fyStartYear + 1
    months.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`,
      year,
      month,
    })
  }
  return months
}

export function monthKeyOf(dateISO: string | null): string | null {
  return dateISO ? dateISO.slice(0, 7) : null
}

export function isDateInFy(dateISO: string | null, fyStartYear: number): boolean {
  if (!dateISO) return false
  const { start, end } = fyDateRange(fyStartYear)
  return dateISO >= start && dateISO <= end
}

const EXCLUDED_INVOICE_STATUSES = new Set(['void', 'draft'])

export function isBillableInvoice(invoice: { status: string | null }): boolean {
  return !EXCLUDED_INVOICE_STATUSES.has(invoice.status ?? '')
}

export function formatMYR(amount: number): string {
  return `RM ${new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

export interface MonthlyPoint {
  key: string
  label: string
  revenue: number
  expense: number
}

// Billing-trend chart data only — invoiced sales vs recorded expenses by
// month, cash/accrual-agnostic. Not the accrual P&L; see file header.
export function monthlyRevenueExpense(
  fyStartYear: number,
  invoices: ZohoInvoice[],
  expenses: ZohoExpense[],
): MonthlyPoint[] {
  const months = fyMonths(fyStartYear)
  const revenueByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()

  for (const inv of invoices) {
    if (!isBillableInvoice(inv)) continue
    const key = monthKeyOf(inv.date)
    if (!key) continue
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + (inv.total ?? 0))
  }

  for (const exp of expenses) {
    const key = monthKeyOf(exp.date)
    if (!key) continue
    expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + (exp.amount ?? 0))
  }

  return months.map((m) => ({
    key: m.key,
    label: m.label,
    revenue: revenueByMonth.get(m.key) ?? 0,
    expense: expenseByMonth.get(m.key) ?? 0,
  }))
}
