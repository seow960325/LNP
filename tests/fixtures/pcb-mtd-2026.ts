// LHDN PCB / MTD (Monthly Tax Deduction) — Computerised Calculation Method,
// normal remuneration, resident employee, Year of Assessment 2026.
//
// Source: "Specification for Monthly Tax Deduction (MTD) Computerised
//   Calculation for Year 2026" (Lembaga Hasil Dalam Negeri Malaysia),
//   https://www.hasil.gov.my/media/arvlrzh5/spesifikasi-kaedah-pengiraan-berkomputer-pcb-2026.pdf
//   — document header states "Updated: 01 January 2026", "CALCULATION METHOD
//   FOR YEAR 2026". Table 1 (P/M/R/B) and Table 2 (rebate T) transcribed
//   verbatim from that PDF. Still current as of July 2026 — the spec
//   explicitly states no change to the formula for YA2026 vs YA2025.

export interface TaxBracketRow {
  pMin: number // lower bound of P range (exclusive, except first row which includes 0)
  pMax: number // upper bound of P range (Infinity for top row)
  m: number // M — first chargeable income of the range
  r: number // R — marginal rate, fraction (e.g. 0.01 for 1%)
  bCat1and3: number // B for Category 1 (single) & Category 3 (married, spouse working / divorced / widowed)
  bCat2: number // B for Category 2 (married, spouse NOT working)
}

// Table 1: Value of P, M, R and B (LHDN spec p.11 / p.25 area).
// P <= 5,000 is not listed because M/R/B do not apply there — tax is 0.
export const PCB_TABLE_1: TaxBracketRow[] = [
  { pMin: 5000, pMax: 20000, m: 5000, r: 0.01, bCat1and3: -400, bCat2: -800 },
  { pMin: 20000, pMax: 35000, m: 20000, r: 0.03, bCat1and3: -250, bCat2: -650 },
  { pMin: 35000, pMax: 50000, m: 35000, r: 0.06, bCat1and3: 600, bCat2: 600 },
  { pMin: 50000, pMax: 70000, m: 50000, r: 0.11, bCat1and3: 1500, bCat2: 1500 },
  { pMin: 70000, pMax: 100000, m: 70000, r: 0.19, bCat1and3: 3700, bCat2: 3700 },
  { pMin: 100000, pMax: 400000, m: 100000, r: 0.25, bCat1and3: 9400, bCat2: 9400 },
  { pMin: 400000, pMax: 600000, m: 400000, r: 0.26, bCat1and3: 84400, bCat2: 84400 },
  { pMin: 600000, pMax: 2000000, m: 600000, r: 0.28, bCat1and3: 136400, bCat2: 136400 },
  { pMin: 2000000, pMax: Infinity, m: 2000000, r: 0.3, bCat1and3: 528400, bCat2: 528400 },
]

// NOTE: the LHDN spec also publishes a "Table 2: Value of P, R and T" with a
// rebate T of RM400 (Category 1/3) / RM800 (Category 2) when P <= RM35,000 —
// but that table belongs to the SEPARATE flat-15%-rate formula for
// "Knowledge Worker in the Specified Region" / non-citizen C-suite
// individuals (a different section of the spec), NOT the normal-
// remuneration formula used here. For normal remuneration, Table 1's B
// column already nets out the equivalent rebate for the two low-income rows
// (compare bCat1and3 = -400/-250 against the "pure" cumulative tax of
// 0/150 for those rows — the -400 difference is baked in); no separate
// rebate subtraction is applied on top of annualTaxOfficial() below.

// Category definitions (LHDN spec section on Value of D, S, C):
export type PcbCategory = 'cat1_single' | 'cat2_married_spouse_not_working' | 'cat3_married_spouse_working'

// Reliefs (LHDN spec, "Types of Deduction" table):
export const RELIEF_INDIVIDUAL_D = 9000 // (a) Individual — automatic
export const RELIEF_SPOUSE_S = 4000 // (b) Husband/Wife — only if Category 2 and spouse not working
export const RELIEF_PER_CHILD_Q = 2000 // (c) Child — per qualifying child, ordinary rate
export const RELIEF_EPF_CAP_K = 4000 // (d) EPF or other approved scheme, capped per year
export const RELIEF_SOCSO_CAP = 350 // (k) SOCSO contribution, capped per year — EIS not separately listed in this spec

// Section: Rounding rules for the final MTD amount (LHDN spec, "Rounding" clause).
export function roundMtdOfficial(raw: number): number {
  if (raw <= 0) return 0
  // 1. Truncate (not round) to 2 decimal places.
  const truncated = Math.trunc(raw * 100) / 100
  const cents = Math.round(truncated * 100)
  const lastDigit = cents % 5
  // 2. Round UP to the next 5 sen (1-4 -> +to 5, 6-9 -> +to 10).
  const roundedCents = lastDigit === 0 ? cents : cents + (5 - lastDigit)
  const result = roundedCents / 100
  // 3. If MTD (before zakat deduction) < RM10, no deduction required.
  return result < 10 ? 0 : result
}

export function annualTaxOfficial(p: number, category: PcbCategory): number {
  if (p <= 5000) return 0
  const row = PCB_TABLE_1.find((r) => p > r.pMin && p <= r.pMax) ?? PCB_TABLE_1[PCB_TABLE_1.length - 1]
  const b = category === 'cat2_married_spouse_not_working' ? row.bCat2 : row.bCat1and3
  return (p - row.m) * row.r + b
}

// -----------------------------------------------------------------------
// TODO_VERIFY
// -----------------------------------------------------------------------
// - The LHDN spec's worked examples (section on normal + additional
//   remuneration) were used to sanity-check the P formula and rounding
//   rules, but this file only encodes the "normal remuneration" case
//   (no bonus/additional remuneration formula, no zakat, no TP1/TP3
//   additional-relief handling). Scenarios requiring those are out of
//   scope for this fixture.
// - Whether EIS contributions are eligible for the RM350 relief cap
//   alongside SOCSO is NOT stated in this LHDN document (only "SOCSO" is
//   named in relief item (k)) — flagged here since some commercial payroll
//   guides describe a combined SOCSO+EIS cap. Do not assume combined
//   treatment without checking a more recent LHDN Public Ruling.
