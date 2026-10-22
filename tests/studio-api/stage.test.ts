import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { FakeDb } from "../long-video/fake-db";
import { AppError } from "../../src/lib/higgsfield/errors";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

const src = (path: string) => join(import.meta.dir, "../../src/lib", path);
const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

/** Higgsfield's quote for each model (as estimate_generation answers), and what was priced. */
const quotes = new Map<string, Record<string, unknown>>();
const priced: string[] = [];
mock.module(src("generation-estimate.server.ts"), () => ({
  estimateGenerationCost: async (input: { modelId: string }) => {
    priced.push(input.modelId);
    return (
      quotes.get(input.modelId) ?? {
        ok: false,
        code: "ESTIMATE_FAILED",
        costUsd: null,
        pricingDescription: null,
        message: null,
      }
    );
  },
}));

/**
 * What was queued; after `refuseAfter` generations, the next is turned away.
 * (Stages here are in a project: its limit is checked through check_spend_allowance.)
 */
const queued: Record<string, unknown>[] = [];
let refuseAfter: number | null = null;
mock.module(src("generation-create.server.ts"), () => ({
  assertGenerationAllowed: async () => {},
  memberAllowance: async () => ({ allowed: true, warning: null }),
  createAndSubmitGeneration: async (request: Record<string, unknown>) => {
    const earlier = db
      .rows("generations")
      .find((row) => row["client_request_id"] === request["clientRequestId"]);
    if (earlier)
      return { generationId: earlier["id"], status: earlier["status"], budgetWarning: null };
    if (refuseAfter !== null && queued.length >= refuseAfter)
      throw new AppError("BUDGET_EXCEEDED", "This project has reached its hard spending limit.");
    queued.push(request);
    const row = db.add("generations", {
      client_request_id: request["clientRequestId"],
      status: "queued",
      estimated_cost_usd: request["estimatedCostUsd"],
    });
    return { generationId: row["id"], status: "queued", budgetWarning: null };
  },
}));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const reel = db.add("projects", { name: "Aurixa Reel 1" });
const model = (name: string, output: "image" | "video") =>
  db.add("model_registry", {
    is_active: true,
    display_name: name,
    model_path: name.toLowerCase().replace(/\W+/g, "-"),
    operation: output === "image" ? "text-to-image" : "image-to-video",
    output_type: output,
    capabilities: { inputs: [] },
    parameter_schema: { fields: [{ key: "prompt", type: "textarea" }] },
  });
const still = model("Sunburst", "image");
const clip = model("Cinema Studio 4.0", "video");
const logo = model("Kling 3.0 Pro", "video");
const broken = model("Broken settings", "image");

/** The balance an admin recorded ($30), and what the studio has spent of it since. */
let spentUsd = 0;
db.add("app_settings", {
  key: "higgsfield_api_balance",
  value: { usd: 30, at: "2026-10-20T00:00:00Z", by_name: "Alex" },
});
db.rpcs.set("higgsfield_api_spend_since", () => ({
  spent_usd: spentUsd,
  in_flight_usd: 0,
  completed: 3,
  last_accepted_at: "2026-10-21T00:00:00Z",
  last_refusal: null,
}));
/** The project's hard limit: $40 more. */
const limitChecks: Record<string, unknown>[] = [];
db.rpcs.set("check_spend_allowance", (args) => {
  limitChecks.push(args);
  return Number(args["_amount"]) > 40
    ? {
        allowed: false,
        scope: "project",
        message: "This project has reached its hard spending limit.",
      }
    : { allowed: true, warning: null };
});

beforeAll(async () => {
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});

beforeEach(() => {
  spentUsd = 0;
  refuseAfter = null;
  quotes.set(String(still["id"]), { ok: true, costUsd: 0.17, costSource: "list_price" });
  quotes.set(String(clip["id"]), { ok: true, costUsd: 2.5, costSource: "metered_estimate" });
  quotes.set(String(logo["id"]), {
    ok: true,
    costUsd: null,
    pricingDescription: "Billed by usage",
  });
  quotes.set(String(broken["id"]), {
    ok: false,
    code: "INVALID_PARAMETERS",
    costUsd: null,
    message: "Resolution must be one of 720p, 1080p",
  });
});

