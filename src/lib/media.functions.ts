import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { MEDIA_TASKS, MEDIA_TASK_TYPES, type MediaKind } from "./media/tasks";

/**
 * Media worker orchestration.
 *
 * The browser never talks to the worker: it asks for a task here, this function
 * validates it, records it, mints short-lived signed URLs for the source media
 * and the destination file, and hands the worker a fully described job.
 */

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 2 * 60 * 60;

export const getMediaWorkerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { mediaWorkerConfigured, workerHealth } = await import("./media/worker.server");
    if (!mediaWorkerConfigured()) {
      return {
        configured: false,
        reachable: false,
        message: "Not configured — set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET to enable rendering tasks.",
        tasks: [] as string[],
        ffmpeg: null as string | null,
      };
    }
    const health = await workerHealth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("app_settings")
      .update(
        health.ok
          ? ({ value: new Date().toISOString() as never } as never)
          : ({ value: { at: new Date().toISOString(), message: health.errorMessage } as never } as never),
      )
      .eq("key", health.ok ? "media_worker_last_success_at" : "media_worker_last_error");

    return {
      configured: true,
      reachable: health.ok,
      message: health.ok ? "Media service reachable" : (health.errorMessage ?? "Media service unreachable"),
      tasks: health.data?.tasks ?? [],
      ffmpeg: health.data?.ffmpeg ?? null,
      queued: health.data?.queued ?? 0,
      running: health.data?.running ?? 0,
    };
  });

const submitInput = z.object({
  taskType: z.enum(MEDIA_TASK_TYPES as [string, ...string[]]),
  sourceAssetIds: z.array(z.string().uuid()).min(1).max(40),
  params: z.record(z.string(), z.unknown()).default({}),
  projectId: z.string().uuid().nullable().optional(),
  clientRequestId: z.string().min(8).max(64).optional(),
});

