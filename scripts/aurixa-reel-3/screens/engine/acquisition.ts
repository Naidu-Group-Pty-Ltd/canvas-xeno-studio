// What Portfolio Scenario Modelling's "Model next purchase" makes of 14 Wattle Grove for Jordan: the page's own
// engine (src/utils/scenarioDeltaEngine.ts, computeAcquisitionCapacity, which StrategyScenarioModeling calls), on the
// capacity the product's function answered (response.json) and the cash on hand the fact find records.
//   bun acquisition.ts <response.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { computeAcquisitionCapacity } from "@/utils/scenarioDeltaEngine";

const [responseFile, out] = process.argv.slice(2);
const r = JSON.parse(readFileSync(responseFile, "utf8")).data;
const zero = {
  incomeAdjustment: 0,
  shadedIncomeAdjustment: 0,
  expenseAdjustment: 0,
  commitmentAdjustment: 0,
  rateAdjustment: 0,
  loanTermAdjustment: 0,
  debtBalanceAdjustment: 0,
  releasedCapital: 0,
  acquisitionNotes: [],
  description: "",
};
const ctx: any = {
  baseInputs: {
    grossAnnualIncome: r.grossAnnualIncome,
    shadedAnnualIncome: r.shadedAnnualIncome,
    monthlyLivingExpenses: r.livingExpensesMonthly,
    monthlyCommitments: r.existingCommitmentsMonthly,
    interestRate: r.interestRate,
    bufferRate: r.bufferRate,
    loanTermYears: r.loanTermYears,
    totalDebtBalances: 19200,
    hemBenchmark: r.hemBenchmark,
  },
  baseResult: {
    borrowingCapacity: r.borrowingCapacity,
    monthlySurplus: r.monthlySurplus,
    serviceabilityBand: r.serviceabilityBand,
    dtiRatio: r.dtiRatio,
  },
  properties: [],
  liabilities: [],
  acquisition: {
    state: "NSW",
    intent: "investor",
    category: "new",
    lmiMode: "display_deduction",
    cashOnHand: 300000,
    targetPurchasePrice: 1150000,
  },
};
const acq = computeAcquisitionCapacity(r.borrowingCapacity, ctx, zero);
writeFileSync(out, JSON.stringify(acq, null, 1));
console.log(JSON.stringify(acq, null, 1));
