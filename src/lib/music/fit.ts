/**
 * Fitting music to a length on its bars: a plan of the track as pieces
 * (src/lib/edit/pieces) that runs the length asked, or the nearest whole
 * number of bars to it, made by playing some bars again or leaving some out.
 * Reel 1's soundtrack took three such edits: four bars of the intro again,
 * four bars of the groove again, and two bars of the breakdown left out.
 *
 * What it keeps:
 *   - whole phrases: bars go in groups of two or more, an even number (four,
 *     eight, sixteen where it can), so the music keeps its phrasing;
 *   - each section's first bar: a group never starts on one or takes it out
 *     of its section (whole sections can go, or play again, whole);
 *   - landmarks: a section's start on a time asked for (the drop on the
 *     brand's arrival), exactly, the bars before it fitted to suit;
 *   - the track's own ending, unless asked to stop on a bar line instead.
 * Which bars: those most like their neighbours (barSimilarity in
 * ./structure). A group played again should be like what follows it, which
 * it stands in front of; a group left out should be like what follows it,
 * which takes its place; and at the join, the bars either side should be
 * like the bars they now meet. Fewer joins are better than more.
 *
 * Each join is a splice 20 ms ahead of a bar line, so the bar's notes begin
 * in the new piece, under a 30 ms crossfade (PIECES.crossfade).
 */
import { PIECES, type MusicPiece } from "@/lib/edit/pieces";
import { barSeconds, barSimilarity, type BarFeatures, type MusicStructure } from "./structure";

/** How far ahead of its bar line a splice sits, before the bar's notes begin. */
export const SPLICE_LEAD = 0.02;

export interface FitLandmark {
  /** The section (an index into structure.sections) whose start is to land... */
  section: number;
  /** ...this many seconds into the plan. */
  at: number;
}

export interface FitOptions {
  /** Where in the track the plan starts, in seconds: its beginning unless given. */
  start?: number;
  landmarks?: FitLandmark[];
  /**
   * "track" ends on the track's own ending, bars taken out or played again
   * before it; "bar" plays from the start and stops on the bar line nearest
   * the length (the item's fade-out then ends it).
   */
  ending?: "track" | "bar";
  /** The track's length: the end of its last section unless given. */
  duration?: number;
}

export interface FitEdit {
  kind: "repeat" | "remove";
  /** The first bar of the group (an index into structure.bars), and how many bars it has. */
  bar: number;
  count: number;
  /** How many more times a repeated group plays (1: twice in all). 1 for a removal. */
  times: number;
  /** How alike the bars around its joins are, 0 to 1. */
  similarity: number;
}

export interface MusicFit {
  pieces: MusicPiece[];
  /** How long the plan plays. */
  length: number;
  edits: FitEdit[];
  /** Each landmark asked for, and where it lands (seconds into the plan). */
  landmarks: Array<{ section: number; asked: number; at: number }>;
}

/** Group sizes inside a section: even, so phrases stay whole. */
const GROUPS = [2, 4, 6, 8, 12, 16, 24, 32] as const;
/** The most extra times one group plays. */
const MAX_TIMES = 4;
/** The most bars one stretch between landmarks gains or loses. */
const MAX_CHANGE = 160;

type Kind = FitEdit["kind"];

interface Candidate {
  bar: number;
  count: number;
  times: number;
  similarity: number;
  cost: number;
}

/** How alike the bars around an edit of `count` bars from `bar` are (see the module's note). */
export function editSimilarity(features: BarFeatures, bar: number, count: number): number {
  const bars = features.loudness.length;
  const like = (a: number, b: number) =>
    a >= 0 && b >= 0 && a < bars && b < bars ? barSimilarity(features, a, b) : null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const around = [like(bar - 1, bar + count - 1), like(bar, bar + count)].filter(
    (value): value is number => value !== null,
  );
  const group: number[] = [];
  for (let offset = 0; offset < Math.min(count, 8); offset += 1) {
    const value = like(bar + offset, bar + count + offset);
    if (value !== null) group.push(value);
  }
  if (!around.length) return group.length ? mean(group) : 0.5;
  return group.length ? 0.5 * mean(around) + 0.5 * mean(group) : mean(around);
}

/**
 * The cheapest set of edits among bars [first, end) that adds `change` bars
 * (or takes them out, when negative), or null when no such set exists. A
 * dynamic programme over the bars: at each, leave it, or start an edit there.
 */
