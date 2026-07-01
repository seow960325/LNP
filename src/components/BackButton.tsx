import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate()
  const location = useLocation()

  function handleBack() {
    // location.key === 'default' means there's no local history to pop
    // back into (e.g. a hard refresh or direct link) — go up a fixed
    // route instead of navigate(-1), which would leave the app.
    if (location.key === 'default') {
      navigate(fallback)
    } else {
      navigate(-1)
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Back"
      className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700"
    >
      <ChevronLeft className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}
