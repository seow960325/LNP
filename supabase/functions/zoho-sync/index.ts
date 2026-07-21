// Edge Function: zoho-sync
// The ONLY writer to the zoho_* mirror tables and the ONLY holder of Zoho
// credentials. READ-ONLY against Zoho: calls Zoho GET endpoints exclusively,
// never POST/PUT/DELETE. One-way sync into Supabase; nothing ever writes
// back to Zoho.
//
// Also syncs Zoho's own /reports/profitandloss (current + prior FY) and
// /reports/balancesheet into zoho_reports, verbatim (jsonb blob, not
// parsed here) — these are accrual-correct; the transaction-table mirrors
// below (zoho_invoices/zoho_expenses) can't reproduce an accrual P&L on
// their own. Dropped the chartofaccounts pull (zoho_accounts table is no
// longer written) now that the Balance Sheet comes from the real report.
// Requires the ZOHO_REFRESH_TOKEN's scope to include ZohoBooks.reports.READ.
//
// Also syncs /banktransactions per bank account into zoho_bank_transactions
// (feeds the Cash-at-Bank drill-down / bank statement view). Uses the
// existing ZohoBooks.banking.READ scope — no new scope needed.
//
// Invocation:
//   - Nightly (pg_cron / pg_net), authenticated with ZOHO_SYNC_TOKEN as the
//     bearer token -> treated as a trusted system caller, no role/rate
//     check. Incremental (per-endpoint watermark). See README.md for the
//     pg_cron snippet.
//   - Weekly (pg_cron / pg_net), same trusted-caller auth, called with
//     ?mode=full -> ignores the watermark, pulls every page, and deletes
//     mirror rows whose Zoho id no longer appears (catches hard-deletes).
//     ?mode=full is rejected for any non-trusted caller.
//   - "Sync now" from the app, authenticated with a normal user session ->
//     caller must resolve to shareholder/admin/super_admin via
//     is_admin_or_super()/is_shareholder() AND at least 60s must have
//     passed since the last logged sync run, else rejected. Always
//     incremental — cannot request ?mode=full.
//
// Secrets required (Supabase project secrets, never in code):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID,
//   ZOHO_SYNC_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://learnnplay.vercel.app']
function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  })
}

const ZOHO_ACCOUNTS_HOST = 'https://accounts.zoho.com'
const ZOHO_API_BASE = 'https://www.zohoapis.com/books/v3'
const PER_PAGE = 200
const CALL_DELAY_MS = 200
const MAX_RETRIES = 4
const HARD_CAP_CALLS = 250
const MANUAL_RATE_LIMIT_MS = 60_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Constant-time string compare, so checking the caller's bearer token
// against the service-role secret doesn't leak timing information a
// byte-at-a-time attacker could use to guess the key.
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

