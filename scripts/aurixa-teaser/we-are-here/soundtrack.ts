// We Are Here: the soundtrack, As One's, mixed again by the studio's own mixer with the music dipped under the voice,
// and measured by the studio's own mix report.
//
//   bun scripts/aurixa-teaser/we-are-here/soundtrack.ts <work files dir>
//
// The client asked (27 October 2026) for the soundtrack to dip under the voiceover with the studio's volume mixing, so
// that every word is heard, as the reels' soundtracks are mixed (scripts/aurixa-reel-3/soundtrack.ts). As One's mix
// (scripts/aurixa-teaser/as-one/sound.py) ducked nothing, as its reference did not. Its two stems are laid out here as a
// studio edit's audio, in the timeline schema the Editor saves (src/lib/edit/timeline.ts): the voice (the brand voice's
// one take, cut into its eleven sentences and placed on the film's clock) on the Voiceover channel, and the music
// (National Treasures from its first sample, at the reference's gains and fade) on Music & FX, in items that split it
// where it sits differently under the voice, each with its volume and how far it ducks under speech. The app's
// buildRenderRequest turns that into the media worker's parameters, and the worker's own code
// (media-worker/src/sequence.js) mixes it as a studio render does: the voice listened to for speech (silencedetect),
// the music ducked under it on the worker's attack and release, the buses summed at their faders, loudness measured on
// the mix and met in one linear pass (-14 LUFS, true peak -1.5 dB). The same pass taps the voice and music buses, and
// media-worker/src/mixreport.js measures the voice's margin over the music in the speech band, section by section: the
// report a studio render keeps, which flags a margin under 8 dB (src/lib/edit/mix-report.ts). As One's own balance is
// measured the same way, for the record.
//
// Nothing moves: the voice keeps every word where As One placed it (cues.json), so the picture and the words on screen
// stay on it, and the music still runs from its first sample. Writes <work>/sound-we-are-here/soundtrack.wav (24-bit,
// 48 kHz stereo, 45.5 s), the stems and the mix beside it, and docs/brands/aurixa-teaser/we-are-here/soundtrack.json.
//
// The fifth version adds the film's sound design (sfx.py, run first: sound-we-are-here/sfx.wav) as a sound effect on
// the Music & FX channel, the role the Editor gives one (role "sfx"): it never ducks, each sound's level being set in
// sfx.py where it falls against the voice, and the item sets the whole. The studio's mix report weighs the voice
// against the music alone, so the voice's margin over the music and the sound design together is measured here too,
// with the report's own band and arithmetic (bandMargins), sentence by sentence.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderRequest, timelineSchema } from "../../../src/lib/edit/timeline";
// @ts-expect-error: the media worker is plain JavaScript
import {
  measureBands,
  mixArgs,
  parseLoudness,
  planSequence,
  speechRegions,
} from "../../../media-worker/src/sequence.js";
// @ts-expect-error: the media worker is plain JavaScript
import { bandMargins, mixReport, readBand } from "../../../media-worker/src/mixreport.js";

const work = process.argv[2];
if (!work)
  throw new Error("Usage: bun scripts/aurixa-teaser/we-are-here/soundtrack.ts <work files dir>");
