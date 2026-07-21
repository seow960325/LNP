// SOCSO (PERKESO) First Category contribution schedule — Employment Injury
// Scheme + Invalidity Scheme ("Jenis Pertama").
//
// Source: "Kadar Caruman Akta Keselamatan Sosial Pekerja (Akta 4)", official
//   PERKESO document (perkeso.gov.my/images/dokumen/
//   "101024 - Kadar Caruman Akta 4.pdf"), i.e. the schedule issued for the
//   wage-ceiling increase to RM6,000 effective 1 October 2024. All 65 rows
//   below were transcribed directly from that PDF (Jenis Pertama columns).
//   Still current as of July 2026.
//
// NOT covered here: "Jenis Kedua" (employer-only, age 60+) and the SKBBK /
// lindung-24-jam add-on scheme — no official schedule was obtained for SKBBK
// (TODO_VERIFY, see payroll.test.ts summary).

export interface SocsoBandRow {
  over: number // wages exceeding this amount...
  upTo: number // ...but not exceeding this amount (Infinity = final row)
  employer: number // syer majikan (RM)
  employee: number // syer pekerja (RM)
}

export const SOCSO_CATEGORY1: SocsoBandRow[] = [
  { over: 0, upTo: 30, employer: 0.4, employee: 0.1 },
  { over: 30, upTo: 50, employer: 0.7, employee: 0.2 },
  { over: 50, upTo: 70, employer: 1.1, employee: 0.3 },
  { over: 70, upTo: 100, employer: 1.5, employee: 0.4 },
  { over: 100, upTo: 140, employer: 2.1, employee: 0.6 },
  { over: 140, upTo: 200, employer: 2.95, employee: 0.85 },
  { over: 200, upTo: 300, employer: 4.35, employee: 1.25 },
  { over: 300, upTo: 400, employer: 6.15, employee: 1.75 },
  { over: 400, upTo: 500, employer: 7.85, employee: 2.25 },
  { over: 500, upTo: 600, employer: 9.65, employee: 2.75 },
  { over: 600, upTo: 700, employer: 11.35, employee: 3.25 },
  { over: 700, upTo: 800, employer: 13.15, employee: 3.75 },
  { over: 800, upTo: 900, employer: 14.85, employee: 4.25 },
  { over: 900, upTo: 1000, employer: 16.65, employee: 4.75 },
  { over: 1000, upTo: 1100, employer: 18.35, employee: 5.25 },
  { over: 1100, upTo: 1200, employer: 20.15, employee: 5.75 },
  { over: 1200, upTo: 1300, employer: 21.85, employee: 6.25 },
  { over: 1300, upTo: 1400, employer: 23.65, employee: 6.75 },
  { over: 1400, upTo: 1500, employer: 25.35, employee: 7.25 },
  { over: 1500, upTo: 1600, employer: 27.15, employee: 7.75 },
  { over: 1600, upTo: 1700, employer: 28.85, employee: 8.25 },
  { over: 1700, upTo: 1800, employer: 30.65, employee: 8.75 },
  { over: 1800, upTo: 1900, employer: 32.35, employee: 9.25 },
  { over: 1900, upTo: 2000, employer: 34.15, employee: 9.75 },
  { over: 2000, upTo: 2100, employer: 35.85, employee: 10.25 },
  { over: 2100, upTo: 2200, employer: 37.65, employee: 10.75 },
  { over: 2200, upTo: 2300, employer: 39.35, employee: 11.25 },
  { over: 2300, upTo: 2400, employer: 41.15, employee: 11.75 },
  { over: 2400, upTo: 2500, employer: 42.85, employee: 12.25 },
  { over: 2500, upTo: 2600, employer: 44.65, employee: 12.75 },
  { over: 2600, upTo: 2700, employer: 46.35, employee: 13.25 },
  { over: 2700, upTo: 2800, employer: 48.15, employee: 13.75 },
  { over: 2800, upTo: 2900, employer: 49.85, employee: 14.25 },
  { over: 2900, upTo: 3000, employer: 51.65, employee: 14.75 },
  { over: 3000, upTo: 3100, employer: 53.35, employee: 15.25 },
  { over: 3100, upTo: 3200, employer: 55.15, employee: 15.75 },
  { over: 3200, upTo: 3300, employer: 56.85, employee: 16.25 },
  { over: 3300, upTo: 3400, employer: 58.65, employee: 16.75 },
  { over: 3400, upTo: 3500, employer: 60.35, employee: 17.25 },
  { over: 3500, upTo: 3600, employer: 62.15, employee: 17.75 },
  { over: 3600, upTo: 3700, employer: 63.85, employee: 18.25 },
  { over: 3700, upTo: 3800, employer: 65.65, employee: 18.75 },
  { over: 3800, upTo: 3900, employer: 67.35, employee: 19.25 },
  { over: 3900, upTo: 4000, employer: 69.15, employee: 19.75 },
  { over: 4000, upTo: 4100, employer: 70.85, employee: 20.25 },
  { over: 4100, upTo: 4200, employer: 72.65, employee: 20.75 },
  { over: 4200, upTo: 4300, employer: 74.35, employee: 21.25 },
  { over: 4300, upTo: 4400, employer: 76.15, employee: 21.75 },
  { over: 4400, upTo: 4500, employer: 77.85, employee: 22.25 },
  { over: 4500, upTo: 4600, employer: 79.65, employee: 22.75 },
  { over: 4600, upTo: 4700, employer: 81.35, employee: 23.25 },
  { over: 4700, upTo: 4800, employer: 83.15, employee: 23.75 },
  { over: 4800, upTo: 4900, employer: 84.85, employee: 24.25 },
  { over: 4900, upTo: 5000, employer: 86.65, employee: 24.75 },
  { over: 5000, upTo: 5100, employer: 88.35, employee: 25.25 },
  { over: 5100, upTo: 5200, employer: 90.15, employee: 25.75 },
  { over: 5200, upTo: 5300, employer: 91.85, employee: 26.25 },
  { over: 5300, upTo: 5400, employer: 93.65, employee: 26.75 },
  { over: 5400, upTo: 5500, employer: 95.35, employee: 27.25 },
  { over: 5500, upTo: 5600, employer: 97.15, employee: 27.75 },
  { over: 5600, upTo: 5700, employer: 98.85, employee: 28.25 },
  { over: 5700, upTo: 5800, employer: 100.65, employee: 28.75 },
  { over: 5800, upTo: 5900, employer: 102.35, employee: 29.25 },
  { over: 5900, upTo: 6000, employer: 104.15, employee: 29.75 },
  { over: 6000, upTo: Infinity, employer: 104.15, employee: 29.75 },
]

// Official expected contribution for a monthly wage (RM0 wage → no contribution).
export function socsoOfficial(wage: number): { employer: number; employee: number } {
  if (wage <= 0) return { employer: 0, employee: 0 }
  const row = SOCSO_CATEGORY1.find((r) => wage > r.over && wage <= r.upTo)!
  return { employer: row.employer, employee: row.employee }
}
