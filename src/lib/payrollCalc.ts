// Malaysian statutory payroll calculations — pure functions, no UI, no
// Supabase calls, no side effects. All amounts are in RM.
//
// Rates/tables as of Malaysia 2026:
//   - EPF:     KWSP Third Schedule contribution rates
//   - SOCSO:   PERKESO First Category contribution table (Employment Injury +
//              Invalidity, and the optional SKBBK / 24-hour coverage add-on)
//   - EIS:     Employment Insurance System, Employment Insurance System Act 800
//   - PCB/MTD: LHDN Computerised Calculation Method (Kaedah Pengiraan
//              Berkomputer) for normal remuneration, resident employees

export type SocsoScheme = 'standard' | 'with_skbbk'

export interface PayrollInput {
  grossForStatutory: number // wage used for EPF/SOCSO/EIS (base + allowance + OT + bonus - unpaid; caller computes)
  epfRateEmployee: number // e.g. 11
  epfRateEmployerLow: number // e.g. 13 (salary <= 5000)
  epfRateEmployerHigh: number // e.g. 12 (salary > 5000)
  socsoScheme: SocsoScheme
  // PCB inputs:
  monthIndex: number // 1-12, current payroll month
  ytdGross: number // accumulated gross (statutory wage) for months BEFORE this one
  ytdEpfEmployee: number // accumulated employee EPF before this month
  ytdSocsoEmployee: number // accumulated employee SOCSO before this month
  ytdPcbPaid: number // accumulated PCB already deducted before this month
}

export interface PayrollResult {
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
  pcb: number
}

// ---------------------------------------------------------------------------
// 1. EPF (KWSP)
// ---------------------------------------------------------------------------

export function calcEPF(
  grossForStatutory: number,
  epfRateEmployee: number,
  epfRateEmployerLow: number,
  epfRateEmployerHigh: number,
): { epfEmployee: number; epfEmployer: number } {
  if (grossForStatutory <= 0) return { epfEmployee: 0, epfEmployer: 0 }

  const employerRate = grossForStatutory <= 5000 ? epfRateEmployerLow : epfRateEmployerHigh

  // EPF contributions are paid in whole ringgit, rounded UP.
  const epfEmployee = Math.ceil((grossForStatutory * epfRateEmployee) / 100)
  const epfEmployer = Math.ceil((grossForStatutory * employerRate) / 100)

  return { epfEmployee, epfEmployer }
}

// ---------------------------------------------------------------------------
// 2. SOCSO (PERKESO) — First Category, under 60, wage ceiling RM6000
// ---------------------------------------------------------------------------

export interface SocsoBracket {
  max: number // upper wage bound of this bracket (RM)
  standardEmp: number // Employment Injury + Invalidity — employee share
  standardEr: number // Employment Injury + Invalidity — employer share
  skbbkEmp: number // includes SKBBK (24-hour coverage) — employee share
  skbbkEr: number // includes SKBBK (24-hour coverage) — employer share
}

