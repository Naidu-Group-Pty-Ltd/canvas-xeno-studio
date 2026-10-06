/**
 * Sequence rendering: validates an edit, records the render, signs the media
 * it needs and hands the media worker one fully described job.
 *
 * The worker only ever sees short-lived signed URLs: storage credentials stay
 * here. Everything the callback needs (where the result lands) is written
 * before the job is submitted, so even an instant result is recorded.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { appBaseUrl } from "../generation-pipeline.server";
import { mediaWorkerConfigured, submitWorkerTask } from "../media/worker.server";
import { creditLine, licenceBlocker, licenceTerms, type MusicTrackRow } from "../music/catalog";
import { RENDER_STALL_MS } from "./renders";
import { isMissingTableError } from "./errors";
import {
  audibleAudio,
  buildRenderRequest,
  parseTimeline,
  renderBlockers,
  type Timeline,
} from "./timeline";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 3 * 60 * 60;
/** Signed upload URLs last two hours, so a render's links are good for that long. */
const LINKS_VALID_MS = 2 * 60 * 60 * 1000;

interface RenderInput {
  sequenceId: string;
  expectedVersion: number;
  clientRequestId: string;
  userId: string;
}

export interface RenderStarted {
  renderId: string;
  status: string;
  duplicate: boolean;
}

async function signSource(asset: { storage_bucket: string; storage_path: string }) {
  const { data } = await supabaseAdmin.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, SOURCE_URL_TTL);
  return data?.signedUrl ?? null;
}

async function signUpload(bucket: string, path: string) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  return error ? null : (data?.signedUrl ?? null);
}

