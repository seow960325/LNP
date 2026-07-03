import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { buildWifiQrValue } from '../lib/helpers'
import { copyToClipboard } from '../lib/clipboard'
import { getWifi, updateWifi } from '../lib/settingsApi'
import type { WifiInfo } from '../lib/settingsApi'

type LoadState = 'loading' | 'ready' | 'error'

function WifiGlow() {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <span className="absolute h-20 w-20 rounded-full bg-brand-400/10 blur-xl" />
      <span className="absolute h-14 w-14 rounded-full bg-brand-300/20 blur-lg" />
      <span className="absolute h-8 w-8 rounded-full bg-brand-200/30 blur-md" />
      <Wifi
        className="relative h-9 w-9 text-brand-100 drop-shadow-[0_0_14px_rgba(255,217,168,0.85)]"
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

    getWifi(profile.center_id).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError('Could not load the WiFi details. Please try again.')
        setLoadState('error')
        return
      }
      setWifi(data)
      setLoadState('ready')
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
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">WiFi Password</h1>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading WiFi details…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && (
          <>
            <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-900 via-brand-800 to-neutral-900 p-8 text-center shadow-card-lg">
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand-400/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-14 -right-10 h-48 w-48 rounded-full bg-brand-300/10 blur-3xl" />

              <div className="relative flex flex-col items-center gap-6">
                <WifiGlow />

                {hasWifi ? (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-brand-100/70">Wifi name</p>
                      <p className="mt-1 break-words font-display text-2xl text-white">{wifi.ssid || '—'}</p>
                    </div>

                    <div className="h-px w-16 bg-white/15" />

                    <div>
                      <p className="text-xs uppercase tracking-wide text-brand-100/70">Password</p>
                      <p className="mt-1 break-words font-display text-2xl tracking-wide text-white">
                        {wifi.password || '—'}
                      </p>
                    </div>

                    <div className="h-px w-16 bg-white/15" />

                    <div className="flex flex-col items-center gap-2">
                      {canShowQr ? (
                        <div className="rounded-2xl bg-white p-3 shadow-card">
                          <QRCodeSVG
                            value={buildWifiQrValue(wifi.ssid, wifi.password)}
                            size={140}
                            bgColor="#ffffff"
                            fgColor="#783110"
                            level="M"
                            marginSize={0}
                          />
                        </div>
                      ) : (
                        <div className="flex h-[164px] w-[164px] items-center justify-center rounded-2xl bg-white/10 p-4 text-center text-xs text-brand-100/70">
                          Add both a network name and password to generate a QR code.
                        </div>
                      )}
                      <p className="text-xs text-brand-100/70">Scan to join WiFi</p>
                    </div>

                    {wifi.password && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="min-h-tap-lg w-full rounded-2xl bg-white/10 font-display text-white shadow-card backdrop-blur hover:bg-white/20"
                      >
                        Copy Password
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-brand-100/80">WiFi not set up yet — ask your admin.</p>
                )}
              </div>
            </div>

            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={openEdit}
                className="min-h-tap w-full rounded-2xl border border-neutral-200 bg-white font-display text-sm text-neutral-600 shadow-card hover:bg-neutral-50"
              >
                Edit WiFi details
              </button>
            )}

            {isAdmin && isEditing && (
              <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card-md">
                <div>
                  <label className="text-xs text-neutral-500">WiFi name</label>
                  <input
                    value={formValues.ssid}
                    onChange={(event) => setFormValues((v) => ({ ...v, ssid: event.target.value }))}
                    disabled={saving}
                    className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm focus:border-brand-600 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Password</label>
                  <input
                    value={formValues.password}
                    onChange={(event) => setFormValues((v) => ({ ...v, password: event.target.value }))}
                    disabled={saving}
                    className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm focus:border-brand-600 focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-2xl border border-neutral-200 font-display text-sm text-neutral-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="min-h-tap flex-1 rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
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
