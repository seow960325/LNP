const SIZES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-16 w-16 text-lg',
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Shared avatar treatment: a real photo when avatarUrl is set, otherwise an
// initials badge in the app's warm palette. Reused wherever a person needs a
// face — currently the Kudos Wall's recognized-teacher hero avatar.
export function Avatar({
  fullName,
  avatarUrl,
  size = 'md',
}: {
  fullName: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizeClasses = SIZES[size]

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        className={`${sizeClasses} shrink-0 rounded-full object-cover shadow-card`}
      />
    )
  }

  return (
    <span
      className={`inline-flex ${sizeClasses} shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover shadow-card`}
      aria-label={fullName}
    >
      {initials(fullName)}
    </span>
  )
}
