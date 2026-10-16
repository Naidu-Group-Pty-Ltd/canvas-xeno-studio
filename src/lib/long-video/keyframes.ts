/**
 * Keyframes: a long video painted as stills first. Before any clip is made,
 * an image model paints the frame the video opens on (keyframe 0) and the
 * frame each clip ends on (keyframe i ends clip i), every one from the
 * characters' reference sheets and the keyframe before it, so they all show
 * the same people in the same place. Then every clip starts where the one
 * before really ended (its true last frame, so the joins stay seamless) and
 * ends on its keyframe, so a character can't drift further than one clip.
 *
 * Shared by Create (to show and price it) and the server (to run it).
 */
import { defaultsForModel, normalizeOption, type ModelRegistryEntry } from "../model-schema";
import { charactersLine, interleaveSheets, type RunCharacter } from "../characters/model";
import { lipSyncCapable } from "../lip-sync/models";
import {
  clipEnd,
  clipKeyframes,
  clipStart,
  continuationCandidates,
  extendsVideo,
  finaleReveals,
  longVideoEligible,
  startFrameSlot,
  type FinaleMode,
  type PlannedClip,
  type RunFinale,
  type RunReference,
} from "./plan";

/* ------------------------------------------------------------------ */
/* The video workflow                                                  */
/* ------------------------------------------------------------------ */

/**
 * A workflow that can make a clip from one keyframe to the next: it starts
 * from a given frame (its start-frame input, or Cinema Studio's first
 * reference image) and ends on one (its end-frame input, or a reference image
 * the prompt names as its last frame).
 */
export function movesBetweenFrames(model: ModelRegistryEntry | null | undefined): boolean {
  if (!model || !longVideoEligible(model) || extendsVideo(model)) return false;
  const start = clipStart(model);
  return (start?.kind === "frame" || start?.kind === "reference") && !!clipEnd(model);
}

function hasReferenceImages(model: ModelRegistryEntry): boolean {
  return (model.capabilities?.inputs ?? []).some(
    (slot) => slot.role === "reference" && slot.type === "image",
  );
}

/**
 * The workflow of the chosen model that makes every clip of a keyframed long
 * video, best first: the chosen workflow itself when it can, then one that
 * also takes reference images (so the characters' sheets go with every clip
 * too), then image to video. Null when no workflow of the model can end a
 * clip on a given frame. Made to a voiceover (`drivingAudio`), only one whose
 * audio also moves the speaker's lips (Wan 2.7's image to video).
 */
export function keyframeWorkflow(
  chosen: ModelRegistryEntry | null | undefined,
  models: ModelRegistryEntry[],
  options: { drivingAudio?: boolean } = {},
): ModelRegistryEntry | null {
  if (!chosen || !longVideoEligible(chosen)) return null;
  const candidates = [chosen, ...continuationCandidates(chosen, models, { withReferences: true })]
    .filter((model, index, list) => list.findIndex((entry) => entry.id === model.id) === index)
    .filter(movesBetweenFrames)
    .filter((model) => !options.drivingAudio || lipSyncCapable(model));
  const score = (model: ModelRegistryEntry) =>
    (model.id === chosen.id ? 100 : 0) +
    (hasReferenceImages(model) ? 5 : 0) +
    (model.operation === "image-to-video" ? 2 : 0);
  return (
    [...candidates].sort((a, b) => score(b) - score(a) || a.sort_order - b.sort_order)[0] ?? null
  );
}

/**
 * How many keyframes a video of `clips` clips has: the opening frame and one
 * at the end of every clip, except a last clip that moves into the brand's
 * end card, which ends on that instead.
 */
