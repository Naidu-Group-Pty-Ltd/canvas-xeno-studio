import { describe, expect, test } from "bun:test";
import {
  comparisonLine,
  readingLines,
  voiceMeasurementOf,
  voiceSummary,
} from "../../src/lib/voice/measure";

/** As One's voice as the media service measured it (its stem, dry), and Three Questions' through its reverb. */
const AS_ONE = {
  seconds: 45.5,
  status: "measured",
  speech_seconds: 28.93,
  phrases: 20,
  phrase_spans: [
    [0.56, 2.71],
    [2.91, 4.32],
  ],
  syllables: 150,
  syllables_per_second: 5.18,
  pitch_hz: { median: 235.3, p25: 213.3, p75: 262.3, frames: 2073 },
  phrase_end_drop_db: { median: 16.6, ends: 15, values: [17, 16.6, 15.3] },
  dryness: "dry",
  loudness: { integrated_lufs: -12.8, range_lu: 4.8, true_peak_dbtp: 0.1 },
  from_seconds: 0,
};
const THREE_QUESTIONS = {
  ...AS_ONE,
  seconds: 37.5,
  speech_seconds: 13.33,
  phrases: 10,
  syllables: 52,
  syllables_per_second: 3.9,
  pitch_hz: { median: 254, p25: 225.4, p75: 285.7, frames: 1025 },
  phrase_end_drop_db: { median: 8, ends: 10, values: [10.2, 4.9, 8.9] },
  dryness: "wet",
  loudness: { integrated_lufs: -19.1, range_lu: 10, true_peak_dbtp: -2.8 },
};

describe("a voice, measured", () => {
  test("the media service's report reads back, and anything else reads as none", () => {
    const measured = voiceMeasurementOf({ voice: AS_ONE })!;
    expect(measured.voice.pitch_hz?.median).toBe(235.3);
    expect(measured.voice.dryness).toBe("dry");
    expect(measured.reference).toBeUndefined();
    expect(voiceMeasurementOf(null)).toBeNull();
    expect(voiceMeasurementOf({ voice: { ...AS_ONE, dryness: "damp" } })).toBeNull();
    expect(voiceMeasurementOf({ width: 1080 })).toBeNull();
  });

  test("a dry voice in words: its speech, pace, pitch, fall and loudness", () => {
    const measured = voiceMeasurementOf({ voice: AS_ONE })!;
    expect(readingLines(measured.voice)).toEqual([
      "28.9 s of speech in 20 phrases, 5.2 syllables a second.",
      "Pitch 235 Hz (213 to 262 Hz in its middle half).",
      "Dry: its phrase ends fall 16.6 dB in the 40 to 90 ms after them, as a voice with nothing on it does.",
      "-12.8 LUFS integrated, true peak 0.1 dBTP.",
    ]);
  });

  test("Three Questions' voice reads wet, as the client heard it", () => {
    const measured = voiceMeasurementOf({ voice: THREE_QUESTIONS })!;
    expect(readingLines(measured.voice)[2]).toBe(
      "Wet: its phrase ends fall only 8.0 dB in the 40 to 90 ms after them, as a voice through a reverb or in a live room does. A dry voice falls 15 to 19 dB.",
    );
  });

  test("held against its reference: pitch, pace, fall and loudness, each in words", () => {
    const measured = voiceMeasurementOf({
      voice: THREE_QUESTIONS,
      reference: AS_ONE,
      compared: {
        pitch_semitones: 1.32,
        pace_ratio: 0.753,
        phrase_end_drop_db_difference: -8.6,
        loudness_lu_difference: -6.3,
      },
    })!;
    const lines = voiceSummary(measured);
    expect(lines.at(-1)).toBe(
      "Against the reference: 1.3 semitones higher, 25% slower, its phrase ends falling 8.6 dB less (wetter), 6.3 LU quieter.",
    );
    expect(lines.at(-2)).toStartWith("The reference: 28.9 s of speech in 20 phrases");
  });

  test("a take that matches says so", () => {
    expect(
      comparisonLine({
        pitch_semitones: 0,
        pace_ratio: 1.01,
        phrase_end_drop_db_difference: 0.3,
        loudness_lu_difference: 0.2,
      }),
    ).toBe("Against the reference: the same pitch, the same pace, as dry, as loud.");
    expect(
      comparisonLine({
        pitch_semitones: null,
        pace_ratio: null,
        phrase_end_drop_db_difference: null,
        loudness_lu_difference: null,
      }),
    ).toBeNull();
  });

  test("no speech, and too few phrase ends to judge, are said plainly", () => {
    expect(
      readingLines({ ...voiceMeasurementOf({ voice: AS_ONE })!.voice, status: "no_speech" }),
    ).toEqual(["No speech found in its 45.5 s."]);
    const few = voiceMeasurementOf({
      voice: {
        ...AS_ONE,
        dryness: "unknown",
        phrase_end_drop_db: { median: 14, ends: 2, values: [14, 14] },
      },
    })!;
    expect(readingLines(few.voice)[2]).toBe(
      "Too few phrase ends with quiet after them (2) to say how dry it is.",
    );
  });
});
