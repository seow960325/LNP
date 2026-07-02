import { supabase } from './supabaseClient'

export const MAX_DOC_BYTES = 5 * 1024 * 1024

export type StaffDocType = 'ea' | 'payslip'

export interface StaffDocumentRow {
  id: string
  owner_id: string
  doc_type: StaffDocType
  year: number
  month: number | null
  file_name: string
  storage_path: string
  uploaded_by: string | null
  center_id: string
  created_at: string
}

export function validateStaffDocFile(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return 'Please choose a PDF file.'
  }
  if (file.size > MAX_DOC_BYTES) {
    return 'File must be smaller than 5MB.'
  }
  return null
}

export function fetchStaffDocuments(ownerId: string) {
  return supabase
    .from('staff_documents')
    .select('id, owner_id, doc_type, year, month, file_name, storage_path, uploaded_by, center_id, created_at')
    .eq('owner_id', ownerId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .returns<StaffDocumentRow[]>()
}

// Bucket is private — a signed URL (short-lived) is the only supported way
// to view/download a file. NEVER use getPublicUrl for staff-docs: it won't
// work against a private bucket and would bypass the RLS-gated signing step.
export function createStaffDocSignedUrl(storagePath: string) {
  return supabase.storage.from('staff-docs').createSignedUrl(storagePath, 60)
}

export interface UploadStaffDocParams {
  ownerId: string
  uploadedBy: string
  centerId: string
  docType: StaffDocType
  year: number
  month: number | null
  file: File
}

// Object path's first segment MUST be the owner's id (not the uploader's) —
// the storage read policy checks foldername(name)[1] === auth.uid(), so
// getting this wrong would lock the owner out of their own document.
export async function uploadStaffDocument({
  ownerId,
  uploadedBy,
  centerId,
  docType,
  year,
  month,
  file,
}: UploadStaffDocParams) {
  const monthSuffix = month ? `-${String(month).padStart(2, '0')}` : ''
  const storagePath = `${ownerId}/${docType}-${year}${monthSuffix}-${Date.now()}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('staff-docs')
    .upload(storagePath, file, { contentType: 'application/pdf' })

  if (uploadError) {
    return { error: uploadError }
  }

  const { error: insertError } = await supabase.from('staff_documents').insert({
    owner_id: ownerId,
    doc_type: docType,
    year,
    month,
    file_name: file.name,
    storage_path: storagePath,
    uploaded_by: uploadedBy,
    center_id: centerId,
  })

  if (insertError) {
    // Best-effort cleanup so a failed metadata insert doesn't orphan the object.
    await supabase.storage.from('staff-docs').remove([storagePath])
    return { error: insertError }
  }

  return { error: null }
}

export async function deleteStaffDocument(doc: StaffDocumentRow) {
  const { error: storageError } = await supabase.storage.from('staff-docs').remove([doc.storage_path])
  if (storageError) {
    return { error: storageError }
  }

  const { error: rowError } = await supabase.from('staff_documents').delete().eq('id', doc.id)
  return { error: rowError }
}
