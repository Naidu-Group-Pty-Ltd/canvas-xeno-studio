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
import { mediaWorkerConfigured, submitWorkerTask, workerHealth } from "../media/worker.server";
import {
  licenceBlocker,
  licenceTerms,
  MUSIC_LICENSES,
  videoCreditLine,
  type MusicTrackRow,
} from "../music/catalog";
import { finishSequenceRender } from "./callback.server";
import {
  RENDER_BUSY_STAGE,
  RENDER_STALL_MS,
  RENDER_UNCONFIRMED_STAGE,
  renderInProgress,
} from "./renders";
import { isMissingTableError } from "./errors";
import {
  audibleAudio,
  buildRenderRequest,
  frameSize,
  layoutTimeline,
  mixNeedsChannelLevels,
  parseTimeline,
  renderBlockers,
  type Timeline,
} from "./timeline";
import { isBrandFontFile } from "./font-family";
import { withRenderExtras } from "./render-extras.server";

/**
 * The render request for a timeline. Channel levels are folded into the
 * items' volumes, which gives the same mix, unless a boosted channel would
 * take an item past 200%: then the media service has to apply them itself.
 */
async function renderRequestFor(timeline: Timeline) {
  const channelMix = mixNeedsChannelLevels(timeline);
  const request = buildRenderRequest(timeline, channelMix ? { channelMix: true } : {});
  // What only an up-to-date media service can do: without it, a logo or a
  // brand's fonts and colours would be left out of the render without a word.
  const needed: { feature: string; message: string }[] = [];
  if (channelMix)
    needed.push({
      feature: "channel_mix",
      message:
        "The mixer boosts some sound past 200%, which the media service can't do yet. Lower that channel or the items' own volume, or render again once the service has been updated.",
    });
  if (request.params["images"])
    needed.push({
      feature: "image_overlays",
      message:
        "This edit lays a logo or picture over the video, which the media service can't do until it is updated. Remove it, or render again once the service has been updated.",
    });
  if (request.params["frame_rate_conversion"] || request.params["upscale"])
    needed.push({
      feature: "frame_rate_conversion",
      message:
        "This edit blends or interpolates frames (or scales sharply), which the media service can't do until it is updated. Set the Picture settings back to repeat frames and standard scaling, or render again once the service has been updated.",
    });
  if (request.fonts.length || usesBrandColours(request.params))
    needed.push({
      feature: "brand_text",
      message:
        "This edit's titles or captions use a brand's fonts or colours, which the media service can't set until it is updated. Render again once the service has been updated.",
    });
  if (request.params["quality"] === "master")
    needed.push({
      feature: "mastering",
      message:
        "This edit is set to render as a master, which the media service can't make until it is updated. Set its quality back to Standard in the Render panel, or render again once the service has been updated.",
    });
  if (!needed.length) return withRenderExtras(timeline, request);
  const health = await workerHealth();
  if (!health.ok)
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "The media service isn't answering. Try again in a moment.",
    );
  for (const { feature, message } of needed)
    if (!health.data?.features?.includes(feature))
      throw new AppError("INVALID_PARAMETERS", message);
  return withRenderExtras(timeline, request, health.data?.features ?? []);
}

/** Whether a render request asks for a brand's colours anywhere. */
function usesBrandColours(params: Record<string, unknown>): boolean {
  const branded = (item: unknown) => {
    const record = (item ?? {}) as Record<string, unknown>;
    return "color" in record || "accent" in record || "font" in record;
  };
  return (
    branded(params["captions"]) ||
    (Array.isArray(params["overlays"]) && params["overlays"].some(branded))
  );
}

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
  // A picture laid over the edit (a logo) is a still.
  for (const image of timeline.images) {
    if (wanted.has(image.assetId) && wanted.get(image.assetId) !== "image")
      throw new AppError("INVALID_PARAMETERS", "A picture laid over the edit must be an image");
    wanted.set(image.assetId, "image");
  }
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
 * Which of these recordings are voiceovers the studio made: takes finished by
 * the server, which alone writes them, in files members can't change or
 * repoint. What an edit calls a voiceover is taken as one only when it is one.
 */
async function studioVoiceovers(assetIds: string[]): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("voiceovers")
    .select("asset_id")
    .eq("status", "completed")
    .in("asset_id", assetIds);
  if (error) {
    // Before brand voices are set up the studio has made none.
    if (isMissingTableError(error)) return new Set();
    throw new AppError("UNKNOWN", "The edit's voiceovers couldn't be checked. Try again.");
  }
  return new Set((data ?? []).flatMap((row) => (row.asset_id ? [row.asset_id] : [])));
}

