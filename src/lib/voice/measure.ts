/**
 * A voice, measured by the media service (its measure_voice task,
 * media-worker/src/voicemeter.js): how a recording speaks, and how it differs
 * from a reference. The teasers taught it. The client heard Three Questions'
 * voice as too wet: a reverb had been put on it after the take, and its
 * phrase ends fell 8 dB where a dry voice's fall 15 to 19. As One's voice was
 * then matched to the client's reference by pitch, pace and that fall before
 * anyone heard it (docs/brands/aurixa-teaser/REFERENCE.md). Pure, so it is
 * unit-testable; the worker decides the verdicts and this reads them.
 */
import { z } from "zod";

const number = z.number().finite();

const readingSchema = z.object({
  seconds: number,
  status: z.enum(["measured", "no_speech"]),
  speech_seconds: number,
  phrases: z.number().int(),
  phrase_spans: z.array(z.tuple([number, number])).default([]),
  syllables: z.number().int(),
  syllables_per_second: number.nullable(),
  pitch_hz: z
    .object({ median: number, p25: number, p75: number, frames: z.number().int() })
    .nullable(),
  phrase_end_drop_db: z.object({
    median: number.nullable(),
    ends: z.number().int(),
    values: z.array(number).default([]),
  }),
  dryness: z.enum(["dry", "some_room", "wet", "unknown"]),
  loudness: z
    .object({
      integrated_lufs: number,
      range_lu: number.nullable(),
      true_peak_dbtp: number.nullable(),
    })
    .nullable(),
  from_seconds: number.optional(),
});
export type VoiceReading = z.infer<typeof readingSchema>;

const comparedSchema = z.object({
  pitch_semitones: number.nullable(),
  pace_ratio: number.nullable(),
  phrase_end_drop_db_difference: number.nullable(),
  loudness_lu_difference: number.nullable(),
});
export type VoiceComparison = z.infer<typeof comparedSchema>;

const measurementSchema = z.object({
  voice: readingSchema,
  reference: readingSchema.optional(),
  compared: comparedSchema.optional(),
});
export type VoiceMeasurement = z.infer<typeof measurementSchema>;

/** The media service's report, read; null when there is none or it can't be read. */
export function voiceMeasurementOf(value: unknown): VoiceMeasurement | null {
  const parsed = measurementSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const one = (value: number, places = 1) => value.toFixed(places);

/** One recording, in words: how much it speaks and how, how dry it is, and how loud. */
export function readingLines(reading: VoiceReading): string[] {
  if (reading.status === "no_speech") return [`No speech found in its ${one(reading.seconds)} s.`];
  const lines: string[] = [];
  const pace =
    reading.syllables_per_second === null
      ? ""
      : `, ${one(reading.syllables_per_second)} syllables a second`;
  lines.push(
    `${one(reading.speech_seconds)} s of speech in ${reading.phrases} phrase${reading.phrases === 1 ? "" : "s"}${pace}.`,
  );
  if (reading.pitch_hz)
    lines.push(
      `Pitch ${Math.round(reading.pitch_hz.median)} Hz (${Math.round(reading.pitch_hz.p25)} to ${Math.round(reading.pitch_hz.p75)} Hz in its middle half).`,
    );
  const fall = reading.phrase_end_drop_db.median;
  const falls = fall === null ? "" : ` ${one(fall)} dB in the 40 to 90 ms after them`;
  switch (reading.dryness) {
    case "dry":
      lines.push(`Dry: its phrase ends fall${falls}, as a voice with nothing on it does.`);
      break;
    case "some_room":
      lines.push(
        `Some room in it: its phrase ends fall only${falls}. Music or room tone under a voice holds its ends up too.`,
      );
      break;
    case "wet":
      lines.push(
        `Wet: its phrase ends fall only${falls}, as a voice through a reverb or in a live room does. A dry voice falls 15 to 19 dB.`,
      );
      break;
    default:
      lines.push(
        `Too few phrase ends with quiet after them (${reading.phrase_end_drop_db.ends}) to say how dry it is.`,
      );
  }
  if (reading.loudness)
    lines.push(
      `${one(reading.loudness.integrated_lufs)} LUFS integrated${
        reading.loudness.true_peak_dbtp === null
          ? ""
          : `, true peak ${one(reading.loudness.true_peak_dbtp)} dBTP`
      }.`,
    );
  return lines;
}

/** How the voice differs from its reference, in words. */
export function comparisonLine(compared: VoiceComparison): string | null {
  const parts: string[] = [];
  const st = compared.pitch_semitones;
  if (st !== null)
    parts.push(
      Math.abs(st) < 0.25
        ? "the same pitch"
        : `${one(Math.abs(st))} semitone${Math.abs(st) >= 1.05 ? "s" : ""} ${st > 0 ? "higher" : "lower"}`,
    );
  const pace = compared.pace_ratio;
  if (pace !== null)
    parts.push(
      Math.abs(pace - 1) < 0.03
        ? "the same pace"
        : `${Math.round(Math.abs(pace - 1) * 100)}% ${pace > 1 ? "faster" : "slower"}`,
    );
  const drop = compared.phrase_end_drop_db_difference;
  if (drop !== null)
    parts.push(
      Math.abs(drop) < 1.5
        ? "as dry"
        : `its phrase ends falling ${one(Math.abs(drop))} dB ${drop > 0 ? "further (drier)" : "less (wetter)"}`,
    );
  const loudness = compared.loudness_lu_difference;
  if (loudness !== null)
    parts.push(
      Math.abs(loudness) < 0.5
        ? "as loud"
        : `${one(Math.abs(loudness))} LU ${loudness > 0 ? "louder" : "quieter"}`,
    );
  return parts.length ? `Against the reference: ${parts.join(", ")}.` : null;
}

/** The measurement in words: the voice, then the reference and how they differ. */
export function voiceSummary(measurement: VoiceMeasurement): string[] {
  const lines = readingLines(measurement.voice);
  if (measurement.reference) {
    lines.push(`The reference: ${readingLines(measurement.reference).join(" ")}`);
    const compared = measurement.compared ? comparisonLine(measurement.compared) : null;
    if (compared) lines.push(compared);
  }
  return lines;
}
