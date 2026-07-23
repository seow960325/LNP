// Decodes the base64 PDF the zoho-sync Edge Function returns and opens it as
// a blob URL — this is Zoho's own rendered PDF, nothing is generated
// client-side. Revoked after a minute; the browser tab holds its own copy
// once opened. Shared by every screen that opens a Zoho invoice PDF
// (StudentDetailPage, InvoicesPage) so there's one implementation to trust.
export function openPdfFromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
