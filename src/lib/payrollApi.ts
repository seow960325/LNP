import { supabase } from './supabaseClient'
import type { SocsoScheme } from './payrollCalc'

export type PayslipStatus = 'draft' | 'finalized' | 'sent'

export interface PayrollSettings {
  epf_rate_employee: number
  epf_rate_employer: number
  epf_rate_employer_high: number
  socso_scheme: SocsoScheme
  company_name: string
  company_address: string
  company_regno: string
}

export interface PayrollStaffMember {
  id: string
  full_name: string
  title: string | null
  active: boolean
}

export interface ManualOverrides {
  epf_employee?: boolean
  socso_employee?: boolean
  eis_employee?: boolean
  pcb?: boolean
}

export interface Payslip {
  id: string
  center_id: string
  employee_id: string
  year: number
  month: number
  status: PayslipStatus
  base_salary: number
  allowance: number
  overtime: number
  bonus: number
  unpaid_leave_deduction: number
  epf_employee: number
  epf_employer: number
  socso_employee: number
  socso_employer: number
  eis_employee: number
  eis_employer: number
  pcb: number
  gross_pay: number
  total_deductions: number
  net_pay: number
  ytd_gross: number
  ytd_pcb: number
  manual_overrides: ManualOverrides
  notes: string | null
  created_by: string | null
  finalized_by: string | null
  finalized_at: string | null
  sent_at: string | null
}

// Writable subset of Payslip. `id` is present when updating an existing row,
// omitted when inserting. `created_by` is only actually persisted on insert
// (see upsertPayslip) — updates never overwrite the original creator.
export type PayslipInput = Omit<
  Payslip,
  'id' | 'created_by' | 'finalized_by' | 'finalized_at' | 'sent_at'
> & {
  id?: string
  created_by: string
}

export interface YtdTotals {
  ytdGross: number
  ytdPcb: number
  ytdEpfEmployee: number
  ytdSocsoEmployee: number
}

const EMPTY_YTD: YtdTotals = { ytdGross: 0, ytdPcb: 0, ytdEpfEmployee: 0, ytdSocsoEmployee: 0 }

// Accumulated Jan–[month before go-live] totals per employee, entered once
// per year so the PCB formula has a correct cumulative base for staff who
// joined the system mid-year. Resets each year (rows are scoped by year).
export interface YtdOpeningBalance {
  id: string
  center_id: string
  employee_id: string
  year: number
  opening_gross: number
  opening_pcb: number
  opening_epf_employee: number
  opening_socso_employee: number
}

export type YtdOpeningInput = Omit<YtdOpeningBalance, 'id'> & { id?: string }

export async function fetchPayrollSettings(centerId: string) {
  const { data, error } = await supabase
    .from('payroll_settings')
    .select(
      'epf_rate_employee, epf_rate_employer, epf_rate_employer_high, socso_scheme, company_name, company_address, company_regno'
    )
    .eq('center_id', centerId)
    .maybeSingle()

  return { data: data as PayrollSettings | null, error }
}

export function fetchActiveStaff(centerId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, title, active')
    .eq('center_id', centerId)
    .eq('active', true)
    .order('full_name')
    .returns<PayrollStaffMember[]>()
}

// Same as fetchActiveStaff, but lets the caller opt into seeing deactivated
// (resigned) staff too — needed so admins can still run a resigned staff
// member's final payslip after their profile is deactivated.
export function fetchPayrollStaff(centerId: string, includeInactive: boolean) {
  let query = supabase
    .from('profiles')
    .select('id, full_name, title, active')
    .eq('center_id', centerId)
    // Non-paid staff (e.g. shareholders) never draw a salary, so they never
    // belong on payroll — enforced regardless of the resigned-staff toggle.
    .eq('is_paid_employee', true)

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  return query.order('full_name').returns<PayrollStaffMember[]>()
}

export function fetchPayslips(centerId: string, year: number, month: number) {
  return supabase
    .from('payslips')
    .select('*')
    .eq('center_id', centerId)
    .eq('year', year)
    .eq('month', month)
    .returns<Payslip[]>()
}

// All finalized/sent payslips for a whole year — the set eligible for PDF
// regeneration (drafts have no payslip PDF to regenerate).
export function fetchFinalizedPayslipsForYear(centerId: string, year: number) {
  return supabase
    .from('payslips')
    .select('*')
    .eq('center_id', centerId)
    .eq('year', year)
    .in('status', ['finalized', 'sent'])
    .order('month')
    .returns<Payslip[]>()
}

