// Reel 3: the music at the cuts, measured on the music bus as mixed (soundtrack.ts's stem-music.wav) the way the
// studio's quality pass measures a render (media-worker/src/quality.js: attackEnvelope, attackAt): every cut on one
// of the track's beats (within half a frame, or with the beat in its first two frames), and every anchor pacing.json
// names (the drops, the breakdown, the stop, the build, the biggest section, the statements, the return, the closing
// hit), each with the music's attack there, from its beat. An attack more than the studio's musicAttackMs from its
// beat is flagged; a beat with no clear attack (the music running on through it, a held chord) is said to be
// unclear, not judged.
//
//   bun scripts/aurixa-reel-3/music_at_cuts.ts <dir>     (the dir soundtrack.ts mixed in)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: the media worker is plain JavaScript
import { THRESHOLDS, attackAt, attackEnvelope } from "../../media-worker/src/quality.js";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: bun scripts/aurixa-reel-3/music_at_cuts.ts <dir>");
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../docs/brands/aurixa-reel-3");
const BRIEF = JSON.parse(readFileSync(join(DOCS, "brief.json"), "utf8"));
const PACING = JSON.parse(readFileSync(join(DOCS, "pacing.json"), "utf8"));
const MUSIC = PACING.music;
const FPS: number = PACING.fps;
const END: number = PACING.end;
const RATE = 16_000;

const decoded = spawnSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    join(dir, "stem-music.wav"),
    "-ac",
    "1",
    "-ar",
    String(RATE),
    "-f",
    "f32le",
    "-",
  ],
  { maxBuffer: 1 << 28 },
);
if (decoded.status !== 0) throw new Error(`ffmpeg failed: ${decoded.stderr}`);
const buffer = decoded.stdout as Buffer;
const samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
const envelope = attackEnvelope(samples, RATE);

const beats: number[] = [];
for (let t = MUSIC.first_downbeat; t < END; t += MUSIC.period) beats.push(t);
const r3 = (v: number) => Number(v.toFixed(3));
// A cut is on a beat as the studio pairs them (quality.js cutsOnBeats: the beat within half a frame of it), or as
// pacing.py places one (its _beat_cost: the beat's attack in the cut's first or second frame), which half a frame
// misses: the cuts onto the second drop, the breakdown, the stop and the biggest section sit a frame ahead of their
// bar lines.
const near = 0.5 / FPS + 0.002;
const pairing = (beat: number, time: number) => {
  if (Math.abs(beat - time) <= near) return "half_frame";
  const frame = Math.floor(beat * FPS);
  return [frame - 1, frame].includes(Math.round(time * FPS)) ? "first_frames" : null;
};

// Where the music itself is joined: each piece's start (pacing.json), on the bar line it is cut ahead of.
const joins = (MUSIC.pieces as { film_at: number }[])
  .slice(1)
  .map((p) => p.film_at + MUSIC.splice_lead);
const cuts = (BRIEF.shots as { id: string; in: number }[]).slice(1).map(({ id, in: time }) => {
  const beat = beats.find((b) => pairing(b, time)) ?? null;
  // A picture cut where the music is joined, or over the track running on unedited (its own feel, not the edit's).
  const music = joins.some((j) => pairing(j, time)) ? "join" : "running";
  if (beat === null) return { shot: id, time: r3(time), music, status: "off_the_beat" };
  const found = attackAt(envelope, beat);
  return {
    shot: id,
    time: r3(time),
    music,
    beat: r3(beat),
    paired: pairing(beat, time),
    ...found,
    ...(found.status === "measured"
      ? { from_cut_ms: Number((found.offset_ms + (beat - time) * 1000).toFixed(1)) }
      : {}),
  };
});
const anchors = Object.entries(MUSIC.bars as Record<string, number | number[]>).flatMap(
  ([name, at]) =>
    (Array.isArray(at)
      ? at.map((t, i) => [`${name} ${i + 1}`, t] as const)
      : [[name, at] as const]
    ).map(([label, t]) => ({ anchor: label, time: r3(t), ...attackAt(envelope, t) })),
);
const limit: number = THRESHOLDS.musicAttackMs;
type Measured = { status: string; offset_ms?: number; music?: string };
const worstOf = (list: Measured[]) =>
  list.reduce((w, c) => (c.status === "measured" ? Math.max(w, Math.abs(c.offset_ms!)) : w), 0);
// The studio's rule, over every cut on a beat; and the edit's own: the anchors and the cuts where the music is joined.
const worst = worstOf([...cuts, ...anchors] as Measured[]);
const worstEdit = worstOf([
  ...anchors,
  ...(cuts as Measured[]).filter((c) => c.music === "join"),
] as Measured[]);
const record = {
  written: "2026-10-24",
  note:
    "The music's attack at each cut on a beat and at each anchor, on the music bus as mixed (soundtrack.ts), " +
    "measured as the studio's quality pass measures a render (media-worker/src/quality.js). offset_ms is from the " +
    "beat (negative: early); a beat the music runs on through, with no clear attack, is 'unclear'. A cut is paired " +
    "with its beat as the studio pairs them ('half_frame') or as pacing.py places them ('first_frames': the beat's " +
    "attack in the cut's first or second frame).",
  limit_ms: limit,
  worst_ms: worst,
  verdict: worst <= limit ? "pass" : "flag",
  worst_at_joins_and_anchors_ms: worstEdit,
  verdict_at_joins_and_anchors: worstEdit <= limit ? "pass" : "flag",
  anchors,
  cuts,
};
writeFileSync(join(DOCS, "music-at-cuts.json"), `${JSON.stringify(record, null, 1)}\n`);
for (const a of anchors)
  console.log(
    `  ${a.anchor.padEnd(14)} ${a.time.toFixed(3).padStart(8)}  ${a.status}${"offset_ms" in a ? ` ${a.offset_ms} ms (rise ${a.rise_db} dB)` : "rise_db" in a ? ` (rise ${a.rise_db} dB)` : ""}`,
  );
for (const c of cuts)
  console.log(
    `  cut ${c.shot.padEnd(6)} ${c.time.toFixed(3).padStart(8)}  ${c.music.padEnd(7)} ${(("paired" in c && c.paired) || "").padEnd(12)} ${c.status}${"offset_ms" in c ? ` ${c.offset_ms} ms from its beat, ${c.from_cut_ms} ms from the cut (rise ${c.rise_db} dB)` : "rise_db" in c ? ` (rise ${c.rise_db} dB)` : ""}`,
  );
console.log(
  `worst ${worst} ms against ${limit} ms: ${record.verdict}; at the joins and anchors ${worstEdit} ms: ${record.verdict_at_joins_and_anchors}`,
);
