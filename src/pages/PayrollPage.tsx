import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Lock, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toKLDateISO } from '../lib/helpers'
import { calcPayroll } from '../lib/payrollCalc'
import {
  fetchPayrollSettings,
  fetchPayrollStaff,
  fetchPayslips,
  fetchYtd,
  upsertPayslip,
  finalizePayslip,
  reopenPayslip,
} from '../lib/payrollApi'
import type {
  PayrollSettings,
  PayrollStaffMember,
  Payslip,
  PayslipStatus,
  PayslipInput,
  ManualOverrides,
  YtdTotals,
} from '../lib/payrollApi'
import type { PayslipPdfData } from '../lib/payslipPdf'
import { uploadPayslipDocument } from '../lib/staffDocsApi'

type LoadState = 'loading' | 'ready' | 'error'
type EditableField = 'base' | 'allowance' | 'overtime' | 'bonus' | 'unpaid'
type OverridableField = keyof ManualOverrides

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_LABELS: Record<PayslipStatus, string> = {
  draft: 'Draft',
  finalized: 'Finalized',
  sent: 'Sent',
}

const STATUS_BADGE: Record<PayslipStatus, string> = {
  draft: 'bg-line/60 text-muted',
  finalized: 'bg-success-soft text-success',
  sent: 'bg-accent-soft text-accent-hover',
}

// Maps a ManualOverrides key to the RowState field it shadows.
const OVERRIDE_ROW_KEY = {
  epf_employee: 'epfEmployee',
  socso_employee: 'socsoEmployee',
  eis_employee: 'eisEmployee',
  pcb: 'pcb',
} as const

function formatMoney(amount: number): string {
  return `RM ${amount.toFixed(2)}`
}

interface RowState {
  employeeId: string
  fullName: string
  title: string | null
  active: boolean
  payslipId: string | null
  status: PayslipStatus
  base: number
  allowance: number
  overtime: number
  bonus: number
  unpaid: number
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
  pcb: number
  grossPay: number
  totalDeductions: number
  netPay: number
  manualOverrides: ManualOverrides
  ytd: YtdTotals
  notes: string | null
  dirty: boolean
  saving: boolean
  finalizing: boolean
  reopening: boolean
  // Pure UI state — whether the earnings-input/employer-contribution detail
  // panel is open. Never read by recomputeRow/buildPayslipInput; hidden
  // fields stay fully live and are always included when saving.
  expanded: boolean
}

// Recomputes every calculated field from the row's current base inputs and
// settings. A field only takes the freshly-calculated value when it is NOT
// manually overridden — overridden fields keep whatever value is already on
// the row, so unrelated edits (e.g. changing Bonus) never clobber a manual
// EPF/SOCSO/EIS/PCB entry.
function recomputeRow(row: RowState, settings: PayrollSettings, monthIndex: number): RowState {
  const grossForStatutory = row.base + row.allowance + row.overtime + row.bonus - row.unpaid

  const calc = calcPayroll({
    grossForStatutory,
    epfRateEmployee: settings.epf_rate_employee,
    epfRateEmployerLow: settings.epf_rate_employer,
    epfRateEmployerHigh: settings.epf_rate_employer_high,
    socsoScheme: settings.socso_scheme,
    monthIndex,
    ytdGross: row.ytd.ytdGross,
    ytdEpfEmployee: row.ytd.ytdEpfEmployee,
    ytdSocsoEmployee: row.ytd.ytdSocsoEmployee,
    ytdPcbPaid: row.ytd.ytdPcb,
  })

  const epfEmployee = row.manualOverrides.epf_employee ? row.epfEmployee : calc.epfEmployee
  const socsoEmployee = row.manualOverrides.socso_employee ? row.socsoEmployee : calc.socsoEmployee
  const eisEmployee = row.manualOverrides.eis_employee ? row.eisEmployee : calc.eisEmployee
  const pcb = row.manualOverrides.pcb ? row.pcb : calc.pcb

  const totalDeductions = epfEmployee + socsoEmployee + eisEmployee + pcb
  const netPay = grossForStatutory - totalDeductions

  return {
    ...row,
    epfEmployee,
    epfEmployer: calc.epfEmployer,
    socsoEmployee,
    socsoEmployer: calc.socsoEmployer,
    eisEmployee,
    eisEmployer: calc.eisEmployer,
    pcb,
    grossPay: grossForStatutory,
    totalDeductions,
    netPay,
  }
}