// Zoho's last_modified_time filter expects local Asia/Kuala_Lumpur time
// (fixed UTC+8, no DST) formatted as YYYY-MM-DDThh:mm:ss+0800. Postgres
// returns the watermark as a UTC ISO string, so shift +8h then read the
// wall-clock fields back off it.
function toZohoTimestamp(isoUtc: string): string {
  const shifted = new Date(new Date(isoUtc).getTime() + 8 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = shifted.getUTCFullYear()
  const mm = pad(shifted.getUTCMonth() + 1)
  const dd = pad(shifted.getUTCDate())
  const hh = pad(shifted.getUTCHours())
  const mi = pad(shifted.getUTCMinutes())
  const ss = pad(shifted.getUTCSeconds())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+0800`
}

// Malaysia-local "now" (fixed UTC+8, no DST) — used to decide which fiscal
// year we're in and what "today" is for the balance sheet, the same way
// toZohoTimestamp above shifts before reading wall-clock fields. Using raw
// UTC here would misclassify the FY for ~8h around every FY boundary.
function myNow(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
}

function myTodayISO(): string {
  return myNow().toISOString().slice(0, 10)
}

// FY = 1 Jul - 30 Jun, keyed by its starting calendar year (mirrors
// currentFyStartYear in src/lib/zohoFinance.ts on the frontend).
function currentFyStartYear(): number {
  const now = myNow()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return m >= 7 ? y : y - 1
}

function fyRangeFor(startYear: number): { start: string; end: string } {
  return { start: `${startYear}-07-01`, end: `${startYear + 1}-06-30` }
}

// --- Zoho OAuth: refresh token -> access token, in-memory for this run only ---
async function getZohoAccessToken(): Promise<string> {
  const res = await fetch(`${ZOHO_ACCOUNTS_HOST}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN')!,
      client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
    }),
  })
  // Never log the response body — it carries the access token.
  if (!res.ok) throw new Error(`Zoho token exchange failed: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('Zoho token exchange returned no access_token')
  return data.access_token as string
}

// --- Per-run state: call counter shared across all endpoints this run ---
interface SyncCtx {
  accessToken: string
  orgId: string
  calls: number
}

// GET one page from Zoho Books. Applies the hard call cap, a fixed delay
// between calls, and exponential backoff + retry on 429.
async function zohoGet(ctx: SyncCtx, path: string, params: Record<string, string>): Promise<any> {
  if (ctx.calls >= HARD_CAP_CALLS) {
    throw new Error('CALL_CAP_REACHED')
  }

  const url = new URL(`${ZOHO_API_BASE}${path}`)
  url.searchParams.set('organization_id', ctx.orgId)
  // URLSearchParams' serializer percent-encodes a literal "+" as %2B (verified:
  // new URL(...).searchParams.set('t','...+0800').toString() -> ...%2B0800),
  // so the last_modified_time offset survives intact — Zoho would otherwise
  // read a raw "+" as a space and silently ignore the filter.
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let attempt = 0
  for (;;) {
    ctx.calls++
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${ctx.accessToken}` },
    })

    if (res.status === 429) {
      attempt++
      if (attempt > MAX_RETRIES) throw new Error(`Zoho rate-limited (429) after ${MAX_RETRIES} retries: ${path}`)
      await sleep(500 * 2 ** attempt)
      continue
    }
    if (!res.ok) throw new Error(`Zoho GET ${path} failed: HTTP ${res.status}`)

    await sleep(CALL_DELAY_MS)
    return await res.json()
  }
}

// Paginate a Zoho Books list endpoint until has_more_page is false.
async function zohoPaginate(
  ctx: SyncCtx,
  path: string,
  baseParams: Record<string, string>,
  listKey: string,
): Promise<any[]> {
  const results: any[] = []
  let page = 1
  for (;;) {
    const data = await zohoGet(ctx, path, { ...baseParams, page: String(page), per_page: String(PER_PAGE) })
    const items = data[listKey] ?? []
    results.push(...items)
    if (data.page_context?.has_more_page !== true) break
    page++
  }
  return results
}

// Highest last_modified_time currently in a mirror table, or null if empty
// (full pull). Relies on idx_zoho_*_last_modified added in the schema migration.
async function getWatermark(admin: SupabaseClient, table: string): Promise<string | null> {
  const { data, error } = await admin
    .from(table)
    .select('last_modified_time')
    .order('last_modified_time', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Watermark query failed for ${table}: ${error.message}`)
  return data?.last_modified_time ?? null
}

// Same as getWatermark, scoped to one account — bank transactions need a
// per-account watermark since different accounts sync on independent
// last_modified_time timelines.
async function getAccountWatermark(admin: SupabaseClient, table: string, accountId: string): Promise<string | null> {
  const { data, error } = await admin
    .from(table)
    .select('last_modified_time')
    .eq('account_id', accountId)
    .order('last_modified_time', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Watermark query failed for ${table} (account ${accountId}): ${error.message}`)
  return data?.last_modified_time ?? null
}

interface EndpointSpec {
  endpoint: string
  table: string
  path: string
  listKey: string
  incremental: boolean
  extraParams?: Record<string, string>
  conflictKey: string
  mapRow: (r: any) => Record<string, unknown>
}

