/**
 * A price for every generation (see migration 0028_generation_costs). When the
 * provider's estimate gives no figure, only a pricing description, the request
 * is priced from the flat price the description states (a price per image,
 * per request or per second, in dollars or credits), else from the list price
 * an admin set for its model, and the figure is kept as its estimate, marked
 * as such (cost_source "unit_estimate" or "list_price"). When its result
 * carries no charge, that estimate stands as its cost. Nothing is invented: a
 * run with neither stays unpriced, and its model is listed on the Usage page
 * for an admin to price.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "./higgsfield/errors";
import { isMissingTableError } from "./edit/errors";
import {
  PRICE_UNITS,
  unitQuote,
  unitQuoteFor,
  type PriceUnit,
  type UnitQuote,
} from "./higgsfield/metered";
import type { ModelRegistryEntry } from "./model-schema";

/** Where a generation's recorded cost came from (generations.cost_source). */
export const COST_SOURCES = {
  provider: "Charged, as Higgsfield reported it",
  provider_estimate: "Estimated: Higgsfield's quote for the request",
  metered_estimate: "Estimated: Higgsfield's metered rate for the request",
  unit_estimate: "Estimated: the price per unit Higgsfield's pricing states",
  list_price: "Estimated: the model's list price, set by an admin",
} as const;
export type CostSource = keyof typeof COST_SOURCES;

/** Said when list prices are asked for before the database has them. */
export const LIST_PRICES_NEED_UPDATE =
  "List prices need a database update (migration 0028_generation_costs). Ask an admin to apply it.";

/** An admin's list price for a model. */
export interface ListPrice {
  modelId: string;
  unit: PriceUnit;
  usd: number;
  note: string | null;
  setBy: string | null;
  setAt: string;
}

function listPriceOf(row: Record<string, unknown>): ListPrice | null {
  const unit = row["unit"];
  const usd = Number(row["usd"]);
  if (!PRICE_UNITS.includes(unit as PriceUnit) || !(usd > 0)) return null;
  return {
    modelId: String(row["model_registry_id"]),
    unit: unit as PriceUnit,
    usd,
    note: typeof row["note"] === "string" ? row["note"] : null,
    setBy: typeof row["set_by"] === "string" ? row["set_by"] : null,
    setAt: String(row["set_at"] ?? ""),
  };
}

/** A model's list price, or null (none set, or the database doesn't have list prices yet). */
export async function listPriceFor(modelId: string): Promise<ListPrice | null> {
  const { data, error } = await supabaseAdmin
    .from("model_list_prices")
    .select("*")
    .eq("model_registry_id", modelId)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error))
      console.error("model list price not read", { modelId, message: error.message });
    return null;
  }
  return data ? listPriceOf(data as Record<string, unknown>) : null;
}

/** A model's settings, from its parameter schema as the database holds it. */
function fieldsOf(schema: unknown): NonNullable<ModelRegistryEntry["parameter_schema"]>["fields"] {
  const fields = (schema as { fields?: unknown } | null)?.fields;
  return Array.isArray(fields) ? fields : [];
}

/** A price worked out where the provider's estimate gives no figure. */
export interface FallbackQuote extends UnitQuote {
  source: "unit_estimate" | "list_price";
}

/**
 * What a request costs when the provider's estimate gives no figure: from the
 * flat price its pricing description states, else from its model's list
 * price. Null when neither says.
 */
export async function fallbackQuote(
  model: Pick<ModelRegistryEntry, "id" | "parameter_schema">,
  values: Record<string, unknown>,
  description: string | null,
): Promise<FallbackQuote | null> {
  const fields = model.parameter_schema?.fields ?? [];
  const stated = unitQuoteFor({ description, fields, values });
  if (stated) return { ...stated, source: "unit_estimate" };
  const listed = await listPriceFor(model.id);
  const quote = listed ? unitQuote(listed, fields, values) : null;
  return quote ? { ...quote, source: "list_price" } : null;
}

/** Keeps a worked-out price as a generation's estimate, on its record and in the usage ledger. */
export async function recordFallbackQuote(
  generationId: string,
  quote: FallbackQuote,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("generations")
    .update({ estimated_cost_usd: quote.usd, cost_source: quote.source })
    .eq("id", generationId);
  await supabaseAdmin
    .from("usage_ledger")
    .update({ estimated_cost_usd: quote.usd })
    .eq("generation_id", generationId);
  const { logEvent } = await import("./generation-pipeline.server");
  await logEvent(generationId, "estimate_received", {
    estimated_cost_usd: quote.usd,
    cost_source: quote.source,
    unit_price: { unit: quote.unit, units: quote.units, usd: quote.unitUsd },
    ...detail,
  });
}