function buildRow(
  staff: PayrollStaffMember,
  payslip: Payslip | undefined,
  ytd: YtdTotals,
  settings: PayrollSettings,
  monthIndex: number
): RowState {
  const base: RowState = {
    employeeId: staff.id,
    fullName: staff.full_name,
    title: staff.title,
    active: staff.active,
    payslipId: payslip?.id ?? null,
    status: payslip?.status ?? 'draft',
    base: payslip?.base_salary ?? 0,
    allowance: payslip?.allowance ?? 0,
    overtime: payslip?.overtime ?? 0,
    bonus: payslip?.bonus ?? 0,
    unpaid: payslip?.unpaid_leave_deduction ?? 0,
    epfEmployee: payslip?.epf_employee ?? 0,
    epfEmployer: payslip?.epf_employer ?? 0,
    socsoEmployee: payslip?.socso_employee ?? 0,
    socsoEmployer: payslip?.socso_employer ?? 0,
    eisEmployee: payslip?.eis_employee ?? 0,
    eisEmployer: payslip?.eis_employer ?? 0,
    pcb: payslip?.pcb ?? 0,
    grossPay: payslip?.gross_pay ?? 0,
    totalDeductions: payslip?.total_deductions ?? 0,
    netPay: payslip?.net_pay ?? 0,
    manualOverrides: payslip?.manual_overrides ?? {},
    ytd,
    notes: payslip?.notes ?? null,
    dirty: false,
    saving: false,
    finalizing: false,
    reopening: false,
    expanded: false,
  }

  // Persisted values are the source of truth on load — only a brand-new
  // (never-saved) row needs its calculated fields seeded from scratch.
  return payslip ? base : recomputeRow(base, settings, monthIndex)
}

function buildPayslipInput(
  row: RowState,
  year: number,
  month: number,
  centerId: string,
  createdBy: string
): PayslipInput {
  return {
    id: row.payslipId ?? undefined,
    center_id: centerId,
    employee_id: row.employeeId,
    year,
    month,
    status: 'draft',
    base_salary: row.base,
    allowance: row.allowance,
    overtime: row.overtime,
    bonus: row.bonus,
    unpaid_leave_deduction: row.unpaid,
    epf_employee: row.epfEmployee,
    epf_employer: row.epfEmployer,
    socso_employee: row.socsoEmployee,
    socso_employer: row.socsoEmployer,
    eis_employee: row.eisEmployee,
    eis_employer: row.eisEmployer,
    pcb: row.pcb,
    gross_pay: row.grossPay,
    total_deductions: row.totalDeductions,
    net_pay: row.netPay,
    ytd_gross: row.ytd.ytdGross + row.grossPay,
    ytd_pcb: row.ytd.ytdPcb + row.pcb,
    manual_overrides: row.manualOverrides,
    notes: row.notes,
    created_by: createdBy,
  }
}

function EditableCell({
  value,
  editable,
  disabled,
  onChange,
}: {
  value: number
  editable: boolean
  disabled: boolean
  onChange: (value: number) => void
}) {
  if (!editable) return <span>{formatMoney(value)}</span>
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
      disabled={disabled}
      className="w-20 rounded-lg border border-line px-2 py-1 text-right text-xs disabled:opacity-60"
    />
  )
}

function OverridableCell({
  value,
  overridden,
  editable,
  disabled,
  onChange,
  onClear,
}: {
  value: number
  overridden: boolean
  editable: boolean
  disabled: boolean
  onChange: (value: number) => void
  onClear: () => void
}) {
  if (!editable) return <span>{formatMoney(value)}</span>

  return (
    <div className="flex items-center justify-end gap-1">
      {overridden && (
        <button
          type="button"
          onClick={onClear}
          title="Reset to calculated value"
          className="text-muted/70 hover:text-muted"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
        disabled={disabled}
        title={overridden ? 'Manually overridden — not auto-recalculated' : undefined}
        className={`w-20 rounded-xl border px-2 py-1 text-right text-xs disabled:opacity-60 ${
          overridden ? 'border-danger/30 bg-danger/10' : 'border-line'
        }`}
      />
    </div>
  )
}

// Number of columns in the default (collapsed) header row — the detail
// panel's <td> spans all of them.
const TABLE_COLUMN_COUNT = 10

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-2xs text-muted">
      {label}
      {children}
    </div>
  )
}

