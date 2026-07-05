// src/lib/rosterAlgorithm.ts — pure duty-roster rotation math, no imports,
// no side effects (mirrors payrollCalc.ts's separation of pure calculation
// from payrollApi.ts's Supabase calls).

// Fixed reference Monday the whole rotation is anchored to. Changing this
// constant would reshuffle the meaning of every past and future assignment,
// so it must never move once real data depends on it.
export const EPOCH_MONDAY = '2024-01-01' // confirmed Monday

function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  const fromUTC = Date.UTC(fy, fm - 1, fd)
  const toUTC = Date.UTC(ty, tm - 1, td)
  return Math.round((toUTC - fromUTC) / 86400000)
}

// Working-day index D for a weekday date: counts Mon-Fri only, starting at
// 0 on EPOCH_MONDAY. Weekends never increment D, so the rotation carries
// over seamlessly week to week — D advances by 5 each week, and since 5 mod
// N != 0 for the pool sizes this rotation is built for, nobody lands back
// on the same Monday duty every week. Only meaningful for weekday dates.
export function workingDayIndex(dateISO: string): number {
  const totalDays = daysBetweenISO(EPOCH_MONDAY, dateISO)
  const weeks = Math.floor(totalDays / 7)
  const dayOfWeek = totalDays - weeks * 7 // 0=Mon..6=Sun, since EPOCH_MONDAY is a Monday
  return weeks * 5 + dayOfWeek
}

export interface SlotSource {
  id: string
  headcount: number
}

// Total duty slots S = sum of headcount across the given duty types.
export function totalSlots(dutyTypes: SlotSource[]): number {
  return dutyTypes.reduce((sum, dutyType) => sum + dutyType.headcount, 0)
}

// Expands duty types into a flat, ordered slot list — a duty with
// headcount 2 contributes 2 consecutive slots. The order must be stable
// across generations, so callers must always pass duty types pre-sorted by
// sort_order, since slotIndex below is purely positional.
export function buildSlots(dutyTypes: SlotSource[]): string[] {
  const slots: string[] = []
  for (const dutyType of dutyTypes) {
    for (let i = 0; i < dutyType.headcount; i++) slots.push(dutyType.id)
  }
  return slots
}

export interface PoolPerson {
  id: string
  full_name: string
}

// Fixed, stable pool ordering the rotation math depends on: by full_name,
// tie-broken by id. This order must never change between generations, or
// every past assignment's meaning would shift.
export function orderPool(pool: PoolPerson[]): PoolPerson[] {
  return [...pool].sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id))
}

export interface SlotAssignment {
  profile_id: string
  duty_type_id: string
}

// Maps the ordered pool onto the slot list for one date: the pool member at
// index i lands on slotIndex = (i + D) mod N, where D is the working-day
// index and N is the pool size. This is a bijection over i, so no two pool
// members ever land on the same slot for the same date. Returns [] if the
// pool is empty or the slot count doesn't match the pool size — callers
// must enforce S === N before relying on this.
export function computeAssignmentsForDate(
  orderedPool: PoolPerson[],
  slots: string[],
  dateISO: string
): SlotAssignment[] {
  const n = orderedPool.length
  if (n === 0 || slots.length !== n) return []
  const d = workingDayIndex(dateISO)
  return orderedPool.map((person, i) => ({
    profile_id: person.id,
    duty_type_id: slots[(i + d) % n],
  }))
}
