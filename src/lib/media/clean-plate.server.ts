/**
 * The clean-plate recipe, run (see ./clean-plate). A recipe is kept as an
 * operation (operation_type "clean_plate_recipe"): members can read it, only
 * the server writes it, and each change is written only over the version it
 * was made from (the operation's attempt counts its versions), so the app,
 * the API and the media worker's results can move it on at once without one
 * undoing another.
 *
 * Every job a step starts has a key of the recipe, the step and its attempt,
 * so a repeat never makes or bills anything twice. A recipe moves on when it
 * is read and when one of its media tasks reports (see the media worker
 * callback).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { defaultsForModel, type ModelRegistryEntry } from "../model-schema";
import {
  anchorFor,
  animationInputs,
  animationPrompt,
  canStart,
  EDIT_PROMPT,
  editInputs,
  failed,
  finished,
  letteringTaskParams,
  newRecipe,
  nextWorkerStep,
  plateTaskParams,
  PLATE_STEPS,
  recipeOf,
  recipeStatus,
  recipeView,
  retried,
  started,
  withLanding,
  withMask,
  type BilledStep,
  type CleanPlateRecipe,
  type CleanPlateView,
  type JsonRecord,
  type Letters,
  type LetteringFile,
  type PlateEnd,
  type PlateStep,
  type WorkerStep,
} from "./clean-plate";
import { enqueueInternalMediaTask } from "./enqueue.server";
import { requireActiveMember } from "./members.server";
import { letteringBoxes, type Box } from "./text-boxes";
import { requireWorkerFeature } from "./worker-feature.server";

export const OPERATION_TYPE = "clean_plate_recipe";

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

interface RecipeRow {
  id: string;
  created_by: string;
  project_id: string | null;
  attempt: number;
  output_payload: unknown;
}

const ROW_COLUMNS = "id,created_by,project_id,attempt,output_payload";

async function loadRecipe(recipeId: string): Promise<{ row: RecipeRow; recipe: CleanPlateRecipe }> {
  const { data, error } = await supabaseAdmin
    .from("operations")
    .select(ROW_COLUMNS)
    .eq("id", recipeId)
    .eq("operation_type", OPERATION_TYPE)
    .maybeSingle();
  if (error) throw new AppError("UNKNOWN", "The recipe couldn't be read. Try again.");
  const recipe = data ? recipeOf((data as RecipeRow).output_payload) : null;
  if (!data || !recipe)
    throw new AppError("INVALID_PARAMETERS", "That clean-plate recipe doesn't exist");
  return { row: data as RecipeRow, recipe };
}

/** The operation's own status, from the recipe's. */
function operationStatus(recipe: CleanPlateRecipe): string {
  const status = recipeStatus(recipe);
  return status === "waiting" ? "running" : status;
}

/** Writes the recipe over the version it was read at; false when it changed meanwhile. */
async function saveRecipe(row: RecipeRow, recipe: CleanPlateRecipe): Promise<boolean> {
  const status = operationStatus(recipe);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("operations")
    .update({
      output_payload: recipe as never,
      attempt: row.attempt + 1,
      status,
      completed_at: status === "completed" ? now : null,
      failed_at: status === "failed" ? now : null,
    })
    .eq("id", row.id)
    .eq("attempt", row.attempt)
    .select("id");
  if (error) throw new AppError("UNKNOWN", "The recipe couldn't be saved. Try again.");
  return !!data?.length;
}

/**
 * Changes a recipe: `change` is made to it as it is now, and written over that
 * version; if it changed meanwhile, made again to the new one (a few times).
 */
async function changeRecipe(
  recipeId: string,
  change: (
    recipe: CleanPlateRecipe,
    row: RecipeRow,
  ) => Promise<CleanPlateRecipe> | CleanPlateRecipe,
): Promise<CleanPlateRecipe> {
  for (let tries = 0; tries < 4; tries += 1) {
    const { row, recipe } = await loadRecipe(recipeId);
    const next = await change(recipe, row);
    if (next === recipe || (await saveRecipe(row, next))) return next;
  }
  throw new AppError("UNKNOWN", "The recipe is changing too often to save just now. Try again.");
}

