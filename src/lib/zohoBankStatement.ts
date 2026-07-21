// Turns a flat list of zoho_bank_transactions rows for ONE account into a
// bank-statement view with a running balance, newest first.

import type { ZohoBankTransaction } from './zohoApi'

export interface BankStatementRow extends ZohoBankTransaction {
  signedAmount: number
  balanceAfter: number
}

// Direction is inferred from transaction_type (deposit/withdrawal or
// credit/debit) if recognized; otherwise the raw amount's own sign is
// trusted as-is. NOT verified against a live payload — see
// zoho-sync/index.ts syncBankTransactions() for the same caveat on the
// underlying field names/values.
function signedAmount(row: ZohoBankTransaction): number {
  const raw = row.amount ?? 0
  const type = (row.transaction_type ?? '').toLowerCase()
  if (type.includes('withdraw') || type === 'debit') return -Math.abs(raw)
  if (type.includes('deposit') || type === 'credit') return Math.abs(raw)
  return raw
}

// currentBalance should be that account's zoho_bank_accounts.current_balance
// — the one number we actually trust. There's no known "opening balance"
// transaction to start forward from, so the running balance is anchored at
// the newest row (= currentBalance) and walked backward through time.
export function withRunningBalance(transactions: ZohoBankTransaction[], currentBalance: number): BankStatementRow[] {
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '') // newest first
    return (b.transaction_id ?? '').localeCompare(a.transaction_id ?? '') // stable same-day tiebreaker
  })

  let runningBalance = currentBalance
  const rows: BankStatementRow[] = []
  for (const txn of sorted) {
    const amt = signedAmount(txn)
    rows.push({ ...txn, signedAmount: amt, balanceAfter: runningBalance })
    runningBalance -= amt
  }
  return rows
}
