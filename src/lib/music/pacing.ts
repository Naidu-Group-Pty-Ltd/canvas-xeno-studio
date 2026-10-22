/**
 * One solver for cuts, voice and music, after Reel 1's pacing
 * (scripts/aurixa-reel-1/pacing.py). snapCutsToBeats (./beats) moves one cut
 * at a time by changing a clip's length, and can't move time itself; this
 * holds the voice open in its silences (see the voiceover pauses in
 * src/lib/edit/timeline) so that the cuts tied to its words land on the
 * music, solved over the whole edit at once:
 *
 *   - the frames added between two cuts pay 0.012 x (frames - the frames they
 *     should be near)^2;
 *   - each cut pays its beat cost: 0 on a bar line, 0.25 on a beat, 0.6 near
 *     one, 1 off the grid, times its own weight (Reel 1 weighed its opening's
 *     cuts at 0.6);
 *   - anchors hold exactly: a moment that must land on a given frame (a cut,
 *     moved by the pauses strictly before it) or at a given time (a word,
 *     moved by the pauses at or before it);
 *   - the frames chosen between two cuts are shared among their pauses in
 *     proportion to the lengths they should be near.
 *
 * A cut is "on" a beat when the beat's attack falls in its first or second
 * frame, and near one when it falls in the frame before or the third. The
 * dynamic programme keeps, for every count of frames added so far, the
 * cheapest way there, so the result is the best arrangement rather than a
 * series of nearest moves; ties go to the first found, as pacing.py's do.
 *
 * Every time here is on the edit's clock before any pause is counted (for a
 * voiceover starting at 0 with no trim, its own clock); frames are of the
 * paced edit. Pure.
 */

/** A music grid on the edit's clock: its beats, and which of them are bar lines. */
export interface PacingGrid {
  beats: number[];
  bars: boolean[];
}

export interface PacingCut {
  id: string;
  /** Where the cut sits before the voice is held open. */
  at: number;
  /** How much landing it on the music counts (1 unless said). */
  weight?: number;
}

export interface PacingPause {
  /** Where its silence goes, before any pause is counted. */
  at: number;
  /** The frames it should be near (null: as many as the anchors need), and the least and most. */
  near: number | null;
  min: number;
  max: number;
}

export interface PacingAnchor {
  /** The moment that must land, before any pause is counted. */
  at: number;
  /** A cut is moved by the pauses strictly before it; a word by those at or before it. */
  kind: "cut" | "word";
  /** Where it lands: a frame of the paced edit, or a time on it (to the nearest frame). */
  frame?: number;
  time?: number;
}

export interface PacingWeights {
  /** The cost of each frame, squared, away from what a stretch between two cuts should add. */
  deviation: number;
  /** A cut's cost on a bar line, on a beat, near one, and off the grid. */
  bar: number;
  beat: number;
  near: number;
  off: number;
}

/** pacing.py's costs. */
export const PACING_WEIGHTS: PacingWeights = {
  deviation: 0.012,
  bar: 0,
  beat: 0.25,
  near: 0.6,
  off: 1,
};

export interface PacingInput {
  fps: number;
  cuts: PacingCut[];
  pauses: PacingPause[];
  grid: PacingGrid;
  anchors?: PacingAnchor[];
  weights?: Partial<PacingWeights>;
}

export type Landing = "bar" | "beat" | "near" | "off" | "anchored";

export interface PacingSolution {
  /** The frames each pause adds, in the order given (0 for one left out). */
  pauses: { at: number; frames: number }[];
  /** Where each cut lands on the paced edit, and how it sits on the music. */
  cuts: { id: string; at: number; frame: number; landing: Landing }[];
  /** Frames added in all. */
  frames: number;
  cost: number;
}

/** Two moments closer than this (seconds) are the same moment. */
const SAME_MOMENT = 1e-6;

/** How a cut on each frame of the edit sits on the music: on a bar line, on a beat, near one, or off. */
export function landingOn(grid: PacingGrid, fps: number): (frame: number) => Landing {
  const table = beatTable(grid, fps, PACING_WEIGHTS);
  return (frame) => table(frame).landing;
}

/** A cut's beat cost at each frame of the edit, and how it lands there. */
function beatTable(grid: PacingGrid, fps: number, weights: PacingWeights) {
  const table = new Map<number, { cost: number; landing: Landing }>();
  const offer = (frame: number, cost: number, landing: Landing) => {
    const was = table.get(frame);
    if (!was || cost < was.cost) table.set(frame, { cost, landing });
  };
  grid.beats.forEach((time, index) => {
    const frame = Math.floor(time * fps);
    const bar = grid.bars[index] === true;
    for (const at of [frame - 1, frame])
      offer(at, bar ? weights.bar : weights.beat, bar ? "bar" : "beat");
    for (const at of [frame - 2, frame + 1]) offer(at, weights.near, "near");
  });
  return (frame: number) => table.get(frame) ?? { cost: weights.off, landing: "off" as Landing };
}