async function activeModel(modelId: string): Promise<ModelRegistryEntry> {
  const { data } = await supabaseAdmin
    .from("model_registry")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();
  if (!data || !data.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  return data as unknown as ModelRegistryEntry;
}

interface FileRow {
  id: string;
  asset_type: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  project_id: string | null;
}

async function libraryFiles(ids: string[]): Promise<Map<string, FileRow>> {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,title,width,height,project_id")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", "The library couldn't be read. Try again.");
  return new Map(((data ?? []) as FileRow[]).map((row) => [row.id, row]));
}

/** A picture's size: as the library has it, else read from the file's header. */
async function pictureSize(file: FileRow): Promise<{ width: number; height: number }> {
  if (file.width && file.height) return { width: file.width, height: file.height };
  const { data } = await supabaseAdmin.storage
    .from(file.storage_bucket)
    .download(file.storage_path);
  const { imageSize } = await import("../brand/fetch.server");
  const size = data ? imageSize(new Uint8Array(await data.arrayBuffer())) : null;
  if (!size) throw new AppError("INVALID_PARAMETERS", "The art's size couldn't be read");
  return size;
}

export interface StartCleanPlate {
  userId: string;
  artAssetId: string;
  /** A transparent file of the lettering, and where it sits on the art (shares; the whole art if not given). */
  lettering?:
    | {
        assetId: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
      }
    | null
    | undefined;
  /** Boxes over the lettering (shares of the art); else the AI reads where it is. */
  boxes?: Box[] | null | undefined;
  letters?: Letters | undefined;
  projectId?: string | null | undefined;
  title?: string | null | undefined;
  /** One recipe per key: asking again returns the one started. */
  dedupeKey: string;
}

/**
 * Starts a recipe for a picture (the art), with its mask proposed: from the
 * lettering file, the boxes given, or the AI's reading of the lettering.
 * Nothing is made until a person uses the mask.
 */
