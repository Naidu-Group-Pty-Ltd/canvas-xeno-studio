/**
 * Records the outcome of a sequence render reported by the media worker.
 * Idempotent: the finished video is registered once (its storage path is
 * unique), and a repeated or late report cannot undo a newer state.
 *
 * The media task is marked finished last. Until then a repeated report is
 * processed again, so a write that fails (an error is thrown, the worker gets
 * a 5xx and retries) or an interrupted callback can't leave the render
 * unfinished behind a finished task.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logOperationCompleted } from "../media/events.server";
import { isMissingColumnError } from "./errors";

interface RenderTask {
  id: string;
  operation_id: string | null;
  project_id: string | null;
  created_by: string | null;
  input_payload: unknown;
  storage_bucket: string | null;
}

/** Rows a report may still finish: open ones, or ones presumed lost that turn out alive. */
const OPEN_RENDER = "status.in.(queued,rendering),error_code.eq.STALLED";
const OPEN_TASK = "status.in.(submitting,processing),error_code.eq.STALLED";

const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value ? value : fallback;
const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * `renderLast`: the render is marked finished after everything else rather
 * than first. Recovery uses it (there is no worker to repeat a report, and its
 * task may already be finished): until every write has landed, the render
 * still looks lost, so the Render panel's next check finishes the rest.
 */
export async function finishSequenceRender(
  task: RenderTask,
  payload: Record<string, unknown>,
  options: { renderLast?: boolean } = {},
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
    // Health bookkeeping only; never a reason to retry.
    await supabaseAdmin
      .from("app_settings")
      .update({ value: { at: now, message: errorMessage } as never })
      .eq("key", "media_worker_last_error");
    if (renderId) {
      must(
        await supabaseAdmin
          .from("sequence_renders")
          .update({
            status: "failed",
            error_code: errorCode,
            error_message: errorMessage,
            completed_at: now,
          } as never)
          .eq("id", renderId)
          .or(OPEN_RENDER),
        "render",
      );
    }
    if (sequenceId && renderId) await settleEdit(sequenceId, renderId, "failed");
    if (task.operation_id) {
      must(
        await supabaseAdmin
          .from("operations")
          .update({
            status: "failed",
            error_code: errorCode,
            error_message: errorMessage,
            failed_at: now,
          })
          .eq("id", task.operation_id),
        "operation",
      );
    }
    must(
      await supabaseAdmin
        .from("media_tasks")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          completed_at: now,
        })
        .eq("id", task.id)
        .or(OPEN_TASK),
      "media task",
    );
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

  const { data: sequence, error: sequenceError } = sequenceId
    ? await supabaseAdmin
        .from("sequences")
        .select("id,title,project_id")
        .eq("id", sequenceId)
        .maybeSingle()
    : { data: null, error: null };
  must({ error: sequenceError }, "sequence lookup");
  // The stems asked for, each a library file of its own, before the video that lists them.
  const stems = await registerStems(task, { input, outputs, storagePaths, sequence, metadata });

  let assetId: string | null = null;
  if (videoPath) {
    const findExisting = async () => {
      const { data, error } = await supabaseAdmin
        .from("assets")
        .select("id")
        .eq("storage_bucket", bucket)
        .eq("storage_path", videoPath)
        .maybeSingle();
      must({ error }, "asset lookup");
      return data?.id ?? null;
    };
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
            ...(stems.length ? { stems } : {}),
            ...(Array.isArray(input["music_credits"]) && input["music_credits"].length
              ? { music_credits: input["music_credits"] }
              : {}),
            ...(Array.isArray(input["music_licences"]) && input["music_licences"].length
              ? { music_licences: input["music_licences"] }
              : {}),
          } as never,
        })
        .select("id")
        .maybeSingle();
      // A concurrent duplicate report may have registered it a moment ago.
      if (error?.code === "23505") assetId = await findExisting();
      else must({ error }, "asset");
      assetId ??= inserted?.id ?? null;
    }
  }
  // Without a file there is nothing to retry for: the render failed.
  const finished = assetId !== null;
  // A late result also clears the stall that was presumed (or records the missing file).
  const outcome = finished
    ? { error_code: null, error_message: null }
    : { error_code: "STORAGE_FAILED", error_message: "The render finished without a video file" };

  const finishRender = async () => {
    if (!renderId) return;
    must(
      await supabaseAdmin
        .from("sequence_renders")
        .update({
          status: finished ? "completed" : "failed",
          progress: finished ? 1 : 0,
          stage: finished ? "Done" : null,
          asset_id: assetId,
          duration_seconds: numberOrNull(metadata?.["duration_seconds"]),
          completed_at: now,
          ...outcome,
        } as never)
        .eq("id", renderId)
        .or(OPEN_RENDER),
      "render",
    );
  };
  if (!options.renderLast) await finishRender();
  if (finished) await recordMixReport(renderId, metadata);
  if (sequenceId && renderId)
    await settleEdit(sequenceId, renderId, finished ? "rendered" : "failed");

  if (task.operation_id) {
    const { data: changed, error } = await supabaseAdmin
      .from("operations")
      .update(
        finished
          ? {
              status: "completed",
              completed_at: now,
              failed_at: null,
              ...outcome,
              output_payload: { asset_ids: [assetId], metadata } as never,
            }
          : { status: "failed", failed_at: now, ...outcome },
      )
      .eq("id", task.operation_id)
      .neq("status", "completed")
      .select("id");
    must({ error }, "operation");
    // Logged once: a repeated report logs it only if it is still missing.
    if (finished) {
      must(
        await logOperationCompleted(task.operation_id, {
          asset_ids: assetId ? [assetId] : [],
          task_type: "render_sequence",
        }),
        "operation event",
      );
    }
  }
  await supabaseAdmin
    .from("app_settings")
    .update({ value: now as never })
    .eq("key", "media_worker_last_success_at");

  must(
    await supabaseAdmin
      .from("media_tasks")
      .update({
        status: finished ? "completed" : "failed",
        completed_at: now,
        result_asset_id: assetId,
        ...outcome,
        output_payload: {
          asset_ids: assetId ? [assetId] : [],
          metadata,
          duration_ms: payload["duration_ms"] ?? null,
        } as never,
      })
      .eq("id", task.id)
      .or(OPEN_TASK),
    "media task",
  );
  if (options.renderLast) await finishRender();
}

