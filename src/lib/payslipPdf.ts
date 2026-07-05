import pdfMake from 'pdfmake/build/pdfmake'
import type { Payslip, PayrollSettings } from './payrollApi'
import {
  COLORS,
  formatCurrency,
  formatDate,
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

interface StatRow {
  label: string
  amount: number
}

// Builds the accent-headered EARNINGS/DEDUCTIONS tables — same visual
// language as the invoice's line-items table (accent header row, zebra
// stripes, accent-bordered total row), but the closing row is a bold
// light-background subtotal rather than the invoice's filled accent total,
// per the standard payslip convention of keeping Gross Pay/Total Deductions
// visually distinct from the final Net Pay band.
function buildStatTable(headerLabel: string, rows: StatRow[], subtotalLabel: string, subtotalAmount: number) {
  const body = [
    [
      {
        text: headerLabel,
        fontSize: 8,
        bold: true,
        color: '#ffffff',
        textCase: 'uppercase' as const,
        letterSpacing: 0.5,
      },
      {
        text: 'AMOUNT (RM)',
        fontSize: 8,
        bold: true,
        color: '#ffffff',
        textCase: 'uppercase' as const,
        letterSpacing: 0.5,
        alignment: 'right' as const,
      },
    ],
    ...rows.map((row) => [
      { text: row.label, fontSize: 10, color: COLORS.charcoal },
      { text: formatMoney(row.amount), fontSize: 10, color: COLORS.charcoal, alignment: 'right' as const },
    ]),
    [
      { text: subtotalLabel, fontSize: 10, bold: true, color: COLORS.charcoal },
      { text: formatMoney(subtotalAmount), fontSize: 10, bold: true, color: COLORS.charcoal, alignment: 'right' as const },
    ],
  ]
  const lastIndex = body.length - 1

  return {
    table: { widths: ['*', 120], headerRows: 1, body },
    layout: {
      hLineWidth: (i: number) => (i === 1 || i === lastIndex ? 0 : 0.5),
      hLineColor: (i: number) => (i === 0 || i === lastIndex ? COLORS.accent : COLORS.lightGray),
      vLineWidth: () => 0,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: (i: number) =>
        i === 0 ? COLORS.accent : i === lastIndex ? COLORS.bgGray : i % 2 === 1 ? COLORS.bgGray : '#ffffff',
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  }
}

// Small muted boxed section — mirrors the invoice's "PAYMENT & NOTES"
// bordered box (border on the cell, not the table layout).
function buildBoxedSection(title: string, subtitle: string, rows: StatRow[]) {
  return {
    table: {
      widths: ['*'],
      dontBreakRows: true,
      body: [
        [
          {
            stack: [
              {
                text: title,
                fontSize: 8,
                bold: true,
                color: COLORS.mutedGray,
                textCase: 'uppercase' as const,
                letterSpacing: 1,
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: subtitle,
                fontSize: 8,
                color: COLORS.mutedGray,
                margin: [0, 0, 0, 8] as [number, number, number, number],
              },
              {
                table: {
                  widths: ['*', 120],
                  body: rows.map((row) => [
                    { text: row.label, fontSize: 9, color: COLORS.warmGray },
                    { text: formatMoney(row.amount), fontSize: 9, color: COLORS.warmGray, alignment: 'right' as const },
                  ]),
                },
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
              },
            ],
          },
        ],
      ],
    },
    // A single-cell table, so the layout's own line functions (rather than
    // the cell's `border` property, which a custom hLineWidth/vLineWidth
    // silently overrides in this pdfmake version) draw the box outline.
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => COLORS.lightGray,
      vLineColor: () => COLORS.lightGray,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 6,
      paddingBottom: () => 8,
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  }
}

// Meta panel row — mirrors the invoice's ISSUE DATE/DUE DATE/STATUS cells.
function buildMetaRow(label: string, value: string) {
  return [
    {
      stack: [
        {
          text: label,
          fontSize: 7,
          bold: true,
          color: COLORS.mutedGray,
          textCase: 'uppercase' as const,
          letterSpacing: 0.5,
          margin: [0, 0, 0, 3] as [number, number, number, number],
        },
        { text: value, fontSize: 10, color: COLORS.charcoal },
      ],
      margin: [10, 8, 10, 8] as [number, number, number, number],
    },
  ]
}

export async function generatePayslipPdf(
  payslip: PayslipPdfData,
  employee: PayslipPdfEmployee,
  settings: PayrollSettings
): Promise<Blob> {
  const logoUrl = await getLogoDataUrl()
  const periodLabel = `${MONTH_LABELS[payslip.month - 1]} ${payslip.year}`
  const generatedOn = new Date().toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Presentational sums for the standard payslip layout, where Unpaid Leave
  // reads as a deduction rather than netted into Gross Pay. These are pure
  // display totals of already-stored fields (never written back or used in
  // place of payslip.net_pay), and are algebraically guaranteed to reconcile:
  //   displayedGrossPay - displayedTotalDeductions
  //     = (base + allowance + overtime + bonus) - (epf + socso + eis + pcb + unpaid)
  //     = (base + allowance + overtime + bonus - unpaid) - (epf + socso + eis + pcb)
  //     = payslip.gross_pay - payslip.total_deductions
  //     = payslip.net_pay
  const displayedGrossPay = payslip.base_salary + payslip.allowance + payslip.overtime + payslip.bonus
  const displayedTotalDeductions =
    payslip.epf_employee + payslip.socso_employee + payslip.eis_employee + payslip.pcb + payslip.unpaid_leave_deduction

  const earningsRows: StatRow[] = [{ label: 'Basic Salary', amount: payslip.base_salary }]
  if (payslip.allowance > 0) earningsRows.push({ label: 'Allowance', amount: payslip.allowance })
  if (payslip.overtime > 0) earningsRows.push({ label: 'Overtime', amount: payslip.overtime })
  if (payslip.bonus > 0) earningsRows.push({ label: 'Bonus', amount: payslip.bonus })

  const deductionRows: StatRow[] = [
    { label: `EPF (Employee ${settings.epf_rate_employee}%)`, amount: payslip.epf_employee },
    { label: 'SOCSO (Employee)', amount: payslip.socso_employee },
    { label: 'EIS (Employee)', amount: payslip.eis_employee },
    { label: 'PCB (MTD Tax)', amount: payslip.pcb },
  ]
  if (payslip.unpaid_leave_deduction > 0) {
    deductionRows.push({ label: 'Unpaid Leave', amount: payslip.unpaid_leave_deduction })
  }

  const docDefinition = {
    pageSize: 'A4' as const,
    pageOrientation: 'portrait' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content: [
      // Header with logo and company info
      {
        ...buildCompanyHeader(logoUrl || undefined),
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },

      buildAccentLine(14),

      // Title + top-right meta panel
      {
        columns: [
          {
            stack: [
              { text: 'PAYSLIP', style: 'docTitle' },
              {
                text: `For the month of ${periodLabel}`,
                style: 'docSubtitle',
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ],
            width: '55%',
          },
          {
            table: {
              widths: ['*'],
              body: [
                buildMetaRow('PAY PERIOD', periodLabel),
                buildMetaRow('PAY DATE', payslip.finalized_at ? formatDate(payslip.finalized_at) : '—'),
                buildMetaRow('PAYMENT METHOD', '—'),
              ],
            },
            layout: {
              hLineWidth: () => 1,
              hLineColor: () => COLORS.lightGray,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 0,
            },
            fillColor: COLORS.bgGray,
            width: '45%',
          },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },

      // Employee particulars — aligned label:value, mirrors invoice BILL TO
      {
        stack: [
          {
            text: 'EMPLOYEE PARTICULARS',
            fontSize: 8,
            bold: true,
            color: COLORS.mutedGray,
            textCase: 'uppercase' as const,
            letterSpacing: 1,
            margin: [0, 0, 0, 8] as [number, number, number, number],
          },
          {
            table: {
              widths: [90, '*'],
              body: [
                [
                  { text: 'Employee:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                  { text: employee.full_name, fontSize: 10, color: COLORS.charcoal },
                ],
                [
                  { text: 'Designation:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                  { text: employee.title || 'Staff', fontSize: 10, color: COLORS.charcoal },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 4,
              paddingBottom: () => 4,
            },
          },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },

      // Earnings
      buildStatTable('EARNINGS', earningsRows, 'Gross Pay', displayedGrossPay),

      // Deductions
      buildStatTable('DEDUCTIONS', deductionRows, 'Total Deductions', displayedTotalDeductions),

      // Net Pay — full-width accent band, exactly like the invoice TOTAL row
      {
        table: {
          widths: ['*', 120],
          body: [
            [
              { text: 'NET PAY', fontSize: 11, bold: true, color: '#ffffff' },
              { text: formatMoney(payslip.net_pay), fontSize: 11, bold: true, color: '#ffffff', alignment: 'right' as const },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 10,
          paddingBottom: () => 10,
          fillColor: () => COLORS.accent,
        },
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },

      // Employer statutory contributions — informational, visually distinct
      // from the employee deductions above so it's never mistaken for
      // take-home math.
      buildBoxedSection('Employer Contributions (not deducted from employee)', 'Paid by the company on top of net pay.', [
        { label: `EPF (Employer ${settings.epf_rate_employer_high}%/${settings.epf_rate_employer}%)`, amount: payslip.epf_employer },
        { label: 'SOCSO (Employer)', amount: payslip.socso_employer },
        { label: 'EIS (Employer)', amount: payslip.eis_employer },
      ]),

      // Year-to-date summary
      buildBoxedSection('Year-to-Date Summary', `Cumulative for ${payslip.year}, including this payslip.`, [
        { label: 'YTD Gross', amount: payslip.ytd_gross },
        { label: 'YTD EPF (Employee)', amount: payslip.ytd_epf_employee },
        { label: 'YTD SOCSO (Employee)', amount: payslip.ytd_socso_employee },
        { label: 'YTD PCB', amount: payslip.ytd_pcb },
      ]),

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