/** Why audio heard in the edit, neither a voiceover the studio made nor on record, can't be rendered. */
function unrecordedReason(item: { role: string; title: string | null }): string {
  const title = item.title ?? "Some audio";
  return item.role === "voiceover"
    ? `“${title}” is used as a voiceover, but it wasn't made in the Voice tab and no licence is on record for it. Make or import the voiceover in the edit's Voice tab, or record its licence in the Music tab.`
    : `“${title}” is used as ${item.role === "sfx" ? "a sound effect" : "music"}, but no licence is on record for it. Record its licence in the edit's Music tab, or use music from the library.`;
}

/**
 * What the edit's music asks for: the credits Creative Commons BY needs, and
 * the terms of licensed tracks and the usage limits of AI music (where it may
 * run depends on the plan it was made on), all kept with the finished video;
 * and what stops the render: an expired licence, or audio heard in the edit
 * that is neither a voiceover the studio made nor on record with a licence
 * (audio added from the media bin, say, whatever it is used as), since nothing
 * then says it may be used.
 */
async function musicRights(
  items: { assetId: string; role: string; title: string | null }[],
): Promise<{
  credits: string[];
  licences: Record<string, unknown>[];
  blocker: string | null;
}> {
  const none = { credits: [], licences: [], blocker: null };
  if (!items.length) return none;
  const assetIds = [...new Set(items.map((item) => item.assetId))];
  const made = await studioVoiceovers(assetIds);
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .select(
      "asset_id,title,artist,license,license_version,license_url,attribution,rights,usage_notes,source_url",
    )
    .in("asset_id", assetIds);
  if (error) {
    // Before the music library is set up nothing shows what other audio may
    // be used, so only voiceovers the studio made are rendered. Any other
    // failure stops the render too, rather than skipping the check.
    if (isMissingTableError(error)) {
      const other = items.find((item) => !made.has(item.assetId));
      if (!other) return none;
      return {
        ...none,
        blocker:
          other.role === "voiceover"
            ? `“${other.title ?? "Some audio"}” is used as a voiceover, but it wasn't made in the Voice tab, and audio from elsewhere can't be rendered until the music library is set up (its database update hasn't been applied yet).`
            : "Music and sound effects can't be rendered until the music library is set up (its database update hasn't been applied yet).",
      };
    }
    throw new AppError("UNKNOWN", "The music licences couldn't be checked. Try again.");
  }
  const rows = (data ?? []) as unknown as Pick<
    MusicTrackRow,
    | "asset_id"
    | "title"
    | "artist"
    | "license"
    | "license_version"
    | "license_url"
    | "attribution"
    | "rights"
    | "usage_notes"
    | "source_url"
  >[];
  const credits = [
    ...new Set(rows.map((row) => videoCreditLine(row)).filter((line): line is string => !!line)),
  ];
  const licences = rows.flatMap((row): Record<string, unknown>[] => {
    const terms = licenceTerms(row);
    if (terms)
      return [
        {
          title: row.title,
          licence: row.license,
          licensor: terms.licensor,
          reference: terms.reference,
          uses: terms.uses,
          territories: terms.territories,
          expires_on: terms.expiresOn,
          notes: terms.notes,
        },
      ];
    if (row.license === "ai_generated")
      return [
        {
          title: row.title,
          licence: row.license,
          licensor: "ElevenLabs (Eleven Music)",
          notes: row.usage_notes ?? MUSIC_LICENSES.ai_generated.note,
        },
      ];
    return [];
  });
  const recorded = new Set(rows.map((row) => row.asset_id));
  const unrecorded = items.find((item) => !recorded.has(item.assetId) && !made.has(item.assetId));
  const blocker =
    (unrecorded ? unrecordedReason(unrecorded) : null) ??
    rows.map((row) => licenceBlocker(row)).find((reason) => reason) ??
    null;
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

  // A repeated click or a retried request returns the render already started
  // (and sends it, if it was recorded but never handed to the worker).
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("sequence_renders")
    .select("id")
    .eq("dedupe_key", input.clientRequestId)
    .maybeSingle();
  if (existingError) throw new AppError("UNKNOWN", "The render could not be checked. Try again.");
  if (existing) return resumed(existing.id);

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
  const music = await musicRights(
    audibleAudio(timeline).map((item) => ({
      assetId: item.assetId,
      role: item.role,
      title: assets.get(item.assetId)?.title ?? item.label ?? null,
    })),
  );
  if (music.blocker) throw new AppError("INVALID_PARAMETERS", music.blocker);
  const request = await renderRequestFor(timeline);

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
          // Brand fonts, sent after the files above (re-signed with them).
          ...(request.fonts.length
            ? { font_files: request.fonts.map((font) => `${font.bucket}/${font.path}`) }
            : {}),
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
  if (outcome.outcome === "duplicate") return resumed(outcome.render_id!);
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

  return submitRender({ renderId, taskId, assets, request, videoPath, posterPath });
}

