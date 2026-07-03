export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-muted/70">
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
      {message}
    </div>
  )
}
