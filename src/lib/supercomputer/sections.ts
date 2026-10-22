/**
 * Parallel work by sections (docs/supercomputer-agent.md, "Sections"). A
 * reel (an edit, a long video or a storyboard) is split into sections, runs
 * of whole shots, and each is given to a worker: a conversation the agent
 * runs for that section alone, with a brief that carries its neighbours'
 * first and last frames, so it starts and ends where they meet it. What a
 * worker saves goes into one integration edit as it saves, and every join
 * between two sections is checked on both sides.
 *
 * Reel 1's third cut was built like this by six workers: one owner per run
 * of shots, one integration branch, every join between owners checked on
 * both sides, and a commit as soon as a shot drew correctly. Four of the six
 * stopped at their turn limit, and their commits are what survived. So a
 * worker's step limit is set from its work, it is warned as it nears it, and
 * what it made is saved before it reaches it.
 *
 * Pure: shared by the server (./sections.server), the browser and tests.
 */
import type { JoinLeftReason } from "../edit/join-report";
import { clipSchema, joinFields, LIMITS, type Timeline, type TimelineClip } from "../edit/timeline";
import type { TextVerdict } from "../media/text-check";

type Json = Record<string, unknown>;

export const REEL_KINDS = ["edit", "long_video", "storyboard"] as const;
export type ReelKind = (typeof REEL_KINDS)[number];
export const REEL_KIND_LABELS: Record<ReelKind, string> = {
  edit: "edit",
  long_video: "long video",
  storyboard: "storyboard",
};

/**
 * Where one of a shot's frames is read from: a picture already in the
 * library (a still, or a long video clip's start or handoff frame), or a
 * moment of a video the media service takes it from. For a shot's last frame
 * `seconds` is where the reel stops showing it (its out point), and the frame
 * is the one just before; for its first, where it starts showing it.
 */
export type FrameSource =
  { kind: "still"; assetId: string } | { kind: "video"; assetId: string; seconds: number };

/** One shot of a reel, as sections are planned from it. */
export interface ReelShot {
  /** Its id in the reel: an edit's clip id, a long video's clip id, a storyboard's shot id. */
  ref: string;
  /** Its place in the reel, from 0. */
  index: number;
  label: string;
  /** How long it runs in the reel. */
  seconds: number;
  /** The library file it shows now (null: not made yet). */
  assetId: string | null;
  /** What it is, or is to be made as. */
  kind: "video" | "image";
  /** What happens in it: its beat, prompt or description. */
  beat: string | null;
  /** Its scene or block, where the reel has them: sections break between them by choice. */
  group: string | null;
  /** It carries straight on from the shot before it: one shot across the cut. */
  continuous: boolean;
  firstFrame: FrameSource | null;
  lastFrame: FrameSource | null;
}

export const SECTION_LIMITS = {
  /** The most sections a reel is split into (Reel 1's third cut had six workers). */
  maxSections: 10,
  /** The most model calls one turn makes (the agent's own limit, MAX_STEPS in ./agent-loop.server). */
  turnSteps: 32,
  /** The fewest steps a section is given: its brief, a look, a save and its finish, with room. */
  minBudget: 6,
  /** The work a section is planned around, so it fits one turn with room to redo a shot. */
  targetSteps: 20,
  /** The fewest and most steps a carry-on adds. */
  minExtension: 4,
  maxExtension: 24,
} as const;

/** Steps (model calls) a shot is estimated to take its worker. */
export const SHOT_STEPS = {
  /** A shot already made: looked at, then saved or kept as it is. */
  made: 2,
  /** An image to make: priced, generated, waited for, looked at and saved. */
  image: 5,
  /** A video to make: the same with a second wait (videos take minutes). */
  video: 6,
  /** Carrying straight on from another section's last frame: matched to it first. */
  handoff: 1,
  /** Every section: reading its brief, and finishing. */
  section: 2,
} as const;

/** The margin on an estimate: room to make a shot again that isn't right. */
const BUDGET_MARGIN = 1.25;

/* ------------------------------------------------------------------ */
/* Turn limits                                                         */
/* ------------------------------------------------------------------ */

/** The steps a shot is estimated to take; one that opens a section after a continuous join takes one more. */
export function shotSteps(shot: ReelShot, opensSection = false): number {
  const base = shot.assetId
    ? SHOT_STEPS.made
    : shot.kind === "image"
      ? SHOT_STEPS.image
      : SHOT_STEPS.video;
  return base + (opensSection && shot.continuous && shot.index > 0 ? SHOT_STEPS.handoff : 0);
}

/** A section's estimated work: its shots (first to last, inclusive) and its own two steps. */
export function sectionSteps(shots: ReelShot[], first: number, last: number): number {
  let steps: number = SHOT_STEPS.section;
  for (let index = first; index <= last; index += 1) {
    const shot = shots[index];
    if (shot) steps += shotSteps(shot, index === first);
  }
  return steps;
}

/** A section's step limit from its estimated work, with room to redo a shot, within one turn. */
export function stepBudget(steps: number): number {
  return Math.max(
    SECTION_LIMITS.minBudget,
    Math.min(SECTION_LIMITS.turnSteps, Math.ceil(steps * BUDGET_MARGIN)),
  );
}

/** The step from which a worker is warned its limit is near (and what it made is saved): a fifth before, at least two. */
export function warnFrom(budget: number): number {
  return Math.max(1, budget - Math.max(2, Math.ceil(budget * 0.2)));
}

/** The most steps a worker's next turn takes: what is left of its section's limit, within a turn's own. */
export function turnLimit(budget: number, usedBefore: number): number {
  return Math.max(1, Math.min(SECTION_LIMITS.turnSteps, budget - Math.max(0, usedBefore)));
}

export type BudgetState = "ok" | "near" | "reached";

/** How a section stands against its limit, for people. */
export function budgetState(used: number, budget: number): BudgetState {
  if (used >= budget) return "reached";
  return used >= warnFrom(budget) ? "near" : "ok";
}

/**
 * The steps a carry-on adds to a section whose limit is spent or nearly so:
 * the estimate for the shots it hasn't saved, with the same margin.
 */
