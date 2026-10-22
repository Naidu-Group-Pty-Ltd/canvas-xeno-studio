import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { DEFAULT_RETAKE_ALLOWANCE, STAGE_LIMITS } from "./stage-check";

/**
 * What generations cost, and the check before several are queued at once.
 * An admin sets a model's list price here; spend is read in the browser
 * (migration 0028's functions run as the reader).
 */

async function activeMember(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

/** An admin sets a model's list price (or removes it), optionally pricing its runs already unpriced. */
export const setModelListPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        modelId: z.string().uuid(),
        price: z
          .object({
            unit: z.enum(["image", "request", "second"]),
            usd: z.number().positive().max(1000),
            note: z.string().trim().max(500).nullable().default(null),
          })
          .nullable(),
        priceEarlierRuns: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setModelListPrice: run } = await import("./generation-costs.server");
    return run({ ...data, userId: context.userId });
  });

/**
 * Several generations about to be queued at once (priced in the browser, as
 * Create's batch, the Supercomputer's "Generate all" and the Director's plan
 * price them), checked whole against the Higgsfield API balance and the
 * spending limit that applies, with an allowance for retakes (see
 * ./stage-check). Nothing is queued here.
 */
export const checkGenerationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(120),
              usd: z.number().min(0).max(10_000).nullable(),
              takes: z.number().int().min(1).max(STAGE_LIMITS.takes).default(1),
              problem: z.string().max(300).nullable().default(null),
            }),
          )
          .min(1)
          .max(200),
        retakeAllowance: z
          .number()
          .min(0)
          .max(STAGE_LIMITS.allowance)
          .default(DEFAULT_RETAKE_ALLOWANCE),
        projectId: z.string().uuid().nullable().default(null),
        campaignId: z.string().uuid().nullable().default(null),
        allowUnpriced: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const { stageTotals } = await import("./stage-check");
    const { checkStage } = await import("./stage.server");
    return checkStage({
      userId: context.userId,
      projectId: data.projectId,
      campaignId: data.campaignId,
      totals: stageTotals(data.items, data.retakeAllowance),
      allowUnpriced: data.allowUnpriced,
    });
  });
