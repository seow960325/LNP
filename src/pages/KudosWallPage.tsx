import { useEffect, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { KudosValueBadge } from '../components/KudosValueCard'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
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
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

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
  const [retryKey, setRetryKey] = useState(0)

  const [monthlyCount, setMonthlyCount] = useState<number | null>(null)
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  const [topRecipient, setTopRecipient] = useState<TopRecipient | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<FeedItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadFeed() {
      setFeedState('loading')
      try {
        const { data: rows, error } = await withTimeout(fetchKudosFeed(profile!.center_id))
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

        const [{ data: profiles, error: profilesError }, { data: values, error: valuesError }] = await withTimeout(
          Promise.all([fetchProfilesByIds(profileIds), fetchKudosValuesByIds(valueIds)]),
        )

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
      } catch (err) {
        if (cancelled) return
        setFeedError(getUserErrorMessage(err))
        setFeedState('error')
      }
    }

    loadFeed()
    return () => {
      cancelled = true
    }
  }, [profile, retryKey])

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

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return
    setDeleting(true)

    const { error } = await supabase.from('kudos').delete().eq('id', deleteTarget.id)

    setDeleting(false)
    if (error) {
      toast.error(error.message || 'Could not delete this kudos. Please try again.')
      return
    }

    setFeedItems((items) => items.filter((item) => item.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Kudos deleted')
  }

  if (!profile) return null

  return (
    <div className="space-y-4">
      {topRecipient && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-soft/60 px-4 py-3 text-sm text-ink">
          <Star className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          Most appreciated: <span className="font-semibold">{topRecipient.full_name}</span>
        </div>
      )}

      <div className="rounded-2xl bg-gradient-to-br from-accent-soft/60 via-cream to-cream p-5 shadow-card">
        <p className="text-xs text-muted">Kudos you received this month</p>
        {monthlyError ? (
          <p className="text-sm text-danger">{monthlyError}</p>
        ) : monthlyCount === null ? (
          <p className="text-4xl font-bold text-line">…</p>
        ) : (
          <p className="text-5xl font-bold text-accent-hover">{monthlyCount}</p>
        )}
      </div>

      {feedState === 'loading' && <LoadingState label="Loading the wall…" />}
      {feedState === 'error' && (
        <ErrorState message={feedError ?? 'Something went wrong.'} onRetry={() => setRetryKey((k) => k + 1)} />
      )}

      {feedState === 'ready' && feedItems.length === 0 && (
        <EmptyState message="No kudos yet. Send one to get started." />
      )}

      {feedState === 'ready' && feedItems.length > 0 && (
        <ul className="space-y-3">
          {feedItems.map((item) => (
            <li
              key={item.id}
              className="flex gap-4 rounded-xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-md"
            >
              <Avatar fullName={item.recipientName} avatarUrl={item.recipientAvatarUrl} size="xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-lg font-bold text-ink">
                    {item.recipientName}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft/70 py-0.5 pl-0.5 pr-2 text-2xs font-semibold text-accent-hover">
                    <KudosValueBadge iconKey={item.iconKey} size="xs" />
                    {item.valueName}
                  </span>
                </div>

                {item.message && (
                  <p className="text-sm italic text-muted">&ldquo;{item.message}&rdquo;</p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted/70">
                    by {item.senderName} · {formatDate(item.createdAt)}
                  </p>
                  {profile?.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      aria-label="Delete this kudos"
                      className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full text-line hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this kudos?"
        message="This permanently deletes this kudos. This cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

type Tab = 'wall' | 'send'

// Kudos hub — the single home-card entry point, combining the wall (feed +
// monthly stats) and the send flow into one page via tabs.
export function KudosWallPage() {
  const [tab, setTab] = useState<Tab>('wall')

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <PageHeader title="Kudos" />

        <div className="flex gap-2 rounded-xl bg-white p-1.5 shadow-card">
          <button
            type="button"
            onClick={() => setTab('wall')}
            className={`min-h-tap flex-1 rounded-xl font-semibold text-sm transition-colors ${
              tab === 'wall' ? 'bg-accent text-white shadow-card' : 'text-muted hover:bg-cream'
            }`}
          >
            Wall
          </button>
          <button
            type="button"
            onClick={() => setTab('send')}
            className={`min-h-tap flex-1 rounded-xl font-semibold text-sm transition-colors ${
              tab === 'send' ? 'bg-accent text-white shadow-card' : 'text-muted hover:bg-cream'
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
