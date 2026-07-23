// Edge Function: zoho-invoice-create
// Admin-only. Creates a real invoice in Zoho Books for a student, then
// mirrors it locally so it shows up immediately (before the next zoho-sync
// run) and logs who created it.
//
// Zoho auth (refresh token -> access token, org id, datacenter) is copied
// verbatim from zoho-sync/index.ts — same global DC (accounts.zoho.com +
// www.zohoapis.com/books/v3), same ZOHO_ORG_ID. Do not reimplement this
// differently; if the DC or org changes, update both functions.
//
// The Zoho access token is minted here, used server-side against Zoho, and
// never appears in the response to the caller.
//
// Invocation: user session only (Authorization: Bearer <user JWT>), caller
// must resolve to admin/super_admin via is_admin_or_super() — the same DB
// role helper RLS uses, not a re-implemented copy. Unlike zoho-sync there is
// NO trusted-system-token path here; this is purely user-initiated, and the
// admin decision always comes from the verified JWT, never from the service
// role used below for the actual DB reads/writes.
//
// Body: { student_id: uuid, date: "YYYY-MM-DD", line_items: [{ item_id,
//         quantity, rate? }], notes? }
//
// This is the one place in the app that WRITES to Zoho (zoho-sync is
// deliberately read-only against Zoho) — nothing else may POST to Zoho.
//
// Secrets required: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
// ZOHO_ORG_ID, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

// --- Zoho setup, copied from zoho-sync/index.ts (same DC, same org, same
// refresh-token flow) — see that file's header comment for why. ---
const ZOHO_ACCOUNTS_HOST = 'https://accounts.zoho.com'
const ZOHO_API_BASE = 'https://www.zohoapis.com/books/v3'

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

