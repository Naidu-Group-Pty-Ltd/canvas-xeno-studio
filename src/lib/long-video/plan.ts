/**
 * Planning a long video: one continuous piece made of several clips, each as
 * long as its model allows. Shared by the Create page (to show and check the
 * plan) and the server (to check it again and run it), so both always agree.
 *
 * Continuity: every clip after the first starts from a frame taken just before
 * the end of the clip before it (the handoff frame), with the same story,
 * continuity notes, settings and reference images. The Editor later cuts each
 * clip at its handoff frame, so the next clip picks up exactly where it left off.
 */
import {
  defaultsForModel,
  isBlank,
  normalizeOption,
  validateParameters,
  type FieldSchema,
  type InputSlot,
  type ModelRegistryEntry,
} from "../model-schema";

export const LONG_VIDEO_LIMITS = {
  minClips: 2,
  maxClips: 40,
  /** The Editor's own limit for one edit. */
  maxSeconds: 600,
  beatChars: 2000,
  continuityChars: 2000,
  storyChars: 8000,
  titleChars: 200,
} as const;

/**
 * How far before a clip's end its handoff frame is taken, by try. Close to the
 * end so little is cut, but clear of the last frames, which some models fade
 * or blur and which a measured length can overstate by a frame or two.
 */
export const HANDOFF_MARGINS_SECONDS = [0.25, 0.6, 1.2] as const;

/** Workflows that change or extend a given video rather than generate one, so they can't start a long video. */
const VIDEO_INPUT_OPERATIONS = new Set([
  "video-edit",
  "video-extend",
  "motion-control",
  "motion-transfer",
  "object-swap",
  "video-to-video",
]);

export function durationField(model: ModelRegistryEntry): FieldSchema | null {
  return model.parameter_schema?.fields?.find((field) => field.key === "duration") ?? null;
}

/** Every clip length the model accepts, in seconds, shortest first. */
export function durationChoices(model: ModelRegistryEntry): number[] {
  const field = durationField(model);
  if (!field) return [];
  if (field.options?.length) {
    return [
      ...new Set(
        field.options
          .map((option) => Number(normalizeOption(option).value))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ].sort((a, b) => a - b);
  }
  if (typeof field.min !== "number" || typeof field.max !== "number") return [];
  const step = typeof field.step === "number" && field.step > 0 ? field.step : 1;
  const values: number[] = [];
  for (let value = field.min; value <= field.max + 1e-9 && values.length < 400; value += step)
    if (value > 0) values.push(Number(value.toFixed(3)));
  return values;
}

/** The value the duration control is set to for a length (the option itself, when it is a list). */
function durationValue(model: ModelRegistryEntry, seconds: number): unknown {
  const field = durationField(model);
  const option = field?.options
    ?.map(normalizeOption)
    .find((entry) => Number(entry.value) === seconds);
  return option ? option.value : seconds;
}

/** A model whose clips can make up a long video: it generates video of a length you choose. */
export function longVideoEligible(model: ModelRegistryEntry | null | undefined): boolean {
  return (
    !!model &&
    model.output_type === "video" &&
    !VIDEO_INPUT_OPERATIONS.has(model.operation) &&
    durationChoices(model).length > 0
  );
}

/** The image input a clip starts from, if the model has one. */
export function startFrameSlot(model: ModelRegistryEntry | null | undefined): InputSlot | null {
  return (
    model?.capabilities?.inputs?.find(
      (slot) =>
        slot.type === "image" &&
        (slot.role === "first_frame" ||
          (slot.role === "source" &&
            (slot.label === "Start frame" || model.operation === "image-to-video"))),
    ) ?? null
  );
}

/** A model that can make the clips after the first: it starts from a given frame. */
export function canContinue(model: ModelRegistryEntry | null | undefined): boolean {
  return longVideoEligible(model) && !!startFrameSlot(model);
}

/** A model's name without its workflow, e.g. "Kling 3.0 Pro" for "Kling 3.0 Pro (Image to video)". */
export function modelLine(model: ModelRegistryEntry): string {
  return model.display_name.replace(/\s*\([^)]*\)\s*$/, "");
}

function hasReferenceSlot(model: ModelRegistryEntry): boolean {
  return (model.capabilities?.inputs ?? []).some(
    (slot) => slot.role === "reference" && slot.type === "image",
  );
}

/**
 * Models that can make the later clips, best first: the first clip's own model
 * when it can, then its other workflows (image to video first; one that also
 * takes reference images when there are some), then the same family, then
 * everything else in catalogue order.
 */
export function continuationCandidates(
  first: ModelRegistryEntry,
  models: ModelRegistryEntry[],
  options: { withReferences?: boolean } = {},
): ModelRegistryEntry[] {
  const score = (model: ModelRegistryEntry) =>
    (model.id === first.id ? 100 : 0) +
    (model.family === first.family && modelLine(model) === modelLine(first) ? 40 : 0) +
    (model.family === first.family ? 10 : 0) +
    (options.withReferences && hasReferenceSlot(model) ? 5 : 0) +
    (model.operation === "image-to-video" ? 2 : 0);
  return models
    .filter((model) => model.is_active && canContinue(model))
    .sort((a, b) => score(b) - score(a) || a.sort_order - b.sort_order);
}

