// EIS (Employment Insurance System / Sistem Insurans Pekerjaan, Act 800)
// contribution schedule. Employer and employee each pay the same amount.
//
// Source: "Kadar Caruman Sistem Insurans Pekerjaan (Akta 800)", official
//   PERKESO document (perkeso.gov.my/images/dokumen/
//   "101024 - Kadar Caruman Akta 800.pdf"), i.e. the schedule issued for the
//   wage-ceiling increase to RM6,000 effective 1 October 2024. All 65 rows
//   below were transcribed directly from that PDF. Still current as of
//   July 2026.
//
// Note the official amounts equal 0.2% of the band midpoint rounded UP to the
// next 5 sen (visible in the low bands: RM50–70 → RM0.15, RM70–100 → RM0.20).

export interface EisBandRow {
  over: number // wages exceeding this amount...
  upTo: number // ...but not exceeding this amount (Infinity = final row)
  each: number // caruman majikan = caruman pekerja (RM)
}

export const EIS_SCHEDULE: EisBandRow[] = [
  { over: 0, upTo: 30, each: 0.05 },
  { over: 30, upTo: 50, each: 0.1 },
  { over: 50, upTo: 70, each: 0.15 },
  { over: 70, upTo: 100, each: 0.2 },
  { over: 100, upTo: 140, each: 0.25 },
  { over: 140, upTo: 200, each: 0.35 },
  { over: 200, upTo: 300, each: 0.5 },
  { over: 300, upTo: 400, each: 0.7 },
  { over: 400, upTo: 500, each: 0.9 },
  { over: 500, upTo: 600, each: 1.1 },
  { over: 600, upTo: 700, each: 1.3 },
  { over: 700, upTo: 800, each: 1.5 },
  { over: 800, upTo: 900, each: 1.7 },
  { over: 900, upTo: 1000, each: 1.9 },
  { over: 1000, upTo: 1100, each: 2.1 },
  { over: 1100, upTo: 1200, each: 2.3 },
  { over: 1200, upTo: 1300, each: 2.5 },
  { over: 1300, upTo: 1400, each: 2.7 },
  { over: 1400, upTo: 1500, each: 2.9 },
  { over: 1500, upTo: 1600, each: 3.1 },
  { over: 1600, upTo: 1700, each: 3.3 },
  { over: 1700, upTo: 1800, each: 3.5 },
  { over: 1800, upTo: 1900, each: 3.7 },
  { over: 1900, upTo: 2000, each: 3.9 },
  { over: 2000, upTo: 2100, each: 4.1 },
  { over: 2100, upTo: 2200, each: 4.3 },
  { over: 2200, upTo: 2300, each: 4.5 },
  { over: 2300, upTo: 2400, each: 4.7 },
  { over: 2400, upTo: 2500, each: 4.9 },
  { over: 2500, upTo: 2600, each: 5.1 },
  { over: 2600, upTo: 2700, each: 5.3 },
  { over: 2700, upTo: 2800, each: 5.5 },
  { over: 2800, upTo: 2900, each: 5.7 },
  { over: 2900, upTo: 3000, each: 5.9 },
  { over: 3000, upTo: 3100, each: 6.1 },
  { over: 3100, upTo: 3200, each: 6.3 },
  { over: 3200, upTo: 3300, each: 6.5 },
  { over: 3300, upTo: 3400, each: 6.7 },
  { over: 3400, upTo: 3500, each: 6.9 },
  { over: 3500, upTo: 3600, each: 7.1 },
  { over: 3600, upTo: 3700, each: 7.3 },
  { over: 3700, upTo: 3800, each: 7.5 },
  { over: 3800, upTo: 3900, each: 7.7 },
  { over: 3900, upTo: 4000, each: 7.9 },
  { over: 4000, upTo: 4100, each: 8.1 },
  { over: 4100, upTo: 4200, each: 8.3 },
  { over: 4200, upTo: 4300, each: 8.5 },
  { over: 4300, upTo: 4400, each: 8.7 },
  { over: 4400, upTo: 4500, each: 8.9 },
  { over: 4500, upTo: 4600, each: 9.1 },
  { over: 4600, upTo: 4700, each: 9.3 },
  { over: 4700, upTo: 4800, each: 9.5 },
  { over: 4800, upTo: 4900, each: 9.7 },
  { over: 4900, upTo: 5000, each: 9.9 },
  { over: 5000, upTo: 5100, each: 10.1 },
  { over: 5100, upTo: 5200, each: 10.3 },
  { over: 5200, upTo: 5300, each: 10.5 },
  { over: 5300, upTo: 5400, each: 10.7 },
  { over: 5400, upTo: 5500, each: 10.9 },
  { over: 5500, upTo: 5600, each: 11.1 },
  { over: 5600, upTo: 5700, each: 11.3 },
  { over: 5700, upTo: 5800, each: 11.5 },
  { over: 5800, upTo: 5900, each: 11.7 },
  { over: 5900, upTo: 6000, each: 11.9 },
  { over: 6000, upTo: Infinity, each: 11.9 },
]

// Official expected contribution per side for a monthly wage.
export function eisOfficial(wage: number): number {
  if (wage <= 0) return 0
  const row = EIS_SCHEDULE.find((r) => wage > r.over && wage <= r.upTo)!
  return row.each
}
