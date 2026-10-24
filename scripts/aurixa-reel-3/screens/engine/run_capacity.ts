// The product's own borrowing capacity function (supabase/functions/calculate-borrowing-capacity), run here on Jordan's
// record exactly as the client's Borrowing Capacity card asks for it ("Calculate Capacity": cardAssessmentBody, a
// saved assessment with every figure composed from the client's records), so every figure the film shows is the
// product's answer.
//
//   bun run_capacity.ts <factfind-parsed.json> <out dir>
//
// The function's own files are copied, unchanged, into <out dir>/functions, every one its index.ts reaches. Only what
// stands between a request and the calculation is replaced, in the copy of index.ts alone: the sign-in check, the
// workspace's entitlement, the client-access check and the cross-site guard each answer yes, the database is the
// record the fact find import writes (the rows manage-client-data creates from mapAdvancedToViewClient, and the
// income source its employment sync adds), and nothing reaches the network. The calculation, the policy, the tax
// tables and the response are the product's own.
//
// Writes response.json (the function's answer, as the page receives it), saved.json (the assessment row it stores,
// which the Finance Portal and the Snapshot read) and records.json (the record it was computed from).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PRODUCT =
  process.env.AURIXA_PRODUCT ??
  path.resolve(import.meta.dir, "../../../../../npc-client-dashboard");
const FUNCTIONS = path.join(PRODUCT, "supabase/functions");
const [parsedFile, outDir] = process.argv.slice(2);
const OUT = path.resolve(outDir);
const MIRROR = path.join(OUT, "functions");

// ------------------------------------------------------------------ the copy
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const reach = (start: string) => {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) queue.push(path.normalize(path.join(path.dirname(file), spec)));
    }
  }
  return [...seen];
};
const ENTRY = path.join(FUNCTIONS, "calculate-borrowing-capacity/index.ts");
const files = reach(ENTRY);
for (const file of files) {
  const to = path.join(MIRROR, path.relative(FUNCTIONS, file));
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(file, to);
}
// djwt is read only by the session check, which the copy of index.ts no longer calls; the module still loads.
const jwt = path.join(MIRROR, "_shared/jwt.ts");
if (existsSync(jwt))
  writeFileSync(
    jwt,
    readFileSync(jwt, "utf8").replace("https://deno.land/x/djwt@v3.0.2/mod.ts", "../__djwt.ts"),
  );
writeFileSync(
  path.join(MIRROR, "__djwt.ts"),
  "export const create = async () => 'x'; export const verify = async () => ({}); export const getNumericDate = (n: number) => n; export const decode = () => [{}, {}, new Uint8Array()];\n",
);

