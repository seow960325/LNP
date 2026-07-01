import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { KudosValueCard } from '../components/KudosValueCard'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
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
      className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
    >
      ← Back
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
      <h1 className="font-display text-xl text-neutral-800">Who do you want to praise?</h1>
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
                className={`w-full min-h-tap-lg flex flex-col items-start justify-center rounded-2xl border px-4 py-2 text-left transition-colors ${
                  selected?.id === member.id
                    ? 'border-brand-600 bg-cream-50'
                    : 'border-neutral-200 bg-white shadow-card'
                }`}
              >
                <span className="font-display text-neutral-800">{member.full_name}</span>
                {member.title && <span className="text-xs text-neutral-500">{member.title}</span>}
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
      <h1 className="font-display text-xl text-neutral-800">What are you recognizing?</h1>
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
  error,
}: {
  recipient: CenterMember
  value: KudosValueOption
  message: string
  onMessageChange: (message: string) => void
  onBack: () => void
  onSend: () => void
  sending: boolean
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} disabled={sending} />
      <h1 className="font-display text-xl text-neutral-800">Add a message</h1>
      <p className="text-sm text-neutral-500">
        {value.name} for <span className="font-medium text-neutral-700">{recipient.full_name}</span>
      </p>
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={4}
        placeholder="Say something nice (optional)…"
        disabled={sending}
        className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm shadow-card focus:border-brand-600 focus:outline-none disabled:opacity-60"
      />
      <p className="text-right text-xs text-neutral-400">
        {message.length}/{MAX_MESSAGE_LENGTH}
      </p>
      {error && <ErrorState message={error} />}
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="w-full min-h-tap-lg rounded-2xl bg-brand-600 font-display text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send kudos'}
      </button>
    </div>
  )
}

export function KudosSendPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [recipient, setRecipient] = useState<CenterMember | null>(null)
  const [value, setValue] = useState<KudosValueOption | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  if (!profile) return null

  async function handleSend() {
    if (!profile || !recipient || !value) return
    setSending(true)
    setSendError(null)
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
      setSendError('Could not send kudos. Please try again.')
      return
    }
    navigate('/kudos')
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Step {step} of 3
        </p>

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
            error={sendError}
          />
        )}
      </div>
    </div>
  )
}
