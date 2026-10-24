// The product's own borrowing capacity function (supabase/functions/calculate-borrowing-capacity), run on Jordan's
// record exactly as the client's Borrowing Capacity card asks for it ("Calculate Capacity": cardAssessmentBody, a
// saved assessment with every figure composed from the client's records), so every figure the film shows is the
// product's answer. How the function is run is product.ts's.
//
//   bun run_capacity.ts <factfind-parsed.json> <out dir>
//
// Writes response.json (the function's answer, as the page receives it), saved.json (what it writes: the assessment
// row the Finance Portal and the Snapshot read) and records.json (the record it was computed from).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CLIENT, buildRecord, installRuntime, loadHandler, mirrorFunction } from "./product.ts";

const [parsedFile, outDir] = process.argv.slice(2);
const OUT = path.resolve(outDir);
const MIRROR = path.join(OUT, "functions");
const files = mirrorFunction("calculate-borrowing-capacity", MIRROR);
const DB = buildRecord(JSON.parse(readFileSync(parsedFile, "utf8")).mapped);
const written = installRuntime(DB);

const quiet = console.log;
const logs: string[] = [];
console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
const handler = await loadHandler(MIRROR, "calculate-borrowing-capacity");
// The card's Calculate Capacity (useBorrowingCapacity's calculate({}) → savedCalculationBody(clientId, {})).
const body = {
  clientId: CLIENT,
  overrides: { scenarioDeltas: undefined },
  saveResult: true,
  scenarioDeltas: undefined,
};
const res = await handler(
  new Request("http://demo.invalid/calculate-borrowing-capacity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
);
console.log = quiet;
const answer = await res.json();
writeFileSync(path.join(OUT, "response.json"), JSON.stringify(answer, null, 1));
writeFileSync(path.join(OUT, "saved.json"), JSON.stringify(written, null, 1));
writeFileSync(path.join(OUT, "records.json"), JSON.stringify(DB, null, 1));
writeFileSync(path.join(OUT, "function-log.txt"), logs.join("\n"));
const d = answer.data ?? {};
console.log(
  JSON.stringify(
    {
      status: res.status,
      success: answer.success,
      error: answer.error,
      files: files.length,
      borrowingCapacity: d.borrowingCapacity,
      stressTestedCapacity: d.stressTestedCapacity,
      monthlySurplus: d.monthlySurplus,
      dtiRatio: d.dtiRatio,
      serviceabilityBand: d.serviceabilityBand,
      livingExpenses: d.livingExpensesMonthly,
      existingCommitments: d.existingCommitmentsMonthly,
      hem: d.hemBenchmark,
      expenseMethod: d.expenseMethod,
      assessmentId: d.assessmentId,
      writes: written.map((w) => `${w.op} ${w.table}`),
    },
    null,
    1,
  ),
);
