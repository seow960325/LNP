import { ChevronLeft } from 'lucide-react'
import { useUp } from '../lib/up'

// Always navigates to the deterministic parent of the current route (see
// lib/up.ts) — never browser history — so Back can't ping-pong between
// pages that happen to have been visited in some order.
export function BackButton({ parentOverride }: { parentOverride?: string | null }) {
  const up = useUp(parentOverride)

  return (
    <button
      type="button"
      onClick={up}
      aria-label="Back"
      className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
    >
      <ChevronLeft className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}
