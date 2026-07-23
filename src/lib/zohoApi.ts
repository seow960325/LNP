import { supabase } from './supabaseClient'

// Read-only mirror of Zoho Books, synced one-way by the zoho-sync Edge
// Function. RLS on every zoho_* table gates SELECT to
// shareholder/admin/super_admin (zoho_contacts is admin/super_admin only —
// shareholders get contacts/AR only via the shareholder_family_ar_summary()
// RPC below, never row-level access).

export interface ZohoInvoice {
  invoice_id: string
  invoice_number: string | null
  customer_id: string | null
  customer_name: string | null
  date: string | null
  total: number
  balance: number
  discount: number
  status: string | null
  last_modified_time: string | null
  synced_at: string
}

export interface ZohoExpense {
  expense_id: string
  date: string | null
  account_name: string | null
  amount: number
  vendor_name: string | null
  description: string | null
  last_modified_time: string | null
  synced_at: string
}

export interface ZohoBankAccount {
  account_id: string
  account_name: string | null
  account_type: string | null
  current_balance: number
  synced_at: string
}

// Feeds the Cash-at-Bank drill-down (bank statement, running balance). Field
// names verified against a live payload — see
// supabase/functions/zoho-sync/index.ts syncBankTransactions().
// running_balance is Zoho's own computed value, not derived client-side.
// direction is Zoho's raw debit_or_credit ("debit" | "credit").
export interface ZohoBankTransaction {
  transaction_id: string
  account_id: string | null
  date: string | null
  amount: number
  transaction_type: string | null
  payee: string | null
  description: string | null
  status: string | null
  last_modified_time: string | null
  synced_at: string
  direction: string | null
  running_balance: number | null
}

// Zoho's own P&L / Balance Sheet report payload, verbatim (accrual-correct —
// the transaction mirrors above can't reproduce this). See
// supabase/functions/zoho-sync/index.ts syncReports() and
// src/lib/zohoReportParsing.ts for the (tolerant, best-effort) parser.
export interface ZohoReportRow {
  report_type: 'pnl' | 'balancesheet'
  period_start: string
  period_end: string
  data: unknown
  synced_at: string
}

// Billing schedule per student — feeds the student detail "billing
// schedule" block. frequency/end_date are already normalized server-side
// (see supabase/functions/zoho-sync/index.ts): frequency is a display
// string like "month"/"2 months", end_date is null for "no end date".
export interface ZohoRecurringInvoice {
  recurring_invoice_id: string
  customer_id: string | null
  customer_name: string | null
  recurrence_name: string | null
  status: string | null
  frequency: string | null
  start_date: string | null
  next_invoice_date: string | null
  end_date: string | null
  total: number
  last_modified_time: string | null
}

export interface ZohoSyncLog {
  id: number
  ran_at: string
  endpoint: string | null
  records: number | null
  api_calls: number | null
  ok: boolean | null
  note: string | null
}

export interface FamilyArSummary {
  family_count: number
  total_outstanding: number
}

const INVOICE_COLUMNS = 'invoice_id, invoice_number, customer_id, customer_name, date, total, balance, discount, status, last_modified_time, synced_at'
const EXPENSE_COLUMNS = 'expense_id, date, account_name, amount, vendor_name, description, last_modified_time, synced_at'
const BANK_ACCOUNT_COLUMNS = 'account_id, account_name, account_type, current_balance, synced_at'
const BANK_TRANSACTION_COLUMNS =
  'transaction_id, account_id, date, amount, transaction_type, payee, description, status, last_modified_time, synced_at, direction, running_balance'
const REPORT_COLUMNS = 'report_type, period_start, period_end, data, synced_at'
const RECURRING_INVOICE_COLUMNS =
  'recurring_invoice_id, customer_id, customer_name, recurrence_name, status, frequency, start_date, next_invoice_date, end_date, total, last_modified_time'

