import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

/** The admin client, with tables that can be missing (a migration not yet applied). */
class CostDb extends FakeDb {
  missing = new Set<string>();
  override from(table: string) {
    if (!this.missing.has(table)) return super.from(table);
    const answer = {
      data: null,
      error: { code: "42P01", message: `relation "public.${table}" does not exist` },
    };
    const chain: unknown = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "then"
            ? (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve)
            : () => chain,
      },
    );
    return chain as ReturnType<FakeDb["from"]>;
  }
}

const db = new CostDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Costs = typeof import("../../src/lib/generation-costs.server");
type Pipeline = typeof import("../../src/lib/generation-pipeline.server");
type Provider = typeof import("../../src/lib/higgsfield/provider.server");
let costs: Costs;
let pipeline: Pipeline;
let provider: Provider;

const admin = db.add("profiles", { is_active: true, role: "admin", full_name: "Alex" });
const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const PROJECT = String(db.add("projects", { name: "Aurixa Reel 1" })["id"]);

/** GPT Image 2.5 Sunburst: priced by OpenAI's token use, which the studio doesn't follow. */
const TOKEN_PRICING =
  "Billed at OpenAI's token rates: $5 per 1M text input tokens and $40 per 1M image output tokens";
const sunburst = db.add("model_registry", {
  is_active: true,
  provider: "higgsfield",
  display_name: "Marketing Studio 2.5 Sunburst",
  model_path: "marketing-studio/image/sunburst",
  operation: "text-to-image",
  output_type: "image",
  capabilities: { inputs: [] },
  parameter_schema: {
    fields: [
      { key: "prompt", type: "textarea", required: true },
      { key: "batch_size", type: "segmented", options: [1, 4], default: 1 },
    ],
  },
});

function generation(overrides: Record<string, unknown> = {}) {
  const row = db.add("generations", {
    user_id: member["id"],
    project_id: null,
    campaign_id: null,
    model_registry_id: sunburst["id"],
    provider: "higgsfield",
    model_path: sunburst["model_path"],
    operation: "text-to-image",
    prompt: "14 Wattle Grove at dusk",
    parameters: { prompt: "14 Wattle Grove at dusk", batch_size: 1 },
    estimated_cost_usd: null,
    actual_cost_usd: null,
    cost_source: null,
    status: "completed",
    // What submission reads: the generation with its model.
    model_registry: sunburst,
    ...overrides,
  });
  db.add("usage_ledger", {
    generation_id: row["id"],
    user_id: member["id"],
    model_registry_id: sunburst["id"],
    estimated_cost_usd: overrides["estimated_cost_usd"] ?? null,
    actual_cost_usd: null,
    billing_status: "estimated",
  });
  return row;
}

const ledgerOf = (id: unknown) =>
  db.rows("usage_ledger").find((row) => row["generation_id"] === id)!;

/** What this file changes for its own runs, put back after it. */
const before = { keyId: process.env["HF_KEY_ID"], keySecret: process.env["HF_KEY_SECRET"] };
let realCalls: Pick<Provider["higgsfieldProvider"], "estimate" | "submit">;

beforeAll(async () => {
  process.env["HF_KEY_ID"] = "test-key";
  process.env["HF_KEY_SECRET"] = "test-secret";
  costs = await import("../../src/lib/generation-costs.server");
  pipeline = await import("../../src/lib/generation-pipeline.server");
  provider = await import("../../src/lib/higgsfield/provider.server");
  realCalls = {
    estimate: provider.higgsfieldProvider.estimate,
    submit: provider.higgsfieldProvider.submit,
  };
});

afterAll(() => {
  Object.assign(provider.higgsfieldProvider, realCalls);
  for (const [key, value] of [
    ["HF_KEY_ID", before.keyId],
    ["HF_KEY_SECRET", before.keySecret],
  ] as const)
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});

describe("a price where the provider's estimate gives no figure", () => {
  test("a flat price the description states, for the images the request makes", async () => {
    expect(
      await costs.fallbackQuote(sunburst as never, { batch_size: 4 }, "6 credits per image"),
    ).toEqual({ usd: 1.5, unit: "image", units: 4, unitUsd: 0.375, source: "unit_estimate" });
  });

  test("a description it doesn't follow takes the model's list price, and nothing without one", async () => {
    expect(await costs.fallbackQuote(sunburst as never, {}, TOKEN_PRICING)).toBeNull();
    db.add("model_list_prices", {
      model_registry_id: sunburst["id"],
      unit: "image",
      usd: 0.17,
      note: "OpenAI's high quality at 2K, from the Console",
      set_by: admin["id"],
      set_at: new Date().toISOString(),
    });
    expect(await costs.fallbackQuote(sunburst as never, { batch_size: 4 }, TOKEN_PRICING)).toEqual({
      usd: 0.68,
      unit: "image",
      units: 4,
      unitUsd: 0.17,
      source: "list_price",
    });
  });

  test("before the database has list prices, nothing is priced and nothing fails", async () => {
    db.missing.add("model_list_prices");
    try {
      expect(await costs.fallbackQuote(sunburst as never, {}, TOKEN_PRICING)).toBeNull();
      expect(await costs.listPriceFor(String(sunburst["id"]))).toBeNull();
    } finally {
      db.missing.delete("model_list_prices");
    }
  });
});