const AS_ONE = join(resolve(work), "sound-as-one");
const OUT = join(resolve(work), "sound-we-are-here");
mkdirSync(OUT, { recursive: true });
const DOCS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/brands/aurixa-teaser/we-are-here",
);
type Line = { key: string; text: string; sound: [number, number]; words: { start: number }[] };
const CUES = JSON.parse(readFileSync(join(AS_ONE, "cues.json"), "utf8")) as {
  length: number;
  drop: number;
  lines: Line[];
};
const LIBRARY = {
  // The brand voice's take of the whole script (sound-as-one/vo/takes.json), 42.789 s: stems/voice.wav is it cut into
  // its sentences and placed on the film's clock (as-one/sound.py).
  voiceover: "e2a6be68-4f01-43c1-987e-06e4a5de7f9d",
  // Drake – National Treasures (Instrumental).mp3, the reels' (272.25 s): stems/music.wav is its first 45.5 s at the
  // reference's gains and fade.
  music: "221832d4-8d43-4302-b7a4-9fb517e80c5f",
  // Stands in for the picture (film.sh draws it): the mix never reads it. Reel 2's style frame 01, a library image.
  still: "00477de9-a68e-4625-af9c-31f293c41aeb",
  // The sound design (sfx.py) is the work's own file, not a library asset: this id stands in for it, as the still does
  // for the picture, and FILES hands the mixer its path.
  sfx: "5644308b-e45b-477d-886f-8bd562374fb8",
};
const FILES: Record<string, string> = {
  [LIBRARY.voiceover]: join(AS_ONE, "stems", "voice.wav"),
  [LIBRARY.music]: join(AS_ONE, "stems", "music.wav"),
  [LIBRARY.sfx]: join(OUT, "sfx.wav"),
};
const END = CUES.length;
const DROP = CUES.drop; // the drop's first hit, bar 0 of the track
const line = (key: string) => {
  const found = CUES.lines.find((l) => l.key === key);
  if (!found) throw new Error(`cues.json has no line ${key}`);
  return found;
};
const LEAD = 0.02; // an edit point just ahead of a bar's notes, as the reels split the track
const XF = 0.03; // the reels' crossfade at a join
// The drop's first hit sounds free of the voice, as As One placed it (the sentence after it starts 0.3 s later); it
// then settles under the voice over DIP seconds, ending as the first word begins.
const DIP = 0.15;
const S6 = line("s6").sound[0];
// The fifth version's breath before the reveal: as "the system." ends the music falls back 8 dB (0.4) over BREATH
// seconds, so that "Aurixa" and its hit come out of a held breath, and it is whole again on the hit. The fall starts
// as the line ends, so no word is under it.
const BREATH = 0.2;
const S9_END = line("s9").sound[1];
const AURIXA = line("s10").words[0]!.start;

// How each stretch of the music sits under the voice: [label, from, to, volume, duck level (null: never ducks), the
// crossfade into the next]. The music plays at As One's own level where the voice is silent (volume 1: the stem is
// already at the reference's balance), and dips under the voice to the margin the reels' approved mixes keep in the
// speech band, about 12.5 dB (Reel 3's sections 10 to 20, most 13 to 15; the studio flags under 8). As One's voice
// stood 5 dB over the music in the intro and 6 dB in the groove, so the intro dips 7.5 dB (0.42) and the groove 6.5 dB
// (0.47): the reels' own levels (the intro 0.6 ducking to 0.25, the groove 0.5 to 0.22, on the raw track) would leave
// the music 21 to 25 dB under this voice. The voice speaks from the first second to the last, its sentences closer
// than the worker's 1.2 s, so the music stays dipped under all of it and does not pump between them; only the drop's
// first hit is left undipped, at the level that keeps it about 2.3 dB over the line after it, as As One had it (at its
// full level it stood 6 dB over the dipped line, and the music seemed to fall away after it), and the last bar's hit
// rings out after the last word. Before "Aurixa" the music takes its breath (BREATH).
type Section = [string, number, number, number, number | null, number];
const SECTIONS: Section[] = [
  ["The intro and its silent bar, under the first five lines", 0, DROP - LEAD, 1, 0.42, XF],
  ["The drop's first hit, before the voice comes back", DROP - LEAD, S6 - DIP / 2, 0.65, null, DIP],
  [
    "The groove, under 'More valuable' to 'the system'",
    S6 - DIP / 2,
    S9_END + BREATH / 2,
    1,
    0.47,
    BREATH,
  ],
  ["The breath before the reveal", S9_END + BREATH / 2, AURIXA - LEAD, 0.4, 0.47, XF],
  [
    "The reveal, under 'Aurixa Systems' and 'A new operating standard is coming'",
    AURIXA - LEAD,
    END,
    1,
    0.47,
    0,
  ],
];

function musicItems(sections: Section[], ducks: boolean) {
  return sections.map(([label, from, to, volume, duck], i) => {
    const first = i === 0;
    const last = i === sections.length - 1;
    const into = first ? 0 : sections[i - 1]![5];
    const out = last ? 0 : sections[i]![5];
    const start = first ? from : from - into / 2;
    const end = last ? to : to + out / 2;
    return {
      id: `music-${i + 1}`,
      assetId: LIBRARY.music,
      role: "music" as const,
      start: Number(start.toFixed(6)),
      // the stem is on the film's clock: an item plays it from where it starts
      trimStart: Number(start.toFixed(6)),
      duration: Number((end - start).toFixed(6)),
      volume: ducks ? volume : 1,
      fadeIn: into,
      fadeOut: out,
      loop: false,
      duck: ducks && duck !== null,
      duckLevel: duck ?? 1,
      label,
    };
  });
}

// The sound design's level in the mix (-4 dB), found by measuring: the drop's hit peaks 1.3 dB over the music's own and
// stands 2.9 LU over As One's drop (momentary loudness), and "one" 2.3 LU over it, while the voice stays at least 10 dB
// over the music and the sound design together in every sentence but "More valuable...", which the music alone holds
// to 9.9 dB (9.8 with the sound design).
const SFX_VOLUME = 0.63;