/** Lengths offered for the clips: what the later clips' model accepts. */
export function clipLengthChoices(continuation: ModelRegistryEntry | null): number[] {
  return continuation ? durationChoices(continuation) : [];
}

function nearest(choices: number[], ideal: number): number {
  return choices.reduce((best, value) => {
    const gap = Math.abs(value - ideal);
    const bestGap = Math.abs(best - ideal);
    return gap < bestGap - 1e-9 || (Math.abs(gap - bestGap) <= 1e-9 && value > best) ? value : best;
  }, choices[0]!);
}

/**
 * Clip lengths for a total: as few clips as the longest allowed clip length
 * permits, with the time shared out evenly (no stub at the end) using lengths
 * each clip's model accepts. E.g. 60 s at 30 s clips is 30 + 30; 50 s at 15 s
 * clips is 13 + 12 + 13 + 12.
 */
export function planDurations(input: {
  targetSeconds: number;
  maxClipSeconds: number;
  firstChoices: number[];
  continuationChoices: number[];
}): number[] {
  const { targetSeconds, maxClipSeconds, firstChoices, continuationChoices } = input;
  if (!firstChoices.length || !continuationChoices.length || !(targetSeconds > 0)) return [];
  const capped = (choices: number[]) => {
    const fit = choices.filter((value) => value <= maxClipSeconds + 1e-9);
    return fit.length ? fit : [choices[0]!];
  };
  const first = capped(firstChoices);
  const later = capped(continuationChoices);
  const longest = Math.max(...later);
  const count = Math.min(
    LONG_VIDEO_LIMITS.maxClips,
    Math.max(LONG_VIDEO_LIMITS.minClips, Math.ceil(targetSeconds / longest - 1e-9)),
  );
  const durations: number[] = [];
  let remaining = targetSeconds;
  for (let index = 0; index < count; index += 1) {
    const pick = nearest(index === 0 ? first : later, remaining / (count - index));
    durations.push(pick);
    remaining -= pick;
  }
  return durations;
}

/**
 * A clip's prompt: what happens in it (its beat), what must stay the same, and
 * the story the whole video tells. Clips after the first are told they
 * continue straight on from their first frame. The short, specific parts come
 * first, so a model that cuts long prompts short keeps them.
 */
export function clipPrompt(input: {
  story: string;
  beat?: string | null;
  continuity?: string | null;
  index: number;
}): string {
  const story = input.story.trim();
  const beat = input.beat?.trim() ?? "";
  const continuity = input.continuity?.trim() ?? "";
  const keep = continuity ? `Keep consistent throughout: ${continuity}` : "";
  const parts: string[] = [];
  if (input.index > 0)
    parts.push(
      "Continue seamlessly from the first frame, as the next moment of the same continuous shot.",
    );
  if (beat) parts.push(beat, keep, story ? `Scene: ${story}` : "");
  else parts.push(story, keep);
  return parts.filter(Boolean).join("\n\n");
}

function acceptedBy(field: FieldSchema, value: unknown): boolean {
  if (isBlank(value)) return false;
  if (field.options?.length)
    return field.options.map((option) => normalizeOption(option).value).includes(value as never);
  if (typeof value === "number") {
    if (typeof field.min === "number" && value < field.min) return false;
    if (typeof field.max === "number" && value > field.max) return false;
  }
  return true;
}

/**
 * Settings for a model, starting from its defaults and keeping every setting
 * of `values` it has and accepts as is (resolution, sound, seed, style…), so
 * the later clips look and sound like the first.
 */
export function carryValues(
  values: Record<string, unknown>,
  target: ModelRegistryEntry,
): Record<string, unknown> {
  const next = defaultsForModel(target);
  for (const field of target.parameter_schema?.fields ?? []) {
    if (field.key === "prompt" || field.key === "duration") continue;
    if (field.key in values && acceptedBy(field, values[field.key]))
      next[field.key] = values[field.key];
  }
  return next;
}

/**
 * A clip's settings. The first clip keeps the settings exactly as chosen for
 * its model; later clips carry over what their model has and accepts. Each
 * gets its own length and prompt.
 */
export function clipValues(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  clip: { durationSeconds: number; prompt: string },
  options: { asChosen?: boolean } = {},
): Record<string, unknown> {
  return {
    ...(options.asChosen ? values : carryValues(values, model)),
    duration: durationValue(model, clip.durationSeconds),
    prompt: clip.prompt,
  };
}

export interface RunReference {
  assetId: string;
  role: string;
  assetType: "image" | "video" | "audio";
}