// standardEmp/standardEr are the verified official PERKESO First Category
// values (Employment Injury + Invalidity).
//
// *** SKBBK COLUMNS ARE PLACEHOLDERS (= standard). ***
// skbbkEmp/skbbkEr are NOT yet the real lindung-24-jam figures — they are
// currently set equal to the standard columns as a stand-in. Do NOT set
// payroll_settings.socso_scheme = 'with_skbbk' until these are replaced
// with verified figures from a real June-2026 payslip.
export const SOCSO_TABLE: SocsoBracket[] = [
  { max: 30, standardEmp: 0.10, standardEr: 0.40, skbbkEmp: 0.10, skbbkEr: 0.40 },
  { max: 50, standardEmp: 0.20, standardEr: 0.70, skbbkEmp: 0.20, skbbkEr: 0.70 },
  { max: 70, standardEmp: 0.30, standardEr: 1.10, skbbkEmp: 0.30, skbbkEr: 1.10 },
  { max: 100, standardEmp: 0.40, standardEr: 1.50, skbbkEmp: 0.40, skbbkEr: 1.50 },
  { max: 140, standardEmp: 0.60, standardEr: 2.10, skbbkEmp: 0.60, skbbkEr: 2.10 },
  { max: 200, standardEmp: 0.85, standardEr: 2.95, skbbkEmp: 0.85, skbbkEr: 2.95 },
  { max: 300, standardEmp: 1.25, standardEr: 4.35, skbbkEmp: 1.25, skbbkEr: 4.35 },
  { max: 400, standardEmp: 1.75, standardEr: 6.15, skbbkEmp: 1.75, skbbkEr: 6.15 },
  { max: 500, standardEmp: 2.25, standardEr: 7.85, skbbkEmp: 2.25, skbbkEr: 7.85 },
  { max: 600, standardEmp: 2.75, standardEr: 9.65, skbbkEmp: 2.75, skbbkEr: 9.65 },
  { max: 700, standardEmp: 3.25, standardEr: 11.35, skbbkEmp: 3.25, skbbkEr: 11.35 },
  { max: 800, standardEmp: 3.75, standardEr: 13.15, skbbkEmp: 3.75, skbbkEr: 13.15 },
  { max: 900, standardEmp: 4.25, standardEr: 14.85, skbbkEmp: 4.25, skbbkEr: 14.85 },
  { max: 1000, standardEmp: 4.75, standardEr: 16.65, skbbkEmp: 4.75, skbbkEr: 16.65 },
  { max: 1100, standardEmp: 5.25, standardEr: 18.35, skbbkEmp: 5.25, skbbkEr: 18.35 },
  { max: 1200, standardEmp: 5.75, standardEr: 20.15, skbbkEmp: 5.75, skbbkEr: 20.15 },
  { max: 1300, standardEmp: 6.25, standardEr: 21.85, skbbkEmp: 6.25, skbbkEr: 21.85 },
  { max: 1400, standardEmp: 6.75, standardEr: 23.65, skbbkEmp: 6.75, skbbkEr: 23.65 },
  { max: 1500, standardEmp: 7.25, standardEr: 25.35, skbbkEmp: 7.25, skbbkEr: 25.35 },
  { max: 1600, standardEmp: 7.75, standardEr: 27.15, skbbkEmp: 7.75, skbbkEr: 27.15 },
  { max: 1700, standardEmp: 8.25, standardEr: 28.85, skbbkEmp: 8.25, skbbkEr: 28.85 },
  { max: 1800, standardEmp: 8.75, standardEr: 30.65, skbbkEmp: 8.75, skbbkEr: 30.65 },
  { max: 1900, standardEmp: 9.25, standardEr: 32.35, skbbkEmp: 9.25, skbbkEr: 32.35 },
  { max: 2000, standardEmp: 9.75, standardEr: 34.15, skbbkEmp: 9.75, skbbkEr: 34.15 },
  { max: 2100, standardEmp: 10.25, standardEr: 35.85, skbbkEmp: 10.25, skbbkEr: 35.85 },
  { max: 2200, standardEmp: 10.75, standardEr: 37.65, skbbkEmp: 10.75, skbbkEr: 37.65 },
  { max: 2300, standardEmp: 11.25, standardEr: 39.35, skbbkEmp: 11.25, skbbkEr: 39.35 },
  { max: 2400, standardEmp: 11.75, standardEr: 41.15, skbbkEmp: 11.75, skbbkEr: 41.15 },
  { max: 2500, standardEmp: 12.25, standardEr: 42.85, skbbkEmp: 12.25, skbbkEr: 42.85 },
  { max: 2600, standardEmp: 12.75, standardEr: 44.65, skbbkEmp: 12.75, skbbkEr: 44.65 },
  { max: 2700, standardEmp: 13.25, standardEr: 46.35, skbbkEmp: 13.25, skbbkEr: 46.35 },
  { max: 2800, standardEmp: 13.75, standardEr: 48.15, skbbkEmp: 13.75, skbbkEr: 48.15 },
  { max: 2900, standardEmp: 14.25, standardEr: 49.85, skbbkEmp: 14.25, skbbkEr: 49.85 },
  { max: 3000, standardEmp: 14.75, standardEr: 51.65, skbbkEmp: 14.75, skbbkEr: 51.65 },
  { max: 3100, standardEmp: 15.25, standardEr: 53.35, skbbkEmp: 15.25, skbbkEr: 53.35 },
  { max: 3200, standardEmp: 15.75, standardEr: 55.15, skbbkEmp: 15.75, skbbkEr: 55.15 },
  { max: 3300, standardEmp: 16.25, standardEr: 56.85, skbbkEmp: 16.25, skbbkEr: 56.85 },
  { max: 3400, standardEmp: 16.75, standardEr: 58.65, skbbkEmp: 16.75, skbbkEr: 58.65 },
  { max: 3500, standardEmp: 17.25, standardEr: 60.35, skbbkEmp: 17.25, skbbkEr: 60.35 },
  { max: 3600, standardEmp: 17.75, standardEr: 62.15, skbbkEmp: 17.75, skbbkEr: 62.15 },
  { max: 3700, standardEmp: 18.25, standardEr: 63.85, skbbkEmp: 18.25, skbbkEr: 63.85 },
  { max: 3800, standardEmp: 18.75, standardEr: 65.65, skbbkEmp: 18.75, skbbkEr: 65.65 },
  { max: 3900, standardEmp: 19.25, standardEr: 67.35, skbbkEmp: 19.25, skbbkEr: 67.35 },
  { max: 4000, standardEmp: 19.75, standardEr: 69.15, skbbkEmp: 19.75, skbbkEr: 69.15 },
  { max: 4100, standardEmp: 20.25, standardEr: 70.85, skbbkEmp: 20.25, skbbkEr: 70.85 },
  { max: 4200, standardEmp: 20.75, standardEr: 72.65, skbbkEmp: 20.75, skbbkEr: 72.65 },
  { max: 4300, standardEmp: 21.25, standardEr: 74.35, skbbkEmp: 21.25, skbbkEr: 74.35 },
  { max: 4400, standardEmp: 21.75, standardEr: 76.15, skbbkEmp: 21.75, skbbkEr: 76.15 },
  { max: 4500, standardEmp: 22.25, standardEr: 77.85, skbbkEmp: 22.25, skbbkEr: 77.85 },
  { max: 4600, standardEmp: 22.75, standardEr: 79.65, skbbkEmp: 22.75, skbbkEr: 79.65 },
  { max: 4700, standardEmp: 23.25, standardEr: 81.35, skbbkEmp: 23.25, skbbkEr: 81.35 },
  { max: 4800, standardEmp: 23.75, standardEr: 83.15, skbbkEmp: 23.75, skbbkEr: 83.15 },
  { max: 4900, standardEmp: 24.25, standardEr: 84.85, skbbkEmp: 24.25, skbbkEr: 84.85 },
  { max: 5000, standardEmp: 24.75, standardEr: 86.65, skbbkEmp: 24.75, skbbkEr: 86.65 },
  { max: 5100, standardEmp: 25.25, standardEr: 88.35, skbbkEmp: 25.25, skbbkEr: 88.35 },
  { max: 5200, standardEmp: 25.75, standardEr: 90.15, skbbkEmp: 25.75, skbbkEr: 90.15 },
  { max: 5300, standardEmp: 26.25, standardEr: 91.85, skbbkEmp: 26.25, skbbkEr: 91.85 },
  { max: 5400, standardEmp: 26.75, standardEr: 93.65, skbbkEmp: 26.75, skbbkEr: 93.65 },
  { max: 5500, standardEmp: 27.25, standardEr: 95.35, skbbkEmp: 27.25, skbbkEr: 95.35 },
  { max: 5600, standardEmp: 27.75, standardEr: 97.15, skbbkEmp: 27.75, skbbkEr: 97.15 },
  { max: 5700, standardEmp: 28.25, standardEr: 98.85, skbbkEmp: 28.25, skbbkEr: 98.85 },
  { max: 5800, standardEmp: 28.75, standardEr: 100.65, skbbkEmp: 28.75, skbbkEr: 100.65 },
  { max: 5900, standardEmp: 29.25, standardEr: 102.35, skbbkEmp: 29.25, skbbkEr: 102.35 },
  { max: 6000, standardEmp: 29.75, standardEr: 104.15, skbbkEmp: 29.75, skbbkEr: 104.15 },
]

