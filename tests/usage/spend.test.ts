import { describe, expect, test } from "bun:test";
import {
  readScopeSpend,
  readUnpricedModels,
  spendBy,
  spendSummary,
  totalSpend,
} from "../../src/lib/usage-spend";

const REEL = "11111111-1111-4111-8111-111111111111";
const LAUNCH = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";

/** generation_spend_by_scope's rows, as PostgREST sends them (numerics as strings). */
const ROWS = [
  {
    project_id: REEL,
    campaign_id: null,
    runs: 245,
    confirmed_usd: "12.5000",
    estimated_usd: "41.2300",
    in_flight_usd: "2.0000",
    unpriced: 0,
    uncertain: 1,
  },
  {
    project_id: REEL,
    campaign_id: CAMPAIGN,
    runs: 4,
    confirmed_usd: "0",
    estimated_usd: "0.6800",
    in_flight_usd: "0",
    unpriced: 2,
    uncertain: 0,
  },
  {
    project_id: LAUNCH,
    campaign_id: CAMPAIGN,
    runs: 3,
    confirmed_usd: "6.0000",
    estimated_usd: "0",
    in_flight_usd: "0",
    unpriced: 0,
    uncertain: 0,
  },
  {
    project_id: null,
    campaign_id: null,
    runs: 1,
    confirmed_usd: 0,
    estimated_usd: 0.17,
    in_flight_usd: 0,
    unpriced: 0,
    uncertain: 0,
  },
];

describe("spend by project and campaign", () => {
  test("reads the database's rows, numerics and all", () => {
    const rows = readScopeSpend(ROWS);
    expect(rows[0]).toEqual({
      projectId: REEL,
      campaignId: null,
      runs: 245,
      confirmedUsd: 12.5,
      estimatedUsd: 41.23,
      inFlightUsd: 2,
      unpriced: 0,
      uncertain: 1,
    });
    expect(readScopeSpend(null)).toEqual([]);
    expect(readScopeSpend([null, "x"])).toEqual([]);
  });

  test("adds a project's campaigns together, confirmed and estimated kept apart", () => {
    const byProject = spendBy(readScopeSpend(ROWS), "project");
    expect(byProject.map((entry) => entry.id)).toEqual([REEL, LAUNCH, null]);
    expect(byProject[0]!.totals).toEqual({
      runs: 249,
      confirmedUsd: 12.5,
      estimatedUsd: 41.91,
      spentUsd: 54.41,
      inFlightUsd: 2,
      unpriced: 2,
      uncertain: 1,
    });
    expect(spendSummary(byProject[0]!.totals)).toBe(
      "$12.50 confirmed · $41.91 estimated · $2.00 running · 2 runs unpriced · 1 uncertain submission",
    );
  });

  test("a campaign is counted across the projects it ran in", () => {
    const byCampaign = spendBy(readScopeSpend(ROWS), "campaign");
    const campaign = byCampaign.find((entry) => entry.id === CAMPAIGN)!;
    expect(campaign.totals).toMatchObject({
      runs: 7,
      confirmedUsd: 6,
      estimatedUsd: 0.68,
      spentUsd: 6.68,
    });
    expect(spendSummary(totalSpend([]))).toBe("$0.00 confirmed · $0.00 estimated");
  });

  test("the models whose runs have no price", () => {
    expect(
      readUnpricedModels([
        { model_registry_id: REEL, runs: "37", last_run_at: "2026-10-21T08:00:00Z" },
        { model_registry_id: null, runs: 1 },
        { model_registry_id: LAUNCH, runs: 2, last_run_at: "not a time" },
      ]),
    ).toEqual([
      { modelId: REEL, runs: 37, lastRunAt: "2026-10-21T08:00:00Z" },
      { modelId: LAUNCH, runs: 2, lastRunAt: null },
    ]);
  });
});
