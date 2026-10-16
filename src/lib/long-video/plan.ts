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
 *
 * Where the model also has a workflow that extends a video (Seedance's video
 * extend), the later clips can be made by it instead: each is given the clip
 * before itself, not a still of its end, so motion, light and sound carry on
 * through the join. That is experimental, so it is only ever chosen, never
 * picked automatically.
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
import { billableInputSeconds, meteredQuote, parseMeteredRates } from "../higgsfield/metered";
import { charactersLine, interleaveSheets, type RunCharacter } from "../characters/model";
import { drivingAudioSlot, lipSyncCapable, lipSyncValues } from "../lip-sync/models";
import { withLipSyncLine } from "../lip-sync/prompt";

/**
 * Why a run waits on a person rather than on something Continue can fix
 * (long_videos.error_code while it needs attention): keyframes to review, a
 * keyframe to redo, a keyframe whose character changed (before the rest are
 * painted from it), or a clip whose character changed. Each has its own
 * actions; Continue would only stop it again.
 */
export const PERSON_PAUSES = [
  "STORYBOARD_READY",
  "KEYFRAME_FAILED",
  "KEYFRAME_CHECK",
  "CHARACTER_CHECK",
] as const;

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

/** The video a workflow continues (video extend's source video), if it takes one. */
export function sourceVideoSlot(model: ModelRegistryEntry | null | undefined): InputSlot | null {
  return (
    model?.capabilities?.inputs?.find((slot) => slot.type === "video" && slot.role === "source") ??
    null
  );
}

/**
 * A workflow that carries a given video on past its end, for a length you
 * choose (Seedance's video extend). As the later clips of a long video it is
 * given the clip before itself rather than a still of its last frame.
 */
export function extendsVideo(model: ModelRegistryEntry | null | undefined): boolean {
  return (
    !!model &&
    model.output_type === "video" &&
    model.operation === "video-extend" &&
    !!sourceVideoSlot(model) &&
    durationChoices(model).length > 0
  );
}

/** How a model starts a clip from where the clip before left off. */
export type ClipStart =
  /** Its start-frame input. */
  | { kind: "frame"; role: string }
  /** Its first reference image, named in the prompt. */
  | { kind: "reference"; role: string }
  /** Its source video: the clip before, which it extends. */
  | { kind: "video"; role: string };

