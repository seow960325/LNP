import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { DirectoryPhotoUpload } from '../components/DirectoryPhotoUpload'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StaffDocPanel } from '../components/StaffDocPanel'
import { EDITABLE_ROLES, TempPasswordModal } from '../components/RegisterStaffForm'
import { fetchStaffMemberById, fetchProfileById, updateStaffMember, PROFILE_COLUMNS, resolveAvatarUrl } from '../lib/profileApi'
import type { StaffDirectoryMember, ProfileSummary } from '../lib/profileApi'
import { getDirectoryPhotoSignedUrl } from '../lib/directoryPhotoApi'
import { supabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import type { UserRole } from '../types'

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
// linked login — gated further by the owner/super_admin exclusion rules
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
  member: ProfileSummary
  isSelf: boolean
  canEditRole: boolean
  onChanged: (updated: ProfileSummary) => void
}) {
  const [draftRole, setDraftRole] = useState<UserRole>(member.role)
  const [draftTitle, setDraftTitle] = useState(member.title ?? '')
  const [saving, setSaving] = useState(false)

  const [togglingActive, setTogglingActive] = useState(false)
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false)

  const [togglingPaid, setTogglingPaid] = useState(false)

  const dirty = draftRole !== member.role || draftTitle !== (member.title ?? '')

  async function handleSave() {
    if (saving) return
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
      .select(PROFILE_COLUMNS)
      .single()

    setSaving(false)
    if (error || !data) {
      toast.error('Could not save changes. Please try again.')
      return
    }
    onChanged(data as ProfileSummary)
    toast.success(roleChanged ? 'Role updated' : 'Title updated')
  }

  async function handleToggleActive(nextActive: boolean) {
    if (togglingActive) return
    setTogglingActive(true)

    const { data, error } = await supabase
      .from('profiles')
      .update({ active: nextActive })
      .eq('id', member.id)
      .select(PROFILE_COLUMNS)
      .single()

    setTogglingActive(false)
    setDeactivateConfirmOpen(false)
    if (error || !data) {
      toast.error('Could not update this member. Please try again.')
      return
    }
    onChanged(data as ProfileSummary)
    toast.success(nextActive ? 'Staff reactivated' : 'Staff deactivated')
  }

  async function handleTogglePaid(nextPaid: boolean) {
    if (togglingPaid) return
    setTogglingPaid(true)

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_paid_employee: nextPaid })
      .eq('id', member.id)
      .select(PROFILE_COLUMNS)
      .single()

    setTogglingPaid(false)
    if (error || !data) {
      toast.error('Could not update this member. Please try again.')
      return
    }
    onChanged(data as ProfileSummary)
    toast.success(nextPaid ? 'Marked as paid employee' : 'Marked as non-paid employee')
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-5 shadow-card">
      <p className="font-semibold text-sm text-ink">Management</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Title</label>
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            disabled={saving}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          />
        </div>
        {canEditRole && (
          <div>
            <label className="text-xs text-muted">Role</label>
            <select
              value={draftRole}
              onChange={(event) => setDraftRole(event.target.value as UserRole)}
              disabled={saving}
              className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
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

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={member.is_paid_employee}
          onChange={(event) => handleTogglePaid(event.target.checked)}
          disabled={togglingPaid}
          className="h-4 w-4 rounded border-line disabled:opacity-60"
        />
        Paid employee
        {togglingPaid && <span className="text-2xs text-muted/70">Saving…</span>}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="min-h-tap rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {!isSelf && (
          member.active ? (
            <button
              type="button"
              onClick={() => setDeactivateConfirmOpen(true)}
              disabled={togglingActive}
              className="min-h-tap rounded-xl border border-danger/20 px-4 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleToggleActive(true)}
              disabled={togglingActive}
              className="min-h-tap rounded-xl border border-success/30 px-4 text-sm text-success hover:bg-success-soft disabled:opacity-50"
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
  const [retryKey, setRetryKey] = useState(0)
  const [staffMember, setStaffMember] = useState<StaffDirectoryMember | null>(null)
  const [linkedProfile, setLinkedProfile] = useState<ProfileSummary | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(fetchStaffMemberById(id))
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load this staff member. Please try again.')
          setLoadState('error')
          return
        }
        setStaffMember(data)

        if (data.profile_id) {
          const { data: profileData } = await withTimeout(fetchProfileById(data.profile_id))
          if (cancelled) return
          setLinkedProfile(profileData)
        } else {
          setLinkedProfile(null)
        }
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [id, retryKey])

  // staff-photos and avatars are both private buckets — mint a fresh signed
  // URL each load. linked_avatar_url may be a path (new uploads) or a
  // legacy public URL (old rows); resolveAvatarUrl handles both.
  useEffect(() => {
    let cancelled = false
    if (!staffMember?.photo_path) {
      resolveAvatarUrl(staffMember?.linked_avatar_url ?? null).then((url) => {
        if (!cancelled) setPhotoUrl(url)
      })
      return () => {
        cancelled = true
      }
    }
    getDirectoryPhotoSignedUrl(staffMember.photo_path).then((url) => {
      if (cancelled) return
      if (url) {
        setPhotoUrl(url)
        return
      }
      resolveAvatarUrl(staffMember.linked_avatar_url ?? null).then((fallbackUrl) => {
        if (!cancelled) setPhotoUrl(fallbackUrl)
      })
    })
    return () => {
      cancelled = true
    }
  }, [staffMember?.photo_path, staffMember?.linked_avatar_url])

  if (!profile || !id) return null

  const viewerIsSuperAdmin = profile.role === 'super_admin'
  const viewerIsOwner = profile.is_app_owner === true

  // Two independent exclusion rules, both must clear for the viewer to be
  // allowed to manage this target at all:
  //   - only the owner may manage the owner (even other super_admins can't)
  //   - only a super_admin may manage a super_admin (admins can't)
  const targetIsOwner = linkedProfile?.is_app_owner === true
  const targetIsSuperAdmin = linkedProfile?.role === 'super_admin'
  const canManageTarget = !(targetIsOwner && !viewerIsOwner) && !(targetIsSuperAdmin && !viewerIsSuperAdmin)

  const isSelf = linkedProfile?.id === profile.id
  const showManagement = isAdmin && !!linkedProfile && canManageTarget
  const canReset = isAdmin && !!linkedProfile && !isSelf && canManageTarget
  // Role editor is further restricted beyond canManageTarget: only a
  // super_admin may promote/change roles, never on their own row, and never
  // on the owner's row (the owner's role is never editable via UI).
  const canEditRole = viewerIsSuperAdmin && !isSelf && !targetIsOwner

  async function handleResetConfirm() {
    if (!linkedProfile || resetting) return
    setResetting(true)

    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { targetUserId: linkedProfile.id },
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

  async function handlePhotoUploaded(photoPath: string) {
    if (!staffMember) return
    const { error } = await updateStaffMember(staffMember.id, { photo_path: photoPath })
    if (error) {
      toast.error('Photo uploaded but could not be saved. Please try again.')
      return
    }
    setStaffMember({ ...staffMember, photo_path: photoPath })
  }

  const parentOverride = staffMember ? `/directory/staff/${staffMember.job_title_id ?? 'unassigned'}` : undefined

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Staff Member" parentOverride={parentOverride} />

        {loadState === 'loading' && <LoadingState label="Loading…" />}
        {loadState === 'error' && (
          <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={() => setRetryKey((k) => k + 1)} />
        )}

        {loadState === 'ready' && staffMember && (
          <>
            <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-card">
              {isAdmin ? (
                <DirectoryPhotoUpload
                  scope="staff"
                  id={staffMember.id}
                  fullName={staffMember.display_name || staffMember.full_name}
                  photoUrl={photoUrl}
                  onUploaded={handlePhotoUploaded}
                />
              ) : (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full shadow-card">
                  {photoUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <img src={photoUrl} alt={staffMember.full_name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-accent-soft font-bold text-accent-hover">
                      {(staffMember.display_name || staffMember.full_name).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-ink">
                  {staffMember.full_name}
                  {staffMember.profile_id && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 align-middle text-2xs font-semibold ${
                        staffMember.must_change_password ? 'bg-line/70 text-muted' : 'bg-cyan-100 text-cyan-700'
                      }`}
                    >
                      {staffMember.must_change_password ? 'Invited' : 'Registered'}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted">{staffMember.job_title_name || 'Staff'}</p>
                {staffMember.email && <p className="mt-1 truncate text-xs text-muted">{staffMember.email}</p>}
                {staffMember.phone && <p className="text-xs text-muted">{staffMember.phone}</p>}
              </div>
            </div>

            {showManagement && linkedProfile && (
              <ManagementSection
                member={linkedProfile}
                isSelf={isSelf}
                canEditRole={canEditRole}
                onChanged={setLinkedProfile}
              />
            )}

            {canReset && (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="min-h-tap w-full rounded-xl border border-danger/20 bg-white font-semibold text-sm text-danger shadow-card hover:bg-danger/10"
              >
                Reset password
              </button>
            )}

            {/* canManageTarget also downgrades documents to read-only for
                the owner/super_admin exclusion cases — "read-only profile +
                documents" for e.g. a non-owner super_admin viewing the owner. */}
            {isAdmin && linkedProfile && <StaffDocPanel ownerId={linkedProfile.id} canManage={canManageTarget} />}
            {!isAdmin && isSelf && linkedProfile && <StaffDocPanel ownerId={linkedProfile.id} canManage={false} />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset password?"
        message={`Reset password for ${staffMember?.full_name ?? 'this staff member'}?`}
        confirmLabel="Reset"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetConfirmOpen(false)}
        loading={resetting}
      />

      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          description={`Give this temporary password to ${staffMember?.full_name}. They will be required to set a new password on next login.`}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  )
}