const ENDPOINTS: EndpointSpec[] = [
  {
    endpoint: 'invoices',
    table: 'zoho_invoices',
    path: '/invoices',
    listKey: 'invoices',
    incremental: true,
    conflictKey: 'invoice_id',
    mapRow: (r) => ({
      invoice_id: r.invoice_id,
      invoice_number: r.invoice_number ?? null,
      customer_id: r.customer_id ?? null,
      customer_name: r.customer_name ?? null,
      date: r.date ?? null,
      total: r.total ?? 0,
      balance: r.balance ?? 0,
      // NOTE: field name unverified against a live payload (same caveat as
      // bcy_total/current_balance elsewhere in this file) — trying the two
      // names Zoho's invoice object has used historically.
      discount: r.discount_total ?? r.discount ?? 0,
      status: r.status ?? null,
      last_modified_time: r.last_modified_time ?? null,
    }),
  },
  {
    endpoint: 'customerpayments',
    table: 'zoho_payments',
    path: '/customerpayments',
    listKey: 'customerpayments',
    incremental: true,
    conflictKey: 'payment_id',
    mapRow: (r) => ({
      payment_id: r.payment_id,
      payment_number: r.payment_number ?? null,
      date: r.date ?? null,
      amount: r.amount ?? 0,
      payment_mode: r.payment_mode ?? null,
      customer_id: r.customer_id ?? null,
      invoice_numbers: r.invoice_numbers ?? null,
      last_modified_time: r.last_modified_time ?? null,
    }),
  },
  {
    endpoint: 'expenses',
    table: 'zoho_expenses',
    path: '/expenses',
    listKey: 'expenses',
    incremental: true,
    conflictKey: 'expense_id',
    mapRow: (r) => ({
      expense_id: r.expense_id,
      date: r.date ?? null,
      account_name: r.account_name ?? null,
      // amount = bcy_total (base-currency total), NOT total. Deliberately no
      // fallback to r.total — a missing bcy_total should surface as a 0/gap
      // to investigate, not silently mix in a possibly-foreign-currency figure.
      amount: r.bcy_total ?? 0,
      vendor_name: r.vendor_name ?? null,
      description: r.description ?? null,
      last_modified_time: r.last_modified_time ?? null,
    }),
  },
  {
    endpoint: 'bankaccounts',
    table: 'zoho_bank_accounts',
    path: '/bankaccounts',
    listKey: 'bankaccounts',
    incremental: false,
    conflictKey: 'account_id',
    mapRow: (r) => ({
      account_id: r.account_id,
      account_name: r.account_name ?? null,
      account_type: r.account_type ?? null,
      // Confirmed: balance / current_balance / bcy_balance are all equal on
      // this endpoint.
      current_balance: r.current_balance ?? 0,
    }),
  },
  {
    endpoint: 'contacts',
    table: 'zoho_contacts',
    path: '/contacts',
    listKey: 'contacts',
    incremental: true,
    extraParams: { contact_type: 'customer' },
    conflictKey: 'contact_id',
    mapRow: (r) => ({
      contact_id: r.contact_id,
      contact_name: r.contact_name ?? null,
      email: r.email ?? null,
      mobile: r.mobile ?? null,
      outstanding_receivable_amount: r.outstanding_receivable_amount ?? 0,
      last_modified_time: r.last_modified_time ?? null,
    }),
  },
]

interface EndpointResult {
  endpoint: string
  records: number
  apiCalls: number
  ok: boolean
  note: string | null
}

