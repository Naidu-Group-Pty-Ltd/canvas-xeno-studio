// The product's own Borrowing Capacity Snapshot (supabase/functions/render-borrowing-capacity-pdf), drawn on Jordan's
// record exactly as the client's Borrowing Capacity card asks for it: "Export Snapshot PDF", then "Download without
// preview" (SnapshotDownloadButton → deliverSnapshot → requestBorrowingCapacitySnapshot, in
// src/lib/reports/borrowingCapacity/), with no template chosen, so the route draws its standard design. The function
// is run by product.ts (its checks and database stood in for); the PDF is drawn by the product's own render container
// (weasyprint-service/app.py, WeasyPrint 69.0) wherever WEASYPRINT_SERVICE_URL points, which must be this machine.
//
//   WEASYPRINT_SERVICE_URL=http://127.0.0.1:5404 WEASYPRINT_SERVICE_TOKEN=… bun run_snapshot.ts <factfind-parsed.json> <out dir>
//
// The record is the fact find's (buildRecord), the assessment Calculate Capacity saved (extras/assessment.json, the
// row the Snapshot reads) and the workspace's settings rows below. Writes, in <out dir>:
//   snapshot.pdf    the bytes the route uploaded to client-files (its storage, captured instead of uploaded)
//   response.json   the route's answer, as the page receives it
//   stored.json     everything it would have kept: its rows, its rpc calls, and the upload (path and options)
//   preview.pdf, preview.json   the same request with preview: true (the live editor's), which keeps nothing
//   snapshot.html, render-request.json   the HTML the function built and posted, and the options it asked for
//   request.json, records.json, function-log.txt
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AT, CLIENT, buildRecord, installRuntime, loadHandler, mirrorFunction } from "./product.ts";

const [parsedFile, outDir] = process.argv.slice(2);
if (!parsedFile || !outDir) throw new Error("usage: bun run_snapshot.ts <factfind-parsed.json> <out dir>");
const OUT = path.resolve(outDir);
const MIRROR = path.join(OUT, "functions");
const NAME = "render-borrowing-capacity-pdf";

// The render container the function posts to (weasyPrintConfig reads these two). Only this machine's.
const RENDER: Record<string, string> = {
  WEASYPRINT_SERVICE_URL: process.env.WEASYPRINT_SERVICE_URL ?? "",
  WEASYPRINT_SERVICE_TOKEN: process.env.WEASYPRINT_SERVICE_TOKEN ?? "",
};
if (!RENDER.WEASYPRINT_SERVICE_URL || !RENDER.WEASYPRINT_SERVICE_TOKEN)
  throw new Error("WEASYPRINT_SERVICE_URL and WEASYPRINT_SERVICE_TOKEN must name the local render service");
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(RENDER.WEASYPRINT_SERVICE_URL).hostname))
  throw new Error("the render service must be this machine's");

// The workspace, as a fresh one with no branding holds it. Its Branding page row (whitelabel_settings, the singleton
// the product's migration 20251224083828 creates) carries the demo workspace's name and nothing else: no colour, no
// marks, no cover art, no trading name, the defaults of migration 20260423175929. Its Report Settings are the two rows
// migration 20251230141815 seeds: contact details all empty, and the product's default disclaimer, switched on.
const WORKSPACE = {
  whitelabel_settings: [
    {
      id: "00000000-0000-4000-8000-0000000d0001",
      company_name: "Aurixa Systems · Property",
      primary_color: null,
      accent_color: null,
      dark_mode_default: "light",
      auth_logo: null,
      sidebar_logo: null,
      sidebar_icon: null,
      favicon: null,
      theme_config: {},
      logo_config: {},
      theme_version: 1,
      created_at: AT,
      updated_at: AT,
    },
  ],
  global_report_settings: [
    {
      id: "00000000-0000-4000-8000-0000000d0002",
      setting_key: "contact_details",
      setting_value: { company_name: "", phone: "", email: "", website: "", address: "", abn: "" },
      created_at: AT,
      updated_at: AT,
    },
    {
      id: "00000000-0000-4000-8000-0000000d0003",
      setting_key: "professional_disclaimer",
      setting_value: {
        text: "This report is provided for general information purposes only and does not constitute financial, legal, or professional advice. The information contained herein has been obtained from sources believed to be reliable, but accuracy cannot be guaranteed. Readers should seek independent professional advice before making any investment decisions.",
        is_enabled: true,
      },
      created_at: AT,
      updated_at: AT,
    },
  ],
};

const files = mirrorFunction(NAME, MIRROR);
const DB = buildRecord(JSON.parse(readFileSync(parsedFile, "utf8")).mapped);
// The saved assessments: the one Calculate Capacity saved, and (REEL_SNAPSHOT_EXTRAS, a comma list of
// engine/extras names) any saved later, such as the scenario saved as the current assessment in 07.2.
for (const name of (process.env.REEL_SNAPSHOT_EXTRAS ?? "assessment").split(",").filter(Boolean)) {
  const extra = JSON.parse(readFileSync(path.join(import.meta.dir, "extras", `${name}.json`), "utf8"));
  DB.borrowing_capacity_assessments.push(...extra.borrowing_capacity_assessments);
}
Object.assign(DB, structuredClone(WORKSPACE));

