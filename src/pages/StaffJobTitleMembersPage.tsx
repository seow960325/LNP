import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { StaffCard } from '../components/StaffCard'
import { RegisterStaffForm, TempPasswordModal } from '../components/RegisterStaffForm'
import {
  fetchStaffDirectoryMembers,
  createStaffMember,
  updateStaffMember,
  toggleStaffMemberActive,
  fetchProfilesForLinking,
} from '../lib/profileApi'
import type { LinkableProfile, UpdateStaffMemberPatch, StaffDirectoryMember } from '../lib/profileApi'
import { fetchJobTitles } from '../lib/jobTitlesApi'
import type { JobTitle } from '../types'
import { getDirectoryPhotoSignedUrl } from '../lib/directoryPhotoApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import { staffLabel } from '../lib/helpers'

type LoadState = 'loading' | 'ready' | 'error'

export function StaffJobTitleMembersPage() {
  const { jobTitleId } = useParams<{ jobTitleId: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffDirectoryMember[]>([])
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({})

  // showAddForm controls only the standalone "add new member" form above the
  // list. Editing an existing row has no visibility flag of its own — the
  // inline form for a row renders whenever editingId === that row's id (see
  // the members map below), so at most one row can ever be in edit mode.
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formJobTitle, setFormJobTitle] = useState('')
  const [formJobTitleId, setFormJobTitleId] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formInDutyRoster, setFormInDutyRoster] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // "Create login" — a separate action from the staff_members form above,
  // since it creates an auth user + profiles row via admin-create-staff, not
  // a staff_members row. registerForStaffId tracks whether it was launched
  // from an existing directory row (link the new login to it on success) or
  // standalone from the top-level button (leave staff_members untouched).
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [registerForStaffId, setRegisterForStaffId] = useState<string | null>(null)
  const [newTempPassword, setNewTempPassword] = useState<string | null>(null)

  // "Link login" — attach an existing, not-yet-linked profile to a
  // staff_members row without creating a new auth user.
  const [linkTarget, setLinkTarget] = useState<StaffDirectoryMember | null>(null)
  const [availableProfiles, setAvailableProfiles] = useState<LinkableProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [linking, setLinking] = useState(false)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(Promise.all([fetchStaffDirectoryMembers(profile.center_id, true), fetchJobTitles(profile.center_id)]))
      .then(([membersRes, jobTitlesRes]) => {
        if (membersRes.error || !membersRes.data || jobTitlesRes.error || !jobTitlesRes.data) {
          setLoadError('Could not load the staff directory. Please try again.')
          setLoadState('error')
          return
        }
        setMembers(membersRes.data)
        setJobTitles(jobTitlesRes.data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const tileMembers = members.filter((m) =>
    jobTitleId === 'unassigned' ? !m.job_title_id : m.job_title_id === jobTitleId,
  )
  const activeMembers = tileMembers.filter((m) => m.active)
  const tileName =
    jobTitleId === 'unassigned' ? 'Unassigned' : jobTitles.find((jt) => jt.id === jobTitleId)?.name ?? 'Staff'

  // staff-photos is a private bucket — mint fresh signed URLs each load, and
  // fall back to the linked login's (public) avatar when there's no own photo.
  useEffect(() => {
    const withOwnPhoto = activeMembers.filter((m) => m.photo_path)
    if (withOwnPhoto.length === 0) return
    let cancelled = false

    Promise.all(withOwnPhoto.map(async (m) => [m.id, await getDirectoryPhotoSignedUrl(m.photo_path)] as const)).then(
      (entries) => {
        if (cancelled) return
        setPhotoUrls((current) => ({ ...current, ...Object.fromEntries(entries) }))
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members])

  function resolvePhotoUrl(member: StaffDirectoryMember): string | null {
    return (member.photo_path ? photoUrls[member.id] : undefined) ?? member.linked_avatar_url ?? null
  }

  function closeForm() {
    setFormName('')
    setFormDisplayName('')
    setFormJobTitle('')
    setFormJobTitleId(jobTitleId && jobTitleId !== 'unassigned' ? jobTitleId : '')
    setFormPhone('')
    setFormEmail('')
    setFormInDutyRoster(false)
    setEditingId(null)
    setEditingProfileId(null)
    setShowAddForm(false)
  }

  function startAdd() {
    closeForm()
    setShowAddForm(true)
  }

  function startEdit(member: StaffDirectoryMember) {
    closeForm()
    setEditingId(member.id)
    setEditingProfileId(member.profile_id)
    setFormName(member.full_name)
    setFormDisplayName(member.display_name || '')
    setFormJobTitle(member.job_title || '')
    setFormJobTitleId(member.job_title_id || '')
    setFormPhone(member.phone || '')
    setFormEmail(member.email || '')
    setFormInDutyRoster(member.in_duty_roster)
  }

  // A staff_members row with a linked login gets phone/email from that
  // person's own profile (edited on My Profile) — the staff_members columns
  // become dead weight for that row, so the form must not touch them. Only
  // applies while editing an existing row; a new row has no login yet.
  const contactManagedByProfile = !!editingId && !!editingProfileId

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!formName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      const payload = {
        full_name: formName.trim(),
        display_name: formDisplayName.trim() || null,
        job_title: formJobTitle.trim() || undefined,
        job_title_id: formJobTitleId || null,
        ...(contactManagedByProfile
          ? {}
          : { phone: formPhone.trim() || undefined, email: formEmail.trim() || undefined }),
        in_duty_roster: formInDutyRoster,
      }

      if (editingId) {
        const { error } = await withTimeout(updateStaffMember(editingId, payload))
        if (error) {
          toast.error('Failed to update staff member')
          return
        }
        toast.success('Staff member updated')
        closeForm()
      } else {
        const { error } = await withTimeout(createStaffMember(profile.center_id, payload))
        if (error) {
          toast.error('Failed to add staff member')
          return
        }
        toast.success('Staff member added')
        // Keep form open for bulk entry — just clear the fields
        setFormName('')
        setFormDisplayName('')
        setFormJobTitle('')
        setFormPhone('')
        setFormEmail('')
        setFormInDutyRoster(false)
      }

      loadMembers()
    } catch (err) {
      toast.error(getUserErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    if (submitting) return
    setSubmitting(true)
    try {
      const { error } = await toggleStaffMemberActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update staff status')
        return
      }
      toast.success(currentActive ? 'Staff member deactivated' : 'Staff member activated')
      loadMembers()
    } finally {
      setSubmitting(false)
    }
  }

  function openCreateLogin(staffId: string | null) {
    // Mutually exclusive with the staff_members add/edit form — only one
    // form on screen at a time.
    closeForm()
    setRegisterForStaffId(staffId)
    setShowRegisterForm(true)
  }

  function closeCreateLogin() {
    setShowRegisterForm(false)
    setRegisterForStaffId(null)
  }

  async function handleLoginCreated(userId: string, tempPassword: string, displayName: string) {
    if (registerForStaffId) {
      // Only sets display_name when one was actually entered — an empty
      // Short name here leaves whatever display_name the directory row
      // already has untouched, rather than clearing it.
      const patch: UpdateStaffMemberPatch = { profile_id: userId }
      if (displayName) patch.display_name = displayName
      const { error } = await updateStaffMember(registerForStaffId, patch)
      if (error) {
        toast.error('Login created, but could not link it to the staff record. Use Link login to attach it manually.')
      }
    }
    closeCreateLogin()
    setNewTempPassword(tempPassword)
    loadMembers()
  }

  // Loads candidate profiles for the Link login picker whenever it opens —
  // profiles in this center that no staff_members row already claims.
  useEffect(() => {
    if (!linkTarget || !profile) return
    let cancelled = false
    setLoadingProfiles(true)

    withTimeout(fetchProfilesForLinking(profile.center_id))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          toast.error('Could not load login accounts. Please try again.')
          setAvailableProfiles([])
          return
        }
        const linkedIds = new Set(members.filter((m) => m.profile_id).map((m) => m.profile_id))
        setAvailableProfiles(data.filter((p) => !linkedIds.has(p.id)))
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false)
      })

    return () => {
      cancelled = true
    }
  }, [linkTarget, profile, members])

  async function handleLinkProfile(profileId: string) {
    if (!linkTarget || linking) return
    setLinking(true)
    const { error } = await updateStaffMember(linkTarget.id, { profile_id: profileId })
    setLinking(false)
    if (error) {
      toast.error('Could not link this login. Please try again.')
      return
    }
    toast.success('Login linked')
    setLinkTarget(null)
    loadMembers()
  }

  // Shared by both the standalone "add" form (rendered above the list) and
  // the inline "edit" form (rendered inside the clicked row's <li>, replacing
  // its normal card content) — same fields, same state, same handleSubmit,
  // same validation either way. Which one is showing is entirely determined
  // by editingId: null means this is the add form, a matching id means it's
  // that row's inline edit form.
  function renderStaffForm() {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
        <p className="font-semibold text-sm text-ink">{editingId ? 'Edit staff member' : 'Add new staff member'}</p>

        <div>
          <label className="text-xs text-muted">Name *</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            disabled={submitting}
            required
            placeholder="e.g. Tan Chi Ming"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Short name</label>
          <input
            type="text"
            value={formDisplayName}
            onChange={(e) => setFormDisplayName(e.target.value)}
            disabled={submitting}
            maxLength={4}
            placeholder={formName.trim() ? staffLabel({ full_name: formName }) : undefined}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Job title (group)</label>
          <select
            value={formJobTitleId}
            onChange={(e) => setFormJobTitleId(e.target.value)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {/* Deactivated titles drop out of this picker (per Job Titles
                management), except the one currently assigned to whoever
                is being edited — otherwise their existing value would
                silently vanish from the list rather than showing what's
                actually set. */}
            {jobTitles
              .filter((jt) => jt.active || jt.id === formJobTitleId)
              .map((jt) => (
                <option key={jt.id} value={jt.id}>
                  {jt.name}
                  {!jt.active ? ' (inactive)' : ''}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted">Job title (label)</label>
          <input
            type="text"
            value={formJobTitle}
            onChange={(e) => setFormJobTitle(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Teacher"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        {contactManagedByProfile ? (
          <p className="text-xs text-muted">Managed by this person in My Profile.</p>
        ) : (
          <>
            <div>
              <label className="text-xs text-muted">Phone</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                disabled={submitting}
                placeholder="e.g. 012-3456789"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={submitting}
                placeholder="e.g. name@example.com"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>
          </>
        )}

        <div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={formInDutyRoster}
              onChange={(e) => setFormInDutyRoster(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-line disabled:opacity-60"
            />
            Assign duty roster
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
          >
            {editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    )
  }

  if (!profile || !jobTitleId) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title={tileName} />

        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (showAddForm) {
                  closeForm()
                } else {
                  closeCreateLogin()
                  startAdd()
                }
              }}
              className="min-h-tap flex-1 rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
            >
              {showAddForm ? 'Cancel' : '+ Add staff member'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (showRegisterForm) {
                  closeCreateLogin()
                } else {
                  openCreateLogin(null)
                }
              }}
              className="min-h-tap flex-1 rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
            >
              {showRegisterForm ? 'Cancel' : '+ Create login'}
            </button>
          </div>
        )}

        {isAdmin && showRegisterForm && (
          <div className="space-y-2">
            {registerForStaffId && (
              <p className="text-xs text-muted">
                Creating a login for{' '}
                <span className="font-semibold text-ink">
                  {members.find((m) => m.id === registerForStaffId)?.full_name ?? 'this staff member'}
                </span>{' '}
                — it will be linked to their directory entry automatically.
              </p>
            )}
            <RegisterStaffForm callerRole={profile.role} onCreated={handleLoginCreated} />
          </div>
        )}

        {isAdmin && showAddForm && renderStaffForm()}

        {loadState === 'loading' && <LoadingState label="Loading staff…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={loadMembers} />}

        {loadState === 'ready' && activeMembers.length === 0 && (
          <EmptyState message="No active staff members in this group yet." />
        )}

        {loadState === 'ready' && activeMembers.length > 0 && (
          <ul className="space-y-3">
            {activeMembers.map((member) =>
              isAdmin && editingId === member.id ? (
                <li key={member.id}>{renderStaffForm()}</li>
              ) : (
                <StaffCard
                  key={member.id}
                  member={member}
                  photoUrl={resolvePhotoUrl(member)}
                  isAdmin={isAdmin}
                  submitting={submitting}
                  onEdit={startEdit}
                  onToggleActive={handleToggleActive}
                  onCreateLogin={openCreateLogin}
                  onLinkLogin={setLinkTarget}
                />
              ),
            )}
          </ul>
        )}
      </div>

      {newTempPassword && (
        <TempPasswordModal
          password={newTempPassword}
          description="Give this temporary password to the new staff member. They must set a new password on first login."
          onClose={() => setNewTempPassword(null)}
        />
      )}

      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-card-lg">
            <h2 className="font-semibold text-lg text-ink">Link login for {linkTarget.full_name}</h2>
            <p className="text-xs text-muted">Choose an existing login account in this center to attach.</p>

            {loadingProfiles && <LoadingState label="Loading login accounts…" />}
            {!loadingProfiles && availableProfiles.length === 0 && (
              <EmptyState message="No unlinked login accounts in this center." />
            )}
            {!loadingProfiles && availableProfiles.length > 0 && (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {availableProfiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleLinkProfile(p.id)}
                      disabled={linking}
                      className="min-h-tap w-full rounded-xl border border-line px-3 text-left text-sm text-ink hover:bg-cream disabled:opacity-60"
                    >
                      {p.full_name} <span className="text-xs text-muted">({p.role})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setLinkTarget(null)}
              disabled={linking}
              className="min-h-tap w-full rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
