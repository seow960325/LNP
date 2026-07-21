// Turns a flat list of zoho_bank_transactions rows for ONE account into a
// bank-statement view, newest first. The displayed balance is Zoho's own
// running_balance, verbatim — never derived here.

import type { ZohoBankTransaction } from './zohoApi'

export interface BankStatementRow extends ZohoBankTransaction {
  signedAmount: number
}

// debit = money in (+), credit = money out (-) for a bank/cash asset
// account — empirically confirmed against Zoho's own running_balance (see
// supabase/functions/zoho-sync/index.ts syncBankTransactions()). Used only
// for deposit/withdrawal column styling, never for computing the balance.
function signedAmount(row: ZohoBankTransaction): number {
  const raw = Math.abs(row.amount ?? 0)
  return row.direction === 'credit' ? -raw : raw
}

// Display order only: (date DESC, running_balance DESC). Zoho gives
// day-level dates with no intra-day sequence, so running_balance isn't
// guaranteed strictly monotonic on days with multiple transactions —
// sorting by running_balance within a day avoids a jumpy-looking column.
// This does NOT reconstruct Zoho's true intra-day order (that sequence
// isn't in the data); each row's own running_balance stays correct
// regardless of where it lands in this sort.
export function withRunningBalance(transactions: ZohoBankTransaction[]): BankStatementRow[] {
  const rows = [...transactions]
    .sort((a, b) => {
      if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '')
      return (b.running_balance ?? 0) - (a.running_balance ?? 0)
    })
    .map((txn) => ({ ...txn, signedAmount: signedAmount(txn) }))

  if (import.meta.env.DEV) warnIfSignedSumDisagrees(rows)

  return rows
}

// Dev-only sanity check (never shown to users): walks day boundaries
// oldest -> newest and confirms each day's opening running_balance equals
// the prior day's closing running_balance plus this row's signed amount.
// Restricted to day boundaries (not same-day rows) because same-day order
// is genuinely ambiguous in the data — see withRunningBalance's sort
// comment — so a same-day mismatch is expected noise, not a bug signal.
function warnIfSignedSumDisagrees(rows: BankStatementRow[]): void {
  const chronological = [...rows].sort((a, b) => {
    if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '')
    return (a.running_balance ?? 0) - (b.running_balance ?? 0)
  })
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1]
    const curr = chronological[i]
    if (prev.date === curr.date) continue
    const expected = (prev.running_balance ?? 0) + curr.signedAmount
    const diff = Math.abs((curr.running_balance ?? 0) - expected)
    if (diff > 0.01) {
      console.warn(
        `[zohoBankStatement] running_balance disagrees with signed-sum walk at day boundary ` +
          `${prev.date} -> ${curr.date} (txn ${curr.transaction_id}): expected ${expected.toFixed(2)}, got ${curr.running_balance}`,
      )
    }
  }
}
