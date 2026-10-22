import { describe, expect, test } from "bun:test";
import {
  buildRenderRequest,
  parseTimeline,
  stemRolesFor,
  type Timeline,
} from "../../src/lib/edit/timeline";
import {
  LOW_MARGIN_DB,
  mixReportOf,
  mixSummary,
  quietVoiceSections,
  readMixReport,
  renderStems,
  sectionMargin,
} from "../../src/lib/edit/mix-report";
// @ts-expect-error The media worker is plain JavaScript.
import { bandMargins, mixReport } from "../../media-worker/src/mixreport.js";
// @ts-expect-error The media worker is plain JavaScript.
import { busTaps, mixArgs, planSequence, stemRoles } from "../../media-worker/src/sequence.js";
// @ts-expect-error The media worker is plain JavaScript.
import { TASKS } from "../../media-worker/src/tasks.js";

const CLIP = "aaaaaaaa-1111-4111-8111-111111111111";
const VOICE = "bbbbbbbb-1111-4111-8111-111111111111";
const MUSIC = "cccccccc-1111-4111-8111-111111111111";
const EFFECT = "eeeeeeee-1111-4111-8111-111111111111";

function edit(overrides: Record<string, unknown> = {}): Timeline {
  const timeline = parseTimeline({
    clips: [{ id: "c1", assetId: CLIP, kind: "image", duration: 6 }],
    audio: [
      { id: "v1", assetId: VOICE, role: "voiceover" },
      { id: "m1", assetId: MUSIC, role: "music", volume: 0.5 },
    ],
    ...overrides,
  });
  if (!timeline) throw new Error("timeline didn't parse");
  return timeline;
}

/** A tone as interleaved 16-bit stereo samples. */
function tone(amplitude: number, seconds: number, rate = 16000, frequency = 1000): Int16Array {
  const samples = new Int16Array(Math.round(seconds * rate) * 2);
  for (let frame = 0; frame < samples.length / 2; frame += 1) {
    const value = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * frame) / rate));
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  return samples;
}

describe("the voice's margin over the music", () => {
  test("is the gap between their levels where the voice speaks, section by section", () => {
    const voice = tone(8000, 4);
    // The music at a quarter of the voice's level for two seconds, then an eighth.
    const music = new Int16Array(voice.length);
    music.set(tone(2000, 2, 16000, 1500), 0);
    music.set(tone(1000, 2, 16000, 1500), tone(2000, 2).length);
    const sections = bandMargins({
      voice,
      music,
      rate: 16000,
      channels: 2,
      speech: [
        [0.5, 1.5],
        [2.5, 3.5],
      ],
      sections: [
        { index: 1, from: 0, to: 2 },
        { index: 2, from: 2, to: 4 },
      ],
    });
    expect(sections[0]).toMatchObject({ index: 1, from: 0, to: 2, speech_seconds: 1 });
    expect(sections[0].margin_db).toBeCloseTo(12.0, 0);
    expect(sections[1].margin_db).toBeCloseTo(18.1, 0);
    expect(sections[0].voice_db - sections[0].music_db).toBeCloseTo(sections[0].margin_db, 6);
  });

  test("a section the voice doesn't speak in, or with silent music, has no margin", () => {
    const voice = tone(8000, 2);
    const sections = bandMargins({
      voice,
      music: new Int16Array(voice.length),
      rate: 16000,
      channels: 2,
      speech: [[0.2, 0.8]],
      sections: [
        { index: 1, from: 0, to: 1 },
        { index: 2, from: 1, to: 2 },
      ],
    });
    expect(sections[0]).toMatchObject({ speech_seconds: 0.6, music_db: null, margin_db: null });
    expect(sections[1]).toMatchObject({ speech_seconds: 0, voice_db: null, margin_db: null });
  });

  test("the report gives the narrowest and widest margin, and the mix's loudness", () => {
    const report = mixReport({
      margins: [
        {
          index: 1,
          from: 0,
          to: 15,
          speech_seconds: 9,
          voice_db: -20,
          music_db: -33,
          margin_db: 13,
        },
        {
          index: 2,
          from: 15,
          to: 30,
          speech_seconds: 0,
          voice_db: null,
          music_db: -30,
          margin_db: null,
        },
        {
          index: 3,
          from: 30,
          to: 45,
          speech_seconds: 8,
          voice_db: -21,
          music_db: -31.2,
          margin_db: 10.2,
        },
      ],
      master: {
        input_i: -14.07,
        input_lra: 5.12,
        input_tp: -1.53,
        input_thresh: -24,
        target_offset: 0,
      },
      mixed: { input_i: -20.24, input_lra: 5, input_tp: -6, input_thresh: -30, target_offset: 0 },
    });
    expect(report.margin_db).toEqual({ min: 10.2, max: 13 });
    expect(report.loudness).toEqual({
      integrated_lufs: -14.1,
      range_lu: 5.1,
      true_peak_dbtp: -1.5,
    });
    expect(report.mixed_lufs).toBe(-20.2);
    expect(report.band_hz).toEqual([300, 4000]);
  });
});