export function keyframeCount(clips: number, finale: FinaleMode | null): number {
  if (clips < 1) return 0;
  return clips + 1 - (finale && finaleReveals(finale) ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* The image model that paints them                                    */
/* ------------------------------------------------------------------ */

/** Models tried first for keyframes, by path: the ones that keep a face best from references. */
const PREFERRED_PAINTERS = [/^xai\/grok-imagine-image/, /^alibaba\/qwen-image-3\/edit/];

/** The image input a painter is sent references in (the previous keyframe and the sheets). */
export function painterSlot(model: ModelRegistryEntry) {
  return (
    (model.capabilities?.inputs ?? []).find(
      (slot) =>
        slot.type === "image" &&
        (slot.role === "reference" || slot.role === "source") &&
        (slot.max ?? 1) >= 2,
    ) ?? null
  );
}

/**
 * Image models that can paint keyframes: they take at least two reference
 * images (the keyframe before and a character), set the frame's shape, and
 * need nothing else chosen (a preset). Not those that make ads (layouts and
 * copy rather than a frame of film). Best first.
 */
export function keyframePainters(models: ModelRegistryEntry[]): ModelRegistryEntry[] {
  const usable = models.filter(
    (model) =>
      model.is_active &&
      model.output_type === "image" &&
      !!painterSlot(model) &&
      !!aspectField(model) &&
      !(model.capability_tags ?? []).includes("brand_creative") &&
      !(model.parameter_schema?.fields ?? []).some(
        (field) => field.type === "preset" && field.required,
      ),
  );
  const rank = (model: ModelRegistryEntry) => {
    const preferred = PREFERRED_PAINTERS.findIndex((path) => path.test(model.model_path));
    return preferred >= 0 ? preferred : PREFERRED_PAINTERS.length;
  };
  return usable.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (painterSlot(b)!.max ?? 1) - (painterSlot(a)!.max ?? 1) ||
      a.sort_order - b.sort_order,
  );
}

function aspectField(model: ModelRegistryEntry) {
  return model.parameter_schema?.fields?.find((field) => field.key === "aspect_ratio") ?? null;
}

function optionValues(model: ModelRegistryEntry, key: string): (string | number)[] {
  const field = model.parameter_schema?.fields?.find((entry) => entry.key === key);
  return (field?.options ?? []).map((option) => normalizeOption(option).value);
}

const RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

function ratioOf(value: string): number | null {
  const match = RATIO.exec(value.trim());
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** The aspect ratio a painter offers that is closest to `ratio` (width / height). */
function closestAspect(model: ModelRegistryEntry, ratio: number): string | null {
  let best: { value: string; gap: number } | null = null;
  for (const value of optionValues(model, "aspect_ratio")) {
    if (typeof value !== "string") continue;
    const candidate = ratioOf(value);
    if (candidate === null) continue;
    const gap = Math.abs(Math.log(candidate / ratio));
    if (!best || gap < best.gap) best = { value, gap };
  }
  return best?.value ?? null;
}

/**
 * The shape the keyframes are painted at: the video's own aspect ratio, as
 * set (or as the person's own opening frame has it), else landscape 16:9.
 * The clips take their shape from their keyframes, so they all agree.
 */
export function videoAspect(
  values: Record<string, unknown>,
  openingFrame?: { width: number | null; height: number | null } | null,
): { ratio: number; label: string } {
  const set = typeof values["aspect_ratio"] === "string" ? values["aspect_ratio"] : "";
  const fromSetting = set ? ratioOf(set) : null;
  if (fromSetting) return { ratio: fromSetting, label: set };
  const width = Number(openingFrame?.width);
  const height = Number(openingFrame?.height);
  if (width > 0 && height > 0) return { ratio: width / height, label: `${width}×${height}` };
  return { ratio: 16 / 9, label: "16:9" };
}

/**
 * Whether a painter can paint frames of this shape: exactly, or near enough
 * that cutting its painting to the frame (as every keyframe is) loses little,
 * within 8% (a 3:4 painting for a 4:5 video).
 */
export function painterFits(model: ModelRegistryEntry, ratio: number): boolean {
  const value = closestAspect(model, ratio);
  const closest = value ? ratioOf(value) : null;
  return closest !== null && Math.abs(closest / ratio - 1) <= 0.08;
}

/**
 * A painter's settings for keyframes: its defaults, the video's shape, its
 * sharpest standard resolution and better quality, and no prompt rewriting
 * (which moves things about and loses the likeness).
 */
export function painterValues(model: ModelRegistryEntry, ratio: number): Record<string, unknown> {
  const values = defaultsForModel(model);
  const aspect = closestAspect(model, ratio);
  if (aspect) values["aspect_ratio"] = aspect;
  const resolutions = optionValues(model, "resolution");
  const resolution = ["2k", "2K", "1080p", "1k"].find((value) => resolutions.includes(value));
  if (resolution) values["resolution"] = resolution;
  const qualities = optionValues(model, "quality");
  const quality = ["high", "medium"].find((value) => qualities.includes(value));
  if (quality) values["quality"] = quality;
  for (const key of ["prompt_extend", "enable_thinking", "enhance_prompt"])
    if (model.parameter_schema?.fields?.some((field) => field.key === key)) values[key] = false;
  if (optionValues(model, "batch_size").includes(1)) values["batch_size"] = 1;
  return values;
}

/* ------------------------------------------------------------------ */
/* What each keyframe is sent and told                                 */
/* ------------------------------------------------------------------ */

export interface KeyframeInputs {
  /** In the order sent: the keyframe before (if any), the characters' sheets, the other references. */
  inputs: { assetId: string; role: string }[];
  /** Where each character's images are, as words for the prompt ("reference images 2 and 3"). */
  characterImages: Map<string, string>;
  /** How many of the person's own references went along. */
  references: number;
}

/** "reference image 2", "reference images 2 and 3", "reference images 2, 3 and 4". */
export function imageWords(numbers: number[]): string {
  if (!numbers.length) return "";
  if (numbers.length === 1) return `reference image ${numbers[0]}`;
  return `reference images ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/**
 * The images a keyframe is painted from, within what the painter takes: the
 * keyframe before (for the place, light and camera), every character's best
 * views before anyone's second, then the person's own image references
 * (product, setting), then the characters' other views.
 */
export function keyframeInputs(input: {
  painter: ModelRegistryEntry;
  previous: string | null;
  characters: RunCharacter[];
  references: string[];
}): KeyframeInputs {
  const slot = painterSlot(input.painter);
  const room = slot?.max ?? 0;
  const role = slot?.role ?? "reference";
  const chosen: { assetId: string; characterId: string | null }[] = [];
  const taken = new Set<string>();
  const add = (assetId: string, characterId: string | null) => {
    if (chosen.length >= room || taken.has(assetId)) return;
    taken.add(assetId);
    chosen.push({ assetId, characterId });
  };
  if (input.previous) add(input.previous, null);
  const sheets = interleaveSheets(input.characters);
  // Everyone's best view, then the person's references, then the other views.
  const firsts = new Set<string>();
  for (const character of input.characters) {
    const first = sheets.find((entry) => entry.characterId === character.id);
    if (first) firsts.add(first.assetId);
  }
  for (const entry of sheets) if (firsts.has(entry.assetId)) add(entry.assetId, entry.characterId);
  let references = 0;
  for (const assetId of input.references) {
    const before = chosen.length;
    add(assetId, null);
    if (chosen.length > before) references += 1;
  }
  for (const entry of sheets) add(entry.assetId, entry.characterId);

  const characterImages = new Map<string, string>();
  for (const character of input.characters) {
    const numbers = chosen.flatMap((entry, index) =>
      entry.characterId === character.id ? [index + 1] : [],
    );
    if (numbers.length) characterImages.set(character.id, imageWords(numbers));
  }
  return {
    inputs: chosen.map((entry) => ({ assetId: entry.assetId, role })),
    characterImages,
    references,
  };
}

const STILL_RULES =
  "One photographic still frame from a film, natural detail and lighting, no text, captions, logos, watermarks, borders, frames or split panels.";

/** The most a keyframe's prompt can be stored with. */
export const KEYFRAME_PROMPT_MAX = 12000;

/** Text cut to `max` characters at a word, marked as cut. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, Math.max(0, max - 1));
  const space = slice.lastIndexOf(" ");
  return `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`;
}

/**
 * What a keyframe is painted from: the moment it shows (the opening moment of
 * the first beat, or the end of a clip's beat), what to change from the last
 * try, who is in it and where their reference images are, the frame, and what
 * must stay the same. Fitted to what the painter reads: the story goes first,
 * then the continuity notes, then the characters' descriptions get shorter.
 */
export function keyframePrompt(input: {
  /** 0 for the opening frame, i for the frame clip i ends on. */
  position: number;
  /** It ends the video's last clip: the video's final moment. */
  final?: boolean;
  /** The most the painter reads (null: no limit). */
  budget?: number | null;
  story: string;
  /** What happens in each clip, by clip. */
  beats: string[];
  /** How long each clip runs. */
  durations: number[];
  continuity: string;
  characters: RunCharacter[];
  characterImages: Map<string, string>;
  /** Whether reference image 1 is the keyframe before. */
  previous: boolean;
  /** How many of the person's own references are among the images. */
  references: number;
  /** The video's shape, e.g. "16:9". */
  aspect: string;
  /** What the person asked to change since the last try. */
  note?: string | null;
}): string {
  const { position, beats, durations } = input;
  const story = input.story.trim();
  const continuity = input.continuity.trim();
  const beat = (position === 0 ? beats[0] : beats[position - 1])?.trim() ?? "";
  const final = input.final ?? false;

  let moment: string;
  if (position === 0)
    moment = beat
      ? `The opening frame of a video, one continuous shot. Show the moment just before this begins: ${beat}`
      : "The opening frame of a video, one continuous shot.";
  else {
    const seconds = durations[position - 1];
    const when = seconds ? `${Math.round(seconds)} seconds later` : "a few seconds later";
    moment = input.previous
      ? `Reference image 1 is a frame from earlier in the same continuous shot. Show the frame ${when}${final ? ", the video's final moment" : ""}${beat ? `, as this ends: ${beat}` : ", the story carrying on"}. Keep the same place, light, colour and lens as reference image 1; the camera has moved only as the action describes.`
      : `A frame from a continuous shot${final ? ", the video's final moment" : ""}${beat ? `, as this ends: ${beat}` : ""}.`;
  }
  // The story, where the beat doesn't already say what the opening frame shows.
  const withStory = !!story && (position > 0 || !beat);

  const compose = (options: {
    storyChars: number | null;
    keepChars: number | null;
    descriptionChars: number;
  }) => {
    const parts = [moment];
    if (input.note?.trim()) parts.push(`Change from the last try: ${input.note.trim()}`);
    const people = charactersLine(input.characters, {
      references: input.characterImages.size > 0,
      images: input.characterImages,
      descriptionChars: options.descriptionChars,
    });
    if (people) parts.push(people);
    if (input.references > 0)
      parts.push(
        "Show any product, logo or place from the other reference images exactly as it appears there.",
      );
    parts.push(`Frame: ${input.aspect}. ${STILL_RULES}`);
    if (continuity && options.keepChars !== 0)
      parts.push(
        `Keep consistent: ${options.keepChars === null ? continuity : cut(continuity, options.keepChars)}`,
      );
    if (withStory && options.storyChars !== 0)
      parts.push(`Story: ${options.storyChars === null ? story : cut(story, options.storyChars)}`);
    return parts.join("\n\n");
  };

  const budget = Math.min(input.budget ?? KEYFRAME_PROMPT_MAX, KEYFRAME_PROMPT_MAX);
  const full = compose({ storyChars: null, keepChars: null, descriptionChars: 360 });
  if (full.length <= budget) return full;
  // Least important first: the story, then the continuity notes, then shorter descriptions.
  const over = (text: string) => text.length - budget;
  const room = (text: string, length: number) => Math.max(0, length - over(text));
  let prompt = compose({
    storyChars: Math.max(200, room(full, withStory ? story.length : 0)),
    keepChars: null,
    descriptionChars: 360,
  });
  if (prompt.length <= budget) return prompt;
  prompt = compose({
    storyChars: 200,
    keepChars: Math.max(200, room(prompt, continuity.length)),
    descriptionChars: 360,
  });
  if (prompt.length <= budget) return prompt;
  for (const descriptionChars of [220, 120]) {
    prompt = compose({ storyChars: 200, keepChars: 200, descriptionChars });
    if (prompt.length <= budget) return prompt;
  }
  prompt = compose({ storyChars: 0, keepChars: 200, descriptionChars: 120 });
  if (prompt.length <= budget) return prompt;
  prompt = compose({ storyChars: 0, keepChars: 0, descriptionChars: 120 });
  return prompt.length <= budget ? prompt : cut(prompt, budget);
}

/** Frames up to this size are kept as lossless PNG; larger ones as best-quality JPEG. */
export const KEYFRAME_PNG_MAX_PIXELS = 2_600_000;

/**
 * The exact size every keyframe is cut to (so the clips, which take their
 * shape from them, all agree): the person's own opening frame's size when
 * they gave one, else the video's shape with its short side at 1080 pixels.
 * Even sides, as encoders need.
 */
export function keyframeSize(
  ratio: number,
  openingFrame?: { width: number | null; height: number | null } | null,
): { width: number; height: number; format: "png" | "jpg" } {
  const even = (value: number) => Math.max(64, Math.round(value / 2) * 2);
  let width: number;
  let height: number;
  const ownWidth = Number(openingFrame?.width);
  const ownHeight = Number(openingFrame?.height);
  if (ownWidth > 0 && ownHeight > 0) {
    // Large frames are brought down to 4K's size; the shape is kept.
    const scale = Math.min(1, Math.sqrt(8_294_400 / (ownWidth * ownHeight)));
    width = even(ownWidth * scale);
    height = even(ownHeight * scale);
  } else if (ratio >= 1) {
    height = 1080;
    width = even(1080 * ratio);
  } else {
    width = 1080;
    height = even(1080 / ratio);
  }
  return { width, height, format: width * height > KEYFRAME_PNG_MAX_PIXELS ? "jpg" : "png" };
}

/** What a keyframed run keeps about its keyframes (long_videos.keyframe_settings). */
export interface KeyframeSettings {
  /** The painter's settings (the prompt is each keyframe's own). */
  values: Record<string, unknown>;
  /** The video's shape, as words for the prompt ("16:9"). */
  aspect: string;
  /** The exact size every keyframe is cut to. */
  width: number;
  height: number;
  format: "png" | "jpg";
  /** Higgsfield's estimate for one keyframe when the run was started, if it gave one. */
  unitUsd: number | null;
}

/** A run's keyframe settings as stored, or null when they can't be read. */
export function storedKeyframeSettings(value: unknown): KeyframeSettings | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const width = Number(record["width"]);
  const height = Number(record["height"]);
  if (!(width > 0 && height > 0) || !record["values"] || typeof record["values"] !== "object")
    return null;
  return {
    values: record["values"] as Record<string, unknown>,
    aspect: typeof record["aspect"] === "string" ? record["aspect"] : `${width}×${height}`,
    width,
    height,
    format: record["format"] === "jpg" ? "jpg" : "png",
    unitUsd: typeof record["unitUsd"] === "number" ? record["unitUsd"] : null,
  };
}

/** The beat a keyframe shows the end of (the opening keyframe: the start of the first). */
export function keyframeBeat(position: number, beats: string[]): string {
  return (position === 0 ? beats[0] : beats[position - 1]) ?? "";
}

/* ------------------------------------------------------------------ */
/* The painter, and pricing before anything is made                    */
/* ------------------------------------------------------------------ */

/**
 * The image model that paints a run's keyframes (the one asked for when it
 * can, else the best one on) and anything that stops it, said plainly.
 */
export function choosePainter(input: {
  models: ModelRegistryEntry[];
  painterModelId?: string | null;
  aspect: { ratio: number; label: string };
  /** Whether the opening keyframe has an image to be painted from (see openingHasImages). */
  openingImages: boolean;
}): { painters: ModelRegistryEntry[]; painter: ModelRegistryEntry | null; issues: string[] } {
  const painters = keyframePainters(input.models);
  const painter =
    painters.find((entry) => entry.id === input.painterModelId) ?? painters[0] ?? null;
  const issues: string[] = [];
  if (!painter)
    issues.push(
      "No image model that takes reference images is switched on, so the keyframes can't be painted. Turn keyframes off, or switch one on under Models.",
    );
  else if (!painterFits(painter, input.aspect.ratio))
    issues.push(
      `${painter.display_name} can't paint ${input.aspect.label} frames, so the keyframes would be cropped to it. Choose another keyframe model or shape.`,
    );
  else if (painterSlot(painter)?.required && !input.openingImages)
    issues.push(
      `${painter.display_name} paints only from images, and the opening keyframe would have none: add a character or a reference image, or choose another keyframe model.`,
    );
  return { painters, painter, issues };
}

/**
 * Whether the opening keyframe has an image to be painted from: a character's,
 * one of the person's references, or the person's own opening frame (which
 * then is the opening keyframe). Every later keyframe has the one before.
 */
export function openingHasImages(input: {
  /** The role the first clip's model starts from. */
  startRole: string | null;
  references: RunReference[];
  characters: RunCharacter[];
}): boolean {
  return (
    input.characters.some((character) => character.images.length > 0) ||
    input.references.some(
      (item) =>
        item.assetType === "image" &&
        (item.role === "reference" ||
          item.role === "unused" ||
          (!!input.startRole && item.role === input.startRole)),
    )
  );
}

/** A request as Higgsfield will be sent it, to be priced. */
export interface QuoteRequest {
  model: ModelRegistryEntry;
  values: Record<string, unknown>;
  inputs: { assetId: string; role: string }[];
}

/**
 * The image a run's requests are priced with where a frame will go (a
 * keyframe, or the clip before's last frame): the person's own opening frame
 * in a keyframed run, else a character's best image, else one of the
 * references. Null when there is no image at all.
 */
export function standInImage(input: {
  keyframed: boolean;
  /** The role the first clip's model starts from. */
  startRole: string | null;
  references: RunReference[];
  characters: RunCharacter[];
}): string | null {
  const opening = input.keyframed
    ? input.references.find(
        (item) => item.assetType === "image" && !!input.startRole && item.role === input.startRole,
      )
    : undefined;
  return (
    opening?.assetId ??
    input.characters[0]?.images[0]?.assetId ??
    input.references.find((item) => item.assetType === "image")?.assetId ??
    null
  );
}

/**
 * A clip as it will be sent, with the stand-in image where a frame will go
 * (its keyframes, or the clip before's last frame), so it can be priced and
 * tried before it can be made. Null for a later clip that is given the clip
 * before itself (a video extend), which no image can stand in for.
 */
export function clipQuote(clip: PlannedClip, standIn: string | null): QuoteRequest | null {
  const start = clipStart(clip.model);
  if (clip.position > 0 && start?.kind === "video") return null;
  const frameRole =
    standIn && (clip.position > 0 || clip.startKeyframe !== null) ? (start?.role ?? null) : null;
  const endRole = standIn && clip.endKeyframe !== null ? (clipEnd(clip.model)?.role ?? null) : null;
  return {
    model: clip.model,
    values: clip.values,
    inputs: [
      ...(standIn && frameRole ? [{ assetId: standIn, role: frameRole }] : []),
      ...clip.inputs,
      ...(standIn && endRole ? [{ assetId: standIn, role: endRole }] : []),
    ],
  };
}

/** What a keyframe is told when it is only being priced. */
const QUOTE_PROMPT = "A still frame from a film, the next moment of the shot.";

/**
 * One keyframe as it will be painted (the stand-in as the keyframe before,
 * then the characters' sheets and the person's own image references), to
 * price it and try it before anything is made.
 */
export function keyframeQuote(input: {
  painter: ModelRegistryEntry;
  /** The painter's settings (painterValues, or as the run keeps them). */
  values: Record<string, unknown>;
  /** Stands in for the keyframe before (none: priced as painted from text and the sheets). */
  standIn: string | null;
  characters: RunCharacter[];
  references: RunReference[];
}): QuoteRequest {
  return {
    model: input.painter,
    values: { ...input.values, prompt: QUOTE_PROMPT },
    inputs: keyframeInputs({
      painter: input.painter,
      previous: input.standIn,
      characters: input.characters,
      references: input.references
        .filter(
          (item) =>
            item.assetType === "image" && (item.role === "reference" || item.role === "unused"),
        )
        .map((item) => item.assetId),
    }).inputs,
  };
}

/* ------------------------------------------------------------------ */
/* A keyframed run's storyboard, planned                               */
/* ------------------------------------------------------------------ */

/** The person's own opening frame among a run's references (the workflow's start-frame input), if any. */
export function openingFrameOf(
  workflow: ModelRegistryEntry | null | undefined,
  references: RunReference[],
): RunReference | null {
  const role = startFrameSlot(workflow)?.role ?? null;
  return (
    (role && references.find((item) => item.assetType === "image" && item.role === role)) || null
  );
}

export interface KeyframesPlan {
  painters: ModelRegistryEntry[];
  painter: ModelRegistryEntry | null;
  /** The video's shape, as the keyframes are painted. */
  aspect: { ratio: number; label: string };
  /** The exact size every keyframe is cut to. */
  size: { width: number; height: number; format: "png" | "jpg" };
  /** How many keyframes the storyboard has. */
  count: number;
  /** How many of them are painted (and billed): the person's own frames aren't. */
  painted: number;
  /** The person's own opening and closing frames, the first and last keyframes. */
  opening: RunReference | null;
  closing: RunReference | null;
  /** Anything that would stop it, said plainly. */
  issues: string[];
  /** The image a request is priced with where a frame will go (null: none at all). */
  standIn: string | null;
  /** One keyframe as it will be painted, to price it. */
  quote: QuoteRequest | null;
}

/**
 * A keyframed run's storyboard as Create, the Supercomputer and the server
 * all work it out: who paints it at what exact size, which keyframes are the
 * person's own frames (never painted), what one costs to paint, and anything
 * that would stop it. The finisher is never painted from or stood in with.
 */
export function planKeyframes(input: {
  models: ModelRegistryEntry[];
  painterModelId?: string | null;
  /** The workflow that makes every clip. */
  workflow: ModelRegistryEntry;
  /** The run's settings (its aspect ratio among them). */
  values: Record<string, unknown>;
  /** How many clips. */
  clips: number;
  finale: RunFinale | null;
  references: RunReference[];
  characters: RunCharacter[];
  /** The person's opening frame's size: undefined while it is still being read. */
  openingSize?: { width: number | null; height: number | null } | null | undefined;
}): KeyframesPlan {
  const finale = input.finale;
  const finisher = new Set(
    [finale?.assetId, finale?.frameAssetId, finale?.sourceAssetId].filter(
      (id): id is string => !!id,
    ),
  );
  const references = input.references.filter((item) => !finisher.has(item.assetId));
  const issues: string[] = [];

  // The person's own frames: the opening keyframe, and the closing one where
  // the last clip ends on a keyframe (not when it moves into the end card).
  const startRole = startFrameSlot(input.workflow)?.role ?? null;
  const endWay = clipEnd(input.workflow);
  const opening = openingFrameOf(input.workflow, references);
  const endImage =
    (endWay?.kind === "frame" &&
      references.find((item) => item.assetType === "image" && item.role === endWay.role)) ||
    null;
  const count = keyframeCount(input.clips, finale?.mode ?? null);
  const lastEndsOnKeyframe =
    input.clips > 0 &&
    clipKeyframes(input.clips - 1, input.clips, finale?.mode ?? null).end === count - 1;
  const closing = endImage && lastEndsOnKeyframe ? endImage : null;
  if (endImage && !lastEndsOnKeyframe)
    issues.push(
      "Your end frame wouldn't be used: the video ends by moving into the brand's end card. Take the end frame out, or hold the end card after the last clip instead.",
    );
  const painted = Math.max(0, count - (opening ? 1 : 0) - (closing ? 1 : 0));

  // One shape for all of it: the setting, which the opening frame must match.
  const known =
    input.openingSize && Number(input.openingSize.width) > 0 && Number(input.openingSize.height) > 0
      ? input.openingSize
      : null;
  if (opening && input.openingSize === undefined) issues.push("Reading your opening frame's size…");
  const aspect = videoAspect(input.values, opening ? known : null);
  if (opening && known) {
    const frame = Number(known.width) / Number(known.height);
    const set =
      typeof input.values["aspect_ratio"] === "string" ? input.values["aspect_ratio"] : "";
    const setRatio = set ? ratioOf(set) : null;
    if (setRatio && Math.abs(setRatio / frame - 1) > 0.03)
      issues.push(
        `Your opening frame is ${known.width}×${known.height}, but the video is set to ${set}: set the aspect ratio to match it, or use another opening frame.`,
      );
  }
  const size = keyframeSize(aspect.ratio, opening ? known : null);

  const choice = choosePainter({
    models: input.models,
    painterModelId: input.painterModelId ?? null,
    // Checked on the shape actually painted.
    aspect: { ratio: size.width / size.height, label: aspect.label },
    openingImages: openingHasImages({ startRole, references, characters: input.characters }),
  });
  issues.push(...choice.issues);
  const standIn = standInImage({
    keyframed: true,
    startRole,
    references,
    characters: input.characters,
  });
  return {
    painters: choice.painters,
    painter: choice.painter,
    aspect,
    size,
    count,
    painted,
    opening,
    closing,
    issues,
    standIn,
    quote: choice.painter
      ? keyframeQuote({
          painter: choice.painter,
          values: painterValues(choice.painter, size.width / size.height),
          standIn,
          characters: input.characters,
          references,
        })
      : null,
  };
}