// full=true: ignore the watermark (pull every page) and reconcile deletes —
// any mirror row whose PK is absent from this run's full pull gets deleted,
// catching hard-deletes on the Zoho side that an upsert-only sync can never see.
async function syncEndpoint(ctx: SyncCtx, admin: SupabaseClient, spec: EndpointSpec, full: boolean): Promise<EndpointResult> {
  const callsBefore = ctx.calls
  const logName = full ? `${spec.endpoint}:full` : spec.endpoint
  try {
    const params = { ...(spec.extraParams ?? {}) }
    if (spec.incremental && !full) {
      const watermark = await getWatermark(admin, spec.table)
      if (watermark) params.last_modified_time = toZohoTimestamp(watermark)
    }

    const rows = await zohoPaginate(ctx, spec.path, params, spec.listKey)
    const mapped = rows.map(spec.mapRow)

    if (mapped.length > 0) {
      const { error } = await admin.from(spec.table).upsert(mapped, { onConflict: spec.conflictKey })
      if (error) throw new Error(`Upsert ${spec.table} failed: ${error.message}`)
    }

    if (full) {
      const { data: existingRows, error: existErr } = await admin.from(spec.table).select(spec.conflictKey)
      if (existErr) throw new Error(`Reconcile read failed for ${spec.table}: ${existErr.message}`)

      const fetchedIds = new Set(mapped.map((m) => m[spec.conflictKey] as string))
      const staleIds = (existingRows ?? [])
        .map((r: Record<string, unknown>) => r[spec.conflictKey] as string)
        .filter((id) => !fetchedIds.has(id))

      // Safety: never let a suspiciously-empty Zoho response (auth hiccup,
      // pagination bug) read as "everything was deleted" and wipe the table.
      if (mapped.length === 0 && (existingRows?.length ?? 0) > 0) {
        return {
          endpoint: logName,
          records: 0,
          apiCalls: ctx.calls - callsBefore,
          ok: false,
          note: `Full pull returned 0 rows but ${existingRows!.length} existed in mirror — skipped delete as a precaution`,
        }
      }

      if (staleIds.length > 0) {
        const { error: delErr } = await admin.from(spec.table).delete().in(spec.conflictKey, staleIds)
        if (delErr) throw new Error(`Reconcile delete failed for ${spec.table}: ${delErr.message}`)
      }
    }

    return { endpoint: logName, records: mapped.length, apiCalls: ctx.calls - callsBefore, ok: true, note: null }
  } catch (e) {
    return {
      endpoint: logName,
      records: 0,
      apiCalls: ctx.calls - callsBefore,
      ok: false,
      note: String(e instanceof Error ? e.message : e),
    }
  }
}

// Bank transactions, one Zoho account at a time (the endpoint is scoped to
// a single account_id per call, unlike the other list endpoints). Feeds the
// Cash-at-Bank KPI drill-down (bank statement, running balance per account).
// NOTE: field names below (amount vs debit/credit, payee/description,
// status, and the `banktransactions` response key) are NOT verified against
// a live payload — no credentials were available while writing this, same
// caveat as the reports endpoints in syncReports(). Verify against the
// first real synced rows before trusting the bank statement's running
// balance or transaction direction (deposit/withdrawal).
async function syncBankTransactions(ctx: SyncCtx, admin: SupabaseClient, full: boolean): Promise<EndpointResult> {
  const callsBefore = ctx.calls
  const logName = full ? 'banktransactions:full' : 'banktransactions'
  try {
    const { data: accounts, error: acctErr } = await admin.from('zoho_bank_accounts').select('account_id')
    if (acctErr) throw new Error(`Reading zoho_bank_accounts failed: ${acctErr.message}`)

    let totalRecords = 0
    for (const { account_id: accountId } of accounts ?? []) {
      const params: Record<string, string> = { account_id: accountId }
      if (!full) {
        const watermark = await getAccountWatermark(admin, 'zoho_bank_transactions', accountId)
        if (watermark) params.last_modified_time = toZohoTimestamp(watermark)
      }

      const rows = await zohoPaginate(ctx, '/banktransactions', params, 'banktransactions')
      const mapped = rows.map((r) => ({
        transaction_id: r.transaction_id,
        account_id: r.account_id ?? accountId,
        date: r.date ?? null,
        amount: r.amount ?? r.debit_amount ?? r.credit_amount ?? 0,
        transaction_type: r.transaction_type ?? null,
        payee: r.payee ?? null,
        description: r.description ?? r.reference_number ?? null,
        status: r.status ?? null,
        last_modified_time: r.last_modified_time ?? null,
      }))

      if (mapped.length > 0) {
        const { error } = await admin.from('zoho_bank_transactions').upsert(mapped, { onConflict: 'transaction_id' })
        if (error) throw new Error(`Upsert zoho_bank_transactions failed (account ${accountId}): ${error.message}`)
      }
      totalRecords += mapped.length
    }

    return { endpoint: logName, records: totalRecords, apiCalls: ctx.calls - callsBefore, ok: true, note: null }
  } catch (e) {
    return {
      endpoint: logName,
      records: 0,
      apiCalls: ctx.calls - callsBefore,
      ok: false,
      note: String(e instanceof Error ? e.message : e),
    }
  }
}

