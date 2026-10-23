// Reel 1, third cut: the soundtrack, mixed by the studio's own mixer.
//
//   python3 scripts/aurixa-reel-1/pacing.py --voiceover <master voiceover.wav> <dir>/voiceover-paced.wav
//   ffmpeg -i <National Treasures.mp3> -ar 48000 -ac 2 -c:a pcm_f32le <dir>/music.wav
//   npx tsx scripts/aurixa-reel-1/soundtrack.ts <dir>
//
// The client asked (22 October 2026) for National Treasures under the whole film, with the Editor's channel
// mixing used for proper sound control throughout. So the sound is laid out as a studio edit's audio, in the
// timeline schema the Editor saves (src/lib/edit/timeline.ts): the voiceover on its own channel, the music in
// seven items on Music & FX, each with its gain, its fades and how far it ducks under speech, and the faders
// of the Editor's mixer. The app's own buildRenderRequest turns that into the media worker's parameters, and
// the media worker's own code (media-worker/src/sequence.js) mixes it exactly as a studio render does: the
// voiceover listened to for speech (silencedetect), the music ducked under it on the worker's attack and
// release, the buses summed at their faders, then loudness measured on the mix and normalised in one linear
// pass to the studio's target (-14 LUFS, true peak -1.5 dB).
//
// Two things differ from a render in the app, and both are forced: the voiceover is held open in its silences
// (pacing.py), which as separate items would take 52 of the timeline's 16 audio items, so it goes in as one
// prepared track made from the master asset; and the picture is drawn by render.cjs, so the edit's one clip
// is a silent still that stands in for it.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderRequest, timelineSchema } from "../../src/lib/edit/timeline";
// @ts-expect-error: the media worker is plain JavaScript
import {
  mixArgs,
  parseLoudness,
  planSequence,
  speechRegions,
} from "../../media-worker/src/sequence.js";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: npx tsx scripts/aurixa-reel-1/soundtrack.ts <dir>");
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../docs/brands/aurixa-reel-1");
const PACING = JSON.parse(readFileSync(join(DOCS, "system-edition/pacing.json"), "utf8"));
const LIBRARY = {
  voiceover: "84c0abf7-60d1-4439-84fd-e7038feffc01", // the master voiceover, 106.031 s
  music: "221832d4-8d43-4302-b7a4-9fb517e80c5f", // Drake – National Treasures (Instrumental).mp3, 272.25 s
  still: "426f83e5-ef3e-4495-ad71-5aa23921b576", // PL-15A, the closing card: stands in for the picture
};
const END: number = PACING.end;
const { period, drop_in_file: DROP } = PACING.music;
const XF = 0.03; // every join between two music items: a 30 ms crossfade centred on it

// ------------------------------------------------------------------ the music, in items
// The file's beat k (0 is the drop) and the film's: the edit (pacing.py) plays the file in four pieces, each a
// whole number of bars later or earlier in the film than in the file.
const attack = (k: number) => DROP + k * period;
const lead = PACING.music.splice_lead as number;
const at = (k: number) => attack(k) - lead; // an edit point: just ahead of the bar's notes
const filmDrop = PACING.music.film_drop as number;
const offsetOf = (fileBeat: number) => {
  // The film's offset over the file, for the piece that plays the file's beat `fileBeat`.
  for (const piece of PACING.music.pieces) {
    const from = piece.file_from;
    const to = piece.file_to ?? Infinity;
    if (attack(fileBeat) >= from - 1e-9 && attack(fileBeat) < to) return piece.film_at - from;
  }
  throw new Error(`No piece plays the file's beat ${fileBeat}`);
};
const film = (fileBeat: number) => at(fileBeat) + offsetOf(fileBeat);

