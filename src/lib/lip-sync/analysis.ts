/**
 * A prepared voiceover's analysis, as the media worker reports it
 * (prepare_audio's metadata) and the app keeps it, read into what the
 * planning needs. Shared by the browser and the server.
 */
import type { TimedWord, VoiceoverTiming } from "./segments";

/** The analysis as stored (snake_case, straight from the worker). */
export interface PreparedAnalysis {
  analysis_version?: number;
  sample_rate: number;
  channels: number;
  samples: number;
  duration_seconds: number;
  speech: [number, number][];
  pauses: [number, number][];
  clear_pauses: boolean;
  speech_start_seconds?: number | null;
  speech_end_seconds?: number | null;
  levels?:
    | { floor_db?: number; speech_db?: number; peak_db?: number; threshold_db?: number | null }
    | undefined;
  envelope?: { rate: number; data: string } | null;
}

const isPairs = (value: unknown): value is [number, number][] =>
  Array.isArray(value) &&
  value.every(
    (pair) =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      typeof pair[0] === "number" &&
      typeof pair[1] === "number" &&
      Number.isFinite(pair[0]) &&
      Number.isFinite(pair[1]),
  );

/** The analysis from stored JSON, or null when it isn't one (or is from an analysis this app can't read). */
export function readAnalysis(value: unknown): PreparedAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const number = (key: string) =>
    typeof record[key] === "number" && Number.isFinite(record[key])
      ? (record[key] as number)
      : null;
  const rate = number("sample_rate");
  const samples = number("samples");
  const duration = number("duration_seconds");
  if (!rate || !samples || !duration || !isPairs(record["speech"]) || !isPairs(record["pauses"]))
    return null;
  const envelope = record["envelope"] as { rate?: unknown; data?: unknown } | null | undefined;
  return {
    analysis_version: number("analysis_version") ?? 1,
    sample_rate: rate,
    channels: number("channels") ?? 1,
    samples,
    duration_seconds: duration,
    speech: record["speech"],
    pauses: record["pauses"],
    clear_pauses: record["clear_pauses"] === true,
    speech_start_seconds: number("speech_start_seconds"),
    speech_end_seconds: number("speech_end_seconds"),
    levels: (record["levels"] as PreparedAnalysis["levels"]) ?? undefined,
    envelope:
      envelope && typeof envelope.rate === "number" && typeof envelope.data === "string"
        ? { rate: envelope.rate, data: envelope.data }
        : null,
  };
}

/** The waveform's values (0-255), from the base64 the worker sends. */
export function envelopeValues(envelope: PreparedAnalysis["envelope"]): Uint8Array {
  if (!envelope?.data) return new Uint8Array();
  try {
    const binary = atob(envelope.data);
    const values = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) values[index] = binary.charCodeAt(index);
    return values;
  } catch {
    return new Uint8Array();
  }
}

/** What the planning reads: length, speech, pauses and waveform, on the voiceover's own clock. */
export function timingOf(analysis: PreparedAnalysis): VoiceoverTiming {
  const values = envelopeValues(analysis.envelope ?? null);
  return {
    // Exact: the canonical file's own sample count at its own rate.
    durationSeconds: analysis.samples / analysis.sample_rate,
    speech: analysis.speech,
    pauses: analysis.pauses,
    clearPauses: analysis.clear_pauses,
    envelope: analysis.envelope && values.length ? { rate: analysis.envelope.rate, values } : null,
  };
}

/** Word timings as stored ({text, start, end} each), dropping any that aren't. */
export function readWords(value: unknown): TimedWord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (word): word is TimedWord =>
      !!word &&
      typeof word === "object" &&
      typeof (word as TimedWord).text === "string" &&
      typeof (word as TimedWord).start === "number" &&
      typeof (word as TimedWord).end === "number" &&
      Number.isFinite((word as TimedWord).start) &&
      Number.isFinite((word as TimedWord).end),
  );
}