function timelineOf(sections: Section[], ducks: boolean, sfx: boolean) {
  return timelineSchema.parse({
    aspectRatio: "9:16",
    resolution: "1080p",
    fps: 24,
    clips: [
      {
        id: "picture",
        assetId: LIBRARY.still,
        kind: "image",
        duration: END,
        label: "The picture (film.sh)",
      },
    ],
    audio: [
      {
        id: "voiceover",
        assetId: LIBRARY.voiceover,
        role: "voiceover" as const,
        start: 0,
        trimStart: 0,
        duration: END,
        volume: 1,
        duck: false,
        label: "The voice: the brand voice's take in its eleven sentences, as As One placed them",
      },
      ...musicItems(sections, ducks),
      ...(sfx
        ? [
            {
              id: "sfx",
              assetId: LIBRARY.sfx,
              role: "sfx" as const,
              start: 0,
              trimStart: 0,
              duration: END,
              volume: SFX_VOLUME,
              duck: false,
              label: "The sound design (sfx.py): the film's moments, on its clock",
            },
          ]
        : []),
    ],
    normalizeLoudness: true,
    mix: { picture: { level: 1, muted: true }, voiceover: { level: 1 }, audio: { level: 1 } },
  });
}

const ffmpeg = (args: string[]) => {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.slice(-2000)}`);
  return run.stderr;
};

/** The studio's mixer on a timeline: the plan, where the voice speaks, the mix and its bands, in `dir`. */
async function mixOf(timeline: ReturnType<typeof timelineOf>, dir: string) {
  mkdirSync(dir, { recursive: true });
  const { sources, params } = buildRenderRequest(timeline, { channelMix: true });
  const located = sources.map((s: { assetId: string; role: string }) => ({
    ...s,
    path: FILES[s.assetId] ?? null,
  }));
  const plan = planSequence(params, located);
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
  // Where the voice speaks, as the worker finds it, for the music to duck under.
  const speech: [number, number][] = [];
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
      speech.push([item.start + from, Math.min(plan.total, item.start + to)]);
  }
  const mix = join(dir, "mix.wav");
  const sfx = plan.audio.some((item: { role: string }) => item.role === "sfx");
  const taps = {
    stems: {
      voiceover: join(dir, "stem-voice.wav"),
      music: join(dir, "stem-music.wav"),
      ...(sfx ? { sfx: join(dir, "stem-sfx.wav") } : {}),
    },
    bands: {
      voiceover: join(dir, "band-voice.wav"),
      music: join(dir, "band-music.wav"),
      ...(sfx ? { sfx: join(dir, "band-sfx.wav") } : {}),
    },
  };
  ffmpeg(
    mixArgs(
      plan,
      [silent],
      plan.audio.map((item: { source: number }) => located[item.source].path),
      mix,
      speech,
      taps,
    ),
  );
  const margins = await measureBands(plan, taps.bands, speech);
  return { plan, speech, mix, taps, margins: margins ?? [] };
}

/**
 * The voice's margin over the music and the sound design together, in each of `sections`: the mix report's measure
 * (its speech band, where the voice speaks), with the two buses' bands summed sample by sample.
 */
async function marginOverAll(
  taps: { bands: Record<string, string> },
  speech: [number, number][],
  sections: { index: number; from: number; to: number }[],
) {
  const [voice, music, sfx] = await Promise.all(
    ["voiceover", "music", "sfx"].map((role) => readBand(taps.bands[role]!)),
  );
  if (!voice || !music || !sfx) throw new Error("A band of the mix is missing");
  const beds = new Float64Array(Math.min(music.samples.length, sfx.samples.length));
  for (let i = 0; i < beds.length; i += 1) beds[i] = music.samples[i] + sfx.samples[i];
  return bandMargins({
    voice: voice.samples,
    music: beds,
    rate: voice.rate,
    channels: voice.channels,
    speech,
    sections,
  });
}

// ------------------------------------------------------------------ As One's own balance, measured for the record
const before = await mixOf(timelineOf(SECTIONS, false, false), join(OUT, "as-one"));
const beforeReport = mixReport({ margins: before.margins, master: null, mixed: null });

// ------------------------------------------------------------------ the music dipped under the voice
const timeline = timelineOf(SECTIONS, true, true);
const { plan, speech, mix, taps, margins } = await mixOf(timeline, OUT);
// The voice over the music and the sound design together: in each of the music's sections, and in each sentence.
const sentences = CUES.lines.map((l, i) => ({ index: i + 1, from: l.sound[0], to: l.sound[1] }));
const overAll = {
  sections: await marginOverAll(taps, speech, margins),
  sentences: (await marginOverAll(taps, speech, sentences)).map((m: { index: number }) => ({
    line: CUES.lines[m.index - 1]!.text,
    ...m,
  })),
};
// Loudness, measured on the finished mix and met in one linear pass (the worker's passes 3 and 4).
const loudnorm = `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11`;
const mixed = parseLoudness(
  ffmpeg(["-i", mix, "-af", `${loudnorm}:print_format=json`, "-f", "null", "-"]),
);
if (!mixed) throw new Error("The mix could not be measured");
const out = join(OUT, "soundtrack.wav");
ffmpeg([
  "-i",
  mix,
  "-af",
  `${loudnorm}:measured_I=${mixed.input_i}:measured_TP=${mixed.input_tp}:measured_LRA=${mixed.input_lra}:` +
    `measured_thresh=${mixed.input_thresh}:offset=${mixed.target_offset}:linear=true,` +
    // In its linear mode loudnorm stamps what it puts out 66.7 ms late, so -t would cut the master short of the film
    // (Reel 3's soundtrack.ts measured it; the samples stay in step with the mix): they are stamped from their count.
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
const report = mixReport({ margins, master, mixed });

const round3 = (x: number) => Number(x.toFixed(3));
const record = {
  written: "2026-10-28",
  note:
    "We Are Here's soundtrack: As One's two stems (scripts/aurixa-teaser/as-one/sound.py) as a studio edit's audio " +
    "(src/lib/edit/timeline.ts), the music dipped under the voice and mixed by the media worker's code " +
    "(media-worker/src/sequence.js), measured by its mix report (media-worker/src/mixreport.js). The voice keeps " +
    "every word where As One placed it (sound-as-one/cues.json); the music runs from its first sample.",
  stems: {
    voice: { file: "sound-as-one/stems/voice.wav", asset: LIBRARY.voiceover },
    music: { file: "sound-as-one/stems/music.wav", asset: LIBRARY.music },
    sfx: { file: "sound-we-are-here/sfx.wav", stands_in: LIBRARY.sfx, made_by: "sfx.py" },
  },
  timeline: {
    audio: timeline.audio,
    mix: timeline.mix,
    normalizeLoudness: timeline.normalizeLoudness,
  },
  plan: { total: plan.total, loudness: plan.loudness, mix: plan.mix },
  speech: speech.map(([a, b]) => [round3(a), round3(b)]),
  mix_report: report,
  with_sound_design: {
    note:
      "The voice's margin over the music and the sound design together (the mix report weighs the music alone): " +
      "the report's speech band and arithmetic, the two buses' bands summed.",
    sections: overAll.sections,
    sentences: overAll.sentences,
  },
  as_one: {
    note: "As One's own balance (nothing ducked, every item at its full level), measured the same way.",
    margin_db: beforeReport.margin_db,
    sections: beforeReport.sections,
  },
};
writeFileSync(join(DOCS, "soundtrack.json"), `${JSON.stringify(record, null, 1)}\n`);
console.log(
  `${plan.audio.length} items; mixed at ${mixed.input_i} LUFS, mastered to ${plan.loudness} LUFS; ${out}`,
);
const show = (
  title: string,
  sections: {
    index: number;
    from: number;
    to: number;
    speech_seconds: number;
    voice_db: number | null;
    music_db: number | null;
    margin_db: number | null;
  }[],
) => {
  console.log(title);
  for (const s of sections)
    console.log(
      `  ${String(SECTIONS[s.index - 1]?.[0] ?? s.index).padEnd(78)} ${s.from.toFixed(2).padStart(6)} to ` +
        `${s.to.toFixed(2).padStart(6)}  speech ${String(s.speech_seconds).padStart(5)} s  voice ${s.voice_db} dB, ` +
        `music ${s.music_db} dB, margin ${s.margin_db} dB`,
    );
};
show("As One, as it was:", beforeReport.sections);
show("Dipped under the voice:", report.sections);
show("Over the music and the sound design together:", overAll.sections);
for (const s of overAll.sentences)
  console.log(
    `  ${s.line.slice(0, 60).padEnd(60)} ${s.from.toFixed(2).padStart(6)} to ${s.to.toFixed(2).padStart(6)}  ` +
      `voice ${s.voice_db} dB, beds ${s.music_db} dB, margin ${s.margin_db} dB`,
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
