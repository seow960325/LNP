export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-coral-200 bg-coral-50 px-4 py-3 text-sm text-coral-700">
      {message}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
      {message}
    </div>
  )
}

export function SuccessState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-700">
      {message}
    </div>
  )
}
