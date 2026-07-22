import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { KudosValueCard, KudosValueBadge } from '../components/KudosValueCard'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton as NavBackButton } from '../components/BackButton'
import {
  fetchCenterMembers,
  fetchActiveKudosValues,
  sendKudos,
} from '../lib/kudosApi'
import type { CenterMember, KudosValueOption } from '../lib/kudosApi'

const MAX_MESSAGE_LENGTH = 300

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-0.5 text-sm text-muted hover:text-ink disabled:opacity-50"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  )
}

function WhoStep({
  centerId,
  currentUserId,
  selected,
  onPick,
}: {
  centerId: string
  currentUserId: string
  selected: CenterMember | null
  onPick: (member: CenterMember) => void
}) {
  const [members, setMembers] = useState<CenterMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCenterMembers(centerId, currentUserId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setError('Could not load people. Please try again.')
        return
      }
      setMembers(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [centerId, currentUserId])

  return (
    <div className="space-y-3">
      <h1 className="font-semibold text-xl text-ink">Who do you want to praise?</h1>
      {error && <ErrorState message={error} />}
      {!error && members === null && <LoadingState label="Loading people…" />}
      {!error && members !== null && members.length === 0 && (
        <EmptyState message="No one else in your center to praise yet." />
      )}
      {!error && members !== null && members.length > 0 && (
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onPick(member)}
                className={`w-full min-h-tap-lg flex flex-col items-start justify-center rounded-xl border px-4 py-2 text-left transition-colors ${
                  selected?.id === member.id
                    ? 'border-accent bg-cream'
                    : 'border-line bg-white shadow-card'
                }`}
              >
                <span className="font-semibold text-ink">{member.full_name}</span>
                {member.title && <span className="text-xs text-muted">{member.title}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WhatStep({
  centerId,
  selected,
  onPick,
  onBack,
}: {
  centerId: string
  selected: KudosValueOption | null
  onPick: (value: KudosValueOption) => void
  onBack: () => void
}) {
  const [values, setValues] = useState<KudosValueOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchActiveKudosValues(centerId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setError('Could not load kudos values. Please try again.')
        return
      }
      setValues(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [centerId])

  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} />
      <h1 className="font-semibold text-xl text-ink">What are you recognizing?</h1>
      {error && <ErrorState message={error} />}
      {!error && values === null && <LoadingState label="Loading kudos values…" />}
      {!error && values !== null && values.length === 0 && (
        <EmptyState message="No kudos values are set up for your center yet." />
      )}
      {!error && values !== null && values.length > 0 && (
        <div role="radiogroup" aria-label="Choose a kudos value" className="space-y-2">
          {values.map((value) => (
            <KudosValueCard
              key={value.id}
              id={value.id}
              name={value.name}
              description={value.description}
              iconKey={value.icon_key}
              selected={selected?.id === value.id}
              onSelect={(id) => {
                const picked = values.find((v) => v.id === id)
                if (picked) onPick(picked)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MessageStep({
  recipient,
  value,
  message,
  onMessageChange,
  onBack,
  onSend,
  sending,
}: {
  recipient: CenterMember
  value: KudosValueOption
  message: string
  onMessageChange: (message: string) => void
  onBack: () => void
  onSend: () => void
  sending: boolean
}) {
  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} disabled={sending} />
      <h1 className="font-semibold text-xl text-ink">Add a message</h1>

      <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-6 text-center shadow-card">
        <KudosValueBadge iconKey={value.icon_key} size="lg" />
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{value.name}</span> for{' '}
          <span className="font-semibold text-ink">{recipient.full_name}</span>
        </p>
      </div>

      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={4}
        placeholder="Say something nice (optional)…"
        disabled={sending}
        className="w-full rounded-xl border border-line bg-white p-4 text-sm shadow-card focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <p className="text-right text-xs text-muted/70">
        {message.length}/{MAX_MESSAGE_LENGTH}
      </p>
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="w-full min-h-tap-lg rounded-xl bg-accent font-semibold text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send kudos'}
      </button>
    </div>
  )
}

interface SentSummary {
  recipientName: string
  valueName: string
  iconKey: string
  message: string | null
}

function SentConfirmation({
  summary,
  onSendAnother,
  onViewWall,
}: {
  summary: SentSummary
  onSendAnother: () => void
  onViewWall: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-accent-soft/60 via-cream to-cream p-8 text-center shadow-card-lg">
        <KudosValueBadge iconKey={summary.iconKey} size="lg" />
        <p className="text-3xl font-bold text-accent-hover">Kudos sent!</p>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{summary.valueName}</span> for{' '}
          <span className="font-semibold text-ink">{summary.recipientName}</span>
        </p>
        {summary.message && (
          <p className="rounded-xl bg-white/70 px-4 py-3 text-sm italic text-muted">
            &ldquo;{summary.message}&rdquo;
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSendAnother}
          className="min-h-tap flex-1 rounded-xl border border-line bg-white font-semibold text-sm text-muted shadow-card hover:bg-cream"
        >
          Send another
        </button>
        <button
          type="button"
          onClick={onViewWall}
          className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
        >
          View kudos wall
        </button>
      </div>
    </div>
  )
}

// Content-only — no page chrome — so it can be reused both as its own
// standalone route (KudosSendPage, below) and as a tab inside the combined
// Kudos hub page. `onViewWall` lets the caller decide what "view the wall"
// means (switch tabs inside the hub, or navigate when standalone).
export function KudosSendPanel({ onViewWall }: { onViewWall: () => void }) {
  const { profile } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [recipient, setRecipient] = useState<CenterMember | null>(null)
  const [value, setValue] = useState<KudosValueOption | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<SentSummary | null>(null)

  if (!profile) return null

  function resetFlow() {
    setStep(1)
    setRecipient(null)
    setValue(null)
    setMessage('')
    setSent(null)
  }

  async function handleSend() {
    if (!profile || !recipient || !value) return
    setSending(true)
    const trimmed = message.trim()
    const { error } = await sendKudos({
      center_id: profile.center_id,
      from_user_id: profile.id,
      to_user_id: recipient.id,
      value_id: value.id,
      message: trimmed.length > 0 ? trimmed : null,
      is_from_parent: false,
    })
    setSending(false)
    if (error) {
      toast.error('Could not send kudos. Please try again.')
      return
    }
    toast.success('Kudos posted')
    setSent({
      recipientName: recipient.full_name,
      valueName: value.name,
      iconKey: value.icon_key,
      message: trimmed.length > 0 ? trimmed : null,
    })
  }

  if (sent) {
    return <SentConfirmation summary={sent} onSendAnother={resetFlow} onViewWall={onViewWall} />
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted/70">Step {step} of 3</p>

      {step === 1 && (
        <WhoStep
          centerId={profile.center_id}
          currentUserId={profile.id}
          selected={recipient}
          onPick={(member) => {
            setRecipient(member)
            setStep(2)
          }}
        />
      )}

      {step === 2 && (
        <WhatStep
          centerId={profile.center_id}
          selected={value}
          onPick={(picked) => {
            setValue(picked)
            setStep(3)
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && recipient && value && (
        <MessageStep
          recipient={recipient}
          value={value}
          message={message}
          onMessageChange={setMessage}
          onBack={() => setStep(2)}
          onSend={handleSend}
          sending={sending}
        />
      )}
    </div>
  )
}

// Standalone legacy route (/kudos/new) — kept working in case anything still
// links directly to it. The Kudos hub page renders KudosSendPanel directly
// instead of this wrapper.
export function KudosSendPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <NavBackButton />
        <KudosSendPanel onViewWall={() => navigate('/kudos')} />
      </div>
    </div>
  )
}
