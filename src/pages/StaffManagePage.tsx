import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
import { fetchStaffForManagement } from '../lib/profileApi'
import type { StaffManageEntry } from '../lib/profileApi'
import type { UserRole } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

// Roles assignable through this page. super_admin and parent are deliberately
// excluded — super_admin can't be self-service granted here, and parent
// accounts aren't staff.
const EDITABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Principal (admin)' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'staff', label: 'Staff' },
  { value: 'shareholder', label: 'Shareholder' },
]

async function extractInvokeError(error: unknown, fallback: string): Promise<string> {
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

function RegisterStaffForm({ onCreated }: { onCreated: (tempPassword: string) => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('teacher')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!fullName.trim() || !email.trim()) return

    setSubmitting(true)
    setError(null)

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
      setError(await extractInvokeError(invokeError, 'Could not register this staff member. Please try again.'))
      return
    }
    if (!data?.tempPassword) {
      setError('Could not register this staff member. Please try again.')
      return
    }

    setFullName('')
    setEmail('')
    setRole('teacher')
    setTitle('')
    setPhone('')
    onCreated(data.tempPassword)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
      <p className="font-display text-sm text-neutral-700">Register new staff</p>

      <div>
        <label className="text-xs text-neutral-500">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          disabled={submitting}
          required
          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-xs text-neutral-500">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          required
          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">Role</label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          >
            {EDITABLE_ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
            placeholder="e.g. Lead Teacher"
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-500">Phone (optional)</label>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={submitting}
          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
        />
      </div>

      {error && <ErrorState message={error} />}

      <button
        type="submit"
        disabled={submitting || !fullName.trim() || !email.trim()}
        className="min-h-tap w-full rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? 'Registering…' : 'Register staff member'}
      </button>
    </form>
  )
}

function MemberRow({
  member,
  isSelf,
  onChanged,
}: {
  member: StaffManageEntry
  isSelf: boolean
  onChanged: () => void
}) {
  const [draftRole, setDraftRole] = useState<UserRole>(member.role)
  const [draftTitle, setDraftTitle] = useState(member.title ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [togglingActive, setTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false)

  const dirty = draftRole !== member.role || draftTitle !== (member.title ?? '')

  async function handleSave() {
    setSaving(true)
    setSaveError(null)

    // Self-edits never include role — the select is hidden for isSelf, so
    // draftRole is never touched by the user, but we still omit it
    // explicitly here to make the self-lockout guard airtight.
    const patch: { role?: UserRole; title: string | null } = { title: draftTitle.trim() || null }
    if (!isSelf) patch.role = draftRole

    const { error } = await supabase.from('profiles').update(patch).eq('id', member.id)

    setSaving(false)
    if (error) {
      setSaveError(error.message || 'Could not save changes. Please try again.')
      return
    }
    onChanged()
  }

  async function handleToggleActive(nextActive: boolean) {
    setTogglingActive(true)
    setToggleError(null)

    const { error } = await supabase.from('profiles').update({ active: nextActive }).eq('id', member.id)

    setTogglingActive(false)
    setDeactivateConfirmOpen(false)
    if (error) {
      setToggleError(error.message || 'Could not update this member. Please try again.')
      return
    }
    onChanged()
  }

  return (
    <li className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar fullName={member.full_name} avatarUrl={member.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-base font-bold text-neutral-800">
              {member.full_name}
            </p>
            {!member.active && (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-2xs font-medium text-neutral-500">
                Inactive
              </span>
            )}
          </div>
          {member.email && <p className="truncate text-xs text-neutral-500">{member.email}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">Title</label>
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            disabled={saving}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Role</label>
          {isSelf ? (
            <p className="mt-1 flex min-h-tap items-center text-sm text-neutral-500">
              {EDITABLE_ROLES.find((option) => option.value === member.role)?.label ?? member.role}
            </p>
          ) : (
            <select
              value={draftRole}
              onChange={(event) => setDraftRole(event.target.value as UserRole)}
              disabled={saving}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
            >
              {EDITABLE_ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {saveError && <ErrorState message={saveError} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="min-h-tap rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        <Link
          to={`/staff/${member.id}`}
          className="min-h-tap flex items-center rounded-2xl border border-neutral-200 px-4 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Reset password
        </Link>

        {!isSelf && (
          member.active ? (
            <button
              type="button"
              onClick={() => setDeactivateConfirmOpen(true)}
              disabled={togglingActive}
              className="min-h-tap rounded-2xl border border-coral-200 px-4 text-sm text-coral-600 hover:bg-coral-50 disabled:opacity-50"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleToggleActive(true)}
              disabled={togglingActive}
              className="min-h-tap rounded-2xl border border-sage-200 px-4 text-sm text-sage-700 hover:bg-sage-50 disabled:opacity-50"
            >
              {togglingActive ? 'Reactivating…' : 'Reactivate'}
            </button>
          )
        )}
      </div>

      {toggleError && <ErrorState message={toggleError} />}

      <ConfirmDialog
        open={deactivateConfirmOpen}
        title="Deactivate this staff member?"
        message={`${member.full_name} will lose access until reactivated.`}
        confirmLabel="Deactivate"
        onConfirm={() => handleToggleActive(false)}
        onCancel={() => setDeactivateConfirmOpen(false)}
        loading={togglingActive}
      />
    </li>
  )
}

export function StaffManagePage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffManageEntry[]>([])

  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [newTempPassword, setNewTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')
    fetchStaffForManagement(profile.center_id).then(({ data, error }) => {
      if (error || !data) {
        setLoadError('Could not load staff. Please try again.')
        setLoadState('error')
        return
      }
      setMembers(data)
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadMembers()
  }, [profile])

  async function handleCopyTempPassword() {
    if (!newTempPassword) return
    try {
      await navigator.clipboard.writeText(newTempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied/unavailable — non-critical, fail quietly.
    }
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/staff" />
          <h1 className="font-display text-2xl text-neutral-800">Manage Staff</h1>
        </div>

        <button
          type="button"
          onClick={() => setShowRegisterForm((open) => !open)}
          className="min-h-tap w-full rounded-2xl border border-brand-200 bg-white font-display text-sm text-brand-700 shadow-card hover:bg-brand-50"
        >
          {showRegisterForm ? 'Cancel' : '+ Register new staff'}
        </button>

        {showRegisterForm && (
          <RegisterStaffForm
            onCreated={(tempPassword) => {
              setShowRegisterForm(false)
              setNewTempPassword(tempPassword)
              loadMembers()
            }}
          />
        )}

        {loadState === 'loading' && <LoadingState label="Loading staff…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && members.length === 0 && (
          <EmptyState message="No staff in this center yet." />
        )}

        {loadState === 'ready' && members.length > 0 && (
          <ul className="space-y-3">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.id === profile.id}
                onChanged={loadMembers}
              />
            ))}
          </ul>
        )}
      </div>

      {newTempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-card-lg">
            <h2 className="font-display text-lg text-neutral-800">Temporary password</h2>
            <p className="text-sm text-neutral-600">
              Give this temporary password to the new staff member. They must set a new password
              on first login.
            </p>
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
              <span className="font-display text-lg tracking-wide text-neutral-800">{newTempPassword}</span>
              <button
                type="button"
                onClick={handleCopyTempPassword}
                className="min-h-tap shrink-0 rounded-2xl border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNewTempPassword(null)}
              className="min-h-tap w-full rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
