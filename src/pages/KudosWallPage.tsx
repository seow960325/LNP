import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { KudosValueBadge } from '../components/KudosValueCard'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate, toKLDateISO } from '../lib/helpers'
import {
  fetchKudosFeed,
  fetchProfilesByIds,
  fetchKudosValuesByIds,
  fetchKudosReceivedBy,
  fetchTopRecipient,
} from '../lib/kudosApi'
import type { TopRecipient } from '../lib/kudosApi'
import { KudosSendPanel } from './KudosSendPage'

interface FeedItem {
  id: string
  recipientName: string
  recipientAvatarUrl: string | null
  senderName: string
  valueName: string
  iconKey: string
  message: string | null
  createdAt: string
}

type FeedState = 'loading' | 'ready' | 'error'

// Content-only — no page chrome — so it can be reused both as its own
// standalone route (kept for backward compat) and as a tab inside the
// combined Kudos hub page.
export function KudosWallPanel() {
  const { profile } = useAuth()

  const [feedState, setFeedState] = useState<FeedState>('loading')
  const [feedError, setFeedError] = useState<string | null>(null)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])

  const [monthlyCount, setMonthlyCount] = useState<number | null>(null)
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  const [topRecipient, setTopRecipient] = useState<TopRecipient | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadFeed() {
      setFeedState('loading')
      const { data: rows, error } = await fetchKudosFeed(profile!.center_id)
      if (cancelled) return

      if (error || !rows) {
        setFeedError('Could not load the kudos wall. Please try again.')
        setFeedState('error')
        return
      }

      if (rows.length === 0) {
        setFeedItems([])
        setFeedState('ready')
        return
      }

      const profileIds = Array.from(new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id])))
      const valueIds = Array.from(new Set(rows.map((r) => r.value_id)))

      const [{ data: profiles, error: profilesError }, { data: values, error: valuesError }] =
        await Promise.all([fetchProfilesByIds(profileIds), fetchKudosValuesByIds(valueIds)])

      if (cancelled) return

      if (profilesError || valuesError) {
        setFeedError('Could not load the kudos wall. Please try again.')
        setFeedState('error')
        return
      }

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const valueById = new Map((values ?? []).map((v) => [v.id, v]))

      const items: FeedItem[] = rows.map((row) => {
        const value = valueById.get(row.value_id)
        const recipient = profileById.get(row.to_user_id)
        return {
          id: row.id,
          recipientName: recipient?.full_name ?? 'Someone',
          recipientAvatarUrl: recipient?.avatar_url ?? null,
          senderName: profileById.get(row.from_user_id)?.full_name ?? 'Someone',
          valueName: value?.name ?? 'Kudos',
          iconKey: value?.icon_key ?? '',
          message: row.message,
          createdAt: row.created_at,
        }
      })

      setFeedItems(items)
      setFeedState('ready')
    }

    loadFeed()
    return () => {
      cancelled = true
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    fetchKudosReceivedBy(profile.center_id, profile.id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setMonthlyError('Could not load your monthly total.')
        return
      }
      const currentKLMonth = toKLDateISO(new Date()).slice(0, 7)
      const count = data.filter((row) => toKLDateISO(row.created_at).slice(0, 7) === currentKLMonth).length
      setMonthlyCount(count)
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  useEffect(() => {
    let cancelled = false

    fetchTopRecipient().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        // Non-critical badge — fail quietly, render nothing.
        return
      }
      setTopRecipient(data?.[0] ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!profile) return null

  return (
    <div className="space-y-4">
      {topRecipient && (
        <div className="flex items-center gap-2 rounded-2xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm text-neutral-700">
          <span>🌟</span> Most appreciated: <span className="font-display">{topRecipient.full_name}</span>
        </div>
      )}

      <div className="rounded-3xl bg-gradient-to-br from-brand-50 via-cream-100 to-sky-50 p-5 shadow-card">
        <p className="text-xs text-neutral-500">Kudos you received this month</p>
        {monthlyError ? (
          <p className="text-sm text-coral-600">{monthlyError}</p>
        ) : monthlyCount === null ? (
          <p className="font-handwriting text-4xl text-neutral-300">…</p>
        ) : (
          <p className="font-handwriting text-5xl text-brand-700">{monthlyCount}</p>
        )}
      </div>

      {feedState === 'loading' && <LoadingState label="Loading the wall…" />}
      {feedState === 'error' && <ErrorState message={feedError ?? 'Something went wrong.'} />}

      {feedState === 'ready' && feedItems.length === 0 && (
        <div className="space-y-3 rounded-3xl bg-white p-8 text-center shadow-card">
          <p className="text-neutral-500">No kudos yet — be the first!</p>
        </div>
      )}

      {feedState === 'ready' && feedItems.length > 0 && (
        <ul className="space-y-3">
          {feedItems.map((item) => (
            <li
              key={item.id}
              className="flex gap-4 rounded-3xl bg-white p-4 shadow-card transition-shadow hover:shadow-card-md"
            >
              <Avatar fullName={item.recipientName} avatarUrl={item.recipientAvatarUrl} size="xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-display text-lg font-bold text-neutral-800">
                    {item.recipientName}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-cream-100 py-0.5 pl-0.5 pr-2 text-2xs font-medium text-brand-600">
                    <KudosValueBadge iconKey={item.iconKey} size="xs" />
                    {item.valueName}
                  </span>
                </div>

                {item.message && (
                  <p className="text-sm italic text-neutral-600">&ldquo;{item.message}&rdquo;</p>
                )}

                <p className="pt-1 text-xs text-neutral-400">
                  by {item.senderName} · {formatDate(item.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Tab = 'wall' | 'send'

// Kudos hub — the single home-card entry point, combining the wall (feed +
// monthly stats) and the send flow into one page via tabs.
export function KudosWallPage() {
  const [tab, setTab] = useState<Tab>('wall')

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Kudos</h1>
        </div>

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-card">
          <button
            type="button"
            onClick={() => setTab('wall')}
            className={`min-h-tap flex-1 rounded-xl font-display text-sm transition-colors ${
              tab === 'wall' ? 'bg-brand-600 text-white shadow-card' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Wall
          </button>
          <button
            type="button"
            onClick={() => setTab('send')}
            className={`min-h-tap flex-1 rounded-xl font-display text-sm transition-colors ${
              tab === 'send' ? 'bg-brand-600 text-white shadow-card' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Send Kudos
          </button>
        </div>

        {tab === 'wall' && <KudosWallPanel />}
        {tab === 'send' && <KudosSendPanel onViewWall={() => setTab('wall')} />}
      </div>
    </div>
  )
}
