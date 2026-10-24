/**
 * Music played in pieces: a music item that plays stretches of its track in
 * order (`pieces`, in the track's own seconds) instead of from its trim point
 * on, so it can run a length the track doesn't: bars repeated or left out
 * (src/lib/music/fit plans them on the bars). Shared by the timeline, the
 * preview and the render request; the media worker plays them the same way
 * (media-worker/src/pieces.js).
 *
 * Each join is a splice, which the plan puts just ahead of a bar line so the
 * bar's notes begin in the new piece, under a short equal-power crossfade
 * centred on it: the piece before plays on for half the crossfade and the
 * next starts half of it early, so a join never clicks and every piece still
 * plays from where the plan puts it. A piece that starts too near the
 * beginning of its track to start early has its crossfade a little later
 * instead, still the same length.
 *
 * A piece can instead come in on its bar line (`enter`, how far past its
 * start the bar line is): the piece before fades out over the crossfade
 * ending on that bar line, and this one comes in over the last 3 ms of it,
 * so it is whole on the bar. That is for a piece that comes in out of quiet
 * onto a bar its track is already playing: a crossfade centred ahead of the
 * bar plays the last 35 ms of the bar before it, so it arrives that early
 * (Reel 2's statements, each on a track's bass hit, were 35 to 40 ms early).
 *
 * This module has no imports from the timeline, which builds on it.
 */
import { z } from "zod";

export const PIECES = {
  /** The most pieces one item plays. */
  max: 64,
  /**
   * The shortest piece: shorter than any bar the studio's beat tracking
   * finds (three beats at its fastest, 200 BPM, are 0.9 s), and long enough
   * that two joins' crossfades never meet.
   */
  minSeconds: 0.5,
  /** Each join's crossfade. */
  crossfade: 0.03,
  /** How long a piece coming in on its bar line takes to come in. */
  entry: 0.003,
} as const;

export const pieceSchema = z
  .object({
    from: z.number().finite().min(0).max(86_400),
    to: z.number().finite().min(0).max(86_400),
    /**
     * It comes in on its bar line, this many seconds past its start, rather
     * than under a crossfade centred on its join (see the module's note).
     */
    enter: z.number().finite().min(PIECES.entry).max(PIECES.crossfade).optional(),
  })
  .refine(
    (piece) => piece.to - piece.from >= PIECES.minSeconds - 1e-9,
    `A piece of music must play at least ${PIECES.minSeconds} s`,
  );
export const piecesSchema = z.array(pieceSchema).min(1).max(PIECES.max);
export type MusicPiece = z.infer<typeof pieceSchema>;

/** The pieces an item plays: only music plays in pieces. */
export function musicPieces(item: {
  role: string;
  pieces?: MusicPiece[] | undefined;
}): MusicPiece[] | null {
  return item.role === "music" && item.pieces?.length ? item.pieces : null;
}

/** How long pieces play end to end (the joins' crossfades take no time). */
export function piecesLength(pieces: readonly MusicPiece[]): number {
  return pieces.reduce((sum, piece) => sum + (piece.to - piece.from), 0);
}

/**
 * Pieces with their head trimmed by `seconds` of playing (an item's start
 * dragged later), or grown by it when negative (dragged earlier: the first
 * piece reaches back into its track, never before the track's start). A piece
 * used up, or with less than the shortest piece left of it, goes, and the
 * trim carries on into the next; what is left plays exactly what it did, and
 * at least the shortest piece always stays. `trimmed` is how much was taken
 * (negative: given), for the item's start to move by, so the rest stays where
 * it was.
 */
export function trimPiecesHead(
  pieces: readonly MusicPiece[],
  seconds: number,
): { pieces: MusicPiece[]; trimmed: number } {
  const first = pieces[0];
  if (!first || !Number.isFinite(seconds) || seconds === 0)
    return { pieces: [...pieces], trimmed: 0 };
  if (seconds < 0) {
    const grown = Math.min(-seconds, first.from);
    return {
      pieces: [{ from: first.from - grown, to: first.to }, ...pieces.slice(1)],
      trimmed: -grown,
    };
  }
  const out = pieces.map((piece) => ({ ...piece }));
  let left = Math.max(0, Math.min(seconds, piecesLength(pieces) - PIECES.minSeconds));
  let trimmed = 0;
  while (left > 1e-9) {
    const head = out[0]!;
    const length = head.to - head.from;
    if (out.length > 1 && length - left < PIECES.minSeconds) {
      out.shift();
      trimmed += length;
      left = Math.max(0, left - length);
    } else {
      const cut = Math.min(left, length - PIECES.minSeconds);
      out[0] = { from: head.from + cut, to: head.to };
      trimmed += cut;
      left = 0;
    }
  }
  return { pieces: out, trimmed };
}

/**
 * How long the edit now runs from an item's start, when its music was fitted
 * to the edit and the edit has changed length since (more than a hundredth of
 * a second: a fit is to its frames); null while the fit still holds, or when
 * it wasn't fitted to the edit.
 */