async function upsertReport(
  admin: SupabaseClient,
  reportType: 'pnl' | 'balancesheet',
  periodStart: string,
  periodEnd: string,
  data: unknown,
) {
  const { error } = await admin
    .from('zoho_reports')
    .upsert({ report_type: reportType, period_start: periodStart, period_end: periodEnd, data }, { onConflict: 'report_type,period_start,period_end' })
  if (error) throw new Error(`Upsert zoho_reports(${reportType}) failed: ${error.message}`)
}

// Zoho's report endpoints return one JSON object, not a paginated list — no
// watermark concept, always a fresh full pull. The whole response body is
// stored verbatim in zoho_reports.data (not parsed here); the frontend does
// its own tolerant parsing of the report tree. NOTE: the exact response
// shape has NOT been probed against a live payload from this environment —
// the ZohoBooks.reports.READ scope is being added separately and no
// credentials with that scope were available while writing this. Verify the
// first real zoho_reports row against what the frontend expects before
// trusting the P&L/Balance Sheet tabs.
async function syncReports(ctx: SyncCtx, admin: SupabaseClient): Promise<EndpointResult[]> {
  const results: EndpointResult[] = []
  const currentStartYear = currentFyStartYear()
  const periods = [fyRangeFor(currentStartYear), fyRangeFor(currentStartYear - 1)] // current FY, then prior FY for year-vs-year

  for (const period of periods) {
    const callsBefore = ctx.calls
    try {
      const data = await zohoGet(ctx, '/reports/profitandloss', { from_date: period.start, to_date: period.end })
      await upsertReport(admin, 'pnl', period.start, period.end, data)
      results.push({
        endpoint: 'reports:pnl',
        records: 1,
        apiCalls: ctx.calls - callsBefore,
        ok: true,
        note: `${period.start}..${period.end}`,
      })
    } catch (e) {
      results.push({
        endpoint: 'reports:pnl',
        records: 0,
        apiCalls: ctx.calls - callsBefore,
        ok: false,
        note: `${period.start}..${period.end}: ${String(e instanceof Error ? e.message : e)}`,
      })
    }
  }

  const today = myTodayISO()
  const callsBeforeBs = ctx.calls
  try {
    const data = await zohoGet(ctx, '/reports/balancesheet', { date: today })
    await upsertReport(admin, 'balancesheet', today, today, data)
    results.push({ endpoint: 'reports:balancesheet', records: 1, apiCalls: ctx.calls - callsBeforeBs, ok: true, note: null })
  } catch (e) {
    results.push({
      endpoint: 'reports:balancesheet',
      records: 0,
      apiCalls: ctx.calls - callsBeforeBs,
      ok: false,
      note: String(e instanceof Error ? e.message : e),
    })
  }

  return results
}

