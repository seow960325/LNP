import { utils, writeFile } from 'xlsx'
import type { WorkSheet } from 'xlsx'
import { fetchAllClaims, fetchClaimCategories } from './claimsApi'
import type { ClaimRow, ClaimCategory } from './claimsApi'

const COMPANY_LINE = 'LEARN N PLAY SDN BHD (202301024960 (1518883-X))'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  return `${MONTH_LABELS[month - 1]} ${year}`
}

// expense_date is a plain DATE column ('YYYY-MM-DD', no time component) —
// rearranging the string directly avoids any Date()/timezone parsing risk.
function formatDateDDMMYYYY(dateISO: string): string {
  const [y, m, d] = dateISO.split('-')
  return `${d}/${m}/${y}`
}

function categoryName(claim: ClaimRow): string {
  return claim.claim_categories?.name ?? 'Uncategorized'
}

// Excel sheet names: max 31 chars, no [ ] : * ? / \, must be unique
// (case-insensitively) within a workbook.
function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '').trim().slice(0, 31) || 'Sheet'

  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const tag = ` (${suffix})`
    candidate = base.slice(0, 31 - tag.length) + tag
    suffix++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

// SUMIF's quoted string argument needs literal `"` doubled, same as any
// Excel formula string literal.
function escapeFormulaString(value: string): string {
  return value.replace(/"/g, '""')
}

// Builds one teacher's CLAIMS FORM worksheet: header block, a detail row per
// claim, a SUMMARY BY CATEGORY block driven by live SUMIF formulas (so
// editing a detail amount in Excel recalculates the summary), a TOTAL
// formula, and a PREPARED BY / APPROVED BY footer. Row positions are
// computed from the actual claim/category counts — nothing is hardcoded,
// since claim counts vary teacher to teacher and month to month.
function buildTeacherWorksheet(claims: ClaimRow[], categories: ClaimCategory[]): WorkSheet {
  const sorted = [...claims].sort((a, b) => a.expense_date.localeCompare(b.expense_date))
  const teacherName = sorted[0].claimant_name
  const approverNames = Array.from(
    new Set(sorted.map((c) => c.approver_name).filter((name): name is string => !!name))
  ).join(', ')

  const aoa: (string | number)[][] = []

  aoa.push([COMPANY_LINE, '', '', '', ''])
  aoa.push(['CLAIMS FORM', '', '', '', ''])
  aoa.push([])
  aoa.push(['DATE', 'PAYEE NAME', 'DESCRIPTION', 'CATEGORY', 'AMOUNT'])

  const firstDetailRow = aoa.length + 1
  for (const claim of sorted) {
    aoa.push([
      formatDateDDMMYYYY(claim.expense_date),
      claim.claimant_name,
      claim.description,
      categoryName(claim),
      claim.amount,
    ])
  }
  const lastDetailRow = aoa.length

  aoa.push([])
  aoa.push([])
  aoa.push(['SUMMARY BY CATEGORY'])

  // Label in column A, live-formula amount in column B — a compact 2-column
  // block distinct from the 5-column detail table above it.
  const categoryRows: { row: number; name: string }[] = []
  for (const category of categories) {
    aoa.push([category.name, ''])
    categoryRows.push({ row: aoa.length, name: category.name })
  }

  aoa.push(['TOTAL', ''])
  const totalRow = aoa.length

  aoa.push([])
  aoa.push([])
  aoa.push(['PREPARED BY', '', '', 'APPROVED BY', ''])
  aoa.push([teacherName, '', '', approverNames, ''])

  const ws = utils.aoa_to_sheet(aoa)

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ]

  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 32 }, { wch: 22 }, { wch: 12 }]

  for (let r = firstDetailRow; r <= lastDetailRow; r++) {
    const ref = `E${r}`
    if (ws[ref]) ws[ref].z = '0.00'
  }

  if (categoryRows.length > 0) {
    for (const { row, name } of categoryRows) {
      ws[`B${row}`] = {
        t: 'n',
        f: `SUMIF(D${firstDetailRow}:D${lastDetailRow},"${escapeFormulaString(name)}",E${firstDetailRow}:E${lastDetailRow})`,
        z: '0.00',
      }
    }
    const firstSummaryRow = categoryRows[0].row
    const lastSummaryRow = categoryRows[categoryRows.length - 1].row
    ws[`B${totalRow}`] = { t: 'n', f: `SUM(B${firstSummaryRow}:B${lastSummaryRow})`, z: '0.00' }
  } else {
    // Defensive fallback — claim_categories is expected to be non-empty, but
    // if it ever is, still give a correct total rather than a broken formula.
    ws[`B${totalRow}`] = { t: 'n', f: `SUM(E${firstDetailRow}:E${lastDetailRow})`, z: '0.00' }
  }

  return ws
}

export type ExportClaimsFormResult =
  | { status: 'ok' }
  | { status: 'empty' }
  | { status: 'error'; message: string }

// Fetches all APPROVED claims for `period` (YYYY-MM, matching claims.period),
// groups them by claimant, and downloads one workbook with one worksheet per
// claimant via SheetJS's own writeFile — same self-contained
// generate-and-trigger-download pattern as invoicePdf.ts's pdf.download(),
// no manual blob/anchor code needed.
export async function exportClaimsForm(period: string): Promise<ExportClaimsFormResult> {
  const [claimsRes, categoriesRes] = await Promise.all([
    fetchAllClaims({ status: 'approved', period }),
    fetchClaimCategories(),
  ])

  if (claimsRes.error || !claimsRes.data) {
    return { status: 'error', message: claimsRes.error?.message || 'Could not load claims for that month.' }
  }
  if (categoriesRes.error || !categoriesRes.data) {
    return { status: 'error', message: categoriesRes.error?.message || 'Could not load claim categories.' }
  }
  if (claimsRes.data.length === 0) {
    return { status: 'empty' }
  }

  const byClaimant = new Map<string, ClaimRow[]>()
  for (const claim of claimsRes.data) {
    const list = byClaimant.get(claim.claimant_id) ?? []
    list.push(claim)
    byClaimant.set(claim.claimant_id, list)
  }

  const groups = Array.from(byClaimant.values()).sort((a, b) => a[0].claimant_name.localeCompare(b[0].claimant_name))

  const wb = utils.book_new()
  const usedSheetNames = new Set<string>()
  for (const group of groups) {
    const ws = buildTeacherWorksheet(group, categoriesRes.data)
    const sheetName = sanitizeSheetName(group[0].claimant_name, usedSheetNames)
    utils.book_append_sheet(wb, ws, sheetName)
  }

  writeFile(wb, `LNP-Claims-${period}.xlsx`)
  return { status: 'ok' }
}
