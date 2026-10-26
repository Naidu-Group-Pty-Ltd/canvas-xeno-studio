// Reel 3: the soundtrack, mixed by the studio's own mixer, with the studio's own mix report.
//
//   python3 -I scripts/aurixa-reel-3/pacing.py --voiceover <voiceover, 16-bit 44.1 kHz WAV> <dir>/voiceover-paced.wav
//   python3 -I scripts/aurixa-reel-3/music.py <Drake – National Treasures (Instrumental).mp3> <dir>
//   bun scripts/aurixa-reel-3/soundtrack.ts <dir>
//
// Reel 2's route (scripts/aurixa-reel-2/soundtrack.ts), on Reel 3's cut: the sound is laid out as a studio edit's
// audio, in the timeline schema the Editor saves (src/lib/edit/timeline.ts): the voiceover held open in its silences
// on its own channel, National Treasures in items on Music & FX, each with its gain, its fades and how far it ducks
// under speech. The app's buildRenderRequest turns that into the media worker's parameters, and the worker's own code
// (media-worker/src/sequence.js) mixes it as a studio render does: the music ducked under speech, the buses summed
// at their faders, loudness measured on the mix and met in one linear pass (-14 LUFS, true peak -1.5 dB, inside
// the plan's -1 dBTP). The same mix pass taps the voice and music buses (busTaps), and media-worker/src/mixreport.js
// measures the voice's margin over the music in the speech band, section by section: the report a studio render
// keeps.
//
// The music is National Treasures at its own tempo, cut on its own bar lines as pacing.py lays it out; music.py's
// record says how each piece comes in (on its bar line, or under the join's crossfade) and how each stretch of the
// film sits under the voice. The items split it where it sits differently under the voice.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderRequest, timelineSchema } from "../../src/lib/edit/timeline";
// @ts-expect-error: the media worker is plain JavaScript
import {
  measureBands,
  mixArgs,
  parseLoudness,
  planSequence,
  speechRegions,
} from "../../media-worker/src/sequence.js";
// @ts-expect-error: the media worker is plain JavaScript
import { mixReport } from "../../media-worker/src/mixreport.js";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: bun scripts/aurixa-reel-3/soundtrack.ts <dir>");
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../docs/brands/aurixa-reel-3");
const PACING = JSON.parse(readFileSync(join(DOCS, "pacing.json"), "utf8"));
// National Treasures as music.py fits it to the cut: its asset, its pieces, how each stretch sits under the voice.
const RECORD_FILE = "music-national-treasures.json";
const RECORD = JSON.parse(readFileSync(join(DOCS, RECORD_FILE), "utf8"));
const LIBRARY = {
  voiceover: "ed75f95d-89c6-40b6-a3c7-6d620fd2d88a", // the client's voiceover, 129.567 s
  music: RECORD.asset as string, // Drake – National Treasures (Instrumental).mp3, 272.25 s (Reel 1's)
  // Stands in for the picture (render.cjs draws it): the mix never reads it. Reel 2's style frame 01, a library image.
  still: "00477de9-a68e-4625-af9c-31f293c41aeb",
};
const END: number = PACING.end;
const MUSIC = RECORD;
const XF: number = MUSIC.crossfade;
const LEAD: number = MUSIC.splice_lead;
const ENTRY: number = MUSIC.entry_lead ?? 0;
const BARS = MUSIC.bars;
const bar = (b: number) => MUSIC.first_downbeat + 4 * b * MUSIC.period; // the film's bar b, on the track's own beat
const join_ = (b: number) => bar(b) - LEAD; // an edit point: just ahead of the bar's notes

// Where each film moment comes from in the file: the piece that plays it (pacing.json's music.pieces). A moment on a
// join belongs to the piece that starts there: the pieces' times are rounded to the microsecond, so the one before
// can seem to run on past it.
const fileAt = (film: number) => {
  const piece = [...MUSIC.pieces]
    .reverse()
    .find((p: { film_at: number }) => p.film_at <= film + 1e-5);
  if (!piece) throw new Error(`No piece of the track plays the film's ${film} s`);
  return piece.file_from + (film - piece.film_at);
};