// Explicit .limit() above PostgREST's default 1000-row cap: at 707
// invoices / 486 expenses today there's headroom, but a silent truncation
// once the org grows past 1000 rows would quietly understate revenue with
// no error to notice — worth guarding now while it's a one-line fix.
const ROW_CAP = 5000

export function fetchZohoInvoices() {
  return supabase.from('zoho_invoices').select(INVOICE_COLUMNS).limit(ROW_CAP).returns<ZohoInvoice[]>()
}

// Invoice history for one student's detail page — newest first.
export async function fetchZohoInvoicesForCustomer(customerId: string) {
  const { data, error } = await supabase
    .from('zoho_invoices')
    .select(INVOICE_COLUMNS)
    .eq('customer_id', customerId)
    .order('date', { ascending: false })
  return { data: (data ?? []) as ZohoInvoice[], error }
}

// A student's active billing schedule, if any — roughly 8 active students
// are billed manually with no Zoho recurring invoice at all, which is a
// legitimate "No recurring billing" state, not an error. maybeSingle (never
// .single(), which throws on that zero-row case) since at most one row is
// expected per customer_id + status='active'.
export async function fetchActiveRecurringInvoiceForCustomer(customerId: string) {
  const { data, error } = await supabase
    .from('zoho_recurring_invoices')
    .select(RECURRING_INVOICE_COLUMNS)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .maybeSingle()
  return { data: data as ZohoRecurringInvoice | null, error }
}

export function fetchZohoExpenses() {
  return supabase.from('zoho_expenses').select(EXPENSE_COLUMNS).limit(ROW_CAP).returns<ZohoExpense[]>()
}

export function fetchZohoBankAccounts() {
  return supabase.from('zoho_bank_accounts').select(BANK_ACCOUNT_COLUMNS).order('account_name').returns<ZohoBankAccount[]>()
}

// Fetched lazily (only when the Cash-at-Bank drill-down opens), all
// accounts at once — filtered/grouped by account client-side.
export function fetchZohoBankTransactions() {
  return supabase
    .from('zoho_bank_transactions')
    .select(BANK_TRANSACTION_COLUMNS)
    .limit(ROW_CAP)
    .returns<ZohoBankTransaction[]>()
}

// Exact period match — used for the P&L tab, which needs the specific
// current-FY and prior-FY rows (not just "whatever's latest").
export function fetchZohoReport(reportType: 'pnl' | 'balancesheet', periodStart: string, periodEnd: string) {
  return supabase
    .from('zoho_reports')
    .select(REPORT_COLUMNS)
    .eq('report_type', reportType)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()
    .returns<ZohoReportRow | null>()
}

// Most recent row for a report type — used for the Balance Sheet, which is
// a point-in-time snapshot re-synced daily rather than tied to a fixed period.
export function fetchLatestZohoReport(reportType: 'pnl' | 'balancesheet') {
  return supabase
    .from('zoho_reports')
    .select(REPORT_COLUMNS)
    .eq('report_type', reportType)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<ZohoReportRow | null>()
}

export function fetchLatestSyncLog() {
  return supabase
    .from('zoho_sync_log')
    .select('id, ran_at, endpoint, records, api_calls, ok, note')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<ZohoSyncLog | null>()
}

// Shareholders can't read zoho_contacts directly (parent PII) — this
// SECURITY DEFINER RPC returns aggregates only. See
// supabase/migrations/20260721010000_zoho_mirror_rls.sql.
export function fetchFamilyArSummary() {
  return supabase.rpc('shareholder_family_ar_summary').maybeSingle().returns<FamilyArSummary | null>()
}

export interface ZohoSyncResult {
  ok: boolean
  ran_at: string
  records: number
  api_calls: number
}

// Always incremental from the client — ?mode=full is rejected server-side
// for anyone but the trusted pg_cron caller anyway (see zoho-sync/index.ts).
export function triggerZohoSync() {
  return supabase.functions.invoke<ZohoSyncResult>('zoho-sync', { body: {} })
}

