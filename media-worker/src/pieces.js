import { TaskError } from "./net.js";

/**
 * Music played in pieces (feature music_pieces): a music track that plays
 * stretches of its file in order (`pieces: [{ from, to }]`, in the file's own
 * seconds) instead of from its trim point on, so it can run a length its file
 * doesn't: bars played again or left out, each join a splice the app puts
 * just ahead of a bar line. The app's src/lib/edit/pieces.ts plans and
 * previews them by the same rules.
 *
 * Every join is a 30 ms equal-power crossfade centred on it: the piece before
 * plays on for half of it and the next starts half of it early, so a join
 * never clicks and every piece plays from where the plan puts it (a piece
 * that starts within 15 ms of its file's start has its crossfade that much
 * later). A piece can come in on its bar line instead (`enter`, how far past
 * its start the bar line is): the piece before fades out over the 30 ms
 * ending on that bar line, and this one comes in over the last 3 ms of it,
 * whole on the bar, so a piece cut out of quiet onto a bar its track is
 * already loud in doesn't arrive 35 ms early (Reel 2's statements, each on a
 * bass hit, did). The file is decoded once, from its start (as the browser measured
 * its bars), and cut on its decoded samples, so no seek can land a piece off
 * its beat. Each piece is cut into the part it plays alone and its two
 * crossfades, and the parts are joined in order by concat, which takes its
 * inputs one after another however the file's decoding reaches them (a
 * repeat plays an earlier part of the file after a later one). Only numbers
 * reach the graph.
 */

export const PIECES_LIMIT = 64;
/** Shorter than any bar the app finds (three beats at 200 BPM are 0.9 s), and long enough that two crossfades never meet. */
export const MIN_PIECE_SECONDS = 0.5;
export const PIECE_CROSSFADE = 0.03;
/** How long a piece coming in on its bar line takes to come in. */
export const PIECE_ENTRY = 0.003;
/** How far past its file's end (as this worker measures it) a piece may run: decoders differ on a file's last frames. */
const PAST_END = 0.5;

const seconds = (value) => value.toFixed(6);

function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

/** The pieces an audio track plays, validated, or null when it has none. Only music plays in pieces. */
export function planPieces(raw, role, what) {
  if (raw === undefined || raw === null) return null;
  if (role !== "music") throw bad(`${what}: only music can play in pieces`);
  if (!Array.isArray(raw) || raw.length < 1) throw bad(`${what} pieces must be a list of at least one piece`);
  if (raw.length > PIECES_LIMIT) throw bad(`${what} may play at most ${PIECES_LIMIT} pieces`);
  return raw.map((entry, index) => {
    const piece = entry && typeof entry === "object" ? entry : {};
    const name = `${what} piece ${index + 1}`;
    const bound = (value, key) => {
      const parsed = Number(value);
      if (value === undefined || value === null || value === "" || !Number.isFinite(parsed)) throw bad(`${name} ${key} must be a number`);
      if (parsed < 0 || parsed > 86_400) throw bad(`${name} ${key} must be between 0 and 86400`);
      return parsed;
    };
    const from = bound(piece.from, "from");
    const to = bound(piece.to, "to");
    if (to - from < MIN_PIECE_SECONDS - 1e-9) throw bad(`${name} must play at least ${MIN_PIECE_SECONDS} s`);
    if (piece.enter === undefined || piece.enter === null) return { from, to };
    const enter = Number(piece.enter);
    if (!Number.isFinite(enter) || enter < PIECE_ENTRY - 1e-9 || enter > PIECE_CROSSFADE + 1e-9) {
      throw bad(`${name} enter (where its bar line is, past its start) must be between ${PIECE_ENTRY} and ${PIECE_CROSSFADE} s`);
    }
    // The first piece has no join to come in by.
    return index === 0 ? { from, to } : { from, to, enter };
  });
}

/** How long pieces play end to end (their crossfades take no time). */
export function piecesLength(pieces) {
  return pieces.reduce((sum, piece) => sum + (piece.to - piece.from), 0);
}

/**
 * How far before each join its crossfade starts: half of it, or for a piece
 * coming in on its bar line, what ends it on that bar line; less for a piece
 * that starts nearer its file's start.
 */
function leads(pieces) {
  return pieces.map((piece, index) => {
    if (index === 0) return 0;
    const wanted = piece.enter === undefined ? PIECE_CROSSFADE / 2 : PIECE_CROSSFADE - piece.enter;
    return Math.min(wanted, piece.from);
  });
}

/**
 * Each piece's parts, in the order they play: what it plays alone, then (but
 * after the last) the crossfade into the next, as [from, to) of the file. A
 * join into a piece that comes in on its bar line says where, in its `in`
 * stretch, that piece comes in (`enters`: from there, over PIECE_ENTRY).
 */
