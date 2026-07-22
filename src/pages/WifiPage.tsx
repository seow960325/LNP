import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { buildWifiQrValue } from '../lib/helpers'
import { copyToClipboard } from '../lib/clipboard'
import { getWifi, updateWifi } from '../lib/settingsApi'
import type { WifiInfo } from '../lib/settingsApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

function WifiGlow() {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <span className="absolute h-20 w-20 rounded-full bg-accent/10 blur-xl" />
      <span className="absolute h-14 w-14 rounded-full bg-accent/15 blur-lg" />
      <span className="absolute h-8 w-8 rounded-full bg-accent-soft/50 blur-md" />
      <Wifi
        className="relative h-9 w-9 text-accent-soft drop-shadow-[0_0_14px_rgba(255,217,168,0.85)]"
        aria-hidden="true"
      />
    </div>
  )
}

export function WifiPage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [wifi, setWifi] = useState<WifiInfo>({ ssid: '', password: '' })

  const [isEditing, setIsEditing] = useState(false)
  const [formValues, setFormValues] = useState<WifiInfo>({ ssid: '', password: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(getWifi(profile.center_id))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError('Could not load the WiFi details. Please try again.')
          setLoadState('error')
          return
        }
        setWifi(data)
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
  }, [profile])

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const hasWifi = wifi.ssid.trim().length > 0 || wifi.password.trim().length > 0
  const canShowQr = wifi.ssid.trim().length > 0 && wifi.password.trim().length > 0

  async function handleCopy() {
    const ok = await copyToClipboard(wifi.password)
    if (ok) {
      toast.success('Copied to clipboard')
    } else {
      toast.error("Couldn't copy — long-press the password to copy manually")
    }
  }

  function openEdit() {
    setFormValues(wifi)
    setIsEditing(true)
  }

  function closeEdit() {
    setIsEditing(false)
  }

  async function handleSave() {
    if (!profile || saving) return
    setSaving(true)
    const nextWifi: WifiInfo = { ssid: formValues.ssid.trim(), password: formValues.password }
    const { error } = await updateWifi(profile.center_id, nextWifi.ssid, nextWifi.password)
    setSaving(false)
    if (error) {
      toast.error('Could not save the WiFi details. Please try again.')
      return
    }
    setWifi(nextWifi)
    setIsEditing(false)
    toast.success('WiFi details saved')
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="WiFi Password" />

        {loadState === 'loading' && <LoadingState label="Loading WiFi details…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-ink p-8 text-center shadow-card-lg">
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-14 -right-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

              <div className="relative flex flex-col items-center gap-6">
                <WifiGlow />

                {hasWifi ? (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-accent-soft/70">Wifi name</p>
                      <p className="mt-1 break-words font-bold text-2xl text-white">{wifi.ssid || '—'}</p>
                    </div>

                    <div className="h-px w-16 bg-white/15" />

                    <div>
                      <p className="text-xs uppercase tracking-wide text-accent-soft/70">Password</p>
                      <p className="mt-1 break-words font-bold text-2xl tracking-wide text-white">
                        {wifi.password || '—'}
                      </p>
                    </div>

                    <div className="h-px w-16 bg-white/15" />

                    <div className="flex flex-col items-center gap-2">
                      {canShowQr ? (
                        <div className="rounded-xl bg-white p-3 shadow-card">
                          <QRCodeSVG
                            value={buildWifiQrValue(wifi.ssid, wifi.password)}
                            size={140}
                            bgColor="#ffffff"
                            fgColor="#1E293B"
                            level="M"
                            marginSize={0}
                          />
                        </div>
                      ) : (
                        <div className="flex h-[164px] w-[164px] items-center justify-center rounded-xl bg-white/10 p-4 text-center text-xs text-accent-soft/70">
                          Add both a network name and password to generate a QR code.
                        </div>
                      )}
                      <p className="text-xs text-accent-soft/70">Scan to join WiFi</p>
                    </div>

                    {wifi.password && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="min-h-tap-lg w-full rounded-xl bg-white/10 font-semibold text-white shadow-card backdrop-blur hover:bg-white/20"
                      >
                        Copy Password
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-accent-soft/80">WiFi not set up yet — ask your admin.</p>
                )}
              </div>
            </div>

            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={openEdit}
                className="min-h-tap w-full rounded-xl border border-line bg-white font-semibold text-sm text-muted shadow-card hover:bg-cream"
              >
                Edit WiFi details
              </button>
            )}

            {isAdmin && isEditing && (
              <div className="space-y-3 rounded-xl bg-white p-4 shadow-card-md">
                <div>
                  <label className="text-xs text-muted">WiFi name</label>
                  <input
                    value={formValues.ssid}
                    onChange={(event) => setFormValues((v) => ({ ...v, ssid: event.target.value }))}
                    disabled={saving}
                    className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Password</label>
                  <input
                    value={formValues.password}
                    onChange={(event) => setFormValues((v) => ({ ...v, password: event.target.value }))}
                    disabled={saving}
                    className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