// The demo's clock for what the database stamps: a few minutes after the assessment was saved.
let tick = 0;
const clock = () => new Date(Date.parse("2026-10-24T09:18:00+11:00") + 60_000 * tick++).toISOString();
const written = installRuntime(DB, clock);
const g = globalThis as any;
const env = g.Deno.env.get;
g.Deno.env.get = (key: string) => (key in RENDER ? RENDER[key] : env(key));
// What the function posts to the render service is kept as it goes (the HTML it built, and the options it asked for).
const posted: { html: string; options: Record<string, unknown> }[] = [];
const fetchImpl = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(RENDER.WEASYPRINT_SERVICE_URL) && typeof init?.body === "string") {
    const { html, ...options } = JSON.parse(init.body);
    posted.push({ html, options });
  }
  return fetchImpl(input, init);
}) as typeof fetch;

const logs: string[] = [];
const keep = (level: string) => (...a: unknown[]) =>
  logs.push(`[${level}] ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`);
const quiet = { log: console.log, warn: console.warn, error: console.error };
Object.assign(console, { log: keep("log"), warn: keep("warn"), error: keep("error") });
const handler = await loadHandler(MIRROR, NAME);

// requestBorrowingCapacitySnapshot's body for the card's request ({ clientId, clientName }): no assessment named (the
// most recent), no scenarios, no edition, no commentary, and no design (standardDesignFor answers null with no template
// chosen, and designBody(null) adds nothing). invokeSecureFunction adds its correlation id; the session is the cookie.
//
// REEL_SNAPSHOT_REQUEST names a request the harness kept from a page instead (engine/handlers/bc.ts keeps every
// render-borrowing-capacity-pdf request a page sends): Portfolio Scenario Modelling's "Download without preview" sends
// the scenarios saved there.
const recorded = process.env.REEL_SNAPSHOT_REQUEST
  ? JSON.parse(readFileSync(process.env.REEL_SNAPSHOT_REQUEST, "utf8"))
  : null;
const body = recorded
  ? { correlation_id: "reel3-snapshot", ...recorded }
  : {
      correlation_id: "reel3-snapshot",
      clientId: CLIENT,
      assessmentId: null,
      scenarioPresets: [],
      edition: null,
    };
const ask = (extra: Record<string, unknown> = {}) =>
  handler(
    new Request(`http://demo.invalid/${NAME}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ...extra }),
    }),
  );

const res = await ask();
const answer = await res.json();
await new Promise((r) => setTimeout(r, 100)); // meteredFetch logs its usage after the answer
const state = g.__REEL_DB;
const uploads = (state.uploads ?? []) as { bucket: string; path: string; body: Uint8Array; options: unknown }[];
const stored = {
  _note:
    "Each write in order; a row is shown as it stands after the request (the ledger row the route inserts as running is the one its update marks succeeded).",
  rows: JSON.parse(JSON.stringify(written)),
  rpcs: state.rpcs ?? [],
  uploads: uploads.map((u) => ({ bucket: u.bucket, path: u.path, bytes: u.body.length, options: u.options })),
};
if (uploads.length !== 1) throw new Error(`expected one upload, saw ${uploads.length}: ${JSON.stringify(answer)}`);
writeFileSync(path.join(OUT, "snapshot.pdf"), uploads[0].body);

// The live editor's preview of the same document: drawn the same way, kept nowhere.
const before = { rows: written.length, uploads: uploads.length };
const previewRes = await ask({ preview: true });
const preview = await previewRes.json();
await new Promise((r) => setTimeout(r, 100));
if (preview.pdf) writeFileSync(path.join(OUT, "preview.pdf"), Buffer.from(preview.pdf, "base64"));
Object.assign(console, quiet);

writeFileSync(path.join(OUT, "request.json"), JSON.stringify(body, null, 1));
if (posted[0]) {
  writeFileSync(path.join(OUT, "snapshot.html"), posted[0].html);
  writeFileSync(
    path.join(OUT, "render-request.json"),
    JSON.stringify({ stored: posted[0].options, preview: posted[1]?.options ?? null }, null, 1),
  );
}
writeFileSync(path.join(OUT, "response.json"), JSON.stringify({ status: res.status, ...answer }, null, 1));
writeFileSync(path.join(OUT, "stored.json"), JSON.stringify(stored, null, 1));
writeFileSync(
  path.join(OUT, "preview.json"),
  JSON.stringify(
    {
      status: previewRes.status,
      ...preview,
      pdf: preview.pdf ? `(${preview.bytes} bytes, preview.pdf)` : undefined,
      keptNothing: {
        rows: written.slice(before.rows).map((w: any) => `${w.op} ${w.table}`),
        uploads: (state.uploads ?? []).length - before.uploads,
      },
    },
    null,
    1,
  ),
);
writeFileSync(path.join(OUT, "records.json"), JSON.stringify(DB, null, 1));
writeFileSync(path.join(OUT, "function-log.txt"), logs.join("\n"));
console.log(
  JSON.stringify(
    {
      status: res.status,
      error: answer.error,
      files: files.length,
      fileName: answer.fileName,
      path: answer.path,
      bytes: answer.bytes,
      pageCount: answer.pageCount,
      brandGaps: answer.brandGaps,
      design: answer.design,
      document: answer.document,
      writes: stored.rows.map((w: any) => `${w.op} ${w.table}`),
      rpcs: stored.rpcs.map((r: any) => r.fn),
      preview: {
        status: previewRes.status,
        error: preview.error,
        bytes: preview.bytes,
        pageCount: preview.pageCount,
        sections: preview.sections,
      },
    },
    null,
    1,
  ),
);
