// src/lib/leaveDays.test.ts — no test runner is installed yet (Phase 1A has
// no vitest/jest), so this uses a small local assert instead of a Node
// built-in (the app tsconfig has no "node" types). Still type-checks under
// tsc -b and can be executed directly with `node --experimental-strip-types`.
import { countLeaveDays } from './leaveDays'

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

// 1. Mon-Wed (no Sunday in range) = 3
assertEqual(countLeaveDays(d(2026, 7, 6), d(2026, 7, 8)), 3, 'Mon-Wed')

// 2. Range spanning one Sunday: Sat-Mon = 2 (Sat + Mon, Sun skipped)
assertEqual(countLeaveDays(d(2026, 7, 4), d(2026, 7, 6)), 2, 'Sat-Mon (one Sunday)')

// 3. Range spanning two Sundays: Sat 4 Jul - Mon 13 Jul = 8
assertEqual(countLeaveDays(d(2026, 7, 4), d(2026, 7, 13)), 8, 'Sat-Mon (two Sundays)')

// 4. Single working day = 1
assertEqual(countLeaveDays(d(2026, 7, 6), d(2026, 7, 6)), 1, 'single working day')

// 5. Single Sunday = 0
assertEqual(countLeaveDays(d(2026, 7, 5), d(2026, 7, 5)), 0, 'single Sunday')

// 6. endDate before startDate = 0
assertEqual(countLeaveDays(d(2026, 7, 8), d(2026, 7, 6)), 0, 'endDate before startDate')

// 7. Holiday inside range is skipped: Mon-Fri with Wed holiday = 4
assertEqual(countLeaveDays(d(2026, 7, 6), d(2026, 7, 10), [d(2026, 7, 8)]), 4, 'holiday inside range')

// 8. Holiday that falls on a Sunday doesn't double-subtract: same as Sat-Mon = 2
assertEqual(countLeaveDays(d(2026, 7, 4), d(2026, 7, 6), [d(2026, 7, 5)]), 2, 'holiday on Sunday')

console.log('leaveDays: all assertions passed')
