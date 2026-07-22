import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchStudentById, getStudentPhotoSignedUrl } from '../lib/billingApi'
import type { StudentWithPackage } from '../lib/billingApi'
import {
  fetchActiveRecurringInvoiceForCustomer,
  fetchZohoInvoicesForCustomer,
  fetchZohoInvoicePdf,
} from '../lib/zohoApi'
import type { ZohoRecurringInvoice, ZohoInvoice } from '../lib/zohoApi'
import { formatMYR } from '../lib/zohoFinance'
import { formatDate } from '../lib/helpers'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

// Decodes the base64 PDF the zoho-sync Edge Function returns and opens it as
// a blob URL — this is Zoho's own rendered PDF, nothing is generated
// client-side. Revoked after a minute; the browser tab holds its own copy
// once opened.
function openPdfFromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  // Billing is financial data mirrored from Zoho — RLS on zoho_invoices /
  // zoho_recurring_invoices already restricts SELECT to these three roles
  // (see supabase/migrations/20260721010000_zoho_mirror_rls.sql); gating the
  // block inline too avoids showing a misleading "No recurring billing" /
  // "No invoices" empty state to a role that simply can't see the real rows.
  const canSeeBilling = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'shareholder'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [student, setStudent] = useState<StudentWithPackage | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [billingState, setBillingState] = useState<LoadState>('loading')
  const [recurring, setRecurring] = useState<ZohoRecurringInvoice | null>(null)
  const [invoices, setInvoices] = useState<ZohoInvoice[]>([])
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(fetchStudentById(id))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load this student. Please try again.')
          setLoadState('error')
          return
        }
        setStudent(data)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [id])

  // student-photos is a private bucket — mint a fresh signed URL each load.
  useEffect(() => {
    if (!student?.photo_url) {
      setPhotoUrl(null)
      return
    }
    let cancelled = false
    getStudentPhotoSignedUrl(student.photo_url).then((url) => {
      if (!cancelled) setPhotoUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [student?.photo_url])

  useEffect(() => {
    if (!canSeeBilling || !student) return
    const customerId = student.zoho_contact_id

    // No Zoho contact linked at all — legitimate "not billed via Zoho"
    // state, not worth a round trip to confirm.
    if (!customerId) {
      setRecurring(null)
      setInvoices([])
      setBillingState('ready')
      return
    }

    let cancelled = false
    setBillingState('loading')

    withTimeout(
      Promise.all([fetchActiveRecurringInvoiceForCustomer(customerId), fetchZohoInvoicesForCustomer(customerId)]),
    )
      .then(([recurringRes, invoicesRes]) => {
        if (cancelled) return
        if (recurringRes.error || invoicesRes.error) {
          setBillingState('error')
          return
        }
        setRecurring(recurringRes.data)
        setInvoices(invoicesRes.data)
        setBillingState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setBillingState('error')
      })

    return () => {
      cancelled = true
    }
  }, [canSeeBilling, student])

  async function handleViewPdf(invoiceId: string) {
    setDownloadingId(invoiceId)
    const { data, error } = await fetchZohoInvoicePdf(invoiceId)
    setDownloadingId(null)

    if (error || !data?.pdf_base64) {
      let message = 'Could not load the invoice PDF. Please try again.'
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json()
          if (body?.error) message = body.error
        } catch {
          // Body wasn't JSON — fall back to the generic message.
        }
      }
      toast.error(message)
      return
    }

    openPdfFromBase64(data.pdf_base64)
  }

  if (!profile || !id) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Student" fallback="/students" />

        {loadState === 'loading' && <LoadingState label="Loading…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && student && (
          <>
            <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-card">
              <Avatar fullName={student.name} avatarUrl={photoUrl} size="xl" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-ink">
                  {student.name}
                  {student.zoho_contact_id && (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-2xs font-semibold text-accent-hover">
                      Billed
                    </span>
                  )}
                </h2>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-2xs font-semibold ${
                    student.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                  }`}
                >
                  {student.active ? 'Active' : 'Inactive'}
                </span>
                {student.parent_name && <p className="mt-1 text-sm text-muted">Guardian: {student.parent_name}</p>}
              </div>
            </div>

            {canSeeBilling && (
              <>
                <div className="rounded-xl bg-white p-5 shadow-card">
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Billing schedule</h3>
                  {billingState === 'loading' && <LoadingState label="Loading billing schedule…" />}
                  {billingState === 'error' && (
                    <ErrorState message="Could not load the billing schedule. Please try again." />
                  )}
                  {billingState === 'ready' && !recurring && <p className="text-sm text-muted">No recurring billing</p>}
                  {billingState === 'ready' && recurring && (
                    <div className="space-y-1">
                      <p className="text-sm text-ink">
                        <span className="font-semibold tabular-nums">{formatMYR(recurring.total)}</span>
                        {' · '}
                        {recurring.frequency ?? '—'}
                        {' · next '}
                        {recurring.next_invoice_date ? formatDate(recurring.next_invoice_date) : '—'}
                      </p>
                      <p className="text-xs text-muted">
                        {recurring.end_date ? `Ends ${formatDate(recurring.end_date)}` : 'No end date'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-white p-5 shadow-card">
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Invoice history</h3>
                  {billingState === 'loading' && <LoadingState label="Loading invoices…" />}
                  {billingState === 'error' && (
                    <ErrorState message="Could not load invoice history. Please try again." />
                  )}
                  {billingState === 'ready' && invoices.length === 0 && <p className="text-sm text-muted">No invoices</p>}
                  {billingState === 'ready' && invoices.length > 0 && (
                    <ul className="divide-y divide-line">
                      {invoices.map((inv) => (
                        <li key={inv.invoice_id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink">{inv.invoice_number ?? inv.invoice_id}</p>
                            <p className="text-xs text-muted">
                              {inv.date ? formatDate(inv.date) : '—'} ·{' '}
                              <span className="capitalize">{inv.status ?? '—'}</span>
                            </p>
                          </div>
                          <span className="tabular-nums text-sm text-ink">{formatMYR(inv.total)}</span>
                          <button
                            type="button"
                            onClick={() => handleViewPdf(inv.invoice_id)}
                            disabled={downloadingId === inv.invoice_id}
                            className="min-h-tap shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-muted hover:bg-cream disabled:opacity-60"
                          >
                            {downloadingId === inv.invoice_id ? 'Loading…' : 'View PDF'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
