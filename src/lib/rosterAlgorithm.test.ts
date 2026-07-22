// src/lib/rosterAlgorithm.test.ts — no test runner is installed yet, so this
// uses a small local assert (mirrors leaveDays.test.ts). Type-checks under
// tsc -b and can be executed directly with `node --experimental-strip-types`.
import {
  EPOCH_MONDAY,
  workingDayIndex,
  totalSlots,
  buildSlots,
  orderPool,
  computeAssignmentsForDate,
} from './rosterAlgorithm'

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  if (!same) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// --- workingDayIndex ---
// EPOCH_MONDAY itself is D=0.
assertEqual(workingDayIndex(EPOCH_MONDAY), 0, 'epoch Monday D=0')
assertEqual(workingDayIndex('2024-01-02'), 1, 'epoch Tue D=1')
assertEqual(workingDayIndex('2024-01-03'), 2, 'epoch Wed D=2')
assertEqual(workingDayIndex('2024-01-04'), 3, 'epoch Thu D=3')
assertEqual(workingDayIndex('2024-01-05'), 4, 'epoch Fri D=4')
// Weekend (Jan 6-7) is skipped entirely — next Monday continues at D=5,
// not reset to 0. This is what makes the rotation continuous across weeks.
assertEqual(workingDayIndex('2024-01-08'), 5, 'next Monday D=5 (no reset)')
assertEqual(workingDayIndex('2024-01-09'), 6, 'next Tuesday D=6')
// A full year later — sanity check the formula doesn't drift.
assertEqual(workingDayIndex('2024-01-15'), 10, 'third Monday D=10')

// --- totalSlots / buildSlots ---
const dutyTypes = [
  { id: 'on-duty', headcount: 1 },
  { id: 'teaching', headcount: 1 },
  { id: 'standby', headcount: 1 },
]
assertEqual(totalSlots(dutyTypes), 3, 'S = 3 for three headcount-1 duties')
assertEqual(buildSlots(dutyTypes), ['on-duty', 'teaching', 'standby'], 'slots expand in order')

const dutyTypesWithHeadcount2 = [
  { id: 'on-duty', headcount: 1 },
  { id: 'teaching', headcount: 1 },
  { id: 'standby', headcount: 2 },
]
assertEqual(totalSlots(dutyTypesWithHeadcount2), 4, 'S = 4 once standby headcount bumps to 2')
assertEqual(
  buildSlots(dutyTypesWithHeadcount2),
  ['on-duty', 'teaching', 'standby', 'standby'],
  'headcount 2 contributes 2 consecutive slots'
)

// --- orderPool ---
const pool = [
  { id: 'z-id', full_name: 'Charlie' },
  { id: 'a-id', full_name: 'Alice' },
  { id: 'b-id', full_name: 'Bob' },
]
assertEqual(
  orderPool(pool).map((p) => p.full_name),
  ['Alice', 'Bob', 'Charlie'],
  'pool ordered by full_name'
)
const tiedPool = [
  { id: 'b-id', full_name: 'Alice' },
  { id: 'a-id', full_name: 'Alice' },
]
assertEqual(
  orderPool(tiedPool).map((p) => p.id),
  ['a-id', 'b-id'],
  'tied names broken by id'
)

// --- computeAssignmentsForDate: spec's own worked example ---
// N=3: on EPOCH_MONDAY (D=0), A=slot0, B=slot1, C=slot2; next day (D=1),
// A=slot1, B=slot2, C=slot0 — a clean round-robin.
const orderedPool = [
  { id: 'A', full_name: 'A' },
  { id: 'B', full_name: 'B' },
  { id: 'C', full_name: 'C' },
]
const slots = buildSlots(dutyTypes) // ['on-duty', 'teaching', 'standby']

const monday = computeAssignmentsForDate(orderedPool, slots, EPOCH_MONDAY)
assertEqual(monday.find((a) => a.staff_member_id === 'A')?.duty_type_id, 'on-duty', 'Mon: A -> slot0 (on-duty)')
assertEqual(monday.find((a) => a.staff_member_id === 'B')?.duty_type_id, 'teaching', 'Mon: B -> slot1 (teaching)')
assertEqual(monday.find((a) => a.staff_member_id === 'C')?.duty_type_id, 'standby', 'Mon: C -> slot2 (standby)')

const tuesday = computeAssignmentsForDate(orderedPool, slots, '2024-01-02')
assertEqual(tuesday.find((a) => a.staff_member_id === 'A')?.duty_type_id, 'teaching', 'Tue: A -> slot1 (teaching)')
assertEqual(tuesday.find((a) => a.staff_member_id === 'B')?.duty_type_id, 'standby', 'Tue: B -> slot2 (standby)')
assertEqual(tuesday.find((a) => a.staff_member_id === 'C')?.duty_type_id, 'on-duty', 'Tue: C -> slot0 (on-duty)')

// Next week's Monday (D=5): 5 mod 3 = 2, so the rotation has advanced
// rather than resetting — A is now on slot2, not back on slot0.
const nextMonday = computeAssignmentsForDate(orderedPool, slots, '2024-01-08')
assertEqual(nextMonday.find((a) => a.staff_member_id === 'A')?.duty_type_id, 'standby', 'next Mon: A -> slot2 (continuity, not reset)')

// S !== N guard: mismatched slot/pool counts produce no assignments at all.
assertEqual(computeAssignmentsForDate(orderedPool, buildSlots(dutyTypesWithHeadcount2), EPOCH_MONDAY).length, 0, 'S!=N yields []')

console.log('rosterAlgorithm.test.ts: all assertions passed')
