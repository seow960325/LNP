// src/lib/leaveDays.ts — pure helpers, no imports, no side effects

// Parses a YYYY-MM-DD string (as produced by a <input type="date">) into a
// local calendar Date, matching how countLeaveDays compares dates — avoids
// the UTC-midnight shift `new Date(iso)` would introduce.
export function parseISODateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Counts working days between startDate and endDate (inclusive on both ends).
 * Center runs 6 days/week: Sunday is the closed day and is NOT counted.
 * Optionally skips a list of holiday dates.
 */
export function countLeaveDays(
  startDate: Date,
  endDate: Date,
  holidays: Date[] = []
): number {
  const start = toCalendarDate(startDate)
  const end = toCalendarDate(endDate)

  if (end.getTime() < start.getTime()) return 0

  const holidayDates = holidays.map(toCalendarDate)

  let count = 0
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getDay()
    const isWeekend = day === 0 || day === 6
    const isHoliday = holidayDates.some((h) => h.getTime() === cursor.getTime())
    if (!isWeekend && !isHoliday) count++
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}
