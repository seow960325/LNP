// EPF (KWSP) Third Schedule (Jadual Ketiga) — Part A, employees below age 60.
//
// *** TODO_VERIFY — this fixture is NOT independently verified against the
// literal published Third Schedule table. ***
//
// What IS verified, from multiple corroborating official/near-official
// sources (KWSP's own "Employer Mandatory Contribution" page,
// kwsp.gov.my/en/employer/responsibilities/mandatory-contribution, accessed
// July 2026):
//   - Employee rate: 11% (below age 60).
//   - Employer rate: 13% for wages <= RM5,000/month, 12% for wages > RM5,000.
//   - For wages <= RM20,000/month, contributions MUST be read off the Third
//     Schedule's fixed wage-band table, NOT computed as an exact percentage
//     of the exact wage.
//   - For wages > RM20,000/month, contributions ARE computed as an exact
//     percentage (11% / 12%) of the exact wage.
//   - Total contribution is rounded UP to the next whole ringgit.
//
// What is NOT verified: the literal fixed-amount table itself (i.e. the
// specific RM value published for each wage band under RM20,000). The
// official source, kwsp.gov.my's "Jadual Ketiga" PDF
// (https://www.kwsp.gov.my/documents/d/guest/jadual-ketiga-bi-pdf-1), is
// behind a Cloudflare bot check that blocked automated retrieval in this
// session, and no third-party mirror found reproduced the literal table
// (only simplified illustrative "11% of round numbers" tables, which are
// NOT the same thing as the Schedule's banded fixed amounts).
//
// This file therefore encodes the DOCUMENTED CALCULATION RULE (rate applied
// to the exact wage, rounded up to the next ringgit) as a best-effort
// approximation — matching the app's own current implementation approach.
// It is NOT proof the app matches the true Schedule: if the Schedule bases
// each band's fixed amount on the band's upper limit (a common design for
// this type of statutory table, per general commentary — itself unverified
// here), then wages that sit mid-band would be *underpaid* relative to the
// true table, particularly in the RM100-wide bands above RM5,000 where the
// gap between "ceil(exact wage x rate)" and "ceil(band upper limit x rate)"
// can reach several ringgit.
//
// ACTION NEEDED before trusting EPF assertions in payroll.test.ts: obtain
// the actual Jadual Ketiga PDF (e.g. via a logged-in browser session or a
// direct request to KWSP) and replace this rule-based approximation with
// the literal per-band table, the same way tests/fixtures/socso-category1.ts
// and tests/fixtures/eis-schedule.ts were built from the real PERKESO PDFs.

export const EPF_RATE_EMPLOYEE = 0.11
export const EPF_RATE_EMPLOYER_LOW = 0.13 // wages <= RM5,000
export const EPF_RATE_EMPLOYER_HIGH = 0.12 // wages > RM5,000
export const EPF_LOW_HIGH_BOUNDARY = 5000
export const EPF_EXACT_PERCENTAGE_THRESHOLD = 20000 // above this, exact % applies (verified rule)

// TODO_VERIFY: approximation only — see file header.
export function epfOfficialApprox(wage: number): { employer: number; employee: number } {
  if (wage <= 0) return { employer: 0, employee: 0 }
  const employerRate = wage <= EPF_LOW_HIGH_BOUNDARY ? EPF_RATE_EMPLOYER_LOW : EPF_RATE_EMPLOYER_HIGH
  return {
    employee: Math.ceil(wage * EPF_RATE_EMPLOYEE),
    employer: Math.ceil(wage * employerRate),
  }
}
