import { describe, it, expect } from 'vitest'
import { calcEPF, calcSOCSO, calcEIS, calcPayroll, type PayrollInput } from '../src/lib/payrollCalc'
import { socsoOfficial } from './fixtures/socso-category1'
import { eisOfficial } from './fixtures/eis-schedule'
import { epfOfficialApprox, EPF_RATE_EMPLOYEE, EPF_RATE_EMPLOYER_LOW, EPF_RATE_EMPLOYER_HIGH } from './fixtures/epf-schedule'
import { annualTaxOfficial, roundMtdOfficial, type PcbCategory } from './fixtures/pcb-mtd-2026'

// Required salary matrix (RM).
const SALARY_MATRIX = [1200, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000]

// Edge cases: RM0, wage-band boundaries (SOCSO/EIS bands are RM100 wide;
// EPF employer-rate boundary is RM5,000), and wages above the SOCSO/EIS
// RM6,000 ceiling. Low bands (RM30/50/70/100/140) are included because they
// are where a real discrepancy was found between the app's EIS formula and
// PERKESO's published table (see report).
const EDGE_CASES = [0, 30, 50, 70, 100, 140, 5000, 6000, 6000.01, 7500, 20000]

const ALL_WAGES = [...SALARY_MATRIX, ...EDGE_CASES]

function baseInput(gross: number): PayrollInput {
  return {
    grossForStatutory: gross,
    epfRateEmployee: 11,
    epfRateEmployerLow: 13,
    epfRateEmployerHigh: 12,
    socsoScheme: 'standard',
    monthIndex: 1,
    ytdGross: 0,
    ytdEpfEmployee: 0,
    ytdSocsoEmployee: 0,
    ytdPcbPaid: 0,
  }
}

describe('EPF (KWSP) — TODO_VERIFY: fixture is a rule-based approximation, not the literal Third Schedule table (see tests/fixtures/epf-schedule.ts)', () => {
  for (const wage of ALL_WAGES) {
    it(`wage RM${wage}`, () => {
      const app = calcEPF(wage, 11, 13, 12)
      const official = epfOfficialApprox(wage)
      expect(app.epfEmployee).toBe(official.employee)
      expect(app.epfEmployer).toBe(official.employer)
    })
  }

  it('employer rate switches at the RM5,000 boundary (inclusive of RM5,000 at the low rate)', () => {
    const at5000 = calcEPF(5000, EPF_RATE_EMPLOYEE * 100, EPF_RATE_EMPLOYER_LOW * 100, EPF_RATE_EMPLOYER_HIGH * 100)
    expect(at5000.epfEmployer).toBe(650) // ceil(5000 * 0.13)
    const at5001 = calcEPF(5001, EPF_RATE_EMPLOYEE * 100, EPF_RATE_EMPLOYER_LOW * 100, EPF_RATE_EMPLOYER_HIGH * 100)
    expect(at5001.epfEmployer).toBe(601) // ceil(5001 * 0.12)
  })
})

describe('SOCSO (PERKESO Category 1, standard scheme)', () => {
  for (const wage of ALL_WAGES) {
    it(`wage RM${wage}`, () => {
      const app = calcSOCSO(wage, 'standard')
      const official = socsoOfficial(wage)
      expect(app.socsoEmployee).toBe(official.employee)
      expect(app.socsoEmployer).toBe(official.employer)
    })
  }
})

describe('EIS (Employment Insurance System)', () => {
  for (const wage of ALL_WAGES) {
    it(`wage RM${wage}`, () => {
      const app = calcEIS(wage)
      const official = eisOfficial(wage)
      expect(app.eisEmployee).toBe(official)
      expect(app.eisEmployer).toBe(official)
    })
  }
})

// ---------------------------------------------------------------------------
// PCB / MTD
// ---------------------------------------------------------------------------
//
// The app's PayrollInput has NO fields for marital status or number of
// children (see src/lib/payrollCalc.ts:14-26, and its own comment: "Simplified
// reliefs ONLY — ignores spouse, children, and all other reliefs."). These
// tests compute the OFFICIALLY correct MTD for each family scenario (using
// the real LHDN reliefs/category) and compare it against what the app
// actually produces for the same gross wage — the app is structurally unable
// to tell these scenarios apart, so any deviation from "single, no kids" is
// expected to surface as a mismatch here.

const RELIEF_INDIVIDUAL = 9000
const RELIEF_SPOUSE = 4000
const RELIEF_PER_CHILD = 2000
const EPF_RELIEF_CAP = 4000
const SOCSO_RELIEF_CAP = 350

interface PcbScenario {
  name: string
  category: PcbCategory
  numChildren: number
}

const PCB_SCENARIOS: PcbScenario[] = [
  { name: 'single employee, no children', category: 'cat1_single', numChildren: 0 },
  { name: 'married, non-working spouse, no children', category: 'cat2_married_spouse_not_working', numChildren: 0 },
  { name: 'married, spouse working, 2 children', category: 'cat3_married_spouse_working', numChildren: 2 },
]

const PCB_TEST_WAGES = [2500, 4000, 6000, 8000]

describe('PCB / MTD (LHDN Computerised Calculation, normal remuneration, month 1 of year)', () => {
  for (const scenario of PCB_SCENARIOS) {
    describe(scenario.name, () => {
      for (const wage of PCB_TEST_WAGES) {
        it(`wage RM${wage}`, () => {
          const input = baseInput(wage)
          const appResult = calcPayroll(input)

          // Officially correct EPF/SOCSO employee contributions for the relief calc.
          const officialEpfEmployee = epfOfficialApprox(wage).employee
          const officialSocsoEmployee = socsoOfficial(wage).employee

          const monthsRemainingIncl = 12 // month 1, n=11
          const epfRelief = Math.min(officialEpfEmployee * monthsRemainingIncl, EPF_RELIEF_CAP)
          const socsoRelief = Math.min(officialSocsoEmployee * monthsRemainingIncl, SOCSO_RELIEF_CAP)

          const spouseRelief = scenario.category === 'cat2_married_spouse_not_working' ? RELIEF_SPOUSE : 0
          const childRelief = scenario.numChildren * RELIEF_PER_CHILD

          const projectedRemainingNet = (wage - officialEpfEmployee - officialSocsoEmployee) * monthsRemainingIncl
          const P = projectedRemainingNet - RELIEF_INDIVIDUAL - spouseRelief - childRelief - epfRelief - socsoRelief

          const officialAnnualTax = annualTaxOfficial(Math.max(P, 0), scenario.category)
          const officialMtd = roundMtdOfficial(officialAnnualTax / monthsRemainingIncl)

          expect(appResult.pcb).toBe(officialMtd)
        })
      }
    })
  }
})