/**
 * The edit's status once its render has ended: "rendered" or "failed" only
 * while it is still the version that was rendered. Saved since (editing goes
 * on during a render), it is a draft again, its last render kept for download.
 */
async function settleEdit(sequenceId: string, renderId: string, status: "rendered" | "failed") {
  const { data: rendered, error } = await supabaseAdmin
    .from("sequence_renders")
    .select("sequence_version")
    .eq("id", renderId)
    .maybeSingle();
  must({ error }, "render version");
  const version = (rendered as { sequence_version?: number } | null)?.sequence_version;
  if (typeof version !== "number") return;
  must(
    await supabaseAdmin
      .from("sequences")
      .update({ status } as never)
      .eq("id", sequenceId)
      .eq("last_render_id", renderId)
      .eq("version", version),
    "sequence",
  );
  must(
    await supabaseAdmin
      .from("sequences")
      .update({ status: "draft" } as never)
      .eq("id", sequenceId)
      .eq("last_render_id", renderId)
      .neq("version", version),
    "sequence",
  );
}

const STEM_TITLES: Record<string, string> = {
  voiceover: "Voiceover stem",
  music: "Music stem",
  sfx: "Effects stem",
};

/**
 * The stems a render handed back (feature stems): its voiceover, music and
 * effects buses, after the video and poster in the order asked for. Each is
 * recorded once as library audio linked to the render (the render and its
 * bus in the file's own record; the files in the video's), so it is kept and
 * downloaded beside the video. The music stem carries the music's credits and
 * terms, as the video does.
 */
