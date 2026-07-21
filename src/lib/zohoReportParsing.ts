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
    costOfGoodsSold: findSectionTotal(data, ['Cost of Goods Sold', 'COGS']),
    grossProfit: findSectionTotal(data, ['Gross Profit']),
    operatingExpense: findSectionTotal(data, ['Operating Expense', 'Operating Expenses']),
    operatingProfit: findSectionTotal(data, ['Operating Profit']),
    netProfit: findSectionTotal(data, ['Net Profit/Loss', 'Net Profit', 'Net Income']),
  }
}

// Raw Operating Income section node (not just its total) — used by the
// Revenue KPI drill-down to list "Sales by category, less Discount" the way
// Zoho's own report breaks it down. Same alias list parsePnl uses for
// operatingIncome, so the drill-down's line items and the KPI's headline
// total are always reading the same section.
export function findOperatingIncomeNode(data: unknown): Record<string, unknown> | null {
  return findSectionNode(data, OPERATING_INCOME_ALIASES)
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

export interface BalanceSheetSummary {
  totalAssets: number | null
  totalLiabilities: number | null
  totalEquity: number | null
}

export function parseBalanceSheet(data: unknown): BalanceSheetSummary {
  return {
    totalAssets: findSectionTotal(data, ['Total Assets', 'Assets']),
    totalLiabilities: findSectionTotal(data, ['Total Liabilities', 'Liabilities']),
    totalEquity: findSectionTotal(data, ['Total Equity', 'Equity', "Total Stockholders' Equity", 'Shareholders Equity']),
  }
}

export function formatMYROrDash(value: number | null): string {
  return value === null ? '—' : formatMYR(value)
}