/**
 * Hands a recorded render to the worker. Its task id is the render's own, and
 * the worker runs a task id once, so sending it again (a retried request
 * whose first try was cut off) is harmless.
 */
async function submitRender(input: {
  renderId: string;
  taskId: string;
  assets: Awaited<ReturnType<typeof resolveAssets>>;
  request: ReturnType<typeof buildRenderRequest>;
  videoPath: string;
  posterPath: string;
}): Promise<RenderStarted> {
  const { renderId, taskId, assets, request, videoPath, posterPath } = input;
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
  for (const font of request.fonts) {
    const url = isBrandFontFile(font)
      ? await signSource({ storage_bucket: font.bucket, storage_path: font.path })
      : null;
    if (!url)
      await fail("STORAGE_FAILED", `The font "${font.family}" could not be read from storage`);
    sources.push({ role: "font", url: url!, mime: null });
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
  // A full queue (429) took nothing and asks for the task again shortly.
  const busy = (call: { ok: boolean; status: number }) => !call.ok && call.status === 429;
  let submission = await submitWorkerTask(task);
  if (unanswered(submission) || busy(submission)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    submission = await submitWorkerTask(task);
  }
  if (!submission.ok && !unanswered(submission) && !busy(submission)) {
    await fail(
      submission.errorCode ?? "UNKNOWN",
      submission.errorMessage ?? "The media service rejected the render",
    );
  }

  if (!submission.ok) {
    // Still unanswered, or the queue is still full: the render stays open, so
    // the worker's heartbeats and result still count. Its task stays
    // "submitting", so it can be sent again (see resendSequenceRender; the
    // Render panel does so by itself while the queue is full). If it never
    // reports, it is closed as stalled.
    await supabaseAdmin
      .from("sequence_renders")
      .update({ stage: busy(submission) ? RENDER_BUSY_STAGE : RENDER_UNCONFIRMED_STAGE } as never)
      .eq("id", renderId)
      .eq("status", "queued");
    return { renderId, status: "queued", duplicate: false };
  }
  // Only a task still waiting moves on: a result that already arrived wins.
  await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing" })
    .eq("id", taskId)
    .eq("status", "submitting");
  await supabaseAdmin
    .from("sequence_renders")
    .update({ status: "rendering", stage: "Starting" } as never)
    .eq("id", renderId)
    .eq("status", "queued");

  return { renderId, status: "rendering", duplicate: false };
}

/**
 * Sends again a render the media service never confirmed taking (its task is
 * still "submitting"); any other render is returned as it is.
 */
export async function resendSequenceRender(input: {
  renderId: string;
  userId: string;
}): Promise<RenderStarted> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  if (!mediaWorkerConfigured())
    throw new AppError("UNKNOWN", "Rendering needs the media service, which isn't set up.");
  return resumed(input.renderId);
}

/**
 * Finishes a render presumed lost from the files it left. The worker uploads
 * the video and its poster before it reports, so a render whose report never
 * arrived (the app couldn't take it for longer than the worker kept trying)
 * is completed from them, rather than rendered (and paid for) again. Only a
 * render that stopped reporting is looked at, and only its own two files, at
 * the paths recorded when it started, in the server-only output bucket.
 */