export interface ZohoInvoicePdfResult {
  ok: boolean
  invoice_id: string
  content_type: string
  pdf_base64: string
}

// Fetches one Zoho invoice as a PDF via the zoho-sync Edge Function — same
// auth path as triggerZohoSync (supabase.functions.invoke attaches the
// caller's session JWT automatically). The Zoho token never reaches the
// browser; this is Zoho's own rendered PDF, not a client-side reconstruction.
export function fetchZohoInvoicePdf(invoiceId: string) {
  return supabase.functions.invoke<ZohoInvoicePdfResult>('zoho-sync', {
    body: { action: 'invoice_pdf', invoice_id: invoiceId },
  })
}

// --- App -> Zoho invoice write path (item B) ---------------------------
// Every call below hits a dedicated Edge Function (zoho-items-list /
// zoho-invoice-create / zoho-invoice-update / zoho-invoice-delete), never
// Zoho directly — supabase.functions.invoke forwards the caller's session
// JWT automatically, and each function independently verifies
// admin/super_admin server-side. The Zoho access token is minted and used
// entirely server-side; it never reaches this client.

export interface ZohoItem {
  item_id: string
  name: string
  rate: number
  unit: string | null
}

export interface ZohoItemsListResult {
  ok: boolean
  items: ZohoItem[]
}

// Full catalog (63 items today) — small enough to fetch once and filter
// client-side rather than searching server-side.
export function fetchZohoItemsCatalog() {
  return supabase.functions.invoke<ZohoItemsListResult>('zoho-items-list', { method: 'GET' })
}

export interface ZohoLinkedStudent {
  id: string
  name: string
}

// Candidates for the invoice-create student picker — only active students
// already linked to a Zoho contact. zoho-invoice-create rejects any other
// student_id (400 "student not linked to a Zoho contact"), so there's no
// point offering one here.
export function fetchZohoLinkedStudents(centerId: string) {
  return supabase
    .from('students')
    .select('id, name')
    .eq('center_id', centerId)
    .eq('active', true)
    .not('zoho_contact_id', 'is', null)
    .order('name', { ascending: true })
    .returns<ZohoLinkedStudent[]>()
}

export interface ZohoInvoiceLineItemInput {
  item_id: string
  quantity: number
  rate?: number
}

export interface ZohoInvoiceWriteResult {
  ok: boolean
  zoho_invoice_id: string
}

export interface CreateZohoInvoiceInput {
  student_id: string
  date: string
  line_items: ZohoInvoiceLineItemInput[]
  notes?: string
}

export function createZohoInvoice(input: CreateZohoInvoiceInput) {
  return supabase.functions.invoke<ZohoInvoiceWriteResult>('zoho-invoice-create', { body: input })
}

export interface UpdateZohoInvoiceInput {
  zoho_invoice_id: string
  date?: string
  line_items?: ZohoInvoiceLineItemInput[]
  notes?: string
}

export function updateZohoInvoice(input: UpdateZohoInvoiceInput) {
  return supabase.functions.invoke<ZohoInvoiceWriteResult>('zoho-invoice-update', { body: input })
}

export function deleteZohoInvoice(zohoInvoiceId: string) {
  return supabase.functions.invoke<ZohoInvoiceWriteResult>('zoho-invoice-delete', {
    body: { zoho_invoice_id: zohoInvoiceId },
  })
}

// Which zoho_invoices rows were created through this app — read-only from
// the client (RLS: admin/super_admin/shareholder SELECT only). This table is
// the backend's trust anchor for the update/delete origin guard; the
// frontend must never insert/update/delete it directly, only read it to
// decide whether to show the Edit/Delete actions.
export function fetchAppInvoiceOriginIds() {
  return supabase.from('app_invoice_origins').select('zoho_invoice_id').returns<{ zoho_invoice_id: string }[]>()
}
