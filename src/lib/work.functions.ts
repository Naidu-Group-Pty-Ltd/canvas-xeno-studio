import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { STEP_STATUSES, WORK_STATUSES, type WorkPageData } from "./work/model";

/**
 * The Work pages (see ./work): work in progress listed and read whole, a
 * person's own notes and changes to it (as themselves, never taking its
 * hold), carrying it on in a Supercomputer conversation, letting go of a
 * hold whose session has stopped, and its files' download links.
 */

async function service() {
  return import("./work/service.server");
}

async function person(userId: string) {
  const work = await service();
  const member = await work.activeMember(userId);
  return {
    member,
    actor: {
      userId,
      kind: "person" as const,
      session: `person:${userId}`,
      label: member.name ?? "A team member",
    },
  };
}

/** Whether the database has work in progress (migration 0037), and the works, latest first. */
export const listWorkPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable().optional(),
        includeFinished: z.boolean().optional(),
        search: z.string().max(80).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const work = await service();
    await work.activeMember(context.userId);
    if (!(await work.workReady())) return { ready: false as const, works: [] };
    const works = await work.listWorks({
      projectId: data.projectId ?? null,
      includeFinished: data.includeFinished ?? false,
      search: data.search ?? null,
      limit: 100,
    });
    return { ready: true as const, works: JSON.parse(JSON.stringify(works)) as typeof works };
  });

/** A work whole: its plan, journal (latest first, before an entry's n for earlier), files, links and brief. */
export const getWorkPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        workId: z.string().uuid(),
        entries: z.number().int().min(1).max(200).optional(),
        before: z.number().int().min(1).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const work = await service();
    await work.activeMember(context.userId);
    const view = await work.loadWorkView(data.workId, {
      entries: data.entries ?? 50,
      before: data.before ?? null,
    });
    const { resumeBrief } = await import("./work/model");
    return JSON.parse(JSON.stringify({ ...view, brief: resumeBrief(view) })) as WorkPageData;
  });

/** A person's note, or their change to a work's plan, next steps, questions or status. */
export const saveWorkByPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        workId: z.string().uuid(),
        summary: z.string().max(20_000).optional(),
        nextSteps: z.array(z.string().max(2000)).max(50).optional(),
        questions: z.array(z.string().max(2000)).max(50).optional(),
        decision: z
          .object({ what: z.string().min(1).max(1000), why: z.string().max(2000) })
          .optional(),
        steps: z
          .array(
            z.object({
              key: z.string().min(1).max(80),
              title: z.string().max(300).optional(),
              status: z.enum(STEP_STATUSES).optional(),
              note: z.string().max(2000).optional(),
              remove: z.boolean().optional(),
            }),
          )
          .max(100)
          .optional(),
        status: z.enum(WORK_STATUSES).optional(),
        title: z.string().min(1).max(200).optional(),
        goal: z.string().max(20_000).optional(),
        clientRequestId: z.string().min(8).max(64),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { actor } = await person(context.userId);
    const work = await service();
    const changes = {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.goal !== undefined ? { goal: data.goal } : {}),
    };
    const onlyStatus = data.status !== undefined && !data.summary && !data.steps?.length;
    return work.saveWork(data.workId, actor, {
      kind: onlyStatus ? "status" : "note",
      summary: data.summary?.trim() || (data.status ? `Set ${data.status} by ${actor.label}.` : ""),
      ...(data.nextSteps !== undefined ? { nextSteps: data.nextSteps } : {}),
      ...(data.questions !== undefined ? { questions: data.questions } : {}),
      ...(data.decision ? { decisions: [data.decision] } : {}),
      ...(data.steps
        ? {
            stepChanges: data.steps.map((step) => ({
              key: step.key,
              ...(step.title !== undefined ? { title: step.title } : {}),
              ...(step.status !== undefined ? { status: step.status } : {}),
              ...(step.note !== undefined ? { note: step.note } : {}),
              ...(step.remove !== undefined ? { remove: step.remove } : {}),
            })),
          }
        : {}),
      ...(Object.keys(changes).length ? { changes } : {}),
      clientRequestId: data.clientRequestId,
      // A person writing a note isn't taking the work from whoever is working on it.
      hold: false,
    });
  });

/**
 * Carries a work on in the Supercomputer: a conversation made for it (in its
 * project and brand, working on it), and the words to send it first.
 */
export const continueWorkInSupercomputer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ workId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { actor } = await person(context.userId);
    const work = await service();
    const ref = await work.workRef(data.workId);
    const { threadSettingsOf } = await import("./supercomputer/agent-settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: thread, error } = await supabaseAdmin
      .from("supercomputer_threads")
      .insert({
        title: `Carry on: ${ref.title}`.slice(0, 200),
        project_id: ref.project_id,
        created_by: context.userId,
        settings: threadSettingsOf({ brandKitId: ref.brand_kit_id }) as never,
      })
      .select("id")
      .single();
    if (error || !thread) throw new AppError("UNKNOWN", "The conversation couldn't be started");
    await work.setThreadWork(thread.id, ref.id, actor);
    return {
      threadId: thread.id,
      text: `Carry on with the work “${ref.title}”. Read where it stands (its brief is in your context; get_work has its whole journal), say in a few lines what was last done and what comes next, then do the next step. Save its progress with save_work as you go.`,
    };
  });

/**
 * Lets go of a work's hold for a session that has stopped (the journal says
 * who let it go, and whose hold it was): the next session can take it up at once.
 */
export const releaseWorkHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ workId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { actor } = await person(context.userId);
    const work = await service();
    await work.claimWork(data.workId, actor, { takeOver: true, seconds: 60 });
    return work.releaseWork(
      data.workId,
      actor,
      `Let go by ${actor.label}, for the next session to take up.`,
    );
  });

/** A file's parts' download links (an hour each): one link for a file in one part. */
export const getWorkFileLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        workId: z.string().uuid(),
        path: z.string().min(1).max(500),
        version: z.number().int().min(1).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const work = await service();
    await work.activeMember(context.userId);
    const { files } = await work.workFiles(data.workId, {
      paths: [data.path],
      ...(data.version !== undefined ? { version: data.version } : {}),
      withUrls: true,
    });
    const file = files[0];
    if (!file) throw new AppError("INVALID_PARAMETERS", "That file isn't in the work");
    return JSON.parse(JSON.stringify(file)) as typeof file;
  });

/** Every version of one of a work's files. */
export const getWorkFileVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ workId: z.string().uuid(), path: z.string().min(1).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const work = await service();
    await work.activeMember(context.userId);
    const versions = await work.fileHistory(data.workId, data.path);
    return JSON.parse(JSON.stringify(versions)) as typeof versions;
  });
