import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { KUDOS_ICON_MAP } from '../components/KudosValueCard'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { formatDate, toKLDateISO } from '../lib/helpers'
import {
  fetchKudosFeed,
  fetchProfilesByIds,
  fetchKudosValuesByIds,
  fetchKudosReceivedBy,
  fetchTopRecipient,
} from '../lib/kudosApi'
import type { TopRecipient } from '../lib/kudosApi'

interface FeedItem {
  id: string
  recipientName: string
  senderName: string
  valueName: string
  iconKey: string
  message: string | null
  createdAt: string
}

type FeedState = 'loading' | 'ready' | 'error'

export function KudosWallPage() {
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

      const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
      const valueById = new Map((values ?? []).map((v) => [v.id, v]))

      const items: FeedItem[] = rows.map((row) => {
        const value = valueById.get(row.value_id)
        return {
          id: row.id,
          recipientName: profileNameById.get(row.to_user_id) ?? 'Someone',
          senderName: profileNameById.get(row.from_user_id) ?? 'Someone',
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
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-neutral-800">Kudos Wall</h1>
          <Link
            to="/kudos/new"
            className="flex min-h-tap items-center rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700"
          >
            Give kudos
          </Link>
        </div>

        {topRecipient && (
          <div className="rounded-2xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm text-neutral-700">
            🌟 Most appreciated: <span className="font-display">{topRecipient.full_name}</span>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-xs text-neutral-500">Kudos you received this month</p>
          {monthlyError ? (
            <p className="text-sm text-coral-600">{monthlyError}</p>
          ) : monthlyCount === null ? (
            <p className="font-display text-2xl text-neutral-300">…</p>
          ) : (
            <p className="font-display text-2xl text-brand-600">{monthlyCount}</p>
          )}
        </div>

        {feedState === 'loading' && <LoadingState label="Loading the wall…" />}
        {feedState === 'error' && <ErrorState message={feedError ?? 'Something went wrong.'} />}

        {feedState === 'ready' && feedItems.length === 0 && (
          <div className="space-y-3 rounded-2xl bg-white p-8 text-center shadow-card">
            <p className="text-neutral-500">No kudos yet — be the first!</p>
            <Link
              to="/kudos/new"
              className="inline-flex min-h-tap items-center justify-center rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700"
            >
              Give kudos
            </Link>
          </div>
        )}

        {feedState === 'ready' && feedItems.length > 0 && (
          <ul className="space-y-3">
            {feedItems.map((item) => {
              const Icon = KUDOS_ICON_MAP[item.iconKey] ?? Award
              return (
                <li key={item.id} className="space-y-1 rounded-2xl bg-white p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                    <span className="font-display text-neutral-800">{item.valueName}</span>
                  </div>
                  <p className="text-sm text-neutral-700">
                    <span className="font-medium">{item.senderName}</span> →{' '}
                    <span className="font-medium">{item.recipientName}</span>
                  </p>
                  {item.message && (
                    <p className="text-sm italic text-neutral-600">&ldquo;{item.message}&rdquo;</p>
                  )}
                  <p className="text-xs text-neutral-400">{formatDate(item.createdAt)}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
