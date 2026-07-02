import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StaffDocPanel } from '../components/StaffDocPanel'
import { fetchProfileById } from '../lib/profileApi'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

export function StaffMemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [member, setMember] = useState<Profile | null>(null)

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const canReset = isAdmin && id !== profile.id

  async function handleResetConfirm() {
    if (!id) return
    setResetting(true)
    setResetError(null)

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
      setResetError(message)
      setResetConfirmOpen(false)
      return
    }

    setResetConfirmOpen(false)
    setTempPassword(data?.tempPassword ?? null)
  }

  async function handleCopyTempPassword() {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied/unavailable — non-critical, fail quietly.
    }
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

            {canReset && (
              <button
                type="button"
                onClick={() => { setResetError(null); setResetConfirmOpen(true) }}
                className="min-h-tap w-full rounded-2xl border border-coral-200 bg-white font-display text-sm text-coral-600 shadow-card hover:bg-coral-50"
              >
                Reset password
              </button>
            )}
            {resetError && <ErrorState message={resetError} />}

            {isAdmin && <StaffDocPanel ownerId={id} canManage={true} />}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-card-lg">
            <h2 className="font-display text-lg text-neutral-800">Temporary password</h2>
            <p className="text-sm text-neutral-600">
              Give this temporary password to {member?.full_name}. They will be required to set a
              new password on next login.
            </p>
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
              <span className="font-display text-lg tracking-wide text-neutral-800">{tempPassword}</span>
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
              onClick={() => setTempPassword(null)}
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
