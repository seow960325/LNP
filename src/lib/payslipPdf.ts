import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Payslip, PayrollSettings } from './payrollApi'

// vfs_fonts.js's `module.exports = vfs` assignment isn't statically
// analyzable by the bundler, so under Vite's CJS interop the real font map
// lands on `.vfs`/`.default` depending on how it got resolved; fall back to
// the module itself for plain CJS/Node resolution.
const fontsModule = pdfFonts as unknown as {
  vfs?: Record<string, string>
  default?: Record<string, string>
}
const vfs = fontsModule.vfs ?? fontsModule.default ?? (pdfFonts as unknown as Record<string, string>)
pdfMake.addVirtualFileSystem(vfs)

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMoney(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface PayslipPdfEmployee {
  full_name: string
  title: string | null
}

// The payslips table only persists ytd_gross/ytd_pcb (see payrollApi.ts) —
// it has no ytd_epf_employee/ytd_socso_employee columns. The finalize flow
// already computes those two cumulative figures in memory (same math as
// ytd_gross/ytd_pcb), so the caller passes them in rather than us reading
// non-existent columns off `payslip`.
export type PayslipPdfData = Payslip & {
  ytd_epf_employee: number
  ytd_socso_employee: number
}

function amountRow(label: string, amount: number, opts?: { negative?: boolean; bold?: boolean }) {
  const text = `${opts?.negative ? '- ' : ''}${formatMoney(amount)}`
  return opts?.bold
    ? [{ text: label, bold: true }, { text, bold: true, alignment: 'right' as const }]
    : [label, { text, alignment: 'right' as const }]
}

export async function generatePayslipPdf(
  payslip: PayslipPdfData,
  employee: PayslipPdfEmployee,
  settings: PayrollSettings
): Promise<Blob> {
  const periodLabel = `${MONTH_LABELS[payslip.month - 1]} ${payslip.year}`
  const generatedOn = new Date().toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const docDefinition = {
    pageSize: 'A4' as const,
    pageOrientation: 'portrait' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content: [
      { text: settings.company_name, style: 'companyName' },
      { text: settings.company_address, style: 'companyMeta' },
      { text: `Registration No: ${settings.company_regno}`, style: 'companyMeta' },
      { text: 'PAYSLIP', style: 'docTitle', margin: [0, 12, 0, 12] as [number, number, number, number] },

      {
        columns: [
          { text: [{ text: 'Employee: ', bold: true }, employee.full_name] },
          { text: [{ text: 'Period: ', bold: true }, periodLabel], alignment: 'right' as const },
        ],
      },
      {
        text: [{ text: 'Title: ', bold: true }, employee.title || 'Staff'],
        margin: [0, 2, 0, 12] as [number, number, number, number],
      },

      { text: 'Earnings', style: 'sectionHeader' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            amountRow('Base Salary', payslip.base_salary),
            amountRow('Allowance', payslip.allowance),
            amountRow('Overtime', payslip.overtime),
            amountRow('Bonus', payslip.bonus),
            amountRow('Unpaid Leave', payslip.unpaid_leave_deduction, { negative: true }),
            amountRow('Gross Pay', payslip.gross_pay, { bold: true }),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 12] as [number, number, number, number],
      },

      { text: 'Deductions', style: 'sectionHeader' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            amountRow('EPF (Employee)', payslip.epf_employee),
            amountRow('SOCSO (Employee)', payslip.socso_employee),
            amountRow('EIS (Employee)', payslip.eis_employee),
            amountRow('PCB', payslip.pcb),
            amountRow('Total Deductions', payslip.total_deductions, { bold: true }),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 12] as [number, number, number, number],
      },

      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'NET PAY', bold: true, fontSize: 14 },
              { text: formatMoney(payslip.net_pay), bold: true, fontSize: 14, alignment: 'right' as const },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 16] as [number, number, number, number],
      },

      { text: 'Employer Contributions (not deducted from salary)', style: 'sectionHeader' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            amountRow('EPF (Employer)', payslip.epf_employer),
            amountRow('SOCSO (Employer)', payslip.socso_employer),
            amountRow('EIS (Employer)', payslip.eis_employer),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 12] as [number, number, number, number],
      },

      { text: 'Year-to-Date', style: 'sectionHeader' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            amountRow('YTD Gross', payslip.ytd_gross),
            amountRow('YTD PCB', payslip.ytd_pcb),
            amountRow('YTD EPF (Employee)', payslip.ytd_epf_employee),
            amountRow('YTD SOCSO (Employee)', payslip.ytd_socso_employee),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 4, 0, 12] as [number, number, number, number],
      },

      {
        text: 'This is a computer-generated payslip. No signature required.',
        style: 'footer',
        margin: [0, 20, 0, 0] as [number, number, number, number],
      },
      { text: `Generated on ${generatedOn}`, style: 'footer' },
    ],
    styles: {
      companyName: { fontSize: 14, bold: true },
      companyMeta: { fontSize: 9, color: '#555555' },
      docTitle: { fontSize: 16, bold: true, alignment: 'center' as const },
      sectionHeader: { fontSize: 11, bold: true, margin: [0, 8, 0, 2] as [number, number, number, number] },
      footer: { fontSize: 8, color: '#888888', alignment: 'center' as const },
    },
    defaultStyle: { fontSize: 10 },
  }

  return pdfMake.createPdf(docDefinition).getBlob()
}
