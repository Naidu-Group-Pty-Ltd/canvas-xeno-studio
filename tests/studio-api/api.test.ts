import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FakeDb } from "../long-video/fake-db";
import { isTokenShaped, newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

const random = (bytes: Uint8Array) => crypto.getRandomValues(bytes);
const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const inactive = db.add("profiles", { is_active: false, role: "member" });
const clip = db.add("assets", { asset_type: "video", title: "Janice", deleted_at: null });
const logo = db.add("assets", { asset_type: "image", title: "Logo", deleted_at: null });
const kit = db.add("brand_kits", {
  name: "Aurixa Systems",
  is_archived: false,
  is_default: true,
  logo_asset_id: logo["id"],
  end_card_asset_id: logo["id"],
  heading_font: "Inter",
  body_font: "Inter",
  fonts: [],
  text_color: "#ffffff",
  accent_color: "#1e40af",
  background_color: "#0b1020",
  title_backing: "halo",
  uppercase_titles: false,
  tagline: "Your decision.",
  call_to_action: "Start free",
  website: null,
  terms: [],
});
db.add("model_registry", {
  is_active: true,
  sort_order: 1,
  display_name: "Wan 2.7 (Image to video)",
  model_path: "wan/v2.7/image-to-video",
  operation: "image-to-video",
  output_type: "video",
  capabilities: {
    inputs: [
      { role: "source", type: "image", required: true, param: "image" },
      { role: "audio", type: "audio", param: "audio" },
    ],
  },
  parameter_schema: {
    fields: [
      { key: "resolution", type: "segmented", label: "Resolution", options: ["480p", "720p"] },
    ],
  },
});

async function tokenFor(userId: unknown, scopes: string[], extra: Record<string, unknown> = {}) {
  const token = newApiToken(random);
  db.add("api_tokens", {
    user_id: userId,
    name: "test",
    token_prefix: tokenPrefixOf(token),
    token_hash: await tokens.hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    ...extra,
  });
  return token;
}

function post(path: string, token: string | null, body: unknown) {
  return new Request(`https://studio.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});

describe("API tokens", () => {
  test("are long, random and recognisable, and only their hash is kept", async () => {
    const one = newApiToken(random);
    const two = newApiToken(random);
    expect(one).not.toBe(two);
    expect(isTokenShaped(one)).toBe(true);
    expect(one.length).toBe(46);
    expect(tokenPrefixOf(one)).toBe(one.slice(0, 8));
    expect(isTokenShaped("xs_short")).toBe(false);
    const token = await tokenFor(member["id"], ["read"]);
    const row = db.rows("api_tokens").at(-1)!;
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row["token_hash"]).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a request without a good token, or from someone no longer active, is turned away", async () => {
    const none = await mcp.handleMcpRequest(post("/api/public/studio-mcp", null, {}));
    expect(none.status).toBe(401);
    expect(none.headers.get("WWW-Authenticate")).toContain("Bearer");
    const unknown = await mcp.handleMcpRequest(
      post("/api/public/studio-mcp", newApiToken(random), {}),
    );
    expect(unknown.status).toBe(401);
    const revoked = await tokenFor(member["id"], ["read"], {
      revoked_at: new Date().toISOString(),
    });
    expect((await mcp.handleMcpRequest(post("/api/public/studio-mcp", revoked, {}))).status).toBe(
      401,
    );
    const expired = await tokenFor(member["id"], ["read"], { expires_at: "2020-01-01T00:00:00Z" });
    expect((await mcp.handleMcpRequest(post("/api/public/studio-mcp", expired, {}))).status).toBe(
      401,
    );
    const gone = await tokenFor(inactive["id"], ["read"]);
    expect((await mcp.handleMcpRequest(post("/api/public/studio-mcp", gone, {}))).status).toBe(403);
  });
});

describe("the MCP server", () => {
  test("introduces itself, lists only the tools a token allows, and answers pings", async () => {
    const reader = await tokenFor(member["id"], ["read"]);
    const init = await mcp.handleMcpRequest(
      post("/api/public/studio-mcp", reader, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t" } },
      }),
    );
    const hello = (await init.json()) as { result: Record<string, unknown> };
    expect(hello.result["protocolVersion"]).toBe("2025-03-26");
    expect(hello.result["capabilities"]).toEqual({ tools: { listChanged: false } });

    const note = await mcp.handleMcpRequest(
      post("/api/public/studio-mcp", reader, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    );
    expect(note.status).toBe(202);

    const listed = (await (
      await mcp.handleMcpRequest(
        post("/api/public/studio-mcp", reader, { jsonrpc: "2.0", id: 2, method: "tools/list" }),
      )
    ).json()) as { result: { tools: { name: string; inputSchema: Record<string, unknown> }[] } };
    const names = listed.result.tools.map((entry) => entry.name);
    expect(names).toContain("list_models");
    expect(names).not.toContain("queue_generation");
    expect(names).not.toContain("render_edit");
    const getAsset = listed.result.tools.find((entry) => entry.name === "get_asset")!;
    expect(getAsset.inputSchema).toMatchObject({ type: "object", required: ["assetId"] });

    const [ping, missing] = (await (
      await mcp.handleMcpRequest(
        post("/api/public/studio-mcp", reader, [
          { jsonrpc: "2.0", id: 3, method: "ping" },
          { jsonrpc: "2.0", id: 4, method: "nope" },
        ]),
      )
    ).json()) as Record<string, unknown>[];
    expect(ping).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
    expect((missing!["error"] as { code: number }).code).toBe(-32601);

    // Not a message at all: an invalid request, never a server error.
    const odd = await mcp.handleMcpRequest(post("/api/public/studio-mcp", reader, [1, null]));
    expect(odd.status).toBe(200);
    const answers = (await odd.json()) as { error: { code: number } }[];
    expect(answers.map((answer) => answer.error.code)).toEqual([-32600, -32600]);
    // A response from the client needs no answer.
    const response = await mcp.handleMcpRequest(
      post("/api/public/studio-mcp", reader, { jsonrpc: "2.0", id: 7, result: {} }),
    );
    expect(response.status).toBe(202);
  });

  test("runs a tool and returns its result; a tool's failure is its answer, not a protocol error", async () => {
    const reader = await tokenFor(member["id"], ["read"]);
    const call = async (name: string, args: unknown) =>
      (
        (await (
          await mcp.handleMcpRequest(
            post("/api/public/studio-mcp", reader, {
              jsonrpc: "2.0",
              id: 9,
              method: "tools/call",
              params: { name, arguments: args },
            }),
          )
        ).json()) as {
          result: { isError: boolean; structuredContent?: unknown; content: { text: string }[] };
        }
      ).result;

    const me = await call("whoami", {});
    expect(me.isError).toBe(false);
    expect(me.structuredContent).toMatchObject({ name: "Rugesh", scopes: ["read"] });

    const models = await call("list_models", { lipSync: true });
    const listed = (
      me.isError ? [] : (models.structuredContent as { result: unknown[] }).result
    ) as {
      path: string;
      lipSync: boolean;
      inputs: { role: string }[];
    }[];
    expect(listed.map((model) => model.path)).toEqual(["wan/v2.7/image-to-video"]);
    expect(listed[0]!.inputs.map((input) => input.role)).toEqual(["source", "audio"]);
    // It has no list price yet: a run of it is priced only by Higgsfield's quote.
    expect(listed[0]).toHaveProperty("listPrice", null);
    db.add("model_list_prices", {
      model_registry_id: db.rows("model_registry")[0]!["id"],
      unit: "request",
      usd: 0.25,
      note: null,
      set_by: null,
      set_at: new Date().toISOString(),
    });
    const priced = (
      (await call("list_models", { lipSync: true })).structuredContent as { result: unknown[] }
    ).result as { listPrice: unknown }[];
    expect(priced[0]!.listPrice).toEqual({ usd: 0.25, unit: "request" });

    const bad = await call("get_asset", { assetId: "not-an-id" });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toContain("INVALID_PARAMETERS");

    const denied = await call("create_edit", { title: "x", timeline: {} });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]!.text).toContain("NOT_AUTHORIZED");
  });
});

describe("brands and their formulas over MCP", () => {
  const seed = JSON.parse(
    readFileSync(`${import.meta.dir}/../../docs/brands/aurixa-systems.json`, "utf8"),
  ) as { dna: unknown; formulas: unknown[] };
  const branded = db.add("brand_kits", {
    name: "Aurixa with formulas",
    is_archived: false,
    is_default: false,
    fonts: [],
    terms: [],
    dna: seed.dna,
    formulas: seed.formulas,
  });
  const archived = db.add("brand_kits", {
    name: "Archived brand",
    is_archived: true,
    is_default: false,
    fonts: [],
    terms: [],
    dna: seed.dna,
    formulas: seed.formulas,
  });

  async function call(name: string, args: unknown) {
    const reader = await tokenFor(member["id"], ["read"]);
    const answer = (await (
      await mcp.handleMcpRequest(
        post("/api/public/studio-mcp", reader, {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      )
    ).json()) as {
      result: { isError: boolean; structuredContent?: unknown; content: { text: string }[] };
    };
    return answer.result;
  }

  test("a list of kits names each one's formulas; the kit itself has them whole", async () => {
    const listed = await call("list_brand_kits", {});
    expect(listed.isError).toBe(false);
    const kits = (listed.structuredContent as { result: Record<string, unknown>[] }).result;
    const aurixa = kits.find((entry) => entry["id"] === branded["id"])!;
    expect(aurixa["dna"]).toEqual({
      type: "saas",
      alsoTypes: ["service"],
      market: "b2b",
      archetype: "ruler",
      category:
        "a governed AI operating system for Australian property, finance and advisory firms",
    });
    const formulas = aurixa["ownFormulas"] as {
      id: string;
      name: string;
      audience: string | null;
    }[];
    expect(formulas).toHaveLength(12);
    expect(formulas[3]).toEqual({
      id: "aurixa-passport-journey",
      name: "One Client. One Clear Journey.",
      audience: "Buyers agents",
    });
    // Small enough for the agent to read every kit (it reads 30,000 characters of an answer).
    expect(JSON.stringify(listed.structuredContent).length).toBeLessThan(12_000);
    expect(kits.some((entry) => entry["id"] === archived["id"])).toBe(false);
  });

  test("a brand's own formula needs its kit; a library one reads even if the kit is gone", async () => {
    const own = await call("get_brand_formula", {
      formulaId: "aurixa-under-the-hood",
      brandKitId: branded["id"],
    });
    expect(own.isError).toBe(false);
    expect(own.structuredContent).toMatchObject({
      id: "aurixa-under-the-hood",
      writtenForBrand: true,
      basedOn: ["saas-demo-ad"],
    });
    const library = await call("get_brand_formula", {
      formulaId: "pas",
      brandKitId: archived["id"],
    });
    expect(library.isError).toBe(false);
    expect(library.structuredContent).toMatchObject({ id: "pas" });
    const gone = await call("get_brand_formula", {
      formulaId: "aurixa-under-the-hood",
      brandKitId: archived["id"],
    });
    expect(gone.isError).toBe(true);
    expect(gone.content[0]!.text).toContain("no longer exists");
  });
});

/** What the plain HTTP API answers. */
interface Answer {
  result?: { sequenceId: string; version: number; clips?: number; title?: string };
  error?: { code: string; message: string };
}

describe("edits over the plain HTTP API", () => {
  test("an edit is made from a timeline, branded with a kit and its end card, version by version", async () => {
    const editor = await tokenFor(member["id"], ["read", "edit"]);
    const run = async (name: string, body: unknown) => {
      const response = await mcp.handleRestRequest(
        post(`/api/public/studio/${name}`, editor, body),
        name,
      );
      return { status: response.status, body: (await response.json()) as Answer };
    };

    const missing = await run("create_edit", {
      title: "Janice",
      timeline: {
        clips: [
          { id: "c1", assetId: "11111111-1111-4111-8111-111111111111", kind: "video", duration: 4 },
        ],
      },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.message).toContain("Not in the library");

    const invalid = await run("create_edit", { title: "Janice", timeline: { fps: 23 } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.message).toContain("fps");

    const made = await run("create_edit", {
      title: "Janice",
      timeline: {
        aspectRatio: "9:16",
        clips: [{ id: "c1", assetId: clip["id"], kind: "video", duration: 4 }],
        overlays: [{ id: "t1", text: "Aurixa", start: 0, end: 2 }],
      },
    });
    expect(made.status).toBe(200);
    const { sequenceId, version } = made.body.result!;
    expect(version).toBe(1);
    expect(db.find("sequences", sequenceId)!["created_by"]).toBe(member["id"]);

    const branded = await run("apply_brand_kit", {
      sequenceId,
      expectedVersion: 1,
      brandKitId: kit["id"],
      endCard: { seconds: 3, area: "tiktok" },
    });
    expect(branded.status).toBe(200);
    expect(branded.body.result?.version).toBe(2);
    const timeline = db.find("sequences", sequenceId)!["timeline"] as {
      brandKitId: string;
      clips: unknown[];
      images: { assetId: string }[];
      overlays: { text: string }[];
    };
    expect(timeline.brandKitId).toBe(kit["id"]);
    expect(timeline.clips).toHaveLength(2);
    expect(timeline.images[0]!.assetId).toBe(logo["id"]);
    expect(timeline.overlays.map((overlay) => overlay.text)).toEqual([
      "Aurixa",
      "Your decision.",
      "Start free",
    ]);

    const stale = await run("update_edit", { sequenceId, expectedVersion: 1, title: "Again" });
    expect(stale.status).toBe(400);
    expect(stale.body.error?.message).toContain("changed since");

    const read = await run("get_edit", { sequenceId });
    expect(read.body.result).toMatchObject({ version: 2, clips: 2, title: "Janice" });

    const tools = await mcp.handleRestRequest(
      new Request("https://studio.test/api/public/studio/tools", {
        headers: { Authorization: `Bearer ${editor}` },
      }),
      "tools",
    );
    const catalogue = (await tools.json()) as { tools: { name: string }[] };
    expect(catalogue.tools.map((entry) => entry.name)).toContain("render_edit");
    expect(catalogue.tools.map((entry) => entry.name)).not.toContain("queue_generation");
  });
});

describe("a brand's production roles over MCP", () => {
  const produced = db.add("brand_kits", {
    name: "Aurixa in production",
    is_archived: false,
    is_default: false,
    fonts: [],
    terms: [],
    production: {
      scheme: "dark",
      roles: {
        ground: {
          kind: "colour",
          value: "#040B16",
          from: {
            token: "--color-base-950",
            repo: "Naidu-Group-Pty-Ltd/aurixa-systems",
            path: "src/index.css",
            line: 7,
          },
        },
        surface: { kind: "colour", value: "#10233D" },
        ink: { kind: "colour", value: "#FFFFFF" },
        settle: { kind: "motion", ease: [0.22, 1, 0.36, 1], durationMs: null },
      },
      read: [{ repo: "Naidu-Group-Pty-Ltd/aurixa-systems", sha: "fb9ecba1eb20" }],
    },
  });

  async function call(name: string, args: unknown) {
    const reader = await tokenFor(member["id"], ["read"]);
    const answer = (await (
      await mcp.handleMcpRequest(
        post("/api/public/studio-mcp", reader, {
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      )
    ).json()) as { result: { isError: boolean; structuredContent?: unknown } };
    return answer.result;
  }

  test("get_brand_kit has the roles with where each is declared, their checks, and its stylesheet when asked", async () => {
    const plain = await call("get_brand_kit", { brandKitId: produced["id"] });
    expect(plain.isError).toBe(false);
    const read = plain.structuredContent as Record<string, unknown>;
    const production = read["production"] as { roles: Record<string, { from: unknown }> };
    expect(Object.keys(production.roles)).toEqual(["ground", "surface", "ink", "settle"]);
    expect(production.roles["ground"]!.from).toMatchObject({ path: "src/index.css", line: 7 });
    const checks = read["productionChecks"] as { key: string; ok: boolean }[];
    expect(checks.find((check) => check.key === "contrast")?.ok).toBe(true);
    expect(checks.find((check) => check.key === "roles")?.ok).toBe(false);
    expect(read["productionCss"]).toBeUndefined();

    const withCss = await call("get_brand_kit", { brandKitId: produced["id"], includeCss: true });
    const css = (withCss.structuredContent as Record<string, unknown>)["productionCss"] as string;
    expect(css).toContain(
      "--brand-ground: #040B16; /* --color-base-950 · aurixa-systems src/index.css:7 */",
    );
    expect(css).toContain("--brand-ease-settle: cubic-bezier(0.22, 1, 0.36, 1);");
  });

  test("a kit from before production roles has none, and a list of kits leaves them out", async () => {
    const before = await call("get_brand_kit", { brandKitId: kit["id"] });
    const read = before.structuredContent as Record<string, unknown>;
    expect(read["production"]).toMatchObject({ roles: {}, decisions: [] });
    const listed = await call("list_brand_kits", {});
    const kits = (listed.structuredContent as { result: Record<string, unknown>[] }).result;
    expect(kits.find((entry) => entry["id"] === produced["id"])).not.toHaveProperty("production");
  });
});
