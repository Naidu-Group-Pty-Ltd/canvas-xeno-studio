/**
 * The clean-plate recipe: a logo, or any lettering, moved by a video model
 * without the model ever drawing a letter, as Reel 1's logo was made
 * (handover 1.4, step 10). Six steps, each one's result kept in the library:
 *   mask:    where the lettering is, from a transparent file of it (its
 *            alpha) or the boxes the studio's AI reads it in, checked and
 *            adjusted by a person, then drawn by the media worker;
 *   edit:    one image edit takes the lettering out of the art (billed);
 *   blend:   the edit laid into the art only inside the feathered mask, so
 *            every other pixel is the art's own (the media worker);
 *   animate: an image-to-video model the person picks moves the clean plate
 *            (billed);
 *   align:   the take aligned and colour-matched to the plate it must end
 *            (or start) on, then crossed to it (the worker's align_take);
 *   overlay: the supplied lettering laid back over the take exactly (the
 *            media worker), so the letters are the supplied pixels.
 * A person starts the billed steps, and they go through the normal
 * generation path and its spending checks. The others start by themselves
 * once what they need is there, and again whenever it changes: a new mask is
 * drawn and blended again, a new take aligned and lettered again. A step that
 * fails waits for a person to try it again. See ./clean-plate.server.
 *
 * Shared by the server, the browser and tests.
 */
import type { Json } from "@/integrations/supabase/types";
import type { ModelRegistryEntry } from "../model-schema";
import { boxesInPixels, cleanBoxes, type Box } from "./text-boxes";

/** What is kept as it was given or measured: plain JSON, as it is stored. */
export type JsonRecord = { [key: string]: Json | undefined };

export const PLATE_STEPS = ["mask", "edit", "blend", "animate", "align", "overlay"] as const;
export type PlateStep = (typeof PLATE_STEPS)[number];
/** The steps a model makes, billed by the provider: a person starts them. */
export const BILLED_STEPS = ["edit", "animate"] as const;
export type BilledStep = (typeof BILLED_STEPS)[number];
/** The steps the media worker does, in the order they depend on each other. */
export const WORKER_STEPS = ["mask", "blend", "align", "overlay"] as const;
export type WorkerStep = (typeof WORKER_STEPS)[number];

export const STEP_LABELS: Record<PlateStep, string> = {
  mask: "The lettering's mask",
  edit: "The lettering taken out",
  blend: "The clean plate",
  animate: "The take",
  align: "The take on the plate",
  overlay: "The lettering laid back",
};

export const PLATE_ENDS = ["last", "first", "both"] as const;
/** Whether the take ends on the clean plate, starts on it, or both (a loop). */
export type PlateEnd = (typeof PLATE_ENDS)[number];
export const LETTERS = ["art", "file"] as const;
export type Letters = (typeof LETTERS)[number];

export type StepStatus = "waiting" | "running" | "completed" | "failed";
export type RecipeStatus = "waiting" | "running" | "failed" | "completed";

