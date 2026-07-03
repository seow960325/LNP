import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StaffDocPanel } from '../components/StaffDocPanel'
import { EDITABLE_ROLES, TempPasswordModal } from '../components/RegisterStaffForm'
import { fetchProfileById } from '../lib/profileApi'
import { supabase } from '../lib/supabaseClient'
import type { Profile, UserRole } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

// Role options for the promote-via-detail-page editor. Unlike
// RegisterStaffForm's EDITABLE_ROLES (creation — super_admin is never
// creatable there), this list adds super_admin: whenever this select
// renders at all, the caller already restricted it to canEditRole, which
// itself requires viewerIsSuperAdmin — so offering the promotion here is
// safe. 'parent' is never offered.
const PROMOTABLE_ROLES: { value: UserRole; label: string }[] = [
  ...EDITABLE_ROLES,
  { value: 'super_admin', label: 'Super Admin' },
]

// Management controls visible to admin + super_admin on another member's
// detail page — gated further by the owner/super_admin exclusion rules
// computed in StaffMemberDetailPage (canManageTarget) before this even
// renders. Role editing is further restricted to canEditRole (super_admin
// && !isSelf && !targetIsOwner) by the caller — this component itself has
// no role prop when it shouldn't render the role select, so there's no way
// to accidentally show it.
function ManagementSection({
  member,
  isSelf,
  canEditRole,
  onChanged,
}: {
  member: Profile
  isSelf: boolean
  canEditRole: boolean
  onChanged: (updated: Profile) => void
}) {
  const [draftRole, setDraftRole] = useState<UserRole>(member.role)
  const [draftTitle, setDraftTitle] = useState(member.title ?? '')
  const [saving, setSaving] = useState(false)

  const [togglingActive, setTogglingActive] = useState(false)
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false)

  const [togglingPaid, setTogglingPaid] = useState(false)

  const dirty = draftRole !== member.role || draftTitle !== (member.title ?? '')

  async function handleSave() {
    setSaving(true)

    // Role is only ever included in the patch when canEditRole is true, so
    // an admin (or a super_admin viewing their own row) can never send a
    // role change even if this function were somehow reached with one drafted.
    const roleChanged = canEditRole && draftRole !== member.role
    const patch: { role?: UserRole; title: string | null } = { title: draftTitle.trim() || null }
    if (canEditRole) patch.role = draftRole

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', member.id)
      .select()
      .single()

    setSaving(false)
    if (error || !data) {
      toast.error('Could not save changes. Please try again.')
      return
    }
    onChanged(data as Profile)
    toast.success(roleChanged ? 'Role updated' : 'Title updated')
  }

  async function handleToggleActive(nextActive: boolean) {
    setTogglingActive(true)

    const { data, error } = await supabase
      .from('profiles')
      .update({ active: nextActive })
      .eq('id', member.id)
      .select()
      .single()

    setTogglingActive(false)
    setDeactivateConfirmOpen(false)
    if (error || !data) {
      toast.error('Could not update this member. Please try again.')
      return
    }
    onChanged(data as Profile)
    toast.success(nextActive ? 'Staff reactivated' : 'Staff deactivated')
  }

  async function handleTogglePaid(nextPaid: boolean) {
    setTogglingPaid(true)

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_paid_employee: nextPaid })
      .eq('id', member.id)
      .select()
      .single()

    setTogglingPaid(false)
    if (error || !data) {
      toast.error('Could not update this member. Please try again.')
      return
    }
    onChanged(data as Profile)
    toast.success(nextPaid ? 'Marked as paid employee' : 'Marked as non-paid employee')
  }

  return (
    <div className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
      <p className="font-display text-sm text-neutral-700">Management</p>

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
        {canEditRole && (
          <div>
            <label className="text-xs text-neutral-500">Role</label>
            <select
              value={draftRole}
              onChange={(event) => setDraftRole(event.target.value as UserRole)}
              disabled={saving}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
            >
              {PROMOTABLE_ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          checked={member.is_paid_employee}
          onChange={(event) => handleTogglePaid(event.target.checked)}
          disabled={togglingPaid}
          className="h-4 w-4 rounded border-neutral-300 disabled:opacity-60"
        />
        Paid employee
        {togglingPaid && <span className="text-2xs text-neutral-400">Saving…</span>}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="min-h-tap rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

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

      <ConfirmDialog
        open={deactivateConfirmOpen}
        title="Deactivate this staff member?"
        message={`${member.full_name} will lose access until reactivated.`}
        confirmLabel="Deactivate"
        onConfirm={() => handleToggleActive(false)}
        onCancel={() => setDeactivateConfirmOpen(false)}
        loading={togglingActive}
      />
    </div>
  )
}

export function StaffMemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [member, setMember] = useState<Profile | null>(null)

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadState('loading')

    fetchProfileById(id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load this staff member. Please try again.')
        setLoadState('error')
        return
      }
      setMember(data)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [id])

  if (!profile || !id) return null

  const viewerIsSuperAdmin = profile.role === 'super_admin'
  const viewerIsOwner = profile.is_app_owner === true

  // Two independent exclusion rules, both must clear for the viewer to be
  // allowed to manage this target at all:
  //   - only the owner may manage the owner (even other super_admins can't)
  //   - only a super_admin may manage a super_admin (admins can't)
  const targetIsOwner = member?.is_app_owner === true
  const targetIsSuperAdmin = member?.role === 'super_admin'
  const canManageTarget = !(targetIsOwner && !viewerIsOwner) && !(targetIsSuperAdmin && !viewerIsSuperAdmin)

  const showManagement = isAdmin && canManageTarget
  const canReset = isAdmin && id !== profile.id && canManageTarget
  // Role editor is further restricted beyond canManageTarget: only a
  // super_admin may promote/change roles, never on their own row, and never
  // on the owner's row (the owner's role is never editable via UI).
  const canEditRole = viewerIsSuperAdmin && id !== profile.id && !targetIsOwner

  async function handleResetConfirm() {
    if (!id) return
    setResetting(true)

    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { targetUserId: id },
    })

    setResetting(false)

    if (error) {
      let message = 'Could not reset this password. Please try again.'
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json()
          if (body?.error) message = body.error
        } catch {
          // Body wasn't JSON — fall back to the generic message.
        }
      }
      toast.error(message)
      setResetConfirmOpen(false)
      return
    }

    setResetConfirmOpen(false)
    setTempPassword(data?.tempPassword ?? null)
    toast.success('Password reset')
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/staff" />
          <h1 className="font-display text-2xl text-neutral-800">Staff Member</h1>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && member && (
          <>
            <div className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card">
              <Avatar fullName={member.full_name} avatarUrl={member.avatar_url} size="xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold text-neutral-800">
                  {member.full_name}
                </p>
                <p className="text-sm text-neutral-500">{member.title || 'Staff'}</p>
                {member.email && <p className="mt-1 truncate text-xs text-neutral-500">{member.email}</p>}
                {member.phone && <p className="text-xs text-neutral-500">{member.phone}</p>}
              </div>
            </div>

            {showManagement && (
              <ManagementSection
                member={member}
                isSelf={id === profile.id}
                canEditRole={canEditRole}
                onChanged={setMember}
              />
            )}

            {canReset && (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="min-h-tap w-full rounded-2xl border border-coral-200 bg-white font-display text-sm text-coral-600 shadow-card hover:bg-coral-50"
              >
                Reset password
              </button>
            )}

            {/* canManageTarget also downgrades documents to read-only for
                the owner/super_admin exclusion cases — "read-only profile +
                documents" for e.g. a non-owner super_admin viewing the owner. */}
            {isAdmin && <StaffDocPanel ownerId={id} canManage={canManageTarget} />}
            {!isAdmin && id === profile.id && <StaffDocPanel ownerId={id} canManage={false} />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset password?"
        message={`Reset password for ${member?.full_name ?? 'this staff member'}?`}
        confirmLabel="Reset"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetConfirmOpen(false)}
        loading={resetting}
      />

      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          description={`Give this temporary password to ${member?.full_name}. They will be required to set a new password on next login.`}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  )
}
