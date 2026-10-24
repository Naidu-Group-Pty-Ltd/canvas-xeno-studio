import { describe, expect, test } from "bun:test";
// @ts-expect-error The media worker is plain JavaScript.
import * as quality from "../../media-worker/src/quality.js";
// @ts-expect-error The media worker is plain JavaScript.
import { planSequence } from "../../media-worker/src/sequence.js";
// @ts-expect-error The media worker is plain JavaScript.
import { FEATURES } from "../../media-worker/src/tasks.js";

type Attack = { status: string; offset_ms?: number; rise_db?: number };
type Check = {
  id: string;
  result: string;
  value: number | null;
  limit: number | null;
  time?: number;
};
const q = quality as {
  THRESHOLDS: Record<string, number>;
  MUSIC_BEATS: number;
  attackEnvelope: (samples: Float32Array, rate: number) => Float32Array;
  attackAt: (envelope: Float32Array, beat: number) => Attack;
  cutsOnBeats: (
    plan: unknown,
    beats: number[],
  ) => Array<{ clip: number; time: number; beat: number }>;
  planMeasurement: (params: unknown) => { measure: Record<string, unknown> | null };
  plannedCuts: (plan: unknown) => Array<{ clip: number; frame: number }>;
  qualityChecks: (report: Record<string, unknown>) => Check[];
};

const RATE = 16_000;
const BEAT = 1;

/** A second and a half of sound at 16 kHz, made by `level(t)` times a 220 Hz tone, plus what `add` gives. */
function sound(level: (t: number) => number, add: (t: number) => number = () => 0): Float32Array {
  const samples = new Float32Array(Math.round(1.5 * RATE));
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / RATE;
    samples[index] = level(t) * Math.sin(2 * Math.PI * 220 * t) + add(t);
  }
  return samples;
}

/** A kick on the beat: a falling sine, struck at once and dying away. */
const kick = (at: number) => (t: number) =>
  t < at ? 0 : 0.5 * Math.sin(2 * Math.PI * 60 * (t - at)) * Math.exp(-(t - at) / 0.08);

const attack = (samples: Float32Array) => q.attackAt(q.attackEnvelope(samples, RATE), BEAT);

describe("the music's attack at a beat", () => {
  test("a hit out of quiet, struck on the beat, is on it", () => {
    const found = attack(sound(() => 0.001, kick(BEAT)));
    expect(found.status).toBe("measured");
    expect(Math.abs(found.offset_ms!)).toBeLessThanOrEqual(2);
    expect(found.rise_db!).toBeGreaterThan(30);
  });

  test("Reel 2's fault: the bar before let in by a crossfade starting 35 ms early reads 30-odd ms early", () => {
    // Out of a quiet piece, a loud one comes in under a quarter-sine crossfade from 35 ms before its
    // bar line (the splice 20 ms ahead, half the 30 ms crossfade before that), its hit on the bar.
    const fade = (t: number) => {
      const p = (t - (BEAT - 0.035)) / 0.03;
      return p <= 0 ? 0 : p >= 1 ? 1 : Math.sin((p * Math.PI) / 2);
    };
    const found = attack(sound((t) => 0.001 + 0.25 * fade(t), kick(BEAT)));
    expect(found.status).toBe("measured");
    expect(found.offset_ms!).toBeLessThan(-30);
    expect(found.offset_ms!).toBeGreaterThan(-36);
  });

  test("the same piece coming in on its bar line instead reads on the beat", () => {
    const ramp = (t: number) => Math.max(0, Math.min(1, (t - (BEAT - 0.003)) / 0.003));
    const found = attack(sound((t) => 0.001 + 0.25 * ramp(t), kick(BEAT)));
    expect(found.status).toBe("measured");
    expect(found.offset_ms!).toBeGreaterThanOrEqual(-3);
    expect(found.offset_ms!).toBeLessThanOrEqual(1);
  });

  test("music running on through the beat has no clear attack, silence none at all, and the edges aren't read", () => {
    expect(
      attack(
        sound(
          () => 0.3,
          (t) => 0.1 * kick(BEAT)(t),
        ),
      ).status,
    ).toBe("unclear");
    expect(attack(new Float32Array(RATE * 2)).status).toBe("silent");
    const envelope = q.attackEnvelope(
      sound(() => 0.001, kick(0.05)),
      RATE,
    );
    expect(q.attackAt(envelope, 0.05).status).toBe("edge");
    expect(q.attackAt(envelope, 1.48).status).toBe("edge");
  });
});

