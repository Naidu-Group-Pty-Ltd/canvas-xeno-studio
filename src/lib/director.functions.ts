import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { CHANNELS } from "./brand/dna";
import { PRODUCTION_PLAN_JSON_SCHEMA, type ProductionPlan } from "./production-plan-schema";
import type { ModelRegistryEntry } from "./model-schema";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertActiveMember(userId: string) {
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

/** Reasoning availability — never returns the key itself. */
export const getReasoningHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveMember(context.userId);
    const { reasoningStatus } = await import("./reasoning/provider.server");
    const [director, qc, router] = await Promise.all([
      reasoningStatus("director"),
      reasoningStatus("qc"),
      reasoningStatus("router"),
    ]);
    return {
      configured: !!director.backend,
      backend: director.backend,
      directorModel: director.model,
      qcModel: qc.model,
      routerModel: router.model,
    };
  });

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

const planInput = z.object({
  brief: z.string().min(4).max(8000),
  sessionId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  /** The brand kit the production is made in: shots keep to its look and voice. */
  brandKitId: z.string().uuid().nullable().optional(),
  /** The content formula the plan is built on (see ./brand/formulas), at a length and for a channel. */
  formula: z
    .object({
      id: z.string().min(1).max(60),
      seconds: z.number().int().min(5).max(600).nullable().optional(),
      channel: z.enum(CHANNELS).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const createDirectorPlan = createServerFn({ method: "POST" })
  .inputValidator((data) => planInput.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const supabaseAdmin = await admin();
    const reasoning = await directorReasoning();

    let sessionId = data.sessionId ?? null;
    if (!sessionId) {
      const { data: session, error } = await supabaseAdmin
        .from("director_sessions")
        .insert({
          created_by: context.userId,
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

    const catalogue = await activeModelCatalogue();
    const { brandBlock } = await import("./brand/use.server");
    const brand = await brandBlock(data.brandKitId, 2600);
    const { formulaBlock, formulaById } = await import("./brand/formulas");
    const formula = formulaById(data.formula?.id);
    if (data.formula && !formula)
      throw new AppError("INVALID_PARAMETERS", "That content formula isn't in the library");
    const recipe = formula
      ? formulaBlock(formula, {
          seconds: data.formula?.seconds ?? null,
          channel: data.formula?.channel ?? null,
        })
      : "";
    const result = await reasoning.provider.generateStructured<ProductionPlan>({
      system: DIRECTOR_SYSTEM,
      input: `BRIEF:\n${data.brief}${brand ? `\n\n${brand}` : ""}${recipe ? `\n\n${recipe}` : ""}\n\nMODEL CATALOGUE (JSON):\n${JSON.stringify(catalogue)}`,
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
        created_by: context.userId,
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
      created_by: context.userId,
    });
    await supabaseAdmin.from("director_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: plan.creative_summary ?? `Planned ${plan.scenes?.length ?? 0} scenes.`,
      metadata: { plan_id: saved.id, ...(formula ? { formula_id: formula.id } : {}) },
    });

    return { sessionId, planId: saved.id as string, plan };
  });

const reviseInput = z.object({
  planId: z.string().uuid(),
  instruction: z.string().min(2).max(4000),
});

export const reviseDirectorPlan = createServerFn({ method: "POST" })
  .inputValidator((data) => reviseInput.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const supabaseAdmin = await admin();
    const reasoning = await directorReasoning();

    const { data: existing } = await supabaseAdmin
      .from("production_plans")
      .select("id,plan,version,session_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (!existing) throw new AppError("INVALID_PARAMETERS", "Plan not found");

    const catalogue = await activeModelCatalogue();
    const result = await reasoning.provider.generateStructured<ProductionPlan>({
      system: DIRECTOR_SYSTEM,
      input: `EXISTING PLAN (JSON):\n${JSON.stringify(existing.plan)}\n\nREVISION REQUEST:\n${data.instruction}\n\nMODEL CATALOGUE (JSON):\n${JSON.stringify(catalogue)}\n\nReturn the full revised plan, changing only what the request implies.`,
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
      created_by: context.userId,
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
    return { planId: data.planId, version, plan: result.data };
  });

const storyboardInput = z.object({
  planId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
});

/** Materialises an approved plan into a durable storyboard. No generation is submitted. */
export const createStoryboardFromPlan = createServerFn({ method: "POST" })
  .inputValidator((d) => storyboardInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const supabaseAdmin = await admin();
    const { data: row } = await supabaseAdmin
      .from("production_plans")
      .select("id,plan,title,project_id,storyboard_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (!row) throw new AppError("INVALID_PARAMETERS", "Plan not found");
    const plan = row.plan as unknown as ProductionPlan;

    const { data: storyboard, error } = await supabaseAdmin
      .from("storyboards")
      .insert({
        project_id: data.projectId ?? row.project_id ?? null,
        title: plan.title ?? row.title,
        objective: plan.objective ?? null,
        creative_direction: (plan.creative_direction ?? {}) as never,
        target_duration_seconds: plan.target_duration ? Math.round(plan.target_duration) : null,
        primary_aspect_ratio: plan.primary_aspect_ratio ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new AppError("INVALID_PARAMETERS", error.message);

    for (const scene of plan.scenes ?? []) {
      const { data: sceneRow } = await supabaseAdmin
        .from("scenes")
        .insert({
          storyboard_id: storyboard.id,
          scene_number: scene.scene_number,
          name: scene.name,
          purpose: scene.purpose ?? null,
          environment: scene.environment ?? null,
          continuity_requirements: scene.continuity_requirements ?? null,
        })
        .select("id")
        .single();
      if (!sceneRow) continue;
      for (const shot of scene.shots ?? []) {
        await supabaseAdmin.from("shots").insert({
          scene_id: sceneRow.id,
          shot_number: shot.shot_number,
          name: shot.name ?? null,
          description: shot.description ?? null,
          prompt: shot.prompt ?? null,
          spec: shot as never,
          duration_seconds: shot.duration ?? null,
          operation_type: shot.operation_type ?? null,
          recommended_model_id: shot.recommended_model_id ?? null,
        });
      }
    }

    await supabaseAdmin
      .from("production_plans")
      .update({ storyboard_id: storyboard.id, status: "approved" })
      .eq("id", row.id);
    return { storyboardId: storyboard.id as string };
  });

/** Live provider estimate for every shot of a plan. No generation is submitted. */
export const estimateProductionPlan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const supabaseAdmin = await admin();
    const { higgsfieldProvider } = await import("./higgsfield/provider.server");
    const { extractCost, extractPricingDescription } = await import("./higgsfield/provider.server");
    const { meteredQuoteFor } = await import("./higgsfield/metered");

    const { data: row } = await supabaseAdmin
      .from("production_plans")
      .select("plan")
      .eq("id", data.planId)
      .maybeSingle();
    if (!row) throw new AppError("INVALID_PARAMETERS", "Plan not found");
    if (!higgsfieldProvider.isConfigured()) throw new AppError("PROVIDER_NOT_CONFIGURED");
    const plan = row.plan as unknown as ProductionPlan;

    const { data: models } = await supabaseAdmin
      .from("model_registry")
      .select("*")
      .eq("is_active", true);
    const { defaultsForModel, providerPayload } = await import("./model-schema");
    const modelById = new Map(
      ((models ?? []) as unknown as ModelRegistryEntry[]).map((model) => [model.id, model]),
    );

    let total = 0;
    let unknown = 0;
    const perShot: { shot: string; cost: number | null }[] = [];
    for (const scene of plan.scenes ?? []) {
      for (const shot of scene.shots ?? []) {
        const model = shot.recommended_model_id
          ? modelById.get(shot.recommended_model_id)
          : undefined;
        if (!model) {
          unknown += 1;
          perShot.push({ shot: `${scene.scene_number}.${shot.shot_number}`, cost: null });
          continue;
        }
        // Estimate with the model's own defaults so the quote matches what Create would send.
        const fields = model.parameter_schema?.fields ?? [];
        const params: Record<string, unknown> = { ...defaultsForModel(model), prompt: shot.prompt };
        if (shot.duration && fields.some((field) => field.key === "duration"))
          params["duration"] = shot.duration;
        // The same request body Create would send (no media is known for a planned shot).
        const payload = providerPayload(model, params, []);
        const call = await higgsfieldProvider.estimate(model.model_path, payload);
        // A metered model's rate is priced for this shot's size and length.
        const cost = call.ok
          ? (extractCost(call.data) ??
            meteredQuoteFor({
              description: extractPricingDescription(call.data),
              fields,
              values: payload,
            })?.usd ??
            null)
          : null;
        if (cost === null) unknown += 1;
        else total += cost;
        perShot.push({ shot: `${scene.scene_number}.${shot.shot_number}`, cost });
      }
    }

    await supabaseAdmin
      .from("production_plans")
      .update({ total_estimated_cost_usd: total })
      .eq("id", data.planId);
    return { totalEstimatedUsd: total, unresolvedShots: unknown, perShot };
  });