/**
 * The run's reference images that every later clip is sent again, where its
 * model takes reference images alongside a start frame: a character or
 * product sheet then keeps them the same from clip to clip. (Start and end
 * frames, videos and audio belong to the first clip only.)
 */
export function carriedReferences(
  references: RunReference[],
  continuation: ModelRegistryEntry,
): { assetId: string; role: string }[] {
  const slot = (continuation.capabilities?.inputs ?? []).find(
    (entry) => entry.role === "reference" && entry.type === "image",
  );
  if (!slot) return [];
  // Images the first clip's model couldn't use ("unused") are references too.
  return references
    .filter(
      (item) => item.assetType === "image" && (item.role === "reference" || item.role === "unused"),
    )
    .slice(0, slot.max ?? 1)
    .map((item) => ({ assetId: item.assetId, role: "reference" }));
}

export interface ClipDraft {
  beat: string;
  durationSeconds: number;
  /** The prompt as sent (Cinema Mode's shot language included, when on). */
  prompt: string;
}

export interface PlannedClip extends ClipDraft {
  position: number;
  model: ModelRegistryEntry;
  values: Record<string, unknown>;
  /** Media roles the clip is sent with, its start frame included. */
  roles: string[];
  inputs: { assetId: string; role: string }[];
}

/** Every clip's model, settings and media, as the run will send them. */
export function planClips(input: {
  first: ModelRegistryEntry;
  continuation: ModelRegistryEntry;
  values: Record<string, unknown>;
  references: RunReference[];
  clips: ClipDraft[];
}): PlannedClip[] {
  const { first, continuation, values, references } = input;
  const startRole = startFrameSlot(continuation)?.role ?? null;
  const firstInputs = references
    .filter((item) => item.role && item.role !== "unused")
    .map((item) => ({ assetId: item.assetId, role: item.role }));
  const laterValues = carryValues(values, continuation);
  // Reference images go along only where the model takes them with a start
  // frame (some take one or the other, never both).
  let carried = carriedReferences(references, continuation);
  const rolesWith = (items: { role: string }[]) => [
    ...(startRole ? [startRole] : []),
    ...items.map((item) => item.role),
  ];
  if (
    carried.length &&
    validateParameters(continuation, laterValues, rolesWith(carried)).some(
      (issue) => issue.key === "inputs",
    )
  )
    carried = [];
  return input.clips.map((clip, position) => {
    const isFirst = position === 0;
    const model = isFirst ? first : continuation;
    const inputs = isFirst ? firstInputs : carried;
    return {
      ...clip,
      position,
      model,
      values: clipValues(model, values, clip, { asChosen: isFirst }),
      roles: isFirst ? inputs.map((item) => item.role) : rolesWith(inputs),
      inputs,
    };
  });
}

export interface PlanIssue {
  /** The clip it is about, or null for the run as a whole. */
  position: number | null;
  message: string;
}

/** Everything that would stop the run, said per clip, before anything is sent. */
export function planIssues(input: {
  first: ModelRegistryEntry | null;
  continuation: ModelRegistryEntry | null;
  clips: PlannedClip[];
  targetSeconds: number;
}): PlanIssue[] {
  const { first, continuation, clips } = input;
  const issues: PlanIssue[] = [];
  if (!first || !longVideoEligible(first))
    return [
      { position: null, message: "Choose a video model that generates clips of a set length" },
    ];
  if (!continuation || !canContinue(continuation))
    return [
      { position: null, message: "Choose a model for the later clips that starts from an image" },
    ];
  if (!(input.targetSeconds > 0) || input.targetSeconds > LONG_VIDEO_LIMITS.maxSeconds)
    issues.push({
      position: null,
      message: `A long video can run up to ${LONG_VIDEO_LIMITS.maxSeconds / 60} minutes`,
    });
  if (clips.length < LONG_VIDEO_LIMITS.minClips)
    issues.push({ position: null, message: "That length fits in one clip; switch to One clip" });
  if (clips.length > LONG_VIDEO_LIMITS.maxClips)
    issues.push({
      position: null,
      message: `At most ${LONG_VIDEO_LIMITS.maxClips} clips; choose longer clips or a shorter video`,
    });
  for (const clip of clips) {
    const label = `Clip ${clip.position + 1}`;
    if (clip.beat.length > LONG_VIDEO_LIMITS.beatChars)
      issues.push({
        position: clip.position,
        message: `${label}: keep what happens under ${LONG_VIDEO_LIMITS.beatChars} characters`,
      });
    for (const issue of validateParameters(clip.model, clip.values, clip.roles)) {
      // The start frame is supplied by the run itself.
      if (clip.position > 0 && issue.key === startFrameSlot(clip.model)?.role) continue;
      issues.push({ position: clip.position, message: `${label}: ${issue.message}` });
    }
  }
  return issues;
}

/** The run's total length in seconds. */
export function totalSeconds(durations: number[]): number {
  return durations.reduce((sum, value) => sum + value, 0);
}

/** "45s", "1:30", "10:00". */
export function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
