/**
 * What generations cost, by project and campaign (migration 0028's
 * generation_spend_by_scope), and which models' runs have no price at all
 * (unpriced_generation_models), ready for the Usage page and a project's page.
 *
 * Confirmed is what Higgsfield reported charging; estimated is what runs cost
 * whose result carried no charge, at the estimate that stands as their cost
 * (see generations.cost_source). Runs Higgsfield is still making are held, not
 * spent; refunded work isn't counted at all.
 *
 * Pure: no I/O, so it is unit-testable.
 */
import { formatUsd } from "./usage-balance";

/** One project and campaign's spend, as the database counts it. */
export interface ScopeSpend {
  projectId: string | null;
  campaignId: string | null;
  runs: number;
  confirmedUsd: number;
  estimatedUsd: number;
  inFlightUsd: number;
  unpriced: number;
  uncertain: number;
}

export interface SpendTotals {
  runs: number;
  confirmedUsd: number;
  estimatedUsd: number;
  /** Confirmed and estimated together: what it has cost, as far as is known. */
  spentUsd: number;
  inFlightUsd: number;
  unpriced: number;
  uncertain: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const amount = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : 0;
};

const idOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The rows generation_spend_by_scope answers, or none when it answered something else. */
export function readScopeSpend(rows: unknown): ScopeSpend[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row) => ({
    projectId: idOrNull(row["project_id"]),
    campaignId: idOrNull(row["campaign_id"]),
    runs: amount(row["runs"]),
    confirmedUsd: amount(row["confirmed_usd"]),
    estimatedUsd: amount(row["estimated_usd"]),
    inFlightUsd: amount(row["in_flight_usd"]),
    unpriced: amount(row["unpriced"]),
    uncertain: amount(row["uncertain"]),
  }));
}

const round = (usd: number) => Math.round(usd * 10_000) / 10_000;

/** Several scopes' spend added up. */
export function totalSpend(rows: readonly ScopeSpend[]): SpendTotals {
  const totals = rows.reduce(
    (sum, row) => ({
      runs: sum.runs + row.runs,
      confirmedUsd: sum.confirmedUsd + row.confirmedUsd,
      estimatedUsd: sum.estimatedUsd + row.estimatedUsd,
      inFlightUsd: sum.inFlightUsd + row.inFlightUsd,
      unpriced: sum.unpriced + row.unpriced,
      uncertain: sum.uncertain + row.uncertain,
    }),
    { runs: 0, confirmedUsd: 0, estimatedUsd: 0, inFlightUsd: 0, unpriced: 0, uncertain: 0 },
  );
  return {
    ...totals,
    confirmedUsd: round(totals.confirmedUsd),
    estimatedUsd: round(totals.estimatedUsd),
    spentUsd: round(totals.confirmedUsd + totals.estimatedUsd),
    inFlightUsd: round(totals.inFlightUsd),
  };
}

/**
 * Spend by project, or by campaign: each one's rows added up (a project's
 * campaigns together; a campaign across the projects it ran in), most spent
 * first. Work outside any project (or campaign) is under null.
 */
export function spendBy(
  rows: readonly ScopeSpend[],
  scope: "project" | "campaign",
): { id: string | null; totals: SpendTotals }[] {
  const groups = new Map<string | null, ScopeSpend[]>();
  for (const row of rows) {
    const id = scope === "project" ? row.projectId : row.campaignId;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({ id, totals: totalSpend(group) }))
    .sort((a, b) => b.totals.spentUsd - a.totals.spentUsd || b.totals.runs - a.totals.runs);
}

/** "$12.40 confirmed · $3.10 estimated · $0.50 running · 2 unpriced · 1 uncertain". */
export function spendSummary(totals: SpendTotals): string {
  const parts = [
    `${formatUsd(totals.confirmedUsd)} confirmed`,
    `${formatUsd(totals.estimatedUsd)} estimated`,
  ];
  if (totals.inFlightUsd > 0) parts.push(`${formatUsd(totals.inFlightUsd)} running`);
  if (totals.unpriced > 0)
    parts.push(`${totals.unpriced} run${totals.unpriced === 1 ? "" : "s"} unpriced`);
  if (totals.uncertain > 0)
    parts.push(`${totals.uncertain} uncertain submission${totals.uncertain === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** A model whose completed runs have no price. */
export interface UnpricedModel {
  modelId: string;
  runs: number;
  lastRunAt: string | null;
}

/** The rows unpriced_generation_models answers, or none. */
export function readUnpricedModels(rows: unknown): UnpricedModel[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRecord).flatMap((row) => {
    const modelId = idOrNull(row["model_registry_id"]);
    if (!modelId) return [];
    const at = row["last_run_at"];
    return [
      {
        modelId,
        runs: amount(row["runs"]),
        lastRunAt: typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null,
      },
    ];
  });
}
