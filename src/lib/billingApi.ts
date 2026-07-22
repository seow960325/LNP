import { supabase } from './supabaseClient'
import { extractStoragePath } from './helpers'

export interface FeePackage {
  id: string
  center_id: string
  name: string
  default_price: number
  description: string | null
  active: boolean
  created_at: string
}

export interface Student {
  id: string
  center_id: string
  name: string
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  package_id: string | null
  enrolled_at: string | null
  dob: string | null
  address: string | null
  notes: string | null
  active: boolean
  photo_url: string | null
  class_id: string | null
  zoho_contact_id: string | null
  created_at: string
}

export interface StudentWithPackage extends Student {
  fee_packages?: FeePackage | null
}

const PACKAGE_COLUMNS = 'id, center_id, name, default_price, description, active, created_at'
const STUDENT_COLUMNS = 'id, center_id, name, parent_name, parent_phone, parent_email, package_id, enrolled_at, dob, address, notes, active, photo_url, class_id, zoho_contact_id, created_at'

// Fixed path per student (no extension, contentType carries the real MIME
// type) so re-uploading always overwrites the same object via upsert,
// instead of leaving old files orphaned in the bucket under a different
// extension. Mirrors uploadAvatar in profileApi.ts.
export async function uploadStudentPhoto(studentId: string, file: File) {
  const path = `${studentId}/photo`
  const { error: uploadError } = await supabase.storage
    .from('student-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { signedUrl: null, error: uploadError }

  const { data, error } = await supabase.storage.from('student-photos').createSignedUrl(path, 3600)
  if (error) return { signedUrl: null, error }
  return { signedUrl: data?.signedUrl ?? null, error: null }
}

// student-photos is a private bucket — the `photo_url` column on `students`
// holds whatever URL (public or signed) was current at write time, which may
// now be stale or expired. Re-derive the storage path from it and mint a
// fresh signed URL for display.
export async function getStudentPhotoSignedUrl(storedUrl: string | null): Promise<string | null> {
  if (!storedUrl) return null
  const path = extractStoragePath(storedUrl, 'student-photos') ?? storedUrl
  const { data, error } = await supabase.storage.from('student-photos').createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export function fetchFeePackages(centerId: string) {
  return supabase
    .from('fee_packages')
    .select(PACKAGE_COLUMNS)
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .returns<FeePackage[]>()
}

export function fetchActiveFeePackages(centerId: string) {
  return supabase
    .from('fee_packages')
    .select(PACKAGE_COLUMNS)
    .eq('center_id', centerId)
    .eq('active', true)
    .order('name', { ascending: true })
    .returns<FeePackage[]>()
}

export interface CreateFeePackagePayload {
  name: string
  default_price: number
  description?: string
}

export function createFeePackage(centerId: string, payload: CreateFeePackagePayload) {
  return supabase.from('fee_packages').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateFeePackagePatch {
  name?: string
  default_price?: number
  description?: string
  active?: boolean
}

export function updateFeePackage(id: string, patch: UpdateFeePackagePatch) {
  return supabase.from('fee_packages').update(patch).eq('id', id)
}

export function toggleFeePackageActive(id: string, active: boolean) {
  return supabase.from('fee_packages').update({ active }).eq('id', id)
}

export function fetchStudents(centerId: string) {
  return supabase
    .from('students')
    .select(`${STUDENT_COLUMNS}, fee_packages!left(${PACKAGE_COLUMNS})`)
    .eq('center_id', centerId)
    .order('name', { ascending: true })
    .returns<StudentWithPackage[]>()
}

// maybeSingle, not single: a bad/deleted id should read as "not found", not
// throw — the caller (StudentDetailPage) treats a null row as a load error.
export async function fetchStudentById(id: string) {
  const { data, error } = await supabase
    .from('students')
    .select(`${STUDENT_COLUMNS}, fee_packages!left(${PACKAGE_COLUMNS})`)
    .eq('id', id)
    .maybeSingle()
  return { data: data as StudentWithPackage | null, error }
}

export interface CreateStudentPayload {
  name: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  package_id?: string
  enrolled_at?: string
  dob?: string
  address?: string
  notes?: string
  photo_url?: string | null
  class_id?: string | null
}

export function createStudent(centerId: string, payload: CreateStudentPayload) {
  return supabase.from('students').insert({
    center_id: centerId,
    ...payload,
  })
}

export interface UpdateStudentPatch {
  name?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  package_id?: string
  enrolled_at?: string
  dob?: string
  address?: string
  notes?: string
  active?: boolean
  photo_url?: string | null
  class_id?: string | null
}

export function updateStudent(id: string, patch: UpdateStudentPatch) {
  return supabase.from('students').update(patch).eq('id', id)
}

export function toggleStudentActive(id: string, active: boolean) {
  return supabase.from('students').update({ active }).eq('id', id)
}

export function deleteFeePackage(id: string) {
  return supabase.from('fee_packages').delete().eq('id', id)
}

export function deleteStudent(id: string) {
  return supabase.from('students').delete().eq('id', id)
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  description: string
  amount: number
  sort_order: number
}

export interface Invoice {
  id: string
  center_id: string
  student_id: string
  invoice_no: string
  term_label: string | null
  issue_date: string
  due_date: string | null
  subtotal: number
  discount: number
  status: 'draft' | 'sent' | 'paid' | 'void'
  paid_at: string | null
  payment_method: string | null
  receipt_path: string | null
  notes: string | null
  created_at: string
}

export interface InvoiceSettings {
  id: string
  center_id: string
  prefix: string
  include_year: boolean
  include_month: boolean
  separator: string
  seq_padding: number
  next_seq: number
  created_at: string
}

export interface InvoiceWithDetails extends Invoice {
  students?: Student | null
  invoice_line_items?: InvoiceLineItem[]
}

const INVOICE_COLUMNS = 'id, center_id, student_id, invoice_no, term_label, issue_date, due_date, subtotal, discount, status, paid_at, payment_method, receipt_path, notes, created_at'

export function fetchInvoices(centerId: string, status?: string) {
  let query = supabase
    .from('invoices')
    .select(`${INVOICE_COLUMNS}, students!inner(${STUDENT_COLUMNS})`)
    .eq('center_id', centerId)

  if (status) {
    query = query.eq('status', status)
  }

  return query.order('created_at', { ascending: false }).returns<InvoiceWithDetails[]>()
}

export async function fetchInvoice(id: string) {
  const result = await supabase
    .from('invoices')
    .select(`${INVOICE_COLUMNS}, students!inner(${STUDENT_COLUMNS}), invoice_line_items(id, invoice_id, description, amount, sort_order)`)
    .eq('id', id)
    .single()

  return result as { data: InvoiceWithDetails | null; error: unknown }
}

export interface CreateInvoiceLineItemPayload {
  description: string
  amount: number
  sort_order: number
}

export interface CreateInvoicePayload {
  student_id: string
  term_label?: string
  issue_date: string
  due_date?: string
  discount?: number
  notes?: string
  line_items: CreateInvoiceLineItemPayload[]
}

// Atomic server-side write (Postgres function, one transaction) — see
// supabase/migrations/20260708090000_invoice_write_rpcs.sql. Fixes AUDIT_PHASE2
// H4: the invoice insert, line-item insert, and subtotal update used to be
// three independent client-side calls, so a failure after the invoice insert
// left an orphaned $0 draft with no line items. A failed RPC call rolls back
// everything — no invoice row is created at all.
export async function createInvoice(centerId: string, payload: CreateInvoicePayload) {
  const { line_items, ...invoiceData } = payload

  const result = await supabase.rpc('create_invoice_with_lines', {
    p_center_id: centerId,
    p_student_id: invoiceData.student_id,
    p_term_label: invoiceData.term_label ?? null,
    p_issue_date: invoiceData.issue_date,
    p_due_date: invoiceData.due_date ?? null,
    p_discount: invoiceData.discount ?? 0,
    p_notes: invoiceData.notes ?? null,
    p_line_items: line_items,
  })

  return result as { data: Invoice | null; error: unknown }
}

export interface UpdateInvoicePatch {
  term_label?: string
  issue_date?: string
  due_date?: string | null
  discount?: number
  notes?: string | null
  status?: 'draft' | 'sent' | 'paid' | 'void'
}

export async function updateInvoice(id: string, patch: UpdateInvoicePatch) {
  const result = await supabase.from('invoices').update(patch).eq('id', id).select().single()
  return result as { data: Invoice | null; error: unknown }
}

// Atomic server-side write (Postgres function, one transaction) — see
// supabase/migrations/20260708090000_invoice_write_rpcs.sql. Fixes AUDIT_PHASE2
// H3: delete-then-insert used to be two independent client-side calls, so a
// failed re-insert permanently deleted every line item with no rollback. A
// failed RPC call rolls back the delete too — nothing is removed.
export async function updateInvoiceLineItems(invoiceId: string, items: CreateInvoiceLineItemPayload[]) {
  const { error } = await supabase.rpc('replace_invoice_lines', {
    p_invoice_id: invoiceId,
    p_lines: items,
  })

  return { error }
}

export async function markInvoicePaid(id: string, paymentMethod: string, receiptFile?: File) {
  let receiptPath: string | null = null

  // Upload receipt if provided
  if (receiptFile) {
    const timestamp = new Date().getTime()
    const fileExt = receiptFile.name.split('.').pop()
    const fileName = `${id}-${timestamp}.${fileExt}`
    const filePath = `invoices/${fileName}`

    const { error: uploadError } = await supabase.storage.from('invoice-receipts').upload(filePath, receiptFile, {
      upsert: false,
    })

    if (uploadError) return { data: null, error: uploadError }
    receiptPath = filePath
  }

  const result = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      receipt_path: receiptPath,
    })
    .eq('id', id)
    .select()
    .single()

  return result as { data: Invoice | null; error: unknown }
}

export async function voidInvoice(id: string) {
  const result = await supabase.from('invoices').update({ status: 'void' }).eq('id', id).select().single()
  return result as { data: Invoice | null; error: unknown }
}

export function deleteInvoice(id: string) {
  return supabase.from('invoices').delete().eq('id', id)
}

// Invoice Settings functions
export function fetchInvoiceSettings(centerId: string) {
  return supabase
    .from('invoice_settings')
    .select('*')
    .eq('center_id', centerId)
    .single()
    .returns<InvoiceSettings>()
}

export interface UpdateInvoiceSettingsPatch {
  prefix?: string
  include_year?: boolean
  include_month?: boolean
  separator?: string
  seq_padding?: number
  next_seq?: number
}

export async function updateInvoiceSettings(centerId: string, patch: UpdateInvoiceSettingsPatch) {
  const result = await supabase
    .from('invoice_settings')
    .update(patch)
    .eq('center_id', centerId)
    .select()
    .single()

  return result as { data: InvoiceSettings | null; error: unknown }
}

// Get signed URL for receipt download
export async function getReceiptSignedUrl(receiptPath: string) {
  if (!receiptPath) return { data: null, error: 'No receipt path' }

  const { data, error } = await supabase.storage.from('invoice-receipts').createSignedUrl(receiptPath, 3600) // 1 hour expiry

  return { data, error }
}
