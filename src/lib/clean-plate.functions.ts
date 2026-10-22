import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BILLED_STEPS, LETTERS, PLATE_ENDS, PLATE_LIMITS, WORKER_STEPS } from "./media/clean-plate";
import { MAX_BOXES } from "./media/text-boxes";

/**
 * The clean-plate recipe (see ./media/clean-plate): a logo moved by a video
 * model without the model drawing a letter. Each step's result is kept in the
 * library; the billed ones pass the usual spending checks.
 */

const share = z.number().min(0).max(1);
const box = z.object({ x: share, y: share, w: share, h: share });
const lettering = box.extend({ assetId: z.string().uuid() });
const recipeId = z.string().uuid();

const startInput = z.object({
  artAssetId: z.string().uuid(),
  lettering: lettering.partial({ x: true, y: true, w: true, h: true }).nullable().default(null),
  boxes: z.array(box).max(MAX_BOXES).nullable().default(null),
  letters: z.enum(LETTERS).optional(),
  projectId: z.string().uuid().nullable().optional(),
  clientRequestId: z.string().min(8).max(64),
});

/** Starts a recipe for a picture, its mask proposed (the AI reads where the lettering is). */
export const startCleanPlate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(async ({ data, context }) => {
    const { startCleanPlate: start } = await import("./media/clean-plate.server");
    const { clientRequestId, ...rest } = data;
    return start({
      ...rest,
      userId: context.userId,
      dedupeKey: `clean-plate:${context.userId}:${clientRequestId}`,
    });
  });

export const getCleanPlate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ recipeId }).parse(data))
  .handler(async ({ data, context }) => {
    const { getCleanPlate: read } = await import("./media/clean-plate.server");
    return read(data.recipeId, context.userId);
  });

/** The recipes made from a picture, newest first. */
export const listCleanPlates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ artAssetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { cleanPlatesFor } = await import("./media/clean-plate.server");
    return cleanPlatesFor(data.artAssetId, context.userId);
  });

const maskInput = z.object({
  recipeId,
  boxes: z.array(box).max(MAX_BOXES).optional(),
  lettering: lettering.nullable().optional(),
  grow: z.number().min(0).max(PLATE_LIMITS.grow).optional(),
  feather: z.number().min(0).max(PLATE_LIMITS.feather).optional(),
  letters: z.enum(LETTERS).optional(),
});

/** Uses the mask (changed or as proposed): it is drawn, and all it made is made again. */
export const setCleanPlateMask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => maskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { setCleanPlateMask: set } = await import("./media/clean-plate.server");
    const { recipeId: id, ...change } = data;
    return set(id, context.userId, change);
  });

const stepInput = z.object({
  recipeId,
  step: z.enum(BILLED_STEPS),
  modelId: z.string().uuid(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  end: z.enum(PLATE_ENDS).optional(),
  crossSeconds: z.number().min(0).max(PLATE_LIMITS.cross).optional(),
  holdSeconds: z.number().min(0).max(PLATE_LIMITS.hold).optional(),
});

/** The provider's price for the edit or the take, as it would be sent. Nothing is billed. */
export const estimateCleanPlateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => stepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { estimateCleanPlateStep: estimate } = await import("./media/clean-plate.server");
    const { recipeId: id, step, ...request } = data;
    return estimate(id, context.userId, step, request);
  });

/** Makes the edit or the take: a generation through the normal path and its spending checks. */
export const queueCleanPlateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    stepInput
      .extend({ estimatedCostUsd: z.number().min(0).max(10_000).nullable().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { queueCleanPlateStep: queue } = await import("./media/clean-plate.server");
    const { recipeId: id, step, ...request } = data;
    return queue(id, context.userId, step, request);
  });

/** Tries a failed worker step again (the mask, the blend, the alignment or the lettering). */
export const retryCleanPlateStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ recipeId, step: z.enum(WORKER_STEPS) }).parse(data))
  .handler(async ({ data, context }) => {
    const { retryCleanPlateStep: retry } = await import("./media/clean-plate.server");
    return retry(data.recipeId, context.userId, data.step);
  });
