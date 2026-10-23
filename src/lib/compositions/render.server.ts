/**
 * Drawing compositions: a composition compiled (its page and its track), kept
 * in storage as the bundle the media worker draws from, drawn once (keyed by a
 * hash of everything that decides its frames, so the same composition is
 * never drawn twice), long ones in stretches side by side on as many workers
 * as there are and joined frame for frame, and each stretch kept on its own
 * hash, so a change draws only the stretches it touches (the handover's A3).
 *
 * The media worker's results come back through the usual callback
 * (./callback.server). See docs/compositions.md.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { brandKitOf, isBrandFontFile } from "../edit/brand";
import { isMissingTableError } from "../edit/errors";
import { sendTask, taskRoutes, unanswered } from "../media/submit.server";
import {
  gpuWorkerConfigured,
  gpuWorkerHealth,
  mediaWorkerConfigured,
  submitGpuWorkerTask,
  workerHealth,
  type MediaWorkerTask,
} from "../media/worker.server";
import { compositionBrandOf } from "./brand";
import {
  compileComposition,
  compositionFiles,
  compositionIdentity,
  planStretches,
  STRETCH_FRAMES,
  stretchIdentity,
  type CompiledComposition,
} from "./compile";
import { QUALITY_SETTINGS, renderEstimate, type RenderQuality } from "./settings";
import { compositionSpecSchema, uuidsIn, type CompositionSpec } from "./spec";
import { templateById } from "./templates";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 2 * 60 * 60;
export const COMPOSITIONS_MIGRATION = "0034_compositions";
export const COMPOSITIONS_NOT_SET_UP = `Motion graphics need a database update (migration ${COMPOSITIONS_MIGRATION}). Ask an admin to apply it.`;

/** A composition render as the Editor and the API see it. */
export interface CompositionRenderView {
  renderId: string;
  status: "queued" | "drawing" | "joining" | "completed" | "failed";
  quality: RenderQuality;
  progress: number;
  stage: string | null;
  /** The playable copy, once drawn: the library video an Editor clip plays. */
  assetId: string | null;
  frames: number;
  drawings: number;
  changing: number;
  stretches: number;
  /** About how long it takes from the start, in seconds. */
  estimateSeconds: number;
  /** Fields the demo record lacks that the composition's text names. */
  missing: string[];
  errorMessage: string | null;
  /** Drawn before: nothing new was drawn for this request. */
  cached: boolean;
  /** What was drawn: the composition, its brand kit and its frame. */
  template: string;
  spec: Omit<CompositionSpec, "params"> & { params: { [key: string]: Json | undefined } };
  brandKitId: string | null;
  width: number;
  height: number;
  fps: number;
  /** The hash of everything that decides its frames (see compositionIdentity). */
  hash: string;
}

type RenderRow = {
  id: string;
  hash: string;
  template: string;
  spec: CompositionSpec;
  brand_kit_id: string | null;
  fps: number;
  status: CompositionRenderView["status"];
  quality: RenderQuality;
  progress: number;
  stage: string | null;
  proxy_asset_id: string | null;
  frames: number;
  drawings: number;
  changing: number;
  stretches: { from: number; to: number; hash: string; stretch_id: string }[];
  missing_fields: string[];
  error_message: string | null;
  width: number;
  height: number;
  seconds_per_drawing: number | null;
  master_bucket: string | null;
  master_path: string | null;
  media_task_id: string | null;
  updated_at: string;
};

const RENDER_FIELDS =
  "id,hash,template,spec,brand_kit_id,fps,status,quality,progress,stage,proxy_asset_id,frames,drawings,changing,stretches,missing_fields,error_message,width,height,seconds_per_drawing,master_bucket,master_path,media_task_id,updated_at";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Throws the plain "needs a database update" when the tables aren't there yet. */
function unlessMissing(error: unknown): never {
  if (isMissingTableError(error)) throw new AppError("INVALID_PARAMETERS", COMPOSITIONS_NOT_SET_UP);
  throw new AppError("UNKNOWN", "The motion graphic couldn't be recorded. Try again.");
}