/** Splits `frames` across a stretch's pauses near their lengths and within their limits (pacing.py's _share). */
function share(members: PacingPause[], frames: number): number[] {
  if (!members.length) return [];
  const near = members.reduce((sum, pause) => sum + (pause.near ?? 0), 0) || 1;
  const raw = members.map((pause) => (frames * (pause.near ?? 0)) / near);
  const got = members.map((pause, index) =>
    Math.max(pause.min, Math.min(pause.max, Math.floor(raw[index]!))),
  );
  const order = members
    .map((_, index) => index)
    .sort((a, b) => -(raw[a]! - Math.floor(raw[a]!)) + (raw[b]! - Math.floor(raw[b]!)));
  const total = () => got.reduce((sum, value) => sum + value, 0);
  for (let guard = 0; total() < frames && guard < frames + 1; guard += 1)
    for (const index of order)
      if (total() < frames && got[index]! < members[index]!.max) got[index]! += 1;
  for (let guard = 0; total() > frames && guard < frames + 1 + members.length; guard += 1)
    for (const index of [...order].reverse())
      if (total() > frames && got[index]! > members[index]!.min) got[index]! -= 1;
  return got;
}

interface Edge {
  time: number;
  /** How many of the pauses (in order) come before it. */
  prefix: number;
  cut: PacingCut | null;
  /** The frames that must have been added by it, for an anchor. */
  required: number | null;
}

/**
 * The pause frames that land the cuts best on the music, holding every
 * anchor exactly. Throws when the pauses can't reach an anchor, saying which.
 */
