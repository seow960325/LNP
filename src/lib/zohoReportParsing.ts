// Parses Zoho Books' /reports/profitandloss and /reports/balancesheet
// payloads, stored verbatim in zoho_reports.data by zoho-sync.
//
// IMPORTANT CAVEAT: the exact response shape has NOT been verified against
// a live payload — ZohoBooks.reports.READ is a scope being added to the
// token separately, and no credentials with that scope were available while
// writing this. Zoho's report JSON nests sections as
// {name, total, account_transactions?/sub_categories?, ...} at a depth that
// varies by report/API version, so rather than hardcode an exact path, this
// walks the whole tree and reads the `total` off the first node whose
// `name` matches a known label. That's tolerant of shape variation, but it
// is still a best-effort parse: if it returns null for a figure, the UI
// must show "—" or a warning, NEVER a computed/guessed substitute — that
// substitution (deriving P&L from the transaction tables) is the exact bug
// this feature replaces (it overstated FY25/26 net profit ~3x). Verify the
// first real zoho_reports row against this parser once it lands.

import { formatMYR } from './zohoFinance'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

// DFS over the report tree; returns the first node whose `name`
// case-insensitively matches one of `aliases`.
function findSectionNode(node: unknown, aliases: string[]): Record<string, unknown> | null {
  if (node === null || typeof node !== 'object') return null

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSectionNode(item, aliases)
      if (found) return found
    }
    return null
  }

  const obj = node as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name.toLowerCase() : null
  if (name && aliases.some((alias) => name === alias.toLowerCase())) return obj

  for (const value of Object.values(obj)) {
    const found = findSectionNode(value, aliases)
    if (found) return found
  }
  return null
}

function findSectionTotal(node: unknown, aliases: string[]): number | null {
  const section = findSectionNode(node, aliases)
  return section ? toNumber(section.total) : null
}

const OPERATING_INCOME_ALIASES = ['Operating Income', 'Income']
// "Operating Expense (Cost of Sales)" is Zoho's alternate label for this
// section on some report configs — kept alongside the confirmed live name.
// Confirmed present on a live P&L payload (zoho_reports, synced 2026-07-21,
// FY2025/26): {"name": "Cost of Goods Sold", "total": 246220.57}.
const COGS_ALIASES = ['Cost of Goods Sold', 'COGS', 'Operating Expense (Cost of Sales)']
// Confirmed present on the same live payload: {"name": "Operating Expense",
// "total": 287554.41}.
const OPERATING_EXPENSE_ALIASES = ['Operating Expense', 'Operating Expenses', 'Expense']

export interface PnlSummary {
  operatingIncome: number | null
  costOfGoodsSold: number | null
  grossProfit: number | null
  operatingExpense: number | null
  operatingProfit: number | null
  netProfit: number | null
}

export function parsePnl(data: unknown): PnlSummary {
  return {
    operatingIncome: findSectionTotal(data, OPERATING_INCOME_ALIASES),
    costOfGoodsSold: findSectionTotal(data, COGS_ALIASES),
    grossProfit: findSectionTotal(data, ['Gross Profit']),
    operatingExpense: findSectionTotal(data, OPERATING_EXPENSE_ALIASES),
    operatingProfit: findSectionTotal(data, ['Operating Profit']),
    netProfit: findSectionTotal(data, ['Net Profit/Loss', 'Net Profit', 'Net Income']),
  }
}

// Raw section nodes (not just their totals) — used by the Revenue/P&L
// drill-downs to list each section's account lines the way Zoho's own
// report breaks them down. Same alias lists parsePnl uses for the matching
// total, so a drill-down's line items and its KPI headline total always
// read the same section.
export function findOperatingIncomeNode(data: unknown): Record<string, unknown> | null {
  return findSectionNode(data, OPERATING_INCOME_ALIASES)
}

// Returns null (not an empty node) if the org has no COGS section at all —
// callers must render nothing, not an empty "COGS" header, when this is
// null. A service business with no cost-of-sales tracking is a normal case,
// not a parse failure.
export function findCostOfGoodsSoldNode(data: unknown): Record<string, unknown> | null {
  return findSectionNode(data, COGS_ALIASES)
}

export function findOperatingExpenseNode(data: unknown): Record<string, unknown> | null {
  return findSectionNode(data, OPERATING_EXPENSE_ALIASES)
}

export interface ReportLineItem {
  name: string
  total: number
}

// A section node's child rows — tries the child-array key names Zoho's
// report family has used (account_transactions, sub_categories, ...) and
// returns the first one that actually holds {name, total} rows.
const CHILD_ROW_KEYS = ['account_transactions', 'sub_categories', 'transactions', 'rows']

export function sectionLineItems(node: Record<string, unknown> | null): ReportLineItem[] {
  if (!node) return []
  for (const key of CHILD_ROW_KEYS) {
    const arr = node[key]
    if (!Array.isArray(arr)) continue
    const items = arr
      .map((row): ReportLineItem | null => {
        if (row === null || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const name = typeof r.name === 'string' ? r.name : typeof r.account_name === 'string' ? r.account_name : null
        const total = toNumber(r.total)
        return name && total !== null ? { name, total } : null
      })
      .filter((item): item is ReportLineItem => item !== null)
    if (items.length > 0) return items
  }
  return []
}

export interface BankAssetLine {
  name: string
  total: number
  accountId: string | null
}

// Assets -> Current Assets -> "Bank" section's child rows, WITH account_id
// (sectionLineItems only reads name/total) — lets the Balance Sheet view
// cross-link each bank line straight to that account's own statement.
// Confirmed present on a live balance-sheet payload (zoho_reports, synced
// 2026-07-21): each row carries account_id matching zoho_bank_accounts —
// e.g. {"name": "MBB (A/C No. 564874582191)", "total": 102528.07,
// "account_id": "4542140000000240009"}. Not guessed.
export function balanceSheetBankLines(data: unknown): BankAssetLine[] {
  const bankNode = findSectionNode(data, ['Bank'])
  if (!bankNode) return []
  for (const key of CHILD_ROW_KEYS) {
    const arr = bankNode[key]
    if (!Array.isArray(arr)) continue
    const items = arr
      .map((row): BankAssetLine | null => {
        if (row === null || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const name = typeof r.name === 'string' ? r.name : null
        const total = toNumber(r.total)
        const accountId = typeof r.account_id === 'string' ? r.account_id : null
        return name && total !== null ? { name, total, accountId } : null
      })
      .filter((item): item is BankAssetLine => item !== null)
    if (items.length > 0) return items
  }
  return []
}

export interface BalanceSheetSummary {
  totalAssets: number | null
  totalLiabilities: number | null
  totalEquity: number | null
}

export function parseBalanceSheet(data: unknown): BalanceSheetSummary {
  return {
    totalAssets: findSectionTotal(data, ['Total Assets', 'Assets']),
    totalLiabilities: findSectionTotal(data, ['Total Liabilities', 'Liabilities']),
    // Zoho's own balance sheet report names this section "Equities" (plural)
    // — confirmed against a live payload (zoho_reports, synced 2026-07-21):
    // {"name": "Equities", "total": 159833.07, "total_label": "Total Equities"}.
    // Keeping the singular aliases too in case Zoho varies this by API version.
    totalEquity: findSectionTotal(data, [
      'Equities',
      'Total Equities',
      'Total Equity',
      'Equity',
      "Total Stockholders' Equity",
      'Shareholders Equity',
    ]),
  }
}

export function formatMYROrDash(value: number | null): string {
  return value === null ? '—' : formatMYR(value)
}
