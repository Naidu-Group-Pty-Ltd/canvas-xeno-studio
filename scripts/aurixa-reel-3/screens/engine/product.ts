// The product's own Edge Functions, run here on Jordan's record: what run_capacity.ts and server.ts share.
//
// A function's own files are copied unchanged, every one its index.ts reaches. Only what stands between a request and
// the work is replaced, and in the copy of index.ts alone: the sign-in check, the workspace's entitlement, the
// client-access check and the cross-site guard each answer yes, and the database is the record the fact find import
// writes (the rows manage-client-data creates from mapAdvancedToViewClient, and the income source its employment sync
// adds). Nothing reaches the network. The calculation, the policy, the tax tables and the response are the product's.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PRODUCT =
  process.env.AURIXA_PRODUCT ??
  path.resolve(import.meta.dir, "../../../../../npc-client-dashboard");
const FUNCTIONS = path.join(PRODUCT, "supabase/functions");

// ------------------------------------------------------------------ the copy
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
function reach(start: string) {
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
}

const STUBS = `
export const verifyAuth = async () => ({ error: null, userId: "demo-staff", authMethod: "session", username: "Alex Morgan" });
export const createCorsHeaders = () => ({});
export const createUnauthorizedResponse = () => new Response("unauthorised", { status: 401 });
export const requireWorkspaceCapability = async () => ({ ok: true });
export const entitlementDeniedResponse = () => new Response("denied", { status: 403 });
export const canAccessClient = async () => true;
export const enforceCsrf = () => ({ ok: true });
export const csrfDenied = () => new Response("csrf", { status: 403 });
export const checkPermission = async () => ({ allowed: true });
export { createClient } from "../__db.ts";
`;
// The four checks and the database client, wherever the function's index.ts imports them from.
const STUBBED = [
  /from\s*["']https:\/\/esm\.sh\/@supabase\/supabase-js@[^"']+["']/g,
  /from\s*["']\.\.\/_shared\/(?:auth|entitlements|clientAccess|csrfGuard|permissions)\.ts["']/g,
];

/** Copies the function `name` into `mirror`, its checks and database replaced in its index.ts; returns its files. */
export function mirrorFunction(name: string, mirror: string) {
  const entry = path.join(FUNCTIONS, name, "index.ts");
  const files = reach(entry);
  for (const file of files) {
    const to = path.join(mirror, path.relative(FUNCTIONS, file));
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(file, to);
  }
  // djwt is read only by the session check, which the copy of index.ts no longer calls; the module still loads.
  const jwt = path.join(mirror, "_shared/jwt.ts");
  if (existsSync(jwt))
    writeFileSync(
      jwt,
      readFileSync(jwt, "utf8").replace("https://deno.land/x/djwt@v3.0.2/mod.ts", "../__djwt.ts"),
    );
  writeFileSync(
    path.join(mirror, "__djwt.ts"),
    "export const create = async () => 'x'; export const verify = async () => ({}); export const getNumericDate = (n: number) => n; export const decode = () => [{}, {}, new Uint8Array()];\n",
  );
  writeFileSync(path.join(mirror, "__db.ts"), DB_SRC);
  writeFileSync(path.join(mirror, name, "__stubs.ts"), STUBS);
  const indexFile = path.join(mirror, name, "index.ts");
  let index = readFileSync(indexFile, "utf8");
  let swapped = 0;
  for (const re of STUBBED)
    index = index.replace(re, () => {
      swapped++;
      return 'from "./__stubs.ts"';
    });
  if (!swapped) throw new Error(`${name}/index.ts imports none of the checks it is run without`);
  writeFileSync(indexFile, index);
  return files;
}

// ------------------------------------------------------------------ the database
export const AT = "2026-10-24T09:12:00+11:00";
/** A database that answers reads from globalThis.__REEL_DB.db, filters by .eq, and keeps what it writes. */
const DB_SRC = `
const state = globalThis.__REEL_DB;
class Q {
  constructor(table) { this.table = table; this.filters = []; this.op = "select"; this.payload = null; this.one = false; this.desc = null; }
  select() { return this; } limit() { return this; } range() { return this; } in() { return this; }
  order(k, o) { if (o && o.ascending === false) this.desc = k; return this; }
  eq(k, v) { this.filters.push([k, v]); return this; } neq() { return this; } gte() { return this; } lte() { return this; } is() { return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; } update(p) { this.op = "update"; this.payload = p; return this; }
  upsert(p) { this.op = "insert"; this.payload = p; return this; } delete() { this.op = "delete"; return this; }
  single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
  run() {
    const table = state.db[this.table] ?? (state.db[this.table] = []);
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: state.nextId(), created_at: state.now(), ...r }));
      table.push(...list); state.written.push({ table: this.table, op: "insert", rows: list });
      return { data: this.one ? list[0] : list, error: null };
    }
    let hit = table.filter((r) => this.filters.every(([k, v]) => r[k] === v));
    if (this.op === "update") { for (const r of hit) Object.assign(r, this.payload); state.written.push({ table: this.table, op: "update", rows: hit.map((r) => ({ id: r.id, ...this.payload })) }); return { data: hit, error: null }; }
    if (this.op === "delete") { state.db[this.table] = table.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
    if (this.desc) hit = [...hit].sort((a, b) => String(b[this.desc]).localeCompare(String(a[this.desc])));
    return { data: this.one ? (hit[0] ?? null) : hit, error: this.one && !hit[0] ? { message: "no row" } : null };
  }
  then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
}
export const createClient = () => ({ from: (t) => new Q(t), rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null } }) } });
`;

export const CLIENT = "00000000-0000-4000-8000-00000000e115"; // Jordan Ellis (fictional)

/** The record Create Client writes from the parsed fact find (factfind-parsed.json's `mapped`). */
export function buildRecord(mapped: any) {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const client = {
    id: CLIENT,
    created_at: AT,
    updated_at: AT,
    ...mapped.personal,
    total_portfolio_value: 0,
    total_debt: 0,
    net_monthly_cash_flow: 0,
  };
  const employment = mapped.employment.map((e: any) => ({
    id: id(),
    client_id: CLIENT,
    created_at: AT,
    ...e,
  }));
  // manage-client-data's syncEmploymentToIncomeSource (EMPLOYMENT_TO_INCOME_MAP: permanent is payg_fulltime at 1.0).
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
      created_at: AT,
    };
  });
  const rows = (list: any[]) =>
    list.map((r) => ({ id: id(), client_id: CLIENT, created_at: AT, ...r }));
  return {
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
  } as Record<string, any[]>;
}

