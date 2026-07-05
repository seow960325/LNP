import { utils, writeFile } from 'xlsx'
import type { WorkSheet } from 'xlsx'
import { fetchAllClaims, fetchActiveClaimCategories } from './claimsApi'
import type { ClaimRow, ClaimCategory } from './claimsApi'

const COMPANY_LINE = 'LEARN N PLAY SDN BHD (202301024960 (1518883-X))'

// Exact fill colors used by the real CLAIMS_FORM.xlsx template (8-digit ARGB).
const GRAY_FILL = 'FFDADADA'
const YELLOW_FILL = 'FFFFFF00'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  return `${MONTH_LABELS[month - 1]} ${year}`
}

// expense_date is a plain DATE column ('YYYY-MM-DD', no time component).
// Using the LOCAL Date constructor (not `new Date(iso)`/UTC) is required
// here: SheetJS's date-to-serial conversion (datenum) cancels out the
// Date object's own getTimezoneOffset(), so a local-midnight Date always
// round-trips to the correct Y/M/D in Excel regardless of the browser's
// timezone. Constructing via UTC or parsing the ISO string directly would
// NOT get that cancellation and could shift the day in some timezones.
function parseDateOnly(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d)
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

// Applies the template's cell styling. SheetJS's community ("xlsx") build
// does not persist cell.s when writing — only the paid Pro build does —
// so this is a no-op in terms of the actual downloaded file today. It's
// kept in place (rather than omitted) so the workbook renders styled the
// moment the build gains write support, without touching this code again.
function applyStyle(ws: WorkSheet, ref: string, opts: { bold?: boolean; fill?: string; center?: boolean }) {
  const cell = ws[ref]
  if (!cell) return
  const style: Record<string, unknown> = {}
  if (opts.bold) style.font = { bold: true }
  if (opts.fill) style.fill = { patternType: 'solid', fgColor: { rgb: opts.fill } }
  if (opts.center) style.alignment = { horizontal: 'center', vertical: 'center' }
  cell.s = style
}

// Builds one teacher's CLAIMS FORM worksheet, replicating the real
// CLAIMS_FORM.xlsx template layout exactly: a detail row per claim, a
// SUMMARY BY CATEGORY block driven by live SUMIF formulas (so editing a
// detail amount in Excel recalculates the summary), a TOTAL formula, and a
// PREPARED BY / APPROVED BY footer. Every row position is computed from the
// actual claim/category counts — never hardcoded — since claim counts vary
// teacher to teacher and month to month.
function buildTeacherWorksheet(claims: ClaimRow[], categories: ClaimCategory[]): WorkSheet {
  const sorted = [...claims].sort((a, b) => a.expense_date.localeCompare(b.expense_date))
  const teacherName = sorted[0].claimant_name

  // approved_at is an ISO timestamp — lexicographic comparison sorts it
  // correctly, so the claim with the greatest string is the most recent.
  const mostRecentApproval = claims.reduce((latest, claim) =>
    (claim.approved_at ?? '') > (latest.approved_at ?? '') ? claim : latest
  )
  const approverName = mostRecentApproval.approver_name ?? ''

  const aoa: (string | number | Date)[][] = []

  aoa.push([COMPANY_LINE])
  aoa.push(['CLAIMS FORM'])
  aoa.push([])
  aoa.push(['DATE', 'PAYEE NAME', 'DESCRIPTION', 'CATEGORY', 'AMOUNT'])

  const firstDetailRow = aoa.length + 1
  for (const claim of sorted) {
    aoa.push([parseDateOnly(claim.expense_date), claim.claimant_name, claim.description, categoryName(claim), claim.amount])
  }
  const lastDetailRow = aoa.length // LAST = 4 + N

  aoa.push([]) // blank row at LAST+1

  aoa.push(['', 'SUMMARY BY CATEGORY'])
  const summaryHeaderRow = aoa.length // S = LAST+2

  const categoryRows: { row: number; name: string }[] = []
  for (const category of categories) {
    aoa.push(['', category.name])
    categoryRows.push({ row: aoa.length, name: category.name })
  }
  // CATSTART = summaryHeaderRow+1, CATEND = summaryHeaderRow + categories.length

  aoa.push([]) // blank row

  aoa.push(['TOTAL'])
  const totalRow = aoa.length // T = CATEND+2

  aoa.push(['', '', '', 'CHECKING'])

  aoa.push([]) // blank row at T+2

  aoa.push(['', 'PREPARED BY', '', 'APPROVED BY'])
  const preparedRow = aoa.length // P = T+3

  aoa.push([]) // blank row at P+1

  aoa.push(['', teacherName, '', approverName]) // signature row at P+2

  const ws = utils.aoa_to_sheet(aoa)

  ws['!merges'] = [{ s: { r: totalRow - 1, c: 0 }, e: { r: totalRow - 1, c: 3 } }]

  ws['!cols'] = [{ wch: 14.9 }, { wch: 32.7 }, { wch: 22.9 }, { wch: 23.7 }, { wch: 14.6 }, { wch: 9.0 }]

  applyStyle(ws, 'A1', { bold: true })
  applyStyle(ws, 'A2', { bold: true })
  for (const col of ['A', 'B', 'C', 'D', 'E']) {
    applyStyle(ws, `${col}4`, { bold: true, center: true, fill: GRAY_FILL })
  }

  for (let r = firstDetailRow; r <= lastDetailRow; r++) {
    const dateRef = `A${r}`
    if (ws[dateRef]) ws[dateRef].z = 'dd/mm/yyyy'
    const amountRef = `E${r}`
    if (ws[amountRef]) ws[amountRef].z = '0.00'
  }

  applyStyle(ws, `B${summaryHeaderRow}`, { bold: true, fill: YELLOW_FILL })

  if (categoryRows.length > 0) {
    for (const { row } of categoryRows) {
      ws[`E${row}`] = {
        t: 'n',
        f: `SUMIF($D$${firstDetailRow}:$D$${lastDetailRow},$B${row},$E$${firstDetailRow}:$E$${lastDetailRow})`,
        z: '0.00',
      }
    }
    const catStart = categoryRows[0].row
    const catEnd = categoryRows[categoryRows.length - 1].row
    ws[`E${totalRow}`] = { t: 'n', f: `SUM(E${catStart}:E${catEnd})`, z: '0.00' }
  } else {
    // Defensive fallback — claim_categories is expected to be non-empty, but
    // if it ever is, still give a correct total rather than a broken formula.
    ws[`E${totalRow}`] = { t: 'n', f: `SUM(E${firstDetailRow}:E${lastDetailRow})`, z: '0.00' }
  }

  applyStyle(ws, `A${totalRow}`, { bold: true, fill: GRAY_FILL })
  applyStyle(ws, `E${totalRow}`, { bold: true, fill: GRAY_FILL })
  applyStyle(ws, `D${totalRow + 1}`, { bold: true, center: true })
  applyStyle(ws, `B${preparedRow}`, { bold: true })
  applyStyle(ws, `D${preparedRow}`, { bold: true, center: true })

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
    fetchActiveClaimCategories(),
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