type Section = [string, number, number, number, number | null];
// The record gives its sections in the film's bars (from 0 and to the end as null).
type RecordSection = {
  label: string;
  from_bar: number;
  to_bar: number | null;
  volume: number;
  duck: number | null;
};
const sections: Section[] = (RECORD.sections as RecordSection[]).map((s) => [
  s.label,
  s.from_bar === 0 ? 0 : join_(s.from_bar),
  s.to_bar === null ? END : join_(s.to_bar),
  s.volume,
  s.duck,
]);
if (Math.abs(sections[1]![1] - (BARS.drop - LEAD)) > 1e-6)
  throw new Error("The drop is not where pacing.json puts it");
if (Math.abs(sections.at(-1)![1] - (BARS.reentry - LEAD)) > 1e-6)
  throw new Error("The return is not where pacing.json puts it");
// An item plays its file straight on from its trim, so a section the edit jumps through is laid as one item a
// piece: each from its own place in the file, at the section's level, crossfaded into the next as every join is.
// A section can run across the track's jumps (music.py), so it is laid as one item for each piece it plays.
const pieceStarts = (MUSIC.pieces as { film_at: number }[]).map((p) => p.film_at);
// A piece that comes in out of quiet onto a bar its track reaches already sounding enters on its bar line, led in by
// ENTRY and faded in over it (music.py): a crossfade ahead of the bar would sound the bar before it.
const entersOnItsBar = (film: number) =>
  (MUSIC.pieces as { film_at: number; entry?: string }[]).some(
    (p) => p.entry === "bar" && Math.abs(p.film_at - film) < 1e-4,
  );
const parts: Section[] = sections.flatMap(([label, from, to, volume, duck]) => {
  const cuts = pieceStarts.filter((t) => t > from + 1e-4 && t < to - 1e-4);
  const edges = [from, ...cuts, to];
  return edges
    .slice(0, -1)
    .map((a, i): Section => [
      cuts.length ? `${label} (${i + 1} of ${edges.length - 1})` : label,
      a,
      edges[i + 1]!,
      volume,
      duck,
    ]);
});

const audio = [
  {
    id: "voiceover",
    assetId: LIBRARY.voiceover,
    role: "voiceover" as const,
    start: 0,
    trimStart: 0,
    duration: END,
    volume: 1,
    duck: false,
    label: "The voiceover, held open in its silences (pacing.py)",
  },
  ...parts.map(([label, from, to, volume, duck], i) => {
    const first = i === 0;
    const last = i === parts.length - 1;
    const onItsBar = !first && entersOnItsBar(from);
    const start = first ? from : onItsBar ? from + LEAD - ENTRY : from - XF / 2;
    const end = last ? to : to + XF / 2;
    return {
      id: `music-${i + 1}`,
      assetId: LIBRARY.music,
      role: "music" as const,
      start: Number(start.toFixed(6)),
      trimStart: Number(fileAt(from).toFixed(6)) - (from - start),
      duration: Number((end - start).toFixed(6)),
      volume,
      fadeIn: first ? 0 : onItsBar ? ENTRY : XF,
      // The last item rings out: its own decay for a second after the stop, then a fade to the film's last frame.
      fadeOut: last ? Number((END - (BARS.final + 1.0)).toFixed(3)) : XF,
      loop: false,
      duck: duck !== null,
      duckLevel: duck ?? 1,
      label,
    };
  }),
];
for (const item of audio) item.trimStart = Number(item.trimStart.toFixed(6));

const timeline = timelineSchema.parse({
  aspectRatio: "9:16",
  resolution: "1080p",
  fps: 30,
  clips: [
    {
      id: "picture",
      assetId: LIBRARY.still,
      kind: "image",
      duration: END,
      label: "The picture (render.cjs)",
    },
  ],
  audio,
  normalizeLoudness: true,
  mix: { picture: { level: 1, muted: true }, voiceover: { level: 1 }, audio: { level: 1 } },
});

// ------------------------------------------------------------------ the studio's mixer
const { sources, params } = buildRenderRequest(timeline, { channelMix: true });
const files: Record<string, string> = {
  [LIBRARY.voiceover]: join(dir, "voiceover-paced.wav"),
  [LIBRARY.music]: join(dir, "music.wav"),
};
const located = sources.map((s: { assetId: string; role: string }) => ({
  ...s,
  path: files[s.assetId] ?? null,
}));
const plan = planSequence(params, located);

