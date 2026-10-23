/**
 * How a render's sound sits, as the media service measured it (its
 * mix_report; see media-worker/src/mixreport.js): the voice's margin over
 * the music in the speech band, section by section (each music item's span),
 * and the finished mix's loudness. Kept on the render (sequence_renders
 * .mix_report, migration 0032) and with the rendered video's own record (its
 * `metadata.probe`), read here for the Render panel and the API. Pure.
 */

export interface MixSection {
  /** The music item it is (its place among the audio sent to render). */
  index: number;
  /** Where the section runs on the edit, in seconds. */
  from: number;
  to: number;
  /** Seconds the voice speaks in it: what the margin is measured over. */
  speechSeconds: number;
  /** The voice and music's levels in the speech band where the voice speaks, and the gap between. */
  voiceDb: number | null;
  musicDb: number | null;
  marginDb: number | null;
}

export interface MixReport {
  band: [number, number];
  sections: MixSection[];
  /** The narrowest and widest margin over the sections the voice speaks in. */
  margin: { min: number; max: number } | null;
  /** The finished mix, as measured: integrated loudness, loudness range, true peak. */
  loudness: { integratedLufs: number; rangeLu: number; truePeakDbtp: number } | null;
  /** The mix's loudness before it was evened out to the target. */
  mixedLufs: number | null;
}

/**
 * Under this margin (dB) a voice can be hard to follow over its music on a
 * phone speaker. Reel 1's voice stood 10 to 19 dB over the music.
 */
export const LOW_MARGIN_DB = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const numberOr = (value: unknown, fallback: number | null = null) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A stored mix report (snake_case, as the media service sends it), or null when it isn't one. */
export function readMixReport(value: unknown): MixReport | null {
  if (!isRecord(value) || !Array.isArray(value["sections"])) return null;
  const band = Array.isArray(value["band_hz"]) ? value["band_hz"] : [];
  const sections = value["sections"].filter(isRecord).map((section): MixSection => ({
    index: numberOr(section["index"], 0)!,
    from: numberOr(section["from"], 0)!,
    to: numberOr(section["to"], 0)!,
    speechSeconds: numberOr(section["speech_seconds"], 0)!,
    voiceDb: numberOr(section["voice_db"]),
    musicDb: numberOr(section["music_db"]),
    marginDb: numberOr(section["margin_db"]),
  }));
  const margin = isRecord(value["margin_db"]) ? value["margin_db"] : null;
  const min = numberOr(margin?.["min"]);
  const max = numberOr(margin?.["max"]);
  const loudness = isRecord(value["loudness"]) ? value["loudness"] : null;
  const integrated = numberOr(loudness?.["integrated_lufs"]);
  return {
    band: [numberOr(band[0], 300)!, numberOr(band[1], 4000)!],
    sections,
    margin: min !== null && max !== null ? { min, max } : null,
    loudness:
      integrated !== null
        ? {
            integratedLufs: integrated,
            rangeLu: numberOr(loudness?.["range_lu"], 0)!,
            truePeakDbtp: numberOr(loudness?.["true_peak_dbtp"], 0)!,
          }
        : null,
    mixedLufs: numberOr(value["mixed_lufs"]),
  };
}

/** A render's mix report: as kept on the render, else as kept with its video's record. */
export function mixReportOf(
  render: { mix_report?: unknown } | null | undefined,
  videoMetadata: unknown,
): MixReport | null {
  const probe = isRecord(videoMetadata) ? videoMetadata["probe"] : null;
  return (
    readMixReport(render?.mix_report) ??
    (isRecord(probe) ? readMixReport(probe["mix_report"]) : null)
  );
}

const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

/** The report in a line: the margins over the music, then the loudness. */
export function mixSummary(report: MixReport): string {
  const parts: string[] = [];
  if (report.margin)
    parts.push(
      report.margin.min === report.margin.max
        ? `The voice stands ${report.margin.min.toFixed(1)} dB over the music`
        : `The voice stands ${report.margin.min.toFixed(1)} to ${report.margin.max.toFixed(1)} dB over the music`,
    );
  if (report.loudness)
    parts.push(
      `${report.loudness.integratedLufs.toFixed(1)} LUFS, range ${report.loudness.rangeLu.toFixed(1)} LU, true peak ${report.loudness.truePeakDbtp.toFixed(1)} dBTP`,
    );
  return parts.length ? `${parts.join(". ")}.` : "";
}

/** Sections where the voice may be hard to follow over the music. */
export function quietVoiceSections(report: MixReport): MixSection[] {
  return report.sections.filter(
    (section) => section.marginDb !== null && section.marginDb < LOW_MARGIN_DB,
  );
}

/** A section's margin as a person reads it ("+12.1 dB"), or why there is none. */
export function sectionMargin(section: MixSection): string {
  if (section.marginDb !== null) return `${signed(section.marginDb)} dB`;
  if (!section.speechSeconds) return "no speech";
  return section.musicDb === null ? "music silent" : "not measured";
}

/** The stems kept with a rendered video: each bus's file in the library. */
export function renderStems(videoMetadata: unknown): { role: string; assetId: string }[] {
  const stems = isRecord(videoMetadata) ? videoMetadata["stems"] : null;
  return (Array.isArray(stems) ? stems : [])
    .filter(isRecord)
    .flatMap((stem) =>
      typeof stem["role"] === "string" && typeof stem["asset_id"] === "string"
        ? [{ role: stem["role"], assetId: stem["asset_id"] }]
        : [],
    );
}
