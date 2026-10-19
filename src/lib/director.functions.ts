import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import type { ProductionPlan } from "./production-plan-schema";
import type { ModelRegistryEntry } from "./model-schema";

// Plans are made and revised through /api/public/director-plan (see
// ./director-stream.server and ./director.server): an AI plan can take longer
// than the gateway in front of the studio waits for a server function.

async function member(userId: string) {
  const { admin, assertActiveMember } = await import("./director.server");
  await assertActiveMember(userId);
  return admin();
}

/** Reasoning availability — never returns the key itself. */
export const getReasoningHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await member(context.userId);
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

const storyboardInput = z.object({
  planId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
});

/** Materialises an approved plan into a durable storyboard. No generation is submitted. */
export const createStoryboardFromPlan = createServerFn({ method: "POST" })
  .inputValidator((d) => storyboardInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await member(context.userId);
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
    const supabaseAdmin = await member(context.userId);
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
