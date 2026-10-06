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

        const { data: task } = await supabaseAdmin
          .from("media_tasks")
          .select("id,status,task_type,operation_id,project_id,created_by,source_asset_id,input_payload,storage_bucket")
          .eq("id", taskId)
          .maybeSingle();
        if (!task) return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });

        // A repeated delivery of an already-finished task changes nothing.
        if (task.status === "completed" || task.status === "failed") {
          return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
        }

        const now = new Date().toISOString();
        const status = payload["status"];

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
          await supabaseAdmin
            .from("media_tasks")
            .update({ status: "failed", error_code: errorCode, error_message: errorMessage, completed_at: now })
            .eq("id", task.id);
          if (task.operation_id) {
            await supabaseAdmin
              .from("operations")
              .update({ status: "failed", error_code: errorCode, error_message: errorMessage, failed_at: now })
              .eq("id", task.operation_id);
          }
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
          const { data: existing } = await supabaseAdmin
            .from("assets")
            .select("id")
            .eq("storage_bucket", bucket)
            .eq("storage_path", path)
            .maybeSingle();
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
          if (insertError) console.error("media task output not registered", { taskId: task.id, message: insertError.message });
          if (inserted) assetIds.push(inserted.id);
        }

        await supabaseAdmin
          .from("media_tasks")
          .update({
            status: "completed",
            completed_at: now,
            result_asset_id: assetIds[0] ?? null,
            output_payload: { asset_ids: assetIds, metadata, duration_ms: payload["duration_ms"] ?? null } as never,
          })
          .eq("id", task.id);

        if (task.operation_id) {
          await supabaseAdmin
            .from("operations")
            .update({
              status: "completed",
              completed_at: now,
              output_payload: { asset_ids: assetIds, metadata } as never,
            })
            .eq("id", task.operation_id);
          await supabaseAdmin.from("operation_events").insert({
            operation_id: task.operation_id,
            event_type: "completed",
            payload: { asset_ids: assetIds, task_type: task.task_type } as never,
          } as never);
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
