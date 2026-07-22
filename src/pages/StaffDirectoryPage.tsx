import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, directoryTabs } from '../components/TabNav'
import { RegisterStaffForm, TempPasswordModal } from '../components/RegisterStaffForm'
import {
  fetchStaffMembers,
  createStaffMember,
  updateStaffMember,
  toggleStaffMemberActive,
  fetchProfilesForLinking,
} from '../lib/profileApi'
import type { LinkableProfile } from '../lib/profileApi'
import type { StaffMember } from '../types'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function StaffDirectoryPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffMember[]>([])
  const [rosterTab, setRosterTab] = useState<'active' | 'past'>('active')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formJobTitle, setFormJobTitle] = useState('')
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
  const [linkTarget, setLinkTarget] = useState<StaffMember | null>(null)
  const [availableProfiles, setAvailableProfiles] = useState<LinkableProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [linking, setLinking] = useState(false)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(fetchStaffMembers(profile.center_id))
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load the staff directory. Please try again.')
          setLoadState('error')
          return
        }
        setMembers(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadMembers()
  }, [profile])

  function cancelEdit() {
    setFormName('')
    setFormJobTitle('')
    setFormPhone('')
    setFormEmail('')
    setFormInDutyRoster(false)
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id)
    setFormName(member.full_name)
    setFormJobTitle(member.job_title || '')
    setFormPhone(member.phone || '')
    setFormEmail(member.email || '')
    setFormInDutyRoster(member.in_duty_roster)
    setShowForm(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      const payload = {
        full_name: formName.trim(),
        job_title: formJobTitle.trim() || undefined,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        in_duty_roster: formInDutyRoster,
      }

      if (editingId) {
        const { error } = await withTimeout(updateStaffMember(editingId, payload))
        if (error) {
          toast.error('Failed to update staff member')
          return
        }
        toast.success('Staff member updated')
        cancelEdit()
      } else {
        const { error } = await withTimeout(createStaffMember(profile.center_id, payload))
        if (error) {
          toast.error('Failed to add staff member')
          return
        }
        toast.success('Staff member added')
        // Keep form open for bulk entry — just clear the fields
        setFormName('')
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
    cancelEdit()
    setRegisterForStaffId(staffId)
    setShowRegisterForm(true)
  }

  function closeCreateLogin() {
    setShowRegisterForm(false)
    setRegisterForStaffId(null)
  }

  async function handleLoginCreated(userId: string, tempPassword: string) {
    if (registerForStaffId) {
      const { error } = await updateStaffMember(registerForStaffId, { profile_id: userId })
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
    if (!linkTarget) return
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

  if (!profile) return null

  const activeMembers = members.filter((m) => m.active)
  const pastMembers = members.filter((m) => !m.active)
  const visibleMembers = rosterTab === 'active' ? activeMembers : pastMembers

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Staff Directory" fallback="/" />

        <TabNav tabs={directoryTabs(isAdmin)} />

        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
          <button
            type="button"
            onClick={() => setRosterTab('active')}
            className={`min-h-tap flex-1 rounded-lg font-semibold text-sm transition-colors duration-150 ${
              rosterTab === 'active' ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:bg-accent-soft/40 hover:text-ink'
            }`}
          >
            Active ({activeMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setRosterTab('past')}
            className={`min-h-tap flex-1 rounded-lg font-semibold text-sm transition-colors duration-150 ${
              rosterTab === 'past' ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:bg-accent-soft/40 hover:text-ink'
            }`}
          >
            Past ({pastMembers.length})
          </button>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  cancelEdit()
                } else {
                  closeCreateLogin()
                  setShowForm(true)
                }
              }}
              className="min-h-tap flex-1 rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
            >
              {showForm ? 'Cancel' : '+ Add staff member'}
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

        {isAdmin && showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">
              {editingId ? 'Edit staff member' : 'Add new staff member'}
            </p>

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
              <label className="text-xs text-muted">Job title</label>
              <input
                type="text"
                value={formJobTitle}
                onChange={(e) => setFormJobTitle(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Teacher"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

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
              <p className="mt-1 pl-6 text-2xs text-muted/70">Takes effect after the roster migration</p>
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
                  onClick={cancelEdit}
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {loadState === 'loading' && <LoadingState label="Loading the directory…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && members.length === 0 && (
          <EmptyState message="No staff members yet. Add one to get started." />
        )}

        {loadState === 'ready' && members.length > 0 && visibleMembers.length === 0 && (
          <EmptyState message={rosterTab === 'active' ? 'No active staff members.' : 'No past staff members.'} />
        )}

        {loadState === 'ready' && visibleMembers.length > 0 && (
          <ul className="space-y-3">
            {visibleMembers.map((member) => (
              <li key={member.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <Avatar fullName={member.full_name} avatarUrl={null} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-ink">
                          {member.full_name}
                          {member.profile_id && (
                            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-2xs font-semibold text-accent-hover">
                              Has login
                            </span>
                          )}
                        </p>
                        {member.job_title && <p className="mt-1 text-sm text-muted">{member.job_title}</p>}
                        {member.phone && <p className="mt-1 text-xs text-muted">{member.phone}</p>}
                        {member.email && <p className="text-xs text-muted">{member.email}</p>}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => startEdit(member)}
                        disabled={submitting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(member.id, member.active)}
                        disabled={submitting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        {member.active ? 'Deactivate' : 'Activate'}
                      </button>
                      {!member.profile_id && (
                        <>
                          <button
                            type="button"
                            onClick={() => openCreateLogin(member.id)}
                            disabled={submitting}
                            className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                          >
                            Create login
                          </button>
                          <button
                            type="button"
                            onClick={() => setLinkTarget(member)}
                            disabled={submitting}
                            className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                          >
                            Link login
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
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