export async function startCleanPlate(input: StartCleanPlate): Promise<CleanPlateView> {
  await requireActiveMember(input.userId);
  const { data: known } = await supabaseAdmin
    .from("operations")
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .eq("operation_type", OPERATION_TYPE)
    .maybeSingle();
  if (known) return getCleanPlate(known.id, input.userId);

  const files = await libraryFiles(
    [input.artAssetId, input.lettering?.assetId].filter((id): id is string => !!id),
  );
  const art = files.get(input.artAssetId);
  if (!art || art.asset_type !== "image")
    throw new AppError("INVALID_PARAMETERS", "The art must be a picture in the library");
  const letteringFile = input.lettering ? files.get(input.lettering.assetId) : null;
  if (input.lettering && (!letteringFile || letteringFile.asset_type !== "image"))
    throw new AppError("INVALID_PARAMETERS", "The lettering file must be a picture in the library");
  // The art goes to an image model; a layout-only picture never does.
  const { assertPlaceable } = await import("./layout-only.server");
  await assertPlaceable([art.id, letteringFile?.id], "generation");
  const size = await pictureSize(art);

  const lettering: LetteringFile | null = input.lettering
    ? {
        assetId: input.lettering.assetId,
        x: input.lettering.x ?? 0,
        y: input.lettering.y ?? 0,
        w: input.lettering.w ?? 1,
        h: input.lettering.h ?? 1,
      }
    : null;
  let boxes: Box[] = input.boxes ?? [];
  let source: CleanPlateRecipe["mask"]["source"] = input.boxes
    ? "person"
    : lettering
      ? "file"
      : "ai";
  let note: string | null = null;
  if (!input.boxes && !lettering) {
    const { data: signed } = await supabaseAdmin.storage
      .from(art.storage_bucket)
      .createSignedUrl(art.storage_path, 900);
    const { readTextBoxes } = await import("./text-boxes.server");
    const reading = signed?.signedUrl
      ? await readTextBoxes({ url: signed.signedUrl, purpose: "lettering" })
      : { ok: false as const, message: "The art couldn't be read from storage" };
    if (reading.ok) {
      boxes = letteringBoxes(reading.pieces, size.width / size.height);
      if (!boxes.length) note = "The AI found no lettering in the art. Draw boxes over it.";
    } else {
      note = `The lettering couldn't be read (${reading.message}). Draw boxes over it, or give a transparent file of it.`;
    }
    source = "ai";
  }

  const recipe = newRecipe({
    title: (input.title ?? art.title ?? "Logo").slice(0, 160),
    art: { assetId: art.id, ...size },
    boxes,
    lettering,
    source,
    ...(input.letters ? { letters: input.letters } : {}),
    note,
  });
  const { data: row, error } = await supabaseAdmin
    .from("operations")
    .insert({
      created_by: input.userId,
      project_id: input.projectId ?? art.project_id ?? null,
      operation_type: OPERATION_TYPE,
      provider: "media_worker",
      status: "running",
      input_payload: { art_asset_id: art.id, title: recipe.title } as never,
      output_payload: recipe as never,
      dedupe_key: input.dedupeKey,
      attempt: 0,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") {
    const { data: raced } = await supabaseAdmin
      .from("operations")
      .select("id")
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();
    if (raced) return getCleanPlate(raced.id, input.userId);
  }
  if (error || !row) throw new AppError("UNKNOWN", "The recipe couldn't be recorded. Try again.");
  return recipeView(row.id, recipe);
}

/** A recipe as it is now, moved on first if its jobs have finished. */
export async function getCleanPlate(recipeId: string, userId: string): Promise<CleanPlateView> {
  await requireActiveMember(userId);
  const recipe = await advanceCleanPlate(recipeId);
  return recipeView(recipeId, recipe);
}

/** The clean-plate recipes made from a picture, newest first. */
export async function cleanPlatesFor(
  artAssetId: string,
  userId: string,
): Promise<CleanPlateView[]> {
  await requireActiveMember(userId);
  const { data } = await supabaseAdmin
    .from("operations")
    .select("id,output_payload")
    .eq("operation_type", OPERATION_TYPE)
    .eq("input_payload->>art_asset_id", artAssetId)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((data ?? []) as { id: string; output_payload: unknown }[]).flatMap((row) => {
    const recipe = recipeOf(row.output_payload);
    return recipe ? [recipeView(row.id, recipe)] : [];
  });
}

/** Changes the mask (or how the letters go back) and uses it: it is drawn, and all it drew made again. */
export async function setCleanPlateMask(
  recipeId: string,
  userId: string,
  change: {
    boxes?: Box[] | undefined;
    lettering?: LetteringFile | null | undefined;
    grow?: number | undefined;
    feather?: number | undefined;
    letters?: Letters | undefined;
  },
): Promise<CleanPlateView> {
  await requireActiveMember(userId);
  if (change.lettering) {
    const files = await libraryFiles([change.lettering.assetId]);
    if (files.get(change.lettering.assetId)?.asset_type !== "image")
      throw new AppError(
        "INVALID_PARAMETERS",
        "The lettering file must be a picture in the library",
      );
  }
  await changeRecipe(recipeId, (recipe) => {
    const next = withMask(recipe, change);
    if (!next.mask.boxes.length && !next.mask.lettering)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Say where the lettering is: draw boxes over it, or give a transparent file of it.",
      );
    if (next.letters === "file" && !next.mask.lettering)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Laying the lettering file itself back needs the file: give it, or lay the art's own letters.",
      );
    return next;
  });
  return getCleanPlate(recipeId, userId);
}

export interface StepRequest {
  modelId: string;
  parameters: Record<string, unknown>;
  estimatedCostUsd?: number | null | undefined;
  /** Animating: whether the take ends on the plate, starts on it, or both; and how it lands. */
  end?: PlateEnd | undefined;
  crossSeconds?: number | undefined;
  holdSeconds?: number | undefined;
}