export function calcSOCSO(
  grossForStatutory: number,
  socsoScheme: SocsoScheme,
): { socsoEmployee: number; socsoEmployer: number } {
  if (grossForStatutory <= 0) return { socsoEmployee: 0, socsoEmployer: 0 }

  const wage = Math.min(grossForStatutory, 6000)
  const bracket = SOCSO_TABLE.find((b) => wage <= b.max) ?? SOCSO_TABLE[SOCSO_TABLE.length - 1]

  return socsoScheme === 'with_skbbk'
    ? { socsoEmployee: bracket.skbbkEmp, socsoEmployer: bracket.skbbkEr }
    : { socsoEmployee: bracket.standardEmp, socsoEmployer: bracket.standardEr }
}

// ---------------------------------------------------------------------------
// 3. EIS (Employment Insurance System, Act 800) — 0.2% + 0.2%, ceiling RM6000
// ---------------------------------------------------------------------------

// No separate EIS table: EIS uses the same wage bands as SOCSO_TABLE. For a
// capped wage, find its SOCSO band and take the band midpoint
// (prevMax + thisMax) / 2; the EIS amount (each side) is 0.2% of that
// midpoint, rounded to the nearest 5 sen, capped at RM11.90.
function roundToNearest5Sen(amount: number): number {
  return Math.round((Math.round(amount / 0.05) * 0.05) * 100) / 100
}