export async function recoverSequenceRender(input: {
  renderId: string;
  userId: string;
}): Promise<{ renderId: string; status: string; recovered: boolean }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  const unchecked = () => new AppError("UNKNOWN", "The render could not be checked. Try again.");
  const { data: render, error } = await supabaseAdmin
    .from("sequence_renders")
    .select("id,status,error_code,timeline,media_task_id,created_at,updated_at")
    .eq("id", input.renderId)
    .maybeSingle();
  if (error || !render) throw unchecked();
  const row = render as unknown as {
    status: string;
    error_code: string | null;
    timeline: unknown;
    media_task_id: string | null;
    created_at: string;
    updated_at: string | null;
  };
  const as = (recovered: boolean, status = row.status) => ({
    renderId: input.renderId,
    status,
    recovered,
  });
  const presumedLost =
    ((row.status === "queued" || row.status === "rendering") && !renderInProgress(row)) ||
    (row.status === "failed" && row.error_code === "STALLED");
  if (!presumedLost || !row.media_task_id) return as(false);

  const { data: task, error: taskError } = await supabaseAdmin
    .from("media_tasks")
    .select("id,operation_id,project_id,created_by,input_payload,storage_bucket")
    .eq("id", row.media_task_id)
    .maybeSingle();
  if (taskError || !task) throw unchecked();
  const paths = ((task.input_payload ?? {}) as { storage_paths?: unknown }).storage_paths;
  if (
    (task.storage_bucket ?? OUTPUT_BUCKET) !== OUTPUT_BUCKET ||
    !Array.isArray(paths) ||
    typeof paths[0] !== "string" ||
    typeof paths[1] !== "string"
  )
    return as(false);
  const [video, poster] = [paths[0], paths[1]];
  const [videoFile, posterFile] = await Promise.all([outputFile(video), outputFile(poster)]);
  // Not both there: it didn't finish (or is still uploading), so nothing to finish it from.
  if (!videoFile || !posterFile) return as(false);

  const timeline = parseTimeline(row.timeline);
  const size = timeline ? frameSize(timeline.aspectRatio, timeline.resolution) : null;
  const bytes = (file: { metadata?: Record<string, unknown> | null }) =>
    typeof file.metadata?.["size"] === "number" ? file.metadata["size"] : null;
  // The render is marked finished last: if a write fails on the way, it still
  // looks lost, so the next check (the Render panel keeps checking) finishes the rest.
  await finishSequenceRender(
    task,
    {
      task_id: task.id,
      status: "completed",
      outputs: [
        {
          index: 0,
          kind: "video",
          mime_type: "video/mp4",
          bytes: bytes(videoFile),
          storage_key: video,
        },
        {
          index: 1,
          kind: "image",
          mime_type: "image/jpeg",
          bytes: bytes(posterFile),
          storage_key: poster,
        },
      ],
      // What the render was asked for: the worker's own measurements didn't arrive.
      metadata: {
        ...(timeline ? { duration_seconds: layoutTimeline(timeline).total } : {}),
        ...(size ? { width: size.width, height: size.height } : {}),
        recovered_from_storage: true,
      },
    },
    { renderLast: true },
  );
  return as(true, "completed");
}

/**
 * A file in the output bucket, or null if it isn't there. Listed rather than
 * probed: a listing says plainly whether the file is there, and a storage
 * error is thrown, never read as "no file".
 */
async function outputFile(
  path: string,
): Promise<{ name: string; metadata?: Record<string, unknown> | null } | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .list(path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw new AppError("UNKNOWN", "The render's files could not be checked. Try again.");
  return (listed ?? []).find((entry) => entry.name === name) ?? null;
}

/**
 * A render asked for again: returned as it is, unless it was recorded but
 * never handed to the worker (the answer to its start was lost, or the
 * server stopped before sending it). Then it is sent now; otherwise it would
 * wait, unsent, until it is closed as stalled.
 */
