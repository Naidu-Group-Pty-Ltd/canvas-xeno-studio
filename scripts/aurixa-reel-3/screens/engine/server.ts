// The screens harness's backend: the product's own Edge Functions answering the pages the harness draws, on Jordan's
// record, at http://localhost:5299/fn/<function name>. The harness's stand-in for src/lib/secureInvoke.ts posts every
// invokeSecureFunction call here, so the product's components, hooks and engines run unchanged and every figure they
// draw is computed by the product.
//
//   bun server.ts <factfind-parsed.json> <work dir>
//
// calculate-borrowing-capacity is the function itself (product.ts). The reads every page makes through get-client-data
// are answered from the same record, by that function's own rules for what each `include` returns
// (supabase/functions/get-client-data/index.ts). manage-bc-scenarios and manage-client-data keep what they are sent.
// Anything else is logged and refused, so a page never draws something nobody answered for.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AT, CLIENT, buildRecord, installRuntime, loadHandler, mirrorFunction } from "./product.ts";

const [parsedFile, workDir] = process.argv.slice(2);
const MIRROR = path.join(path.resolve(workDir), "functions");
mirrorFunction("calculate-borrowing-capacity", MIRROR);
const PARSED = JSON.parse(readFileSync(parsedFile, "utf8")).mapped;
// What a capture adds to the record beyond the fact find (engine/extras/<name>.json, { table: [rows] }): the saved
// assessment, a finance partner's access, a published report, a deal. A capture names the extras it needs and the
// record is reset to the import's plus those (POST /fn/__reset { extras: [names] }); the files are read again each time.
const EXTRAS = path.join(import.meta.dir, "extras");
function withExtras(db: Record<string, any[]>, names: string[] = []) {
  for (const name of names)
    for (const [table, rows] of Object.entries(
      JSON.parse(readFileSync(path.join(EXTRAS, `${name}.json`), "utf8")),
    ))
      if (!table.startsWith("_")) (db[table] ??= []).push(...(rows as any[]));
  return db;
}
const DB = withExtras(buildRecord(PARSED));
// The demo's clock: Saturday 24 October 2026, mid-morning in Sydney. It runs at the real clock's pace from 9:12:40 am
// (a moment after the assessment Calculate Capacity saves, extras/assessment.json) whenever the record is reset, so
// what a page saves a few minutes into a capture is stamped a few minutes after it.
let since = Date.now();
const scenarios: any[] = [];
const seen: string[] = [];
const clock = () => new Date(Date.parse("2026-10-24T09:12:40+11:00") + (Date.now() - since)).toISOString();
installRuntime(DB, clock);
const quiet = console.log;
console.log = () => undefined;
const capacity = await loadHandler(MIRROR, "calculate-borrowing-capacity");
console.log = quiet;

const HANDLERS: Record<
  string,
  (body: any, db: Record<string, any[]>, ctx: { client: string; clock: () => string }) => unknown
> = {};
for (const f of readdirSync(path.join(import.meta.dir, "handlers"))
  .filter((x) => x.endsWith(".ts"))
  .sort())
  Object.assign(HANDLERS, (await import(path.join(import.meta.dir, "handlers", f))).default);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
    },
  });

const INCLUDES: Record<string, string> = {
  properties: "client_properties",
  income: "client_income",
  expenses: "client_expenses",
  assets: "client_assets",
  liabilities: "client_liabilities",
  employment: "client_employment",
  addressHistory: "client_address_history",
  notes: "client_notes",
  files: "client_files",
  activities: "client_activities",
  additionalContacts: "client_additional_contacts",
  incomeSources: "client_income_sources",
  reminders: "client_reminders",
  attributions: "lead_source_attributions",
  teamMembers: "client_team_members",
  solicitorLinks: "client_solicitor_links",
};
const of = (table: string) =>
  (DB[table] ?? []).filter((r) => !r.client_id || r.client_id === CLIENT);
