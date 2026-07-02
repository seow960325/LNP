import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateTempPassword(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1000000).padStart(6, '0')
}

const ALLOWED_ROLES = ['admin', 'teacher', 'staff', 'shareholder']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json({ error: 'Invalid or expired session' }, 401)

    const { data: callerProfile, error: cpErr } = await callerClient
      .from('profiles').select('id, role, center_id').eq('id', caller.id).single()
    if (cpErr || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

    // Only super_admin may register staff.
    if (callerProfile.role !== 'super_admin') {
      return json({ error: 'Forbidden: super_admin only' }, 403)
    }

    const body = await req.json().catch(() => null)
    const fullName = body?.fullName?.trim()
    const email = body?.email?.trim()?.toLowerCase()
    const role = body?.role
    const title = body?.title?.trim() || null
    const phone = body?.phone?.trim() || null

    if (!fullName || !email || !role) return json({ error: 'fullName, email, role are required' }, 400)
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const tempPassword = generateTempPassword()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
    })
    if (createErr || !created?.user) {
      return json({ error: `Failed to create user: ${createErr?.message ?? 'unknown'}` }, 400)
    }

    const newId = created.user.id
    const { error: profErr } = await admin.from('profiles').insert({
      id: newId,
      center_id: callerProfile.center_id,
      full_name: fullName,
      role,
      title,
      email,
      phone,
      active: true,
      must_change_password: true,
    })
    if (profErr) {
      // Roll back the auth user so we don't leave an orphan.
      await admin.auth.admin.deleteUser(newId)
      return json({ error: `Failed to create profile: ${profErr.message}` }, 500)
    }

    return json({ userId: newId, tempPassword }, 200)
  } catch (e) {
    return json({ error: `Unexpected error: ${String(e)}` }, 500)
  }
})