export function calcEIS(grossForStatutory: number): { eisEmployee: number; eisEmployer: number } {
  if (grossForStatutory <= 0) return { eisEmployee: 0, eisEmployer: 0 }

  const wage = Math.min(grossForStatutory, 6000)

  let prevMax = 0
  let bracketMax = SOCSO_TABLE[SOCSO_TABLE.length - 1].max
  for (const bracket of SOCSO_TABLE) {
    if (wage <= bracket.max) {
      bracketMax = bracket.max
      break
    }
    prevMax = bracket.max
  }

  const midpoint = (prevMax + bracketMax) / 2
  const amount = Math.min(roundToNearest5Sen(0.002 * midpoint), 11.9)

  return { eisEmployee: amount, eisEmployer: amount }
}

// ---------------------------------------------------------------------------
// 4. PCB / MTD (LHDN Computerised Method) — normal remuneration, resident
// ---------------------------------------------------------------------------

// Simplified reliefs ONLY — ignores spouse, children, and all other reliefs.
const PERSONAL_RELIEF = 9000
const EPF_RELIEF_CAP = 4000
const SOCSO_RELIEF_CAP = 350
const REBATE_THRESHOLD = 35000
const REBATE_AMOUNT = 400

interface TaxBracket {
  min: number
  max: number // Infinity for the top bracket
  rate: number // fraction, e.g. 0.01 for 1%
}

// Resident tax brackets 2026 (chargeable income, marginal).
const TAX_BRACKETS: TaxBracket[] = [
  { min: 0, max: 5000, rate: 0 },
  { min: 5000, max: 20000, rate: 0.01 },
  { min: 20000, max: 35000, rate: 0.03 },
  { min: 35000, max: 50000, rate: 0.06 },
  { min: 50000, max: 70000, rate: 0.11 },
  { min: 70000, max: 100000, rate: 0.19 },
  { min: 100000, max: 400000, rate: 0.25 },
  { min: 400000, max: 600000, rate: 0.26 },
  { min: 600000, max: 2000000, rate: 0.28 },
  { min: 2000000, max: Infinity, rate: 0.3 },
]

export function annualTax(chargeableIncome: number): number {
  if (chargeableIncome <= 0) return 0

  let tax = 0
  for (const bracket of TAX_BRACKETS) {
    if (chargeableIncome <= bracket.min) break
    const taxableInBracket = Math.min(chargeableIncome, bracket.max) - bracket.min
    tax += taxableInBracket * bracket.rate
  }
  return tax
}