/** Checks every clip and track against the library before anything is recorded. */
async function resolveAssets(timeline: Timeline) {
  const wanted = new Map<string, "video" | "image" | "audio">();
  for (const clip of timeline.clips) wanted.set(clip.assetId, clip.kind);
  for (const item of timeline.audio) {
    if (wanted.has(item.assetId) && wanted.get(item.assetId) !== "audio") {
      throw new AppError("INVALID_PARAMETERS", "One file is used both as a clip and as audio");
    }
    wanted.set(item.assetId, "audio");
  }
  const ids = [...wanted.keys()];
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,duration_seconds,title")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", "The edit's media could not be checked");
  const assets = new Map((data ?? []).map((asset) => [asset.id, asset]));
  for (const [id, kind] of wanted) {
    const asset = assets.get(id);
    if (!asset)
      throw new AppError(
        "INVALID_PARAMETERS",
        "A file used in this edit is no longer in the library. Remove it and try again.",
      );
    if (asset.asset_type !== kind) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `"${asset.title ?? "A file"}" is a ${asset.asset_type} file and cannot be used as ${kind}`,
      );
    }
  }
  for (const [index, clip] of timeline.clips.entries()) {
    const known = assets.get(clip.assetId)?.duration_seconds;
    if (clip.kind === "video" && known && clip.trimStart >= Number(known)) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${index + 1} starts after the end of its footage`,
      );
    }
  }
  return assets;
}

/**
 * What the edit's music asks for: the credits Creative Commons BY needs and
 * the terms of licensed tracks, both kept with the finished video, and an
 * expired licence, which stops the render.
 */
async function musicRights(assetIds: string[]): Promise<{
  credits: string[];
  licences: Record<string, unknown>[];
  blocker: string | null;
}> {
  const none = { credits: [], licences: [], blocker: null };
  if (!assetIds.length) return none;
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .select("title,artist,license,license_version,license_url,attribution,rights")
    .in("asset_id", [...new Set(assetIds)]);
  if (error) {
    // Before the music library exists there is nothing to credit or check;
    // any other failure stops the render rather than skipping the check.
    if (isMissingTableError(error)) return none;
    throw new AppError("UNKNOWN", "The music licences couldn't be checked. Try again.");
  }
  const rows = (data ?? []) as unknown as Pick<
    MusicTrackRow,
    "title" | "artist" | "license" | "license_version" | "license_url" | "attribution" | "rights"
  >[];
  const credits = [
    ...new Set(rows.map((row) => creditLine(row)).filter((line): line is string => !!line)),
  ];
  const licences = rows.flatMap((row) => {
    const terms = licenceTerms(row);
    return terms
      ? [
          {
            title: row.title,
            licensor: terms.licensor,
            reference: terms.reference,
            uses: terms.uses,
            territories: terms.territories,
            expires_on: terms.expiresOn,
            notes: terms.notes,
          },
        ]
      : [];
  });
  const blocker = rows.map((row) => licenceBlocker(row)).find((reason) => reason) ?? null;
  return { credits, licences, blocker };
}

export async function startSequenceRender(input: RenderInput): Promise<RenderStarted> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");

  if (!mediaWorkerConfigured()) {
    throw new AppError(
      "UNKNOWN",
      "Rendering needs the media service. An administrator needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );
  }

  // A repeated click or a retried request returns the render already started.
  const { data: existing } = await supabaseAdmin
    .from("sequence_renders")
    .select("id,status")
    .eq("dedupe_key", input.clientRequestId)
    .maybeSingle();
  if (existing) return { renderId: existing.id, status: existing.status, duplicate: true };

  const { data: sequence } = await supabaseAdmin
    .from("sequences")
    .select("id,title,project_id,campaign_id,version,timeline")
    .eq("id", input.sequenceId)
    .maybeSingle();
  if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit no longer exists");
  if (sequence.version !== input.expectedVersion) {
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit changed since it was last saved. Let it save, then render again.",
    );
  }

  const timeline = parseTimeline(sequence.timeline);
  if (!timeline)
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit could not be read. Reopen it and save again.",
    );
  const blockers = renderBlockers(timeline);
  if (blockers.length) throw new AppError("INVALID_PARAMETERS", blockers[0]);

  const assets = await resolveAssets(timeline);
  // Only audio that is heard in the render needs crediting or licence checks.
  const music = await musicRights(audibleAudio(timeline).map((item) => item.assetId));
  if (music.blocker) throw new AppError("INVALID_PARAMETERS", music.blocker);
  const request = buildRenderRequest(timeline);

  const renderId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const scope = sequence.project_id
    ? `projects/${sequence.project_id}`
    : `unassigned/${input.userId}`;
  const videoPath = `${scope}/edits/${sequence.id}/${renderId}.mp4`;
  const posterPath = `${scope}/edits/${sequence.id}/${renderId}.jpg`;

  // Everything the render needs is recorded in one transaction (see the
  // start_sequence_render database function): stalled renders of the edit are
  // closed, the render takes the edit's one active slot, its operation and
  // task are created and the edit is pointed at it, only while the edit is
  // still the version checked above. Nothing is left half-made if it fails.
  const { data: started, error: startError } = await supabaseAdmin.rpc(
    "start_sequence_render" as never,
    {
      p_render_id: renderId,
      p_task_id: taskId,
      p_sequence_id: sequence.id,
      p_version: sequence.version,
      p_timeline: timeline,
      p_dedupe_key: input.clientRequestId,
      p_user_id: input.userId,
      p_stalled_before: new Date(Date.now() - RENDER_STALL_MS).toISOString(),
      p_task: {
        source_asset_id: timeline.clips[0]?.assetId ?? null,
        storage_bucket: OUTPUT_BUCKET,
        storage_path: videoPath,
        input_payload: {
          sequence_id: sequence.id,
          render_id: renderId,
          storage_paths: [videoPath, posterPath],
          mime_type: "video/mp4",
          output_kind: "video",
          sources: request.sources.map((source) => source.assetId),
          ...(music.credits.length ? { music_credits: music.credits } : {}),
          ...(music.licences.length ? { music_licences: music.licences } : {}),
        },
      },
    } as never,
  );
  const outcome = (started ?? null) as {
    outcome?: string;
    render_id?: string;
    status?: string;
  } | null;
  if (startError || !outcome?.outcome)
    throw new AppError("UNKNOWN", "The render could not be recorded. Try again.");
  if (outcome.outcome === "duplicate")
    return { renderId: outcome.render_id!, status: outcome.status!, duplicate: true };
  if (outcome.outcome === "busy")
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit is already rendering. Wait for that render to finish, then render again.",
    );
  if (outcome.outcome === "changed")
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit changed while the render was starting. Let it save, then render again.",
    );
  if (outcome.outcome !== "started")
    throw new AppError("INVALID_PARAMETERS", "That edit no longer exists");

  /**
   * A render that can't be sent is failed with its task, its operation and the
   * edit's status in one statement. If even that can't be recorded, it stops
   * reporting and is closed as stalled.
   */
  async function fail(code: string, message: string): Promise<never> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabaseAdmin.rpc(
        "fail_sequence_render" as never,
        { p_render_id: renderId, p_error_code: code, p_error_message: message } as never,
      );
      if (!error) break;
    }
    throw new AppError(code as never, message);
  }

  const sources: { role: string; url: string; mime?: string | null }[] = [];
  for (const source of request.sources) {
    const asset = assets.get(source.assetId)!;
    const url = await signSource(asset);
    if (!url)
      await fail("STORAGE_FAILED", `"${asset.title ?? "A file"}" could not be read from storage`);
    sources.push({ role: source.role, url: url!, mime: asset.mime_type });
  }

  const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
  for (const path of [videoPath, posterPath]) {
    const url = await signUpload(OUTPUT_BUCKET, path);
    if (!url)
      await fail("STORAGE_FAILED", "A destination for the rendered video could not be prepared");
    uploads.push({ url: url!, method: "PUT", storage_key: path });
  }

  const base = appBaseUrl().replace(/\/$/, "");
  const task = {
    task_id: taskId,
    task_type: "render_sequence",
    sources,
    uploads,
    params: request.params,
    callback: { url: `${base}/api/public/media-worker-callback` },
    report_progress: true,
    // Signed URLs expire; if the render waits in the worker's queue they are re-signed.
    credentials_url: `${base}/api/public/media-worker-credentials`,
    credentials_expire_at: new Date(Date.now() + LINKS_VALID_MS).toISOString(),
  };
  // No answer (or one from the infrastructure in front of the worker) doesn't
  // mean the worker didn't take the task. It acknowledges a repeated task id
  // without running it twice, so the same task is simply sent again.
  const unanswered = (call: { ok: boolean; status: number }) =>
    !call.ok && (call.status === 0 || call.status >= 500);
  let submission = await submitWorkerTask(task);
  if (unanswered(submission)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    submission = await submitWorkerTask(task);
  }
  if (!submission.ok && !unanswered(submission)) {
    await fail(
      submission.errorCode ?? "UNKNOWN",
      submission.errorMessage ?? "The media service rejected the render",
    );
  }

  // Only a task still waiting moves on: a result that already arrived wins.
  await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing" })
    .eq("id", taskId)
    .eq("status", "submitting");
  if (!submission.ok) {
    // Still unanswered: the render stays open, so the worker's heartbeats and
    // result still count. If it never reports, it is closed as stalled.
    await supabaseAdmin
      .from("sequence_renders")
      .update({ stage: "Waiting for the media service to confirm" } as never)
      .eq("id", renderId)
      .eq("status", "queued");
    return { renderId, status: "queued", duplicate: false };
  }
  await supabaseAdmin
    .from("sequence_renders")
    .update({ status: "rendering", stage: "Starting" } as never)
    .eq("id", renderId)
    .eq("status", "queued");

  return { renderId, status: "rendering", duplicate: false };
}

export type RenderCredentials =
  | {
      status: 200;
      sources: { url: string }[];
      uploads: { url: string; method: "PUT"; storage_key: string }[];
      expires_at: string;
    }
  | { status: 404 | 410 | 503 };

/**
 * Whether a render's worker may go on, decided by the render row (which holds
 * the edit's one active-render slot), never by its task alone:
 * - Still active: it is refreshed in the same step, so it can't be taken for
 *   stalled (and replaced) while it goes on.
 * - Presumed lost: it must take the slot back. The slot is the unique index
 *   on active renders, so this and a replacement's claim can't both succeed,
 *   whatever the timing: if the replacement claimed it first, the old task is
 *   dropped (410); if this comes first, the replacement is refused as "already
 *   rendering". Once the edit points at a newer render, the old one is dropped.
 * Its task and operation then follow it. Repeating this (the worker retries a
 * 503) is harmless.
 */
async function holdRenderSlot(
  task: { id: string; operation_id: string | null },
  input: Record<string, unknown>,
): Promise<200 | 404 | 410 | 503> {
  const renderId = typeof input["render_id"] === "string" ? input["render_id"] : null;
  const sequenceId = typeof input["sequence_id"] === "string" ? input["sequence_id"] : null;
  if (!renderId || !sequenceId) return 404;

  const { data: active, error: touchError } = await supabaseAdmin
    .from("sequence_renders")
    .update({ updated_at: new Date().toISOString() } as never)
    .eq("id", renderId)
    .in("status", ["queued", "rendering"])
    .select("id");
  if (touchError) return 503;
  if (!active?.length) {
    const { data: sequence, error } = await supabaseAdmin
      .from("sequences")
      .select("last_render_id")
      .eq("id", sequenceId)
      .maybeSingle();
    if (error) return 503;
    if (sequence?.last_render_id !== renderId) return 410;
    const { data: resumed, error: claimError } = await supabaseAdmin
      .from("sequence_renders")
      .update({
        status: "rendering",
        stage: "Resuming",
        error_code: null,
        error_message: null,
        completed_at: null,
      } as never)
      .eq("id", renderId)
      .or("status.in.(queued,rendering),error_code.eq.STALLED")
      .select("id");
    if (claimError) return claimError.code === "23505" ? 410 : 503;
    if (!resumed?.length) return 410;
  }

  const { error: taskError } = await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing", error_code: null, error_message: null, completed_at: null })
    .eq("id", task.id)
    .eq("status", "failed")
    .eq("error_code", "STALLED");
  if (taskError) return 503;
  if (task.operation_id) {
    const { error: operationError } = await supabaseAdmin
      .from("operations")
      .update({ status: "running", error_code: null, error_message: null, failed_at: null })
      .eq("id", task.operation_id)
      .eq("status", "failed")
      .eq("error_code", "STALLED");
    if (operationError) return 503;
  }
  return 200;
}

/**
 * Re-signs a render's sources and upload slots for the media worker, which
 * checks in when it starts a render and again before it uploads, so queue
 * and render time never outlive the signed URLs. Only an open render is
 * re-signed, only for its own sources and
 * destinations, in the order first sent, only for the worker instance that
 * claimed it, and only once it holds its edit's render slot (see
 * `holdRenderSlot`); otherwise the worker is told to drop it.
 */
export async function refreshRenderCredentials(
  taskId: string,
  workerId: string | null = null,
): Promise<RenderCredentials> {
  const { data: task, error } = await supabaseAdmin
    .from("media_tasks")
    .select("id,task_type,status,error_code,operation_id,storage_bucket,input_payload")
    .eq("id", taskId)
    .maybeSingle();
  if (error) return { status: 503 };
  if (!task || task.task_type !== "render_sequence") return { status: 404 };
  const open =
    task.status === "submitting" ||
    task.status === "processing" ||
    (task.status === "failed" && task.error_code === "STALLED");
  if (!open) return { status: 410 };

  // A task can reach two worker instances (an acknowledgement is lost and the
  // task is sent again, and the second send lands elsewhere). The first one to
  // ask claims it; any other is told to drop it, so a render never runs twice.
  if (workerId !== null && !/^[\w-]{1,64}$/.test(workerId)) return { status: 404 };
  if (workerId) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("media_tasks")
      .update({ worker_id: workerId } as never)
      .eq("id", task.id)
      .or(`worker_id.is.null,worker_id.eq.${workerId}`)
      .select("id");
    if (claimError) return { status: 503 };
    if (!claimed?.length) return { status: 410 };
  }

  const input = (task.input_payload ?? {}) as Record<string, unknown>;
  const held = await holdRenderSlot(task, input);
  if (held !== 200) return { status: held };
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const ids = strings(input["sources"]);
  const paths = strings(input["storage_paths"]);
  if (!ids.length || !paths.length) return { status: 404 };

  const { data: rows, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path")
    .in("id", [...new Set(ids)]);
  if (assetError) return { status: 503 };
  const assets = new Map((rows ?? []).map((row) => [row.id, row]));

  const sources: { url: string }[] = [];
  for (const id of ids) {
    const asset = assets.get(id);
    const url = asset ? await signSource(asset) : null;
    if (!url) return { status: 503 };
    sources.push({ url });
  }
  const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
  for (const path of paths) {
    const url = await signUpload(task.storage_bucket ?? OUTPUT_BUCKET, path);
    if (!url) return { status: 503 };
    uploads.push({ url, method: "PUT", storage_key: path });
  }
  return {
    status: 200,
    sources,
    uploads,
    expires_at: new Date(Date.now() + LINKS_VALID_MS).toISOString(),
  };
}