// Same shape zoho-sync's `invoices` ENDPOINTS.mapRow uses, so a locally
// created invoice looks identical to one that arrived via the nightly sync.
function mapZohoInvoiceRow(r: any): Record<string, unknown> {
  return {
    invoice_id: r.invoice_id,
    invoice_number: r.invoice_number ?? null,
    customer_id: r.customer_id ?? null,
    customer_name: r.customer_name ?? null,
    date: r.date ?? null,
    total: r.total ?? 0,
    balance: r.balance ?? 0,
    discount: r.bcy_discount_total ?? 0,
    status: r.status ?? null,
    last_modified_time: r.last_modified_time ?? null,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Zoho item ids are plain numeric strings, same as the invoice_pdf action's
// invoice_id validation in zoho-sync — reject anything else before it goes
// anywhere near a Zoho API call.
const ZOHO_ID_RE = /^[0-9]+$/

interface LineItemInput {
  item_id: string
  quantity: number
  rate?: number
}

interface CreateInvoiceInput {
  student_id: string
  date: string
  line_items: LineItemInput[]
  notes?: string
}

function isValidCalendarDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Returns an error string, or null if the body is well-formed.
function validateInput(body: any): string | null {
  if (typeof body?.student_id !== 'string' || !UUID_RE.test(body.student_id)) {
    return 'student_id must be a uuid'
  }
  if (typeof body?.date !== 'string' || !DATE_RE.test(body.date) || !isValidCalendarDate(body.date)) {
    return 'date must be a valid YYYY-MM-DD date'
  }
  if (!Array.isArray(body?.line_items) || body.line_items.length === 0) {
    return 'line_items must be a non-empty array'
  }
  for (const li of body.line_items) {
    if (typeof li?.item_id !== 'string' || !ZOHO_ID_RE.test(li.item_id)) {
      return 'each line item needs a numeric item_id'
    }
    if (typeof li?.quantity !== 'number' || !Number.isFinite(li.quantity) || li.quantity <= 0) {
      return 'each line item needs a positive quantity'
    }
    if (li.rate !== undefined && (typeof li.rate !== 'number' || !Number.isFinite(li.rate) || li.rate < 0)) {
      return 'line item rate must be a non-negative number when provided'
    }
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return 'notes must be a string'
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'Missing Authorization header' }, 401)

    // User-session auth only — no trusted-system-token path (see header
    // comment). Same role helper zoho-sync uses for its "Sync now" path.
    // This is the ADMIN DECISION for the whole request; the service-role
    // client created further down is only ever used for DB reads/writes
    // gated by this check, never as a source of authorization itself.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json(req, { error: 'Invalid or expired session' }, 401)

    const { data: isAdminSuper, error: adminErr } = await callerClient.rpc('is_admin_or_super')
    if (adminErr) return json(req, { error: 'Role check failed' }, 403)
    if (!isAdminSuper) return json(req, { error: 'Forbidden: admin or super_admin only' }, 403)

    let body: any
    try {
      const raw = await req.text()
      body = raw ? JSON.parse(raw) : null
    } catch {
      return json(req, { error: 'Invalid JSON body' }, 400)
    }

    const validationError = validateInput(body)
    if (validationError) return json(req, { error: validationError }, 400)
    const input = body as CreateInvoiceInput

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: student, error: studentErr } = await admin
      .from('students')
      .select('zoho_contact_id')
      .eq('id', input.student_id)
      .maybeSingle()
    if (studentErr) return json(req, { error: `Student lookup failed: ${studentErr.message}` }, 500)
    if (!student) return json(req, { error: 'student not found' }, 400)
    if (!student.zoho_contact_id) return json(req, { error: 'student not linked to a Zoho contact' }, 400)

    let accessToken: string
    try {
      accessToken = await getZohoAccessToken()
    } catch (e) {
      return json(req, { error: `Zoho auth failed: ${String(e instanceof Error ? e.message : e)}` }, 502)
    }

    const orgId = Deno.env.get('ZOHO_ORG_ID')!
    const invoiceUrl = new URL(`${ZOHO_API_BASE}/invoices`)
    invoiceUrl.searchParams.set('organization_id', orgId)

    const zohoRes = await fetch(invoiceUrl.toString(), {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: student.zoho_contact_id,
        date: input.date,
        line_items: input.line_items.map((li) => ({
          item_id: li.item_id,
          quantity: li.quantity,
          ...(li.rate !== undefined ? { rate: li.rate } : {}),
        })),
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    })

    const zohoBody = await zohoRes.json().catch(() => null)

    // On any Zoho-side failure: surface Zoho's own message + status, and do
    // NOT touch app_invoice_origins or zoho_invoices — nothing was created.
    if (!zohoRes.ok || !zohoBody?.invoice?.invoice_id) {
      const zohoMessage = zohoBody?.message ?? `Zoho invoice create failed: HTTP ${zohoRes.status}`
      return json(req, { error: zohoMessage }, zohoRes.ok ? 502 : zohoRes.status)
    }

    const invoice = zohoBody.invoice
    const zohoInvoiceId = String(invoice.invoice_id)

    // The Zoho invoice now exists regardless of what happens below — a
    // failure past this point must still report success with the id (the
    // source of truth is Zoho, not these local mirrors) rather than leave
    // the admin thinking nothing happened and retrying into a duplicate.
    // Upsert with ignoreDuplicates rather than a plain insert: a retried
    // create for the same Zoho invoice id (e.g. the admin double-clicks
    // after a slow response) must not raise a PK violation here — the Zoho
    // invoice already exists either way, and this table is just a log of
    // that fact keyed by zoho_invoice_id.
    const { error: originErr } = await admin
      .from('app_invoice_origins')
      .upsert(
        { zoho_invoice_id: zohoInvoiceId, created_by: caller.id },
        { onConflict: 'zoho_invoice_id', ignoreDuplicates: true },
      )
    if (originErr) {
      console.error(`app_invoice_origins upsert failed for Zoho invoice ${zohoInvoiceId}: ${originErr.message}`)
    }

    const { error: mirrorErr } = await admin
      .from('zoho_invoices')
      .upsert(mapZohoInvoiceRow(invoice), { onConflict: 'invoice_id' })
    if (mirrorErr) {
      console.error(`zoho_invoices upsert failed for Zoho invoice ${zohoInvoiceId}: ${mirrorErr.message}`)
    }

    return json(req, { ok: true, zoho_invoice_id: zohoInvoiceId }, 200)
  } catch (e) {
    // Never include tokens or raw Zoho payloads here.
    return json(req, { error: `Unexpected error: ${String(e instanceof Error ? e.message : e)}` }, 500)
  }
})