describe("recording a run's cost", () => {
  test("submission keeps the list price as the run's estimate, marked as one, and checks the spending limit against it", async () => {
    const run = generation({
      status: "ready",
      project_id: PROJECT,
      parameters: { prompt: "P", batch_size: 4 },
    });
    const capChecks: unknown[] = [];
    db.rpcs.set("check_spend_allowance", (args) => {
      capChecks.push(args);
      return { allowed: true, warning: null };
    });
    provider.higgsfieldProvider.estimate = async () => ({
      ok: true,
      status: 200,
      data: { pricing_description: TOKEN_PRICING },
      raw: "",
    });
    provider.higgsfieldProvider.submit = async () => ({
      ok: true,
      status: 200,
      data: { request_id: "hf-request-1" },
      raw: "",
    });
    expect(await pipeline.submitToProvider(String(run["id"]))).toEqual({ status: "queued" });
    expect(db.find("generations", run["id"])).toMatchObject({
      estimated_cost_usd: 0.68,
      cost_source: "list_price",
      status: "queued",
    });
    expect(ledgerOf(run["id"])["estimated_cost_usd"]).toBe(0.68);
    expect(capChecks).toEqual([{ _project_id: PROJECT, _campaign_id: null, _amount: 0.68 }]);
    const event = db
      .rows("generation_events")
      .find(
        (row) => row["generation_id"] === run["id"] && row["event_type"] === "estimate_received",
      )!;
    expect(event["payload"]).toMatchObject({
      cost_source: "list_price",
      unit_price: { unit: "image", units: 4, usd: 0.17 },
      pricing_description: TOKEN_PRICING,
    });

    // Its result carries no charge: the estimate stands as its cost.
    expect(await pipeline.applyProviderPayload(String(run["id"]), { status: "completed" })).toBe(
      "completed",
    );
    expect(db.find("generations", run["id"])).toMatchObject({
      actual_cost_usd: null,
      estimated_cost_usd: 0.68,
      cost_source: "list_price",
    });
    expect(ledgerOf(run["id"])["billing_status"]).toBe("estimated");
  });

  test("a stated price per image is kept as a unit estimate", async () => {
    const run = generation({ status: "ready", project_id: PROJECT });
    provider.higgsfieldProvider.estimate = async () => ({
      ok: true,
      status: 200,
      data: { pricing_description: "Each output image costs $0.25" },
      raw: "",
    });
    await pipeline.submitToProvider(String(run["id"]));
    expect(db.find("generations", run["id"])).toMatchObject({
      estimated_cost_usd: 0.25,
      cost_source: "unit_estimate",
    });
  });

  test("a run with no estimate at all takes its model's list price when it completes", async () => {
    const run = generation({ status: "queued" });
    await pipeline.applyProviderPayload(String(run["id"]), { status: "completed" });
    expect(db.find("generations", run["id"])).toMatchObject({
      estimated_cost_usd: 0.17,
      cost_source: "list_price",
    });
    expect(ledgerOf(run["id"])["estimated_cost_usd"]).toBe(0.17);
  });

  test("a charge the provider reports is the run's cost, and no estimate replaces it", async () => {
    const run = generation({ status: "queued" });
    await pipeline.applyProviderPayload(String(run["id"]), { status: "completed", cost: 0.21 });
    expect(db.find("generations", run["id"])).toMatchObject({
      actual_cost_usd: 0.21,
      cost_source: "provider",
      estimated_cost_usd: null,
    });
    expect(ledgerOf(run["id"])).toMatchObject({ actual_cost_usd: 0.21, billing_status: "actual" });
  });
});

describe("an admin's list price", () => {
  test("only an admin sets it, with who and when recorded", async () => {
    await expect(
      costs.setModelListPrice({
        userId: String(member["id"]),
        modelId: String(sunburst["id"]),
        price: { unit: "image", usd: 0.2, note: null },
        priceEarlierRuns: false,
      }),
    ).rejects.toThrow("Only an admin");
    await costs.setModelListPrice({
      userId: String(admin["id"]),
      modelId: String(sunburst["id"]),
      price: { unit: "image", usd: 0.2, note: "  From the Console, 22 October  " },
      priceEarlierRuns: false,
    });
    const price = db
      .rows("model_list_prices")
      .find((row) => row["model_registry_id"] === sunburst["id"])!;
    expect(price).toMatchObject({
      unit: "image",
      usd: 0.2,
      note: "From the Console, 22 October",
      set_by: admin["id"],
    });
  });

  test("can price the runs already made without one, as estimates, leaving every other run alone", async () => {
    const one = generation({ parameters: { batch_size: 1 } });
    const four = generation({ parameters: { batch_size: 4 } });
    const charged = generation({ actual_cost_usd: 0.3, cost_source: "provider" });
    const refunded = generation({ status: "failed" });
    const { priced } = await costs.setModelListPrice({
      userId: String(admin["id"]),
      modelId: String(sunburst["id"]),
      price: { unit: "image", usd: 0.2, note: null },
      priceEarlierRuns: true,
    });
    expect(priced).toBe(2);
    expect(db.find("generations", one["id"])).toMatchObject({
      estimated_cost_usd: 0.2,
      cost_source: "list_price",
    });
    expect(db.find("generations", four["id"])!["estimated_cost_usd"]).toBe(0.8);
    expect(ledgerOf(four["id"])["estimated_cost_usd"]).toBe(0.8);
    expect(db.find("generations", charged["id"])).toMatchObject({
      estimated_cost_usd: null,
      cost_source: "provider",
    });
    expect(db.find("generations", refunded["id"])!["estimated_cost_usd"]).toBeNull();
  });

  test("before the database has list prices, setting one says what it needs", async () => {
    db.missing.add("model_list_prices");
    try {
      await expect(
        costs.setModelListPrice({
          userId: String(admin["id"]),
          modelId: String(sunburst["id"]),
          price: { unit: "request", usd: 1, note: null },
          priceEarlierRuns: false,
        }),
      ).rejects.toThrow("migration 0028_generation_costs");
    } finally {
      db.missing.delete("model_list_prices");
    }
  });
});
