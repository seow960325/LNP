import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { formatMYR } from '../lib/zohoFinance'
import type { ShareholderDirectoryEntry } from '../lib/shareholdingsApi'

// Directory-flavored shareholder row — mirrors StaffCard. Contact fields
// come pre-resolved by the caller (linked staff_members row wins over the
// shareholding's own phone/email/photo_path — see ShareholderDetailPage for
// the same resolution used on the profile card).
export function ShareholderCard({ shareholding, photoUrl }: { shareholding: ShareholderDirectoryEntry; photoUrl: string | null }) {
  const contactPhone = shareholding.linked_staff?.phone ?? shareholding.phone
  const contactEmail = shareholding.linked_staff?.email ?? shareholding.email

  return (
    <li className="rounded-xl bg-white p-5 shadow-card">
      <Link to={`/directory/shareholder/${shareholding.id}`} className="flex min-w-0 gap-3">
        <Avatar fullName={shareholding.display_name} avatarUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-ink">{shareholding.display_name}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-accent-hover">{formatMYR(shareholding.capital)}</p>
          {contactPhone && <p className="mt-1 text-xs text-muted">{contactPhone}</p>}
          {contactEmail && <p className="text-xs text-muted">{contactEmail}</p>}
        </div>
      </Link>
    </li>
  )
}
