/**
 * Planning a long video: one continuous piece made of several clips, each as
 * long as its model allows, all made by one model. Shared by the Create page
 * and Supercomputer (to show and check the plan) and the server (to check it
 * again and run it), so all of them always agree.
 *
 * Continuity: every clip after the first starts from the true last frame of
 * the clip before it (the handoff frame), with the same story, continuity
 * notes, settings and reference images, on the same model (the same
 * workflow, or that model's own workflow for starting from an image), told
 * how the camera was moving as that clip ended. The Editor later plays each
 * clip through its handoff frame and the next from just after its copy of
 * it, so the next clip picks up exactly where the last left off.
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
 * The handoff frame is each clip's true last frame, found by counting its
 * frames (see ./handoff). A media service that can't count frames takes one
 * by time instead, this far before the clip's end, by try: close to the end
 * so little is cut, but clear of the last frames, which a measured length can
 * overstate by a frame or two.
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
export function durationValue(model: ModelRegistryEntry, seconds: number): unknown {
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

/**
 * Models that open a clip on a given frame through their reference images, as
 * they have no start-frame input: Cinema Studio's prompt names its references
 * with one-based tokens (<<<image_1>>>), so the handoff frame goes in as
 * image 1 and the prompt says the clip begins on it. A registry row can also
 * say so itself (capabilities.referenceStart).
 */