async function tokenFor(scopes: string[]) {
  const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: member["id"],
    name: "test",
    token_prefix: tokenPrefixOf(token),
    token_hash: await tokens.hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  return token;
}

async function call(token: string, name: string, body: Record<string, unknown>) {
  const response = await mcp.handleRestRequest(
    new Request(`https://studio.test/api/public/studio/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    name,
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: string; message: string };
    },
  };
}

const item = (modelId: unknown, extra: Record<string, unknown> = {}) => ({
  modelId,
  parameters: { prompt: "14 Wattle Grove" },
  ...extra,
});
/** Reel 1's stage 5 as it was asked for: nine clips, one take each. */
const nineClips = Array.from({ length: 9 }, (_, index) =>
  item(clip["id"], { label: `C-${index + 1}` }),
);

describe("estimate_stage", () => {
  test("prices every take of every item together, with an allowance for retakes, against the balance", async () => {
    const reader = await tokenFor(["read"]);
    const { status, body } = await call(reader, "estimate_stage", {
      generations: [
        item(still["id"], { takes: 3, label: "P" }),
        item(clip["id"], { takes: 2, label: "C-01" }),
      ],
      projectId: reel["id"],
    });
    expect(status).toBe(200);
    expect(body.result).toMatchObject({
      totalUsd: 5.51,
      withAllowanceUsd: 6.612,
      allowance: 0.2,
      generations: 5,
      balanceUsd: 30,
      fits: true,
      reasons: [],
    });
    expect(body.result!["items"]).toEqual([
      {
        index: 0,
        label: "P",
        modelId: still["id"],
        takes: 3,
        costUsd: 0.17,
        subtotalUsd: 0.51,
        costSource: "list_price",
        problem: null,
      },
      {
        index: 1,
        label: "C-01",
        modelId: clip["id"],
        takes: 2,
        costUsd: 2.5,
        subtotalUsd: 5,
        costSource: "metered_estimate",
        problem: null,
      },
    ]);
    // The limit is checked against the total with its allowance.
    expect(limitChecks.at(-1)).toMatchObject({ _project_id: reel["id"], _amount: 6.612 });
    expect(queued).toHaveLength(0);
  });

  test("says when a stage would run the balance out part way, and why", async () => {
    spentUsd = 10;
    const { body } = await call(await tokenFor(["read"]), "estimate_stage", {
      generations: nineClips,
      projectId: reel["id"],
    });
    expect(body.result).toMatchObject({
      fits: false,
      totalUsd: 22.5,
      withAllowanceUsd: 27,
      balanceUsd: 20,
    });
    expect((body.result!["reasons"] as string[])[0]).toContain("about $20.00 is left");
  });
});

describe("queue_stage", () => {
  test("a stage that doesn't fit is refused whole: nothing is queued", async () => {
    spentUsd = 10;
    const before = db.rows("generations").length;
    const { status, body } = await call(await tokenFor(["generate"]), "queue_stage", {
      generations: nineClips,
      projectId: reel["id"],
      clientRequestId: "reel-1-stage-5",
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe("BUDGET_EXCEEDED");
    expect(body.error?.message).toStartWith("Nothing was queued. This stage of 9 generations");
    expect(queued).toHaveLength(0);
    expect(db.rows("generations").length).toBe(before);
  });

  test("a stage that fits is queued whole, every take at its price, and asking again queues nothing twice", async () => {
    const token = await tokenFor(["generate"]);
    const stage = {
      generations: [
        item(still["id"], { takes: 2, label: "P" }),
        item(clip["id"], { label: "C-01" }),
      ],
      projectId: reel["id"],
      clientRequestId: "reel-1-stage-1",
    };
    const { status, body } = await call(token, "queue_stage", stage);
    expect(status).toBe(200);
    const done = body.result!["queued"] as { label: string; take: number; generationId: string }[];
    expect(done.map((entry) => [entry.label, entry.take])).toEqual([
      ["P", 1],
      ["P", 2],
      ["C-01", 1],
    ]);
    expect(queued.map((request) => request["estimatedCostUsd"])).toEqual([0.17, 0.17, 2.5]);
    expect(queued.map((request) => request["clientRequestId"])).toEqual([
      `stage:${member["id"]}:reel-1-stage-1:1:1`,
      `stage:${member["id"]}:reel-1-stage-1:1:2`,
      `stage:${member["id"]}:reel-1-stage-1:2:1`,
    ]);
    expect(queued.every((request) => request["projectId"] === reel["id"])).toBe(true);
    expect(body.result).toMatchObject({ totalUsd: 2.84, withAllowanceUsd: 3.408 });

    const pricedBefore = priced.length;
    const again = await call(token, "queue_stage", stage);
    expect(
      (again.body.result!["queued"] as { generationId: string }[]).map(
        (entry) => entry.generationId,
      ),
    ).toEqual(done.map((entry) => entry.generationId));
    expect(queued).toHaveLength(3);
    // Its first request was priced and checked: asking again doesn't price it again.
    expect(priced.length).toBe(pricedBefore);
    queued.length = 0;
  });

  test("part of it unpriced is refused, unless that is accepted", async () => {
    const token = await tokenFor(["generate"]);
    const stage = {
      generations: [item(logo["id"], { label: "LOGO-4K", takes: 2 }), item(still["id"])],
      projectId: reel["id"],
      clientRequestId: "reel-1-logo",
    };
    const refused = await call(token, "queue_stage", stage);
    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe("INVALID_PARAMETERS");
    expect(refused.body.error?.message).toContain(
      "LOGO-4K (Higgsfield prices it as “Billed by usage”",
    );
    expect(queued).toHaveLength(0);
    const accepted = await call(token, "queue_stage", { ...stage, allowUnpriced: true });
    expect(accepted.status).toBe(200);
    expect(queued.map((request) => request["estimatedCostUsd"])).toEqual([null, null, 0.17]);
    queued.length = 0;
  });

  test("an item that can't be sent, or a hard spending limit, refuses the stage", async () => {
    const token = await tokenFor(["generate"]);
    const invalid = await call(token, "queue_stage", {
      generations: [item(still["id"]), item(broken["id"], { label: "Bad" })],
      projectId: reel["id"],
      clientRequestId: "reel-1-bad",
    });
    expect(invalid.body.error?.message).toContain(
      "Bad can't be sent as it is: Resolution must be one of 720p, 1080p",
    );
    const overLimit = await call(token, "queue_stage", {
      generations: [item(clip["id"], { takes: 10 }), item(clip["id"], { takes: 7 })],
      projectId: reel["id"],
      retakeAllowance: 0,
      clientRequestId: "reel-1-over",
    });
    expect(overLimit.body.error?.code).toBe("BUDGET_EXCEEDED");
    expect(overLimit.body.error?.message).toContain(
      "This project has reached its hard spending limit.",
    );
    expect(queued).toHaveLength(0);
  });

  test("turned away part way, it says how far it got, and the same request queues the rest", async () => {
    const token = await tokenFor(["generate"]);
    refuseAfter = 2;
    const stage = {
      generations: [item(still["id"], { takes: 4, label: "Mia" })],
      projectId: reel["id"],
      clientRequestId: "reel-1-mia",
    };
    const stopped = await call(token, "queue_stage", stage);
    expect(stopped.body.error?.message).toBe(
      "2 of the stage's 4 generations were queued before Mia (take 3) couldn't be: This project has reached its hard spending limit. Ask again with the same clientRequestId to queue the rest.",
    );
    refuseAfter = null;
    const finished = await call(token, "queue_stage", stage);
    expect((finished.body.result!["queued"] as unknown[]).length).toBe(4);
    expect(queued).toHaveLength(4);
    queued.length = 0;
  });

  test("needs a token that may generate; a reader can only price", async () => {
    const reader = await tokenFor(["read"]);
    const answer = await call(reader, "queue_stage", {
      generations: [item(still["id"])],
      clientRequestId: "reel-1-reader",
    });
    expect(answer.status).toBe(403);
  });
});
