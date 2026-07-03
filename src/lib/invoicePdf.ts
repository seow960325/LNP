import pdfMake from 'pdfmake/build/pdfmake'
import type { InvoiceWithDetails } from './billingApi'
import {
  COLORS,
  formatCurrency,
  formatDate,
  pdfStyles,
  buildCompanyHeader,
  buildFooter,
  getLogoDataUrl,
} from './pdfBrand'

const BANK_DETAILS = {
  bank: '',
  accountName: '',
  accountNo: '',
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#9ca3af'
    case 'sent':
      return '#b45309'
    case 'paid':
      return '#16a34a'
    case 'void':
      return '#dc2626'
    default:
      return COLORS.charcoal
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'draft':
      return '#f3f4f6'
    case 'sent':
      return '#fef3c7'
    case 'paid':
      return '#f0fdf4'
    case 'void':
      return '#fef2f2'
    default:
      return '#f9fafb'
  }
}

export async function downloadInvoicePdf(invoice: InvoiceWithDetails): Promise<void> {
  const logoUrl = await getLogoDataUrl()
  const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)

  // Filter out any phantom empty line items (description empty AND amount 0)
  const validLineItems = (invoice.invoice_line_items || []).filter(
    (item) => item.description.trim() !== '' || item.amount !== 0
  )
  const subtotal = validLineItems.reduce((sum, item) => sum + item.amount, 0)

  const docDefinition = {
    pageSize: 'A4' as const,
    pageOrientation: 'portrait' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content: [
      // Header with logo and company info
      {
        ...buildCompanyHeader(logoUrl || undefined),
        margin: [0, 0, 0, 16] as [number, number, number, number],
      },

      // Thin accent line (full width)
      {
        canvas: [
          {
            type: 'line' as const,
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 1,
            stroke: COLORS.accent,
          },
        ],
        margin: [0, 0, 0, 20] as [number, number, number, number],
      },

      // Invoice title and meta block
      {
        columns: [
          {
            stack: [
              {
                text: 'INVOICE',
                fontSize: 24,
                bold: true,
                color: COLORS.charcoal,
                margin: [0, 0, 0, 4] as [number, number, number, number],
              },
              {
                text: invoice.invoice_no,
                fontSize: 11,
                color: COLORS.mutedGray,
                letterSpacing: 0.5,
              },
            ],
            width: '55%',
          },
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'ISSUE DATE',
                        fontSize: 7,
                        bold: true,
                        color: COLORS.mutedGray,
                        textCase: 'uppercase' as const,
                        letterSpacing: 0.5,
                        margin: [0, 0, 0, 3] as [number, number, number, number],
                      },
                      {
                        text: formatDate(invoice.issue_date),
                        fontSize: 10,
                        color: COLORS.charcoal,
                      },
                    ],
                    margin: [10, 8, 10, 8] as [number, number, number, number],
                  },
                ],
                [
                  {
                    stack: [
                      {
                        text: 'DUE DATE',
                        fontSize: 7,
                        bold: true,
                        color: COLORS.mutedGray,
                        textCase: 'uppercase' as const,
                        letterSpacing: 0.5,
                        margin: [0, 0, 0, 3] as [number, number, number, number],
                      },
                      {
                        text: invoice.due_date ? formatDate(invoice.due_date) : '—',
                        fontSize: 10,
                        color: COLORS.charcoal,
                      },
                    ],
                    margin: [10, 8, 10, 8] as [number, number, number, number],
                  },
                ],
                [
                  {
                    stack: [
                      {
                        text: 'STATUS',
                        fontSize: 7,
                        bold: true,
                        color: COLORS.mutedGray,
                        textCase: 'uppercase' as const,
                        letterSpacing: 0.5,
                        margin: [0, 0, 0, 3] as [number, number, number, number],
                      },
                      {
                        text: statusLabel,
                        fontSize: 10,
                        bold: true,
                        color: getStatusColor(invoice.status),
                      },
                    ],
                    margin: [10, 8, 10, 8] as [number, number, number, number],
                  },
                ],
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
            fillColor: getStatusBg(invoice.status),
            width: '45%',
          },
        ],
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Bill-To section with aligned labels
      {
        stack: [
          {
            text: 'BILL TO',
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
                  { text: 'Student:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                  { text: invoice.students?.name || '', fontSize: 10, color: COLORS.charcoal },
                ],
                ...(invoice.students?.parent_name
                  ? [
                      [
                        { text: 'Parent/Guardian:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                        { text: invoice.students.parent_name, fontSize: 10, color: COLORS.charcoal },
                      ],
                    ]
                  : []),
                ...(invoice.students?.parent_phone
                  ? [
                      [
                        { text: 'Phone:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                        { text: invoice.students.parent_phone, fontSize: 10, color: COLORS.charcoal },
                      ],
                    ]
                  : []),
                ...(invoice.students?.address
                  ? [
                      [
                        { text: 'Address:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                        { text: invoice.students.address, fontSize: 10, color: COLORS.charcoal },
                      ],
                    ]
                  : []),
                ...(invoice.term_label
                  ? [
                      [
                        { text: 'Term:', fontSize: 8, bold: true, color: COLORS.mutedGray },
                        { text: invoice.term_label, fontSize: 10, color: COLORS.charcoal },
                      ],
                    ]
                  : []),
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
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Line items table
      {
        table: {
          widths: ['*', 120],
          headerRows: 1,
          body: [
            // Header row with accent background
            [
              {
                text: 'DESCRIPTION',
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
            // Line items (filtered)
            ...validLineItems.map((item) => [
              {
                text: item.description,
                fontSize: 10,
                color: COLORS.charcoal,
              },
              {
                text: `RM ${formatCurrency(item.amount)}`,
                fontSize: 10,
                color: COLORS.charcoal,
                alignment: 'right' as const,
              },
            ]),
            // Subtotal row (show if there's a discount)
            ...(invoice.discount && invoice.discount > 0
              ? [
                  [
                    {
                      text: 'Subtotal',
                      fontSize: 10,
                      color: COLORS.charcoal,
                    },
                    {
                      text: `RM ${formatCurrency(subtotal)}`,
                      fontSize: 10,
                      color: COLORS.charcoal,
                      alignment: 'right' as const,
                    },
                  ],
                ]
              : []),
            // Discount row (show if discount > 0)
            ...(invoice.discount && invoice.discount > 0
              ? [
                  [
                    {
                      text: 'Discount',
                      fontSize: 10,
                      color: COLORS.charcoal,
                    },
                    {
                      text: `-RM ${formatCurrency(invoice.discount)}`,
                      fontSize: 10,
                      color: COLORS.charcoal,
                      alignment: 'right' as const,
                    },
                  ],
                ]
              : []),
            // Total row
            [
              {
                text: 'TOTAL',
                fontSize: 11,
                bold: true,
                color: '#ffffff',
              },
              {
                text: `RM ${formatCurrency(Math.max(0, subtotal - (invoice.discount || 0)))}`,
                fontSize: 11,
                bold: true,
                color: '#ffffff',
                alignment: 'right' as const,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: (i: number) => {
            const hasDiscount = invoice.discount && invoice.discount > 0
            const totalRowIndex = 1 + validLineItems.length + (hasDiscount ? 2 : 0)
            return i === 1 || i === totalRowIndex ? 0 : 0.5
          },
          hLineColor: (i: number) => {
            const hasDiscount = invoice.discount && invoice.discount > 0
            const totalRowIndex = 1 + validLineItems.length + (hasDiscount ? 2 : 0)
            return i === 0 || i === totalRowIndex ? COLORS.accent : COLORS.lightGray
          },
          vLineWidth: () => 0,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 10,
          paddingBottom: () => 10,
          fillColor: (i: number) => {
            const hasDiscount = invoice.discount && invoice.discount > 0
            const totalRowIndex = 1 + validLineItems.length + (hasDiscount ? 2 : 0)
            return i === 0 || i === totalRowIndex ? COLORS.accent : i % 2 === 1 ? COLORS.bgGray : '#ffffff'
          },
        },
        margin: [0, 0, 0, 24] as [number, number, number, number],
      },

      // Payment details section
      invoice.notes || BANK_DETAILS.bank
        ? {
            stack: [
              {
                text: 'PAYMENT & NOTES',
                fontSize: 8,
                bold: true,
                color: COLORS.mutedGray,
                textCase: 'uppercase' as const,
                letterSpacing: 1,
                margin: [0, 0, 0, 8] as [number, number, number, number],
              },
              {
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: [
                          BANK_DETAILS.bank
                            ? {
                                stack: [
                                  {
                                    text: 'Bank Account',
                                    fontSize: 8,
                                    bold: true,
                                    color: COLORS.mutedGray,
                                    margin: [0, 0, 0, 3] as [number, number, number, number],
                                  },
                                  {
                                    text: BANK_DETAILS.bank,
                                    fontSize: 10,
                                    color: COLORS.charcoal,
                                    margin: [0, 0, 0, 2] as [number, number, number, number],
                                  },
                                  {
                                    text: BANK_DETAILS.accountName,
                                    fontSize: 10,
                                    color: COLORS.charcoal,
                                    margin: [0, 0, 0, 2] as [number, number, number, number],
                                  },
                                  {
                                    text: `Acc: ${BANK_DETAILS.accountNo}`,
                                    fontSize: 10,
                                    color: COLORS.charcoal,
                                    margin: [0, 0, 0, 8] as [number, number, number, number],
                                  },
                                ],
                              }
                            : { text: '', fontSize: 1 },
                          invoice.notes
                            ? {
                                stack: [
                                  {
                                    text: 'Notes',
                                    fontSize: 8,
                                    bold: true,
                                    color: COLORS.mutedGray,
                                    margin: [0, 0, 0, 3] as [number, number, number, number],
                                  },
                                  {
                                    text: invoice.notes,
                                    fontSize: 10,
                                    color: COLORS.warmGray,
                                  },
                                ],
                              }
                            : { text: '', fontSize: 1 },
                        ],
                        border: [1, 1, 1, 1],
                        borderColor: COLORS.lightGray,
                        margin: [12, 12, 12, 12] as [number, number, number, number],
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                },
              },
            ],
            margin: [0, 0, 0, 24] as [number, number, number, number],
          }
        : { text: '', fontSize: 1 },

      // Footer
      ...buildFooter([
        'Thank you for your business. Please retain this invoice for your records.',
        'This is a computer-generated document. No signature required.',
      ]),
    ],
    styles: pdfStyles,
    defaultStyle: { fontSize: 10, color: COLORS.charcoal },
  }

  const pdf = pdfMake.createPdf(docDefinition as unknown as Parameters<typeof pdfMake.createPdf>[0])
  pdf.download(`invoice-${invoice.invoice_no}.pdf`)
}