describe("which cuts it is read at", () => {
  const plan = planSequence(
    {
      width: 320,
      height: 240,
      fps: 25,
      clips: [
        { source_index: 0, kind: "image", duration: 2 },
        { source_index: 0, kind: "image", duration: 1.5 },
        {
          source_index: 0,
          kind: "image",
          duration: 1.4,
          transition: { type: "fade", duration: 0.4 },
        },
        { source_index: 0, kind: "image", duration: 2 },
      ],
    },
    [{ role: "image", path: "/tmp/still.png" }],
  );

  test("each hard cut with one of the music's beats within half a frame of it, against that beat", () => {
    const cuts = q
      .plannedCuts(plan)
      .map(({ clip, frame }: { clip: number; frame: number }) => ({ clip, time: frame / 25 }));
    // The fade into clip 3 is no cut; clips 2 and 4 come in on cuts.
    expect(cuts.map((cut: { clip: number }) => cut.clip)).toEqual([2, 4]);
    const [second, fourth] = cuts as Array<{ clip: number; time: number }>;
    const matched = q.cutsOnBeats(plan, [
      0.5,
      second!.time - 0.01,
      second!.time + 0.5,
      fourth!.time + 0.015,
    ]);
    expect(matched).toEqual([
      { clip: 2, time: second!.time, beat: second!.time - 0.01 },
      { clip: 4, time: fourth!.time, beat: fourth!.time + 0.015 },
    ]);
    // A beat more than half a frame from a cut isn't the cut's.
    expect(q.cutsOnBeats(plan, [second!.time + 0.04, fourth!.time - 0.04])).toEqual([]);
  });

  test("the app sends where the beats fall; anything else is turned away", () => {
    expect(q.planMeasurement({ measure: { music_beats: [3, 1, 1, 2] } }).measure).toEqual({
      brandColours: [],
      musicBeats: [1, 2, 3],
    });
    expect(q.planMeasurement({ measure: {} }).measure).toEqual({ brandColours: [] });
    expect(() => q.planMeasurement({ measure: { music_beats: "1,2" } })).toThrow("music_beats");
    expect(() => q.planMeasurement({ measure: { music_beats: [-1] } })).toThrow("music_beats");
    expect(() =>
      q.planMeasurement({ measure: { music_beats: new Array(q.MUSIC_BEATS + 1).fill(1) } }),
    ).toThrow("at most");
    expect(FEATURES).toContain("music_at_cuts");
  });
});

describe("its verdict", () => {
  const report = (cuts: Array<Record<string, unknown>>, status = "measured") => ({
    music: { status, cuts },
  });
  const verdict = (cuts: Array<Record<string, unknown>>, status?: string) =>
    q.qualityChecks(report(cuts, status)).find((check) => check.id === "music_cuts")!;

  test("passes within 20 ms of every beat, and is flagged at the worst cut past it", () => {
    expect(q.THRESHOLDS["musicAttackMs"]).toBe(20);
    const on = verdict([
      { clip: 2, time: 2, beat: 2, status: "measured", offset_ms: -2.5 },
      { clip: 5, time: 6, beat: 6, status: "measured", offset_ms: 1 },
    ]);
    expect(on).toMatchObject({ result: "pass", value: -2.5, limit: 20 });
    const early = verdict([
      { clip: 2, time: 2, beat: 2, status: "measured", offset_ms: -2.5 },
      { clip: 5, time: 22.04, beat: 22.03, status: "measured", offset_ms: -37 },
      { clip: 6, time: 24, beat: 24, status: "unclear" },
    ]);
    expect(early).toMatchObject({ result: "flag", value: -37, time: 22.04 });
  });

  test("with nothing to read, it says why", () => {
    expect(verdict([{ clip: 2, time: 2, beat: 2, status: "unclear" }])).toMatchObject({
      result: "info",
      status: "unclear",
    });
    expect(verdict([], "no_cut_on_a_beat")).toMatchObject({
      result: "info",
      status: "no_cut_on_a_beat",
    });
    expect(q.qualityChecks({}).some((check) => check.id === "music_cuts")).toBe(false);
  });
});
