import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  fetchStaffDocuments,
  createStaffDocSignedUrl,
  uploadStaffDocument,
  deleteStaffDocument,
  validateStaffDocFile,
} from '../lib/staffDocsApi'
import type { StaffDocumentRow, StaffDocType } from '../lib/staffDocsApi'

const DOC_TYPE_LABELS: Record<StaffDocType, string> = {
  ea: 'EA Form',
  payslip: 'Payslip',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function docLabel(doc: StaffDocumentRow): string {
  if (doc.doc_type === 'payslip' && doc.month) {
    return `${MONTH_NAMES[doc.month - 1]} ${doc.year}`
  }
  return `${doc.year}`
}

type LoadState = 'loading' | 'ready' | 'error'

function UploadForm({
  onUpload,
}: {
  onUpload: (params: { docType: StaffDocType; year: number; month: number | null; file: File }) => Promise<void>
}) {
  const currentYear = new Date().getFullYear()
  const [docType, setDocType] = useState<StaffDocType>('payslip')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null
    setFile(chosen)
    setValidationError(chosen ? validateStaffDocFile(chosen) : null)
  }

  async function handleSubmit() {
    if (!file) return
    const fileError = validateStaffDocFile(file)
    if (fileError) {
      setValidationError(fileError)
      return
    }

    setUploading(true)
    await onUpload({ docType, year, month: docType === 'payslip' ? month : null, file })
    setUploading(false)
    setFile(null)
    setValidationError(null)
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-card-md">
      <p className="font-semibold text-sm text-ink">Upload a document</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Type</label>
          <select
            value={docType}
            onChange={(event) => setDocType(event.target.value as StaffDocType)}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="payslip">Payslip</option>
            <option value="ea">EA Form</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Year</label>
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      {docType === 'payslip' && (
        <div>
          <label className="text-xs text-muted">Month</label>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-muted">PDF file (max 5MB)</label>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="mt-1 w-full text-sm disabled:opacity-60"
        />
      </div>

      {validationError && <ErrorState message={validationError} />}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={uploading || !file || Boolean(validationError)}
        className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  )
}

// Shared document list + upload + delete UI for a single owner's staff docs.
// Used both by the self-service /documents page (canManage=false) and the
// staff detail page for admins (canManage=true). effectiveCanManage is
// recomputed from the *current viewer's* role rather than trusting the
// canManage prop outright, so a caller passing canManage=true by mistake
// can never expose upload/delete controls to a non-admin.
export function StaffDocPanel({ ownerId, canManage }: { ownerId: string; canManage: boolean }) {
  const { profile } = useAuth()
  const effectiveCanManage = canManage && (profile?.role === 'admin' || profile?.role === 'super_admin')

  const [docsState, setDocsState] = useState<LoadState>('loading')
  const [docsError, setDocsError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<StaffDocumentRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [deleteTarget, setDeleteTarget] = useState<StaffDocumentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDocsState('loading')

    fetchStaffDocuments(ownerId).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setDocsError('Could not load documents. Please try again.')
        setDocsState('error')
        return
      }
      setDocuments(data)
      setDocsState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [ownerId, refreshKey])

  async function handleView(doc: StaffDocumentRow) {
    const { data, error } = await createStaffDocSignedUrl(doc.storage_path)
    if (error || !data) {
      toast.error('Could not open this document. Please try again.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleUpload(params: { docType: StaffDocType; year: number; month: number | null; file: File }) {
    if (!profile) return

    const { error } = await uploadStaffDocument({
      ownerId,
      uploadedBy: profile.id,
      centerId: profile.center_id,
      docType: params.docType,
      year: params.year,
      month: params.month,
      file: params.file,
    })

    if (error) {
      toast.error(error.message || 'Could not upload the document. Please try again.')
      return
    }

    setRefreshKey((k) => k + 1)
    toast.success('Document uploaded')
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await deleteStaffDocument(deleteTarget)

    setDeleting(false)
    if (error) {
      toast.error(error.message || 'Could not delete this document. Please try again.')
      return
    }

    setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Document deleted')
  }

  return (
    <div className="space-y-4">
      {effectiveCanManage && <UploadForm onUpload={handleUpload} />}

      {docsState === 'loading' && <LoadingState label="Loading documents…" />}
      {docsState === 'error' && <ErrorState message={docsError ?? 'Something went wrong.'} />}

      {docsState === 'ready' && documents.length === 0 && (
        <EmptyState message="No documents yet." />
      )}

      {docsState === 'ready' && documents.length > 0 && (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-ink">
                  {DOC_TYPE_LABELS[doc.doc_type]} — {docLabel(doc)}
                </p>
                <p className="truncate text-xs text-muted/70">{doc.file_name}</p>
              </div>
              <button
                type="button"
                onClick={() => handleView(doc)}
                className="min-h-tap shrink-0 rounded-xl border border-line px-3 text-sm text-muted hover:bg-cream"
              >
                View
              </button>
              {effectiveCanManage && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(doc)}
                  className="min-h-tap shrink-0 rounded-xl border border-danger/20 px-3 text-sm text-danger hover:bg-danger/10"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this document?"
        message="This permanently deletes this document from storage. This cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