// Sums finalized/sent payslips for months BEFORE `beforeMonth` in `year`,
// then adds the employee's opening balance for that year on top (0 if none
// entered) — the "YTD so far" input the MTD/PCB formula needs. Falls back to
// all-zero on error so a transient failure degrades PCB accuracy instead of
// blocking the whole page; callers should still surface `error` to the user.
export async function fetchYtd(employeeId: string, year: number, beforeMonth: number) {
  const [payslipsResult, openingResult] = await Promise.all([
    supabase
      .from('payslips')
      .select('gross_pay, pcb, epf_employee, socso_employee')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .lt('month', beforeMonth)
      .in('status', ['finalized', 'sent']),
    supabase
      .from('payroll_ytd_opening')
      .select('opening_gross, opening_pcb, opening_epf_employee, opening_socso_employee')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .maybeSingle(),
  ])

  if (payslipsResult.error) return { data: EMPTY_YTD, error: payslipsResult.error }

  const totals = (payslipsResult.data ?? []).reduce<YtdTotals>(
    (acc, row) => ({
      ytdGross: acc.ytdGross + (row.gross_pay ?? 0),
      ytdPcb: acc.ytdPcb + (row.pcb ?? 0),
      ytdEpfEmployee: acc.ytdEpfEmployee + (row.epf_employee ?? 0),
      ytdSocsoEmployee: acc.ytdSocsoEmployee + (row.socso_employee ?? 0),
    }),
    { ...EMPTY_YTD }
  )

  const opening = openingResult.data

  return {
    data: {
      ytdGross: totals.ytdGross + (opening?.opening_gross ?? 0),
      ytdPcb: totals.ytdPcb + (opening?.opening_pcb ?? 0),
      ytdEpfEmployee: totals.ytdEpfEmployee + (opening?.opening_epf_employee ?? 0),
      ytdSocsoEmployee: totals.ytdSocsoEmployee + (opening?.opening_socso_employee ?? 0),
    },
    error: openingResult.error ?? null,
  }
}

// Returns this year's opening balances for a center, keyed by employee_id.
export async function fetchYtdOpening(centerId: string, year: number) {
  const { data, error } = await supabase
    .from('payroll_ytd_opening')
    .select('*')
    .eq('center_id', centerId)
    .eq('year', year)
    .returns<YtdOpeningBalance[]>()

  if (error || !data) return { data: null, error }

  return { data: new Map(data.map((row) => [row.employee_id, row])), error: null }
}

// Insert or update by (employee_id, year) in a single request. Fixes
// AUDIT_PHASE2 M2: the old select-then-insert-or-update shape was a
// check-then-act race — two concurrent saves for the same employee/year
// could both miss each other's row and insert a duplicate. `.upsert(...,
// { onConflict })` is idempotent under a real DB unique constraint (see
// supabase/migrations/20260708090200_m2_unique_constraints.sql), so a
// double-click or two concurrent admins now always resolve to one row.
export async function upsertYtdOpening(row: YtdOpeningInput) {
  const { id: _id, ...patch } = row
  return supabase
    .from('payroll_ytd_opening')
    .upsert(patch, { onConflict: 'employee_id,year' })
    .select()
    .single()
}

// Insert or update by (employee_id, year, month) in a single request. Fixes
// AUDIT_PHASE2 M2 — same race as upsertYtdOpening above. `created_by` is
// still safe to send on every call (insert AND update): the
// payslips_preserve_created_by trigger (added alongside the unique
// constraint) re-pins it to the original creator on every UPDATE, so a later
// resave by a different admin can never reattribute it.
export async function upsertPayslip(row: PayslipInput) {
  const { id: _id, ...patch } = row
  return supabase
    .from('payslips')
    .upsert(patch, { onConflict: 'employee_id,year,month' })
    .select()
    .single()
}

export function finalizePayslip(id: string, finalizedBy: string) {
  return supabase
    .from('payslips')
    .update({ status: 'finalized', finalized_by: finalizedBy, finalized_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

// admin + super_admin (enforced in the UI layer) — sets a finalized/sent
// payslip back to draft so it becomes editable again.
export function reopenPayslip(id: string) {
  return supabase
    .from('payslips')
    .update({ status: 'draft', finalized_by: null, finalized_at: null })
    .eq('id', id)
    .select()
    .single()
}
