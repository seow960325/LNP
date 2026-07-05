import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { toKLDateISO } from '../lib/helpers'
import { fetchActiveStaff, fetchYtdOpening, upsertYtdOpening } from '../lib/payrollApi'
import type { PayrollStaffMember, YtdOpeningBalance } from '../lib/payrollApi'

type LoadState = 'loading' | 'ready' | 'error'
type OpeningField = 'openingGross' | 'openingPcb' | 'openingEpfEmployee' | 'openingSocsoEmployee'

interface RowState {
  employeeId: string
  fullName: string
  title: string | null
  openingId: string | null
  openingGross: number
  openingPcb: number
  openingEpfEmployee: number
  openingSocsoEmployee: number
  saving: boolean
}

function buildRow(staff: PayrollStaffMember, opening: YtdOpeningBalance | undefined): RowState {
  return {
    employeeId: staff.id,
    fullName: staff.full_name,
    title: staff.title,
    openingId: opening?.id ?? null,
    openingGross: opening?.opening_gross ?? 0,
    openingPcb: opening?.opening_pcb ?? 0,
    openingEpfEmployee: opening?.opening_epf_employee ?? 0,
    openingSocsoEmployee: opening?.opening_socso_employee ?? 0,
    saving: false,
  }
}

function NumberCell({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
      disabled={disabled}
      className="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm disabled:opacity-60"
    />
  )
}

export function OpeningBalancePage() {
  const { profile } = useAuth()

  const [year, setYear] = useState(() => Number(toKLDateISO(new Date()).slice(0, 4)))
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<RowState[]>([])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')
    setLoadError(null)

    async function load() {
      const centerId = profile!.center_id

      const [staffResult, openingResult] = await Promise.all([
        fetchActiveStaff(centerId),
        fetchYtdOpening(centerId, year),
      ])

      if (cancelled) return

      if (staffResult.error || !staffResult.data) {
        setLoadError('Could not load staff. Please try again.')
        setLoadState('error')
        return
      }
      if (openingResult.error) {
        setLoadError('Could not load opening balances. Please try again.')
        setLoadState('error')
        return
      }

      const openingMap = openingResult.data ?? new Map()
      setRows(staffResult.data.map((s) => buildRow(s, openingMap.get(s.id))))
      setLoadState('ready')
    }

    load()

    return () => {
      cancelled = true
    }
  }, [profile, year])

  if (!profile) return null

  function updateRow(employeeId: string, updater: (row: RowState) => RowState) {
    setRows((prev) => prev.map((r) => (r.employeeId === employeeId ? updater(r) : r)))
  }

  function handleFieldChange(employeeId: string, field: OpeningField, value: number) {
    updateRow(employeeId, (row) => ({ ...row, [field]: value }))
  }

  async function handleSave(row: RowState) {
    if (!profile) return
    updateRow(row.employeeId, (r) => ({ ...r, saving: true }))

    const { data, error } = await upsertYtdOpening({
      id: row.openingId ?? undefined,
      center_id: profile.center_id,
      employee_id: row.employeeId,
      year,
      opening_gross: row.openingGross,
      opening_pcb: row.openingPcb,
      opening_epf_employee: row.openingEpfEmployee,
      opening_socso_employee: row.openingSocsoEmployee,
    })

    if (error || !data) {
      updateRow(row.employeeId, (r) => ({ ...r, saving: false }))
      toast.error('Could not save. Please try again.')
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, saving: false, openingId: data.id }))
    toast.success('Opening balance saved')
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Opening Balances" fallback="/payroll" />

        <p className="rounded-xl bg-accent-soft/60 px-4 py-3 text-xs text-ink/80">
          Enter accumulated Jan–[month before go-live] totals per employee. Used only for
          cumulative PCB calculation. Resets each year.
        </p>

        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
          <label className="flex items-center gap-2 text-xs text-muted">
            Year
            <input
              type="number"
              step="1"
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || year)}
              className="min-h-tap w-24 rounded-xl border border-line px-3 text-sm text-ink"
            />
          </label>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading opening balances…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && rows.length === 0 && (
          <EmptyState message="No active staff in this center yet." />
        )}
      </div>

      {loadState === 'ready' && rows.length > 0 && (
        <div className="mx-auto mt-4 max-w-[calc(100vw-3rem)] overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Staff Name</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Opening Gross</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Opening PCB</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Opening EPF (Emp)</th>
                <th className="px-2 py-2 text-right font-semibold text-2xs uppercase tracking-wider text-muted">Opening SOCSO (Emp)</th>
                <th className="px-2 py-2 text-left font-semibold text-2xs uppercase tracking-wider text-muted">Save</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId} className="group border-t border-line transition-colors hover:bg-cream/70">
                  <td className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 transition-colors group-hover:bg-cream">
                    <p className="font-semibold text-sm text-ink">{row.fullName}</p>
                    {row.title && <p className="text-2xs text-muted/70">{row.title}</p>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <NumberCell
                      value={row.openingGross}
                      disabled={row.saving}
                      onChange={(v) => handleFieldChange(row.employeeId, 'openingGross', v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <NumberCell
                      value={row.openingPcb}
                      disabled={row.saving}
                      onChange={(v) => handleFieldChange(row.employeeId, 'openingPcb', v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <NumberCell
                      value={row.openingEpfEmployee}
                      disabled={row.saving}
                      onChange={(v) => handleFieldChange(row.employeeId, 'openingEpfEmployee', v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <NumberCell
                      value={row.openingSocsoEmployee}
                      disabled={row.saving}
                      onChange={(v) => handleFieldChange(row.employeeId, 'openingSocsoEmployee', v)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => handleSave(row)}
                      disabled={row.saving}
                      className="min-h-tap rounded-xl bg-accent px-3 text-xs text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                    >
                      {row.saving ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
