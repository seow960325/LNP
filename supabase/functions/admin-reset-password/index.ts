// Edge Function: admin-reset-password
// Generates a temporary password for a target user and forces them to
// change it on next login. The ONLY place service_role is used.
//
// Auth matrix enforced here (server-side, cannot be bypassed by the client):
//   - caller must be admin or super_admin           else 403
//   - the app owner's account can only be reset by the owner themselves,
//     even a super_admin caller is blocked                        else 403
//   - admin may reset ONLY normal staff (not admin/super_admin) else 403
//   - super_admin may reset anyone (except the owner, per above)
//   - target must be in the same center as caller (unless caller is super_admin) else 403

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

function generateTempPassword(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1000000).padStart(6, '0')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeadersFor(req) })

  try {
    // --- 1. Identify the caller from their JWT (anon client + caller's token) ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(req, { error: 'Missing Authorization header' }, 401)
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) {
      return json(req, { error: 'Invalid or expired session' }, 401)
    }

    // --- 2. Load caller's profile (role + center) ---
    const { data: callerProfile, error: cpErr } = await callerClient
      .from('profiles')
      .select('id, role, center_id, is_app_owner')
      .eq('id', caller.id)
      .single()
    if (cpErr || !callerProfile) {
      return json(req, { error: 'Caller profile not found' }, 403)
    }

    const callerRole = callerProfile.role
    const isSuper = callerRole === 'super_admin'
    const isAdmin = callerRole === 'admin' || callerRole === 'super_admin'
    if (!isAdmin) {
      return json(req, { error: 'Forbidden: admin or super_admin only' }, 403)
    }

    // --- 3. Parse target ---
    const body = await req.json().catch(() => null)
    const targetUserId = body?.targetUserId
    if (!targetUserId || typeof targetUserId !== 'string') {
      return json(req, { error: 'targetUserId is required' }, 400)
    }
    if (targetUserId === caller.id) {
      return json(req, { error: 'Use normal password change for your own account' }, 400)
    }

    // --- 4. service_role client (bypasses RLS) — used ONLY below, server-side ---
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // <-- the master key, secret, never sent to client
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // --- 5. Load target profile to enforce the auth matrix ---
    const { data: targetProfile, error: tpErr } = await admin
      .from('profiles')
      .select('id, role, center_id, is_app_owner')
      .eq('id', targetUserId)
      .single()
    if (tpErr || !targetProfile) {
      return json(req, { error: 'Target user not found' }, 404)
    }

    // Owner protection: nobody but the app owner themselves may modify the
    // owner's account — not even another super_admin. Stronger than the
    // isSuper bypass below; this check applies regardless of caller role.
    if (targetProfile.is_app_owner === true && callerProfile.is_app_owner !== true) {
      return json(req, { error: 'This profile cannot be modified.' }, 403)
    }

    // Rule: admin (non-super) may reset ONLY normal staff, same center.
    if (!isSuper) {
      const targetIsPrivileged =
        targetProfile.role === 'admin' || targetProfile.role === 'super_admin'
      if (targetIsPrivileged) {
        return json(req, { error: 'Forbidden: admin cannot reset admin/super_admin' }, 403)
      }
      if (targetProfile.center_id !== callerProfile.center_id) {
        return json(req, { error: 'Forbidden: target is in a different center' }, 403)
      }
    }

    // --- 6. Do the reset: set temp password + force change on next login ---
    const tempPassword = generateTempPassword()

    const { error: pwErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: tempPassword,
    })
    if (pwErr) {
      return json(req, { error: `Failed to set password: ${pwErr.message}` }, 500)
    }

    const { error: flagErr } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', targetUserId)
    if (flagErr) {
      // Password already changed but flag failed — report so admin knows.
      return json(req, {
        error: `Password reset but failed to set change-required flag: ${flagErr.message}`,
        tempPassword,   // still return it so the reset isn't lost
      }, 207)
    }

    // --- 7. Return temp password (plaintext, only time it exists) ---
    return json(req, { tempPassword }, 200)

  } catch (e) {
    return json(req, { error: `Unexpected error: ${String(e)}` }, 500)
  }
})

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  })
}
