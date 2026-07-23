import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

// Generic type-to-filter combobox — a plain <select> doesn't scale past a
// handful of options (the Zoho item catalog is 63 entries, the student list
// can be larger), and this app has no existing searchable-select component
// to reuse. Selecting an option uses onMouseDown (fires before the input's
// onBlur) rather than onClick, so a tap on an option doesn't get eaten by
// the blur-close instead of registering the selection.
export function SearchableSelect<T>({
  items,
  value,
  onChange,
  getLabel,
  getKey,
  placeholder = 'Search…',
  disabled,
  emptyLabel = 'No matches',
}: {
  items: T[]
  value: T | null
  onChange: (item: T) => void
  getLabel: (item: T) => string
  getKey: (item: T) => string
  placeholder?: string
  disabled?: boolean
  emptyLabel?: string
}) {
  const [query, setQuery] = useState(value ? getLabel(value) : '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Only re-sync the visible text from the selected value when the
  // selection itself changes (by key) — not on every parent re-render,
  // which would otherwise stomp on whatever the user is mid-typing.
  const valueKey = value ? getKey(value) : null
  useEffect(() => {
    setQuery(value ? getLabel(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey])

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const filtered = items.filter((item) => getLabel(item).toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-h-tap w-full rounded-xl border border-line py-2 pl-9 pr-3 text-sm disabled:opacity-60"
        />
      </div>

      {open && !disabled && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-card-lg">
          {filtered.length === 0 && <p className="px-3 py-3 text-sm text-muted">{emptyLabel}</p>}
          {filtered.map((item) => (
            <button
              key={getKey(item)}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                onChange(item)
                setQuery(getLabel(item))
                setOpen(false)
              }}
              className="block min-h-tap w-full px-3 py-2 text-left text-sm text-ink hover:bg-cream"
            >
              {getLabel(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
