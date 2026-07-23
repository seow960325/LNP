import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { DirectoryPhotoUpload } from '../components/DirectoryPhotoUpload'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchShareholderById, updateShareholding } from '../lib/shareholdingsApi'
import type { ShareholderDirectoryEntry } from '../lib/shareholdingsApi'
import { fetchStaffMembers, updateStaffMember, resolveAvatarUrl } from '../lib/profileApi'
import type { StaffMember } from '../types'
import { getDirectoryPhotoSignedUrl } from '../lib/directoryPhotoApi'
import { formatMYR } from '../lib/zohoFinance'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function ShareholderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shareholding, setShareholding] = useState<ShareholderDirectoryEntry | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [phoneDraft, setPhoneDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  const [staffOptions, setStaffOptions] = useState<StaffMember[]>([])
  const [linkChoice, setLinkChoice] = useState('')
  const [linking, setLinking] = useState(false)

  function load() {
    if (!id) return
    setLoadState('loading')

    withTimeout(fetchShareholderById(id))
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load this shareholder. Please try again.')
          setLoadState('error')
          return
        }
        setShareholding(data)
        setPhoneDraft(data.phone ?? '')
        setEmailDraft(data.email ?? '')
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(load, [id])

  useEffect(() => {
    if (!isAdmin || !profile) return
    withTimeout(fetchStaffMembers(profile.center_id)).then(({ data }) => {
      if (data) setStaffOptions(data.filter((m) => m.active))
    })
  }, [isAdmin, profile])

  const photoPath = shareholding?.linked_staff ? shareholding.linked_staff.photo_path : shareholding?.photo_path ?? null

  // staff-photos and avatars are both private buckets — linked_staff's own
  // photo_path wins, falling back to their login's avatar (path or legacy
  // public URL, resolveAvatarUrl handles both) only when there's no own photo.
  useEffect(() => {
    let cancelled = false
    if (!photoPath) {
      resolveAvatarUrl(shareholding?.linked_staff?.profile_avatar_url ?? null).then((url) => {
        if (!cancelled) setPhotoUrl(url)
      })
      return () => {
        cancelled = true
      }
    }
    getDirectoryPhotoSignedUrl(photoPath).then((url) => {
      if (cancelled) return
      if (url) {
        setPhotoUrl(url)
        return
      }
      resolveAvatarUrl(shareholding?.linked_staff?.profile_avatar_url ?? null).then((fallbackUrl) => {
        if (!cancelled) setPhotoUrl(fallbackUrl)
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPath])

  if (!profile || !id) return null

  const contactPhone = shareholding?.phone ?? null
  const contactEmail = shareholding?.email ?? null

  async function handlePhotoUploaded(newPhotoPath: string) {
    if (!shareholding) return
    // "Edit once, reflects both places" — when linked, the photo belongs to
    // the staff record (it wins the display priority anyway); only a pure
    // shareholder's upload writes to shareholdings.photo_path directly.
    if (shareholding.linked_staff) {
      const { error } = await updateStaffMember(shareholding.linked_staff.id, { photo_path: newPhotoPath })
      if (error) {
        toast.error('Photo uploaded but could not be saved. Please try again.')
        return
      }
    } else {
      const { error } = await updateShareholding(shareholding.id, { photo_path: newPhotoPath })
      if (error) {
        toast.error('Photo uploaded but could not be saved. Please try again.')
        return
      }
    }
    load()
  }

  async function handleSaveContact() {
    if (!shareholding || savingContact) return
    setSavingContact(true)
    const { error } = await updateShareholding(shareholding.id, {
      phone: phoneDraft.trim() || null,
      email: emailDraft.trim() || null,
    })
    setSavingContact(false)
    if (error) {
      toast.error('Could not save contact details. Please try again.')
      return
    }
    toast.success('Contact details saved')
    load()
  }

  async function handleLinkStaff() {
    if (!shareholding || !linkChoice || linking) return
    setLinking(true)
    const { error } = await updateShareholding(shareholding.id, { staff_member_id: linkChoice })
    setLinking(false)
    if (error) {
      toast.error('Could not link staff member. Please try again.')
      return
    }
    toast.success('Linked to staff record')
    setLinkChoice('')
    load()
  }

  async function handleUnlinkStaff() {
    if (!shareholding || linking) return
    setLinking(true)
    const { error } = await updateShareholding(shareholding.id, { staff_member_id: null })
    setLinking(false)
    if (error) {
      toast.error('Could not unlink. Please try again.')
      return
    }
    toast.success('Unlinked from staff record')
    load()
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Shareholder" parentOverride="/directory/shareholder" />

        {loadState === 'loading' && <LoadingState label="Loading…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={load} />}

        {loadState === 'ready' && shareholding && (
          <>
            <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-card">
              {isAdmin ? (
                <DirectoryPhotoUpload
                  scope={shareholding.linked_staff ? 'staff' : 'shareholder'}
                  id={shareholding.linked_staff ? shareholding.linked_staff.id : shareholding.id}
                  fullName={shareholding.display_name}
                  photoUrl={photoUrl}
                  onUploaded={handlePhotoUploaded}
                />
              ) : (
                <Avatar fullName={shareholding.display_name} avatarUrl={photoUrl} size="xl" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-ink">{shareholding.display_name}</p>
                <p className="text-sm font-semibold tabular-nums text-accent-hover">{formatMYR(shareholding.capital)}</p>
                {contactEmail && <p className="mt-1 truncate text-xs text-muted">{contactEmail}</p>}
                {contactPhone && <p className="text-xs text-muted">{contactPhone}</p>}
              </div>
            </div>

            {shareholding.linked_staff && (
              <Link
                to={`/staff/${shareholding.linked_staff.id}`}
                className="flex min-h-tap w-full items-center justify-center rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
              >
                View directory profile
              </Link>
            )}

            {isAdmin && !shareholding.linked_staff && (
              <div className="space-y-3 rounded-xl bg-white p-5 shadow-card">
                <p className="font-semibold text-sm text-ink">Contact</p>
                <div>
                  <label className="text-xs text-muted">Phone</label>
                  <input
                    type="tel"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    disabled={savingContact}
                    className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Email</label>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    disabled={savingContact}
                    className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveContact}
                  disabled={savingContact}
                  className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                >
                  {savingContact ? 'Saving…' : 'Save contact'}
                </button>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-3 rounded-xl bg-white p-5 shadow-card">
                <p className="font-semibold text-sm text-ink">Staff record link</p>
                <p className="text-xs text-muted">
                  Linking to a staff record shares contact info and photo both ways, and adds a "View staff profile" link.
                </p>
                {shareholding.linked_staff ? (
                  <button
                    type="button"
                    onClick={handleUnlinkStaff}
                    disabled={linking}
                    className="min-h-tap w-full rounded-xl border border-danger/20 text-sm text-danger hover:bg-danger/10 disabled:opacity-60"
                  >
                    Unlink from {shareholding.linked_staff.full_name}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={linkChoice}
                      onChange={(e) => setLinkChoice(e.target.value)}
                      disabled={linking}
                      className="min-h-tap flex-1 rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                    >
                      <option value="">Choose staff member…</option>
                      {staffOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleLinkStaff}
                      disabled={linking || !linkChoice}
                      className="min-h-tap rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                    >
                      Link
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