function solveStretch(
  first: number,
  end: number,
  change: number,
  candidatesAt: (bar: number, kind: Kind) => Candidate[],
): Array<Candidate & { kind: Kind }> | null {
  const need = Math.abs(change);
  if (need === 0) return [];
  if (need > MAX_CHANGE || end <= first) return null;
  const kind: Kind = change > 0 ? "repeat" : "remove";
  const adds = (option: Candidate) =>
    kind === "repeat" ? option.count * option.times : option.count;
  const width = need + 1;
  const span = end - first;
  // best[position * width + left]: the least cost of placing `left` more bars from `position` on.
  const best = new Float64Array((span + 1) * width).fill(Infinity);
  const choice = new Int32Array((span + 1) * width).fill(-1);
  const options = Array.from({ length: span }, (_, position) =>
    candidatesAt(first + position, kind).filter((option) => option.bar + option.count <= end),
  );
  best[span * width] = 0;
  for (let position = span - 1; position >= 0; position -= 1) {
    for (let left = 0; left <= need; left += 1)
      best[position * width + left] = best[(position + 1) * width + left]!;
    options[position]!.forEach((option, index) => {
      const next = position + option.count;
      for (let left = adds(option); left <= need; left += 1) {
        const cost = best[next * width + left - adds(option)]! + option.cost;
        if (cost < best[position * width + left]! - 1e-12) {
          best[position * width + left] = cost;
          choice[position * width + left] = index;
        }
      }
    });
  }
  if (!Number.isFinite(best[need]!)) return null;
  const edits: Array<Candidate & { kind: Kind }> = [];
  for (let position = 0, left = need; position < span && left > 0;) {
    const index = choice[position * width + left]!;
    if (index < 0) {
      position += 1;
      continue;
    }
    const option = options[position]![index]!;
    edits.push({ ...option, kind });
    left -= adds(option);
    position += option.count;
  }
  return edits;
}

/**
 * A plan of a track as bar-aligned pieces that runs `target` seconds (or the
 * nearest whole number of bars to it), with each landmark asked for on its
 * time where it can be. Null when the track has too few bars, or can't be
 * fitted in the pieces an item may play.
 */
