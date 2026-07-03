import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import logoAsset from '../assets/LNP-Logo.png'

const fontsModule = pdfFonts as unknown as {
  vfs?: Record<string, string>
  default?: Record<string, string>
}
const vfs = fontsModule.vfs ?? fontsModule.default ?? (pdfFonts as unknown as Record<string, string>)
pdfMake.addVirtualFileSystem(vfs)

// Brand constants
export const COMPANY_NAME = 'Learn N Play Sdn. Bhd.'
export const COMPANY_REG = '202301024960 / 1518883-X'
export const COMPANY_ADDRESS = '1, Jalan Rimbunan Melati 1, Laman Rimbunan, 52100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur'
export const COMPANY_TEL = 'Tel: 011-6068 1029'
export const LOGO_PATH = '/LNP-Logo.png'

// Brand color palette
export const COLORS = {
  accent: '#D97706',
  charcoal: '#1a1a1a',
  warmGray: '#666666',
  lightGray: '#e5e7eb',
  mutedGray: '#9ca3af',
  bgGray: '#f9fafb',
}

// Logo helper: converts URL to base64 data URL for pdfmake
let logoDataUrl: string | null = null
export async function getLogoDataUrl(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl
  try {
    const response = await fetch(logoAsset)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        logoDataUrl = reader.result as string
        resolve(logoDataUrl)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Formatting utilities
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Style definitions used in both PDFs
export const pdfStyles = {
  companyName: { fontSize: 13, bold: true, color: COLORS.charcoal, lineHeight: 1.2 },
  companyMeta: { fontSize: 7.5, color: COLORS.mutedGray },
  companyAddr: { fontSize: 7.5, color: COLORS.warmGray, lineHeight: 1.3 },
  companyTel: { fontSize: 7.5, color: COLORS.warmGray },
  docTitle: { fontSize: 28, bold: true, color: COLORS.charcoal, lineHeight: 1 },
  docSubtitle: { fontSize: 9, color: COLORS.warmGray },
  metaLabel: { fontSize: 7, bold: true, color: COLORS.mutedGray, textCase: 'uppercase' as const, letterSpacing: 0.5 },
  metaValue: { fontSize: 10, color: COLORS.charcoal },
  sectionLabel: { fontSize: 8, bold: true, color: COLORS.mutedGray, textCase: 'uppercase' as const, letterSpacing: 1 },
  tableHeader: { fontSize: 8, bold: true, color: COLORS.mutedGray, textCase: 'uppercase' as const, letterSpacing: 0.5 },
  footer: { fontSize: 7.5, color: COLORS.mutedGray, alignment: 'center' as const, lineHeight: 1.4 },
}

// Company header block builder
export function buildCompanyHeader(logoDataUrl?: string) {
  const textBlock = {
    stack: [
      { text: COMPANY_NAME, style: 'companyName' },
      { text: COMPANY_REG, style: 'companyMeta', margin: [0, 3, 0, 0] as [number, number, number, number] },
      { text: COMPANY_ADDRESS, style: 'companyAddr', margin: [0, 8, 0, 0] as [number, number, number, number] },
      { text: COMPANY_TEL, style: 'companyTel', margin: [0, 3, 0, 0] as [number, number, number, number] },
    ],
  }

  if (!logoDataUrl) return textBlock

  return {
    columns: [
      {
        width: 88,
        image: logoDataUrl,
        margin: [0, 6, 0, 0] as [number, number, number, number],
      },
      { width: 36, text: '' },
      {
        ...textBlock,
        width: '*',
        margin: [0, 2, 0, 0] as [number, number, number, number],
      },
    ],
    columnGap: 0,
  }
}

// Accent line builder (spans full content width)
export function buildAccentLine(bottomMargin: number = 20, contentWidth: number = 515) {
  return {
    canvas: [
      {
        type: 'line' as const,
        x1: 0,
        y1: 0,
        x2: contentWidth,
        y2: 0,
        lineWidth: 1,
        stroke: COLORS.accent,
      },
    ],
    margin: [0, 0, 0, bottomMargin] as [number, number, number, number],
  }
}

// Footer builder
export function buildFooter(lines: string[]) {
  return lines.map((line) => ({
    text: line,
    style: 'footer',
    margin: [0, 6, 0, 0] as [number, number, number, number],
  }))
}
