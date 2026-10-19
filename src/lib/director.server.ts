/**
 * The Director's server side: turning a brief into a production plan, and
 * revising one, with the studio's AI. Shared by the server functions
 * (./director.functions) and the streamed endpoint the page uses
 * (./director-stream.server), since an AI plan can take longer than the
 * gateway in front of the studio waits for a quiet request.
 */
import { AppError } from "./higgsfield/errors";
import type { ModelRegistryEntry } from "./model-schema";
import { PRODUCTION_PLAN_JSON_SCHEMA, type ProductionPlan } from "./production-plan-schema";
import type {
  DirectorPlanInput,
  DirectorPlanResult,
  DirectorReviseInput,
} from "./director-request";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function assertActiveMember(userId: string) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return data;
}

/** The configured reasoning backend for Director, or a clear "not configured" error. */
async function directorReasoning() {
  const { resolveReasoning } = await import("./reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route) throw new AppError("PROVIDER_NOT_CONFIGURED", "Reasoning provider not configured");
  return route;
}

/** Active models, with the shot lengths each video model accepts ("clip_seconds"). */
async function activeModelCatalogue() {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("model_registry")
    .select(
      "id,display_name,family,model_path,operation,output_type,recommended_for,capability_tags,parameter_schema",
    )
    .eq("is_active", true)
    .order("sort_order");
  const { durationChoices } = await import("./long-video/plan");
  return (data ?? []).map(({ parameter_schema, ...model }) => {
    const choices = durationChoices({
      ...model,
      parameter_schema,
    } as unknown as ModelRegistryEntry);
    if (!choices.length) return model;
    return {
      ...model,
      clip_seconds:
        choices.length <= 6 ? choices : { min: choices[0], max: choices[choices.length - 1] },
    };
  });
}

const DIRECTOR_SYSTEM = `You are the Director of an internal AI creative studio.
Turn the brief into a structured production plan.
You may ONLY route shots to models supplied in the catalogue, referenced by their exact id.
A video model makes shots of the lengths in its "clip_seconds"; give every video shot a duration its model accepts. A continuous action longer than a model's longest shot becomes consecutive shots on the same model, each as long as the model allows, so the take stays consistent.
If no supplied model can deliver a required capability, list it under unsupported_capability instead of inventing a model or API route.
When a BRAND is given, the plan is made in it: its look, voice and rules, and its DNA (claims only from its proof, hooks from its buying moments, its distinctive assets early).
When a FORMULA is given, build the plan on it: its beats, in order, become the scenes (a beat may take more than one shot), at its timing, so the plan runs its length; keep its rules and never break its guardrails. Say in the creative summary which formula the plan follows.
Never invent prices. Never output hidden reasoning — return only the structured plan.`;

/** What a plan is made in: its brand and its formula, as kept with the plan. */
interface PlanContext {
  brandKitId: string | null;
  formula: DirectorPlanInput["formula"] | null;
}

/** The brand and formula blocks for the AI (empty when there are none). */
async function contextBlocks(context: PlanContext): Promise<string> {
  const { brandBlockOf, loadBrandKit } = await import("./brand/use.server");
  const { formulaBlock, formulaById } = await import("./brand/formulas");
  const kit = await loadBrandKit(context.brandKitId);
  const brand = kit ? brandBlockOf(kit) : "";
  // The brand's own formulas resolve too.
  const formula = formulaById(context.formula?.id, kit?.ownFormulas ?? []);
  const recipe = formula
    ? formulaBlock(formula, {
        seconds: context.formula?.seconds ?? null,
        channel: context.formula?.channel ?? null,
      })
    : "";
  return [brand, recipe].filter(Boolean).join("\n\n");
}

/** Turns a brief into a production plan and keeps it (version 1). Nothing is generated. */
export async function buildDirectorPlan(
  userId: string,
  data: DirectorPlanInput,
): Promise<DirectorPlanResult> {
  await assertActiveMember(userId);
  const supabaseAdmin = await admin();
  const reasoning = await directorReasoning();
  const { formulaById } = await import("./brand/formulas");
  const { loadBrandKit } = await import("./brand/use.server");
  const kit = data.formula ? await loadBrandKit(data.brandKitId) : null;
  const formula = formulaById(data.formula?.id, kit?.ownFormulas ?? []);
  if (data.formula && !formula)
    throw new AppError(
      "INVALID_PARAMETERS",
      "That content formula isn't in the library or the brand's own formulas",
    );

  let sessionId = data.sessionId ?? null;
  if (!sessionId) {
    const { data: session, error } = await supabaseAdmin
      .from("director_sessions")
      .insert({
        created_by: userId,
        project_id: data.projectId ?? null,
        title: data.brief.slice(0, 80),
      })
      .select("id")
      .single();
    if (error) throw new AppError("INVALID_PARAMETERS", error.message);
    sessionId = session.id;
  }

  await supabaseAdmin
    .from("director_messages")
    .insert({ session_id: sessionId, role: "user", content: data.brief });

  const context: PlanContext = {
    brandKitId: data.brandKitId ?? null,
    formula: formula ? (data.formula ?? null) : null,
  };
  const catalogue = await activeModelCatalogue();
  const blocks = await contextBlocks(context);
  const result = await reasoning.provider.generateStructured<ProductionPlan>({
    system: DIRECTOR_SYSTEM,
    input: `BRIEF:\n${data.brief}${blocks ? `\n\n${blocks}` : ""}\n\nMODEL CATALOGUE (JSON):\n${JSON.stringify(catalogue)}`,
    schemaName: "production_plan",
    schema: PRODUCTION_PLAN_JSON_SCHEMA,
    model: reasoning.model,
  });

  if (!result.ok || !result.data) {
    throw new AppError(
      result.errorCode === "REASONING_NOT_CONFIGURED"
        ? "PROVIDER_NOT_CONFIGURED"
        : "PROVIDER_REJECTED",
      result.errorMessage ?? "Director could not build a plan",
    );
  }

  const plan = result.data;
  const { data: saved, error: planError } = await supabaseAdmin
    .from("production_plans")
    .insert({
      session_id: sessionId,
      project_id: data.projectId ?? null,
      created_by: userId,
      title: plan.title ?? "Untitled production",
      plan: plan as never,
      version: 1,
    })
    .select("id,title,plan,version")
    .single();
  if (planError) throw new AppError("INVALID_PARAMETERS", planError.message);

  await supabaseAdmin.from("production_plan_versions").insert({
    plan_id: saved.id,
    version: 1,
    plan: plan as never,
    change_summary: "Initial plan",
    created_by: userId,
  });
  await supabaseAdmin.from("director_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: plan.creative_summary ?? `Planned ${plan.scenes?.length ?? 0} scenes.`,
    // What it was made in, so a revision keeps to the same brand and formula.
    metadata: {
      plan_id: saved.id,
      ...(context.brandKitId ? { brand_kit_id: context.brandKitId } : {}),
      ...(formula && context.formula
        ? {
            formula_id: formula.id,
            formula: {
              id: formula.id,
              seconds: context.formula.seconds ?? null,
              channel: context.formula.channel ?? null,
            },
          }
        : {}),
    },
  });

  return { sessionId, planId: saved.id as string, version: 1, plan };
}