async function runSync(admin: SupabaseClient, full: boolean): Promise<{ ok: boolean; ranAt: string; records: number; apiCalls: number }> {
  const ranAt = new Date().toISOString()

  let accessToken: string
  try {
    accessToken = await getZohoAccessToken()
  } catch (e) {
    await admin.from('zoho_sync_log').insert({
      ran_at: ranAt,
      endpoint: full ? 'oauth:full' : 'oauth',
      records: 0,
      api_calls: 0,
      ok: false,
      note: String(e instanceof Error ? e.message : e),
    })
    return { ok: false, ranAt, records: 0, apiCalls: 0 }
  }

  const ctx: SyncCtx = { accessToken, orgId: Deno.env.get('ZOHO_ORG_ID')!, calls: 0 }

  let totalRecords = 0
  let allOk = true
  const logRows = []
  for (const spec of ENDPOINTS) {
    const result = await syncEndpoint(ctx, admin, spec, full)
    totalRecords += result.records
    allOk = allOk && result.ok
    logRows.push({
      ran_at: ranAt,
      endpoint: result.endpoint,
      records: result.records,
      api_calls: result.apiCalls,
      ok: result.ok,
      note: result.note,
    })
  }

  // Runs after the ENDPOINTS loop above so zoho_bank_accounts (synced in
  // that loop) has the current account list to iterate over.
  {
    const result = await syncBankTransactions(ctx, admin, full)
    totalRecords += result.records
    allOk = allOk && result.ok
    logRows.push({
      ran_at: ranAt,
      endpoint: result.endpoint,
      records: result.records,
      api_calls: result.apiCalls,
      ok: result.ok,
      note: result.note,
    })
  }

  // Reports have no incremental/full distinction (Zoho always returns a
  // fresh computed report) — run every time, same as every other endpoint.
  for (const result of await syncReports(ctx, admin)) {
    totalRecords += result.records
    allOk = allOk && result.ok
    logRows.push({
      ran_at: ranAt,
      endpoint: result.endpoint,
      records: result.records,
      api_calls: result.apiCalls,
      ok: result.ok,
      note: result.note,
    })
  }

  await admin.from('zoho_sync_log').insert(logRows)

  return { ok: allOk, ranAt, records: totalRecords, apiCalls: ctx.calls }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    // .trim() on both sides: timingSafeEqual is an exact byte compare, so a
    // stray trailing newline/space on either the incoming header or the
    // stored secret (e.g. from `$(cat file)` or a pasted Vault secret) would
    // otherwise make a "correct" token fail silently.
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
    // Dedicated secret for the trusted system caller — decoupled from
    // SUPABASE_SERVICE_ROLE_KEY (still used below only to build the admin
    // client, never compared against the incoming request).
    const syncToken = (Deno.env.get('ZOHO_SYNC_TOKEN') ?? '').trim()

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Trusted system caller (pg_cron / pg_net, presents ZOHO_SYNC_TOKEN as
    // the bearer token) -> scheduled run, skip role + rate checks. Constant-
    // time compare: a naive `===` short-circuits on the first mismatched
    // byte, which leaks how many leading bytes an attacker's guess got right
    // via response timing. The syncToken.length check guards against
    // ZOHO_SYNC_TOKEN being unset — otherwise an empty bearer would compare
    // equal to an empty secret and grant trust to anyone.
    const isTrustedSystemCaller = syncToken.length > 0 && timingSafeEqual(bearer, syncToken)

    const reqUrl = new URL(req.url)
    const requestedMode = reqUrl.searchParams.get('mode') === 'full' ? 'full' : 'incremental'

    if (!isTrustedSystemCaller) {
      // "Sync now" from the app: caller must present a valid session JWT
      // AND resolve to shareholder/admin/super_admin via the same DB role
      // helpers RLS uses (not a re-implemented copy of the role check), AND
      // be rate-limited to 1/min. No other path reaches runSync() below.
      if (!authHeader) return json(req, { error: 'Missing Authorization header' }, 401)

      if (requestedMode === 'full') {
        return json(req, { error: 'Full reconcile is restricted to the scheduled system caller' }, 403)
      }

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
      if (callerErr || !caller) return json(req, { error: 'Invalid or expired session' }, 401)

      const [{ data: isAdminSuper, error: adminErr }, { data: isShareholder, error: shErr }] = await Promise.all([
        callerClient.rpc('is_admin_or_super'),
        callerClient.rpc('is_shareholder'),
      ])
      if (adminErr || shErr) return json(req, { error: 'Role check failed' }, 403)
      if (!isAdminSuper && !isShareholder) {
        return json(req, { error: 'Forbidden: shareholder, admin, or super_admin only' }, 403)
      }

      const { data: lastRun } = await admin
        .from('zoho_sync_log')
        .select('ran_at')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastRun?.ran_at && Date.now() - new Date(lastRun.ran_at).getTime() < MANUAL_RATE_LIMIT_MS) {
        return json(req, { error: 'Sync already ran in the last minute, try again shortly' }, 429)
      }
    }

    const result = await runSync(admin, requestedMode === 'full')
    return json(req, { ok: result.ok, ran_at: result.ranAt, records: result.records, api_calls: result.apiCalls }, 200)
  } catch (e) {
    // Never include tokens or raw Zoho payloads here.
    return json(req, { error: `Unexpected error: ${String(e instanceof Error ? e.message : e)}` }, 500)
  }
})
