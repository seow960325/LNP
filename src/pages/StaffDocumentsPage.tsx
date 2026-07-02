import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fetchStaffDirectory } from '../lib/profileApi'
import type { StaffDirectoryEntry } from '../lib/profileApi'
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
  const [uploadError, setUploadError] = useState<string | null>(null)

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
    setUploadError(null)
    await onUpload({ docType, year, month: docType === 'payslip' ? month : null, file })
    setUploading(false)
    setFile(null)
    setValidationError(null)
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card-md">
      <p className="font-display text-sm text-neutral-700">Upload a document</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">Type</label>
          <select
            value={docType}
            onChange={(event) => setDocType(event.target.value as StaffDocType)}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          >
            <option value="payslip">Payslip</option>
            <option value="ea">EA Form</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500">Year</label>
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      {docType === 'payslip' && (
        <div>
          <label className="text-xs text-neutral-500">Month</label>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            disabled={uploading}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
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
        <label className="text-xs text-neutral-500">PDF file (max 5MB)</label>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="mt-1 w-full text-sm disabled:opacity-60"
        />
      </div>

      {validationError && <ErrorState message={validationError} />}
      {uploadError && <ErrorState message={uploadError} />}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={uploading || !file || Boolean(validationError)}
        className="min-h-tap w-full rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  )
}

export function StaffDocumentsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [staffList, setStaffList] = useState<StaffDirectoryEntry[]>([])
  const [staffListError, setStaffListError] = useState<string | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)

  const [docsState, setDocsState] = useState<LoadState>('loading')
  const [docsError, setDocsError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<StaffDocumentRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [viewError, setViewError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<StaffDocumentRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) setSelectedOwnerId(profile.id)
  }, [profile])

  useEffect(() => {
    if (!profile || !isAdmin) return
    let cancelled = false

    fetchStaffDirectory(profile.center_id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setStaffListError('Could not load the staff list.')
        return
      }
      setStaffList(data)
    })

    return () => {
      cancelled = true
    }
  }, [profile, isAdmin])

  useEffect(() => {
    if (!selectedOwnerId) return
    let cancelled = false
    setDocsState('loading')

    fetchStaffDocuments(selectedOwnerId).then(({ data, error }) => {
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
  }, [selectedOwnerId, refreshKey])

  if (!profile || !selectedOwnerId) return null

  async function handleView(doc: StaffDocumentRow) {
    setViewError(null)
    const { data, error } = await createStaffDocSignedUrl(doc.storage_path)
    if (error || !data) {
      setViewError('Could not open this document. Please try again.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleUpload(params: { docType: StaffDocType; year: number; month: number | null; file: File }) {
    if (!profile || !selectedOwnerId) return
    setUploadError(null)

    const { error } = await uploadStaffDocument({
      ownerId: selectedOwnerId,
      uploadedBy: profile.id,
      centerId: profile.center_id,
      docType: params.docType,
      year: params.year,
      month: params.month,
      file: params.file,
    })

    if (error) {
      setUploadError(error.message || 'Could not upload the document. Please try again.')
      return
    }

    setRefreshKey((k) => k + 1)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    const { error } = await deleteStaffDocument(deleteTarget)

    setDeleting(false)
    if (error) {
      setDeleteError(error.message || 'Could not delete this document. Please try again.')
      return
    }

    setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const selectedStaffMember = staffList.find((member) => member.id === selectedOwnerId)

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Documents</h1>
        </div>

        {isAdmin && (
          <div className="space-y-2 rounded-2xl bg-white p-4 shadow-card">
            <label className="text-xs text-neutral-500">Viewing documents for</label>
            {staffListError ? (
              <ErrorState message={staffListError} />
            ) : (
              <select
                value={selectedOwnerId}
                onChange={(event) => setSelectedOwnerId(event.target.value)}
                className="min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm"
              >
                <option value={profile.id}>Me ({profile.full_name})</option>
                {staffList
                  .filter((member) => member.id !== profile.id)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
              </select>
            )}
            {selectedStaffMember && (
              <div className="flex items-center gap-2 pt-1">
                <Avatar fullName={selectedStaffMember.full_name} avatarUrl={selectedStaffMember.avatar_url} size="sm" />
                <span className="text-sm text-neutral-600">{selectedStaffMember.full_name}</span>
              </div>
            )}
          </div>
        )}

        {isAdmin && <UploadForm onUpload={handleUpload} />}
        {uploadError && <ErrorState message={uploadError} />}
        {viewError && <ErrorState message={viewError} />}

        {docsState === 'loading' && <LoadingState label="Loading documents…" />}
        {docsState === 'error' && <ErrorState message={docsError ?? 'Something went wrong.'} />}

        {docsState === 'ready' && documents.length === 0 && (
          <EmptyState message="No documents yet." />
        )}

        {docsState === 'ready' && documents.length > 0 && (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm text-neutral-800">
                    {DOC_TYPE_LABELS[doc.doc_type]} — {docLabel(doc)}
                  </p>
                  <p className="truncate text-xs text-neutral-400">{doc.file_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleView(doc)}
                  className="min-h-tap shrink-0 rounded-2xl border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  View
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(doc)}
                    className="min-h-tap shrink-0 rounded-2xl border border-coral-200 px-3 text-sm text-coral-600 hover:bg-coral-50"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {deleteError && <ErrorState message={deleteError} />}
      </div>

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