/**
 * A completed run whose result carried no charge and that has no estimate
 * either (sent before its model had a list price, say): priced now from its
 * model's list price, if an admin has set one, and kept as its estimate.
 * Best effort: a run left unpriced is listed on the Usage page.
 */
export async function priceUnpricedRun(generationId: string): Promise<void> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("id,status,actual_cost_usd,estimated_cost_usd,parameters,model_registry_id")
    .eq("id", generationId)
    .maybeSingle();
  if (
    !generation ||
    generation.status !== "completed" ||
    generation.actual_cost_usd !== null ||
    generation.estimated_cost_usd !== null
  )
    return;
  const listed = await listPriceFor(generation.model_registry_id);
  if (!listed) return;
  const { data: model } = await supabaseAdmin
    .from("model_registry")
    .select("id,parameter_schema")
    .eq("id", generation.model_registry_id)
    .maybeSingle();
  const fields = fieldsOf(model?.parameter_schema);
  const quote = unitQuote(listed, fields, (generation.parameters ?? {}) as Record<string, unknown>);
  if (!quote) return;
  await recordFallbackQuote(generationId, { ...quote, source: "list_price" }, { at: "completion" });
}

/** The most earlier runs an admin's new list price prices in one go. */
const EARLIER_RUNS = 500;

/**
 * An admin sets a model's list price (or, given null, removes it), with who
 * and when recorded. With `priceEarlierRuns`, the model's completed runs that
 * have no price at all take it too, as estimates (never as charges). Returns
 * how many runs it priced.
 */
export async function setModelListPrice(input: {
  userId: string;
  modelId: string;
  price: { unit: PriceUnit; usd: number; note: string | null } | null;
  priceEarlierRuns: boolean;
}): Promise<{ priced: number }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_active,role")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active || profile.role !== "admin")
    throw new AppError("NOT_AUTHORIZED", "Only an admin can set a model's list price");
  const { data: model } = await supabaseAdmin
    .from("model_registry")
    .select("id,parameter_schema")
    .eq("id", input.modelId)
    .maybeSingle();
  if (!model) throw new AppError("INVALID_PARAMETERS", "That model no longer exists");
  const table = supabaseAdmin.from("model_list_prices");
  const { error } = input.price
    ? await table.upsert(
        {
          model_registry_id: input.modelId,
          unit: input.price.unit,
          usd: Number(input.price.usd.toFixed(4)),
          note: input.price.note?.trim().slice(0, 500) || null,
          set_by: input.userId,
          set_at: new Date().toISOString(),
        },
        { onConflict: "model_registry_id" },
      )
    : await table.delete().eq("model_registry_id", input.modelId);
  if (error) {
    if (isMissingTableError(error))
      throw new AppError("INVALID_PARAMETERS", LIST_PRICES_NEED_UPDATE);
    throw new AppError("STORAGE_FAILED", "The list price couldn't be saved. Try again.");
  }
  if (!input.price || !input.priceEarlierRuns) return { priced: 0 };

  const { data: runs } = await supabaseAdmin
    .from("generations")
    .select("id,parameters")
    .eq("model_registry_id", input.modelId)
    .eq("status", "completed")
    .is("actual_cost_usd", null)
    .is("estimated_cost_usd", null)
    .order("created_at", { ascending: true })
    .limit(EARLIER_RUNS);
  const fields = fieldsOf(model.parameter_schema);
  let priced = 0;
  for (const run of runs ?? []) {
    const quote = unitQuote(input.price, fields, (run.parameters ?? {}) as Record<string, unknown>);
    if (!quote) continue;
    const { data: updated } = await supabaseAdmin
      .from("generations")
      .update({ estimated_cost_usd: quote.usd, cost_source: "list_price" })
      .eq("id", run.id)
      .is("estimated_cost_usd", null)
      .is("actual_cost_usd", null)
      .select("id");
    if (!updated?.length) continue;
    await supabaseAdmin
      .from("usage_ledger")
      .update({ estimated_cost_usd: quote.usd })
      .eq("generation_id", run.id);
    priced += 1;
  }
  return { priced };
}
