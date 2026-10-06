/**
 * Records the outcome of a sequence render reported by the media worker.
 * Idempotent: the finished video is registered once (its storage path is
 * unique), and a repeated or late report cannot undo a newer state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface RenderTask {
  id: string;
  operation_id: string | null;
  project_id: string | null;
  created_by: string | null;
  input_payload: unknown;
  storage_bucket: string | null;
}

const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value ? value : fallback;
const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export async function finishSequenceRender(
  task: RenderTask,
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const input = (task.input_payload ?? {}) as Record<string, unknown>;
  const renderId = typeof input["render_id"] === "string" ? input["render_id"] : null;
  const sequenceId = typeof input["sequence_id"] === "string" ? input["sequence_id"] : null;
  const storagePaths = Array.isArray(input["storage_paths"])
    ? (input["storage_paths"] as string[])
    : [];
  const bucket = task.storage_bucket ?? "generated-assets";

  if (payload["status"] !== "completed") {
    const errorCode = text(payload["error_code"], "RENDER_FAILED");
    const errorMessage = text(payload["error_message"], "The render failed");
    await supabaseAdmin
      .from("app_settings")
      .update({ value: { at: now, message: errorMessage } as never })
      .eq("key", "media_worker_last_error");
    await supabaseAdmin
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: errorCode,
        error_message: errorMessage,
        completed_at: now,
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    if (renderId) {
      await supabaseAdmin
        .from("sequence_renders")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          completed_at: now,
        } as never)
        .eq("id", renderId)
        .in("status", ["queued", "rendering"]);
    }
    if (sequenceId && renderId) {
      await supabaseAdmin
        .from("sequences")
        .update({ status: "failed" } as never)
        .eq("id", sequenceId)
        .eq("last_render_id", renderId);
    }
    if (task.operation_id) {
      await supabaseAdmin
        .from("operations")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          failed_at: now,
        })
        .eq("id", task.operation_id);
    }
    return;
  }

  const outputs = Array.isArray(payload["outputs"])
    ? (payload["outputs"] as Record<string, unknown>[])
    : [];
  const metadata = (payload["metadata"] ?? null) as Record<string, unknown> | null;
  const video = outputs.find((output) => output["kind"] === "video") ?? outputs[0];
  const poster = outputs.find((output) => output["kind"] === "image") ?? outputs[1];
  const videoPath = text(video?.["storage_key"], storagePaths[0] ?? "");
  const posterPath = text(poster?.["storage_key"], storagePaths[1] ?? "");

  const { data: sequence } = sequenceId
    ? await supabaseAdmin
        .from("sequences")
        .select("id,title,project_id")
        .eq("id", sequenceId)
        .maybeSingle()
    : { data: null };

  let assetId: string | null = null;
  if (videoPath) {
    const findExisting = async () =>
      (
        await supabaseAdmin
          .from("assets")
          .select("id")
          .eq("storage_bucket", bucket)
          .eq("storage_path", videoPath)
          .maybeSingle()
      ).data?.id ?? null;
    assetId = await findExisting();
    if (!assetId) {
      const { data: inserted, error } = await supabaseAdmin
        .from("assets")
        .insert({
          uploaded_by: task.created_by,
          project_id: sequence?.project_id ?? task.project_id,
          asset_type: "video",
          storage_bucket: bucket,
          storage_path: videoPath,
          mime_type: "video/mp4",
          file_size: numberOrNull(video?.["bytes"]),
          width: numberOrNull(metadata?.["width"]),
          height: numberOrNull(metadata?.["height"]),
          duration_seconds: numberOrNull(metadata?.["duration_seconds"]),
          source_type: "generated",
          title: (sequence?.title ?? "Edit").slice(0, 200),
          metadata: {
            derived: true,
            media_task_id: task.id,
            task_type: "render_sequence",
            sequence_id: sequenceId,
            render_id: renderId,
            ...(posterPath ? { poster_path: posterPath } : {}),
            ...(metadata ? { probe: metadata } : {}),
          } as never,
        })
        .select("id")
        .maybeSingle();
      // A concurrent duplicate report may have registered it a moment ago.
      assetId = inserted?.id ?? (error?.code === "23505" ? await findExisting() : null);
      if (!assetId)
        console.error("render output not registered", { taskId: task.id, message: error?.message });
    }
  }

  await supabaseAdmin
    .from("media_tasks")
    .update({
      status: "completed",
      completed_at: now,
      result_asset_id: assetId,
      output_payload: {
        asset_ids: assetId ? [assetId] : [],
        metadata,
        duration_ms: payload["duration_ms"] ?? null,
      } as never,
    })
    .eq("id", task.id)
    .in("status", ["submitting", "processing"]);

  if (renderId) {
    await supabaseAdmin
      .from("sequence_renders")
      .update({
        status: assetId ? "completed" : "failed",
        progress: assetId ? 1 : 0,
        stage: assetId ? "Done" : null,
        asset_id: assetId,
        duration_seconds: numberOrNull(metadata?.["duration_seconds"]),
        completed_at: now,
        ...(assetId
          ? {}
          : {
              error_code: "STORAGE_FAILED",
              error_message: "The rendered video could not be added to the library",
            }),
      } as never)
      .eq("id", renderId)
      .in("status", ["queued", "rendering"]);
  }
  if (sequenceId && renderId) {
    await supabaseAdmin
      .from("sequences")
      .update({ status: assetId ? "rendered" : "failed" } as never)
      .eq("id", sequenceId)
      .eq("last_render_id", renderId);
  }

  await supabaseAdmin
    .from("app_settings")
    .update({ value: now as never })
    .eq("key", "media_worker_last_success_at");
  if (task.operation_id) {
    await supabaseAdmin
      .from("operations")
      .update({
        status: "completed",
        completed_at: now,
        output_payload: { asset_ids: assetId ? [assetId] : [], metadata } as never,
      })
      .eq("id", task.operation_id);
    await supabaseAdmin.from("operation_events").insert({
      operation_id: task.operation_id,
      event_type: "completed",
      payload: { asset_ids: assetId ? [assetId] : [], task_type: "render_sequence" } as never,
    } as never);
  }
}
