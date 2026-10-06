import { createFileRoute } from "@tanstack/react-router";

/**
 * Media worker result callback.
 *
 * Authenticated by HMAC signature rather than a user session, idempotent, and
 * it never reveals internal data: the response is a bare acknowledgement.
 */
export const Route = createFileRoute("/api/public/media-worker-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyWorkerSignature } = await import("@/lib/media/worker.server");
        const check = verifyWorkerSignature(
          raw,
          request.headers.get("x-xeno-timestamp"),
          request.headers.get("x-xeno-signature"),
        );
        if (!check.ok) return new Response("Unauthorized", { status: 401 });

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
        }

        const taskId = typeof payload["task_id"] === "string" ? payload["task_id"] : null;
        if (!taskId) return new Response(JSON.stringify({ error: "Missing task id" }), { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: task, error: lookupError } = await supabaseAdmin
          .from("media_tasks")
          .select("id,status,error_code,task_type,operation_id,project_id,created_by,source_asset_id,input_payload,storage_bucket")
          .eq("id", taskId)
          .maybeSingle();
        // A lookup that failed isn't an unknown task: answered 503, so the worker repeats the report.
        if (lookupError) {
          console.error("media task callback lookup failed", {
            taskId,
            message: lookupError.message,
          });
          return new Response(JSON.stringify({ received: false }), { status: 503 });
        }
        if (!task) return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });

        const status = payload["status"];
        // A render presumed lost (no word for a while) can still deliver its result.
        const presumedLost = task.status === "failed" && task.error_code === "STALLED";

        // A repeated delivery of an already-finished task changes nothing.
        if (task.status === "completed" || (task.status === "failed" && !presumedLost)) {
          return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
        }

        // Anything other than a final result (progress, heartbeat) never changes a
        // task's state, so one arriving late or out of order is harmless.
        if (status !== "completed" && status !== "failed") {
          const stage = typeof payload["stage"] === "string" ? payload["stage"].slice(0, 80) : null;
          if (task.task_type === "render_sequence" && !presumedLost) {
            const value = Number(payload["progress"]);
            if (status === "progress" && Number.isFinite(value)) {
              // Progress only moves the bar forward.
              const progress = Math.max(0, Math.min(0.99, value));
              await supabaseAdmin
                .from("sequence_renders")
                .update({ status: "rendering", progress, stage } as never)
                .eq("media_task_id", task.id)
                .in("status", ["queued", "rendering"])
                .lt("progress", progress);
            } else if (status === "heartbeat") {
              // Still alive (queued or working): refreshes the render so it isn't taken for lost.
              await supabaseAdmin
                .from("sequence_renders")
                .update((stage ? { stage } : { status: "rendering" }) as never)
                .eq("media_task_id", task.id)
                .in("status", ["queued", "rendering"]);
            }
          }
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        if (task.task_type === "render_sequence") {
          const { finishSequenceRender } = await import("@/lib/edit/callback.server");
          try {
            await finishSequenceRender(task, payload);
          } catch (error) {
            // Nothing was marked finished, so the worker's retry records it.
            console.error("render callback not recorded", {
              taskId: task.id,
              message: error instanceof Error ? error.message : String(error),
            });
            return new Response(JSON.stringify({ received: false }), { status: 503 });
          }
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const now = new Date().toISOString();
        // Anything that can't be recorded is answered 503, so the worker repeats the
        // report. The media task is marked finished last: until then a repeat is
        // processed again, never taken for a duplicate.
        const notRecorded = (what: string, message?: string) => {
          console.error("media task callback not recorded", { taskId: task.id, what, message });
          return new Response(JSON.stringify({ received: false }), { status: 503 });
        };

        const settingsUpdate =
          status === "completed"
            ? supabaseAdmin.from("app_settings").update({ value: now as never }).eq("key", "media_worker_last_success_at")
            : supabaseAdmin
                .from("app_settings")
                .update({ value: { at: now, message: String(payload["error_message"] ?? "unknown") } as never })
                .eq("key", "media_worker_last_error");
        await settingsUpdate;

        if (status !== "completed") {
          const errorCode = typeof payload["error_code"] === "string" ? payload["error_code"] : "RENDER_FAILED";
          const errorMessage =
            typeof payload["error_message"] === "string" ? payload["error_message"] : "The media task failed";
          if (task.operation_id) {
            const { error } = await supabaseAdmin
              .from("operations")
              .update({ status: "failed", error_code: errorCode, error_message: errorMessage, failed_at: now })
              .eq("id", task.operation_id);
            if (error) return notRecorded("operation", error.message);
          }
          const { error } = await supabaseAdmin
            .from("media_tasks")
            .update({ status: "failed", error_code: errorCode, error_message: errorMessage, completed_at: now })
            .eq("id", task.id);
          if (error) return notRecorded("media task", error.message);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }

        const input = (task.input_payload ?? {}) as Record<string, unknown>;
        const storagePaths = Array.isArray(input["storage_paths"]) ? (input["storage_paths"] as string[]) : [];
        const mimeType = typeof input["mime_type"] === "string" ? input["mime_type"] : "application/octet-stream";
        const outputKind = typeof input["output_kind"] === "string" ? input["output_kind"] : "image";
        const outputs = Array.isArray(payload["outputs"]) ? (payload["outputs"] as Record<string, unknown>[]) : [];
        const metadata = (payload["metadata"] ?? null) as Record<string, unknown> | null;
        const bucket = task.storage_bucket ?? "generated-assets";

        const assetIds: string[] = [];
        for (const [index, output] of outputs.entries()) {
          const path = (typeof output["storage_key"] === "string" ? output["storage_key"] : storagePaths[index]) ?? null;
          if (!path) continue;

          // The (bucket, path) pair is unique, so a replayed callback can never
          // create a second asset row for the same rendered file.
          const findExisting = () =>
            supabaseAdmin
              .from("assets")
              .select("id")
              .eq("storage_bucket", bucket)
              .eq("storage_path", path)
              .maybeSingle();
          const { data: existing, error: existingError } = await findExisting();
          if (existingError) return notRecorded("asset lookup", existingError.message);
          if (existing) {
            assetIds.push(existing.id);
            continue;
          }

          // Rendered files are studio-made media; their origin is kept in metadata.
          const probe = metadata ?? {};
          const { data: inserted, error: insertError } = await supabaseAdmin
            .from("assets")
            .insert({
              uploaded_by: task.created_by,
              project_id: task.project_id,
              asset_type: outputKind as "image" | "video" | "audio",
              storage_bucket: bucket,
              storage_path: path,
              mime_type: typeof output["mime_type"] === "string" ? output["mime_type"] : mimeType,
              file_size: typeof output["bytes"] === "number" ? output["bytes"] : null,
              width: typeof probe["width"] === "number" && outputs.length === 1 ? probe["width"] : null,
              height: typeof probe["height"] === "number" && outputs.length === 1 ? probe["height"] : null,
              duration_seconds:
                typeof probe["duration_seconds"] === "number" && outputs.length === 1 ? probe["duration_seconds"] : null,
              source_type: "generated",
              title: `${task.task_type.replace(/_/g, " ")} ${outputs.length > 1 ? index + 1 : ""}`.trim(),
              metadata: {
                derived: true,
                media_task_id: task.id,
                task_type: task.task_type,
                derived_from_asset_id: task.source_asset_id,
                ...(output["timestamp_seconds"] !== undefined ? { timestamp_seconds: output["timestamp_seconds"] } : {}),
                ...(metadata ? { probe: metadata } : {}),
              } as never,
            })
            .select("id")
            .maybeSingle();
          if (insertError?.code === "23505") {
            // A concurrent repeat of this report registered it a moment ago.
            const { data: raced, error: racedError } = await findExisting();
            if (racedError || !raced) return notRecorded("asset", racedError?.message);
            assetIds.push(raced.id);
            continue;
          }
          if (insertError || !inserted) return notRecorded("asset", insertError?.message);
          assetIds.push(inserted.id);
        }

        if (task.operation_id) {
          const { data: changed, error } = await supabaseAdmin
            .from("operations")
            .update({
              status: "completed",
              completed_at: now,
              output_payload: { asset_ids: assetIds, metadata } as never,
            })
            .eq("id", task.operation_id)
            .neq("status", "completed")
            .select("id");
          if (error) return notRecorded("operation", error.message);
          // Logged once, by the report that completed the operation.
          if (changed?.length) {
            const { error: eventError } = await supabaseAdmin.from("operation_events").insert({
              operation_id: task.operation_id,
              event_type: "completed",
              payload: { asset_ids: assetIds, task_type: task.task_type } as never,
            } as never);
            if (eventError) return notRecorded("operation event", eventError.message);
          }
        }

        const { error: taskError } = await supabaseAdmin
          .from("media_tasks")
          .update({
            status: "completed",
            completed_at: now,
            result_asset_id: assetIds[0] ?? null,
            output_payload: { asset_ids: assetIds, metadata, duration_ms: payload["duration_ms"] ?? null } as never,
          })
          .eq("id", task.id);
        if (taskError) return notRecorded("media task", taskError.message);

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