/** Installs the database and the Deno globals a function reads, and returns where writes are kept. */
export function installRuntime(db: Record<string, any[]>, clock: () => string = () => AT) {
  const g = globalThis as any;
  let k = 0;
  const written: any[] = [];
  g.__REEL_DB = {
    db,
    written,
    now: clock,
    nextId: () => `00000000-0000-4000-8000-0000000a${String(++k).padStart(4, "0")}`,
  };
  g.Deno = {
    env: {
      get: (key: string) =>
        (
          ({
            SUPABASE_URL: "http://demo.invalid",
            SUPABASE_SERVICE_ROLE_KEY: "demo",
          }) as Record<string, string>
        )[key],
    },
    serve: (handler: (req: Request) => Promise<Response>) => {
      g.__REEL_HANDLERS = g.__REEL_HANDLERS ?? [];
      g.__REEL_HANDLERS.push(handler);
    },
  };
  return written;
}

/** Loads a mirrored function and returns its request handler. */
export async function loadHandler(mirror: string, name: string) {
  const g = globalThis as any;
  const before = (g.__REEL_HANDLERS ?? []).length;
  await import(path.join(mirror, name, "index.ts"));
  const handler = (g.__REEL_HANDLERS ?? [])[before];
  if (!handler) throw new Error(`${name} registered no handler`);
  return handler as (req: Request) => Promise<Response>;
}
