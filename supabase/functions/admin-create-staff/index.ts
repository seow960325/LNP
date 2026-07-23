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

function generateTempPassword(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1000000).padStart(6, '0')
}

// Target roles a caller may assign to a new account, keyed by the caller's
// own role. super_admin and parent are never assignable by anyone through
// this function. shareholder is reserved for super_admin — an admin caller
// must not be able to mint a shareholder account.
const ALLOWED_ROLES_BY_CALLER: Record<string, string[]> = {
  super_admin: ['admin', 'teacher', 'staff', 'shareholder'],
  admin: ['admin', 'teacher', 'staff'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeadersFor(req) })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json(req, { error: 'Invalid or expired session' }, 401)

    const { data: callerProfile, error: cpErr } = await callerClient
      .from('profiles').select('id, role, center_id').eq('id', caller.id).single()
    if (cpErr || !callerProfile) return json(req, { error: 'Caller profile not found' }, 403)

    // admin + super_admin may register staff. Which target roles each may
    // assign is tiered — see ALLOWED_ROLES_BY_CALLER.
    const allowedRoles = ALLOWED_ROLES_BY_CALLER[callerProfile.role]
    if (!allowedRoles) {
      return json(req, { error: 'Forbidden: admin or super_admin only' }, 403)
    }

    const body = await req.json().catch(() => null)
    const fullName = body?.fullName?.trim()
    const email = body?.email?.trim()?.toLowerCase()
    const role = body?.role
    const title = body?.title?.trim() || null
    const phone = body?.phone?.trim() || null

    if (!fullName || !email || !role) return json(req, { error: 'fullName, email, role are required' }, 400)
    if (!['admin', 'teacher', 'staff', 'shareholder'].includes(role)) {
      return json(req, { error: 'Invalid role' }, 400)
    }
    if (!allowedRoles.includes(role)) {
      const callerLabel = callerProfile.role === 'admin' ? 'Admins' : 'You'
      return json(req, { error: `${callerLabel} cannot create ${role} accounts.` }, 403)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const tempPassword = generateTempPassword()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
    })
    if (createErr || !created?.user) {
      return json(req, { error: `Failed to create user: ${createErr?.message ?? 'unknown'}` }, 400)
    }

    const newId = created.user.id
    const { error: profErr } = await admin.from('profiles').insert({
      id: newId,
      center_id: callerProfile.center_id,
      full_name: fullName,
      role,
      title,
      phone,
      active: true,
      must_change_password: true,
    })
    if (profErr) {
      // Roll back the auth user so we don't leave an orphan.
      await admin.auth.admin.deleteUser(newId)
      return json(req, { error: `Failed to create profile: ${profErr.message}` }, 500)
    }

    return json(req, { userId: newId, tempPassword }, 200)
  } catch (e) {
    return json(req, { error: `Unexpected error: ${String(e)}` }, 500)
  }
})
