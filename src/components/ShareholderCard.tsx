import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import type { ShareholderDirectoryEntry } from '../lib/shareholdingsApi'

// Directory-flavored shareholder row — mirrors StaffCard. Contact fields
// come pre-resolved by the caller (linked staff_members row wins over the
// shareholding's own phone/email/photo_path — see ShareholderDetailPage for
// the same resolution used on the profile card).
export function ShareholderCard({
  shareholding,
  photoUrl,
  totalCapital,
}: {
  shareholding: ShareholderDirectoryEntry
  photoUrl: string | null
  // Sum of every shareholder's capital — the % denominator. 0 when there's
  // no capital on record at all, not just for this one row.
  totalCapital: number
}) {
  const contactPhone = shareholding.linked_staff?.phone ?? shareholding.phone
  const contactEmail = shareholding.linked_staff?.email ?? shareholding.email
  const ownershipPct = totalCapital > 0 ? (shareholding.capital / totalCapital) * 100 : 0

  return (
    <li className="rounded-xl bg-white p-5 shadow-card">
      <Link to={`/directory/shareholder/${shareholding.id}`} className="flex min-w-0 items-center gap-3">
        <Avatar fullName={shareholding.display_name} avatarUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-ink">{shareholding.display_name}</p>
          {contactPhone && <p className="mt-1 text-xs text-muted">{contactPhone}</p>}
          {contactEmail && <p className="text-xs text-muted">{contactEmail}</p>}
        </div>
        <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-accent-hover">
          {totalCapital > 0 ? `${ownershipPct.toFixed(1)}%` : '—'}
        </p>
      </Link>
    </li>
  )
}
