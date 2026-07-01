import { useEffect, useRef, useState } from 'react'
import { Award, Handshake, Heart, Lightbulb, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Exported so other kudos screens (e.g. the Wall) can render the same
// icon for a given icon_key without duplicating this map.
export const KUDOS_ICON_MAP: Record<string, LucideIcon> = {
  heart: Heart,
  hands: Handshake,
  star: Star,
  lightbulb: Lightbulb,
}

export interface KudosValueCardProps {
  id: string
  name: string
  description: string
  iconKey: string
  selected: boolean
  onSelect: (id: string) => void
}

// NOTE: This card only implements the individual role="radio".
// The PARENT (spec #8) must wrap a set of these in role="radiogroup"
// with an accessible label (e.g. aria-label="Choose a kudos value").
export function KudosValueCard({
  id,
  name,
  description,
  iconKey,
  selected,
  onSelect,
}: KudosValueCardProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const Icon = KUDOS_ICON_MAP[iconKey] ?? Award

  useEffect(() => {
    if (!tooltipOpen) return

    function handleOutside(event: MouseEvent | TouchEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setTooltipOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [tooltipOpen])

  function handleSelect() {
    onSelect(id)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  function handleInfoClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setTooltipOpen((open) => !open)
  }

  return (
    <div
      ref={cardRef}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={`relative flex min-h-tap-lg items-center gap-3 rounded-2xl border py-4 pl-4 pr-14 cursor-pointer transition-colors ${
        selected
          ? 'border-brand-600 bg-cream-50'
          : 'border-neutral-200 bg-white shadow-card'
      }`}
    >
      <Icon className="h-6 w-6 shrink-0 text-brand-600" aria-hidden="true" />

      <span className="font-display text-neutral-800">{name}</span>

      <button
        type="button"
        onClick={handleInfoClick}
        aria-label={`About ${name}`}
        aria-expanded={tooltipOpen}
        className="absolute right-2 top-2 flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600"
      >
        <span aria-hidden="true">ⓘ</span>
      </button>

      <span
        aria-hidden={!selected}
        className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand-600' : 'border-neutral-300'
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
      </span>

      {tooltipOpen && (
        <div
          role="tooltip"
          className="absolute right-2 top-12 z-10 w-56 rounded-xl bg-neutral-800 p-3 text-xs text-white shadow-card-lg animate-fade-in"
        >
          {description}
        </div>
      )}
    </div>
  )
}