describe("reading a render's mix report", () => {
  const stored = {
    band_hz: [300, 4000],
    sections: [
      {
        index: 1,
        from: 0,
        to: 14.79,
        speech_seconds: 9.2,
        voice_db: -21.3,
        music_db: -35.1,
        margin_db: 13.8,
      },
      {
        index: 2,
        from: 14.79,
        to: 40,
        speech_seconds: 20,
        voice_db: -21,
        music_db: -27,
        margin_db: 6,
      },
      {
        index: 3,
        from: 40,
        to: 52,
        speech_seconds: 0,
        voice_db: null,
        music_db: -30,
        margin_db: null,
      },
    ],
    margin_db: { min: 6, max: 13.8 },
    loudness: { integrated_lufs: -14.1, range_lu: 5.1, true_peak_dbtp: -1.5 },
    mixed_lufs: -20.2,
  };

  test("as stored, in words a person reads", () => {
    const report = readMixReport(stored)!;
    expect(report.sections[0]).toEqual({
      index: 1,
      from: 0,
      to: 14.79,
      speechSeconds: 9.2,
      voiceDb: -21.3,
      musicDb: -35.1,
      marginDb: 13.8,
    });
    expect(mixSummary(report)).toBe(
      "The voice stands 6.0 to 13.8 dB over the music. -14.1 LUFS, range 5.1 LU, true peak -1.5 dBTP.",
    );
    expect(quietVoiceSections(report).map((section) => section.index)).toEqual([2]);
    expect(LOW_MARGIN_DB).toBeGreaterThan(6);
    expect(report.sections.map(sectionMargin)).toEqual(["+13.8 dB", "+6.0 dB", "no speech"]);
  });

  test("from the render when it is kept there, else from the video's own record", () => {
    expect(mixReportOf({ mix_report: stored }, null)?.margin).toEqual({ min: 6, max: 13.8 });
    expect(mixReportOf(null, { probe: { mix_report: stored } })?.loudness?.integratedLufs).toBe(
      -14.1,
    );
    expect(mixReportOf({ mix_report: null }, { probe: {} })).toBeNull();
    expect(readMixReport({ sections: "no" })).toBeNull();
  });

  test("a rendered video's stems, from its record", () => {
    expect(
      renderStems({
        stems: [{ role: "voiceover", asset_id: VOICE }, { role: "music" }, "nothing"],
      }),
    ).toEqual([{ role: "voiceover", assetId: VOICE }]);
    expect(renderStems(null)).toEqual([]);
  });
});

