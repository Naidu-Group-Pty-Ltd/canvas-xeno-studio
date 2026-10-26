// The Borrowing Capacity page (BorrowingCapacityWorkspace, opened from the card's "View Full Calculator"), on the
// Calculator tab, as the film shows it in 05.3 to 05.5: the result of the assessment saved a moment before, 14 Wattle
// Grove's value and a 20% deposit typed into the LMI section (loan-to-value 80.0%, no LMI), the loan for it typed as the
// proposed loan, the engine's Recommendations folded away (the film shows the assessment's basis instead, PLAN.md
// 6.4) and its Assumptions Used opened. Every figure is recomputed by the product's function as the inputs change.
const card = (title) => `xpath=//div[contains(@class,'luxury-card')][.//*[normalize-space(text())='${title}']]`;
const box = (title) => `xpath=//div[contains(@class,'rounded-lg') and contains(@class,'p-4')][.//*[normalize-space(text())='${title}']]`;
const RESULTS = card("Results");
const steps = [
  { tap: { text: "Recommendations", exact: true } },
  { tap: { text: "Assumptions Used", exact: true } },
  { fill: { selector: 'input[placeholder="e.g. 800,000"]' }, value: 1150000 },
  { fill: { selector: 'input[placeholder="e.g. 100,000"]' }, value: 230000 },
  { click: "Display Deduction" },
  { fill: { selector: `${card("Proposed Loan")}//input` }, value: 920000 },
  { settle: true },
];
const pageRegions = {
  back: { text: "Back to Jordan Ellis" },
  title: { selector: "h1" },
  saved: { text: "Last assessment saved" },
  tabCalculator: { role: "tab", name: "Calculator" },
  tabScenarios: { role: "tab", name: "Portfolio Scenario Modelling" },
  tabHistory: { role: "tab", name: "History" },
  save: { role: "button", name: "Save", exact: true },
  recalculate: { role: "button", name: "Recalculate" },
  income: { selector: card("Income") },
  expenses: { selector: card("Living Expenses") },
  hem: { text: "HEM Benchmark", exact: true },
  declared: { text: "Declared Monthly Expenses" },
  liabilities: { selector: card("Existing Liabilities") },
  carLoan: { selector: `${card("Existing Liabilities")}//div[contains(@class,'p-3')][.//*[normalize-space(text())='Car loan']]` },
  creditCard: { selector: `${card("Existing Liabilities")}//div[contains(@class,'p-3')][.//*[normalize-space(text())='Credit card']]` },
  commitments: { text: "Total Monthly Commitments" },
  commitmentsFigure: { selector: `${card("Existing Liabilities")}//*[normalize-space(text())='$820']` },
  proposedLoan: { selector: card("Proposed Loan") },
  apraBuffer: { text: "APRA +3% Buffer" },
  lmi: { selector: box("Lenders Mortgage Insurance (LMI)") },
  lvr: { text: "Loan-to-Value Ratio (LVR)" },
  noLmi: { text: "No LMI Required" },
  results: { selector: RESULTS },
  loanCheck: { selector: box("PROPOSED LOAN CHECK") },
  serviceableBadge: { text: "Serviceable", exact: false },
  capacityCard: { selector: box("BORROWING CAPACITY") },
  capacityLabel: { text: "BORROWING CAPACITY", exact: true },
  capacityFigure: { selector: `${box("BORROWING CAPACITY")}//*[normalize-space(text())='$1,049,786']` },
  stressTested: { text: "Stress-tested: $964,993" },
  audit: { selector: `xpath=//div[contains(@class,'rounded-lg')][.//*[normalize-space(text())='Net Monthly Surplus — Audit']]` },
  band: { selector: box("SERVICEABILITY BAND") },
  bandWords: { text: "Strong borrowing position", exact: true },
  assumptions: { text: "Assumptions Used", exact: true },
  disclaimer: { text: "This calculator is for indicative purposes only" },
};
module.exports = [
  {
    key: "bc-page",
    screen: "bc-page",
    extras: ["assessment"],
    viewport: [1440, 4200],
    scale: 2,
    steps: [...steps, { shot: "bc-page-calc", regions: pageRegions }],
  },
];
