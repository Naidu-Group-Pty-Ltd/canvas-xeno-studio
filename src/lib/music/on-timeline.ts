/**
 * Where a track's beats, bars and sections fall on an edit's timeline,
 * through the music item that plays it. As the render and the preview play
 * it: from its trim point (a loop then repeats the whole track from its
 * start), or piece by piece when it is edited on its bars.
 */
import { musicPieces } from "@/lib/edit/pieces";
import { audioLoops, audioPlayLength, type TimelineAudio } from "@/lib/edit/timeline";
import type { MusicStructure, SectionKind } from "./structure";

/** A stretch of the track and where it plays: the track's [from, to) from `at` on the timeline. */
export interface AudioSpan {
  from: number;
  to: number;
  at: number;
}

/** A section of the track as it plays on the timeline (a section heard twice is there twice). */
export interface TimelineSection {
  start: number;
  end: number;
  kind: SectionKind;
  energy: number;
  /** Which of the track's sections it is. */
  index: number;
}

/** The stretches of its track an audio item plays, in order, within a picture of `total` seconds. */
export function audioSpans(item: TimelineAudio, total: number): AudioSpan[] {
  const plays = audioPlayLength(item, total);
  if (plays <= 0) return [];
  const pieces = musicPieces(item);
  if (pieces) {
    const spans: AudioSpan[] = [];
    let at = 0;
    for (const piece of pieces) {
      if (at >= plays - 1e-9) break;
      const length = Math.min(piece.to - piece.from, plays - at);
      spans.push({ from: piece.from, to: piece.from + length, at: item.start + at });
      at += piece.to - piece.from;
    }
    return spans;
  }
  const length = item.sourceDuration ?? null;
  if (!audioLoops(item) || !length)
    return [{ from: item.trimStart, to: item.trimStart + plays, at: item.start }];
  // The first pass plays from the trim point to the end of the track, each later one all of it.
  const firstPass = Math.max(0.01, length - item.trimStart);
  const spans: AudioSpan[] = [
    { from: item.trimStart, to: item.trimStart + Math.min(firstPass, plays), at: item.start },
  ];
  for (let offset = firstPass; offset < plays - 1e-9; offset += length)
    spans.push({ from: 0, to: Math.min(length, plays - offset), at: item.start + offset });
  return spans;
}

/** Times on the track where they play on the timeline, in order; a time heard twice is there twice. */
export function timesOnTimeline(spans: AudioSpan[], times: number[]): number[] {
  const sorted = [...times].sort((a, b) => a - b);
  const placed: number[] = [];
  for (const span of spans) {
    // The first time in the span, found by halving.
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle]! < span.from - 1e-6) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < sorted.length && sorted[index]! <= span.to + 1e-6; index += 1)
      placed.push(Number((span.at + sorted[index]! - span.from).toFixed(3)));
  }
  return [...new Set(placed)].sort((a, b) => a - b);
}

/**
 * The track's sections as they play on the timeline. A section carried on
 * across a join (bars of it repeated, say) stays one section.
 */
export function sectionsOnTimeline(
  spans: AudioSpan[],
  sections: MusicStructure["sections"],
): TimelineSection[] {
  const placed: TimelineSection[] = [];
  for (const span of spans) {
    sections.forEach((section, index) => {
      const from = Math.max(section.start, span.from);
      const to = Math.min(section.end, span.to);
      if (to - from < 1e-6) return;
      const start = Number((span.at + from - span.from).toFixed(3));
      const end = Number((span.at + to - span.from).toFixed(3));
      const last = placed.at(-1);
      if (last && last.index === index && Math.abs(last.end - start) < 0.002) last.end = end;
      else placed.push({ start, end, kind: section.kind, energy: section.energy, index });
    });
  }
  return placed;
}

/** A track's beats, downbeats and sections where an item plays them on the timeline. */
export function musicGridOnTimeline(
  item: TimelineAudio,
  structure: MusicStructure,
  total: number,
): { beats: number[]; downbeats: number[]; sections: TimelineSection[] } {
  const spans = audioSpans(item, total);
  return {
    beats: timesOnTimeline(spans, structure.beats),
    downbeats: timesOnTimeline(spans, structure.downbeats),
    sections: sectionsOnTimeline(spans, structure.sections),
  };
}
