// src/lib/leaveDays.ts — pure helpers, no imports, no side effects

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
    const isSunday = cursor.getDay() === 0
    const isHoliday = holidayDates.some((h) => h.getTime() === cursor.getTime())
    if (!isSunday && !isHoliday) count++
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}