/** What a billed step's generation is: its model, settings and inputs, from the recipe. */
async function generationFor(recipe: CleanPlateRecipe, step: BilledStep, request: StepRequest) {
  const model = await activeModel(request.modelId);
  const prompt =
    typeof request.parameters["prompt"] === "string" ? request.parameters["prompt"] : "";
  // The model's own defaults under what was asked, so a prompt alone is enough.
  const settings = { ...defaultsForModel(model), ...request.parameters };
  if (step === "edit") {
    const fit = editInputs(model, recipe.art.assetId);
    if (!fit.ok) throw new AppError("INVALID_PARAMETERS", fit.reason);
    return {
      model,
      inputs: fit.inputs,
      parameters: { ...settings, prompt: prompt.trim() || EDIT_PROMPT },
    };
  }
  const plate = recipe.steps.blend.assetId;
  const gate = canStart(recipe, "animate");
  if (!gate.ok || !plate)
    throw new AppError(
      "INVALID_PARAMETERS",
      gate.ok ? "The clean plate isn't made yet" : gate.reason,
    );
  const fit = animationInputs(model, plate, request.end ?? recipe.landing.end);
  if (!fit.ok) throw new AppError("INVALID_PARAMETERS", fit.reason);
  return {
    model,
    inputs: fit.inputs,
    parameters: { ...settings, prompt: animationPrompt(prompt) },
  };
}

/** The provider's price for a billed step, as it would be sent. Nothing is billed. */
export async function estimateCleanPlateStep(
  recipeId: string,
  userId: string,
  step: BilledStep,
  request: StepRequest,
) {
  await requireActiveMember(userId);
  const { recipe } = await loadRecipe(recipeId);
  const { model, inputs, parameters } = await generationFor(recipe, step, request);
  const { estimateGenerationCost } = await import("../generation-estimate.server");
  return estimateGenerationCost({ userId, modelId: model.id, parameters, inputs });
}

/**
 * Starts a billed step (the edit, or the take) with the model and settings a
 * person chose: through the normal generation path, with its spending checks.
 * Asking again while it is being made changes nothing.
 */
export async function queueCleanPlateStep(
  recipeId: string,
  userId: string,
  step: BilledStep,
  request: StepRequest,
): Promise<CleanPlateView> {
  await requireActiveMember(userId);
  const { assertGenerationAllowed, createAndSubmitGeneration } =
    await import("../generation-create.server");
  await assertGenerationAllowed(userId);
  const { row, recipe } = await loadRecipe(recipeId);
  const gate = canStart(recipe, step);
  if (!gate.ok) throw new AppError("INVALID_PARAMETERS", gate.reason);
  const landed =
    step === "animate"
      ? withLanding(recipe, {
          end: request.end ?? recipe.landing.end,
          crossSeconds: request.crossSeconds ?? recipe.landing.crossSeconds,
          holdSeconds: request.holdSeconds ?? recipe.landing.holdSeconds,
        })
      : recipe;
  const { model, inputs, parameters } = await generationFor(landed, step, request);
  const attempt = recipe.steps[step].attempt + 1;
  // Keyed by the recipe, the step and its attempt: asked again, the same generation answers.
  const generation = await createAndSubmitGeneration({
    userId,
    model,
    parameters,
    inputs,
    projectId: row.project_id,
    estimatedCostUsd: request.estimatedCostUsd ?? null,
    clientRequestId: `clean-plate:${recipeId}:${step}:${attempt}`,
  });
  const at = new Date().toISOString();
  await changeRecipe(recipeId, (current) => {
    if (current.steps[step].generationId === generation.generationId) return current;
    const base = step === "animate" ? withLanding(current, landed.landing) : current;
    return started(base, step, {
      attempt,
      generationId: generation.generationId,
      request: {
        modelId: model.id,
        model: model.model_path,
        parameters: parameters as JsonRecord,
        estimatedCostUsd: request.estimatedCostUsd ?? null,
        ...(generation.budgetWarning ? { budgetWarning: generation.budgetWarning } : {}),
      },
      at,
    });
  });
  return getCleanPlate(recipeId, userId);
}

/** Lets a person try a failed worker step again (a billed one is simply queued again). */
export async function retryCleanPlateStep(
  recipeId: string,
  userId: string,
  step: WorkerStep,
): Promise<CleanPlateView> {
  await requireActiveMember(userId);
  await changeRecipe(recipeId, (recipe) => retried(recipe, step));
  return getCleanPlate(recipeId, userId);
}

const FAILED_GENERATION = new Set(["failed", "nsfw", "canceled", "cancelled"]);