export function extensionSteps(shots: ReelShot[], unsaved: number[]): number {
  const work =
    SHOT_STEPS.section +
    unsaved.reduce((sum, index) => sum + (shots[index] ? shotSteps(shots[index]!) : 0), 0);
  return Math.max(
    SECTION_LIMITS.minExtension,
    Math.min(SECTION_LIMITS.maxExtension, Math.ceil(work * BUDGET_MARGIN)),
  );
}

/* ------------------------------------------------------------------ */
/* Sectioning                                                          */
/* ------------------------------------------------------------------ */

export interface PlannedSection {
  /** Its place, from 0. */
  position: number;
  /** Its first and last shots (indexes into the reel, inclusive). */
  first: number;
  last: number;
  title: string;
  seconds: number;
  /** Its estimated work, in steps, and the limit set from it. */
  steps: number;
  budget: number;
}

export interface SectionPlanOptions {
  /** How many sections (left out: as many as the work needs). */
  sections?: number | null;
  /** The shot numbers (from 1) sections start at, when the split is chosen by hand. */
  starts?: number[] | null;
}

/** How many sections a reel's work wants: about a target's worth of steps each. */
export function sectionCount(shots: ReelShot[], wanted?: number | null): number {
  if (!shots.length) return 0;
  const most = Math.min(SECTION_LIMITS.maxSections, shots.length);
  if (wanted && Number.isFinite(wanted)) return Math.max(1, Math.min(most, Math.round(wanted)));
  const work = shots.reduce((sum, shot) => sum + shotSteps(shot), 0);
  const each = SECTION_LIMITS.targetSteps - SHOT_STEPS.section;
  return Math.max(1, Math.min(most, Math.ceil(work / each)));
}

/**
 * What it costs to start a section at a shot: nothing between two scenes, a
 * little at a cut inside one, and most where one shot carries straight on
 * across the cut (the join two owners find hardest to meet at).
 */
export function breakCost(shots: ReelShot[], at: number): number {
  const shot = shots[at];
  const before = shots[at - 1];
  if (!shot || !before) return 0;
  if (shot.continuous) return 1;
  if (shot.group !== null && before.group !== null) return shot.group === before.group ? 0.35 : 0;
  return 0.15;
}

/** How strongly a good place to break outweighs even work. */
const BREAK_WEIGHT = 0.6;

/** The shots sections start at, chosen for even work and good places to break (indexes, the first 0). */
function splitByWork(shots: ReelShot[], count: number): number[] {
  const n = shots.length;
  if (count <= 1 || n <= 1) return [0];
  const work = shots.map((shot) => shotSteps(shot));
  const prefix = [0];
  for (const steps of work) prefix.push(prefix.at(-1)! + steps);
  const target = prefix[n]! / count + SHOT_STEPS.section;
  const cost = (first: number, last: number) => {
    const steps =
      prefix[last + 1]! -
      prefix[first]! +
      SHOT_STEPS.section +
      (first > 0 && shots[first]!.continuous ? SHOT_STEPS.handoff : 0);
    const imbalance = ((steps - target) / target) ** 2;
    // A section whose work won't fit one turn is much worse than an uneven one.
    const over = steps * BUDGET_MARGIN - SECTION_LIMITS.turnSteps;
    return imbalance + (over > 0 ? (over / SECTION_LIMITS.turnSteps) * 4 : 0);
  };
  // best[k][j]: the least cost of shots 0..j in k + 1 sections; from[k][j]: where its last one starts.
  const best: number[][] = Array.from({ length: count }, () => new Array<number>(n).fill(Infinity));
  const from: number[][] = Array.from({ length: count }, () => new Array<number>(n).fill(0));
  for (let last = 0; last < n; last += 1) best[0]![last] = cost(0, last);
  for (let k = 1; k < count; k += 1) {
    for (let last = k; last < n; last += 1) {
      for (let first = k; first <= last; first += 1) {
        const value =
          best[k - 1]![first - 1]! + cost(first, last) + BREAK_WEIGHT * breakCost(shots, first);
        if (value < best[k]![last]!) {
          best[k]![last] = value;
          from[k]![last] = first;
        }
      }
    }
  }
  const starts: number[] = [];
  let last = n - 1;
  for (let k = count - 1; k >= 1; k -= 1) {
    const first = from[k]![last]!;
    starts.unshift(first);
    last = first - 1;
  }
  return [0, ...starts];
}

/** Shot numbers chosen by hand as section starts (from 1), as indexes: the first is always shot 1. */
export function startsFromNumbers(shots: ReelShot[], numbers: number[]): number[] {
  const indexes = numbers
    .filter((number) => Number.isInteger(number) && number >= 2 && number <= shots.length)
    .map((number) => number - 1);
  return [0, ...[...new Set(indexes)].sort((a, b) => a - b)];
}

function range(first: number, last: number): string {
  return first === last ? `shot ${first + 1}` : `shots ${first + 1}–${last + 1}`;
}

/** A section's title: its scenes, where the reel has them, and its shots. */
export function sectionTitle(shots: ReelShot[], first: number, last: number): string {
  const groups: string[] = [];
  for (let index = first; index <= last; index += 1) {
    const group = shots[index]?.group;
    if (group && groups.at(-1) !== group) groups.push(group);
  }
  const shotsText = range(first, last);
  if (!groups.length) return shotsText.charAt(0).toUpperCase() + shotsText.slice(1);
  if (groups.length === 1) return `${groups[0]} · ${shotsText}`;
  return `${groups[0]} to ${groups.at(-1)} · ${shotsText}`;
}

/**
 * A reel split into sections: by hand (`starts`), or into `sections` (or as
 * many as the work needs) of even work that break where breaking is easiest
 * (between scenes, then at cuts, and only last where one shot runs on).
 */