export function solvePacing(input: PacingInput): PacingSolution {
  const { fps } = input;
  const weights = { ...PACING_WEIGHTS, ...input.weights };
  const beatCost = beatTable(input.grid, fps, weights);
  const order = input.pauses.map((pause, index) => ({ pause, index }));
  order.sort((a, b) => a.pause.at - b.pause.at);
  const pauses = order.map((entry) => entry.pause);
  const before = (time: number, inclusive: boolean) =>
    pauses.filter((pause) =>
      inclusive ? pause.at <= time + SAME_MOMENT : pause.at < time - SAME_MOMENT,
    ).length;
  const required = (anchor: PacingAnchor) =>
    anchor.time !== undefined
      ? Math.round((anchor.time - anchor.at) * fps)
      : (anchor.frame ?? 0) - Math.round(anchor.at * fps);

  // Every cut and anchor, in order: a cut anchored where it stands lands there and pays nothing.
  const anchors = [...(input.anchors ?? [])];
  const edges: Edge[] = input.cuts.map((cut) => {
    const held = anchors.findIndex(
      (anchor) => anchor.kind === "cut" && Math.abs(anchor.at - cut.at) < SAME_MOMENT,
    );
    const anchor = held === -1 ? null : anchors.splice(held, 1)[0]!;
    return {
      time: cut.at,
      prefix: before(cut.at, false),
      cut,
      required: anchor ? required(anchor) : null,
    };
  });
  for (const anchor of anchors)
    edges.push({
      time: anchor.at + (anchor.kind === "word" ? SAME_MOMENT : 0),
      prefix: before(anchor.at, anchor.kind === "word"),
      cut: null,
      required: required(anchor),
    });
  edges.sort((a, b) => a.time - b.time || a.prefix - b.prefix);

  // The most frames that may be added by each edge: the next anchor's.
  const limits = edges.map((_, index) => {
    for (let next = index; next < edges.length; next += 1)
      if (edges[next]!.required !== null) return edges[next]!.required!;
    return Infinity;
  });

  type State = { cost: number; from: number; frames: number };
  let states = new Map<number, State>([[0, { cost: 0, from: 0, frames: 0 }]]);
  const steps: Map<number, State>[] = [];
  let settled = 0;
  let next = 0;
  edges.forEach((edge, index) => {
    const members = pauses.slice(next, edge.prefix);
    next = Math.max(next, edge.prefix);
    const lo = members.reduce((sum, pause) => sum + pause.min, 0);
    const hi = members.reduce((sum, pause) => sum + pause.max, 0);
    const nearSum = members.reduce((sum, pause) => sum + (pause.near ?? 0), 0);
    const priced = members.some((pause) => pause.near !== null);
    const free = !!edge.cut && edge.required === null;
    const step = new Map<number, State>();
    for (const [frames, state] of states) {
      for (let added = lo; added <= hi; added += 1) {
        const total = frames + added;
        if (total > limits[index]!) break;
        let cost = state.cost + (priced ? weights.deviation * (added - nearSum) ** 2 : 0);
        if (free)
          cost += (edge.cut!.weight ?? 1) * beatCost(Math.round(edge.cut!.at * fps) + total).cost;
        const was = step.get(total);
        if (!was || cost < was.cost) step.set(total, { cost, from: frames, frames: added });
      }
    }
    if (edge.required !== null) {
      const held = step.get(edge.required);
      if (!held)
        throw new Error(
          `No pause lengths land the ${edge.cut ? `cut ${edge.cut.id}` : "anchor"} at ${edge.time.toFixed(3)}s where it must: it needs ${edge.required} frames added before it, and the pauses allow ${Math.min(...states.keys()) + lo} to ${Math.max(...states.keys()) + hi}.`,
        );
      // Everything before an anchor is settled: its cost is counted, and what follows starts afresh.
      settled += held.cost;
      step.clear();
      step.set(edge.required, { ...held, cost: 0 });
    }
    if (!step.size) throw new Error("The pauses can't be fitted to the anchors.");
    steps.push(step);
    states = step;
  });

  // The cheapest way through, back from the end.
  let frames = 0;
  let best: State | null = null;
  for (const [total, state] of states)
    if (!best || state.cost < best.cost) {
      best = state;
      frames = total;
    }
  const added = new Array<number>(edges.length).fill(0);
  let at = frames;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const state = steps[index]!.get(at)!;
    added[index] = state.frames;
    at = state.from;
  }

  // Each stretch's frames shared among its pauses; any after the last edge take what they should be near.
  const chosen = new Array<number>(pauses.length).fill(0);
  let start = 0;
  edges.forEach((edge, index) => {
    const end = Math.max(start, edge.prefix);
    share(pauses.slice(start, end), added[index]!).forEach(
      (value, offset) => (chosen[start + offset] = value),
    );
    start = end;
  });
  for (let index = start; index < pauses.length; index += 1) {
    const pause = pauses[index]!;
    chosen[index] = Math.max(pause.min, Math.min(pause.max, pause.near ?? pause.min));
  }

  const byInput = new Array<{ at: number; frames: number }>(pauses.length);
  order.forEach((entry, sorted) => {
    byInput[entry.index] = { at: entry.pause.at, frames: chosen[sorted]! };
  });
  const strictly = (time: number) =>
    pauses.reduce(
      (sum, pause, index) => sum + (pause.at < time - SAME_MOMENT ? chosen[index]! : 0),
      0,
    );
  const cuts = edges.flatMap((edge) => {
    if (!edge.cut) return [];
    const frame = Math.round(edge.cut.at * fps) + strictly(edge.cut.at);
    return [
      {
        id: edge.cut.id,
        at: edge.cut.at,
        frame,
        landing: edge.required !== null ? ("anchored" as Landing) : beatCost(frame).landing,
      },
    ];
  });
  return {
    pauses: byInput,
    cuts,
    frames: chosen.reduce((sum, value) => sum + value, 0),
    cost: settled + (best?.cost ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Grids                                                               */
/* ------------------------------------------------------------------ */

/**
 * A grid from a beat analysis ({bpm, beats}: see ./beats), with a bar line
 * every `beatsPerBar` beats from the first. Until the music's own downbeats
 * are known, the first beat is taken for one.
 */
export function gridFromBeats(beats: readonly number[], beatsPerBar = 4): PacingGrid {
  return {
    beats: [...beats],
    bars: beats.map((_, index) => index % beatsPerBar === 0),
  };
}

/**
 * A grid from a music structure (its beats and the downbeats among them, on
 * the track's clock; see MusicStructure in ./structure): a beat is a bar
 * line where a downbeat falls on it.
 */
export function gridFromStructure(structure: {
  beats: readonly number[];
  downbeats: readonly number[];
}): PacingGrid {
  const downbeats = [...structure.downbeats].sort((a, b) => a - b);
  return {
    beats: [...structure.beats],
    bars: structure.beats.map((beat) => downbeats.some((down) => Math.abs(down - beat) < 0.001)),
  };
}

/**
 * A music item's grid on the edit's clock, the way it plays: from its trim
 * point to the end of its track, then (looping) the whole track again, each
 * pass with its own bar lines; within what the item plays of the edit.
 */
export function gridOnTimeline(
  item: {
    start: number;
    trimStart: number;
    duration: number | null;
    sourceDuration?: number | null | undefined;
    loop: boolean;
  },
  grid: PacingGrid,
  total: number,
): PacingGrid {
  const length = item.sourceDuration ?? null;
  const plays = Math.min(item.duration ?? Infinity, total - item.start);
  const placed: { time: number; bar: boolean }[] = [];
  const add = (offset: number, bar: boolean) => {
    if (offset >= 0 && offset <= plays + 1e-6) placed.push({ time: item.start + offset, bar });
  };
  grid.beats.forEach((beat, index) => {
    if (beat >= item.trimStart && (length === null || beat < length))
      add(beat - item.trimStart, grid.bars[index] === true);
  });
  if (item.loop && length) {
    const firstPass = Math.max(0.01, length - item.trimStart);
    for (let pass = firstPass; pass < plays; pass += length)
      grid.beats.forEach((beat, index) => {
        if (beat < length) add(pass + beat, grid.bars[index] === true);
      });
  }
  placed.sort((a, b) => a.time - b.time);
  return { beats: placed.map((entry) => entry.time), bars: placed.map((entry) => entry.bar) };
}
