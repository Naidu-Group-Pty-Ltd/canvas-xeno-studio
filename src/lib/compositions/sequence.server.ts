/**
 * Edits with motion graphics in them. A composition clip plays its drawing in
 * the Editor; the edit's render uses its final drawing, at the edit's own
 * frame and rate, from its lossless master (so its frames are encoded once,
 * in the render's own final pass). Before an edit renders, each composition
 * clip's final drawing is found (drawn before: reused) or started (ahead of
 * any draft), and the render waits for them, recorded but not yet sent; the
 * moment the last is drawn it is sent (the handover's I2: the final starts as
 * soon as its pieces are final). Word from the drawings keeps the waiting
 * render looking alive, and a drawing that fails fails it, plainly.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { frameSize, type Timeline } from "../edit/timeline";
import { startCompositionRender } from "./render.server";
import { specKey } from "./spec";

export interface EditCompositions {
  /** Each file a composition clip plays, with the render of its final drawing. */
  files: { asset_id: string; render_id: string }[];
  /** The final lossless masters ("bucket/path") drawn so far, by the file the clip plays: the render reads these instead. */
  masters: Record<string, string>;
  /** Every composition render the edit uses. */
  renders: string[];
  /** Those not drawn yet. */
  pending: string[];
}

/** The edit's composition clips, each drawn (or started) at final quality for the edit's frame. */
export async function compositionsFor(
  timeline: Timeline,
  userId: string,
  projectId: string | null,
): Promise<EditCompositions | null> {
  const clips = timeline.clips.filter((clip) => clip.kind === "video" && clip.composition);
  if (!clips.length) return null;
  const { width, height } = frameSize(timeline.aspectRatio, timeline.resolution);
  // One file stands for one composition: two clips playing the same drawing with
  // different settings would need two masters for one file.
  const byFile = new Map<string, NonNullable<(typeof clips)[number]["composition"]>>();
  for (const clip of clips) {
    const composition = clip.composition!;
    const seen = byFile.get(clip.assetId);
    if (
      seen &&
      specKey(seen.spec, seen.brandKitId) !== specKey(composition.spec, composition.brandKitId)
    )
      throw new AppError(
        "INVALID_PARAMETERS",
        `Two "${clip.label ?? "motion graphic"}" clips play the same drawing with different settings. Draw the changed one again in the Inspector, then render.`,
      );
    byFile.set(clip.assetId, composition);
  }
  const result: EditCompositions = { files: [], masters: {}, renders: [], pending: [] };
  for (const [assetId, composition] of byFile) {
    const view = await startCompositionRender({
      userId,
      projectId,
      spec: composition.spec,
      brandKitId: composition.brandKitId,
      quality: "final",
      width,
      height,
      fps: timeline.fps,
    });
    if (view.status === "failed")
      throw new AppError(
        "INVALID_PARAMETERS",
        `A motion graphic couldn't be drawn: ${view.errorMessage ?? "the media service failed"}`,
      );
    result.renders.push(view.renderId);
    result.files.push({ asset_id: assetId, render_id: view.renderId });
    if (view.status === "completed") {
      const master = await masterOf(view.renderId);
      if (!master)
        throw new AppError("UNKNOWN", "A motion graphic's master couldn't be found. Try again.");
      result.masters[assetId] = master;
    } else result.pending.push(view.renderId);
  }
  return result;
}

async function masterOf(renderId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("composition_renders" as never)
    .select("master_bucket,master_path,status")
    .eq("id", renderId)
    .maybeSingle();
  const row = data as {
    master_bucket: string | null;
    master_path: string | null;
    status: string;
  } | null;
  return row?.status === "completed" && row.master_bucket && row.master_path
    ? `${row.master_bucket}/${row.master_path}`
    : null;
}

/** The master to sign for one of a render's sources, if it stands for a composition. */
export function masterFor(
  masters: Record<string, unknown> | undefined,
  assetId: string,
): { bucket: string; path: string } | null {
  const value = masters?.[assetId];
  if (typeof value !== "string") return null;
  const slash = value.indexOf("/");
  return slash > 0 ? { bucket: value.slice(0, slash), path: value.slice(slash + 1) } : null;
}

/**
 * Whether an edit render's motion graphics are all drawn, from what its task
 * recorded: "waiting" while any is drawing, or the masters to read (recorded
 * on the task too, so the worker's check-ins re-sign them). A failed drawing
 * is thrown, to fail the render.
 */
