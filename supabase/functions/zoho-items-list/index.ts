// Edge Function: zoho-items-list
// Admin-only. Lists Zoho Books items (products/services) for the invoice
// line-item picker: [{ item_id, name, rate, unit }].
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
// NO trusted-system-token path here; this is purely user-initiated.
//
// Secrets required: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
// ZOHO_ORG_ID, SUPABASE_URL, SUPABASE_ANON_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://learnnplay.vercel.app']
function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
const PER_PAGE = 200

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

interface TrimmedItem {
  item_id: string
  name: string
  rate: number
  unit: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== 'GET') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'Missing Authorization header' }, 401)

    // User-session auth only — no trusted-system-token path (see header
    // comment). Same role helper zoho-sync uses for its "Sync now" path.
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

    let accessToken: string
    try {
      accessToken = await getZohoAccessToken()
    } catch (e) {
      return json(req, { error: `Zoho auth failed: ${String(e instanceof Error ? e.message : e)}` }, 502)
    }

    const orgId = Deno.env.get('ZOHO_ORG_ID')!
    const items: TrimmedItem[] = []
    let page = 1
    for (;;) {
      const url = new URL(`${ZOHO_API_BASE}/items`)
      url.searchParams.set('organization_id', orgId)
      url.searchParams.set('page', String(page))
      url.searchParams.set('per_page', String(PER_PAGE))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      })
      if (!res.ok) return json(req, { error: `Zoho items fetch failed: HTTP ${res.status}` }, 502)

      const data = await res.json()
      for (const r of data.items ?? []) {
        items.push({
          item_id: r.item_id,
          name: r.name ?? '',
          rate: r.rate ?? 0,
          unit: r.unit ?? null,
        })
      }

      if (data.page_context?.has_more_page !== true) break
      page++
    }

    return json(req, { ok: true, items }, 200)
  } catch (e) {
    // Never include tokens or raw Zoho payloads here.
    return json(req, { error: `Unexpected error: ${String(e instanceof Error ? e.message : e)}` }, 500)
  }
})