async function registerStems(
  task: RenderTask,
  context: {
    input: Record<string, unknown>;
    outputs: Record<string, unknown>[];
    storagePaths: string[];
    sequence: { title: string | null; project_id: string | null } | null;
    metadata: Record<string, unknown> | null;
  },
): Promise<{ role: string; asset_id: string }[]> {
  const { input, outputs, storagePaths, sequence, metadata } = context;
  const roles = Array.isArray(input["stems"])
    ? input["stems"].filter((role): role is string => typeof role === "string")
    : [];
  const bucket = task.storage_bucket ?? "generated-assets";
  const registered: { role: string; asset_id: string }[] = [];
  for (const [position, role] of roles.entries()) {
    const index = 2 + position;
    const output = outputs.find((entry) => entry["index"] === index);
    const path = text(output?.["storage_key"], storagePaths[index] ?? "");
    // Not uploaded: nothing to keep.
    if (!output || !path) continue;
    const findExisting = async () => {
      const { data, error } = await supabaseAdmin
        .from("assets")
        .select("id")
        .eq("storage_bucket", bucket)
        .eq("storage_path", path)
        .maybeSingle();
      must({ error }, "stem lookup");
      return data?.id ?? null;
    };
    let stemId = await findExisting();
    if (!stemId) {
      const { data: inserted, error } = await supabaseAdmin
        .from("assets")
        .insert({
          uploaded_by: task.created_by,
          project_id: sequence?.project_id ?? task.project_id,
          asset_type: "audio",
          storage_bucket: bucket,
          storage_path: path,
          mime_type: "audio/wav",
          file_size: numberOrNull(output["bytes"]),
          duration_seconds:
            numberOrNull(metadata?.["planned_duration_seconds"]) ??
            numberOrNull(metadata?.["duration_seconds"]),
          source_type: "generated",
          title: `${sequence?.title ?? "Edit"} · ${STEM_TITLES[role] ?? "Stem"}`.slice(0, 200),
          metadata: {
            derived: true,
            media_task_id: task.id,
            task_type: "render_sequence",
            sequence_id: input["sequence_id"] ?? null,
            render_id: input["render_id"] ?? null,
            stem: role,
            ...(role === "music" &&
            Array.isArray(input["music_credits"]) &&
            input["music_credits"].length
              ? { music_credits: input["music_credits"] }
              : {}),
            ...(role === "music" &&
            Array.isArray(input["music_licences"]) &&
            input["music_licences"].length
              ? { music_licences: input["music_licences"] }
              : {}),
          } as never,
        })
        .select("id")
        .maybeSingle();
      // A concurrent duplicate report may have registered it a moment ago.
      if (error?.code === "23505") stemId = await findExisting();
      else must({ error }, "stem");
      stemId ??= inserted?.id ?? null;
    }
    if (stemId) registered.push({ role, asset_id: stemId });
  }
  return registered;
}

/**
 * How the render's sound sits (the media service's mix_report), kept on the
 * render (migration 0032_mix_reports). Before that is applied the column
 * isn't there: the report is still kept with the video's own record (its
 * probe), where the Render panel and get_render read it.
 */
async function recordMixReport(
  renderId: string | null,
  metadata: Record<string, unknown> | null,
): Promise<void> {
  const report = metadata?.["mix_report"];
  if (!renderId || !report || typeof report !== "object" || Array.isArray(report)) return;
  const { error } = await supabaseAdmin
    .from("sequence_renders")
    .update({ mix_report: report } as never)
    .eq("id", renderId);
  if (error && !isMissingColumnError(error, "mix_report")) must({ error }, "mix report");
}

/** A write that failed is thrown, so the callback answers 5xx and the worker retries. */
function must(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`Could not record the ${what}: ${result.error.message}`);
}
