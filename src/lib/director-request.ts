/**
 * Asking the Director for a production plan, or a revision of one, as the
 * page asks and hears back (see ./director-stream.server). Shared by the
 * server, the browser and tests.
 */
import { z } from "zod";
import { CHANNELS } from "./brand/dna";
import type { ProductionPlan } from "./production-plan-schema";

export const directorPlanInput = z.object({
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
export type DirectorPlanInput = z.infer<typeof directorPlanInput>;

export const directorReviseInput = z.object({
  planId: z.string().uuid(),
  instruction: z.string().min(2).max(4000),
});
export type DirectorReviseInput = z.infer<typeof directorReviseInput>;

export const directorRequest = z.discriminatedUnion("action", [
  directorPlanInput.extend({ action: z.literal("plan") }),
  directorReviseInput.extend({ action: z.literal("revise") }),
]);
export type DirectorRequest = z.input<typeof directorRequest>;

/** A plan as made or revised, and where it is kept. */
export interface DirectorPlanResult {
  sessionId: string | null;
  planId: string;
  version: number;
  plan: ProductionPlan;
}

export type DirectorEvent =
  ({ type: "plan" } & DirectorPlanResult) | { type: "error"; error: string };