function PayrollTableRow({
  row,
  isAdminOrSuper,
  onFieldChange,
  onOverrideChange,
  onClearOverride,
  onSave,
  onRequestFinalize,
  onRequestReopen,
  onToggleExpand,
}: {
  row: RowState
  isAdminOrSuper: boolean
  onFieldChange: (employeeId: string, field: EditableField, value: number) => void
  onOverrideChange: (employeeId: string, field: OverridableField, value: number) => void
  onClearOverride: (employeeId: string, field: OverridableField) => void
  onSave: (row: RowState) => void
  onRequestFinalize: (employeeId: string) => void
  onRequestReopen: (employeeId: string) => void
  onToggleExpand: (employeeId: string) => void
}) {
  const editable = row.status === 'draft'
  const busy = row.saving || row.finalizing || row.reopening

  return (
    <>
      <tr className="group border-t border-line transition-colors hover:bg-cream/70">
        <td className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 transition-colors group-hover:bg-cream">
          <div className="flex items-center gap-1 font-semibold text-sm text-ink">
            {!editable && <Lock className="h-3 w-3 shrink-0 text-muted/70" aria-hidden="true" />}
            {row.fullName}
            {!row.active && (
              <span className="rounded-full bg-line/60 px-2 py-0.5 text-2xs font-semibold text-muted">
                Resigned
              </span>
            )}
          </div>
          {row.title && <p className="text-2xs text-muted/70">{row.title}</p>}
        </td>
        <td className="px-2 py-2 text-right">
          <EditableCell value={row.base} editable={editable} disabled={busy} onChange={(v) => onFieldChange(row.employeeId, 'base', v)} />
        </td>
        <td className="px-2 py-2 text-right">
          <OverridableCell
            value={row.epfEmployee}
            overridden={!!row.manualOverrides.epf_employee}
            editable={editable}
            disabled={busy}
            onChange={(v) => onOverrideChange(row.employeeId, 'epf_employee', v)}
            onClear={() => onClearOverride(row.employeeId, 'epf_employee')}
          />
        </td>
        <td className="px-2 py-2 text-right">
          <OverridableCell
            value={row.socsoEmployee}
            overridden={!!row.manualOverrides.socso_employee}
            editable={editable}
            disabled={busy}
            onChange={(v) => onOverrideChange(row.employeeId, 'socso_employee', v)}
            onClear={() => onClearOverride(row.employeeId, 'socso_employee')}
          />
        </td>
        <td className="px-2 py-2 text-right">
          <OverridableCell
            value={row.eisEmployee}
            overridden={!!row.manualOverrides.eis_employee}
            editable={editable}
            disabled={busy}
            onChange={(v) => onOverrideChange(row.employeeId, 'eis_employee', v)}
            onClear={() => onClearOverride(row.employeeId, 'eis_employee')}
          />
        </td>
        <td className="px-2 py-2 text-right">
          <OverridableCell
            value={row.pcb}
            overridden={!!row.manualOverrides.pcb}
            editable={editable}
            disabled={busy}
            onChange={(v) => onOverrideChange(row.employeeId, 'pcb', v)}
            onClear={() => onClearOverride(row.employeeId, 'pcb')}
          />
        </td>
        <td className="px-2 py-2 text-right text-sm font-bold text-accent-hover">{formatMoney(row.netPay)}</td>
        <td className="px-2 py-2 text-center">
          <button
            type="button"
            onClick={() => onToggleExpand(row.employeeId)}
            aria-expanded={row.expanded}
            className="inline-flex items-center gap-0.5 text-xs text-accent hover:text-accent-hover hover:underline"
          >
            {row.expanded ? (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            )}
            {row.expanded ? 'less' : 'more'}
          </button>
        </td>
        <td className="px-2 py-2 text-center">
          <span className={`rounded-full px-2.5 py-0.5 text-2xs font-semibold ${STATUS_BADGE[row.status]}`}>
            {STATUS_LABELS[row.status]}
          </span>
        </td>
        <td className="min-w-[110px] px-2 py-2">
          <div className="flex flex-col gap-1">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => onSave(row)}
                  disabled={busy}
                  className="min-h-tap rounded-xl bg-accent px-3 text-xs text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                >
                  {row.saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => onRequestFinalize(row.employeeId)}
                  disabled={busy}
                  className="min-h-tap rounded-xl border border-success/30 px-3 text-xs text-success hover:bg-success-soft disabled:opacity-60"
                >
                  {row.finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              </>
            )}
            {!editable && isAdminOrSuper && (
              <button
                type="button"
                onClick={() => onRequestReopen(row.employeeId)}
                disabled={busy}
                className="min-h-tap rounded-xl border border-danger/20 px-3 text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
              >
                {row.reopening ? 'Reopening…' : 'Reopen'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {row.expanded && (
        <tr className="border-t border-line bg-cream">
          <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-3">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <p className="w-full font-semibold text-2xs uppercase tracking-wide text-muted/70">
                  Earnings breakdown
                </p>
                <DetailField label="Allowance">
                  <EditableCell value={row.allowance} editable={editable} disabled={busy} onChange={(v) => onFieldChange(row.employeeId, 'allowance', v)} />
                </DetailField>
                <DetailField label="OT">
                  <EditableCell value={row.overtime} editable={editable} disabled={busy} onChange={(v) => onFieldChange(row.employeeId, 'overtime', v)} />
                </DetailField>
                <DetailField label="Bonus">
                  <EditableCell value={row.bonus} editable={editable} disabled={busy} onChange={(v) => onFieldChange(row.employeeId, 'bonus', v)} />
                </DetailField>
                <DetailField label="Unpaid">
                  <EditableCell value={row.unpaid} editable={editable} disabled={busy} onChange={(v) => onFieldChange(row.employeeId, 'unpaid', v)} />
                </DetailField>
                <DetailField label="Gross">
                  <span className="text-sm text-ink">{formatMoney(row.grossPay)}</span>
                </DetailField>
              </div>

              <div className="flex flex-wrap items-end gap-3 border-l border-line pl-6">
                <p className="w-full font-semibold text-2xs uppercase tracking-wide text-muted/70">
                  Employer contributions
                </p>
                <DetailField label="EPF (er)">
                  <span className="text-sm text-ink">{formatMoney(row.epfEmployer)}</span>
                </DetailField>
                <DetailField label="SOCSO (er)">
                  <span className="text-sm text-ink">{formatMoney(row.socsoEmployer)}</span>
                </DetailField>
                <DetailField label="EIS (er)">
                  <span className="text-sm text-ink">{formatMoney(row.eisEmployer)}</span>
                </DetailField>
                <DetailField label="Total Deduct">
                  <span className="text-sm text-ink">{formatMoney(row.totalDeductions)}</span>
                </DetailField>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function PayrollPage() {
  const { profile } = useAuth()

  const todayISO = toKLDateISO(new Date())
  const [year, setYear] = useState(() => Number(todayISO.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(todayISO.slice(5, 7)))

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ytdWarning, setYtdWarning] = useState<string | null>(null)
  const [settings, setSettings] = useState<PayrollSettings | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [includeInactive, setIncludeInactive] = useState(false)

  const [finalizeTarget, setFinalizeTarget] = useState<string | null>(null)
  const [reopenTarget, setReopenTarget] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  const [bulkFinalizeConfirmOpen, setBulkFinalizeConfirmOpen] = useState(false)
  const [bulkFinalizing, setBulkFinalizing] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')
    setLoadError(null)
    setYtdWarning(null)

    async function load() {
      const centerId = profile!.center_id

      const [settingsResult, staffResult, payslipResult] = await Promise.all([
        fetchPayrollSettings(centerId),
        fetchPayrollStaff(centerId, includeInactive),
        fetchPayslips(centerId, year, month),
      ])

      if (cancelled) return

      if (settingsResult.error || !settingsResult.data) {
        setLoadError('Payroll settings are not configured for this center yet.')
        setLoadState('error')
        return
      }
      if (staffResult.error || !staffResult.data) {
        setLoadError('Could not load staff. Please try again.')
        setLoadState('error')
        return
      }
      if (payslipResult.error) {
        setLoadError('Could not load payslips for this period. Please try again.')
        setLoadState('error')
        return
      }

      const payslipMap = new Map((payslipResult.data ?? []).map((p) => [p.employee_id, p]))
      const ytdResults = await Promise.all(staffResult.data.map((s) => fetchYtd(s.id, year, month)))
      if (cancelled) return

      if (ytdResults.some((r) => r.error)) {
        setYtdWarning(
          'Could not load year-to-date totals for some staff — their PCB figures may assume RM0 YTD. Reload the page to retry.'
        )
      }

      const builtRows = staffResult.data.map((s, i) =>
        buildRow(s, payslipMap.get(s.id), ytdResults[i].data, settingsResult.data!, month)
      )

      setSettings(settingsResult.data)
      setRows(builtRows)
      setLoadState('ready')
    }

    load()

    return () => {
      cancelled = true
    }
  }, [profile, year, month, includeInactive])

  if (!profile) return null

  const isAdminOrSuper = profile.role === 'admin' || profile.role === 'super_admin'

  function updateRow(employeeId: string, updater: (row: RowState) => RowState) {
    setRows((prev) => prev.map((r) => (r.employeeId === employeeId ? updater(r) : r)))
  }

  function handleFieldChange(employeeId: string, field: EditableField, value: number) {
    if (!settings) return
    updateRow(employeeId, (row) =>
      recomputeRow({ ...row, [field]: value, dirty: true }, settings, month)
    )
  }

  function handleOverrideChange(employeeId: string, field: OverridableField, value: number) {
    if (!settings) return
    updateRow(employeeId, (row) =>
      recomputeRow(
        {
          ...row,
          [OVERRIDE_ROW_KEY[field]]: value,
          manualOverrides: { ...row.manualOverrides, [field]: true },
          dirty: true,
        },
        settings,
        month
      )
    )
  }

  function handleToggleExpand(employeeId: string) {
    updateRow(employeeId, (row) => ({ ...row, expanded: !row.expanded }))
  }

  function handleClearOverride(employeeId: string, field: OverridableField) {
    if (!settings) return
    updateRow(employeeId, (row) =>
      recomputeRow(
        { ...row, manualOverrides: { ...row.manualOverrides, [field]: false }, dirty: true },
        settings,
        month
      )
    )
  }

  // Toast-free — used internally by confirmFinalize/confirmBulkFinalize/
  // handleSaveAll, which each own a single summary toast for their action.
  // The standalone per-row "Save" button uses handleSaveRowClick below,
  // which is the only caller that toasts on this specific operation.
  async function saveRow(row: RowState): Promise<RowState | null> {
    if (!profile) return null
    updateRow(row.employeeId, (r) => ({ ...r, saving: true }))

    const input = buildPayslipInput(row, year, month, profile.center_id, profile.id)
    const { data, error } = await upsertPayslip(input)

    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, saving: false }))
      return null
    }

    const saved: RowState = { ...row, saving: false, dirty: false, payslipId: data.id, status: data.status }
    updateRow(row.employeeId, () => saved)
    return saved
  }

  async function handleSaveRowClick(row: RowState) {
    const saved = await saveRow(row)
    if (saved) {
      toast.success('Payslip saved')
    } else {
      toast.error('Could not save. Please try again.')
    }
  }

  // Generates the payslip PDF and uploads it to the staff-docs bucket +
  // staff_documents cabinet. Called only after finalizePayslip has already
  // succeeded — a failure here never rolls back the finalize; it's surfaced
  // as a non-blocking toast so the status stays correct and the PDF can be
  // retried (e.g. via reopen + re-finalize).
  async function generateAndUploadPayslipPdf(row: RowState, savedPayslip: Payslip): Promise<string | null> {
    if (!profile || !settings) return 'Missing payroll settings.'

    try {
      const pdfData: PayslipPdfData = {
        ...savedPayslip,
        ytd_epf_employee: row.ytd.ytdEpfEmployee + row.epfEmployee,
        ytd_socso_employee: row.ytd.ytdSocsoEmployee + row.socsoEmployee,
      }

      // Loaded on demand — pdfmake and its embedded fonts are ~1.3 MB and only
      // admins generating payslips ever need them.
      const { generatePayslipPdf } = await import('../lib/payslipPdf')
      const blob = await generatePayslipPdf(
        pdfData,
        { full_name: row.fullName, title: row.title },
        settings
      )

      const { error } = await uploadPayslipDocument({
        ownerId: row.employeeId,
        uploadedBy: profile.id,
        centerId: profile.center_id,
        year,
        month,
        fileName: `Payslip-${MONTH_LABELS[month - 1]}-${year}.pdf`,
        pdfBlob: blob,
      })

      return error ? error.message || 'Upload failed.' : null
    } catch (err) {
      return err instanceof Error ? err.message : 'PDF generation failed.'
    }
  }

  async function handleSaveAll() {
    setSavingAll(true)
    const draftRows = rows.filter((r) => r.status === 'draft')
    const results = await Promise.all(draftRows.map((r) => saveRow(r)))
    setSavingAll(false)

    const failedCount = results.filter((r) => r === null).length
    const savedCount = results.length - failedCount
    if (failedCount === 0) {
      toast.success(`${savedCount} draft${savedCount === 1 ? '' : 's'} saved`)
    } else if (savedCount === 0) {
      toast.error('Could not save any drafts. Please try again.')
    } else {
      toast.warning(`${savedCount} saved, ${failedCount} failed`)
    }
  }

  async function confirmFinalize() {
    if (!finalizeTarget || !profile) return
    const row = rows.find((r) => r.employeeId === finalizeTarget)
    if (!row) {
      setFinalizeTarget(null)
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, finalizing: true }))
    const saved = await saveRow(row)
    if (!saved || !saved.payslipId) {
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
      setFinalizeTarget(null)
      toast.error('Could not save payslip before finalizing. Please try again.')
      return
    }

    const { data, error } = await finalizePayslip(saved.payslipId, profile.id)
    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
      setFinalizeTarget(null)
      toast.error('Could not finalize. Please try again.')
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, finalizing: false, status: 'finalized' }))
    setFinalizeTarget(null)

    const pdfError = await generateAndUploadPayslipPdf(saved, data)
    if (pdfError) {
      toast.warning(`Payslip finalized but PDF upload failed: ${pdfError}`)
    } else {
      toast.success('Payslip finalized')
    }
  }

  async function confirmBulkFinalize() {
    if (!profile) return
    setBulkFinalizing(true)

    const draftRows = rows.filter((r) => r.status === 'draft')
    let finalizedCount = 0
    let pdfFailures = 0

    // Sequential, not Promise.all — pdfmake's PDF generation is CPU-bound,
    // and finalizing dozens of payslips concurrently in the browser would
    // block the tab. One at a time is fine for a monthly payroll run.
    for (const row of draftRows) {
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: true }))
      const saved = await saveRow(row)
      if (!saved || !saved.payslipId) {
        updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
        continue
      }

      const { data, error } = await finalizePayslip(saved.payslipId, profile.id)
      if (error || !data) {
        updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
        continue
      }

      updateRow(row.employeeId, (r) => ({ ...r, finalizing: false, status: 'finalized' }))
      finalizedCount += 1

      const pdfError = await generateAndUploadPayslipPdf(saved, data)
      if (pdfError) pdfFailures += 1
    }

    setBulkFinalizing(false)
    setBulkFinalizeConfirmOpen(false)

    if (finalizedCount === 0) {
      toast.error('No draft payslips could be finalized.')
    } else if (pdfFailures > 0) {
      toast.warning(
        `${finalizedCount} finalized, ${pdfFailures} PDF upload${pdfFailures === 1 ? '' : 's'} failed.`
      )
    } else {
      toast.success(`${finalizedCount} payslip${finalizedCount === 1 ? '' : 's'} finalized.`)
    }
  }

  async function confirmReopen() {
    if (!reopenTarget) return
    const row = rows.find((r) => r.employeeId === reopenTarget)
    if (!row || !row.payslipId) {
      setReopenTarget(null)
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, reopening: true }))
    const { data, error } = await reopenPayslip(row.payslipId)
    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, reopening: false }))
      setReopenTarget(null)
      toast.error('Could not reopen. Please try again.')
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, reopening: false, status: 'draft' }))
    setReopenTarget(null)
    toast.success('Payslip reopened')
  }

  function handlePeriodChange(value: string) {
    const [y, m] = value.split('-').map(Number)
    if (!y || !m) return
    setYear(y)
    setMonth(m)
  }

  const finalizeRow = rows.find((r) => r.employeeId === finalizeTarget) ?? null
  const reopenRow = rows.find((r) => r.employeeId === reopenTarget) ?? null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Payroll</h1>
          <Link to="/payroll/opening" className="ml-auto text-xs text-accent hover:underline">
            Opening Balances
          </Link>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-card">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted">
              Period
              <input
                type="month"
                value={`${year}-${String(month).padStart(2, '0')}`}
                onChange={(event) => handlePeriodChange(event.target.value)}
                className="min-h-tap rounded-xl border border-line px-3 text-sm text-ink"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-accent"
              />
              Include resigned staff
            </label>
          </div>
          {loadState === 'ready' && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savingAll || bulkFinalizing || rows.every((r) => r.status !== 'draft')}
                className="min-h-tap rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-50"
              >
                {savingAll ? 'Saving all…' : 'Save all drafts'}
              </button>
              <button
                type="button"
                onClick={() => setBulkFinalizeConfirmOpen(true)}
                disabled={savingAll || bulkFinalizing || rows.every((r) => r.status !== 'draft')}
                className="min-h-tap rounded-xl border border-success/30 px-4 font-semibold text-sm text-success hover:bg-success-soft disabled:opacity-50"
              >
                {bulkFinalizing ? 'Finalizing…' : 'Finalize all drafts'}
              </button>
            </div>
          )}
        </div>

        {ytdWarning && <ErrorState message={ytdWarning} />}

        {loadState === 'loading' && <LoadingState label="Loading payroll…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && rows.length === 0 && (
          <EmptyState message="No active staff in this center yet." />
        )}
      </div>

      {loadState === 'ready' && rows.length > 0 && (
        <div className="mx-auto mt-4 max-w-[calc(100vw-3rem)] overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Name</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Base</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">EPF (emp)</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">SOCSO (emp)</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">EIS (emp)</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">PCB</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Net</th>
                <th className="px-2 py-2 text-center font-semibold text-2xs uppercase tracking-wider text-muted"></th>
                <th className="px-2 py-2 text-center font-semibold text-2xs uppercase tracking-wider text-muted">Status</th>
                <th className="px-2 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PayrollTableRow
                  key={row.employeeId}
                  row={row}
                  isAdminOrSuper={isAdminOrSuper}
                  onFieldChange={handleFieldChange}
                  onOverrideChange={handleOverrideChange}
                  onClearOverride={handleClearOverride}
                  onSave={handleSaveRowClick}
                  onRequestFinalize={setFinalizeTarget}
                  onRequestReopen={setReopenTarget}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!finalizeRow}
        title="Finalize this payslip?"
        message={
          finalizeRow
            ? `${finalizeRow.fullName}'s payslip for ${MONTH_LABELS[month - 1]} ${year} will be saved and locked from further editing.`
            : ''
        }
        confirmLabel="Finalize"
        onConfirm={confirmFinalize}
        onCancel={() => setFinalizeTarget(null)}
        loading={finalizeRow?.finalizing ?? false}
      />

      <ConfirmDialog
        open={bulkFinalizeConfirmOpen}
        title="Finalize all draft payslips?"
        message={`${rows.filter((r) => r.status === 'draft').length} draft payslip(s) for ${MONTH_LABELS[month - 1]} ${year} will be saved, locked from further editing, and have payslip PDFs generated.`}
        confirmLabel="Finalize all"
        onConfirm={confirmBulkFinalize}
        onCancel={() => setBulkFinalizeConfirmOpen(false)}
        loading={bulkFinalizing}
      />

      <ConfirmDialog
        open={!!reopenRow}
        title="Reopen this payslip?"
        message={
          reopenRow
            ? `${reopenRow.fullName}'s payslip for ${MONTH_LABELS[month - 1]} ${year} will be set back to draft and become editable again.`
            : ''
        }
        confirmLabel="Reopen"
        onConfirm={confirmReopen}
        onCancel={() => setReopenTarget(null)}
        loading={reopenRow?.reopening ?? false}
      />
    </div>
  )
}