/** What a running step's job says now: done (with its file), failed, or still going (null). */
async function settle(
  recipe: CleanPlateRecipe,
  step: PlateStep,
): Promise<
  | { done: { assetId: string; report: JsonRecord | null } }
  | { failed: { code: string; message: string } }
  | null
> {
  const state = recipe.steps[step];
  if (state.generationId) {
    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("status,error_code,error_message")
      .eq("id", state.generationId)
      .maybeSingle();
    if (!generation) return { failed: { code: "UNKNOWN", message: "Its generation is gone" } };
    if (FAILED_GENERATION.has(generation.status))
      return {
        failed: {
          code: generation.error_code ?? "PROVIDER_REJECTED",
          message:
            generation.error_message ??
            `The generation ${generation.status === "nsfw" ? "was blocked" : generation.status}`,
        },
      };
    if (generation.status !== "completed") return null;
    const { data: outputs } = await supabaseAdmin
      .from("assets")
      .select("id,asset_type")
      .eq("generation_id", state.generationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    const wanted = step === "edit" ? "image" : "video";
    const output = ((outputs ?? []) as { id: string; asset_type: string }[]).find(
      (asset) => asset.asset_type === wanted,
    );
    // Completed, its file still being saved to the library: asked again shortly.
    return output ? { done: { assetId: output.id, report: null } } : null;
  }
  if (state.taskId) {
    const { data: task } = await supabaseAdmin
      .from("media_tasks")
      .select("status,result_asset_id,output_payload,error_code,error_message")
      .eq("id", state.taskId)
      .maybeSingle();
    if (!task) return { failed: { code: "UNKNOWN", message: "Its media task is gone" } };
    if (["failed", "cancelled", "stalled"].includes(task.status))
      return {
        failed: {
          code: task.error_code ?? "RENDER_FAILED",
          message: task.error_message ?? "The media service couldn't do it",
        },
      };
    if (task.status !== "completed") return null;
    if (!task.result_asset_id)
      return { failed: { code: "RENDER_FAILED", message: "The media service made no file" } };
    const metadata = asRecord(asRecord(task.output_payload)["metadata"]) as JsonRecord;
    return {
      done: {
        assetId: task.result_asset_id,
        report: Object.keys(metadata).length ? metadata : null,
      },
    };
  }
  return { failed: { code: "UNKNOWN", message: "It was never started" } };
}

/** Starts a worker step's media task; its key is the recipe's, the step's and the attempt's. */
async function startWorkerStep(
  recipeId: string,
  row: RecipeRow,
  recipe: CleanPlateRecipe,
  step: WorkerStep,
  attempt: number,
): Promise<string> {
  const dedupeKey = `clean-plate:${recipeId}:${step}:${attempt}`;
  const context = { clean_plate_recipe_id: recipeId, clean_plate_step: step };
  const { steps, mask } = recipe;
  if (step === "align") {
    const { startAlignTake } = await import("./align-take.server");
    const state = await startAlignTake({
      userId: row.created_by,
      takeAssetId: steps.animate.assetId!,
      pictureAssetId: steps.blend.assetId!,
      anchor: anchorFor(recipe.landing.end),
      crossSeconds: recipe.landing.crossSeconds,
      holdSeconds: recipe.landing.holdSeconds,
      dedupeKey,
      projectId: row.project_id,
      title: `${recipe.title} · take on the clean plate`,
      context,
    });
    return state.taskId;
  }
  await requireWorkerFeature("clean_plate", "A clean plate");
  const lettering = mask.lettering?.assetId ?? null;
  const main = step === "overlay" ? steps.align.assetId! : recipe.art.assetId;
  const extras = [
    ...(step === "blend" ? [{ id: steps.edit.assetId!, role: "edit" }] : []),
    ...(step === "overlay" ? [{ id: recipe.art.assetId, role: "source" }] : []),
    ...(lettering ? [{ id: lettering, role: "lettering" }] : []),
  ];
  const files = await libraryFiles([main, ...extras.map((extra) => extra.id)]);
  const source = files.get(main);
  if (!source)
    throw new AppError("INVALID_PARAMETERS", "A file the step needs is no longer in the library");
  const sources = extras.map((extra) => {
    const file = files.get(extra.id);
    if (!file)
      throw new AppError("INVALID_PARAMETERS", "A file the step needs is no longer in the library");
    return {
      assetId: file.id,
      assetType: file.asset_type as "image" | "video",
      bucket: file.storage_bucket,
      path: file.storage_path,
      mimeType: file.mime_type,
      role: extra.role,
    };
  });
  const video = step === "overlay";
  const title = {
    mask: `${recipe.title} · lettering mask`,
    blend: `${recipe.title} · clean plate`,
    overlay: `${recipe.title} · in motion, lettering laid back`,
  }[step];
  const task = await enqueueInternalMediaTask({
    createdBy: row.created_by,
    projectId: row.project_id,
    taskType: video ? "lay_lettering" : "clean_plate",
    source: {
      assetId: source.id,
      assetType: video ? "video" : "image",
      bucket: source.storage_bucket,
      path: source.storage_path,
      mimeType: source.mime_type,
    },
    extraSources: sources,
    params: video
      ? letteringTaskParams(recipe)
      : plateTaskParams(recipe, step === "mask" ? "mask" : "plate"),
    dedupeKey,
    output: video
      ? { count: 1, ext: "mp4", mime: "video/mp4", kind: "video" }
      : { count: 1, ext: "png", mime: "image/png", kind: "image" },
    context: { ...context, output_title: title },
    notConfiguredMessage:
      "The media service is not configured, so the clean plate can't be made. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
  });
  if (!task.ok) throw new AppError(task.retryable ? "PROVIDER_TIMEOUT" : "UNKNOWN", task.message);
  return task.taskId;
}

/**
 * Moves a recipe on: settles the steps whose jobs have finished, then starts
 * the worker step whose turn it is. Safe to call at any time, as often as
 * wanted, from anywhere.
 */
export async function advanceCleanPlate(recipeId: string): Promise<CleanPlateRecipe> {
  let last: CleanPlateRecipe | null = null;
  for (let round = 0; round < 6; round += 1) {
    const { row, recipe } = await loadRecipe(recipeId);
    last = recipe;
    const at = new Date().toISOString();
    let next = recipe;
    for (const step of PLATE_STEPS) {
      if (next.steps[step].status !== "running") continue;
      const outcome = await settle(next, step);
      if (!outcome) continue;
      next =
        "done" in outcome
          ? finished(next, step, { ...outcome.done, at })
          : failed(next, step, outcome.failed, at);
    }
    const step = nextWorkerStep(next);
    let startedOne = false;
    if (step) {
      const attempt = next.steps[step].attempt + 1;
      try {
        const taskId = await startWorkerStep(recipeId, row, next, step, attempt);
        next = started(next, step, { attempt, taskId, at });
        startedOne = true;
      } catch (error) {
        next = started(next, step, { attempt, at });
        next = failed(
          next,
          step,
          {
            code: error instanceof AppError ? error.code : "UNKNOWN",
            message: error instanceof Error ? error.message : "It couldn't be started",
          },
          at,
        );
      }
    }
    if (next === recipe) return recipe;
    if (!(await saveRecipe(row, next))) continue;
    last = next;
    // A step started now reports when it is done; until then there is nothing more to do.
    if (startedOne || !nextWorkerStep(next)) return next;
  }
  return last!;
}

/**
 * The studio's recovery job: recipes changed in the last two days are moved
 * on, so a generation that finished while no one was looking is taken up and
 * the steps after it run. Returns how many it looked at.
 */
export async function sweepCleanPlates(limit = 10): Promise<number> {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("operations")
    .select("id")
    .eq("operation_type", OPERATION_TYPE)
    .eq("status", "running")
    .gt("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) return 0;
  for (const row of (data ?? []) as { id: string }[])
    await advanceCleanPlate(row.id).catch(() => undefined);
  return data?.length ?? 0;
}

/** Moves on the recipe a media task belongs to, once its result is recorded. */
export async function advanceForMediaTask(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("input_payload")
    .eq("id", taskId)
    .maybeSingle();
  const recipeId = asRecord(task?.input_payload)["clean_plate_recipe_id"];
  if (typeof recipeId === "string") await advanceCleanPlate(recipeId);
}
