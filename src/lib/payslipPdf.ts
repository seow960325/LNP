import pdfMake from 'pdfmake/build/pdfmake'
import type { Payslip, PayrollSettings } from './payrollApi'
import {
  COLORS,
  formatCurrency,
  pdfStyles,
  buildCompanyHeader,
  buildAccentLine,
  buildFooter,
  getLogoDataUrl,
} from './pdfBrand'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMoney(amount: number): string {
  return `RM ${formatCurrency(amount)}`
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
  _settings: PayrollSettings
): Promise<Blob> {
  const logoUrl = await getLogoDataUrl()
  const periodLabel = `${MONTH_LABELS[payslip.month - 1]} ${payslip.year}`
  const generatedOn = new Date().toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const docDefinition = {
    pageSize: 'A4' as const,
    pageOrientation: 'portrait' as const,
    pageMargins: [48, 48, 48, 48] as [number, number, number, number],
    content: [
      // Header: Company name + details with logo
      {
        ...buildCompanyHeader(logoUrl || undefined),
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Horizontal accent line
      buildAccentLine(20),

      // Payslip title + period in two columns
      {
        columns: [
          {
            stack: [
              { text: 'PAYSLIP', style: 'docTitle' },
              { text: periodLabel, style: 'docSubtitle', margin: [0, 2, 0, 0] as [number, number, number, number] },
            ],
            width: '50%',
          },
          {
            stack: [
              {
                text: 'Employee',
                style: 'metaLabel',
              },
              { text: employee.full_name, style: 'metaValue', margin: [0, 1, 0, 0] as [number, number, number, number] },
              {
                text: 'Title',
                style: 'metaLabel',
                margin: [0, 8, 0, 0] as [number, number, number, number],
              },
              { text: employee.title || 'Staff', style: 'metaValue', margin: [0, 1, 0, 0] as [number, number, number, number] },
            ],
            alignment: 'right' as const,
          },
        ],
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Earnings section
      {
        stack: [
          { text: 'EARNINGS', style: 'sectionLabel' },
          {
            table: {
              widths: ['*', 100],
              body: [
                amountRow('Base Salary', payslip.base_salary),
                amountRow('Allowance', payslip.allowance),
                amountRow('Overtime', payslip.overtime),
                amountRow('Bonus', payslip.bonus),
                amountRow('Unpaid Leave', payslip.unpaid_leave_deduction, { negative: true }),
                [
                  { text: 'Gross Pay', fontSize: 10, bold: true, color: COLORS.charcoal, border: [false, true, false, false], borderColor: COLORS.lightGray },
                  { text: formatMoney(payslip.gross_pay), fontSize: 10, bold: true, alignment: 'right' as const, color: COLORS.charcoal, border: [false, true, false, false], borderColor: COLORS.lightGray },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Deductions section
      {
        stack: [
          { text: 'DEDUCTIONS', style: 'sectionLabel' },
          {
            table: {
              widths: ['*', 100],
              body: [
                amountRow('EPF (Employee)', payslip.epf_employee),
                amountRow('SOCSO (Employee)', payslip.socso_employee),
                amountRow('EIS (Employee)', payslip.eis_employee),
                amountRow('PCB', payslip.pcb),
                [
                  { text: 'Total Deductions', fontSize: 10, bold: true, color: COLORS.charcoal, border: [false, true, false, false], borderColor: COLORS.lightGray },
                  { text: formatMoney(payslip.total_deductions), fontSize: 10, bold: true, alignment: 'right' as const, color: COLORS.charcoal, border: [false, true, false, false], borderColor: COLORS.lightGray },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Net Pay - accent highlighted
      {
        table: {
          widths: ['*', 100],
          body: [
            [
              { text: 'NET PAY', fontSize: 11, bold: true, color: COLORS.accent, border: [false, false, false, false] },
              { text: formatMoney(payslip.net_pay), fontSize: 11, bold: true, alignment: 'right' as const, color: COLORS.accent, border: [false, false, false, false] },
            ],
            [
              { border: [false, true, false, false], borderColor: COLORS.accent, text: '' },
              { border: [false, true, false, false], borderColor: COLORS.accent, text: '' },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Employer contributions section
      {
        stack: [
          { text: 'EMPLOYER CONTRIBUTIONS', style: 'sectionLabel' },
          {
            text: '(not deducted from salary)',
            fontSize: 8,
            color: COLORS.mutedGray,
            margin: [0, 2, 0, 8] as [number, number, number, number],
          },
          {
            table: {
              widths: ['*', 100],
              body: [
                amountRow('EPF (Employer)', payslip.epf_employer),
                amountRow('SOCSO (Employer)', payslip.socso_employer),
                amountRow('EIS (Employer)', payslip.eis_employer),
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Year-to-date section
      {
        stack: [
          { text: 'YEAR-TO-DATE', style: 'sectionLabel' },
          {
            table: {
              widths: ['*', 100],
              body: [
                amountRow('YTD Gross', payslip.ytd_gross),
                amountRow('YTD PCB', payslip.ytd_pcb),
                amountRow('YTD EPF (Employee)', payslip.ytd_epf_employee),
                amountRow('YTD SOCSO (Employee)', payslip.ytd_socso_employee),
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Footer
      ...buildFooter([
        'This is a computer-generated payslip. No signature required.',
        `Generated on ${generatedOn}`,
      ]),
    ],
    styles: pdfStyles,
    defaultStyle: { fontSize: 10, color: COLORS.charcoal },
  }

  return pdfMake.createPdf(docDefinition as unknown as Parameters<typeof pdfMake.createPdf>[0]).getBlob()
}