const STUBS = `
export const verifyAuth = async () => ({ error: null, userId: "demo-staff", authMethod: "session", username: "Alex Morgan" });
export const createCorsHeaders = () => ({});
export const createUnauthorizedResponse = () => new Response("unauthorised", { status: 401 });
export const requireWorkspaceCapability = async () => ({ ok: true });
export const entitlementDeniedResponse = () => new Response("denied", { status: 403 });
export const canAccessClient = async () => true;
export const enforceCsrf = () => ({ ok: true });
export const csrfDenied = () => new Response("csrf", { status: 403 });
export { createClient } from "./__db.ts";
`;
writeFileSync(path.join(MIRROR, "calculate-borrowing-capacity/__stubs.ts"), STUBS);
let index = readFileSync(path.join(MIRROR, "calculate-borrowing-capacity/index.ts"), "utf8");
const swaps: [RegExp, string][] = [
  [
    /import \{ createClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js@2";/,
    'import { createClient } from "./__stubs.ts";',
  ],
  [
    /import \{ verifyAuth, createCorsHeaders, createUnauthorizedResponse \} from '..\/_shared\/auth\.ts';/,
    'import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from "./__stubs.ts";',
  ],
  [
    /import \{ requireWorkspaceCapability, entitlementDeniedResponse \} from '..\/_shared\/entitlements\.ts';/,
    'import { requireWorkspaceCapability, entitlementDeniedResponse } from "./__stubs.ts";',
  ],
  [
    /import \{ canAccessClient \} from '..\/_shared\/clientAccess\.ts';/,
    'import { canAccessClient } from "./__stubs.ts";',
  ],
  [
    /import \{ enforceCsrf, csrfDenied \} from "..\/_shared\/csrfGuard\.ts";/,
    'import { enforceCsrf, csrfDenied } from "./__stubs.ts";',
  ],
];
for (const [from, to] of swaps) {
  if (!from.test(index)) throw new Error(`index.ts no longer has ${from}`);
  index = index.replace(from, to);
}
writeFileSync(path.join(MIRROR, "calculate-borrowing-capacity/index.ts"), index);

// ------------------------------------------------------------------ the record the import writes
const parsed = JSON.parse(readFileSync(parsedFile, "utf8"));
const { mapped } = parsed;
const CLIENT = "00000000-0000-4000-8000-00000000e115"; // Jordan Ellis (fictional)
const at = "2026-10-24T09:12:00+11:00";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const client = {
  id: CLIENT,
  created_at: at,
  updated_at: at,
  ...mapped.personal,
  total_portfolio_value: 0,
  total_debt: 0,
  net_monthly_cash_flow: 0,
};
const employment = mapped.employment.map((e: any) => ({
  id: id(),
  client_id: CLIENT,
  created_at: at,
  ...e,
}));
// manage-client-data's syncEmploymentToIncomeSource: EMPLOYMENT_TO_INCOME_MAP.permanent is payg_fulltime at 1.0.
const MAP: Record<string, [string, number]> = {
  permanent: ["payg_fulltime", 1.0],
  part_time: ["payg_parttime", 1.0],
  casual: ["casual", 0.8],
  contract: ["contract", 0.8],
  self_employed: ["self_employed", 0.8],
};
const incomeSources = employment.map((e: any, i: number) => {
  const [sourceType, shading] = MAP[e.employment_type] ?? ["payg_fulltime", 1.0];
  return {
    id: id(),
    client_id: CLIENT,
    employment_id: e.id,
    contact_type: e.contact_type || "primary",
    additional_contact_id: null,
    source_category: "employment",
    source_type: sourceType,
    source_name: e.employer_name || "",
    gross_annual_amount: e.gross_annual_salary,
    input_amount: e.salary_amount || 0,
    input_frequency: e.salary_frequency || "annual",
    bonus: e.bonus || 0,
    commission: e.commission || 0,
    overtime_essential: e.overtime_essential || 0,
    overtime_non_essential: e.overtime_non_essential || 0,
    allowance: e.allowance || 0,
    other_taxable_income: e.other_taxable_income || 0,
    default_shading_rate: shading,
    is_active: e.is_current !== false,
    display_order: i,
    created_at: at,
  };
});
const rows = (list: any[]) =>
  list.map((r) => ({ id: id(), client_id: CLIENT, created_at: at, ...r }));
const DB: Record<string, any[]> = {
  clients: [client],
  client_income: [],
  client_income_sources: incomeSources,
  client_employment: employment,
  client_liabilities: rows(mapped.liabilities),
  client_properties: rows(mapped.properties),
  client_expenses: rows(mapped.expenses),
  client_assets: rows(mapped.assets),
  client_address_history: rows(mapped.addresses),
  borrowing_capacity_assessments: [],
};
const written: any[] = [];

// A database that answers the function's reads from DB, filters by .eq, and keeps what it writes.
const DB_SRC = `
const state = globalThis.__REEL_DB;
class Q {
  constructor(table) { this.table = table; this.filters = []; this.op = "select"; this.payload = null; this.one = false; }
  select() { return this; } order() { return this; } limit() { return this; } range() { return this; } in() { return this; }
  eq(k, v) { this.filters.push([k, v]); return this; } neq() { return this; } gte() { return this; } lte() { return this; } is() { return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; } update(p) { this.op = "update"; this.payload = p; return this; }
  upsert(p) { this.op = "insert"; this.payload = p; return this; } delete() { this.op = "delete"; return this; }
  single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
  run() {
    const table = state.db[this.table] ?? (state.db[this.table] = []);
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: "00000000-0000-4000-8000-0000000a55e5", created_at: "${at}", ...r }));
      table.push(...list); state.written.push({ table: this.table, op: "insert", rows: list });
      return { data: this.one ? list[0] : list, error: null };
    }
    const hit = table.filter((r) => this.filters.every(([k, v]) => r[k] === v));
    if (this.op === "update") { for (const r of hit) Object.assign(r, this.payload); state.written.push({ table: this.table, op: "update", rows: hit.map((r) => ({ id: r.id, ...this.payload })) }); return { data: hit, error: null }; }
    if (this.op === "delete") return { data: null, error: null };
    return { data: this.one ? (hit[0] ?? null) : hit, error: this.one && !hit[0] ? { message: "no row" } : null };
  }
  then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
}
export const createClient = () => ({ from: (t) => new Q(t), rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null } }) } });
`;
writeFileSync(path.join(MIRROR, "calculate-borrowing-capacity/__db.ts"), DB_SRC);

// ------------------------------------------------------------------ the request
const g = globalThis as any;
g.__REEL_DB = { db: DB, written };
g.Deno = {
  env: {
    get: (k: string) =>
      (
        ({ SUPABASE_URL: "http://demo.invalid", SUPABASE_SERVICE_ROLE_KEY: "demo" }) as Record<
          string,
          string
        >
      )[k],
  },
  serve: (handler: (req: Request) => Promise<Response>) => {
    g.__REEL_HANDLER = handler;
  },
};
const quiet = console.log;
const logs: string[] = [];
console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
await import(path.join(MIRROR, "calculate-borrowing-capacity/index.ts"));
// The card's Calculate Capacity (useBorrowingCapacity's calculate({}) → savedCalculationBody(clientId, {})).
const body = {
  clientId: CLIENT,
  overrides: { scenarioDeltas: undefined },
  saveResult: true,
  scenarioDeltas: undefined,
};
const res: Response = await g.__REEL_HANDLER(
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
      livingExpenses: d.livingExpenses ?? d.totalLivingExpenses,
      existingCommitments: d.existingCommitments,
      hem: d.hemBenchmark,
      expenseMethod: d.expenseMethod,
      assessmentId: d.assessmentId,
      writes: written.map((w) => `${w.op} ${w.table}`),
    },
    null,
    1,
  ),
);