export function fitMusicToLength(
  structure: MusicStructure,
  features: BarFeatures,
  target: number,
  options: FitOptions = {},
): MusicFit | null {
  const bars = structure.bars;
  const count = bars.length;
  if (count < 2 || features.loudness.length !== count || !(target > 0)) return null;
  const barLength = barSeconds(structure);
  const duration = options.duration ?? structure.sections.at(-1)?.end ?? bars.at(-1)! + barLength;
  const start = Math.max(0, options.start ?? 0);
  const ending = options.ending ?? "track";
  /** Where a bar starts in the track; bar `count` is where the last whole bar ends. */
  const barTime = (bar: number) => (bar < count ? bars[bar]! : bars.at(-1)! + barLength);
  const first = bars.findIndex((time) => time >= start - 1e-6);
  if (first < 0) return null;

  // Each section's bars, [from, to): its first bar is the first that starts in it.
  const sectionBars = structure.sections.map((section) => {
    const from = bars.findIndex((time) => time >= section.start - 1e-3);
    const to = bars.findIndex((time) => time >= section.end - 1e-3);
    return { from: from < 0 ? count : from, to: to < 0 ? count : to };
  });
  const sectionOf = new Int32Array(count).fill(-1);
  sectionBars.forEach(({ from, to }, index) => {
    for (let bar = from; bar < to; bar += 1) sectionOf[bar] = index;
  });

  // The landmarks, in order, each as the bars it needs gained or lost before it.
  const marks = [...(options.landmarks ?? [])]
    .filter((mark) => (sectionBars[mark.section]?.from ?? count) > first)
    .sort((a, b) => a.section - b.section);
  const stretches: Array<{ from: number; to: number; change: number }> = [];
  const kept: FitLandmark[] = [];
  let from = first;
  let before = 0;
  for (const mark of marks) {
    const bar = sectionBars[mark.section]!.from;
    if (bar >= count || bar <= from) continue;
    const change = Math.round((mark.at - (barTime(bar) - start + before * barLength)) / barLength);
    // A landmark that would have to come before the one ahead of it is left out.
    if (barTime(bar) - barTime(from) + change * barLength <= 0) continue;
    stretches.push({ from, to: bar, change });
    before += change;
    from = bar;
    kept.push(mark);
  }
  const fixed = new Set(kept.map((mark) => sectionBars[mark.section]!.from));
  // After the last landmark: to the track's own ending, or to the bar line nearest the length.
  const naturalEnd = (ending === "track" ? duration : barTime(count)) - start + before * barLength;
  const tailChange = Math.round((target - naturalEnd) / barLength);
  stretches.push({
    from,
    to: count,
    change: ending === "track" ? tailChange : Math.max(0, tailChange),
  });

  const candidatesAt = (bar: number, kind: Kind): Candidate[] => {
    const own = sectionOf[bar]!;
    if (own < 0 || bar <= first) return [];
    const { from: sectionFrom, to: sectionTo } = sectionBars[own]!;
    const found: Candidate[] = [];
    const add = (size: number, whole: boolean) => {
      if (kind === "remove") {
        // A landmark is never left out, nor (to keep its ending) the track's last bar.
        for (let bar2 = bar; bar2 < bar + size; bar2 += 1) if (fixed.has(bar2)) return;
        if (ending === "track" && bar + size >= count) return;
      }
      const similarity = editSimilarity(features, bar, size);
      const phrase = size % 4 === 2 ? 0.05 : 0;
      // On the section's 4-bar grid (from its start, or back from its end) where it can be.
      const aligned =
        whole || (bar - sectionFrom) % 4 === 0 || (sectionTo - bar - size) % 4 === 0 ? 0 : 0.04;
      const join = 0.15 + 1.2 * (1 - similarity);
      for (let times = 1; times <= (kind === "repeat" ? MAX_TIMES : 1); times += 1)
        found.push({ bar, count: size, times, similarity, cost: join * times + phrase + aligned });
    };
    if (bar > sectionFrom) {
      // Inside its section, never its first bar.
      for (const size of GROUPS) if (bar + size <= sectionTo) add(size, false);
    } else {
      // On a section's first bar: whole sections, one or more.
      for (let last = own; last < sectionBars.length; last += 1) {
        const size = sectionBars[last]!.to - bar;
        if (size > 0 && size <= MAX_CHANGE) add(size, true);
      }
    }
    return found;
  };

  // Each stretch solved on its own; one that can't change by as much changes as near it as it can.
  const chosen: Array<Candidate & { kind: Kind }> = [];
  for (const stretch of stretches) {
    let solved = solveStretch(stretch.from, stretch.to, stretch.change, candidatesAt);
    for (let miss = 1; !solved && miss <= Math.abs(stretch.change); miss += 1) {
      const sign = Math.sign(stretch.change);
      solved =
        solveStretch(stretch.from, stretch.to, stretch.change - sign * miss, candidatesAt) ??
        solveStretch(stretch.from, stretch.to, stretch.change + sign * miss, candidatesAt);
    }
    chosen.push(...(solved ?? []));
  }
  chosen.sort((a, b) => a.bar - b.bar);

  // The bars in the order they play: a group left out skipped, a repeated one played on again.
  const removed = new Set<number>();
  for (const edit of chosen)
    if (edit.kind === "remove")
      for (let bar = edit.bar; bar < edit.bar + edit.count; bar += 1) removed.add(bar);
  const played: number[] = [];
  for (let bar = first; bar < count; bar += 1) {
    if (removed.has(bar)) continue;
    played.push(bar);
    for (const edit of chosen) {
      if (edit.kind !== "repeat" || edit.bar + edit.count - 1 !== bar) continue;
      for (let time = 0; time < edit.times; time += 1)
        for (let again = edit.bar; again <= bar; again += 1) played.push(again);
    }
  }
  if (ending === "bar") {
    const wanted = Math.max(1, Math.round((target - (barTime(first) - start)) / barLength));
    played.length = Math.min(played.length, wanted);
  }

  // Pieces: each run of consecutive bars, joined 20 ms ahead of its bar lines.
  const runs: Array<[number, number]> = [];
  for (const bar of played) {
    const run = runs.at(-1);
    if (run && bar === run[1] + 1) run[1] = bar;
    else runs.push([bar, bar]);
  }
  if (!runs.length || runs.length > PIECES.max) return null;
  const splice = (bar: number) => Math.max(0, barTime(bar) - SPLICE_LEAD);
  const pieces: MusicPiece[] = runs.map(([low, high], index) => {
    const pieceFrom = index === 0 ? start : splice(low);
    const ends = index === runs.length - 1 && ending === "track" && high === count - 1;
    const pieceTo = ends ? duration : splice(high + 1);
    return { from: Number(pieceFrom.toFixed(6)), to: Number(pieceTo.toFixed(6)) };
  });
  if (pieces.some((piece) => piece.to - piece.from < PIECES.minSeconds - 1e-9)) return null;

  // Where each landmark landed: its section's first bar, the first time it plays.
  const offsets: number[] = [];
  let length = 0;
  for (const piece of pieces) {
    offsets.push(length);
    length += piece.to - piece.from;
  }
  const landmarks = kept.map((mark) => {
    const bar = sectionBars[mark.section]!.from;
    const index = runs.findIndex(([low, high]) => bar >= low && bar <= high);
    const at = index < 0 ? Number.NaN : offsets[index]! + barTime(bar) - pieces[index]!.from;
    return { section: mark.section, asked: mark.at, at: Number(at.toFixed(6)) };
  });

  return {
    pieces,
    length: Number(length.toFixed(6)),
    edits: chosen.map((edit) => ({
      kind: edit.kind,
      bar: edit.bar,
      count: edit.count,
      times: edit.kind === "repeat" ? edit.times : 1,
      similarity: Number(edit.similarity.toFixed(2)),
    })),
    landmarks,
  };
}
