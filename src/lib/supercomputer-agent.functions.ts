import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  AUTO_APPROVE_CAP_USD,
  threadSettingsOf,
} from "./supercomputer/agent-settings";

/**
 * The Supercomputer agent's controls (its turns stream from
 * /api/public/supercomputer-agent): whether it can run, stopping a turn, a
 * conversation's settings, and the memories it keeps.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activeMember(userId: string): Promise<{ role: string }> {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role };
}

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /column .* does not exist|could not find the|does not exist/i.test(error.message ?? ""));

/** Whether the agent can run: Claude's key is set and the database has its columns (migration 0022). */
export const getAgentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await activeMember(context.userId);
    const db = await admin();
    const [threads, memories] = await Promise.all([
      db.from("supercomputer_threads").select("id,settings,pinned").limit(1),
      db.from("supercomputer_memories").select("id").limit(1),
    ]);
    const { sectionsReady } = await import("./supercomputer/sections.server");
    return {
      configured: !!process.env["ANTHROPIC_API_KEY"]?.trim(),
      tablesReady: !isMissingColumn(threads.error) && !isMissingColumn(memories.error),
      /** Working in sections (migration 0036). */
      sectionsReady: await sectionsReady().catch(() => false),
    };
  });

async function ownThread(threadId: string, userId: string) {
  const { role } = await activeMember(userId);
  const db = await admin();
  const { data } = await db
    .from("supercomputer_threads")
    .select("id,created_by,settings")
    .eq("id", threadId)
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That conversation no longer exists");
  if (data.created_by !== userId && role !== "admin")
    throw new AppError("NOT_AUTHORIZED", "That conversation is someone else's");
  return data;
}

/** Stops an answer that is still being written (its page may be gone; this marks it stopped). */
export const stopAgentTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ messageId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: message } = await db
      .from("supercomputer_messages")
      .select("id,thread_id,status")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!message) throw new AppError("INVALID_PARAMETERS", "That answer no longer exists");
    await ownThread(message.thread_id, context.userId);
    await db
      .from("supercomputer_messages")
      .update({ status: "stopped" })
      .eq("id", data.messageId)
      .eq("status", "streaming");
    return { ok: true };
  });

/** Changes how a conversation's agent runs: its model, effort, spending without asking, brand. */
export const saveAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        settings: z
          .object({
            model: z.enum(AGENT_MODELS.map((model) => model.id) as [string, ...string[]]),
            effort: z.enum(AGENT_EFFORTS),
            autoApproveUsd: z.number().min(0).max(AUTO_APPROVE_CAP_USD),
            brandKitId: z.string().uuid().nullable(),
          })
          .partial(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const thread = await ownThread(data.threadId, context.userId);
    const settings = threadSettingsOf({
      ...((thread.settings ?? {}) as Record<string, unknown>),
      ...data.settings,
    });
    const db = await admin();
    const { error } = await db
      .from("supercomputer_threads")
      .update({ settings: settings as never })
      .eq("id", data.threadId);
    if (error) throw new AppError("UNKNOWN", error.message);
    return settings;
  });

/** Keeps a memory by hand (the agent keeps its own with its remember tool). */
export const addAgentMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        content: z.string().trim().min(3).max(600),
        scope: z.enum(["personal", "team"]).default("personal"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const db = await admin();
    const { data: row, error } = await db
      .from("supercomputer_memories")
      .insert({ content: data.content, scope: data.scope, created_by: context.userId })
      .select("id")
      .single();
    if (error || !row) throw new AppError("UNKNOWN", error?.message ?? "It couldn't be kept");
    return { id: row.id };
  });

/** Forgets a memory: one's own, or a team memory (its maker or an admin). */
export const deleteAgentMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { role } = await activeMember(context.userId);
    const db = await admin();
    const { data: memory } = await db
      .from("supercomputer_memories")
      .select("id,created_by,scope")
      .eq("id", data.id)
      .maybeSingle();
    if (!memory) return { ok: true };
    if (memory.created_by !== context.userId && role !== "admin")
      throw new AppError(
        "NOT_AUTHORIZED",
        "Only whoever kept that memory, or an admin, can forget it",
      );
    await db.from("supercomputer_memories").delete().eq("id", data.id);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/** A plan in sections, if it belongs to a conversation of this person's (or they are an admin). */
async function ownPlan(planId: string, userId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("supercomputer_section_plans")
    .select("id,thread_id")
    .eq("id", planId)
    .maybeSingle();
  if (isMissingColumn(error)) {
    const { NEEDS_SECTIONS } = await import("./supercomputer/sections.server");
    throw new AppError("INVALID_PARAMETERS", NEEDS_SECTIONS);
  }
  if (!data) throw new AppError("INVALID_PARAMETERS", "That plan no longer exists");
  await ownThread(data.thread_id, userId);
  return data;
}

/**
 * Queues a plan's sections for their workers (all not done, or those at
 * `positions`): the page runs them one after another. A note goes into each
 * one's next brief.
 */
export const queueAgentSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        positions: z.array(z.number().int().min(0).max(100)).max(100).optional(),
        note: z.string().trim().max(1200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await ownPlan(data.planId, context.userId);
    const { queueSections } = await import("./supercomputer/sections.server");
    await queueSections({
      planId: data.planId,
      positions: data.positions ?? null,
      note: data.note ?? null,
    });
    return { ok: true };
  });

/** Takes a plan's queued sections back, so none starts after the one working now. */
export const holdAgentSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ planId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ownPlan(data.planId, context.userId);
    const { holdSections } = await import("./supercomputer/sections.server");
    await holdSections(data.planId);
    return { ok: true };
  });

/**
 * Puts a join right: a smart blend or colour match on the integration edit,
 * or the section on one side queued to make its shot again.
 */
export const fixAgentJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        position: z.number().int().min(0).max(100),
        fix: z.enum(["smart_blend", "colour_match", "redo_after", "redo_before"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await ownPlan(data.planId, context.userId);
    const { fixJoin } = await import("./supercomputer/sections.server");
    const { done } = await fixJoin({ planId: data.planId, position: data.position, fix: data.fix });
    return { done };
  });