function clientData(body: any) {
  // List mode (Client Management's list): every client row, each with its properties' ids when the list asks for the
  // count (`client_properties(id)`), as the function's list branch answers.
  if (body.listMode && !body.listOptions?.table) {
    const clients = (DB.clients ?? []).map((c) =>
      body.listOptions?.includePropertyCount
        ? {
            ...c,
            client_properties: (DB.client_properties ?? [])
              .filter((p) => p.client_id === c.id)
              .map((p) => ({ id: p.id })),
          }
        : c,
    );
    return { success: true, clients, count: clients.length };
  }
  const include = body.include ?? {};
  const out: Record<string, unknown> = { success: true, client: DB.clients[0] };
  for (const [flag, table] of Object.entries(INCLUDES)) {
    const wanted = flag === "properties" ? include.properties !== false : Boolean(include[flag]);
    if (wanted) out[flag] = of(table);
  }
  if (include.borrowingCapacity)
    out.borrowingCapacity = [...of("borrowing_capacity_assessments")]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 10);
  if (include.scores) out.scores = null;
  if (include.deals) out.deals = of("client_deals");
  if (include.emails) out.emails = [];
  return out;
}

Bun.serve({
  port: Number(process.env.REEL_ENGINE_PORT ?? 5299),
  async fetch(req) {
    if (req.method === "OPTIONS") return json(null, 204);
    const url = new URL(req.url);
    const name = url.pathname.replace(/^\/fn\//, "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    seen.push(name);
    if (name === "__log") return json({ calls: seen });
    if (name === "__db") return json(DB);
    if (name === "__reset") {
      const fresh = withExtras(buildRecord(PARSED), body.extras ?? []);
      for (const k of Object.keys(DB)) delete DB[k];
      Object.assign(DB, fresh);
      scenarios.length = 0;
      seen.length = 0;
      since = Date.now();
      (globalThis as any).__REEL_DB.restartIds?.();
      return json({ reset: true });
    }
    if (HANDLERS[name]) {
      const answer = await HANDLERS[name](body, DB, { client: CLIENT, clock });
      return json(answer, (answer as any)?.__status ?? 200);
    }
    if (name === "calculate-borrowing-capacity") {
      console.log = () => undefined;
      const res = await capacity(
        new Request("http://demo.invalid/calculate-borrowing-capacity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, clientId: body.clientId ?? CLIENT }),
        }),
      );
      console.log = quiet;
      const answer = await res.json();
      quiet(
        `calculate-borrowing-capacity saveResult=${body.saveResult} → ${answer.data?.borrowingCapacity}`,
      );
      return json(answer, res.status);
    }
    if (name === "get-client-data") return json(clientData(body));
    if (name === "manage-bc-scenarios") {
      const op = body.operation ?? body.action;
      if (op === "list" || !op) return json({ success: true, scenarios, data: scenarios });
      const row = {
        id: `00000000-0000-4000-8000-0000000b${String(scenarios.length + 1).padStart(4, "0")}`,
        client_id: CLIENT,
        created_at: clock(),
        ...(body.data ?? body.scenario ?? {}),
      };
      scenarios.unshift(row);
      return json({ success: true, scenario: row, data: row });
    }
    if (name === "manage-client-data") {
      const table = body.table;
      if (table && body.data) {
        const row = {
          id: `00000000-0000-4000-8000-0000000c${String((DB[table]?.length ?? 0) + 1).padStart(4, "0")}`,
          created_at: AT,
          client_id: CLIENT,
          ...body.data,
        };
        (DB[table] ??= []).push(row);
        return json({ success: true, data: row });
      }
      return json({ success: true });
    }
    quiet(`refused: ${name} ${JSON.stringify(body).slice(0, 200)}`);
    return json({ success: false, error: `The harness answers no ${name}` }, 404);
  },
});
quiet(`engine on :${process.env.REEL_ENGINE_PORT ?? 5299}`);