describe("stems", () => {
  test("are sent only when asked for, one for each bus heard in the edit", () => {
    expect(buildRenderRequest(edit()).params.stems).toBeUndefined();
    const timeline = edit({
      stems: true,
      audio: [
        { id: "v1", assetId: VOICE, role: "voiceover" },
        { id: "m1", assetId: MUSIC, role: "music" },
        { id: "m2", assetId: MUSIC, role: "music", start: 3 },
      ],
    });
    expect(stemRolesFor(timeline)).toEqual(["voiceover", "music"]);
    expect(buildRenderRequest(timeline).params.stems).toEqual(["voiceover", "music"]);
    // A muted channel isn't heard: no stem of it.
    const muted = { ...timeline, mix: { ...timeline.mix, voiceover: { level: 1, muted: true } } };
    expect(buildRenderRequest(muted).params.stems).toEqual(["music"]);
  });

  test("each is one more file the render hands back, after the video and its poster", () => {
    expect(TASKS.render_sequence.outputs({})).toBe(2);
    expect(TASKS.render_sequence.outputs({ stems: ["voiceover", "music", "sfx"] })).toBe(5);
    expect(() => TASKS.render_sequence.outputs({ stems: ["voice"] })).toThrow(/not supported/);
    expect(() => stemRoles(["music", "music"])).toThrow(/once/);
    expect(stemRoles(["sfx", "voiceover"])).toEqual(["sfx", "voiceover"]);
  });

  test("are taken off the buses in the mix pass, with the edit's fades; a bus with nothing on it is silence", () => {
    const plan = planSequence(
      {
        width: 360,
        height: 640,
        fps: 30,
        fade_out: 1,
        clips: [{ source_index: 0, kind: "image", duration: 6 }],
        audio: [
          { source_index: 1, role: "voiceover" },
          { source_index: 2, role: "music", volume: 0.5 },
        ],
        stems: ["voiceover", "music", "sfx"],
      },
      [
        { path: "still.png", role: "image" },
        { path: "voice.wav", role: "audio" },
        { path: "music.wav", role: "audio" },
      ],
    );
    expect(plan.stems).toEqual(["voiceover", "music", "sfx"]);
    const args = mixArgs(plan, ["clip.mkv"], ["voice.wav", "music.wav"], "mix.wav", [], {
      stems: { voiceover: "v.wav", music: "m.wav", sfx: "s.wav" },
      bands: { voiceover: "vb.wav", music: "mb.wav" },
    }) as string[];
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("[voice]asplit=3[voiceovertapmix][voiceovertaps][voiceovertapb]");
    expect(graph).toContain("[musicbed]asplit=3[musictapmix][musictaps][musictapb]");
    expect(graph).toContain("[voiceovertapb]highpass=f=300,highpass=f=300,lowpass=f=4000");
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=end=6.000000[sfxtaps]");
    expect(graph).toContain("[musictaps]afade=t=out:st=5.000000:d=1.000000[musictapstem]");
    // The mix itself sums the buses' own copies.
    expect(graph).toContain("[clips][voiceovertapmix][musictapmix]amix=inputs=3");
    // The mix comes first, then the bands and stems, each with its own format.
    expect(args.indexOf("mix.wav")).toBeLessThan(args.indexOf("vb.wav"));
    expect(args.slice(args.indexOf("mix.wav") + 1)).toEqual([
      "-map",
      "[voiceovertapband]",
      "-c:a",
      "pcm_s16le",
      "-t",
      "6.000000",
      "vb.wav",
      "-map",
      "[voiceovertapstem]",
      "-c:a",
      "pcm_s24le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-t",
      "6.000000",
      "v.wav",
      "-map",
      "[musictapband]",
      "-c:a",
      "pcm_s16le",
      "-t",
      "6.000000",
      "mb.wav",
      "-map",
      "[musictapstem]",
      "-c:a",
      "pcm_s24le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-t",
      "6.000000",
      "m.wav",
      "-map",
      "[sfxtapstem]",
      "-c:a",
      "pcm_s24le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-t",
      "6.000000",
      "s.wav",
    ]);
  });

  test("without taps the mix is as it was", () => {
    const plan = planSequence(
      {
        clips: [{ source_index: 0, kind: "image", duration: 4 }],
        audio: [{ source_index: 1, role: "voiceover" }],
      },
      [
        { path: "still.png", role: "image" },
        { path: "voice.wav", role: "audio" },
      ],
    );
    const args = mixArgs(plan, ["clip.mkv"], ["voice.wav"], "mix.wav") as string[];
    expect(args.at(-1)).toBe("mix.wav");
    expect(busTaps([], ["clips"], { voiceover: "voice" }, plan, {})).toEqual([]);
  });
});

describe("what dips under the voice", () => {
  test("music unless told not to; an effect only when told to; a voiceover never", () => {
    const timeline = edit({
      audio: [
        { id: "v1", assetId: VOICE, role: "voiceover", duck: true },
        { id: "m1", assetId: MUSIC, role: "music", duck: false },
        { id: "s1", assetId: EFFECT, role: "sfx", duck: true },
      ],
    });
    const audio = buildRenderRequest(timeline).params.audio as { duck: boolean }[];
    expect(audio.map((item) => item.duck)).toEqual([false, false, true]);
    const plan = planSequence(
      {
        clips: [{ source_index: 0, kind: "image", duration: 4 }],
        audio: [
          { source_index: 1, role: "music" },
          { source_index: 1, role: "music", duck: false },
          { source_index: 1, role: "sfx" },
          { source_index: 1, role: "sfx", duck: true },
          { source_index: 1, role: "voiceover", duck: true },
        ],
      },
      [
        { path: "still.png", role: "image" },
        { path: "sound.wav", role: "audio" },
      ],
    );
    expect(plan.audio.map((item: { duck: boolean }) => item.duck)).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    // Each item knows its place among the audio sent, for the report's sections.
    expect(plan.audio.map((item: { index: number }) => item.index)).toEqual([0, 1, 2, 3, 4]);
  });
});
