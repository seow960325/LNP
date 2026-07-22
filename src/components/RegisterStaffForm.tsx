import { useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { copyToClipboard } from '../lib/clipboard'
import { supabase } from '../lib/supabaseClient'
import { staffLabel } from '../lib/helpers'
import type { UserRole } from '../types'

// Roles assignable through staff management UI (registration + the detail
// page's role editor). super_admin and parent are deliberately excluded —
// super_admin can't be self-service granted, and parent accounts aren't staff.
export const EDITABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Principal (admin)' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'staff', label: 'Staff' },
  { value: 'shareholder', label: 'Shareholder' },
]

export async function extractInvokeError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch {
      // Body wasn't JSON — fall back to the generic message.
    }
  }
  return fallback
}

// Shared "temp password" reveal used both after registering a new staff
// member and after resetting an existing one's password.
export function TempPasswordModal({
  password,
  description,
  onClose,
}: {
  password: string
  description: string
  onClose: () => void
}) {
  async function handleCopy() {
    const ok = await copyToClipboard(password)
    if (ok) {
      toast.success('Copied to clipboard')
    } else {
      toast.error("Couldn't copy — long-press the password to copy manually")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-card-lg">
        <h2 className="font-semibold text-lg text-ink">Temporary password</h2>
        <p className="text-sm text-muted">{description}</p>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-cream px-4 py-3">
          <span className="min-w-0 break-all font-semibold text-lg tracking-wide text-ink">{password}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-tap shrink-0 rounded-xl border border-line px-3 text-sm text-muted hover:bg-cream"
          >
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// callerRole narrows the role options to what admin-create-staff will
// actually accept from this caller (server-side tiering in that function is
// the real enforcement — see ALLOWED_ROLES_BY_CALLER there). admin doesn't
// get 'shareholder'; that role is reserved for super_admin.
// displayName is threaded through onCreated so the caller can apply it to a
// linked staff_members row (see StaffJobTitleMembersPage's handleLoginCreated) —
// this form itself only creates an auth user + profiles row via
// admin-create-staff, never a staff_members row directly.
export function RegisterStaffForm({
  callerRole,
  onCreated,
}: {
  callerRole: UserRole
  onCreated: (userId: string, tempPassword: string, displayName: string) => void
}) {
  const roleOptions =
    callerRole === 'super_admin' ? EDITABLE_ROLES : EDITABLE_ROLES.filter((option) => option.value !== 'shareholder')

  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('teacher')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!fullName.trim() || !email.trim()) return

    setSubmitting(true)

    const { data, error: invokeError } = await supabase.functions.invoke('admin-create-staff', {
      body: {
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        title: title.trim() || undefined,
        phone: phone.trim() || undefined,
      },
    })

    setSubmitting(false)

    if (invokeError) {
      toast.error(await extractInvokeError(invokeError, 'Could not register this staff member. Please try again.'))
      return
    }
    if (!data?.tempPassword || !data?.userId) {
      toast.error('Could not register this staff member. Please try again.')
      return
    }

    toast.success('Staff member registered')
    const registeredDisplayName = displayName.trim()
    setFullName('')
    setDisplayName('')
    setEmail('')
    setRole('teacher')
    setTitle('')
    setPhone('')
    onCreated(data.userId, data.tempPassword, registeredDisplayName)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-card">
      <p className="font-semibold text-sm text-ink">Register new staff</p>

      <div>
        <label className="text-xs text-muted">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          disabled={submitting}
          required
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-xs text-muted">Short name</label>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={submitting}
          maxLength={4}
          placeholder={fullName.trim() ? staffLabel({ full_name: fullName }) : undefined}
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-xs text-muted">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          required
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Role</label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Title</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
            placeholder="e.g. Lead Teacher"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted">Phone (optional)</label>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={submitting}
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !fullName.trim() || !email.trim()}
        className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Registering…' : 'Register staff member'}
      </button>
    </form>
  )
}
