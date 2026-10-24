// Reel 2: the soundtrack, mixed by the studio's own mixer, with the studio's own mix report.
//
//   python3 -I scripts/aurixa-reel-2/pacing.py --voiceover <voiceover, 16-bit 44.1 kHz WAV> <dir>/voiceover-paced.wav
//   ffmpeg -i <take-seed-33.mp3> -ar 48000 -ac 2 -c:a pcm_f32le <dir>/music.wav
//   bun scripts/aurixa-reel-2/soundtrack.ts <dir>
//
// Reel 1's route (scripts/aurixa-reel-1/soundtrack.ts): the sound is laid out as a studio edit's audio, in the
// timeline schema the Editor saves (src/lib/edit/timeline.ts): the voiceover held open in its silences on its own
// channel, the score in items on Music & FX, each with its gain, its fades and how far it ducks under speech. The
// app's buildRenderRequest turns that into the media worker's parameters, and the worker's own code
// (media-worker/src/sequence.js) mixes it as a studio render does: the music ducked under speech, the buses summed
// at their faders, loudness measured on the mix and met in one linear pass (-14 LUFS, true peak -1.5 dB, inside
// the plan's -1 dBTP). The same mix pass taps the voice and music buses (busTaps), and media-worker/src/mixreport.js
// measures the voice's margin over the music in the speech band, section by section: the report a studio render
// keeps.
//
// The score is take 33 as pacing.json edits it: as made to bar 50, four stabs (the take's own ending, one a bar),
// then from bar 54 to the stop on bar 58 and its ring. The items split it where it sits differently under the voice.
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
if (!dir) throw new Error("Usage: bun scripts/aurixa-reel-2/soundtrack.ts <dir>");
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../docs/brands/aurixa-reel-2");
const PACING = JSON.parse(readFileSync(join(DOCS, "pacing.json"), "utf8"));
const LIBRARY = {
  voiceover: "fa540b53-8dd2-4312-97ec-bce2a5a48230", // the client's voiceover, 99.971 s
  music: "011c69cb-a255-45c1-a869-8f919decd179", // Aurixa Reel 2 score, seed 33 (Eleven Music v2.5), 119.04 s
  still: "00477de9-a68e-4625-af9c-31f293c41aeb", // style frame 01: stands in for the picture (render.cjs)
};
const END: number = PACING.end;
const MUSIC = PACING.music;
const XF: number = MUSIC.crossfade;
const LEAD: number = MUSIC.splice_lead;
const BARS = MUSIC.bars;
const bar = (b: number) => MUSIC.first_downbeat + 4 * b * MUSIC.period; // the film's bar b: the take's, unedited
const join_ = (b: number) => bar(b) - LEAD; // an edit point: just ahead of the bar's notes

// Where each film moment comes from in the file: the piece that plays it (pacing.json's music.pieces). A moment on a
// join belongs to the piece that starts there: the pieces' times are rounded to the microsecond, so the one before
// can seem to run on past it.
const fileAt = (film: number) => {
  const piece = [...MUSIC.pieces]
    .reverse()
    .find((p: { film_at: number }) => p.film_at <= film + 1e-5);
  if (!piece) throw new Error(`No piece of the score plays the film's ${film} s`);
  return piece.file_from + (film - piece.film_at);
};

// [label, film from, film to, volume, duck level (null: never ducks)]. The take's intro carries its plucks in the
// voice's own band, so it sits lower and ducks further; the drops and grooves are loud and duck well under speech;
// the breakdown is never ducked (it is the room around "The result?") and so sits low; each stab is never ducked,
// so it hits with its word, and its ring is the bed between the statements; the return ducks under the closing
// card's lines and is free for the stop, which rings out.
type Section = [string, number, number, number, number | null];
const stabs = BARS.statements as number[];
const hit = (MUSIC.pieces as { why: string; file_from: number; file_to: number }[]).find((p) =>
  p.why.endsWith("its hit"),
)!;
const HIT = hit.file_to - hit.file_from - LEAD; // how long a stab's hit plays after its bar line
// Each stab as loud as it can be while its hit leaves the voice 8 dB clear in the speech band (the studio's
// LOW_MARGIN_DB): the client says the last "your decision." softest of all, so its stab is the quietest, falling
// away into the full return.
const STAB_LEVELS = [0.18, 0.18, 0.18, 0.11];
const sections: Section[] = [
  ["The intro and the stall", 0, join_(11), 0.55, 0.2],
  ["The drop, the build, the second drop and the groove", join_(11), join_(37), 0.5, 0.22],
  ["The breakdown", join_(37), join_(39), 0.2, null],
  ["The groove returns", join_(39), join_(50), 0.5, 0.17],
  ...stabs.flatMap((t, i): Section[] => [
    [`Stab ${i + 1}`, t - LEAD, t + HIT, STAB_LEVELS[i]!, null],
    [`Stab ${i + 1}, its ring`, t + HIT, t - LEAD + 4 * MUSIC.period, STAB_LEVELS[i]!, null],
  ]),
  ["The full return, the stop and the ring", join_(54), END, 0.6, 0.22],
];
if (Math.abs(sections[1]![1] - (BARS.drop - LEAD)) > 1e-6)
  throw new Error("The drop is not where pacing.json puts it");
if (Math.abs(sections.at(-1)![1] - (BARS.reentry - LEAD)) > 1e-6)
  throw new Error("The return is not where pacing.json puts it");

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
  ...sections.map(([label, from, to, volume, duck], i) => {
    const first = i === 0;
    const last = i === sections.length - 1;
    const start = first ? from : from - XF / 2;
    const end = last ? to : to + XF / 2;
    return {
      id: `music-${i + 1}`,
      assetId: LIBRARY.music,
      role: "music" as const,
      start: Number(start.toFixed(6)),
      trimStart: Number(fileAt(from).toFixed(6)) - (from - start),
      duration: Number((end - start).toFixed(6)),
      volume,
      fadeIn: first ? 0 : XF,
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
  note: "Reel 2's soundtrack as a studio edit's audio (src/lib/edit/timeline.ts), mixed by the media worker's code (media-worker/src/sequence.js), measured by its mix report (media-worker/src/mixreport.js). The voiceover item is the client's recording held open in its silences by pacing.py, prepared as one track; the music items play take 33 of the score as pacing.json edits it.",
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
    `  ${String(sections[s.index - 1]?.[0] ?? s.index).padEnd(52)} ${s.from.toFixed(2).padStart(7)} to ${s.to
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