export function fitOutOfDate(
  item: {
    role: string;
    start: number;
    pieces?: MusicPiece[] | undefined;
    fittedTo?: number | undefined;
  },
  total: number,
): number | null {
  if (!musicPieces(item) || item.fittedTo === undefined) return null;
  const room = Math.max(0, total - item.start);
  return Math.abs(room - item.fittedTo) > 0.01 ? room : null;
}

/** Where each piece starts, in seconds from the start of the item's playing. */
export function pieceOffsets(pieces: readonly MusicPiece[]): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const piece of pieces) {
    offsets.push(at);
    at += piece.to - piece.from;
  }
  return offsets;
}

/**
 * Each join's crossfade, in seconds from the start of the item's playing:
 * join k is between piece k and piece k + 1, at `at` (where piece k + 1
 * starts), and its crossfade runs over [start, start + crossfade). `lead` is
 * how far before the join it starts: half the crossfade, or for a piece that
 * comes in on its bar line, what leaves it ending there; less when piece
 * k + 1 starts nearer the beginning of its track than that. `enter` is where
 * such a piece's bar line is, after the join.
 */
export function pieceJoins(
  pieces: readonly MusicPiece[],
): Array<{ at: number; start: number; lead: number; enter?: number }> {
  const offsets = pieceOffsets(pieces);
  const half = PIECES.crossfade / 2;
  return pieces.slice(1).map((piece, index) => {
    const wanted = piece.enter === undefined ? half : PIECES.crossfade - piece.enter;
    const lead = Math.min(wanted, piece.from);
    const at = offsets[index + 1]!;
    return {
      at,
      start: at - lead,
      lead,
      ...(piece.enter === undefined ? {} : { enter: piece.enter }),
    };
  });
}

/**
 * What sounds `elapsed` seconds into an item's pieces: one piece, or two
 * during a join's crossfade (the piece before playing on past its end, the
 * next started early), each with the track time it is at and its gain
 * (equal power: the two gains' squares add to 1). Empty past the last piece.
 */
export function piecesSounding(
  pieces: readonly MusicPiece[],
  elapsed: number,
): Array<{ index: number; source: number; gain: number }> {
  if (!pieces.length || elapsed < 0 || elapsed >= piecesLength(pieces)) return [];
  const offsets = pieceOffsets(pieces);
  const joins = pieceJoins(pieces);
  const fade = PIECES.crossfade;
  for (const [index, join] of joins.entries()) {
    if (elapsed >= join.start && elapsed < join.start + fade) {
      const progress = (elapsed - join.start) / fade;
      const before = pieces[index]!;
      const after = pieces[index + 1]!;
      // A piece coming in on its bar line is silent until just before it, and whole on it.
      const entering =
        join.enter === undefined
          ? Math.sin((progress * Math.PI) / 2)
          : Math.max(
              0,
              Math.min(1, (elapsed - (join.at + join.enter - PIECES.entry)) / PIECES.entry),
            );
      return [
        {
          index,
          source: before.to + (elapsed - join.at),
          gain: Math.cos((progress * Math.PI) / 2),
        },
        {
          index: index + 1,
          source: after.from + (elapsed - join.at),
          gain: entering,
        },
      ];
    }
  }
  let index = 0;
  while (index + 1 < pieces.length && elapsed >= offsets[index + 1]!) index += 1;
  // Just before a join whose crossfade starts late, the piece before is still alone.
  return [{ index, source: pieces[index]!.from + (elapsed - offsets[index]!), gain: 1 }];
}

/**
 * How each piece is cut from its track to be joined, as the media worker
 * cuts it: what of the track it plays (from where its crossfade in starts to
 * where its crossfade out ends) and, at each join, the two crossfades'
 * stretches of track.
 */
export function pieceCuts(pieces: readonly MusicPiece[]): Array<{ from: number; to: number }> {
  const joins = pieceJoins(pieces);
  const fade = PIECES.crossfade;
  return pieces.map((piece, index) => {
    const into = index > 0 ? joins[index - 1]! : null;
    const outOf = index < joins.length ? joins[index]! : null;
    return {
      from: into ? piece.from - into.lead : piece.from,
      to: outOf ? piece.to + (fade - outOf.lead) : piece.to,
    };
  });
}

/**
 * Track times where an item's pieces play them, in seconds from the start of
 * its playing, in order; a time in two pieces is placed twice.
 */
export function piecesPlacing(pieces: readonly MusicPiece[], times: readonly number[]): number[] {
  const offsets = pieceOffsets(pieces);
  const placed: number[] = [];
  pieces.forEach((piece, index) => {
    for (const time of times)
      if (time >= piece.from - 1e-9 && time < piece.to - 1e-9)
        placed.push(offsets[index]! + time - piece.from);
  });
  return placed.sort((a, b) => a - b);
}