async function resumed(renderId: string): Promise<RenderStarted> {
  const unchecked = () => new AppError("UNKNOWN", "The render could not be checked. Try again.");
  const { data: render, error } = await supabaseAdmin
    .from("sequence_renders")
    .select("id,status,timeline,media_task_id")
    .eq("id", renderId)
    .maybeSingle();
  if (error || !render) throw unchecked();
  const row = render as unknown as {
    id: string;
    status: string;
    timeline: unknown;
    media_task_id: string | null;
  };
  const as = (status: string): RenderStarted => ({ renderId, status, duplicate: true });
  if (row.status !== "queued" || !row.media_task_id) return as(row.status);
  const { data: task, error: taskError } = await supabaseAdmin
    .from("media_tasks")
    .select("id,status,input_payload")
    .eq("id", row.media_task_id)
    .maybeSingle();
  if (taskError) throw unchecked();
  // "submitting" until a send was tried: anything else is on its way already.
  if (!task || task.status !== "submitting") return as(row.status);
  const paths = ((task.input_payload ?? {}) as { storage_paths?: unknown }).storage_paths;
  const timeline = parseTimeline(row.timeline);
  if (
    !timeline ||
    !Array.isArray(paths) ||
    typeof paths[0] !== "string" ||
    typeof paths[1] !== "string"
  )
    return as(row.status);
  let assets: Awaited<ReturnType<typeof resolveAssets>>;
  try {
    assets = await resolveAssets(timeline);
  } catch (problem) {
    // Its media is gone (or no longer fits the edit): it can't be sent, so it
    // fails now. A lookup that merely failed leaves it as it is, to be sent
    // when it is asked for again.
    if (problem instanceof AppError && problem.code === "INVALID_PARAMETERS") {
      await supabaseAdmin.rpc(
        "fail_sequence_render" as never,
        {
          p_render_id: renderId,
          p_error_code: "STORAGE_FAILED",
          p_error_message: problem.message,
        } as never,
      );
    }
    throw problem;
  }
  const sent = await submitRender({
    renderId,
    taskId: task.id,
    assets,
    request: await renderRequestFor(timeline),
    videoPath: paths[0],
    posterPath: paths[1],
  });
  return { ...sent, duplicate: true };
}

export type RenderCredentials =
  | {
      status: 200;
      sources: { url: string }[];
      uploads: { url: string; method: "PUT"; storage_key: string }[];
      expires_at: string;
    }
  // Claimed, but its links couldn't be renewed just now: the worker goes on
  // with the ones it has (or reports them expired).
  | { status: 202 }
  | { status: 404 | 410 | 503 };

/**
 * Whether a render's worker may go on, decided by the render row (which holds
 * the edit's one active-render slot), never by its task alone:
 * - Still active: it is refreshed in the same step, so it can't be taken for
 *   stalled (and replaced) while it goes on.
 * - Presumed lost: it must take the slot back, in one step with checking that
 *   the edit still points at it (`reclaim_sequence_render`, which locks the
 *   edit as starting a render does). So this and a replacement can't both go
 *   on, whatever the timing: once the edit points at a newer render, the old
 *   task is dropped (410), even if the newer one has already finished; if
 *   this comes first, the replacement is refused as "already rendering".
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
    const { data: reclaimed, error } = await supabaseAdmin.rpc(
      "reclaim_sequence_render" as never,
      { p_render_id: renderId, p_sequence_id: sequenceId } as never,
    );
    if (error) return 503;
    if ((reclaimed as unknown as string) !== "held") return 410;
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
 * `holdRenderSlot`); otherwise the worker is told to drop it. Once it holds
 * the slot, a failure to re-sign is answered as claimed without new links
 * (202), not as unavailable: asked again and again, each check-in would keep
 * the render looking alive (so nobody could replace it) while it never starts.
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
  const input = (task.input_payload ?? {}) as Record<string, unknown>;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const ids = strings(input["sources"]);
  const paths = strings(input["storage_paths"]);
  if (!ids.length || !paths.length) return { status: 404 };

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

  const held = await holdRenderSlot(task, input);
  if (held !== 200) return { status: held };

  const { data: rows, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path")
    .in("id", [...new Set(ids)]);
  if (assetError) return { status: 202 };
  const assets = new Map((rows ?? []).map((row) => [row.id, row]));

  const sources: { url: string }[] = [];
  for (const id of ids) {
    const asset = assets.get(id);
    const url = asset ? await signSource(asset) : null;
    if (!url) return { status: 202 };
    sources.push({ url });
  }
  // Brand fonts, after the files, as first sent.
  for (const file of strings(input["font_files"])) {
    const slash = file.indexOf("/");
    const font = { bucket: file.slice(0, slash), path: file.slice(slash + 1) };
    const url =
      slash > 0 && isBrandFontFile(font)
        ? await signSource({ storage_bucket: font.bucket, storage_path: font.path })
        : null;
    if (!url) return { status: 202 };
    sources.push({ url });
  }
  const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
  for (const path of paths) {
    const url = await signUpload(task.storage_bucket ?? OUTPUT_BUCKET, path);
    if (!url) return { status: 202 };
    uploads.push({ url, method: "PUT", storage_key: path });
  }
  return {
    status: 200,
    sources,
    uploads,
    expires_at: new Date(Date.now() + LINKS_VALID_MS).toISOString(),
  };
}