/** The brand and formula a plan was made in, from the message that delivered it. */
async function planContext(planId: string): Promise<PlanContext> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("director_messages")
    .select("metadata")
    .eq("role", "assistant")
    .eq("metadata->>plan_id", planId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  // Plans made before the formula's length and channel were kept name only its id.
  const formula =
    (meta["formula"] as Record<string, unknown> | undefined) ??
    (typeof meta["formula_id"] === "string" ? { id: meta["formula_id"] } : undefined);
  const { CHANNELS } = await import("./brand/dna");
  const channel = formula?.["channel"];
  return {
    brandKitId: typeof meta["brand_kit_id"] === "string" ? meta["brand_kit_id"] : null,
    formula:
      formula && typeof formula["id"] === "string"
        ? {
            id: formula["id"],
            seconds: typeof formula["seconds"] === "number" ? formula["seconds"] : null,
            channel: (CHANNELS as readonly unknown[]).includes(channel)
              ? (channel as (typeof CHANNELS)[number])
              : null,
          }
        : null,
  };
}

/** Revises a plan as asked (a new version), in the brand and formula it was made in. */
export async function reviseDirectorPlanFor(
  userId: string,
  data: DirectorReviseInput,
): Promise<DirectorPlanResult> {
  await assertActiveMember(userId);
  const supabaseAdmin = await admin();
  const reasoning = await directorReasoning();

  const { data: existing } = await supabaseAdmin
    .from("production_plans")
    .select("id,plan,version,session_id")
    .eq("id", data.planId)
    .maybeSingle();
  if (!existing) throw new AppError("INVALID_PARAMETERS", "Plan not found");

  const catalogue = await activeModelCatalogue();
  const blocks = await contextBlocks(await planContext(data.planId));
  const result = await reasoning.provider.generateStructured<ProductionPlan>({
    system: DIRECTOR_SYSTEM,
    input: `EXISTING PLAN (JSON):\n${JSON.stringify(existing.plan)}\n\nREVISION REQUEST:\n${data.instruction}${blocks ? `\n\n${blocks}` : ""}\n\nMODEL CATALOGUE (JSON):\n${JSON.stringify(catalogue)}\n\nReturn the full revised plan, changing only what the request implies.`,
    schemaName: "production_plan",
    schema: PRODUCTION_PLAN_JSON_SCHEMA,
    model: reasoning.model,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "Director could not revise the plan",
    );

  const version = (existing.version ?? 1) + 1;
  await supabaseAdmin
    .from("production_plans")
    .update({
      plan: result.data as never,
      version,
      title: result.data.title ?? "Untitled production",
    })
    .eq("id", data.planId);
  await supabaseAdmin.from("production_plan_versions").insert({
    plan_id: data.planId,
    version,
    plan: result.data as never,
    change_summary: data.instruction.slice(0, 280),
    created_by: userId,
  });
  if (existing.session_id) {
    await supabaseAdmin.from("director_messages").insert({
      session_id: existing.session_id,
      role: "user",
      content: data.instruction,
    });
    await supabaseAdmin.from("director_messages").insert({
      session_id: existing.session_id,
      role: "assistant",
      content: result.data.creative_summary ?? `Revised to version ${version}.`,
      metadata: { plan_id: data.planId, version },
    });
  }
  return {
    sessionId: existing.session_id ?? null,
    planId: data.planId,
    version,
    plan: result.data,
  };
}