export function planSections(
  shots: ReelShot[],
  options: SectionPlanOptions = {},
): PlannedSection[] {
  if (!shots.length) return [];
  const starts = options.starts?.length
    ? startsFromNumbers(shots, options.starts).slice(0, SECTION_LIMITS.maxSections)
    : splitByWork(shots, sectionCount(shots, options.sections));
  return starts.map((first, position) => {
    const last = (starts[position + 1] ?? shots.length) - 1;
    const steps = sectionSteps(shots, first, last);
    let seconds = 0;
    for (let index = first; index <= last; index += 1) seconds += shots[index]!.seconds;
    return {
      position,
      first,
      last,
      title: sectionTitle(shots, first, last),
      seconds: Number(seconds.toFixed(3)),
      steps,
      budget: stepBudget(steps),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Joins                                                               */
/* ------------------------------------------------------------------ */

/**
 * How two sections meet: one shot carrying straight on across the cut, a cut
 * within a scene (the place, light and grade hold; the framing changes), or a
 * cut to another scene (only the cast and the lettering are held to).
 */
export const JOIN_KINDS = ["continuous", "cut", "scene"] as const;
export type JoinKind = (typeof JOIN_KINDS)[number];
export const JOIN_KIND_LABELS: Record<JoinKind, string> = {
  continuous: "one shot carrying straight on",
  cut: "a cut within the scene",
  scene: "a cut to another scene",
};

export interface PlannedJoin {
  /** The join after section `position`, into the next. */
  position: number;
  /** The last shot before it and the first after it (indexes into the reel). */
  before: number;
  after: number;
  kind: JoinKind;
}

/** How the shot at `after` meets the one before it. */
export function joinKind(shots: ReelShot[], after: number): JoinKind {
  const shot = shots[after];
  const before = shots[after - 1];
  if (!shot || !before) return "cut";
  if (shot.continuous) return "continuous";
  return shot.group !== null && before.group !== null && shot.group !== before.group
    ? "scene"
    : "cut";
}

/** The joins between a plan's sections, in order. */
export function joinsOf(
  sections: Pick<PlannedSection, "position" | "first" | "last">[],
  shots: ReelShot[],
): PlannedJoin[] {
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  return ordered.slice(0, -1).map((section, index) => {
    const next = ordered[index + 1]!;
    return {
      position: section.position,
      before: section.last,
      after: next.first,
      kind: joinKind(shots, next.first),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

/** A frame for a brief or a join check: in the library, being taken, or not to be had. */
export interface FrameRef {
  status: "ready" | "taking" | "unavailable";
  /** The library still it is, once ready. */
  assetId: string | null;
  bucket: string | null;
  path: string | null;
  /** Why it isn't to be had, in words. */
  note: string | null;
}

export const TAKING_FRAME: FrameRef = {
  status: "taking",
  assetId: null,
  bucket: null,
  path: null,
  note: null,
};

export function unavailableFrame(note: string): FrameRef {
  return { status: "unavailable", assetId: null, bucket: null, path: null, note };
}

/**
 * The frame a moment of a video is, counted at its frame rate: the first
 * shown from an in point; for an out point (where showing it stops), the
 * frame just before.
 */
export function frameIndex(seconds: number, fps: number, side: "first" | "last"): number {
  const rate = fps > 0 && Number.isFinite(fps) ? fps : 30;
  const at = Math.round(Math.max(0, seconds) * rate);
  return side === "first" ? at : Math.max(0, at - 1);
}

/** Where a clip of an edit shows its first or last frame. */
export function clipFrame(clip: TimelineClip, side: "first" | "last"): FrameSource {
  if (clip.kind === "image") return { kind: "still", assetId: clip.assetId };
  const seconds = side === "first" ? clip.trimStart : clip.trimStart + clip.duration * clip.speed;
  return { kind: "video", assetId: clip.assetId, seconds: Number(seconds.toFixed(6)) };
}

/* ------------------------------------------------------------------ */
/* What a worker saves                                                 */
/* ------------------------------------------------------------------ */

/** A shot a worker saved: the library file that now shows it. */
export interface SavedShot {
  /** The shot's index in the reel. */
  shot: number;
  assetId: string;
  kind: "video" | "image";
  /** How long it runs in the edit (null: its planned length). */
  seconds: number | null;
  /** Where in its file it starts showing. */
  trimStart: number;
  /** The file's own length, so a clip never runs past it (null: a still, or not measured). */
  fileSeconds: number | null;
  savedAt: string;
}

/** Something a worker made but didn't save to a shot: kept with its section, never lost. */
export interface LooseTake {
  assetId: string;
  kind: "video" | "image";
  generationId: string | null;
  madeAt: string;
}

/** A section's record of its worker's work (supercomputer_sections.work). */
export interface SectionWork {
  shots: SavedShot[];
  loose: LooseTake[];
  /** Its worker's line on what it made, and on anything left. */
  summary: string | null;
  left: string | null;
  /** Its worker said it was done (finish_section). */
  finished: boolean;
  /** A note for its next run: a join to put right. */
  note: string | null;
}

export const EMPTY_WORK: SectionWork = {
  shots: [],
  loose: [],
  summary: null,
  left: null,
  finished: false,
  note: null,
};

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const kindOf = (value: unknown): "video" | "image" | null =>
  value === "video" || value === "image" ? value : null;

/** A section's stored work, read tolerantly (anything malformed is left out). */
export function sectionWorkOf(value: unknown): SectionWork {
  const item = (value && typeof value === "object" ? value : {}) as Json;
  const shots = (Array.isArray(item["shots"]) ? (item["shots"] as Json[]) : []).flatMap((entry) => {
    const shot = number(entry?.["shot"]);
    const assetId = text(entry?.["assetId"], 64);
    const kind = kindOf(entry?.["kind"]);
    if (shot === null || shot < 0 || !assetId || !kind) return [];
    return [
      {
        shot: Math.round(shot),
        assetId,
        kind,
        seconds: number(entry["seconds"]),
        trimStart: Math.max(0, number(entry["trimStart"]) ?? 0),
        fileSeconds: number(entry["fileSeconds"]),
        savedAt: text(entry["savedAt"], 40) ?? new Date(0).toISOString(),
      } satisfies SavedShot,
    ];
  });
  const loose = (Array.isArray(item["loose"]) ? (item["loose"] as Json[]) : []).flatMap((entry) => {
    const assetId = text(entry?.["assetId"], 64);
    const kind = kindOf(entry?.["kind"]);
    if (!assetId || !kind) return [];
    return [
      {
        assetId,
        kind,
        generationId: text(entry["generationId"], 64),
        madeAt: text(entry["madeAt"], 40) ?? new Date(0).toISOString(),
      } satisfies LooseTake,
    ];
  });
  return {
    shots,
    loose,
    summary: text(item["summary"], 600),
    left: text(item["left"], 600),
    finished: item["finished"] === true,
    note: text(item["note"], 1200),
  };
}

/** Work with shots saved: a shot saved again takes its new file; a loose take now saved is no longer loose. */
export function withSaved(work: SectionWork, saved: SavedShot[]): SectionWork {
  const byShot = new Map(work.shots.map((entry) => [entry.shot, entry]));
  for (const entry of saved) byShot.set(entry.shot, entry);
  const shots = [...byShot.values()].sort((a, b) => a.shot - b.shot);
  const used = new Set(shots.map((entry) => entry.assetId));
  return { ...work, shots, loose: work.loose.filter((take) => !used.has(take.assetId)) };
}

/** Work with what was made but not saved kept as loose takes (once each, never one already saved). */
export function withLoose(work: SectionWork, takes: LooseTake[]): SectionWork {
  const known = new Set([
    ...work.shots.map((entry) => entry.assetId),
    ...work.loose.map((take) => take.assetId),
  ]);
  const added = takes.filter((take) => {
    if (known.has(take.assetId)) return false;
    known.add(take.assetId);
    return true;
  });
  return added.length ? { ...work, loose: [...work.loose, ...added].slice(-40) } : work;
}

/** The shots of a section its worker hasn't saved, by index. */
export function unsavedShots(
  section: Pick<PlannedSection, "first" | "last">,
  work: SectionWork,
): number[] {
  const saved = new Set(work.shots.map((entry) => entry.shot));
  const out: number[] = [];
  for (let index = section.first; index <= section.last; index += 1)
    if (!saved.has(index)) out.push(index);
  return out;
}

/* ------------------------------------------------------------------ */
/* Briefs                                                              */
/* ------------------------------------------------------------------ */

export interface Neighbour {
  /** The neighbouring section's position. */
  section: number;
  /** Its shot at the join: the last before this section, or the first after it. */
  shot: ReelShot;
  join: JoinKind;
  frame: FrameRef | null;
}

export interface SectionBriefInput {
  plan: {
    title: string;
    kind: ReelKind;
    sourceTitle: string;
    /** The integration edit's title. */
    editTitle: string | null;
    sections: number;
  };
  section: PlannedSection;
  /** The whole reel's shots. */
  shots: ReelShot[];
  before: Neighbour | null;
  after: Neighbour | null;
  /** What it has done before (a carry-on). */
  work?: SectionWork;
  /** Its step limit now, and the steps already used. */
  budget: number;
  used?: number;
}

function shotLine(shot: ReelShot, saved: SavedShot | undefined): string {
  const made = saved
    ? `saved: library file ${saved.assetId}`
    : shot.assetId
      ? `made: library file ${shot.assetId}`
      : `not made yet (${shot.kind === "image" ? "a still" : "a video"} to make)`;
  const beat = shot.beat ? `: ${shot.beat.replace(/\s+/g, " ").slice(0, 400)}` : "";
  return `- Shot ${shot.index + 1} “${shot.label}” · ${shot.seconds.toFixed(1)} s · ${made}${beat}`;
}

/** What a neighbour's frame is, in words: its library id, or why there isn't one yet. */
export function frameWords(neighbour: Neighbour, side: "last" | "first"): string {
  const whose = `Section ${neighbour.section + 1}'s ${side} frame (shot ${neighbour.shot.index + 1} “${neighbour.shot.label}”)`;
  const frame = neighbour.frame;
  if (frame?.status === "ready" && frame.assetId)
    return `${whose} is library image ${frame.assetId}, shown below.`;
  if (frame?.status === "taking")
    return `${whose} is still being taken: get_section shows it once it is.`;
  const why =
    frame?.note ?? (neighbour.shot.assetId ? "it couldn't be taken" : "its shot isn't made yet");
  return `${whose} isn't to be had (${why})${neighbour.shot.beat ? `: work from what the shot is, ${neighbour.shot.beat.replace(/\s+/g, " ").slice(0, 300)}` : ""}.`;
}

function meetLine(neighbour: Neighbour, side: "before" | "after"): string {
  const frame = frameWords(neighbour, side === "before" ? "last" : "first");
  if (side === "before") {
    const how =
      neighbour.join === "continuous"
        ? "The join is one shot carrying straight on: your first shot opens on exactly this picture, its framing, colour and light, and moves on from it. Give it as your first shot's start frame where the model takes one."
        : neighbour.join === "cut"
          ? "It is a cut within the scene: your first shot keeps its place, light and colour grade, and its people as they are."
          : "It is a cut to another scene: keep the cast and the brand's look.";
    return `- **It starts where section ${neighbour.section + 1} ends.** ${frame} ${how}`;
  }
  const how =
    neighbour.join === "continuous"
      ? "The join is one shot carrying straight on: your last shot ends on exactly this picture, so the next section moves on from it."
      : neighbour.join === "cut"
        ? "It is a cut within the scene: end on a picture that cuts to it cleanly, in the same place, light and colour grade."
        : "It is a cut to another scene: end your scene cleanly.";
  return `- **It ends where section ${neighbour.section + 1} begins.** ${frame} ${how}`;
}

/**
 * A worker's brief: its shots, where it meets its neighbours (their last and
 * first frames, by library id, shown with it), and how it works: within its
 * step limit, saving each shot as soon as it is right, spending as the
 * conversation does.
 */
export function sectionBrief(input: SectionBriefInput): string {
  const { plan, section, shots } = input;
  const work = input.work ?? EMPTY_WORK;
  const saved = new Map(work.shots.map((entry) => [entry.shot, entry]));
  const own = shots.slice(section.first, section.last + 1);
  const toMake = own.filter((shot) => !shot.assetId && !saved.has(shot.index)).length;
  const lines = [
    `# Section ${section.position + 1} of ${plan.sections}: ${section.title} (${section.seconds.toFixed(1)} s)`,
    "",
    `You are this section's worker in the ${REEL_KIND_LABELS[plan.kind]} “${plan.sourceTitle}” (the plan “${plan.title}”). You own ${range(section.first, section.last)} and nothing else: the other sections have their own workers.${plan.editTitle ? ` What you save goes into the integration edit “${plan.editTitle}”, where every section meets.` : ""}`,
    "",
    "## Your shots",
    ...own.map((shot) => shotLine(shot, saved.get(shot.index))),
  ];
  if (input.before || input.after) {
    lines.push("", "## Where it meets its neighbours");
    if (input.before) lines.push(meetLine(input.before, "before"));
    if (input.after) lines.push(meetLine(input.after, "after"));
  }
  if (work.loose.length)
    lines.push(
      "",
      "## Made before, not saved to a shot",
      ...work.loose.map(
        (take) =>
          `- Library file ${take.assetId} (${take.kind}${take.generationId ? `, generation ${take.generationId}` : ""}): look at it and save it to its shot if it is right.`,
      ),
    );
  if (work.note) lines.push("", "## To put right", work.note);
  const left = input.budget - (input.used ?? 0);
  lines.push(
    "",
    "## How to work",
    `- You have ${left} steps (model calls) for this section, set from its work: ${own.length} ${own.length === 1 ? "shot" : "shots"}${toMake ? `, ${toMake} to make` : ""}. You are told when few are left; at the limit the studio saves what you have made and stops.`,
    "- Save each shot as soon as it is right with save_section (its shot number and its library file): it goes into the integration edit at once and is kept even if you are stopped. Don't wait to save them all at the end.",
    "- Spending is as in the conversation: anything that spends waits for the person's approval unless it is within what they let it spend.",
    "- Change only your own shots. When the section is done, call finish_section with a line on what you made and anything left.",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* The merge                                                           */
/* ------------------------------------------------------------------ */

/** A clip of the integration edit a section owns, and the shot it shows. */
export interface OwnedClip {
  shot: number;
  clipId: string;
}

export interface MergeInput {
  timeline: Timeline;
  shots: ReelShot[];
  section: Pick<PlannedSection, "position" | "first" | "last">;
  /** The clips this section owns now. */
  owned: OwnedClip[];
  /** The clips the other sections own, by position. */
  others: { position: number; clipIds: string[] }[];
  saved: SavedShot[];
}

export interface MergeResult {
  timeline: Timeline;
  owned: OwnedClip[];
  /** Shots of the section placed in the edit, and those with nothing to show yet. */
  placed: number;
  missing: number[];
  /** What changed that people should know, in words. */
  notes: string[];
  /** Whether the timeline changed at all. */
  changed: boolean;
}

/** A clip id for a saved shot: stable for the same section, shot and file, and unique in the edit. */
function clipIdFor(position: number, saved: SavedShot, taken: Set<string>): string {
  const base = `s${position + 1}-${saved.shot + 1}-${saved.assetId.slice(0, 8)}`;
  let id = base;
  for (let counter = 2; taken.has(id); counter += 1) id = `${base}-${counter}`;
  taken.add(id);
  return id;
}

/** A saved shot as a clip, in the place (and with the join and transition) of the clip it replaces. */
function savedClip(
  saved: SavedShot,
  shot: ReelShot | undefined,
  replacing: TimelineClip | null,
  id: string,
): TimelineClip | null {
  const length = saved.seconds ?? shot?.seconds ?? replacing?.duration ?? 3;
  const trimStart = saved.kind === "image" ? 0 : Math.max(0, saved.trimStart);
  const room =
    saved.kind === "video" && saved.fileSeconds
      ? Math.max(0.1, saved.fileSeconds - trimStart)
      : LIMITS.clipSeconds;
  const sameKind = replacing?.kind === saved.kind;
  const join = replacing
    ? { smartBlend: replacing.smartBlend, matchPrevious: replacing.matchPrevious }
    : joinFields(saved.kind === "video" && shot?.continuous && shot.index > 0 ? "smart" : "plain");
  const parsed = clipSchema.safeParse({
    id,
    assetId: saved.assetId,
    kind: saved.kind,
    trimStart,
    duration: Number(Math.max(0.1, Math.min(length, room, LIMITS.clipSeconds)).toFixed(3)),
    speed: 1,
    volume: replacing && sameKind ? replacing.volume : 1,
    fit: replacing?.fit ?? null,
    motion: sameKind && replacing ? replacing.motion : "none",
    transition: replacing?.transition ?? { type: "cut", duration: 0 },
    ...(saved.kind === "video" ? join : joinFields("plain")),
    label: shot?.label ?? replacing?.label,
    sourceDuration: saved.fileSeconds,
  });
  return parsed.success ? parsed.data : null;
}

const clipSeconds = (clips: TimelineClip[]) => clips.reduce((sum, clip) => sum + clip.duration, 0);

/**
 * Merges a section into the integration edit: its saved shots take the place
 * of the clips it owned (keeping their transitions and joins), shots it didn't
 * save keep the clips they had, and a section with nothing in the edit yet
 * goes after the sections before it. Nothing outside the section moves except
 * by its new length, and nothing is lost: a saved shot with no room is named.
 */
export function mergeSection(input: MergeInput): MergeResult {
  const { timeline, shots, section } = input;
  const ownedIds = new Set(input.owned.map((entry) => entry.clipId));
  const byId = new Map(timeline.clips.map((clip) => [clip.id, clip]));
  const kept = timeline.clips.filter((clip) => !ownedIds.has(clip.id));
  const firstOwned = timeline.clips.findIndex((clip) => ownedIds.has(clip.id));
  let at: number;
  if (firstOwned >= 0) {
    at = timeline.clips.slice(0, firstOwned).filter((clip) => !ownedIds.has(clip.id)).length;
  } else {
    const indexOf = (id: string) => kept.findIndex((clip) => clip.id === id);
    const earlier = input.others
      .filter((other) => other.position < section.position)
      .sort((a, b) => b.position - a.position)
      .map((other) => Math.max(-1, ...other.clipIds.map(indexOf)))
      .find((index) => index >= 0);
    const later = input.others
      .filter((other) => other.position > section.position)
      .sort((a, b) => a.position - b.position)
      .map((other) => {
        const found = other.clipIds.map(indexOf).filter((index) => index >= 0);
        return found.length ? Math.min(...found) : -1;
      })
      .find((index) => index >= 0);
    at = earlier !== undefined ? earlier + 1 : later !== undefined ? later : kept.length;
  }

  const savedByShot = new Map(input.saved.map((entry) => [entry.shot, entry]));
  const ownedByShot = new Map<number, TimelineClip>();
  for (const entry of input.owned) {
    const clip = byId.get(entry.clipId);
    if (clip && !ownedByShot.has(entry.shot)) ownedByShot.set(entry.shot, clip);
  }
  const taken = new Set(kept.map((clip) => clip.id));
  const clips: TimelineClip[] = [];
  const owned: OwnedClip[] = [];
  const missing: number[] = [];
  const notes: string[] = [];
  for (let index = section.first; index <= section.last; index += 1) {
    const saved = savedByShot.get(index);
    const old = ownedByShot.get(index) ?? null;
    if (saved) {
      const clip = savedClip(saved, shots[index], old, clipIdFor(section.position, saved, taken));
      if (clip) {
        clips.push(clip);
        owned.push({ shot: index, clipId: clip.id });
        continue;
      }
      notes.push(`Shot ${index + 1}'s saved file couldn't be laid in as a clip.`);
    }
    if (old) {
      taken.add(old.id);
      clips.push(old);
      owned.push({ shot: index, clipId: old.id });
    } else missing.push(index);
  }

  // Within what an edit holds: shots past it are named, never dropped silently.
  const room = Math.max(0, LIMITS.clips - kept.length);
  if (clips.length > room) {
    const left = owned.slice(room).map((entry) => entry.shot + 1);
    notes.push(
      `The edit holds ${LIMITS.clips} clips, so shot${left.length === 1 ? "" : "s"} ${left.join(", ")} ${left.length === 1 ? "isn't" : "aren't"} in it.`,
    );
    clips.length = room;
    owned.length = room;
  }
  // The first clip of an edit carries on from nothing.
  if (at === 0 && clips[0]) clips[0] = { ...clips[0], ...joinFields("plain") };

  const planned = shots
    .slice(section.first, section.last + 1)
    .reduce((sum, shot) => sum + shot.seconds, 0);
  const now = clipSeconds(clips);
  if (!missing.length && clips.length && Math.abs(now - planned) >= 0.05)
    notes.push(
      `Section ${section.position + 1} runs ${now.toFixed(1)} s against ${planned.toFixed(1)} s planned: what follows it moves ${Math.abs(now - planned).toFixed(1)} s ${now > planned ? "later" : "earlier"}.`,
    );
  if (missing.length)
    notes.push(
      `${missing.length === 1 ? "Shot" : "Shots"} ${missing.map((index) => index + 1).join(", ")} ${missing.length === 1 ? "has" : "have"} nothing to show yet.`,
    );

  const merged = [...kept.slice(0, at), ...clips, ...kept.slice(at)];
  const changed =
    merged.length !== timeline.clips.length ||
    merged.some((clip, index) => JSON.stringify(clip) !== JSON.stringify(timeline.clips[index]));
  return {
    timeline: { ...timeline, clips: merged },
    owned,
    placed: clips.length,
    missing,
    notes,
    changed,
  };
}

/**
 * The clips either side of a join in the integration edit: the last the
 * earlier section owns and the first the later one owns (null where a side
 * has none), and whether they meet (nothing was put between them).
 */
export function joinClips(
  timeline: Timeline,
  before: OwnedClip[],
  after: OwnedClip[],
): {
  before: TimelineClip | null;
  after: TimelineClip | null;
  afterIndex: number | null;
  adjacent: boolean;
} {
  const indexes = (owned: OwnedClip[]) => {
    const ids = new Set(owned.map((entry) => entry.clipId));
    return timeline.clips.flatMap((clip, index) => (ids.has(clip.id) ? [index] : []));
  };
  const left = indexes(before);
  const right = indexes(after);
  const last = left.length ? Math.max(...left) : null;
  const first = right.length ? Math.min(...right) : null;
  return {
    before: last !== null ? timeline.clips[last]! : null,
    after: first !== null ? timeline.clips[first]! : null,
    afterIndex: first,
    adjacent: last !== null && first !== null && first === last + 1,
  };
}

/* ------------------------------------------------------------------ */
/* Join checks                                                         */
/* ------------------------------------------------------------------ */

export const LIKENESSES = ["same", "minor", "different", "unseen"] as const;
export type Likeness = (typeof LIKENESSES)[number];

/** The studio's AI on the two frames either side of a join. */
export interface JoinLook {
  framing: Likeness;
  colour: Likeness;
  continuity: Likeness;
  /** What changed across the cut, a few words each. */
  differences: string[];
}

/** What a render's smart blend measured at a join (see ../edit/join-report). */
export interface RenderJoin {
  matched: boolean;
  /** How far it moved the later clip to meet the earlier, as a share of the frame. */
  moved: number | null;
  likenessBefore: number | null;
  likenessAfter: number | null;
  left: JoinLeftReason | null;
}

/** Everything measured at one join, for its verdict. */
export interface JoinMeasures {
  kind: JoinKind;
  look: JoinLook | null;
  render: RenderJoin | null;
  /** The character check across the two frames (null: the reel has no cast to check). */
  characters: { flagged: boolean; summary: string | null } | null;
  /** The lettering check on each side (null: not read). */
  lettering: {
    before: TextVerdict | null;
    after: TextVerdict | null;
    summary: string | null;
  } | null;
  /** Both clips at the join are videos (a smart blend or colour match can be set on it). */
  videos: boolean;
  /** How the integration edit joins them now. */
  blend: "smart" | "colour" | "plain";
  /** Clips were put between the two sections in the edit. */
  apart?: boolean;
}

export const JOIN_ASPECTS = ["framing", "colour", "continuity", "characters", "lettering"] as const;
export type JoinAspect = (typeof JOIN_ASPECTS)[number];

export interface JoinFinding {
  aspect: JoinAspect;
  /** ok: it holds; differs: a viewer would see it jump; expected: the cut means it to change. */
  status: "ok" | "differs" | "unmeasured" | "expected";
  detail: string;
}

/** A way to put a join right: on the edit itself (free), or by a section's worker (it may spend, and asks). */
export type JoinFix =
  | { kind: "smart_blend"; label: string }
  | { kind: "colour_match"; label: string }
  | { kind: "redo_after"; section: number; label: string }
  | { kind: "redo_before"; section: number; label: string };

export interface JoinVerdict {
  status: "matches" | "differs" | "unmeasured";
  findings: JoinFinding[];
  summary: string;
  fixes: JoinFix[];
}

/** A join's two sections, by position (the earlier is the join's own). */
export interface JoinSides {
  before: number;
  after: number;
}

const ASPECT_WORDS: Record<JoinAspect, string> = {
  framing: "framing",
  colour: "colour",
  continuity: "continuity",
  characters: "characters",
  lettering: "lettering",
};

/** What the AI said changed in one aspect (its own words, where it named that aspect). */
function changes(look: JoinLook, aspect: JoinAspect): string {
  const named = look.differences.filter((entry) => entry.toLowerCase().startsWith(aspect));
  return (named.length ? named : look.differences)
    .slice(0, 2)
    .map((entry) => entry.replace(new RegExp(`^${aspect}\\s*:\\s*`, "i"), ""))
    .join("; ");
}

/**
 * A join's verdict from what was measured at it: the studio's AI on its two
 * frames, the last render's smart blend there, and the character and
 * lettering checks. What it holds to depends on how the sections meet: one
 * shot carrying on must be the same picture either side; a cut within a scene
 * keeps its grade and continuity; a cut between scenes only its cast and
 * lettering. Each difference comes with the fixes that would put it right.
 */
export function judgeJoin(measures: JoinMeasures, sides: JoinSides): JoinVerdict {
  const findings: JoinFinding[] = [];
  const fixes: JoinFix[] = [];
  const fix = (entry: JoinFix) => {
    if (!fixes.some((item) => item.kind === entry.kind)) fixes.push(entry);
  };
  const redoAfter = (why: string) =>
    fix({
      kind: "redo_after",
      section: sides.after,
      label: `Make section ${sides.after + 1}'s first shot again from section ${sides.before + 1}'s last frame (${why})`,
    });
  const redoBefore = (why: string) =>
    fix({
      kind: "redo_before",
      section: sides.before,
      label: `Make section ${sides.before + 1}'s last shot again (${why})`,
    });
  const smart = () => {
    if (measures.videos && measures.blend !== "smart")
      fix({
        kind: "smart_blend",
        label:
          "Smart-blend the join: the render puts the later clip back in register (framing, colour, detail)",
      });
  };
  const colour = () => {
    if (measures.videos && measures.blend === "plain")
      fix({ kind: "colour_match", label: "Colour-match the join in the render" });
  };
  const { kind, look, render } = measures;

  // Framing: one shot carrying on keeps it; a cut changes it on purpose.
  if (kind !== "continuous") {
    findings.push({ aspect: "framing", status: "expected", detail: "A cut: the framing changes." });
  } else if (render && render.left === "different_pictures") {
    findings.push({
      aspect: "framing",
      status: "differs",
      detail: "The last render found the two sides aren't the same picture.",
    });
    redoAfter("the two sides aren't the same picture");
  } else if (look?.framing === "different") {
    findings.push({
      aspect: "framing",
      status: "differs",
      detail: changes(look, "framing") || "The framing jumps across the cut.",
    });
    redoAfter("the framing jumps");
  } else if (render?.matched) {
    findings.push({
      aspect: "framing",
      status: "ok",
      detail:
        render.moved !== null && render.moved >= 0.002
          ? `Put back in register by the render (the later side was out by ${(render.moved * 100).toFixed(1)}%).`
          : "The render found them in register.",
    });
  } else if (look?.framing === "minor") {
    findings.push({
      aspect: "framing",
      status: "ok",
      detail: `A slight shift${changes(look, "framing") ? `: ${changes(look, "framing")}` : ""}; a smart blend evens it out.`,
    });
    smart();
  } else if (look?.framing === "same" || render?.left === "already_matching") {
    findings.push({ aspect: "framing", status: "ok", detail: "The framing carries straight on." });
  } else {
    findings.push({ aspect: "framing", status: "unmeasured", detail: "Not judged yet." });
  }

  // Colour: held across one shot and within a scene; a new scene may change it.
  if (kind === "scene") {
    findings.push({
      aspect: "colour",
      status: "expected",
      detail: "A new scene: its grade may change.",
    });
  } else if (look?.colour === "different") {
    findings.push({
      aspect: "colour",
      status: "differs",
      detail: changes(look, "colour") || "The colour jumps across the cut.",
    });
    if (kind === "continuous" && measures.videos) {
      smart();
      colour();
    } else redoAfter("its colour doesn't match the scene");
  } else if (look?.colour === "minor") {
    findings.push({
      aspect: "colour",
      status: "ok",
      detail: `A slight shift${changes(look, "colour") ? `: ${changes(look, "colour")}` : ""}${kind === "continuous" ? "; a smart blend or colour match evens it out" : ""}.`,
    });
    if (kind === "continuous") {
      smart();
      colour();
    }
  } else if (look?.colour === "same") {
    findings.push({ aspect: "colour", status: "ok", detail: "The grade holds." });
  } else {
    findings.push({ aspect: "colour", status: "unmeasured", detail: "Not judged yet." });
  }

  // Continuity: the setting, props, light and wardrobe, within one shot or scene.
  if (kind === "scene") {
    findings.push({ aspect: "continuity", status: "expected", detail: "A new scene." });
  } else if (look?.continuity === "different") {
    findings.push({
      aspect: "continuity",
      status: "differs",
      detail: changes(look, "continuity") || "Something in the picture changes across the cut.",
    });
    redoAfter("what is in the picture changes");
  } else if (look?.continuity === "same" || look?.continuity === "minor") {
    findings.push({
      aspect: "continuity",
      status: "ok",
      detail:
        look.continuity === "minor" && changes(look, "continuity")
          ? `Small changes: ${changes(look, "continuity")}.`
          : "What is in the picture holds.",
    });
  } else {
    findings.push({ aspect: "continuity", status: "unmeasured", detail: "Not judged yet." });
  }

  if (measures.characters) {
    if (measures.characters.flagged) {
      findings.push({
        aspect: "characters",
        status: "differs",
        detail: measures.characters.summary ?? "A character looks different across the cut.",
      });
      redoAfter("a character looks different");
    } else
      findings.push({
        aspect: "characters",
        status: "ok",
        detail: "The cast looks the same either side.",
      });
  }

  if (measures.lettering) {
    const { before, after, summary } = measures.lettering;
    if (before === "garbled" || after === "garbled") {
      findings.push({
        aspect: "lettering",
        status: "differs",
        detail:
          summary ?? `Garbled lettering ${before === "garbled" ? "before" : "after"} the cut.`,
      });
      if (after === "garbled") redoAfter("its lettering is garbled");
      if (before === "garbled") redoBefore("its lettering is garbled");
    } else if (before === null && after === null) {
      findings.push({ aspect: "lettering", status: "unmeasured", detail: "Not read yet." });
    } else
      findings.push({ aspect: "lettering", status: "ok", detail: "Any lettering reads right." });
  }

  const differs = findings.filter((entry) => entry.status === "differs");
  const judged = findings.some((entry) => entry.status === "ok" || entry.status === "differs");
  const status = differs.length ? "differs" : judged ? "matches" : "unmeasured";
  const where = `Sections ${sides.before + 1} → ${sides.after + 1} (${JOIN_KIND_LABELS[kind]})`;
  const summary =
    status === "differs"
      ? `${where}: ${differs.map((entry) => `${ASPECT_WORDS[entry.aspect]}: ${entry.detail.replace(/\.$/, "")}`).join("; ")}.`
      : status === "matches"
        ? `${where}: it meets as it should.${measures.apart ? " Clips were put between the two sections in the edit." : ""}`
        : `${where}: not judged yet.`;
  return {
    status,
    findings,
    summary,
    fixes:
      status === "differs"
        ? fixes
        : fixes.filter((entry) => entry.kind === "smart_blend" || entry.kind === "colour_match"),
  };
}

/**
 * What a render's smart blend measured at the clip at `clipIndex` (its index
 * in the render's clips), from the rendered video's record (`metadata.probe
 * .smart_joins`), or null when the render didn't blend that join.
 */
export function renderJoinAt(metadata: unknown, clipIndex: number): RenderJoin | null {
  const record = (value: unknown): Json | null =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
  const probe = record(record(metadata)?.["probe"]);
  const entries = Array.isArray(probe?.["smart_joins"]) ? (probe["smart_joins"] as unknown[]) : [];
  const entry = entries.map(record).find((item) => item?.["clip"] === clipIndex);
  if (!entry) return null;
  const left = entry["left"];
  return {
    matched: entry["matched"] === true,
    moved: number(record(entry["framing"])?.["moved"]),
    likenessBefore: number(entry["likeness_before"]),
    likenessAfter: number(entry["likeness_after"]),
    left:
      left === "different_pictures" || left === "already_matching" || left === "unmeasured"
        ? left
        : null,
  };
}

/** A join's stored verdict, read tolerantly. */
export function joinVerdictOf(value: unknown): JoinVerdict | null {
  const item = (value && typeof value === "object" ? value : null) as Json | null;
  if (!item || !Array.isArray(item["findings"])) return null;
  const status = item["status"];
  return {
    status: status === "matches" || status === "differs" ? status : "unmeasured",
    findings: (item["findings"] as Json[]).flatMap((entry) =>
      (JOIN_ASPECTS as readonly string[]).includes(String(entry?.["aspect"])) &&
      ["ok", "differs", "unmeasured", "expected"].includes(String(entry["status"]))
        ? [
            {
              aspect: entry["aspect"] as JoinAspect,
              status: entry["status"] as JoinFinding["status"],
              detail: text(entry["detail"], 400) ?? "",
            },
          ]
        : [],
    ),
    summary: text(item["summary"], 1200) ?? "",
    fixes: (Array.isArray(item["fixes"]) ? (item["fixes"] as Json[]) : []).flatMap(
      (entry): JoinFix[] => {
        const kind = entry?.["kind"];
        const label = text(entry?.["label"], 300) ?? "";
        if (kind === "smart_blend" || kind === "colour_match") return [{ kind, label }];
        const section = number(entry?.["section"]);
        if ((kind === "redo_after" || kind === "redo_before") && section !== null)
          return [{ kind, section: Math.round(section), label }];
        return [];
      },
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Statuses                                                            */
/* ------------------------------------------------------------------ */

/**
 * A section's state: waiting to be given to a worker, queued for one,
 * working, waiting for a person's approval, saved part-way (stopped at its
 * limit or by its worker, to carry on), done, failed or stopped.
 */
export const SECTION_STATUSES = [
  "waiting",
  "queued",
  "working",
  "awaiting_approval",
  "saved",
  "done",
  "failed",
  "stopped",
] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  waiting: "Not started",
  queued: "Queued",
  working: "Working",
  awaiting_approval: "Waiting for you",
  saved: "Saved part-way",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

/** A section's state once a worker's turn ends. */
export function statusAfterTurn(
  turn: "streaming" | "awaiting_approval" | "complete" | "stopped" | "failed",
  work: Pick<SectionWork, "finished">,
): SectionStatus {
  if (turn === "awaiting_approval") return "awaiting_approval";
  if (turn === "stopped") return "stopped";
  if (turn === "failed") return "failed";
  if (turn === "streaming") return "working";
  return work.finished ? "done" : "saved";
}

/** Whether a section can be given to its worker now (again, for one done or saved part-way). */
export function canStart(status: SectionStatus): boolean {
  return status !== "working";
}

export const JOIN_STATUSES = [
  "waiting",
  "framing",
  "checking",
  "matches",
  "differs",
  "unmeasured",
] as const;
export type JoinStatus = (typeof JOIN_STATUSES)[number];

export const JOIN_STATUS_LABELS: Record<JoinStatus, string> = {
  waiting: "Waiting for both sides",
  framing: "Taking its frames",
  checking: "Checking",
  matches: "Meets as it should",
  differs: "Doesn't match",
  unmeasured: "Couldn't be judged",
};