async function requireActiveMember(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

type ImageRow = {
  id: string;
  asset_type: string;
  width: number | null;
  height: number | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
};

/** A composition compiled as it will be drawn, with the files the media worker needs. */
export async function compiledFor(input: {
  spec: CompositionSpec;
  brandKitId: string | null;
  width: number;
  height: number;
  fps: number;
  quality: RenderQuality;
}): Promise<{
  compiled: CompiledComposition;
  images: ImageRow[];
  hash: string;
}> {
  const spec = compositionSpecSchema.parse(input.spec);
  const template = templateById(spec.template);
  if (!template)
    throw new AppError(
      "INVALID_PARAMETERS",
      `There is no motion graphic called "${spec.template}"`,
    );
  if (spec.duration < template.duration.min || spec.duration > template.duration.max)
    throw new AppError(
      "INVALID_PARAMETERS",
      `${template.title} runs ${template.duration.min} to ${template.duration.max} seconds`,
    );
  let kitRow: Record<string, unknown> | null = null;
  if (input.brandKitId) {
    const { data } = await supabaseAdmin
      .from("brand_kits")
      .select("*")
      .eq("id", input.brandKitId)
      .eq("is_archived", false)
      .maybeSingle();
    if (!data) throw new AppError("INVALID_PARAMETERS", "That brand kit doesn't exist");
    kitRow = data as unknown as Record<string, unknown>;
  }
  // The kit as it is now: its colours, production roles, motion and demo record.
  const brand = compositionBrandOf(kitRow ? brandKitOf(kitRow) : null);
  // The images its settings and its brand name: their sizes frame them, and they go with the task.
  const wanted = uuidsIn(spec.params);
  if (brand.logoAssetId) wanted.add(brand.logoAssetId);
  const { data: rows, error } = wanted.size
    ? await supabaseAdmin
        .from("assets")
        .select("id,asset_type,width,height,storage_bucket,storage_path,mime_type")
        .in("id", [...wanted])
        .is("deleted_at", null)
    : { data: [], error: null };
  if (error) throw new AppError("UNKNOWN", "The motion graphic's images couldn't be checked");
  const images = ((rows ?? []) as unknown as ImageRow[]).filter(
    (row) => row.asset_type === "image",
  );
  const byId = new Map(images.map((row) => [row.id, row]));
  let compiled: CompiledComposition;
  try {
    compiled = compileComposition({
      spec,
      brand,
      width: input.width,
      height: input.height,
      fps: input.fps,
      settings: QUALITY_SETTINGS[input.quality],
      imageInfo: (assetId) => {
        const row = byId.get(assetId);
        return row?.width && row.height ? { width: row.width, height: row.height } : null;
      },
    });
  } catch (problem) {
    throw new AppError(
      "INVALID_PARAMETERS",
      problem instanceof Error ? problem.message : "The motion graphic's settings aren't valid",
    );
  }
  for (const assetId of compiled.imageIds)
    if (!byId.has(assetId))
      throw new AppError(
        "INVALID_PARAMETERS",
        "A picture this motion graphic shows is no longer in the library (or isn't a picture). Choose another.",
      );
  // A reference marked layout only (a client's screen) is never placed in a frame.
  const { assertPlaceable } = await import("../media/layout-only.server");
  await assertPlaceable(compiled.imageIds, "motion");
  for (const font of compiled.fonts)
    if (!isBrandFontFile(font))
      throw new AppError("INVALID_PARAMETERS", `The font "${font.family}" isn't a brand font file`);
  // What decides its frames: the bundle, and exactly which files it reads.
  const hash = sha256(compositionIdentity(compiled));
  return { compiled, images: compiled.imageIds.map((id) => byId.get(id)!), hash };
}

/** The view of a recorded render. */
function viewOf(
  row: RenderRow,
  cached: boolean,
  secondsPerDrawing: number | null,
): CompositionRenderView {
  const settings = QUALITY_SETTINGS[row.quality];
  return {
    renderId: row.id,
    status: row.status,
    quality: row.quality,
    progress: Number(row.progress) || 0,
    stage: row.stage,
    assetId: row.proxy_asset_id,
    frames: row.frames,
    drawings: row.drawings,
    changing: row.changing,
    stretches: Math.max(1, (row.stretches ?? []).length),
    estimateSeconds: renderEstimate({
      frames: row.frames,
      settings,
      changing: row.changing,
      secondsPerDrawing: row.seconds_per_drawing ?? secondsPerDrawing,
      width: row.width,
      height: row.height,
      browsers: 2,
    }).seconds,
    missing: row.missing_fields ?? [],
    errorMessage: row.error_message,
    cached,
    template: row.template,
    spec: row.spec as CompositionRenderView["spec"],
    brandKitId: row.brand_kit_id,
    width: row.width,
    height: row.height,
    fps: row.fps,
    hash: row.hash,
  };
}

/**
 * What one drawing has been measured to take at this quality (the median of
 * the latest renders the media worker measured), for estimates.
 */
export async function measuredSecondsPerDrawing(quality: RenderQuality): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("composition_renders" as never)
    .select("seconds_per_drawing")
    .eq("quality", quality)
    .eq("status", "completed")
    .not("seconds_per_drawing", "is", null)
    .order("completed_at", { ascending: false })
    .limit(15);
  if (error) return null;
  const values = ((data ?? []) as { seconds_per_drawing: number | null }[])
    .map((row) => Number(row.seconds_per_drawing))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)]! : null;
}