export async function compositionsReady(
  taskId: string,
  inputPayload: unknown,
): Promise<"waiting" | { masters: Record<string, string> }> {
  const input = (inputPayload ?? {}) as Record<string, unknown>;
  const files = (
    Array.isArray(input["composition_files"]) ? input["composition_files"] : []
  ).flatMap((entry) => {
    const file = (entry ?? {}) as Record<string, unknown>;
    return typeof file["asset_id"] === "string" && typeof file["render_id"] === "string"
      ? [{ assetId: file["asset_id"], renderId: file["render_id"] }]
      : [];
  });
  const renders = [...new Set(files.map((file) => file.renderId))];
  if (!renders.length) return { masters: {} };
  const { data } = await supabaseAdmin
    .from("composition_renders" as never)
    .select("id,status,error_message,master_bucket,master_path,proxy_asset_id")
    .in("id", renders);
  const rows = (data ?? []) as {
    id: string;
    status: string;
    error_message: string | null;
    master_bucket: string | null;
    master_path: string | null;
  }[];
  const failed = rows.find((row) => row.status === "failed");
  if (failed)
    throw new AppError(
      "INVALID_PARAMETERS",
      `A motion graphic couldn't be drawn: ${failed.error_message ?? "the media service failed"}`,
    );
  if (rows.length < renders.length || rows.some((row) => row.status !== "completed"))
    return "waiting";
  // The files the clips play, each to its render's master.
  const masters: Record<string, string> = {};
  for (const file of files) {
    const row = rows.find((entry) => entry.id === file.renderId);
    if (row?.master_bucket && row.master_path)
      masters[file.assetId] = `${row.master_bucket}/${row.master_path}`;
  }
  await supabaseAdmin
    .from("media_tasks")
    .update({ input_payload: { ...input, composition_masters: masters } as never })
    .eq("id", taskId);
  return { masters };
}

/** Edit renders still waiting to be sent that use a composition render. */
async function waitingEditTasks(
  renderId: string,
): Promise<{ id: string; input_payload: unknown }[]> {
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select("id,input_payload")
    .eq("task_type", "render_sequence")
    .eq("status", "submitting")
    .contains("input_payload", { composition_renders: [renderId] });
  return (data ?? []) as { id: string; input_payload: unknown }[];
}

/** Word from a drawing: the edit renders waiting on it say how far it is, and stay alive. */
export async function compositionProgress(renderId: string): Promise<void> {
  for (const task of await waitingEditTasks(renderId)) {
    const input = (task.input_payload ?? {}) as Record<string, unknown>;
    const renders = (input["composition_renders"] as string[]) ?? [];
    const { data } = await supabaseAdmin
      .from("composition_renders" as never)
      .select("status")
      .in("id", renders);
    const drawn = ((data ?? []) as { status: string }[]).filter(
      (row) => row.status === "completed",
    ).length;
    await supabaseAdmin
      .from("sequence_renders")
      .update({ stage: `Drawing motion graphics (${drawn} of ${renders.length} done)` } as never)
      .eq("media_task_id", task.id)
      .eq("status", "queued");
  }
}

/**
 * A drawing finished or failed: each edit render waiting on it is sent once
 * all its drawings are in, or failed if one failed.
 */
export async function compositionSettled(renderId: string): Promise<void> {
  for (const task of await waitingEditTasks(renderId)) {
    const { data: render } = await supabaseAdmin
      .from("sequence_renders")
      .select("id")
      .eq("media_task_id", task.id)
      .eq("status", "queued")
      .maybeSingle();
    if (!render) continue;
    try {
      const ready = await compositionsReady(task.id, task.input_payload);
      if (ready === "waiting") {
        await compositionProgress(renderId);
        continue;
      }
      const { sendWaitingRender } = await import("../edit/render.server");
      await sendWaitingRender(render.id);
    } catch (problem) {
      await supabaseAdmin.rpc(
        "fail_sequence_render" as never,
        {
          p_render_id: render.id,
          p_error_code: "COMPOSITION_FAILED",
          p_error_message:
            problem instanceof Error
              ? problem.message.slice(0, 500)
              : "A motion graphic couldn't be drawn",
        } as never,
      );
    }
  }
}