// [label, file from, film from, film to, volume, duck level (null: never ducks)]. Each item is split where the
// music changes how it should sit under the voice: the intro (its piano is in the voice's own band, so it sits
// lower and ducks further), the groove (loud, ducked well under speech), the breakdown (a steady low bed under the
// four statements, never ducked, so it does not pump between them), the re-entry to the end (ducked, then free
// for the last downbeat, which rings out over the closing card's last second). Measured in the speech band
// (300 Hz to 4 kHz), the voice stands 10 to 19 dB over the music in every section.
type Piece = [string, number, number, number, number, number | null];
const pieces: Piece[] = [
  ["The intro", 0, 0, PACING.music.pieces[1].film_at, 0.6, 0.25],
  [
    "The intro's last four bars, again",
    at(-32),
    PACING.music.pieces[1].film_at,
    film(0),
    0.6,
    0.25,
  ],
  [
    "The drop and the groove, to the end of bar 36",
    at(0),
    film(0),
    PACING.music.pieces[2].film_at,
    0.5,
    0.22,
  ],
  [
    "Bars 33 to 36 again, then on to the breakdown",
    at(132),
    PACING.music.pieces[2].film_at,
    film(160),
    0.5,
    0.22,
  ],
  ["The breakdown", at(160), film(160), PACING.music.pieces[3].film_at, 0.45, null],
  ["The breakdown's last two bars", at(184), PACING.music.pieces[3].film_at, film(192), 0.45, null],
  ["The re-entry, to the last downbeat and its ring", at(192), film(192), END, 0.6, 0.3],
];
if (Math.abs(film(0) - (filmDrop - lead)) > 1e-6)
  throw new Error("The drop is not where pacing.json puts it");

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
  ...pieces.map(([label, fileFrom, from, to, volume, duck], i) => {
    const first = i === 0;
    const last = i === pieces.length - 1;
    const start = first ? from : from - XF / 2;
    const end = last ? to : to + XF / 2;
    return {
      id: `music-${i + 1}`,
      assetId: LIBRARY.music,
      role: "music" as const,
      start: Number(start.toFixed(6)),
      trimStart: Number((fileFrom - (from - start)).toFixed(6)),
      duration: Number((end - start).toFixed(6)),
      volume,
      fadeIn: first ? 0 : XF,
      // The last item rings out: from just after the final downbeat to the film's last frame.
      fadeOut: last ? Number((END - (PACING.music.bars.final + 0.03)).toFixed(3)) : XF,
      loop: false,
      duck: duck !== null,
      duckLevel: duck ?? 1,
      label,
    };
  }),
];

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
// The picture's own sound: none (a still), as long as the film.
const silent = join(dir, "picture-silent.wav");
ffmpeg([
  "-f",
  "lavfi",
  "-i",
  `anullsrc=r=48000:cl=stereo`,
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
ffmpeg(
  mixArgs(
    plan,
    [silent],
    plan.audio.map((item: { source: number }) => located[item.source].path),
    mix,
    voiceActivity,
  ),
);
// Loudness, measured on the finished mix and met in one linear pass (the worker's passes 3 and 4).
const measured = parseLoudness(
  ffmpeg([
    "-i",
    mix,
    "-af",
    `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:print_format=json`,
    "-f",
    "null",
    "-",
  ]),
);
if (!measured) throw new Error("The mix could not be measured");
const out = join(dir, "soundtrack.wav");
ffmpeg([
  "-i",
  mix,
  "-af",
  `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
    `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true,` +
    "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo",
  "-c:a",
  "pcm_s24le",
  "-ar",
  "48000",
  "-t",
  plan.total.toFixed(6),
  out,
]);

// With STEMS=1, the voiceover and music buses on their own as well (before loudness), to measure the balance.
if (process.env.STEMS) {
  for (const [name, keep] of [
    ["voice", "voiceover"],
    ["music", "music"],
  ] as const) {
    const only = planSequence(
      {
        ...params,
        mix: {
          picture: 0,
          voiceover: 0,
          music: 0,
          sfx: 0,
          [keep]: keep === "voiceover" ? params.mix.voiceover : params.mix.music,
        },
      },
      located,
    );
    ffmpeg(
      mixArgs(
        only,
        [silent],
        only.audio.map((item: { source: number }) => located[item.source].path),
        join(dir, `stem-${name}.wav`),
        voiceActivity,
      ),
    );
  }
}

const record = {
  written: "2026-10-22",
  note: "The third cut's soundtrack as a studio edit's audio (src/lib/edit/timeline.ts), mixed by the media worker's code (media-worker/src/sequence.js). The voiceover item is the master asset held open in its silences by pacing.py, prepared as one track.",
  timeline: {
    audio: timeline.audio,
    mix: timeline.mix,
    normalizeLoudness: timeline.normalizeLoudness,
  },
  plan: { total: plan.total, loudness: plan.loudness, mix: plan.mix },
  speech: voiceActivity.map(([a, b]) => [Number(a.toFixed(3)), Number(b.toFixed(3))]),
  measured,
};
writeFileSync(join(DOCS, "system-edition/soundtrack.json"), `${JSON.stringify(record, null, 1)}\n`);
console.log(
  `${plan.audio.length} items; mix ${measured.input_i} LUFS before, ${plan.loudness} LUFS after; ${out}`,
);
console.log(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
    { encoding: "utf8" },
  ).trim(),
  "s",
);