async function renderRow(renderId: string): Promise<RenderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("composition_renders" as never)
    .select(RENDER_FIELDS)
    .eq("id", renderId)
    .maybeSingle();
  if (error) unlessMissing(error);
  return data as unknown as RenderRow | null;
}

/** A recorded render, by id (one whose drawing was lost is failed first, saying so). */
export async function compositionRender(renderId: string): Promise<CompositionRenderView> {
  let row = await renderRow(renderId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That motion graphic render doesn't exist");
  if (await settleLost(row)) row = (await renderRow(renderId)) ?? row;
  return viewOf(row, false, await measuredSecondsPerDrawing(row.quality));
}

/**
 * The media worker reports on every task it holds at least once a minute
 * (progress, or a heartbeat while it waits in the queue), so a drawing it has
 * said nothing about for ten minutes was lost: the worker restarted, or the
 * task never reached it.
 */
const LOST_AFTER_MS = 10 * 60_000;

/** Why a drawing's media task is lost (failed, closed as lost, or silent), or null while it lives. */
async function lostTask(taskId: string | null): Promise<string | null> {
  if (!taskId) return null;
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select("status,error_message,updated_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "failed" || data.status === "cancelled")
    return data.error_message ?? "The media service couldn't draw it";
  if (
    (data.status === "submitting" || data.status === "processing") &&
    Date.now() - Date.parse(data.updated_at) > LOST_AFTER_MS
  )
    return "The media service stopped answering while drawing it. Draw it again.";
  return null;
}

/**
 * A drawing under way whose task was lost fails (a lost stretch fails, and the
 * render with it), so asking for it again draws it afresh instead of waiting
 * for ever. Returns whether anything changed.
 */
async function settleLost(row: RenderRow): Promise<boolean> {
  if (row.status !== "queued" && row.status !== "drawing" && row.status !== "joining") return false;
  if (row.status === "drawing" && row.stretches?.length) {
    const { data } = await supabaseAdmin
      .from("composition_stretches" as never)
      .select("id,status,media_task_id")
      .in(
        "id",
        row.stretches.map((stretch) => stretch.stretch_id),
      );
    let lost = false;
    for (const stretch of (data ?? []) as {
      id: string;
      status: string;
      media_task_id: string | null;
    }[]) {
      if (stretch.status !== "drawing") continue;
      const why = await lostTask(stretch.media_task_id);
      if (!why) continue;
      await supabaseAdmin
        .from("composition_stretches" as never)
        .update({ status: "failed", error_code: "STALLED", error_message: why } as never)
        .eq("id", stretch.id)
        .eq("status", "drawing");
      lost = true;
    }
    if (lost) await joinIfReady(row.id);
    return lost;
  }
  // Recorded but never sent (the request that started it was cut off).
  const why = row.media_task_id
    ? await lostTask(row.media_task_id)
    : Date.now() - Date.parse(row.updated_at) > LOST_AFTER_MS
      ? "The motion graphic was never sent to the media service. Draw it again."
      : null;
  if (!why) return false;
  await failRender(row.id, "STALLED", why);
  return true;
}

/** Settles a drawing that was lost (see settleLost), by id. */
export async function settleLostDrawing(renderId: string): Promise<boolean> {
  const row = await renderRow(renderId);
  return row ? settleLost(row) : false;
}

/**
 * Starts drawing a composition at a quality, or returns the drawing already
 * made (or under way) of the same composition. A final one goes ahead of
 * drafts in the media worker's queue.
 */
export async function startCompositionRender(input: {
  userId: string;
  projectId: string | null;
  spec: CompositionSpec;
  brandKitId: string | null;
  quality: RenderQuality;
  width: number;
  height: number;
  fps: number;
}): Promise<CompositionRenderView> {
  await requireActiveMember(input.userId);
  const { compiled, images, hash } = await compiledFor(input);
  const secondsPerDrawing = await measuredSecondsPerDrawing(input.quality);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("composition_renders" as never)
    .select(RENDER_FIELDS)
    .eq("hash", hash)
    .maybeSingle();
  if (existingError) unlessMissing(existingError);
  let before = existing as unknown as RenderRow | null;
  // Under way but lost: failed now, and drawn again below on the same record.
  if (before && (await settleLost(before))) before = await renderRow(before.id);
  if (before && before.status !== "failed") {
    // Drawn already (its playable copy still in the library), or under way.
    if (before.status !== "completed" || (await assetExists(before.proxy_asset_id)))
      return viewOf(before, before.status === "completed", secondsPerDrawing);
  }

  if (!mediaWorkerConfigured())
    throw new AppError(
      "UNKNOWN",
      "Motion graphics are drawn by the media service. An administrator needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );
  const gpu = compiled.bundle.webgl && gpuWorkerConfigured();
  const health = gpu ? await gpuWorkerHealth() : await workerHealth();
  if (!health.ok)
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "The media service isn't answering. Try again in a moment.",
    );
  if (!health.data?.features?.includes("compositions"))
    throw new AppError(
      "INVALID_PARAMETERS",
      "The media service can't draw motion graphics until it is updated (it needs a browser in its image). Deploy the latest media worker, then try again.",
    );

  const bundlePath = `compositions/${hash}/bundle.json`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .upload(bundlePath, new TextEncoder().encode(JSON.stringify(compiled.bundle)), {
      contentType: "application/json",
      upsert: true,
    });
  if (uploadError) throw new AppError("STORAGE_FAILED", "The motion graphic couldn't be stored");

  const settings = QUALITY_SETTINGS[input.quality];
  const values = {
    hash,
    template: input.spec.template,
    template_version: input.spec.version,
    spec: input.spec,
    brand_kit_id: input.brandKitId,
    quality: input.quality,
    settings,
    width: input.width,
    height: input.height,
    fps: input.fps,
    frames: compiled.bundle.frames,
    drawings: compiled.bundle.drawings.length,
    changing: compiled.changing,
    webgl: compiled.bundle.webgl,
    status: "queued",
    stage: "Waiting for the media service",
    progress: 0,
    priority: input.quality === "final" ? "final" : "draft",
    bundle_bucket: OUTPUT_BUCKET,
    bundle_path: bundlePath,
    missing_fields: compiled.missing,
    error_code: null,
    error_message: null,
    project_id: input.projectId,
    created_by: input.userId,
  };
  let row: RenderRow;
  if (before) {
    // Failed before: drawn again, on the same record.
    const { data, error } = await supabaseAdmin
      .from("composition_renders" as never)
      .update({ ...values, stretches: [], media_task_id: null, completed_at: null } as never)
      .eq("id", before.id)
      .eq("status", "failed")
      .select(RENDER_FIELDS)
      .maybeSingle();
    if (error) unlessMissing(error);
    if (!data) return compositionRender(before.id);
    row = data as unknown as RenderRow;
  } else {
    const { data, error } = await supabaseAdmin
      .from("composition_renders" as never)
      .insert(values as never)
      .select(RENDER_FIELDS)
      .maybeSingle();
    if (error?.code === "23505") {
      // Asked for twice at once: the other request's record is this one.
      const { data: raced } = await supabaseAdmin
        .from("composition_renders" as never)
        .select(RENDER_FIELDS)
        .eq("hash", hash)
        .maybeSingle();
      if (raced) return viewOf(raced as unknown as RenderRow, false, secondsPerDrawing);
    }
    if (error || !data) unlessMissing(error);
    row = data as unknown as RenderRow;
  }

  const context = {
    renderId: row.id,
    hash,
    userId: input.userId,
    projectId: input.projectId,
    bundle: { bucket: OUTPUT_BUCKET, path: bundlePath },
    images,
    fonts: compiled.fonts,
    priority: values.priority as "draft" | "final",
    gpu,
  };
  try {
    // A long final composition is drawn in stretches, side by side; anything else in one go.
    const stretches =
      input.quality === "final" && compiled.bundle.frames > STRETCH_FRAMES * 1.5
        ? planStretches(compiled.bundle.frames)
        : null;
    if (stretches) await drawInStretches(context, compiled, stretches);
    else await drawWhole(context);
  } catch (problem) {
    const message =
      problem instanceof AppError
        ? problem.message
        : "The media service refused the motion graphic";
    await supabaseAdmin
      .from("composition_renders" as never)
      .update({ status: "failed", error_code: "SUBMIT_FAILED", error_message: message } as never)
      .eq("id", row.id);
    throw problem;
  }
  return compositionRender(row.id);
}

async function assetExists(assetId: string | null): Promise<boolean> {
  if (!assetId) return false;
  const { data } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

interface DrawContext {
  renderId: string;
  hash: string;
  userId: string;
  projectId: string | null;
  bundle: { bucket: string; path: string };
  images: ImageRow[];
  fonts: CompiledComposition["fonts"];
  priority: "draft" | "final";
  gpu: boolean;
}

/** The files a drawing task reads: the bundle, then its images and fonts, in the bundle's order. */
function drawingSources(context: DrawContext): SourceFile[] {
  return [
    {
      bucket: context.bundle.bucket,
      path: context.bundle.path,
      role: "data",
      mime: "application/json",
    },
    ...context.images.map((image) => ({
      bucket: image.storage_bucket,
      path: image.storage_path,
      role: "image",
      mime: image.mime_type,
    })),
    ...context.fonts.map((font) => ({
      bucket: font.bucket,
      path: font.path,
      role: "font",
      mime: null,
    })),
  ];
}

const outputsDir = (hash: string) => `compositions/${hash}`;

/** The whole composition in one task: its playable copy, its master and its poster. */
async function drawWhole(context: DrawContext): Promise<void> {
  const dir = outputsDir(context.hash);
  const taskId = await sendCompositionTask({
    taskType: "render_composition",
    sources: drawingSources(context),
    storagePaths: [`${dir}/composition.mp4`, `${dir}/master.mkv`, `${dir}/poster.jpg`],
    params: { output: "full", priority: context.priority },
    dedupeKey: `composition:${context.hash}:whole:${Date.now()}`,
    payload: { composition_render_id: context.renderId, composition_step: "whole" },
    context,
  });
  await supabaseAdmin
    .from("composition_renders" as never)
    .update({ status: "drawing", stage: "Drawing", media_task_id: taskId } as never)
    .eq("id", context.renderId);
}

/**
 * A long composition in stretches: each stretch already drawn (by any earlier
 * render of a composition that starts and runs the same way) is reused, and
 * the rest are sent at once, to be drawn side by side. Once every stretch is
 * in, they are joined (see joinIfReady).
 */
async function drawInStretches(
  context: DrawContext,
  compiled: CompiledComposition,
  plan: { from: number; to: number }[],
): Promise<void> {
  const files = compositionFiles(compiled);
  const stretches: RenderRow["stretches"] = [];
  for (const { from, to } of plan) {
    const hash = sha256(stretchIdentity(compiled.bundle, from, to, files));
    const { data: found } = await supabaseAdmin
      .from("composition_stretches" as never)
      .select("id,status,media_task_id")
      .eq("hash", hash)
      .maybeSingle();
    type StretchRow = { id: string; status: string; media_task_id: string | null };
    let stretch = found as StretchRow | null;
    if (!stretch) {
      const { data: added, error } = await supabaseAdmin
        .from("composition_stretches" as never)
        .insert({ hash, from_frame: from, to_frame: to, render_id: context.renderId } as never)
        .select("id,status,media_task_id")
        .maybeSingle();
      if (error?.code === "23505") {
        const { data: raced } = await supabaseAdmin
          .from("composition_stretches" as never)
          .select("id,status,media_task_id")
          .eq("hash", hash)
          .maybeSingle();
        stretch = raced as StretchRow | null;
      } else if (error) unlessMissing(error);
      else stretch = added as StretchRow | null;
    }
    if (!stretch)
      throw new AppError("UNKNOWN", "A stretch of the motion graphic couldn't be recorded");
    stretches.push({ from, to, hash, stretch_id: stretch.id });
    // Drawn before, or being drawn for another render: nothing to send (unless that drawing was lost).
    if (stretch.status === "completed") continue;
    if (stretch.status === "drawing" && !(await lostTask(stretch.media_task_id))) continue;
    const taskId = await sendCompositionTask({
      taskType: "render_composition",
      sources: drawingSources(context),
      storagePaths: [`compositions/stretches/${hash}.mkv`],
      params: { output: "stretch", from_frame: from, to_frame: to, priority: context.priority },
      dedupeKey: `composition-stretch:${hash}:${Date.now()}`,
      payload: { composition_stretch_id: stretch.id, composition_step: "stretch" },
      context,
    });
    await supabaseAdmin
      .from("composition_stretches" as never)
      .update({
        status: "drawing",
        media_task_id: taskId,
        error_code: null,
        error_message: null,
      } as never)
      .eq("id", stretch.id);
  }
  await supabaseAdmin
    .from("composition_renders" as never)
    .update({
      status: "drawing",
      stage: `Drawing ${stretches.length} stretches side by side`,
      stretches,
    } as never)
    .eq("id", context.renderId);
  await joinIfReady(context.renderId);
}

/**
 * Joins a render's stretches once all of them are drawn (and fails it if one
 * failed). Safe to call again: a render already joining or done is left alone.
 */
export async function joinIfReady(renderId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("composition_renders" as never)
    .select("id,hash,status,stretches,fps,frames,project_id,created_by,priority,webgl")
    .eq("id", renderId)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    hash: string;
    status: string;
    stretches: RenderRow["stretches"];
    fps: number;
    frames: number;
    project_id: string | null;
    created_by: string | null;
    priority: "draft" | "final";
    webgl: boolean;
  } | null;
  if (!row || row.status !== "drawing" || !row.stretches.length) return;
  const { data: rows } = await supabaseAdmin
    .from("composition_stretches" as never)
    .select("id,status,master_bucket,master_path,error_message,progress")
    .in(
      "id",
      row.stretches.map((stretch) => stretch.stretch_id),
    );
  const stretches = new Map(
    (
      (rows ?? []) as {
        id: string;
        status: string;
        master_bucket: string | null;
        master_path: string | null;
        error_message: string | null;
        progress: number;
      }[]
    ).map((stretch) => [stretch.id, stretch]),
  );
  const failed = [...stretches.values()].find((stretch) => stretch.status === "failed");
  if (failed) {
    await failRender(
      row.id,
      "STRETCH_FAILED",
      failed.error_message ?? "A stretch of the motion graphic couldn't be drawn",
    );
    return;
  }
  const ready = row.stretches.filter((stretch) => {
    const found = stretches.get(stretch.stretch_id);
    return found?.status === "completed" && found.master_path;
  });
  const progress =
    row.stretches.reduce((sum, stretch) => {
      const found = stretches.get(stretch.stretch_id);
      return sum + (found?.status === "completed" ? 1 : Number(found?.progress) || 0);
    }, 0) / row.stretches.length;
  if (ready.length < row.stretches.length) {
    await supabaseAdmin
      .from("composition_renders" as never)
      .update({
        progress: Math.min(0.9, progress * 0.9),
        stage: `Drawing: ${ready.length} of ${row.stretches.length} stretches drawn`,
      } as never)
      .eq("id", row.id)
      .eq("status", "drawing");
    return;
  }
  // Only one request moves it on to joining.
  const { data: claimed } = await supabaseAdmin
    .from("composition_renders" as never)
    .update({ status: "joining", stage: "Joining the stretches", progress: 0.9 } as never)
    .eq("id", row.id)
    .eq("status", "drawing")
    .select("id");
  if (!claimed?.length) return;
  const dir = outputsDir(row.hash);
  try {
    const taskId = await sendCompositionTask({
      taskType: "join_stretches",
      sources: row.stretches.map((stretch) => {
        const found = stretches.get(stretch.stretch_id)!;
        return {
          bucket: found.master_bucket ?? OUTPUT_BUCKET,
          path: found.master_path!,
          role: "video",
          mime: "video/x-matroska",
        };
      }),
      storagePaths: [`${dir}/composition.mp4`, `${dir}/master.mkv`, `${dir}/poster.jpg`],
      params: { fps: row.fps, frames: row.frames, priority: row.priority },
      dedupeKey: `composition-join:${row.hash}:${Date.now()}`,
      payload: { composition_render_id: row.id, composition_step: "join" },
      context: { userId: row.created_by ?? "", projectId: row.project_id, gpu: false },
    });
    await supabaseAdmin
      .from("composition_renders" as never)
      .update({ media_task_id: taskId } as never)
      .eq("id", row.id);
  } catch (problem) {
    await failRender(
      row.id,
      "SUBMIT_FAILED",
      problem instanceof AppError ? problem.message : "The stretches couldn't be joined",
    );
  }
}

/** Marks a render failed (and with it any edit render waiting on it: see ./sequence.server). */
export async function failRender(renderId: string, code: string, message: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("composition_renders" as never)
    .update({ status: "failed", error_code: code, error_message: message.slice(0, 500) } as never)
    .eq("id", renderId)
    .neq("status", "completed")
    .select("id");
  if (!data?.length) return;
  const { compositionSettled } = await import("./sequence.server");
  await compositionSettled(renderId);
}

/* ------------------------------------------------------------------ */
/* Sending a task                                                      */
/* ------------------------------------------------------------------ */

interface SourceFile {
  bucket: string;
  path: string;
  role: string;
  mime: string | null;
}

/**
 * Records a composition task and sends it to the media worker (the GPU one,
 * for a composition that draws with WebGL, when there is one). Its sources are
 * named by where they are kept (`source_files`), so the worker can have them
 * signed afresh if the task waits in its queue (see refreshTaskCredentials).
 * Returns the task's id.
 */
async function sendCompositionTask(input: {
  taskType: "render_composition" | "join_stretches";
  sources: SourceFile[];
  storagePaths: string[];
  params: Record<string, unknown>;
  dedupeKey: string;
  payload: Record<string, unknown>;
  context: Pick<DrawContext, "userId" | "projectId" | "gpu">;
}): Promise<string> {
  const taskId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("media_tasks").insert({
    id: taskId,
    created_by: input.context.userId || null,
    project_id: input.context.projectId,
    task_type: input.taskType,
    status: "submitting",
    storage_bucket: OUTPUT_BUCKET,
    storage_path: input.storagePaths[0] ?? null,
    input_payload: {
      params: input.params,
      source_files: input.sources,
      storage_paths: input.storagePaths,
      register_outputs: false,
      ...(input.context.gpu ? { gpu_worker: true } : {}),
      ...input.payload,
    } as never,
    dedupe_key: input.dedupeKey,
    submitted_at: new Date().toISOString(),
  } as never);
  if (error) throw new AppError("UNKNOWN", "The motion graphic's task couldn't be recorded");

  const sources: MediaWorkerTask["sources"] = [];
  for (const source of input.sources) {
    const { data } = await supabaseAdmin.storage
      .from(source.bucket)
      .createSignedUrl(source.path, SOURCE_URL_TTL);
    if (!data?.signedUrl)
      throw new AppError(
        "STORAGE_FAILED",
        "A file for the motion graphic couldn't be read from storage",
      );
    sources.push({ role: source.role, url: data.signedUrl, mime: source.mime });
  }
  const uploads: MediaWorkerTask["uploads"] = [];
  for (const path of input.storagePaths) {
    const { data, error: signError } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signError || !data?.signedUrl)
      throw new AppError("STORAGE_FAILED", "A place for the motion graphic couldn't be prepared");
    uploads.push({ url: data.signedUrl, method: "PUT", storage_key: path });
  }
  const task: MediaWorkerTask = {
    task_id: taskId,
    task_type: input.taskType,
    sources,
    uploads,
    params: input.params,
    report_progress: true,
    ...taskRoutes(),
  };
  const submission = input.context.gpu ? await submitGpuWorkerTask(task) : await sendTask(task);
  if (!submission.ok && !unanswered(submission)) {
    await supabaseAdmin
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: submission.errorCode ?? "UNKNOWN",
        error_message: submission.errorMessage ?? "The media service refused the task",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    throw new AppError(
      "INVALID_PARAMETERS",
      submission.errorMessage ?? "The media service refused the motion graphic",
    );
  }
  // No answer may still mean it was taken: the worker checks in before it starts.
  await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing" })
    .eq("id", taskId)
    .eq("status", "submitting");
  return taskId;
}
