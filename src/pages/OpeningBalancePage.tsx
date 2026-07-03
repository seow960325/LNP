import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
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
  saved: boolean
  saveError: string | null
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
    saved: false,
    saveError: null,
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
      className="w-24 rounded-xl border border-neutral-200 px-2 py-1 text-right text-sm disabled:opacity-60"
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
    updateRow(employeeId, (row) => ({ ...row, [field]: value, saved: false, saveError: null }))
  }

  async function handleSave(row: RowState) {
    if (!profile) return
    updateRow(row.employeeId, (r) => ({ ...r, saving: true, saveError: null, saved: false }))

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
      updateRow(row.employeeId, (r) => ({ ...r, saving: false, saveError: 'Could not save. Please try again.' }))
      return
    }

    updateRow(row.employeeId, (r) => ({ ...r, saving: false, saved: true, openingId: data.id }))
    setTimeout(() => {
      updateRow(row.employeeId, (r) => ({ ...r, saved: false }))
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/payroll" />
          <h1 className="font-display text-2xl text-neutral-800">Opening Balances</h1>
        </div>

        <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
          Enter accumulated Jan–[month before go-live] totals per employee. Used only for
          cumulative PCB calculation. Resets each year.
        </p>

        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            Year
            <input
              type="number"
              step="1"
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || year)}
              className="min-h-tap w-24 rounded-2xl border border-neutral-200 px-3 text-sm text-neutral-800"
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
        <div className="mx-auto mt-4 max-w-[calc(100vw-3rem)] overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2 text-left font-display text-xs text-neutral-500">Staff Name</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Opening Gross</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Opening PCB</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Opening EPF (Emp)</th>
                <th className="px-2 py-2 text-right font-display text-xs text-neutral-500">Opening SOCSO (Emp)</th>
                <th className="px-2 py-2 text-left font-display text-xs text-neutral-500">Save</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId} className="border-t border-neutral-100">
                  <td className="sticky left-0 z-10 min-w-[140px] bg-white px-3 py-2">
                    <p className="font-display text-sm text-neutral-800">{row.fullName}</p>
                    {row.title && <p className="text-2xs text-neutral-400">{row.title}</p>}
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
                      className="min-h-tap rounded-xl bg-brand-600 px-3 text-xs text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
                    >
                      {row.saving ? 'Saving…' : row.saved ? 'Saved!' : 'Save'}
                    </button>
                    {row.saveError && <p className="mt-1 max-w-[140px] text-2xs text-coral-600">{row.saveError}</p>}
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