export function pieceParts(pieces) {
  const lead = leads(pieces);
  const parts = [];
  pieces.forEach((piece, index) => {
    const alone = {
      from: index === 0 ? piece.from : piece.from - lead[index] + PIECE_CROSSFADE,
      to: index === pieces.length - 1 ? piece.to : piece.to - lead[index + 1],
    };
    parts.push({ kind: "alone", ...alone });
    if (index < pieces.length - 1) {
      const next = pieces[index + 1];
      const into = lead[index + 1];
      parts.push({
        kind: "join",
        out: { from: piece.to - into, to: piece.to - into + PIECE_CROSSFADE },
        in: { from: next.from - into, to: next.from - into + PIECE_CROSSFADE },
        ...(next.enter === undefined ? {} : { enters: into + next.enter - PIECE_ENTRY }),
      });
    }
  });
  return parts;
}

/** How much of its file a track in pieces reads, from the start: to the end of the last part it plays. */
export function piecesReadEnd(pieces) {
  let end = 0;
  for (const part of pieceParts(pieces)) end = Math.max(end, part.kind === "alone" ? part.to : Math.max(part.out.to, part.in.to));
  return end + 0.05;
}

/** A planned track in pieces (see planSequence), its plan taking the pieces' place: no trim, no loop, as long as they play. */
export function withPieces(item, raw, what) {
  const pieces = planPieces(raw, item.role, what);
  if (!pieces) return item;
  const length = Math.min(item.length, piecesLength(pieces));
  return {
    ...item,
    trimStart: 0,
    loop: false,
    length,
    fadeIn: Math.min(item.fadeIn, length / 2),
    fadeOut: Math.min(item.fadeOut, length / 2),
    pieces,
  };
}

/** The input options that read a track in pieces: from its start, no further than its pieces reach. */
export function piecesInput(item) {
  return ["-t", seconds(piecesReadEnd(item.pieces))];
}

/**
 * A track in pieces checked against its file once it has been measured
 * (`duration`, in seconds, or null when unknown): every piece inside it.
 */
export function piecesInside(item, duration, what = "A music track") {
  if (duration === null || duration === undefined) return item;
  item.pieces.forEach((piece, index) => {
    if (piece.from >= duration || piece.to > duration + PAST_END) {
      throw bad(`${what}'s piece ${index + 1} (${seconds(piece.from)} to ${seconds(piece.to)} s) runs past the end of its recording, which is ${seconds(duration)} s long`);
    }
  });
  return item;
}

/**
 * The graph lines that play a track's pieces in order from input `input`,
 * added to `lines`; returns the head of the track's own chain, which goes on
 * from there (its gain, fades, delay and ducking) as any track's does.
 */
export function piecesChain(lines, input, item, index) {
  const tag = `pc${index}`;
  const prepared = `[${input}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`;
  // A stretch of the file, exactly that long: padded with silence where the file runs out first.
  const cut = (range) => `atrim=start=${seconds(range.from)}:end=${seconds(range.to)},asetpts=PTS-STARTPTS,apad,atrim=end=${seconds(range.to - range.from)}`;
  const parts = pieceParts(item.pieces);
  if (parts.length === 1) {
    lines.push(`${prepared},${cut(parts[0])}[${tag}]`);
    return `[${tag}]asetpts=PTS-STARTPTS`;
  }
  const branches = parts.reduce((sum, part) => sum + (part.kind === "alone" ? 1 : 2), 0);
  lines.push(`${prepared},asplit=${branches}${Array.from({ length: branches }, (_, branch) => `[${tag}b${branch}]`).join("")}`);
  let branch = 0;
  const joined = [];
  parts.forEach((part, number) => {
    const label = `${tag}p${number}`;
    if (part.kind === "alone") {
      lines.push(`[${tag}b${branch++}]${cut(part)}[${label}]`);
    } else {
      // The piece before fades out as the next fades in, a quarter sine each (equal power), summed;
      // a piece coming in on its bar line is silent until just before it, whole on it.
      const fadeIn =
        part.enters === undefined
          ? `afade=t=in:st=0:d=${seconds(PIECE_CROSSFADE)}:curve=qsin`
          : `afade=t=in:st=${seconds(part.enters)}:d=${seconds(PIECE_ENTRY)}`;
      lines.push(`[${tag}b${branch++}]${cut(part.out)},afade=t=out:st=0:d=${seconds(PIECE_CROSSFADE)}:curve=qsin[${label}o]`);
      lines.push(`[${tag}b${branch++}]${cut(part.in)},${fadeIn}[${label}i]`);
      lines.push(`[${label}o][${label}i]amerge=inputs=2,pan=stereo|c0=c0+c2|c1=c1+c3[${label}]`);
    }
    joined.push(`[${label}]`);
  });
  lines.push(`${joined.join("")}concat=n=${joined.length}:v=0:a=1[${tag}]`);
  return `[${tag}]asetpts=PTS-STARTPTS`;
}
