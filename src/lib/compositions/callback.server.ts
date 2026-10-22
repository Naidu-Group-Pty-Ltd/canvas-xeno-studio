/**
 * What the media worker reports about a composition's tasks: a stretch drawn
 * (the render is joined once every stretch is in), the whole composition or
 * its join done (its playable copy joins the library, its master is kept for
 * the edits that use it), progress, and failures. Each report is recorded
 * idempotently: a repeat changes nothing. Edit renders waiting on the
 * composition are moved on (./sequence.server).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { failRender, joinIfReady } from "./render.server";
import { templateById } from "./templates";

type Json = Record<string, unknown>;

interface CompositionTask {
  id: string;
  status: string;
  project_id: string | null;
  created_by: string | null;
  input_payload: unknown;
  storage_bucket: string | null;
}

/** Whether a media task is one of a composition's. */
export function isCompositionTask(taskType: string): boolean {
  return taskType === "render_composition" || taskType === "join_stretches";
}

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Records a report. Returns false when something couldn't be recorded, so
 * the route answers 503 and the worker reports again.
 */
export async function recordCompositionReport(
  task: CompositionTask,
  payload: Json,
): Promise<boolean> {
  const input = (task.input_payload ?? {}) as Json;
  const step = input["composition_step"];
  const renderId =
    typeof input["composition_render_id"] === "string" ? input["composition_render_id"] : null;
  const stretchId =
    typeof input["composition_stretch_id"] === "string" ? input["composition_stretch_id"] : null;
  const status = payload["status"];

  if (status !== "completed" && status !== "failed") {
    // Word from the worker (progress or a heartbeat): the task isn't lost, and
    // neither are the edit renders waiting on it.
    const progress = number(payload["progress"]);
    const stage = typeof payload["stage"] === "string" ? payload["stage"].slice(0, 80) : null;
    await supabaseAdmin
      .from("media_tasks")
      .update({ updated_at: new Date().toISOString() } as never)
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    if (step === "stretch" && stretchId) {
      if (progress !== null)
        await supabaseAdmin
          .from("composition_stretches" as never)
          .update({ progress: Math.min(0.99, progress) } as never)
          .eq("id", stretchId)
          .eq("status", "drawing");
      const { data: renders } = await supabaseAdmin
        .from("composition_renders" as never)
        .select("id")
        .eq("status", "drawing")
        .contains("stretches", [{ stretch_id: stretchId }]);
      for (const render of (renders ?? []) as { id: string }[]) await joinIfReady(render.id);
    } else if (renderId) {
      const share = step === "join" ? 0.9 + 0.1 * (progress ?? 0) : (progress ?? 0);
      await supabaseAdmin
        .from("composition_renders" as never)
        .update({ progress: Math.min(0.99, share), ...(stage ? { stage } : {}) } as never)
        .eq("id", renderId)
        .in("status", ["queued", "drawing", "joining"]);
    }
    if (renderId) {
      const { compositionProgress } = await import("./sequence.server");
      await compositionProgress(renderId);
    }
    return true;
  }

  const now = new Date().toISOString();
  const outputs = Array.isArray(payload["outputs"]) ? (payload["outputs"] as Json[]) : [];
  const metadata = (payload["metadata"] ?? {}) as Json;
  const measured = (metadata["composition"] ?? {}) as Json;
  const paths = Array.isArray(input["storage_paths"]) ? (input["storage_paths"] as string[]) : [];
  const bucket = task.storage_bucket ?? "generated-assets";
  const keyOf = (index: number) =>
    (typeof outputs[index]?.["storage_key"] === "string"
      ? (outputs[index]!["storage_key"] as string)
      : paths[index]) ?? null;

  const finishTask = async (state: "completed" | "failed") => {
    const { error } = await supabaseAdmin
      .from("media_tasks")
      .update({
        status: state,
        completed_at: now,
        ...(state === "failed"
          ? {
              error_code:
                typeof payload["error_code"] === "string"
                  ? payload["error_code"]
                  : "COMPOSITION_FAILED",
              error_message:
                typeof payload["error_message"] === "string"
                  ? payload["error_message"]
                  : "The motion graphic failed",
            }
          : { output_payload: { metadata, duration_ms: payload["duration_ms"] ?? null } as never }),
      })
      .eq("id", task.id);
    return !error;
  };

  if (status === "failed") {
    const message =
      typeof payload["error_message"] === "string"
        ? payload["error_message"]
        : "The motion graphic couldn't be drawn";
    if (step === "stretch" && stretchId) {
      await supabaseAdmin
        .from("composition_stretches" as never)
        .update({
          status: "failed",
          error_code: payload["error_code"] ?? "COMPOSITION_FAILED",
          error_message: message,
        } as never)
        .eq("id", stretchId)
        .neq("status", "completed");
      const { data: renders } = await supabaseAdmin
        .from("composition_renders" as never)
        .select("id")
        .in("status", ["drawing"])
        .contains("stretches", [{ stretch_id: stretchId }]);
      for (const render of (renders ?? []) as { id: string }[]) await joinIfReady(render.id);
    } else if (renderId) {
      await failRender(
        renderId,
        typeof payload["error_code"] === "string" ? payload["error_code"] : "COMPOSITION_FAILED",
        message,
      );
    }
    return finishTask("failed");
  }

  if (step === "stretch" && stretchId) {
    const master = keyOf(0);
    if (!master) return false;
    const { error } = await supabaseAdmin
      .from("composition_stretches" as never)
      .update({
        status: "completed",
        progress: 1,
        master_bucket: bucket,
        master_path: master,
        seconds_per_drawing: number(measured["seconds_per_drawing"]),
        completed_at: now,
        error_code: null,
        error_message: null,
      } as never)
      .eq("id", stretchId);
    if (error) return false;
    if (!(await finishTask("completed"))) return false;
    const { data: renders } = await supabaseAdmin
      .from("composition_renders" as never)
      .select("id")
      .eq("status", "drawing")
      .contains("stretches", [{ stretch_id: stretchId }]);
    for (const render of (renders ?? []) as { id: string }[]) await joinIfReady(render.id);
    return true;
  }

  if (!renderId) return finishTask("completed");
  const { data: renderData } = await supabaseAdmin
    .from("composition_renders" as never)
    .select("id,status,template,quality,hash,stretches,proxy_asset_id")
    .eq("id", renderId)
    .maybeSingle();
  const render = renderData as {
    id: string;
    status: string;
    template: string;
    quality: string;
    hash: string;
    stretches: { stretch_id: string }[];
    proxy_asset_id: string | null;
  } | null;
  if (!render) return finishTask("completed");
  // Outputs, in order: the playable copy, the lossless master, the poster.
  const [proxy, master, poster] = [keyOf(0), keyOf(1), keyOf(2)];
  if (!proxy || !master) return false;
  let assetId = render.proxy_asset_id;
  if (!assetId) {
    const { data: existing } = await supabaseAdmin
      .from("assets")
      .select("id")
      .eq("storage_bucket", bucket)
      .eq("storage_path", proxy)
      .maybeSingle();
    assetId = existing?.id ?? null;
  }
  if (!assetId) {
    const template = templateById(render.template);
    const { data: inserted, error } = await supabaseAdmin
      .from("assets")
      .insert({
        uploaded_by: task.created_by,
        project_id: task.project_id,
        asset_type: "video",
        source_type: "generated",
        title: `Motion · ${template?.title ?? render.template}${render.quality === "draft" ? " (draft)" : ""}`,
        storage_bucket: bucket,
        storage_path: proxy,
        mime_type: "video/mp4",
        file_size: number(outputs[0]?.["bytes"]),
        width: number(metadata["width"]),
        height: number(metadata["height"]),
        duration_seconds: number(metadata["duration_seconds"]),
        metadata: {
          composition: {
            render_id: render.id,
            template: render.template,
            quality: render.quality,
            hash: render.hash,
          },
          ...(poster ? { poster_path: poster } : {}),
          ...(number(metadata["fps"]) !== null ? { fps: number(metadata["fps"]) } : {}),
          probe: metadata,
        } as never,
      })
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("assets")
        .select("id")
        .eq("storage_bucket", bucket)
        .eq("storage_path", proxy)
        .maybeSingle();
      assetId = raced?.id ?? null;
    } else if (error || !inserted) return false;
    else assetId = inserted.id;
  }
  if (!assetId) return false;
  // What one drawing cost: this task's own measure, or for a join its stretches'.
  let secondsPerDrawing = number(measured["seconds_per_drawing"]);
  if (secondsPerDrawing === null && render.stretches?.length) {
    const { data: stretches } = await supabaseAdmin
      .from("composition_stretches" as never)
      .select("seconds_per_drawing")
      .in(
        "id",
        render.stretches.map((stretch) => stretch.stretch_id),
      );
    const values = ((stretches ?? []) as { seconds_per_drawing: number | null }[])
      .map((row) => Number(row.seconds_per_drawing))
      .filter((value) => Number.isFinite(value) && value > 0);
    secondsPerDrawing = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  const { error: renderError } = await supabaseAdmin
    .from("composition_renders" as never)
    .update({
      status: "completed",
      progress: 1,
      stage: null,
      proxy_asset_id: assetId,
      master_bucket: bucket,
      master_path: master,
      poster_path: poster,
      seconds_per_drawing: secondsPerDrawing,
      render_seconds: number(measured["seconds"]),
      completed_at: now,
      error_code: null,
      error_message: null,
    } as never)
    .eq("id", render.id);
  if (renderError) return false;
  if (!(await finishTask("completed"))) return false;
  const { compositionSettled } = await import("./sequence.server");
  await compositionSettled(render.id);
  return true;
}
