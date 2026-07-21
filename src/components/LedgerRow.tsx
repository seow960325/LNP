import { formatMYRAbs } from '../lib/zohoFinance'

// One row of a money ledger (income breakdown, reconciliation footer, and
// any future drill-down that needs the same layout). Three-column grid
// (label | RM/−RM prefix | amount) with tabular-nums on the amount column
// so every "RM" and every decimal point lines up vertically across rows —
// that's the entire point of this component, not just a table row.
export function LedgerRow({
  label,
  amount,
  negative = false,
  bold = false,
  muted = false,
}: {
  label: string
  amount: number
  negative?: boolean
  bold?: boolean
  muted?: boolean
}) {
  const weight = bold ? 'font-medium' : 'font-normal'
  const labelColor = muted ? 'text-muted' : 'text-ink'
  const amountColor = negative ? 'text-danger' : muted ? 'text-muted' : 'text-ink'

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-2 text-sm">
      <span className={`${weight} ${labelColor}`}>{label}</span>
      <span className={`text-right ${negative ? 'text-danger' : 'text-muted'}`}>{negative ? '−RM' : 'RM'}</span>
      <span className={`min-w-[88px] text-right tabular-nums ${weight} ${amountColor}`}>{formatMYRAbs(amount)}</span>
    </div>
  )
}
