// Borrowing Capacity's calls besides the calculation.
//
// - The page's Live Bank Rates card lists lenders from the CDR (cdr-lending-rates-service). Every lender is a third
//   party the film names none of, and the card stays out of frame, so the harness answers with no lenders loaded, the
//   state the card draws before a lender is chosen.
// - The Snapshot (render-borrowing-capacity-pdf) is drawn by the product's own route and render container in
//   engine/run_snapshot.ts, not here. The harness keeps what the page asks it for, so the document is drawn from
//   exactly the request the page sends (the scenarios saved in Portfolio Scenario Modelling among it):
//   <work dir>/requests/render-borrowing-capacity-pdf-<n>.json. It answers that the render is unavailable here.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REQUESTS = path.join(path.resolve(process.argv[3] ?? "."), "requests");

function keep(name: string, body: unknown) {
  mkdirSync(REQUESTS, { recursive: true });
  const n = readdirSync(REQUESTS).filter((f) => f.startsWith(`${name}-`)).length + 1;
  const file = path.join(REQUESTS, `${name}-${n}.json`);
  writeFileSync(file, JSON.stringify(body, null, 1));
  console.log(`kept ${name} request: ${file}`);
}

export default {
  "cdr-lending-rates-service": () => ({ success: true, data: [] }),
  "render-borrowing-capacity-pdf": (body: unknown) => {
    keep("render-borrowing-capacity-pdf", body);
    return {
      __status: 503,
      success: false,
      error: "The harness keeps this request; the Snapshot is drawn by engine/run_snapshot.ts",
    };
  },
};
