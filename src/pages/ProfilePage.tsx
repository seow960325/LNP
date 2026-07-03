import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabaseClient'
import { validateAvatarFile, uploadAvatar, updateOwnProfile } from '../lib/profileApi'

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth()

  const initialized = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile && !initialized.current) {
      setFullName(profile.full_name)
      setPhone(profile.phone ?? '')
      setAvatarUrl(profile.avatar_url)
      initialized.current = true
    }
  }, [profile])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setEmail(data.user?.email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!profile) return null

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !profile) return

    const validationError = validateAvatarFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setUploading(true)

    const { publicUrl, error } = await uploadAvatar(profile.id, file)
    if (error || !publicUrl) {
      setUploading(false)
      toast.error('Could not upload the photo. Please try again.')
      return
    }

    const { error: saveError } = await updateOwnProfile(profile.id, { avatar_url: publicUrl })
    setUploading(false)
    if (saveError) {
      toast.error('Photo uploaded but could not be saved. Please try again.')
      return
    }

    setAvatarUrl(publicUrl)
    await refreshProfile()
    toast.success('Photo updated')
  }

  async function handleSaveDetails() {
    if (!profile || saving) return
    setSaving(true)

    const { error } = await updateOwnProfile(profile.id, {
      full_name: fullName.trim(),
      phone: phone.trim().length > 0 ? phone.trim() : null,
    })
    setSaving(false)
    if (error) {
      toast.error('Could not save your changes. Please try again.')
      return
    }
    await refreshProfile()
    toast.success('Profile saved')
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">My Profile</h1>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-card">
          <div className="relative inline-block">
            <Avatar fullName={fullName || profile.full_name} avatarUrl={avatarUrl} size="xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <p className="text-xs text-neutral-500">{uploading ? 'Uploading…' : 'Tap the camera to change your photo'}</p>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card-md">
          <div>
            <label className="text-xs text-neutral-500">Full name</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={saving}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm focus:border-brand-600 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={saving}
              placeholder="e.g. 012-345 6789"
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm focus:border-brand-600 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500">Email</label>
            <p className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              {email ?? '—'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveDetails}
            disabled={saving || fullName.trim().length === 0}
            className="min-h-tap w-full rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