const REFERENCE_START_PATHS = [/^higgsfield\/cinema-studio\//];

/** How a model starts a clip from a given frame. */
export type ClipStart =
  /** Its start-frame input. */
  | { kind: "frame"; role: string }
  /** Its first reference image, named in the prompt. */
  | { kind: "reference"; role: string };

export function clipStart(model: ModelRegistryEntry | null | undefined): ClipStart | null {
  const frame = startFrameSlot(model);
  if (frame) return { kind: "frame", role: frame.role };
  if (
    !model ||
    !(
      model.capabilities?.referenceStart === true ||
      REFERENCE_START_PATHS.some((path) => path.test(model.model_path))
    )
  )
    return null;
  const slot = (model.capabilities?.inputs ?? []).find(
    (entry) => entry.role === "reference" && entry.type === "image",
  );
  return slot ? { kind: "reference", role: slot.role } : null;
}

/** A model that can make the clips after the first: it starts from a given frame. */
export function canContinue(model: ModelRegistryEntry | null | undefined): boolean {
  return longVideoEligible(model) && !!clipStart(model);
}

/** A model's name without its workflow, e.g. "Kling 3.0 Pro" for "Kling 3.0 Pro (Image to video)". */
export function modelLine(model: ModelRegistryEntry): string {
  return model.display_name.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Two workflows of one model (Seedance 2.5 and Seedance 2.5 (Image to video)), or the same workflow. */
export function sameModel(a: ModelRegistryEntry, b: ModelRegistryEntry): boolean {
  return a.id === b.id || (a.family === b.family && modelLine(a) === modelLine(b));
}

function hasReferenceSlot(model: ModelRegistryEntry): boolean {
  return (model.capabilities?.inputs ?? []).some(
    (slot) => slot.role === "reference" && slot.type === "image",
  );
}

/**
 * What can make the clips after the first, best first. Only the first clip's
 * own model, so the whole video looks and moves like one piece: the same
 * workflow when it can start from a frame, else that model's other workflows
 * that can (one that also takes reference images first when there are some,
 * then image to video). Empty when no workflow of the model starts from a
 * frame, and then the model can't make a long video.
 */
export function continuationCandidates(
  first: ModelRegistryEntry,
  models: ModelRegistryEntry[],
  options: { withReferences?: boolean } = {},
): ModelRegistryEntry[] {
  const score = (model: ModelRegistryEntry) =>
    (model.id === first.id ? 100 : 0) +
    (options.withReferences && hasReferenceSlot(model) ? 5 : 0) +
    (model.operation === "image-to-video" ? 2 : 0);
  return models
    .filter((model) => model.is_active && sameModel(model, first) && canContinue(model))
    .sort((a, b) => score(b) - score(a) || a.sort_order - b.sort_order);
}

/** Lengths offered for the clips: what the later clips' model accepts. */
export function clipLengthChoices(continuation: ModelRegistryEntry | null): number[] {
  return continuation ? durationChoices(continuation) : [];
}

const EPSILON = 1e-9;

/** The accepted length closest to an ideal; between two equally close, the longer. */
export function nearest(choices: number[], ideal: number): number {
  return choices.reduce((best, value) => {
    const gap = Math.abs(value - ideal);
    const bestGap = Math.abs(best - ideal);
    return gap < bestGap - EPSILON || (Math.abs(gap - bestGap) <= EPSILON && value > best)
      ? value
      : best;
  }, choices[0]!);
}

/**
 * Two clip lengths that together come closest to a total, each one its model
 * accepts. Between equally close pairs: the one that isn't short of the total,
 * then the one whose first clip is longer.
 */
function closestPair(first: number[], second: number[], total: number): [number, number] {
  let best: [number, number] = [first[0]!, second[0]!];
  let bestGap = Infinity;
  for (const a of first)
    for (const b of second) {
      const gap = Math.abs(a + b - total);
      const short = a + b < total - EPSILON;
      const bestShort = best[0] + best[1] < total - EPSILON;
      const better =
        gap < bestGap - EPSILON ||
        (Math.abs(gap - bestGap) <= EPSILON &&
          ((!short && bestShort) || (short === bestShort && a > best[0] + EPSILON)));
      if (better) {
        best = [a, b];
        bestGap = gap;
      }
    }
  return best;
}

/** The lengths a clip may take: those its model accepts, up to the longest chosen. */
function capped(choices: number[], maxClipSeconds: number): number[] {
  const fit = choices.filter((value) => value <= maxClipSeconds + EPSILON);
  return fit.length ? fit : [Math.min(...choices)];
}

/** How long the first clip and each later clip run at most, up to the longest chosen. */
export function longestClips(input: {
  maxClipSeconds: number;
  firstChoices: number[];
  continuationChoices: number[];
}): { first: number; later: number } | null {
  if (!input.firstChoices.length || !input.continuationChoices.length) return null;
  return {
    first: Math.max(...capped(input.firstChoices, input.maxClipSeconds)),
    later: Math.max(...capped(input.continuationChoices, input.maxClipSeconds)),
  };
}

/**
 * Clip lengths for a total: every clip as long as its model allows (or the
 * longest chosen), so the video takes as few clips as it can, and the last
 * clip takes what is left. When what is left is shorter than any length the
 * model accepts, the last two clips share it so the total still comes out:
 * 45 s at 4–30 s clips is 30 + 15, 62 s is 30 + 28 + 4, 50 s at 3–15 s clips
 * is 15 + 15 + 15 + 5. Where a clip fewer, all at their longest, comes as
 * close (models with a few set lengths: 31 s of 5 s or 10 s clips is
 * 10 + 10 + 10, not 10 + 10 + 5 + 5), that is the plan. A total one clip can
 * hold comes back as that one clip.
 */
export function planDurations(input: {
  targetSeconds: number;
  maxClipSeconds: number;
  firstChoices: number[];
  continuationChoices: number[];
}): number[] {
  const { targetSeconds, maxClipSeconds, firstChoices, continuationChoices } = input;
  const longest = longestClips(input);
  if (!longest || !(targetSeconds > 0)) return [];
  const first = capped(firstChoices, maxClipSeconds);
  const later = capped(continuationChoices, maxClipSeconds);
  if (targetSeconds <= longest.first + EPSILON) return [nearest(first, targetSeconds)];
  const count = Math.min(
    LONG_VIDEO_LIMITS.maxClips,
    1 + Math.ceil((targetSeconds - longest.first) / longest.later - EPSILON),
  );
  const atLongest = (clips: number) =>
    Array.from({ length: clips }, (_, index) => (index === 0 ? longest.first : longest.later));
  // Every clip but the last two at its longest; the last two share the rest.
  const durations = atLongest(count - 2);
  durations.push(
    ...closestPair(count === 2 ? first : later, later, targetSeconds - totalSeconds(durations)),
  );
  const fewer = atLongest(count - 1);
  const gap = (plan: number[]) => Math.abs(totalSeconds(plan) - targetSeconds);
  return gap(fewer) <= gap(durations) + EPSILON ? fewer : durations;
}

/**
 * A clip's prompt: what happens in it (its beat), where it falls in the video,
 * what must stay the same, and the story the whole video tells. Clips after
 * the first are told they continue straight on from their first frame. The
 * short, specific parts come first, so a model that cuts long prompts short
 * keeps them.
 *
 * Told where it falls (with `count`), a clip before the last doesn't wrap the
 * story up: no closing shot, logo reveal or end card, which the next clip
 * would otherwise be chained on from. The last clip brings the video to its
 * close, on the brand's end card when the video has a finisher (`finale`).
 */
export function clipPrompt(input: {
  story: string;
  beat?: string | null;
  continuity?: string | null;
  index: number;
  /** How many clips the video has. */
  count?: number;
  /** How the video ends on the brand's finisher, when it has one. */
  finale?: FinaleMode | null;
}): string {
  const story = input.story.trim();
  const beat = input.beat?.trim() ?? "";
  const continuity = input.continuity?.trim() ?? "";
  const keep = continuity ? `Keep consistent throughout: ${continuity}` : "";
  const place =
    input.count && input.count > 1 ? clipPlace(input.index, input.count, input.finale ?? null) : "";
  const parts: string[] = [];
  if (input.index > 0) parts.push(FRAME_OPENING);
  if (beat) parts.push(beat, place, keep, story ? `Scene: ${story}` : "");
  else parts.push(story, place, keep);
  return parts.filter(Boolean).join("\n\n");
}

/**
 * How a later clip opens. It is generated from one still frame and so knows
 * nothing of the motion before it; told nothing, a model starts from rest and
 * the join reads as a stop and start.
 */
const FRAME_OPENING =
  "Continue seamlessly from the first frame, as the very next moment of the same continuous shot: everything already in motion (camera, people, objects, light) keeps moving in the same direction and at the same pace from the first instant, with no pause, reset or ease-in.";

/** Openings earlier versions wrote, still recognised in stored prompts. */
const PAST_FRAME_OPENINGS = [
  "Continue seamlessly from the first frame, as the next moment of the same continuous shot.",
];

/** How the last clip is told to end on the brand's end card, which is its final frame. */
export const FINALE_REVEAL_NOTE =
  "It ends on the brand's end card, its final frame: move into it and settle on it for the last moment, with the logo exactly as given.";

/** Where a clip falls in the video, and so how it may end. */
function clipPlace(index: number, count: number, finale: FinaleMode | null): string {
  const part = `Part ${index + 1} of ${count}`;
  if (index < count - 1)
    return `${part} of one continuous video. It carries straight on into the next part, so don't end or wrap up here: keep the camera and action moving right through the final frame (no slowing down, settling or holding still at the end), and no closing shot, logo reveal or end card.`;
  if (finale && finaleReveals(finale)) return `${part}, the last. ${FINALE_REVEAL_NOTE}`;
  if (finale)
    return `${part}, the last: bring the video to a calm close. The brand's end card follows straight after it, so no logo reveal or end card of its own.`;
  return `${part}, the last: bring the video to its close.`;
}

/** How a clip that starts from its first reference image is told so. */
export const REFERENCE_OPENING =
  "<<<image_1>>> is this clip's first frame: the last moment of the clip before. Start exactly on it and continue seamlessly, as the very next moment of the same continuous shot, with everything already in motion carrying on at the same pace from the first instant.";

const PAST_REFERENCE_OPENINGS = [
  "<<<image_1>>> is this clip's first frame: the last moment of the clip before. Start exactly on it and continue seamlessly, as the next moment of the same continuous shot.",
];

const MEDIA_TOKEN = /<<<(image|video|audio)_(\d+)>>>/g;
const IMAGE_TOKEN = /<<<image_(\d+)>>>/g;

/**
 * Where an image a prompt names by token is among the images a clip is sent:
 * its new number, words to say instead, or null when the clip isn't sent it.
 */
type ImageNumber = (n: number) => number | string | null;

/** How a prompt's token for the finisher reads in a clip that isn't sent it. */
const FINISHER_WORDS = "the brand's end card";

/**
 * A later clip's prompt for a model that starts from its first reference
 * image: the opening that says so, then the clip's own prompt with its media
 * tokens renumbered for what the clip is sent (the frame is image 1, the
 * carried references follow). A token for media the clip isn't sent becomes
 * plain words, as the provider refuses a token with nothing behind it.
 */
function referenceStartPrompt(prompt: string, imageNumber: ImageNumber): string {
  if ([REFERENCE_OPENING, ...PAST_REFERENCE_OPENINGS].some((text) => prompt.startsWith(text)))
    return prompt;
  const opening = [FRAME_OPENING, ...PAST_FRAME_OPENINGS].find((text) => prompt.startsWith(text));
  const body = opening ? prompt.slice(opening.length).trimStart() : prompt;
  const renumbered = body.replace(MEDIA_TOKEN, (_, type: string, n: string) => {
    const next = type === "image" ? imageNumber(Number(n)) : null;
    if (typeof next === "number") return `<<<image_${next}>>>`;
    return next ?? `the reference ${type}`;
  });
  return [REFERENCE_OPENING, renumbered].filter(Boolean).join("\n\n");
}

/** A prompt with its image tokens renumbered (a token that can't be is left as it is). */
function renumberImages(prompt: string, imageNumber: ImageNumber): string {
  return prompt.replace(IMAGE_TOKEN, (token, n: string) => {
    const next = imageNumber(Number(n));
    return typeof next === "number" ? `<<<image_${next}>>>` : (next ?? token);
  });
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

/* ------------------------------------------------------------------ */
/* The finisher: ending on the brand                                   */
/* ------------------------------------------------------------------ */

/**
 * How a long video ends on the brand's logo or end card (its finisher). The
 * finisher is never sent with the clips as a reference image, where a model
 * shows it partway through (clip 1 ending on the logo, and every later clip
 * chained on from there). Instead it closes the video:
 *   - "end_card": held as a still after the last clip, exactly as uploaded
 *     (added when the video is opened in the Editor);
 *   - "reveal": the last clip's final frame, so the video moves into it;
 *   - "both": the last clip moves into it, then it holds.
 */
export const FINALE_MODES = ["end_card", "reveal", "both"] as const;
export type FinaleMode = (typeof FINALE_MODES)[number];

/** How long the end card holds after the last clip, in seconds. */
export const FINALE_SECONDS = { min: 1, max: 10, default: 3 } as const;

export interface RunFinale {
  /** The finisher as uploaded: a logo, wordmark or end card. */
  assetId: string;
  mode: FinaleMode;
  /** How long the end card holds after the last clip. */
  seconds: number;
  /**
   * The finisher laid out at the video's own shape: what the last clip ends
   * on and the Editor holds. Without it, the finisher itself is used.
   */
  frameAssetId?: string | null | undefined;
  /**
   * How its end card was laid out (see EndCardStyle), so a card held after
   * the last clip can be laid out again over the video's final moment.
   */
  style?: { background: string; scale: number | null } | null | undefined;
}

/** The finisher holds as an end card after the last clip. */
export function finaleHolds(mode: FinaleMode): boolean {
  return mode !== "reveal";
}

/** The last clip moves into the finisher and ends on it. */
export function finaleReveals(mode: FinaleMode): boolean {
  return mode !== "end_card";
}

/** How a model ends a clip on a given image. */
export type ClipEnd =
  /** Its end-frame input. */
  | { kind: "frame"; role: string }
  /** One of its reference images, named in the prompt as the last frame. */
  | { kind: "reference"; role: string };

export function clipEnd(model: ModelRegistryEntry | null | undefined): ClipEnd | null {
  const frame = (model?.capabilities?.inputs ?? []).find(
    (slot) => slot.type === "image" && slot.role === "last_frame",
  );
  if (frame) return { kind: "frame", role: frame.role };
  // A model that starts from a reference image names its references by token
  // (<<<image_n>>>), so its prompt can name the finisher as the last frame too.
  const start = clipStart(model);
  return start?.kind === "reference" ? { kind: "reference", role: start.role } : null;
}

/** The last clip's prompt, naming the finisher (image `n` among its references) as its final frame. */
function namedEnding(prompt: string, n: number): string {
  const named = `${FINALE_REVEAL_NOTE} The end card is <<<image_${n}>>>.`;
  if (prompt.includes(named)) return prompt;
  return prompt.includes(FINALE_REVEAL_NOTE)
    ? prompt.replace(FINALE_REVEAL_NOTE, named)
    : `${prompt}\n\n${named}`;
}

/**
 * The run's reference images that every later clip is sent again, where its
 * model takes reference images alongside a start frame: a character or
 * product sheet then keeps them the same from clip to clip. (Start and end
 * frames, videos and audio belong to the first clip only.) `reserve` keeps
 * places free for other images the clips are sent.
 */
export function carriedReferences(
  references: RunReference[],
  continuation: ModelRegistryEntry,
  reserve = 0,
): { assetId: string; role: string }[] {
  const slot = (continuation.capabilities?.inputs ?? []).find(
    (entry) => entry.role === "reference" && entry.type === "image",
  );
  if (!slot) return [];
  // A model that starts from its first reference image keeps that place for the frame.
  const room = (slot.max ?? 1) - (clipStart(continuation)?.kind === "reference" ? 1 : 0) - reserve;
  // Images the first clip's model couldn't use ("unused") are references too.
  return references
    .filter(
      (item) => item.assetType === "image" && (item.role === "reference" || item.role === "unused"),
    )
    .slice(0, Math.max(0, room))
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
  /** The finisher the clip ends on (the last clip, when the video moves into it). */
  ending: { assetId: string; role: string } | null;
}

/**
 * Every clip's model, settings and media, as the run will send them. A
 * finisher is kept out of every clip's references; with `finale` set to move
 * into it, the last clip ends on it.
 */
export function planClips(input: {
  first: ModelRegistryEntry;
  continuation: ModelRegistryEntry;
  values: Record<string, unknown>;
  references: RunReference[];
  clips: ClipDraft[];
  finale?: RunFinale | null;
}): PlannedClip[] {
  const { first, continuation, values } = input;
  const finale = input.finale ?? null;
  const finisher = new Set(
    [finale?.assetId, finale?.frameAssetId].filter((id): id is string => !!id),
  );
  const references = input.references.filter((item) => !finisher.has(item.assetId));
  const start = clipStart(continuation);
  const startRole = start?.role ?? null;
  const firstInputs = references
    .filter((item) => item.role && item.role !== "unused")
    .map((item) => ({ assetId: item.assetId, role: item.role }));
  const laterValues = carryValues(values, continuation);
  const end = finale && finaleReveals(finale.mode) ? clipEnd(continuation) : null;
  // Reference images go along only where the model takes them with a start
  // frame (some take one or the other, never both). A finisher named among
  // the references keeps a place free for itself.
  let carried = carriedReferences(references, continuation, end?.kind === "reference" ? 1 : 0);
  const rolesWith = (items: { role: string }[]) => [
    ...(startRole ? [startRole] : []),
    ...items.map((item) => item.role),
  ];
  const takes = (items: { role: string }[]) =>
    !validateParameters(continuation, laterValues, rolesWith(items)).some(
      (issue) => issue.key === "inputs",
    );
  if (carried.length && !takes(carried)) carried = [];
  // The images a prompt names by token (<<<image_n>>>): those attached in the
  // start role, in order, as written (the finisher among them).
  const named = input.references
    .filter((item) => item.assetType === "image" && item.role === startRole)
    .map((item) => item.assetId);
  /** A named image's number among `sent`, which follow `before` other images. */
  const numberIn =
    (sent: { assetId: string }[], before: number): ImageNumber =>
    (n) => {
      const assetId = named[n - 1];
      if (assetId && finisher.has(assetId)) return FINISHER_WORDS;
      const at = sent.findIndex((item) => item.assetId === assetId);
      return at >= 0 ? at + 1 + before : null;
    };
  // Clip 1 isn't sent the finisher, so the images after it move up a place.
  const firstNumber = named.some((assetId) => finisher.has(assetId))
    ? numberIn(
        firstInputs.filter((item) => item.role === startRole),
        0,
      )
    : null;
  const ending =
    end && finale ? { assetId: finale.frameAssetId || finale.assetId, role: end.role } : null;
  // The end frame comes first in the last clip: where the model can't take
  // it with the carried references, they are left out of that clip.
  const lastCarried = ending && !takes([...carried, ending]) ? [] : carried;
  const lastPosition = input.clips.length - 1;
  return input.clips.map((clip, position) => {
    const isFirst = position === 0;
    const model = isFirst ? first : continuation;
    const ends = !isFirst && position === lastPosition ? ending : null;
    const sent = ends ? lastCarried : carried;
    const inputs = isFirst ? firstInputs : ends ? [...sent, ends] : sent;
    let prompt = clip.prompt;
    if (isFirst && firstNumber) prompt = renumberImages(prompt, firstNumber);
    // Later clips start from the frame before as image 1, then the carried references.
    else if (!isFirst && start?.kind === "reference")
      prompt = referenceStartPrompt(prompt, numberIn(sent, 1));
    // ...and the last ends on the finisher, after them.
    if (ends && end?.kind === "reference") prompt = namedEnding(prompt, sent.length + 2);
    return {
      ...clip,
      prompt,
      position,
      model,
      values: clipValues(model, values, { ...clip, prompt }, { asChosen: isFirst }),
      roles: isFirst ? inputs.map((item) => item.role) : rolesWith(inputs),
      inputs,
      ending: ends,
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
  finale?: RunFinale | null;
}): PlanIssue[] {
  const { first, continuation, clips } = input;
  const finale = input.finale ?? null;
  const issues: PlanIssue[] = [];
  if (!first || !longVideoEligible(first))
    return [
      { position: null, message: "Choose a video model that generates clips of a set length" },
    ];
  if (!continuation)
    return [
      {
        position: null,
        message: `${modelLine(first)} has no workflow that starts from a frame, so its clips can't be chained into one video. Choose another model.`,
      },
    ];
  if (!canContinue(continuation) || !sameModel(first, continuation))
    return [
      {
        position: null,
        message: `Clips 2 onward must be made by ${modelLine(first)} too, starting from a frame, so the whole video stays consistent`,
      },
    ];
  const endCardSeconds = finale && finaleHolds(finale.mode) ? finale.seconds : 0;
  if (!(input.targetSeconds > 0) || input.targetSeconds > LONG_VIDEO_LIMITS.maxSeconds)
    issues.push({
      position: null,
      message: `A long video can run up to ${LONG_VIDEO_LIMITS.maxSeconds / 60} minutes`,
    });
  else if (input.targetSeconds + endCardSeconds > LONG_VIDEO_LIMITS.maxSeconds)
    issues.push({
      position: null,
      message: `With its ${endCardSeconds}s end card the video runs over ${LONG_VIDEO_LIMITS.maxSeconds / 60} minutes, the most one edit holds: make it a little shorter`,
    });
  if (finale) {
    if (!FINALE_MODES.includes(finale.mode))
      issues.push({ position: null, message: "Choose how the video ends on the finisher" });
    if (
      finaleHolds(finale.mode) &&
      !(finale.seconds >= FINALE_SECONDS.min && finale.seconds <= FINALE_SECONDS.max)
    )
      issues.push({
        position: null,
        message: `The end card holds for ${FINALE_SECONDS.min} to ${FINALE_SECONDS.max} seconds`,
      });
    if (finaleReveals(finale.mode) && !clipEnd(continuation))
      issues.push({
        position: null,
        message: `${modelLine(continuation)} can't end a clip on a given image, so the video can't move into the finisher. Choose "End card" to hold it after the last clip instead.`,
      });
  }
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

/** Where each clip starts in the video, in seconds. */
export function clipStarts(durations: number[]): number[] {
  return durations.map((_, index) => totalSeconds(durations.slice(0, index)));
}

/**
 * A long video's approximate cost from its first clip's quote, by the second.
 * Each clip is quoted again by the provider before it is sent.
 */
export function approxRunCost(
  firstClipUsd: number,
  firstClipSeconds: number,
  runSeconds: number,
): number {
  return (firstClipUsd / firstClipSeconds) * runSeconds;
}

/** "45s", "1:30", "10:00". */
export function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