export function clipStart(model: ModelRegistryEntry | null | undefined): ClipStart | null {
  if (extendsVideo(model)) return { kind: "video", role: sourceVideoSlot(model)!.role };
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

/** A model that can make the clips after the first: it starts from a given frame, or extends the clip before. */
export function canContinue(model: ModelRegistryEntry | null | undefined): boolean {
  return (longVideoEligible(model) && !!clipStart(model)) || extendsVideo(model);
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
 *
 * With `extend`, the model's video extend workflow is listed too, last: it
 * is experimental, so it is offered but never the one picked by default.
 */
export function continuationCandidates(
  first: ModelRegistryEntry,
  models: ModelRegistryEntry[],
  options: { withReferences?: boolean; extend?: boolean } = {},
): ModelRegistryEntry[] {
  const score = (model: ModelRegistryEntry) =>
    (model.id === first.id ? 100 : 0) +
    (options.withReferences && hasReferenceSlot(model) ? 5 : 0) +
    (model.operation === "image-to-video" ? 2 : 0) -
    (extendsVideo(model) ? 1000 : 0);
  return models
    .filter(
      (model) =>
        model.is_active &&
        sameModel(model, first) &&
        canContinue(model) &&
        (options.extend || !extendsVideo(model)),
    )
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

/** How a clip that extends the clip before is told so: it is given that clip's video, not a still. */
export const VIDEO_OPENING =
  "Extend the given video: carry it straight on past its last frame, as the very next moment of the same continuous shot. Everything already in motion (camera, people, objects, light and sound) keeps moving in the same direction and at the same pace, with no cut, pause, reset or ease-in.";

/** Every opening a clip's prompt can start with (a paragraph of its own). */
const OPENINGS: readonly string[] = [
  FRAME_OPENING,
  ...PAST_FRAME_OPENINGS,
  REFERENCE_OPENING,
  ...PAST_REFERENCE_OPENINGS,
  VIDEO_OPENING,
  "<<<image_1>>> is this clip's first frame. Start exactly on it",
];

/** A later clip's prompt for a workflow that extends the clip before: the opening that says so. */
function videoStartPrompt(prompt: string): string {
  if (prompt.startsWith(VIDEO_OPENING)) return prompt;
  const opening = [FRAME_OPENING, ...PAST_FRAME_OPENINGS].find((text) => prompt.startsWith(text));
  const body = opening ? prompt.slice(opening.length).trimStart() : prompt;
  return [VIDEO_OPENING, body].filter(Boolean).join("\n\n");
}

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
  /**
   * The finisher (designed artwork) extended to the video's own shape with
   * AI, its own pixels laid back over the result: what its end card is made
   * from in its place. Without it, the finisher as uploaded.
   */
  sourceAssetId?: string | null | undefined;
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
  const slot = referenceSlot(continuation);
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

function referenceSlot(model: ModelRegistryEntry) {
  return (
    (model.capabilities?.inputs ?? []).find(
      (entry) => entry.role === "reference" && entry.type === "image",
    ) ?? null
  );
}

/**
 * Whether a model takes this many inputs in these roles: no slot over its
 * size and no rule across inputs broken (a required input still to come,
 * such as a start frame supplied at run time, doesn't count against it).
 */
function fitsInputs(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  roles: string[],
): boolean {
  for (const slot of model.capabilities?.inputs ?? []) {
    const count = roles.filter((role) => role === slot.role).length;
    if (slot.max && count > slot.max) return false;
  }
  return !validateParameters(model, values, roles).some((issue) => issue.key === "inputs");
}

/* ------------------------------------------------------------------ */
/* Characters in clips                                                 */
/* ------------------------------------------------------------------ */

/** A character name as a whole word, as written ("Will" isn't "will"). */
function namePatterns(name: string): RegExp[] {
  const clean = name.trim();
  if (!clean) return [];
  const first = clean.split(/\s+/)[0]!;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const words = first !== clean && first.length >= 2 ? [clean, first] : [clean];
  return words.map(
    (word) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}(?=$|[^\\p{L}\\p{N}])`, "u"),
  );
}

/**
 * Who is in a clip: the characters its beat names (by full or first name, as
 * written), or all of them when it names none, so "they walk on" keeps
 * everyone in. Only they are written into its prompt and sent their images.
 */
export function castOf<T extends { name: string }>(
  beat: string | null | undefined,
  characters: T[],
): T[] {
  if (!characters.length) return [];
  const text = beat ?? "";
  const named = characters.filter((character) =>
    namePatterns(character.name).some((pattern) => pattern.test(text)),
  );
  return named.length ? named : characters;
}

/**
 * The images a clip is sent with its start frame, best first, as far as its
 * model takes them: each character in it at their best view, then the
 * person's own image references, then the characters' other views.
 */
function clipImages(
  cast: RunCharacter[],
  own: { assetId: string }[],
): { assetId: string; characterId: string | null }[] {
  const sheets = interleaveSheets(cast);
  const firsts = new Set(
    cast.flatMap((character) => {
      const first = sheets.find((entry) => entry.characterId === character.id);
      return first ? [first.assetId] : [];
    }),
  );
  const out: { assetId: string; characterId: string | null }[] = [];
  const seen = new Set<string>();
  const add = (assetId: string, characterId: string | null) => {
    if (seen.has(assetId)) return;
    seen.add(assetId);
    out.push({ assetId, characterId });
  };
  for (const entry of sheets) if (firsts.has(entry.assetId)) add(entry.assetId, entry.characterId);
  for (const item of own) add(item.assetId, null);
  for (const entry of sheets) add(entry.assetId, entry.characterId);
  return out;
}

/** Where each character's images are among a clip's images, as prompt tokens (<<<image_n>>>). */
function characterTokens(
  cast: RunCharacter[],
  sent: { assetId: string; characterId?: string | null }[],
  before: number,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const character of cast) {
    const tokens = sent.flatMap((item, index) =>
      item.characterId === character.id ? [`<<<image_${index + 1 + before}>>>`] : [],
    );
    if (tokens.length) out.set(character.id, tokens.join(", "));
  }
  return out;
}

/** A paragraph put right after the beat (or the opening, with no beat), before everything else. */
function afterBeat(prompt: string, beat: string, paragraph: string): string {
  if (!paragraph) return prompt;
  const parts = prompt.split("\n\n");
  const at = beat.trim() ? parts.findIndex((part) => part === beat.trim()) : -1;
  const opening = OPENINGS.some((text) => parts[0]?.startsWith(text)) ? 1 : 0;
  const index = at >= 0 ? at + 1 : opening;
  return [...parts.slice(0, index), paragraph, ...parts.slice(index)].join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Prompt length                                                       */
/* ------------------------------------------------------------------ */

/**
 * How much of a prompt a model reads: its own limit, else what Higgsfield's
 * notes give for the family (Kling cuts anything past 2,500 characters
 * without saying; MiniMax H3 reads 7,000), else no limit.
 */
const KNOWN_PROMPT_LIMITS: [RegExp, number][] = [
  [/^kling-video\/v3\.0-turbo\/text-to-video/, 3072],
  [/^kling-video\//, 2500],
  [/^minimax\/h3\//, 7000],
];

export function promptBudget(model: ModelRegistryEntry | null | undefined): number | null {
  if (!model) return null;
  const field = model.parameter_schema?.fields?.find((entry) => entry.key === "prompt");
  if (typeof field?.maxLength === "number" && field.maxLength > 0) return field.maxLength;
  return KNOWN_PROMPT_LIMITS.find(([path]) => path.test(model.model_path))?.[1] ?? null;
}

/** Room kept in a later clip's prompt for the line on how the camera was moving, added as it starts. */
export const CAMERA_LINE_ROOM = 220;

/** The most a clip's prompt can be stored with. */
export const CLIP_PROMPT_MAX_CHARS = 12000;

const STORY_PREFIX = "Scene: ";
const KEEP_PREFIX = "Keep consistent throughout: ";

/**
 * A prompt cut to what its model reads, least important first: the story
 * (where a beat already says what happens), then the continuity notes. The
 * beat, characters and where the clip falls are never cut; a prompt still too
 * long is reported (planIssues).
 */
export function fitPrompt(prompt: string, budget: number | null): string {
  if (!budget || prompt.length <= budget) return prompt;
  let parts = prompt.split("\n\n");
  for (const prefix of [STORY_PREFIX, KEEP_PREFIX]) {
    const over = parts.join("\n\n").length - budget;
    if (over <= 0) break;
    const at = parts.findIndex((part) => part.startsWith(prefix));
    if (at < 0) continue;
    const part = parts[at]!;
    const keep = part.length - over - 1;
    parts =
      keep >= prefix.length + 60
        ? [...parts.slice(0, at), `${part.slice(0, keep).trimEnd()}…`, ...parts.slice(at + 1)]
        : [...parts.slice(0, at), ...parts.slice(at + 1)];
  }
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Keyframes in clips                                                  */
/* ------------------------------------------------------------------ */

/**
 * The keyframes a clip of a keyframed video starts and ends on: clip 1 starts
 * on the opening keyframe (later clips start on the true last frame of the
 * clip before, so the joins stay seamless), and clip i ends on keyframe i,
 * except a last clip that moves into the brand's end card.
 */
export function clipKeyframes(
  position: number,
  count: number,
  finale: FinaleMode | null,
): { start: number | null; end: number | null } {
  const last = position === count - 1;
  return {
    start: position === 0 ? 0 : null,
    end: last && finale && finaleReveals(finale) ? null : position + 1,
  };
}

/** How the first clip of a keyframed video opens when its frame is its first reference image. */
export const KEYFRAME_REFERENCE_OPENING =
  "<<<image_1>>> is this clip's first frame. Start exactly on it and carry the action on from there.";

/** How a clip is told it ends on the keyframe it is sent as reference image `n`. */
function keyframeEnding(prompt: string, n: number): string {
  return `${prompt}\n\nIt ends exactly on <<<image_${n}>>>: the clip's final frame, with everyone in it looking just as they do there.`;
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
  /** Media roles the clip is sent with, its start frame (and end keyframe) included. */
  roles: string[];
  inputs: { assetId: string; role: string }[];
  /** The finisher the clip ends on (the last clip, when the video moves into it). */
  ending: { assetId: string; role: string } | null;
  /** The keyframe it starts on (clip 1 of a keyframed video), sent first when it starts. */
  startKeyframe: number | null;
  /** The keyframe it ends on (keyframed videos), sent last when it starts. */
  endKeyframe: number | null;
  /** The characters in it (by id), whose look its prompt carries. */
  cast: string[];
  /** How many of their reference images it is sent. */
  characterImages: number;
  /** How much of its prompt its model reads (null: all of it). */
  promptBudget: number | null;
}

/**
 * Every clip's model, settings and media, as the run will send them. A
 * finisher is kept out of every clip's references; with `finale` set to move
 * into it, the last clip ends on it.
 *
 * With `characters`, each clip carries the look of the characters in it and
 * is sent their reference images wherever its model takes them (clip 1 within
 * the first model's own input rules). With `keyframes`, every clip is made by
 * `continuation` (a workflow that starts from a frame and ends on one): clip
 * 1 starts on the opening keyframe, every clip ends on its keyframe, and the
 * person's own start or end frame stands in for the first or last keyframe.
 *
 * With `voiceover`, every clip is made from its own piece of a voiceover (see
 * ./voiceover): sent in its model's driving-audio input when it starts (the
 * piece is cut then, as the start frame is taken then), with no other sound,
 * as one continuous shot, and told that someone speaks it.
 */
export function planClips(input: {
  first: ModelRegistryEntry;
  continuation: ModelRegistryEntry;
  values: Record<string, unknown>;
  references: RunReference[];
  clips: ClipDraft[];
  finale?: RunFinale | null;
  characters?: RunCharacter[];
  keyframes?: boolean;
  voiceover?: boolean;
}): PlannedClip[] {
  const { continuation } = input;
  const voiced = !!input.voiceover;
  const values = voiced ? lipSyncValues(input.values, [input.first, continuation]) : input.values;
  const keyframed = !!input.keyframes;
  const first = keyframed ? continuation : input.first;
  const finale = input.finale ?? null;
  const characters = input.characters ?? [];
  const finisher = new Set(
    [finale?.assetId, finale?.frameAssetId, finale?.sourceAssetId].filter(
      (id): id is string => !!id,
    ),
  );
  const start = clipStart(continuation);
  const startRole = start?.role ?? null;
  const endWay = clipEnd(continuation);
  const reveal = finale && finaleReveals(finale.mode) ? endWay : null;
  // In a keyframed video the person's own start and end frames are keyframes,
  // never also sent as references.
  const frameRoles = new Set(
    keyframed
      ? [start?.kind === "frame" ? startRole : null, endWay?.kind === "frame" ? endWay.role : null]
      : [],
  );
  // A voiceover is the only sound a clip made to it is sent.
  const references = input.references.filter(
    (item) =>
      !finisher.has(item.assetId) &&
      !frameRoles.has(item.role) &&
      !(voiced && item.assetType === "audio"),
  );
  const laterValues = carryValues(values, continuation);
  const slot = referenceSlot(continuation);
  const tokens = start?.kind === "reference";

  // The person's own images a later clip can be sent (as references).
  const own = references.filter(
    (item) => item.assetType === "image" && (item.role === "reference" || item.role === "unused"),
  );
  const rolesWith = (items: { role: string }[], endRole: string | null) => [
    ...(startRole ? [startRole] : []),
    ...items.map((item) => item.role),
    ...(endRole ? [endRole] : []),
  ];

  // The images a prompt names by token (<<<image_n>>>): the person's own,
  // attached in the start role, in order, as written (the finisher among them).
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

  const lastPosition = input.clips.length - 1;
  return input.clips.map((clip, position) => {
    const isFirst = position === 0;
    const model = isFirst ? first : continuation;
    const cast = castOf(clip.beat, characters);
    const frames = keyframed
      ? clipKeyframes(position, input.clips.length, finale?.mode ?? null)
      : { start: null, end: null };
    // Ends on the brand's end card, on a keyframe, or on nothing given. (A
    // keyframed video's only clip too: its closing keyframe is the end card.)
    const endsOnFinisher =
      position === lastPosition && (!isFirst || keyframed) && !!reveal && !!finale;
    const endsOnKeyframe = frames.end !== null && !!endWay;
    const endRole = endsOnKeyframe ? endWay!.role : null;
    // Its piece of the voiceover, supplied when it starts.
    const audioRole = voiced ? (drivingAudioSlot(model)?.role ?? null) : null;
    const audioRoles = audioRole ? [audioRole] : [];
    const ending =
      endsOnFinisher && reveal && finale
        ? { assetId: finale.frameAssetId || finale.assetId, role: reveal.role }
        : null;

    let inputs: { assetId: string; role: string }[];
    let roles: string[];
    // The images in the order a prompt numbers them, and how many show characters.
    let numbered: { assetId: string; characterId: string | null }[];
    let before: number;
    let characterCount: number;
    if (isFirst && !keyframed) {
      // Clip 1 as set up, plus its characters' images where the model takes
      // them, within all its input rules (slot sizes, combinations).
      const own1 = references
        .filter((item) => item.role && item.role !== "unused")
        .map((item) => ({ assetId: item.assetId, role: item.role }));
      const firstSlot = referenceSlot(first);
      const extra: { assetId: string; role: string; characterId: string }[] = [];
      if (firstSlot)
        for (const entry of interleaveSheets(cast, new Set(own1.map((item) => item.assetId)))) {
          const roles1 = [
            ...[...own1, ...extra, { role: firstSlot.role }].map((item) => item.role),
            ...audioRoles,
          ];
          if (fitsInputs(first, values, roles1))
            extra.push({
              assetId: entry.assetId,
              role: firstSlot.role,
              characterId: entry.characterId,
            });
        }
      inputs = [...own1, ...extra.map(({ assetId, role }) => ({ assetId, role }))];
      roles = [...inputs.map((item) => item.role), ...audioRoles];
      // A prompt names images by their place among those in the start role (Cinema Studio).
      numbered = inputs
        .filter((item) => item.role === startRole)
        .map((item) => ({
          assetId: item.assetId,
          characterId: extra.find((entry) => entry.assetId === item.assetId)?.characterId ?? null,
        }));
      before = 0;
      characterCount = extra.length;
    } else {
      // A frame first (the keyframe, or the clip before's last frame), then the
      // images, then the end keyframe or end card, as far as the model takes them.
      const endsOnReference =
        (endsOnKeyframe && endWay?.kind === "reference") ||
        (endsOnFinisher && reveal?.kind === "reference");
      const room = slot
        ? Math.max(
            0,
            (slot.max ?? 1) - (start?.kind === "reference" ? 1 : 0) - (endsOnReference ? 1 : 0),
          )
        : 0;
      const tail = [...(endRole ? [endRole] : []), ...(ending ? [ending.role] : []), ...audioRoles];
      const chosen: { assetId: string; characterId: string | null }[] = [];
      if (slot)
        for (const entry of clipImages(cast, own)) {
          if (chosen.length >= room) break;
          const trial = [...chosen, entry].map(() => ({ role: slot.role }));
          if (fitsInputs(model, laterValues, [...rolesWith(trial, null), ...tail]))
            chosen.push(entry);
        }
      const sent = slot ? chosen.map((entry) => ({ assetId: entry.assetId, role: slot.role })) : [];
      inputs = ending ? [...sent, ending] : sent;
      roles = [...rolesWith(inputs, endRole), ...audioRoles];
      numbered = chosen;
      before = 1;
      characterCount = chosen.filter((entry) => entry.characterId).length;
    }

    let prompt = clip.prompt;
    if (isFirst && !keyframed) prompt = renumberImages(prompt, numberIn(numbered, 0));
    // Later clips start from the frame before as image 1, then the images sent.
    else if (tokens)
      prompt = isFirst
        ? keyframeStartPrompt(prompt, numberIn(numbered, 1))
        : referenceStartPrompt(prompt, numberIn(numbered, 1));
    // ...or are given the clip before itself, to extend.
    else if (!isFirst && start?.kind === "video") prompt = videoStartPrompt(prompt);
    // A video of one clip isn't told where it falls (see clipPrompt), so moving
    // into the end card is said here.
    if (ending && lastPosition === 0 && !prompt.includes(FINALE_REVEAL_NOTE))
      prompt = `${prompt}\n\n${FINALE_REVEAL_NOTE}`;
    // The end card or keyframe a reference model ends on comes after the images.
    if (ending && reveal?.kind === "reference") prompt = namedEnding(prompt, inputs.length + 1);
    else if (endsOnKeyframe && endWay?.kind === "reference")
      prompt = keyframeEnding(prompt, inputs.length + 2);

    // The look of the characters in it, right after what happens.
    const budget = promptBudget(model);
    const room = budget
      ? budget - (!isFirst && start?.kind !== "video" ? CAMERA_LINE_ROOM : 0)
      : null;
    const line = (descriptionChars: number) =>
      charactersLine(cast, {
        references: characterCount > 0,
        // Only a model that names its images by token can be told which are whose.
        images:
          clipStart(model)?.kind === "reference"
            ? characterTokens(cast, numbered, before)
            : undefined,
        descriptionChars,
      });
    let composed = fitPrompt(afterBeat(prompt, clip.beat, line(360)), room);
    for (const chars of [220, 120]) {
      if (!room || composed.length <= room || !cast.length) break;
      composed = fitPrompt(afterBeat(prompt, clip.beat, line(chars)), room);
    }
    prompt = voiced ? withLipSyncLine(composed) : composed;

    return {
      ...clip,
      prompt,
      position,
      model,
      values: clipValues(model, values, { ...clip, prompt }, { asChosen: isFirst && !keyframed }),
      roles,
      inputs,
      ending,
      startKeyframe: frames.start,
      endKeyframe: endsOnKeyframe ? frames.end : null,
      cast: cast.map((character) => character.id),
      characterImages: characterCount,
      promptBudget: budget,
    };
  });
}

/** Clip 1 of a keyframed video, for a model that starts from its first reference image. */
function keyframeStartPrompt(prompt: string, imageNumber: ImageNumber): string {
  if (prompt.startsWith(KEYFRAME_REFERENCE_OPENING)) return prompt;
  const renumbered = prompt.replace(MEDIA_TOKEN, (_, type: string, n: string) => {
    const next = type === "image" ? imageNumber(Number(n)) : null;
    if (typeof next === "number") return `<<<image_${next}>>>`;
    return next ?? `the reference ${type}`;
  });
  return [KEYFRAME_REFERENCE_OPENING, renumbered].filter(Boolean).join("\n\n");
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
  keyframes?: boolean;
  /** Made to a voiceover (see ./voiceover): its clips can be as few as one. */
  voiceover?: boolean;
}): PlanIssue[] {
  const { first, continuation, clips } = input;
  const finale = input.finale ?? null;
  const issues: PlanIssue[] = [];
  if (!first || !longVideoEligible(first))
    return [
      { position: null, message: "Choose a video model that generates clips of a set length" },
    ];
  // Made to a voiceover: what the model can do with it is the first question.
  if (
    input.voiceover &&
    !(lipSyncCapable(first) && (!continuation || lipSyncCapable(continuation)))
  )
    return [
      {
        position: null,
        message: `${modelLine(first)} can't move a speaker's lips to a voiceover. Choose a model with driving audio (Wan 2.6 or Wan 2.7).`,
      },
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
  if (
    input.keyframes &&
    !(clipStart(continuation) && clipEnd(continuation) && !extendsVideo(continuation))
  )
    return [
      {
        position: null,
        message: `${modelLine(first)} can't end a clip on a given frame, so it can't move between keyframes. Turn keyframes off or choose another model.`,
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
  if (clips.length < (input.voiceover ? 1 : LONG_VIDEO_LIMITS.minClips))
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
    if (input.keyframes && !clip.beat.trim())
      issues.push({
        position: clip.position,
        message: `${label}: keyframes are painted from what happens in each clip, so write its beat (or use Write beats with AI)`,
      });
    if (clip.prompt.length > CLIP_PROMPT_MAX_CHARS)
      issues.push({
        position: clip.position,
        message: `${label}: its prompt runs to ${clip.prompt.length} characters (at most ${CLIP_PROMPT_MAX_CHARS}); shorten the story or its beat`,
      });
    else if (clip.promptBudget && clip.prompt.length > clip.promptBudget)
      issues.push({
        position: clip.position,
        message: `${label}: ${modelLine(clip.model)} reads only the first ${clip.promptBudget} characters of a prompt and this one has ${clip.prompt.length}; shorten its beat or the characters' descriptions`,
      });
    for (const issue of validateParameters(clip.model, clip.values, clip.roles)) {
      // The start frame (and end keyframe) are supplied by the run itself.
      if (
        (clip.position > 0 || clip.startKeyframe !== null) &&
        issue.key === startFrameSlot(clip.model)?.role
      )
        continue;
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

/**
 * A long video's approximate cost when its later clips extend the clip before
 * (video extend): each is billed for the clip it is given as well as for what
 * it makes, at the provider's rate for requests with video input. Null when
 * the provider's rates can't be read from its pricing description.
 */
export function approxExtendRunCost(input: {
  firstClipUsd: number;
  durations: number[];
  /** The provider's pricing description, which gives its rates. */
  description: string | null | undefined;
  resolution: string | null | undefined;
  /** The video's shape; the extensions keep the first clip's. */
  aspectRatio: string | null | undefined;
}): number | null {
  const rates = parseMeteredRates(input.description);
  if (!rates) return null;
  let total = input.firstClipUsd;
  for (let index = 1; index < input.durations.length; index += 1) {
    const quote = meteredQuote({
      rates,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      seconds: input.durations[index],
      inputVideoSeconds: billableInputSeconds(input.durations[index - 1]!),
    });
    if (!quote) return null;
    total += quote.usd;
  }
  return total;
}

/** "45s", "1:30", "10:00". */
export function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
