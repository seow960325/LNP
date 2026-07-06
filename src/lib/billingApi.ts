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
  created_at: string
}

export interface StudentWithPackage extends Student {
  fee_packages?: FeePackage | null
}

const PACKAGE_COLUMNS = 'id, center_id, name, default_price, description, active, created_at'
const STUDENT_COLUMNS = 'id, center_id, name, parent_name, parent_phone, parent_email, package_id, enrolled_at, dob, address, notes, active, photo_url, class_id, created_at'

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
    .order('created_at', { ascending: false })
    .returns<StudentWithPackage[]>()
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

export async function createInvoice(centerId: string, payload: CreateInvoicePayload) {
  const { line_items, ...invoiceData } = payload

  const { data: invoiceData_, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      center_id: centerId,
      ...invoiceData,
      status: 'draft',
    })
    .select()
    .single()

  if (invoiceError || !invoiceData_) return { data: null, error: invoiceError }

  const lineItemsToInsert = line_items.map((item) => ({
    invoice_id: invoiceData_.id,
    ...item,
  }))

  const { error: lineItemsError } = await supabase.from('invoice_line_items').insert(lineItemsToInsert)

  if (lineItemsError) {
    return { data: null, error: lineItemsError }
  }

  const subtotal = line_items.reduce((sum, item) => sum + item.amount, 0)

  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({ subtotal })
    .eq('id', invoiceData_.id)
    .select()
    .single()

  if (updateError || !updatedInvoice) return { data: null, error: updateError }

  return { data: updatedInvoice as Invoice, error: null }
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

export async function updateInvoiceLineItems(invoiceId: string, items: CreateInvoiceLineItemPayload[]) {
  const { error: deleteError } = await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)

  if (deleteError) return { error: deleteError }

  const lineItemsToInsert = items.map((item) => ({
    invoice_id: invoiceId,
    ...item,
  }))

  const { error: insertError } = await supabase.from('invoice_line_items').insert(lineItemsToInsert)

  if (insertError) return { error: insertError }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)

  const { error: updateError } = await supabase.from('invoices').update({ subtotal }).eq('id', invoiceId)

  return { error: updateError }
}

export async function markInvoicePaid(id: string, paymentMethod: string, receiptFile?: File) {
  let receiptPath: string | null = null

  // Upload receipt if provided
  if (receiptFile) {
    const timestamp = new Date().getTime()
    const fileExt = receiptFile.name.split('.').pop()
    const fileName = `${id}-${timestamp}.${fileExt}`
    const filePath = `invoices/${fileName}`

    const { error: uploadError } = await supabase.storage.from('private-docs').upload(filePath, receiptFile, {
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

  const { data, error } = await supabase.storage.from('private-docs').createSignedUrl(receiptPath, 3600) // 1 hour expiry

  return { data, error }
}
