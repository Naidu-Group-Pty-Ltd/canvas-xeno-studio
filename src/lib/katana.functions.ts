import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { KATANA_CHARACTERS_MAX } from "./katana/cast";

/**
 * Katana: Higgsfield's video workflow, run from the studio. Members read runs
 * straight from the database; starting, steering and stopping them comes
 * through here, checked on the server. Connecting the team's Higgsfield
 * account is for admins.
 */

async function member(userId: string): Promise<{ role: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role };
}

async function admin(userId: string): Promise<void> {
  const { role } = await member(userId);
  if (role !== "admin")
    throw new AppError("NOT_AUTHORIZED", "Only an admin can change the Higgsfield connection");
}

/** A run is steered by the person who started it, or an admin. */
async function owner(userId: string, runId: string): Promise<void> {
  const { role } = await member(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("katana_runs")
    .select("created_by")
    .eq("id", runId)
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That Katana run doesn't exist");
  if (data.created_by !== userId && role !== "admin") {
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who started this run, or an admin, can change it",
    );
  }
}

const service = () => import("./katana/service.server");

const runId = z.string().uuid();
const fileInput = z.object({
  assetId: z.string().uuid(),
  field: z.string().regex(/^media\.[a-z][a-z0-9_]{0,63}$/),
});

export const getKatanaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await member(context.userId);
    const { anthropicConfigured, webhooksConfigured, katanaAgentOptions } =
      await import("./katana/agent.server");
    const { higgsfieldConnectionStatus } = await import("./katana/connection.server");
    const { appBaseUrl } = await import("./generation-pipeline.server");
    const { katanaSettings } = await service();
    const [connection, settings, agent] = await Promise.all([
      higgsfieldConnectionStatus(),
      katanaSettings(),
      katanaAgentOptions(),
    ]);
    return {
      anthropicConfigured: anthropicConfigured(),
      webhooksConfigured: webhooksConfigured(),
      webhookUrl: `${appBaseUrl()}/api/public/katana-webhook`,
      connection,
      settings,
      agent,
    };
  });

export const connectHiggsfield = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ origin: z.string().max(300).nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await admin(context.userId);
    const { beginHiggsfieldConnect } = await import("./katana/connection.server");
    return beginHiggsfieldConnect({ userId: context.userId, origin: data.origin });
  });

export const disconnectHiggsfield = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admin(context.userId);
    const { disconnectHiggsfield: disconnect } = await import("./katana/connection.server");
    await disconnect();
    return { ok: true };
  });

export const checkHiggsfieldConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await member(context.userId);
    return (await service()).testHiggsfieldConnection();
  });

export const listKatanaPresets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        cursor: z.string().max(2048).nullable().default(null),
        category: z
          .enum(["personalized_edits", "style_transfer", "motion_transfer"])
          .nullable()
          .default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await member(context.userId);
    return (await service()).listKatanaPresets(data);
  });

export const getKatanaPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(128),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await member(context.userId);
    return (await service()).katanaPresetDetails(data.slug);
  });

export const startKatana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        mode: z.enum(["remix", "preset", "edit"]),
        presetSlug: z.string().max(140).nullable().default(null),
        presetName: z.string().max(200).nullable().default(null),
        title: z.string().max(120).default(""),
        brief: z.string().max(4000).default(""),
        referenceUrl: z.string().max(2048).nullable().default(null),
        inputs: z.array(fileInput).max(16).default([]),
        characterIds: z.array(z.string().uuid()).max(KATANA_CHARACTERS_MAX).default([]),
        creditLimit: z.number().positive().max(100_000),
        claudeBudgetUsd: z.number().min(1).max(1000),
        projectId: z.string().uuid().nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await member(context.userId);
    return (await service()).startKatanaRun({ userId: context.userId, ...data });
  });

export const reviseKatana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId,
        text: z.string().min(1).max(4000),
        assets: z.array(fileInput).max(10).default([]),
        creditLimit: z.number().positive().max(100_000),
        claudeBudgetUsd: z.number().min(1).max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await owner(context.userId, data.runId);
    return (await service()).startKatanaRevision({
      userId: context.userId,
      assetIds: data.assets,
      ...data,
    });
  });

/** Reads what happened in a run's session (the run's page calls this every few seconds). */
export const pollKatanaRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId }).parse(data))
  .handler(async ({ data, context }) => {
    await member(context.userId);
    await (await service()).syncKatanaRun(data.runId);
    return { ok: true };
  });

export const followUpKatana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId,
        text: z.string().min(1).max(4000),
        assets: z.array(fileInput).max(10).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await owner(context.userId, data.runId);
    await (await service()).sendKatanaFollowUp({ userId: context.userId, ...data });
    return { ok: true };
  });

export const cancelKatana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId }).parse(data))
  .handler(async ({ data, context }) => {
    await owner(context.userId, data.runId);
    await (await service()).cancelKatanaRun({ userId: context.userId, runId: data.runId });
    return { ok: true };
  });

export const setKatanaLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId,
        creditLimit: z.number().positive().max(100_000).nullable().default(null),
        claudeBudgetUsd: z.number().min(1).max(1000).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await owner(context.userId, data.runId);
    await (await service()).updateKatanaLimits(data);
    return { ok: true };
  });

export const retryKatanaResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ resultId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await member(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // A save that ran out of tries gets a fresh set.
    await supabaseAdmin
      .from("katana_results")
      .update({ attempts: 0 })
      .eq("id", data.resultId)
      .eq("status", "failed");
    await (await service()).saveKatanaResult(data.resultId);
    return { ok: true };
  });