export const submitMediaTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mediaWorkerConfigured, submitWorkerTask } = await import("./media/worker.server");
    const { appBaseUrl } = await import("./generation-pipeline.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.is_active) throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");

    if (!mediaWorkerConfigured()) {
      throw new AppError(
        "UNKNOWN",
        "The media service is not configured. An administrator needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
      );
    }

    const definition = MEDIA_TASKS[data.taskType];
    if (!definition) throw new AppError("INVALID_PARAMETERS", "That media task is not available");

    // An identical task already accepted for this key is returned as-is, so a
    // double click or a retried request never renders (or bills CPU) twice.
    if (data.clientRequestId) {
      const { data: existing } = await supabaseAdmin
        .from("media_tasks")
        .select("id,status")
        .eq("dedupe_key", data.clientRequestId)
        .maybeSingle();
      if (existing) return { taskId: existing.id, status: existing.status, duplicate: true };
    }

    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id,asset_type,storage_bucket,storage_path,mime_type,project_id,title")
      .in("id", data.sourceAssetIds)
      .is("deleted_at", null);

    const ordered = data.sourceAssetIds.map((id) => (assets ?? []).find((asset) => asset.id === id));
    if (ordered.some((asset) => !asset)) throw new AppError("INVALID_PARAMETERS", "One of the selected files is no longer available");

    const primary = ordered[0]!;
    if (!definition.accepts.includes(primary.asset_type as MediaKind)) {
      throw new AppError("INVALID_PARAMETERS", `${definition.label} cannot be applied to a ${primary.asset_type} file`);
    }

    const projectId = data.projectId ?? primary.project_id ?? null;
    const taskId = crypto.randomUUID();

    // Operation first: the task is visible in the operation graph even if the
    // worker never answers.
    const { data: operation, error: operationError } = await supabaseAdmin
      .from("operations")
      .insert({
        created_by: context.userId,
        project_id: projectId,
        operation_type: data.taskType,
        provider: "media_worker",
        status: "running",
        input_payload: { task_type: data.taskType, params: data.params, sources: data.sourceAssetIds } as never,
        dedupe_key: data.clientRequestId ?? null,
        submitted_at: new Date().toISOString(),
      } as never)
      .select("id")
      .maybeSingle();
    if (operationError || !operation) {
      // The same request, sent twice at once: answer with the task the other one started.
      if (operationError?.code === "23505" && data.clientRequestId) {
        const { data: raced } = await supabaseAdmin
          .from("media_tasks")
          .select("id,status")
          .eq("dedupe_key", data.clientRequestId)
          .maybeSingle();
        if (raced) return { taskId: raced.id, status: raced.status, duplicate: true };
        throw new AppError("UNKNOWN", "This task is already being started. Give it a moment.");
      }
      throw new AppError("UNKNOWN", "The media task could not be recorded. Try again.");
    }

    const { error: taskError } = await supabaseAdmin.from("media_tasks").insert({
      id: taskId,
      operation_id: operation.id,
      created_by: context.userId,
      project_id: projectId,
      source_asset_id: primary.id,
      task_type: data.taskType,
      status: "submitting",
      input_payload: { params: data.params, sources: data.sourceAssetIds } as never,
      dedupe_key: data.clientRequestId ?? null,
      submitted_at: new Date().toISOString(),
    } as never);
    if (taskError) {
      if (taskError.code === "23505" && data.clientRequestId) {
        const { data: raced } = await supabaseAdmin
          .from("media_tasks")
          .select("id,status")
          .eq("dedupe_key", data.clientRequestId)
          .maybeSingle();
        if (raced) return { taskId: raced.id, status: raced.status, duplicate: true };
      }
      throw new AppError("UNKNOWN", "The media task could not be recorded");
    }

    async function fail(code: string, message: string): Promise<never> {
      await supabaseAdmin
        .from("media_tasks")
        .update({ status: "failed", error_code: code, error_message: message, completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (operation?.id) {
        await supabaseAdmin
          .from("operations")
          .update({ status: "failed", error_code: code, error_message: message, failed_at: new Date().toISOString() })
          .eq("id", operation.id);
      }
      throw new AppError(code as never, message);
    }

    // Short-lived read URLs for the sources.
    const sources: { role: string; url: string; mime?: string | null }[] = [];
    for (const asset of ordered) {
      const { data: signed } = await supabaseAdmin.storage
        .from(asset!.storage_bucket)
        .createSignedUrl(asset!.storage_path, SOURCE_URL_TTL);
      if (!signed?.signedUrl) await fail("STORAGE_FAILED", "A source file could not be read from storage");
      sources.push({
        role: asset!.asset_type === "audio" ? "audio" : asset!.asset_type === "video" ? "video" : "source",
        url: signed!.signedUrl,
        mime: asset!.mime_type,
      });
    }

    // One pre-signed destination per produced file.
    const outputCount = definition.outputCount(data.params);
    const output = definition.output(data.params);
    const scope = projectId ? `projects/${projectId}` : `unassigned/${context.userId}`;
    const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
    const storagePaths: string[] = [];
    for (let index = 0; index < outputCount; index += 1) {
      const path = `${scope}/derived/${taskId}/${index + 1}.${output.ext}`;
      const { data: signed, error } = await supabaseAdmin.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path);
      if (error || !signed?.signedUrl) await fail("STORAGE_FAILED", "A destination for the rendered file could not be prepared");
      uploads.push({ url: signed!.signedUrl, method: "PUT", storage_key: path });
      storagePaths.push(path);
    }

    // Where the results land is recorded before the worker is asked, so even a
    // result that comes back instantly can be registered. Nothing is sent
    // unless it is recorded.
    const { data: recorded, error: recordError } = await supabaseAdmin
      .from("media_tasks")
      .update({
        storage_bucket: OUTPUT_BUCKET,
        storage_path: storagePaths[0] ?? null,
        input_payload: {
          params: data.params,
          sources: data.sourceAssetIds,
          storage_paths: storagePaths,
          mime_type: output.mime,
          output_kind: definition.outputKind,
        } as never,
      })
      .eq("id", taskId)
      .select("id");
    if (recordError || !recorded?.length)
      await fail("UNKNOWN", "The media task could not be recorded. Try again.");

    const callbackUrl = `${appBaseUrl().replace(/\/$/, "")}/api/public/media-worker-callback`;
    const submission = await submitWorkerTask({
      task_id: taskId,
      task_type: data.taskType,
      sources,
      uploads,
      params: data.params,
      callback: { url: callbackUrl },
    });

    if (!submission.ok) {
      await fail(submission.errorCode ?? "UNKNOWN", submission.errorMessage ?? "The media service rejected the task");
    }

    // Only a task still waiting moves on: a result that already arrived wins.
    await supabaseAdmin
      .from("media_tasks")
      .update({ status: "processing" })
      .eq("id", taskId)
      .eq("status", "submitting");

    return { taskId, status: "processing", duplicate: false };
  });

export const listMediaTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sourceAssetId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("media_tasks")
      .select("id,task_type,status,error_message,result_asset_id,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (data.sourceAssetId) query = query.eq("source_asset_id", data.sourceAssetId);
    const { data: rows } = await query;
    return rows ?? [];
  });