// Truncate to 2 decimals, then round UP to the nearest 5 cents.
function roundMtd(raw: number): number {
  if (raw <= 0) return 0

  const truncated = Math.trunc(raw * 100) / 100
  const cents = Math.round(truncated * 100)
  const roundedCents = Math.ceil(cents / 5) * 5
  const result = roundedCents / 100

  return result < 10 ? 0 : result
}

export function calcPCB(
  input: PayrollInput,
  thisMonthEpfEmployee: number,
  thisMonthSocsoEmployee: number,
): number {
  const thisMonthGross = input.grossForStatutory
  const n = 12 - input.monthIndex // remaining months after the current one
  const monthsRemainingIncl = n + 1 // this month + remaining months

  const projectedAnnualEpf = input.ytdEpfEmployee + thisMonthEpfEmployee * monthsRemainingIncl
  const projectedAnnualSocso = input.ytdSocsoEmployee + thisMonthSocsoEmployee * monthsRemainingIncl

  const epfRelief = Math.min(projectedAnnualEpf, EPF_RELIEF_CAP)
  const socsoRelief = Math.min(projectedAnnualSocso, SOCSO_RELIEF_CAP)

  const earnedSoFarNet = input.ytdGross - input.ytdEpfEmployee - input.ytdSocsoEmployee
  const projectedRemainingNet =
    (thisMonthGross - thisMonthEpfEmployee - thisMonthSocsoEmployee) * monthsRemainingIncl

  const P = earnedSoFarNet + projectedRemainingNet - PERSONAL_RELIEF - epfRelief - socsoRelief

  let T = annualTax(Math.max(P, 0))
  if (P <= REBATE_THRESHOLD) {
    T = Math.max(0, T - REBATE_AMOUNT)
  }

  const rawMtd = (T - input.ytdPcbPaid) / monthsRemainingIncl

  return roundMtd(rawMtd)
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function calcPayroll(input: PayrollInput): PayrollResult {
  const { epfEmployee, epfEmployer } = calcEPF(
    input.grossForStatutory,
    input.epfRateEmployee,
    input.epfRateEmployerLow,
    input.epfRateEmployerHigh,
  )
  const { socsoEmployee, socsoEmployer } = calcSOCSO(input.grossForStatutory, input.socsoScheme)
  const { eisEmployee, eisEmployer } = calcEIS(input.grossForStatutory)
  const pcb = calcPCB(input, epfEmployee, socsoEmployee)

  return {
    epfEmployee,
    epfEmployer,
    socsoEmployee,
    socsoEmployer,
    eisEmployee,
    eisEmployer,
    pcb,
  }
}

// ---------------------------------------------------------------------------
// Example usage (not executed — no test runner is added here)
// ---------------------------------------------------------------------------
//
// const example1 = calcPayroll({
//   grossForStatutory: 3000,
//   epfRateEmployee: 11,
//   epfRateEmployerLow: 13,
//   epfRateEmployerHigh: 12,
//   socsoScheme: 'standard',
//   monthIndex: 1,
//   ytdGross: 0,
//   ytdEpfEmployee: 0,
//   ytdSocsoEmployee: 0,
//   ytdPcbPaid: 0,
// })
// // expect: epfEmployee === Math.ceil(3000 * 0.11) === 330
// // expect: epfEmployer === Math.ceil(3000 * 0.13) === 390 (<=5000 -> low rate)
//
// const example2 = calcPayroll({
//   grossForStatutory: 5000,
//   epfRateEmployee: 11,
//   epfRateEmployerLow: 13,
//   epfRateEmployerHigh: 12,
//   socsoScheme: 'with_skbbk',
//   monthIndex: 6,
//   ytdGross: 25000,
//   ytdEpfEmployee: 2750,
//   ytdSocsoEmployee: 0, // placeholder until SOCSO_TABLE is filled in
//   ytdPcbPaid: 0,
// })
// // expect: epfEmployee === Math.ceil(5000 * 0.11) === 550
// // expect: epfEmployer === Math.ceil(5000 * 0.13) === 650 (<=5000 -> low rate, boundary is inclusive)
