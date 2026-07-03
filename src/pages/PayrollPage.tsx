import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lock, RotateCcw } from 'lucide-react'
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
import { generatePayslipPdf } from '../lib/payslipPdf'
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
  draft: 'bg-neutral-100 text-neutral-600',
  finalized: 'bg-sage-100 text-sage-700',
  sent: 'bg-sky-100 text-sky-700',
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
  saveError: string | null
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
    saveError: null,
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
      className="w-20 rounded-xl border border-neutral-200 px-2 py-1 text-right text-xs disabled:opacity-60"
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
          className="text-neutral-400 hover:text-neutral-600"
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
          overridden ? 'border-coral-300 bg-coral-50' : 'border-neutral-200'
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
    <div className="flex flex-col gap-1 text-2xs text-neutral-500">
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
      <tr className="border-t border-neutral-100">
        <td className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2">
          <div className="flex items-center gap-1 font-display text-sm text-neutral-800">
            {!editable && <Lock className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden="true" />}
            {row.fullName}
            {!row.active && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-2xs font-medium text-neutral-500">
                Resigned
              </span>
            )}
          </div>
          {row.title && <p className="text-2xs text-neutral-400">{row.title}</p>}
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
        <td className="px-2 py-2 text-right font-display text-sm font-bold text-neutral-800">{formatMoney(row.netPay)}</td>
        <td className="px-2 py-2 text-center">
          <button
            type="button"
            onClick={() => onToggleExpand(row.employeeId)}
            aria-expanded={row.expanded}
            className="text-xs text-brand-600 hover:underline"
          >
            {row.expanded ? '▾ less' : '▸ more'}
          </button>
        </td>
        <td className="px-2 py-2 text-center">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${STATUS_BADGE[row.status]}`}>
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
                  className="min-h-tap rounded-xl bg-brand-600 px-3 text-xs text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
                >
                  {row.saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => onRequestFinalize(row.employeeId)}
                  disabled={busy}
                  className="min-h-tap rounded-xl border border-sage-200 px-3 text-xs text-sage-700 hover:bg-sage-50 disabled:opacity-60"
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
                className="min-h-tap rounded-xl border border-coral-200 px-3 text-xs text-coral-600 hover:bg-coral-50 disabled:opacity-60"
              >
                {row.reopening ? 'Reopening…' : 'Reopen'}
              </button>
            )}
          </div>
          {row.saveError && <p className="mt-1 max-w-[140px] text-2xs text-coral-600">{row.saveError}</p>}
        </td>
      </tr>

      {row.expanded && (
        <tr className="border-t border-neutral-100 bg-neutral-50">
          <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-3">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <p className="w-full font-display text-2xs uppercase tracking-wide text-neutral-400">
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
                  <span className="text-sm text-neutral-800">{formatMoney(row.grossPay)}</span>
                </DetailField>
              </div>

              <div className="flex flex-wrap items-end gap-3 border-l border-neutral-200 pl-6">
                <p className="w-full font-display text-2xs uppercase tracking-wide text-neutral-400">
                  Employer contributions
                </p>
                <DetailField label="EPF (er)">
                  <span className="text-sm text-neutral-800">{formatMoney(row.epfEmployer)}</span>
                </DetailField>
                <DetailField label="SOCSO (er)">
                  <span className="text-sm text-neutral-800">{formatMoney(row.socsoEmployer)}</span>
                </DetailField>
                <DetailField label="EIS (er)">
                  <span className="text-sm text-neutral-800">{formatMoney(row.eisEmployer)}</span>
                </DetailField>
                <DetailField label="Total Deduct">
                  <span className="text-sm text-neutral-800">{formatMoney(row.totalDeductions)}</span>
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
  const [saveAllError, setSaveAllError] = useState<string | null>(null)

  const [bulkFinalizeConfirmOpen, setBulkFinalizeConfirmOpen] = useState(false)
  const [bulkFinalizing, setBulkFinalizing] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  // Non-blocking notification — used for PDF generation/upload outcomes,
  // which must never roll back a successful finalize (see
  // generateAndUploadPayslipPdf below).
  function showToast(message: string) {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 6000)
  }

  function handleFieldChange(employeeId: string, field: EditableField, value: number) {
    if (!settings) return
    updateRow(employeeId, (row) =>
      recomputeRow({ ...row, [field]: value, dirty: true, saveError: null }, settings, month)
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
          saveError: null,
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

  async function saveRow(row: RowState): Promise<RowState | null> {
    if (!profile) return null
    updateRow(row.employeeId, (r) => ({ ...r, saving: true, saveError: null }))

    const input = buildPayslipInput(row, year, month, profile.center_id, profile.id)
    const { data, error } = await upsertPayslip(input)

    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, saving: false, saveError: 'Could not save. Please try again.' }))
      return null
    }

    const saved: RowState = { ...row, saving: false, dirty: false, payslipId: data.id, status: data.status }
    updateRow(row.employeeId, () => saved)
    return saved
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
    setSaveAllError(null)
    const draftRows = rows.filter((r) => r.status === 'draft')
    const results = await Promise.all(draftRows.map((r) => saveRow(r)))
    setSavingAll(false)
    if (results.some((r) => r === null)) {
      setSaveAllError('Some payslips could not be saved. Check the rows marked with an error below.')
    }
  }

  async function confirmFinalize() {
    if (!finalizeTarget || !profile) return
    const row = rows.find((r) => r.employeeId === finalizeTarget)
    if (!row) {
      setFinalizeTarget(null)
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, finalizing: true, saveError: null }))
    const saved = await saveRow(row)
    if (!saved || !saved.payslipId) {
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
      setFinalizeTarget(null)
      return
    }

    const { data, error } = await finalizePayslip(saved.payslipId, profile.id)
    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: false, saveError: 'Could not finalize. Please try again.' }))
      setFinalizeTarget(null)
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, finalizing: false, status: 'finalized' }))
    setFinalizeTarget(null)

    const pdfError = await generateAndUploadPayslipPdf(saved, data)
    if (pdfError) {
      showToast(`Payslip finalized but PDF upload failed: ${pdfError}`)
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
      updateRow(row.employeeId, (r) => ({ ...r, finalizing: true, saveError: null }))
      const saved = await saveRow(row)
      if (!saved || !saved.payslipId) {
        updateRow(row.employeeId, (r) => ({ ...r, finalizing: false }))
        continue
      }

      const { data, error } = await finalizePayslip(saved.payslipId, profile.id)
      if (error || !data) {
        updateRow(row.employeeId, (r) => ({
          ...r,
          finalizing: false,
          saveError: 'Could not finalize. Please try again.',
        }))
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
      showToast('No draft payslips could be finalized.')
    } else if (pdfFailures > 0) {
      showToast(
        `${finalizedCount} finalized, ${pdfFailures} PDF upload${pdfFailures === 1 ? '' : 's'} failed.`
      )
    } else {
      showToast(`${finalizedCount} payslip${finalizedCount === 1 ? '' : 's'} finalized.`)
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
      updateRow(row.employeeId, (r) => ({ ...r, reopening: false, saveError: 'Could not reopen. Please try again.' }))
      setReopenTarget(null)
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, reopening: false, status: 'draft' }))
    setReopenTarget(null)
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
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Payroll</h1>
          <Link to="/payroll/opening" className="ml-auto text-xs text-brand-600 hover:underline">
            Opening Balances
          </Link>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-card">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              Period
              <input
                type="month"
                value={`${year}-${String(month).padStart(2, '0')}`}
                onChange={(event) => handlePeriodChange(event.target.value)}
                className="min-h-tap rounded-2xl border border-neutral-200 px-3 text-sm text-neutral-800"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
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
                className="min-h-tap rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-50"
              >
                {savingAll ? 'Saving all…' : 'Save all drafts'}
              </button>
              <button
                type="button"
                onClick={() => setBulkFinalizeConfirmOpen(true)}
                disabled={savingAll || bulkFinalizing || rows.every((r) => r.status !== 'draft')}
                className="min-h-tap rounded-2xl border border-sage-200 px-4 font-display text-sm text-sage-700 hover:bg-sage-50 disabled:opacity-50"
              >
                {bulkFinalizing ? 'Finalizing…' : 'Finalize all drafts'}
              </button>
            </div>
          )}
        </div>

        {toastMessage && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <span>{toastMessage}</span>
            <button type="button" onClick={() => setToastMessage(null)} className="shrink-0 text-brand-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {saveAllError && <ErrorState message={saveAllError} />}
        {ytdWarning && <ErrorState message={ytdWarning} />}

        {loadState === 'loading' && <LoadingState label="Loading payroll…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && rows.length === 0 && (
          <EmptyState message="No active staff in this center yet." />
        )}
      </div>

      {loadState === 'ready' && rows.length > 0 && (
        <div className="mx-auto mt-4 max-w-[calc(100vw-3rem)] overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 text-left font-display text-xs text-neutral-500">Name</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Base</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">EPF (emp)</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">SOCSO (emp)</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">EIS (emp)</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">PCB</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Net</th>
                <th className="px-2 py-2 text-center font-display text-xs text-neutral-500"></th>
                <th className="px-2 py-2 text-center font-display text-xs text-neutral-500">Status</th>
                <th className="px-2 py-2 text-left font-display text-xs text-neutral-500">Actions</th>
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
                  onSave={saveRow}
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
