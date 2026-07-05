import { supabase } from './supabaseClient'
import { fetchPayrollSettings, fetchFinalizedPayslipsForYear, fetchYtd } from './payrollApi'
import type { PayslipPdfData } from './payslipPdf'
import { uploadPayslipDocument } from './staffDocsApi'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface RegenResult {
  total: number
  ok: number
  failed: number
  errors: string[]
}

interface ProfileNameTitle {
  id: string
  full_name: string
  title: string | null
}

// Rebuilds the PDF for every finalized/sent payslip in `year` with the
// center's CURRENT payroll settings/branding, overwriting the existing
// staff-docs file for each (year, month) — e.g. after a company detail or
// letterhead change that should retroactively apply to already-issued
// payslips. Runs sequentially (not Promise.all) since pdfmake generation is
// CPU-bound and doing 12+ at once would just contend for the same thread.
export async function regenerateYearPayslips(
  centerId: string,
  year: number,
  uploadedBy: string
): Promise<RegenResult> {
  const { data: settings } = await fetchPayrollSettings(centerId)
  if (!settings) {
    return { total: 0, ok: 0, failed: 0, errors: ['Missing payroll settings.'] }
  }

  const { data: payslips, error: payslipsError } = await fetchFinalizedPayslipsForYear(centerId, year)
  if (payslipsError || !payslips) {
    return { total: 0, ok: 0, failed: 0, errors: ['Could not load payslips for that year.'] }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, title')
    .eq('center_id', centerId)
    .returns<ProfileNameTitle[]>()
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  let ok = 0
  let failed = 0
  const errors: string[] = []

  // Loaded on demand — pdfmake and its embedded fonts are ~1.3 MB and only
  // this admin-only action ever needs them (mirrors PayrollPage's own lazy
  // import of the same module, so this stays out of the main bundle).
  const { generatePayslipPdf } = await import('./payslipPdf')

  for (const p of payslips) {
    const prof = profileById.get(p.employee_id) ?? { full_name: '—', title: '' }
    const monthLabel = MONTH_LABELS[p.month - 1]

    try {
      const ytd = await fetchYtd(p.employee_id, year, p.month)
      const pdfData: PayslipPdfData = {
        ...p,
        ytd_epf_employee: ytd.data.ytdEpfEmployee + p.epf_employee,
        ytd_socso_employee: ytd.data.ytdSocsoEmployee + p.socso_employee,
      }

      const blob = await generatePayslipPdf(pdfData, { full_name: prof.full_name, title: prof.title }, settings)

      const { error } = await uploadPayslipDocument({
        ownerId: p.employee_id,
        uploadedBy,
        centerId,
        year,
        month: p.month,
        fileName: `Payslip-${monthLabel}-${year}.pdf`,
        pdfBlob: blob,
      })

      if (error) {
        failed++
        errors.push(`${prof.full_name} ${monthLabel}: ${error.message}`)
      } else {
        ok++
      }
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : 'PDF generation failed.'
      errors.push(`${prof.full_name} ${monthLabel}: ${message}`)
    }
  }

  return { total: payslips.length, ok, failed, errors }
}