const ffmpeg = (args: string[]) => {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.slice(-2000)}`);
  return run.stderr;
};
const silent = join(dir, "picture-silent.wav");
ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "anullsrc=r=48000:cl=stereo",
  "-t",
  plan.total.toFixed(6),
  "-c:a",
  "pcm_f32le",
  silent,
]);
// Where the voiceover speaks, as the worker finds it, for the music to duck under.
const voiceActivity: [number, number][] = [];
for (const item of plan.audio) {
  if (item.role !== "voiceover" || item.volume === 0) continue;
  const stderr = ffmpeg([
    "-ss",
    item.trimStart.toFixed(6),
    "-t",
    item.length.toFixed(6),
    "-i",
    located[item.source].path,
    "-af",
    "silencedetect=n=-38dB:d=0.35",
    "-f",
    "null",
    "-",
  ]);
  for (const [from, to] of speechRegions(stderr, item.length))
    voiceActivity.push([item.start + from, Math.min(plan.total, item.start + to)]);
}
const mix = join(dir, "mix.wav");
const taps = {
  stems: { voiceover: join(dir, "stem-voice.wav"), music: join(dir, "stem-music.wav") },
  bands: { voiceover: join(dir, "band-voice.wav"), music: join(dir, "band-music.wav") },
};
ffmpeg(
  mixArgs(
    plan,
    [silent],
    plan.audio.map((item: { source: number }) => located[item.source].path),
    mix,
    voiceActivity,
    taps,
  ),
);
// Loudness, measured on the finished mix and met in one linear pass (the worker's passes 3 and 4).
const loudnorm = `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11`;
const mixed = parseLoudness(
  ffmpeg(["-i", mix, "-af", `${loudnorm}:print_format=json`, "-f", "null", "-"]),
);
if (!mixed) throw new Error("The mix could not be measured");
const out = join(dir, "soundtrack.wav");
ffmpeg([
  "-i",
  mix,
  "-af",
  `${loudnorm}:measured_I=${mixed.input_i}:measured_TP=${mixed.input_tp}:measured_LRA=${mixed.input_lra}:` +
    `measured_thresh=${mixed.input_thresh}:offset=${mixed.target_offset}:linear=true,` +
    // In its linear mode loudnorm stamps what it puts out 66.7 ms late, so -t would cut the master 3,200 samples
    // short of the film (measured; the samples themselves stay in step with the mix): they are stamped again from
    // their count. A studio render is muxed into MP4, which keeps them all.
    "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB",
  "-c:a",
  "pcm_s24le",
  "-ar",
  "48000",
  "-t",
  plan.total.toFixed(6),
  out,
]);
const master = parseLoudness(
  ffmpeg(["-i", out, "-af", `${loudnorm}:print_format=json`, "-f", "null", "-"]),
);
const margins = await measureBands(plan, taps.bands, voiceActivity);
const report = mixReport({ margins: margins ?? [], master, mixed });

const record = {
  written: "2026-10-24",
  note: `Reel 3's soundtrack as a studio edit's audio (src/lib/edit/timeline.ts), mixed by the media worker's code (media-worker/src/sequence.js), measured by its mix report (media-worker/src/mixreport.js). The voiceover item is the client's recording held open in its silences by pacing.py, prepared as one track; the music items play ${RECORD.note}`,
  music: {
    record: `docs/brands/aurixa-reel-3/${RECORD_FILE}`,
    asset: RECORD.asset,
    file: RECORD.file,
  },
  timeline: {
    audio: timeline.audio,
    mix: timeline.mix,
    normalizeLoudness: timeline.normalizeLoudness,
  },
  plan: { total: plan.total, loudness: plan.loudness, mix: plan.mix },
  speech: voiceActivity.map(([a, b]) => [Number(a.toFixed(3)), Number(b.toFixed(3))]),
  mix_report: report,
};
writeFileSync(join(DOCS, "soundtrack.json"), `${JSON.stringify(record, null, 1)}\n`);
console.log(
  `${plan.audio.length} items; mixed at ${mixed.input_i} LUFS, mastered to ${plan.loudness} LUFS; ${out}`,
);
for (const s of report.sections)
  console.log(
    `  ${String(parts[s.index - 1]?.[0] ?? s.index).padEnd(60)} ${s.from.toFixed(2).padStart(7)} to ${s.to
      .toFixed(2)
      .padStart(
        7,
      )}  speech ${String(s.speech_seconds).padStart(5)} s  voice ${s.voice_db} dB, music ${s.music_db} dB, margin ${s.margin_db} dB`,
  );
console.log(
  "  margin",
  JSON.stringify(report.margin_db),
  "loudness",
  JSON.stringify(report.loudness),
);
console.log(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
    {
      encoding: "utf8",
    },
  ).trim(),
  "s",
);