export interface StepState {
  status: StepStatus;
  /** How many times it has been started: its job is started under that number. */
  attempt: number;
  generationId: string | null;
  taskId: string | null;
  /** What it made, in the library. */
  assetId: string | null;
  /** What it was made from (see inputsOf): a result made from something since changed is made again. */
  madeFrom: string | null;
  /** For a billed step, what was asked: the model, its settings and the price quoted. */
  request: JsonRecord | null;
  /** What the media worker measured. */
  report: JsonRecord | null;
  error: { code: string; message: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A transparent file of the lettering, and where it sits on the art (shares of the art). */
export interface LetteringFile extends Box {
  assetId: string;
}

export interface PlateMask {
  /** Boxes over the lettering, as shares of the art. */
  boxes: Box[];
  /** A transparent file of the lettering: its alpha is the mask. */
  lettering: LetteringFile | null;
  /** How far past the lettering the edit is laid in, and how softly it fades into the art (the art's pixels). */
  grow: number;
  feather: number;
  /** Where the boxes came from: the AI's reading, the file, or a person. */
  source: "ai" | "file" | "person";
  /** 0 until a person has looked at it and used it; one more for each change after. */
  revision: number;
}

export interface CleanPlateRecipe {
  version: 1;
  title: string;
  art: { assetId: string; width: number; height: number };
  mask: PlateMask;
  /** The art's own letters laid back ("art"), or the lettering file itself ("file"). */
  letters: Letters;
  /** How the take uses the plate, and how it lands on it. */
  landing: { end: PlateEnd; crossSeconds: number; holdSeconds: number };
  steps: Record<PlateStep, StepState>;
  /** A note on the mask's reading for people (when the AI couldn't read the lettering, say). */
  note: string | null;
}

/** The limits of what a person may set. */
export const PLATE_LIMITS = { grow: 300, feather: 200, cross: 3, hold: 10 } as const;

/** What the edit is asked, unless the person words it otherwise. */
export const EDIT_PROMPT =
  "Take all of the lettering out of this picture: every word, letter and number, and any shadow, glow or reflection it casts. Fill where it was with what is around it. Keep everything else exactly as it is, with the same framing, colours, light and detail. Add nothing.";
/** Said to the video model whatever else it is told: it is never asked to draw a letter. */
export const NO_LETTERING = "No text, no letters, no words, no numbers, no logos.";

export function emptyStep(): StepState {
  return {
    status: "waiting",
    attempt: 0,
    generationId: null,
    taskId: null,
    assetId: null,
    madeFrom: null,
    request: null,
    report: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

/** How far past the lettering, and how softly, unless a person says: 2% of the art's shorter side each. */
export function defaultSpread(art: { width: number; height: number }): {
  grow: number;
  feather: number;
} {
  const side = Math.min(art.width, art.height);
  return {
    grow: Math.max(2, Math.round(side * 0.02)),
    feather: Math.max(2, Math.round(side * 0.02)),
  };
}

export function newRecipe(input: {
  title: string;
  art: CleanPlateRecipe["art"];
  boxes: Box[];
  lettering: LetteringFile | null;
  source: PlateMask["source"];
  letters?: Letters;
  note?: string | null;
}): CleanPlateRecipe {
  return {
    version: 1,
    title: input.title,
    art: input.art,
    mask: {
      boxes: cleanBoxes(input.boxes),
      lettering: input.lettering,
      ...defaultSpread(input.art),
      source: input.source,
      revision: 0,
    },
    letters: input.letters ?? "art",
    landing: { end: "last", crossSeconds: 0.5, holdSeconds: 0.5 },
    steps: Object.fromEntries(PLATE_STEPS.map((step) => [step, emptyStep()])) as Record<
      PlateStep,
      StepState
    >,
    note: input.note ?? null,
  };
}

/** What a step is made from, as a key (null while what it needs isn't there). */
export function inputsOf(recipe: CleanPlateRecipe, step: PlateStep): string | null {
  const { steps, mask, landing } = recipe;
  switch (step) {
    case "mask":
      return `mask:${mask.revision}`;
    case "edit":
      return `art:${recipe.art.assetId}`;
    case "blend":
      return steps.edit.assetId ? `edit:${steps.edit.assetId}|mask:${mask.revision}` : null;
    case "animate":
      return steps.blend.assetId ? `plate:${steps.blend.assetId}` : null;
    case "align":
      return steps.animate.assetId && steps.blend.assetId
        ? `take:${steps.animate.assetId}|plate:${steps.blend.assetId}|${landing.end}|${landing.crossSeconds}|${landing.holdSeconds}`
        : null;
    case "overlay":
      return steps.align.assetId
        ? `aligned:${steps.align.assetId}|mask:${mask.revision}|${recipe.letters}`
        : null;
  }
}

/** Whether a step's result is there and made from what is there now. */
export function upToDate(recipe: CleanPlateRecipe, step: PlateStep): boolean {
  const state = recipe.steps[step];
  return (
    state.status === "completed" && !!state.assetId && state.madeFrom === inputsOf(recipe, step)
  );
}

/** Whether what a worker step needs is there. */
function needsMet(recipe: CleanPlateRecipe, step: WorkerStep): boolean {
  const { steps, mask } = recipe;
  switch (step) {
    case "mask":
      return mask.revision > 0 && (mask.boxes.length > 0 || !!mask.lettering);
    case "blend":
      return upToDate(recipe, "mask") && steps.edit.status === "completed" && !!steps.edit.assetId;
    case "align":
      return (
        upToDate(recipe, "blend") && steps.animate.status === "completed" && !!steps.animate.assetId
      );
    case "overlay":
      return upToDate(recipe, "align");
  }
}

/**
 * The worker step to start now, if any: the first whose needs are met and
 * whose result isn't up to date, one at a time. A step that failed on what
 * is there now waits for a person, and so does all that follows it.
 */
export function nextWorkerStep(recipe: CleanPlateRecipe): WorkerStep | null {
  if (WORKER_STEPS.some((step) => recipe.steps[step].status === "running")) return null;
  for (const step of WORKER_STEPS) {
    if (!needsMet(recipe, step) || upToDate(recipe, step)) continue;
    const state = recipe.steps[step];
    if (state.status === "failed" && state.madeFrom === inputsOf(recipe, step)) return null;
    return step;
  }
  return null;
}

/** Whether a person can start a billed step now, and if not, why not. */
export function canStart(
  recipe: CleanPlateRecipe,
  step: BilledStep,
): { ok: true } | { ok: false; reason: string } {
  if (recipe.steps[step].status === "running")
    return { ok: false, reason: `${STEP_LABELS[step]} is being made. Wait for it to finish.` };
  if (step === "animate" && !upToDate(recipe, "blend"))
    return {
      ok: false,
      reason: "Make the clean plate first: use the mask, make the edit, and let it blend.",
    };
  return { ok: true };
}

/** Lets a person try a failed worker step again: it is waiting, and starts when it can. */
export function retried(recipe: CleanPlateRecipe, step: WorkerStep): CleanPlateRecipe {
  const state = recipe.steps[step];
  if (state.status !== "failed") return recipe;
  return withStep(recipe, step, { status: "waiting", madeFrom: null, error: null });
}

function withStep(
  recipe: CleanPlateRecipe,
  step: PlateStep,
  patch: Partial<StepState>,
): CleanPlateRecipe {
  return { ...recipe, steps: { ...recipe.steps, [step]: { ...recipe.steps[step], ...patch } } };
}

/** A step started: its job and attempt, and what it is made from now. */
export function started(
  recipe: CleanPlateRecipe,
  step: PlateStep,
  job: {
    attempt: number;
    generationId?: string | null;
    taskId?: string | null;
    request?: JsonRecord | null;
    at: string;
  },
): CleanPlateRecipe {
  return withStep(recipe, step, {
    status: "running",
    attempt: job.attempt,
    generationId: job.generationId ?? null,
    taskId: job.taskId ?? null,
    madeFrom: inputsOf(recipe, step),
    ...(job.request !== undefined ? { request: job.request } : {}),
    error: null,
    startedAt: job.at,
    finishedAt: null,
  });
}

export function finished(
  recipe: CleanPlateRecipe,
  step: PlateStep,
  result: { assetId: string; report?: JsonRecord | null; at: string },
): CleanPlateRecipe {
  return withStep(recipe, step, {
    status: "completed",
    assetId: result.assetId,
    report: result.report ?? null,
    error: null,
    finishedAt: result.at,
  });
}

export function failed(
  recipe: CleanPlateRecipe,
  step: PlateStep,
  error: { code: string; message: string },
  at: string,
): CleanPlateRecipe {
  return withStep(recipe, step, { status: "failed", error, finishedAt: at });
}

/** A change to the mask (or how the letters go back): it counts as used, and what it drew is made again. */
export function withMask(
  recipe: CleanPlateRecipe,
  change: {
    boxes?: Box[] | undefined;
    lettering?: LetteringFile | null | undefined;
    grow?: number | undefined;
    feather?: number | undefined;
    letters?: Letters | undefined;
  },
): CleanPlateRecipe {
  const clamp = (value: number, most: number) =>
    Math.max(0, Math.min(most, Math.round(value * 10) / 10));
  return {
    ...recipe,
    letters: change.letters ?? recipe.letters,
    mask: {
      ...recipe.mask,
      ...(change.boxes ? { boxes: cleanBoxes(change.boxes), source: "person" as const } : {}),
      ...(change.lettering !== undefined ? { lettering: change.lettering } : {}),
      ...(change.grow !== undefined
        ? { grow: Math.round(clamp(change.grow, PLATE_LIMITS.grow)) }
        : {}),
      ...(change.feather !== undefined
        ? { feather: clamp(change.feather, PLATE_LIMITS.feather) }
        : {}),
      revision: recipe.mask.revision + 1,
    },
  };
}

/** How the take lands on the plate, as it is animated. */
export function withLanding(
  recipe: CleanPlateRecipe,
  landing: CleanPlateRecipe["landing"],
): CleanPlateRecipe {
  return {
    ...recipe,
    landing: {
      end: landing.end,
      crossSeconds: Math.max(0, Math.min(PLATE_LIMITS.cross, landing.crossSeconds)),
      holdSeconds: Math.max(0, Math.min(PLATE_LIMITS.hold, landing.holdSeconds)),
    },
  };
}

export function recipeStatus(recipe: CleanPlateRecipe): RecipeStatus {
  if (PLATE_STEPS.some((step) => recipe.steps[step].status === "running")) return "running";
  if (upToDate(recipe, "overlay")) return "completed";
  if (PLATE_STEPS.some((step) => recipe.steps[step].status === "failed")) return "failed";
  return "waiting";
}

/** What happens next, in words, for the person. */
export function nextForPerson(recipe: CleanPlateRecipe): string {
  const { steps } = recipe;
  const broken = PLATE_STEPS.find((step) => steps[step].status === "failed");
  if (broken)
    return `${STEP_LABELS[broken]} failed: ${steps[broken].error?.message ?? "it didn't finish"}. Try it again.`;
  if (recipe.mask.revision === 0)
    return recipe.mask.boxes.length || recipe.mask.lettering
      ? "Check the boxes over the lettering, then use the mask."
      : "Draw boxes over the lettering (or give a transparent file of it), then use the mask.";
  const running = PLATE_STEPS.find((step) => steps[step].status === "running");
  if (running) return `${STEP_LABELS[running]} is being made.`;
  if (steps.edit.status !== "completed")
    return "Make the edit that takes the lettering out of the art.";
  if (!upToDate(recipe, "blend")) return "The clean plate is being made.";
  if (steps.animate.status !== "completed") return "Animate the clean plate with a video model.";
  if (!upToDate(recipe, "overlay")) return "The take is being put on the plate and lettered.";
  return "Done: the lettering is laid back over the take, exactly as supplied.";
}

/** The video model's prompt, always ending by asking for no lettering at all. */
export function animationPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.includes(NO_LETTERING)) return trimmed;
  if (!trimmed) return NO_LETTERING;
  return `${trimmed}${/[.!?]$/.test(trimmed) ? "" : "."} ${NO_LETTERING}`;
}

/** The roles a model takes a picture in: as its first frame, and as its last. */
export function frameRoles(model: ModelRegistryEntry): {
  first: string | null;
  last: string | null;
} {
  const images = (model.capabilities?.inputs ?? []).filter((slot) => slot.type === "image");
  const last = images.find((slot) => slot.role === "last_frame")?.role ?? null;
  const first =
    (
      images.find((slot) => slot.role === "first_frame") ??
      images.find((slot) => slot.role === "source") ??
      images.find((slot) => slot.role === "image") ??
      images.find((slot) => slot.role !== "last_frame" && slot.role !== "reference") ??
      images.find((slot) => slot.role !== "last_frame")
    )?.role ?? null;
  return { first, last };
}

type Inputs = { ok: true; inputs: { assetId: string; role: string; position: number }[] };
type Refused = { ok: false; reason: string };

/** The edit's inputs: the art, in the image model's picture. */
export function editInputs(model: ModelRegistryEntry, artAssetId: string): Inputs | Refused {
  if (model.output_type !== "image")
    return { ok: false, reason: "Choose an image model to make the edit." };
  const role = frameRoles(model).first;
  if (!role)
    return { ok: false, reason: "That model doesn't take a picture to edit. Choose another." };
  return { ok: true, inputs: [{ assetId: artAssetId, role, position: 0 }] };
}

/** The take's inputs: the clean plate as its first frame, its last, or both. */
export function animationInputs(
  model: ModelRegistryEntry,
  plateAssetId: string,
  end: PlateEnd,
): Inputs | Refused {
  if (model.output_type !== "video")
    return { ok: false, reason: "Choose a video model to animate the plate." };
  const { first, last } = frameRoles(model);
  if ((end === "first" || end === "both") && !first)
    return { ok: false, reason: "That model doesn't start from a picture. Choose another." };
  if ((end === "last" || end === "both") && !last)
    return {
      ok: false,
      reason:
        "That model can't be given the picture to end on. Choose one with an end frame, or start the take on the plate.",
    };
  const inputs: Inputs["inputs"] = [];
  if (end !== "last") inputs.push({ assetId: plateAssetId, role: first!, position: 0 });
  if (end !== "first") inputs.push({ assetId: plateAssetId, role: last!, position: inputs.length });
  return { ok: true, inputs };
}

/** The end of the take that must be the plate exactly: a loop hands over at its end. */
export function anchorFor(end: PlateEnd): "first" | "last" {
  return end === "first" ? "first" : "last";
}

/** A lettering file's place in the art's pixels, wholly inside it. */
function placeInPixels(place: Box, width: number, height: number) {
  const [box] = boxesInPixels([place], width, height);
  return {
    x: Math.min(box!.x, width - 2),
    y: Math.min(box!.y, height - 2),
    w: Math.max(2, Math.min(box!.w, width - Math.min(box!.x, width - 2))),
    h: Math.max(2, Math.min(box!.h, height - Math.min(box!.y, height - 2))),
  };
}

/** The media worker's clean_plate settings: the mask alone, or the plate. */
export function plateTaskParams(
  recipe: CleanPlateRecipe,
  output: "mask" | "plate",
): Record<string, unknown> {
  const { width, height } = recipe.art;
  const { mask } = recipe;
  return {
    output,
    boxes: boxesInPixels(mask.boxes, width, height),
    ...(mask.lettering ? { lettering_rect: placeInPixels(mask.lettering, width, height) } : {}),
    grow: mask.grow,
    feather: mask.feather,
  };
}

/**
 * The media worker's lay_lettering settings: the same lettering, in a mask
 * half as far out and a third less soft (Reel 1's letters: 22 px and 9, from
 * the plate's 45 and 14), so only the letters and the shadow they stand in
 * stay still over the moving take.
 */
export function letteringTaskParams(recipe: CleanPlateRecipe): Record<string, unknown> {
  const { width, height } = recipe.art;
  const { mask } = recipe;
  return {
    letters: recipe.letters,
    boxes: boxesInPixels(mask.boxes, width, height),
    ...(mask.lettering ? { lettering_rect: placeInPixels(mask.lettering, width, height) } : {}),
    grow: Math.max(1, Math.round(mask.grow / 2)),
    feather: Math.round(mask.feather * 0.65 * 10) / 10,
  };
}

/** A recipe as kept with its operation (null if it isn't one). */
export function recipeOf(value: unknown): CleanPlateRecipe | null {
  const record = (value ?? {}) as Partial<CleanPlateRecipe>;
  if (
    record.version !== 1 ||
    typeof record.art?.assetId !== "string" ||
    !record.steps ||
    !record.mask
  )
    return null;
  return {
    ...(record as CleanPlateRecipe),
    steps: Object.fromEntries(
      PLATE_STEPS.map((step) => [step, { ...emptyStep(), ...(record.steps?.[step] ?? {}) }]),
    ) as Record<PlateStep, StepState>,
  };
}

export interface CleanPlateView {
  recipeId: string;
  title: string;
  status: RecipeStatus;
  /** What happens next, in words. */
  next: string;
  art: CleanPlateRecipe["art"];
  mask: PlateMask;
  letters: Letters;
  landing: CleanPlateRecipe["landing"];
  note: string | null;
  steps: {
    step: PlateStep;
    label: string;
    billed: boolean;
    status: StepStatus;
    upToDate: boolean;
    assetId: string | null;
    generationId: string | null;
    taskId: string | null;
    attempt: number;
    error: { code: string; message: string } | null;
    report: JsonRecord | null;
    request: JsonRecord | null;
  }[];
}

/** A recipe as the app and the API show it. */
export function recipeView(recipeId: string, recipe: CleanPlateRecipe): CleanPlateView {
  return {
    recipeId,
    title: recipe.title,
    status: recipeStatus(recipe),
    next: nextForPerson(recipe),
    art: recipe.art,
    mask: recipe.mask,
    letters: recipe.letters,
    landing: recipe.landing,
    note: recipe.note,
    steps: PLATE_STEPS.map((step) => {
      const state = recipe.steps[step];
      return {
        step,
        label: STEP_LABELS[step],
        billed: (BILLED_STEPS as readonly string[]).includes(step),
        status: state.status,
        upToDate: upToDate(recipe, step),
        assetId: state.assetId,
        generationId: state.generationId,
        taskId: state.taskId,
        attempt: state.attempt,
        error: state.error,
        report: state.report,
        request: state.request,
      };
    }),
  };
}
