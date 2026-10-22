/**
 * A render's quality report, read and put into plain words. The media service
 * measures every render against its own lossless reference and judges each
 * measure a pass, a flag or information (media-worker/src/quality.js, where
 * the thresholds and their reasons are); the report is kept on the render
 * (sequence_renders.quality, migration 0031_render_quality) and with the
 * rendered video's library record. Pure, so it is unit-testable.
 */
import { z } from "zod";
import { formatTime } from "./timeline";

const number = z.number().finite();
const at = z.object({ frame: number, time: number }).nullable().optional();

const checkSchema = z.object({
  id: z.string().max(40),
  result: z.enum(["pass", "flag", "info"]),
  value: number.nullable().optional(),
  limit: number.nullable().optional(),
  time: number.nullable().optional(),
  hex: z.string().max(7).optional(),
  status: z.string().max(40).optional(),
});
export type QualityCheck = z.infer<typeof checkSchema>;

const reportSchema = z.object({
  version: z.number().int(),
  status: z.enum(["measured", "passed_through", "unmeasured"]),
  reason: z.string().max(200).optional(),
  intermediates: z.enum(["standard", "lossless", "mixed"]).optional(),
  frames: number.optional(),
  fps: number.optional(),
  fidelity: z
    .object({
      frames_measured: number,
      every: number,
      ssim: z.object({ mean: number, min: number }),
      psnr_db: z.object({ mean: number, min: number }),
    })
    .nullable()
    .optional(),
  pixels: z
    .object({
      frames: number,
      every: number,
      edges: z.object({ frames: number, mean: number.nullable(), worst: at }),
      brand_colours: z
        .array(
          z.object({
            hex: z.string().max(7),
            found: z.boolean(),
            master: z.string().max(7).optional(),
            delta_e_2000: number.optional(),
            drawn_delta_e_2000: number.optional(),
          }),
        )
        .default([]),
      banding: z.object({
        windows: number,
        gap_code_values: z.object({ p99: number, max: number }).nullable(),
        worst: at,
      }),
    })
    .optional(),
  captions: z
    .object({
      status: z.string().max(40),
      planned: number,
      missed: z.array(z.object({ caption: number, start: number, end: number })).default([]),
      missed_count: number.optional(),
    })
    .nullable()
    .optional(),
  cuts: z
    .object({
      planned: number,
      judged: number,
      missed: number,
      cuts: z
        .array(
          z.object({
            clip: number,
            frame: number,
            time: number,
            reads_as: z.string().max(40),
            frames_off: number.optional(),
          }),
        )
        .default([]),
    })
    .nullable()
    .optional(),
  sync: z
    .object({
      items: z.array(
        z.object({
          item: number,
          status: z.string().max(40),
          offset_ms: number.optional(),
        }),
      ),
    })
    .nullable()
    .optional(),
  loudness: z
    .object({
      integrated_lufs: number.nullable(),
      range_lu: number.nullable(),
      true_peak_dbtp: number.nullable(),
      target_lufs: number.nullable(),
    })
    .nullable()
    .optional(),
  checks: z.array(checkSchema).max(80).default([]),
  passes: number.default(0),
  flags: number.default(0),
  seconds: number.optional(),
});
export type QualityReport = z.infer<typeof reportSchema>;

/** A quality report, or null when there is none or it can't be read. */
export function readQualityReport(value: unknown): QualityReport | null {
  if (!value || typeof value !== "object") return null;
  const parsed = reportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * A render's report: kept on the render, else (before migration
 * 0031_render_quality, or for a render recorded before it) with its video's
 * library record, as the media service sent it (`metadata.probe.quality`).
 */
export function renderQualityOf(stored: unknown, videoMetadata: unknown): QualityReport | null {
  const kept = readQualityReport(stored);
  if (kept) return kept;
  const probe =
    isRecord(videoMetadata) && isRecord(videoMetadata["probe"]) ? videoMetadata["probe"] : null;
  return probe ? readQualityReport(probe["quality"]) : null;
}

/** The report as the media service wrote it (every number it measured), with what this reads of it. */
export function storedQualityOf(
  stored: unknown,
  videoMetadata: unknown,
): { report: QualityReport; raw: Record<string, unknown> } | null {
  const probe =
    isRecord(videoMetadata) && isRecord(videoMetadata["probe"]) ? videoMetadata["probe"] : null;
  for (const raw of [stored, probe?.["quality"]]) {
    const report = readQualityReport(raw);
    if (report && isRecord(raw)) return { report, raw };
  }
  return null;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const when = (seconds: number | null | undefined) =>
  typeof seconds === "number" ? ` (at ${formatTime(seconds)})` : "";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** One check in plain words. */
function line(check: QualityCheck, report: QualityReport): string {
  const v = check.value ?? null;
  const limit = check.limit ?? null;
  const flagged = check.result === "flag";
  switch (check.id) {
    case "ssim":
      return flagged
        ? `Softer than its reference: SSIM ${v?.toFixed(4)} (${limit} or more expected).`
        : `SSIM ${v?.toFixed(4)} against its own reference (${limit} or more).`;
    case "psnr":
      return flagged
        ? `PSNR ${v?.toFixed(1)} dB, below ${limit} dB: fine detail is lost.`
        : `PSNR ${v?.toFixed(1)} dB (${limit} dB or more).`;
    case "psnr_worst":
      return flagged
        ? `A frame${when(check.time)} drops to ${v?.toFixed(1)} dB, below ${limit} dB.`
        : `No frame below ${v?.toFixed(1)} dB (${limit} dB or more).`;
    case "edges":
      if (check.result === "info") return "No strong edges to judge sharpness by.";
      return flagged
        ? `Edges softened: ${percent(v ?? 0)} of their contrast kept (${percent(limit ?? 0)} or more expected).`
        : `${percent(v ?? 0)} of the edge contrast kept (${percent(limit ?? 0)} or more).`;
    case "edges_worst":
      return flagged
        ? `The frame${when(check.time)} kept only ${percent(v ?? 0)} of its edge contrast.`
        : `No frame kept less than ${percent(v ?? 0)} of its edge contrast.`;
    case "colour":
      if (check.result === "info") return "No flat areas to judge colour by.";
      return flagged
        ? `Colour shifted on flat areas: CIEDE2000 ${v?.toFixed(2)} on average (noticeable from ${limit}).`
        : `Colour on flat areas within CIEDE2000 ${v?.toFixed(2)} on average (below ${limit}: not noticeable).`;
    case "brand_colour": {
      const brand = report.pixels?.brand_colours.find((entry) => entry.hex === check.hex);
      if (check.result === "info")
        return `The brand's ${check.hex} isn't on screen as a flat area, so it wasn't checked.`;
      const drawn =
        brand?.drawn_delta_e_2000 !== undefined && brand.drawn_delta_e_2000 >= 1
          ? ` The edit draws it CIEDE2000 ${brand.drawn_delta_e_2000.toFixed(2)} from the kit's own value.`
          : "";
      return flagged
        ? `The brand's ${check.hex} shifted in the encode${brand?.master ? ` to ${brand.master}` : ""}: CIEDE2000 ${v?.toFixed(2)}.${drawn}`
        : `The brand's ${check.hex} kept: CIEDE2000 ${v?.toFixed(2)}.${drawn}`;
    }
    case "banding":
      if (check.result === "info") return "Too few smooth gradients to judge banding by.";
      return flagged
        ? `Banding in smooth gradients: steps of ${v?.toFixed(2)} levels${when(check.time)}.`
        : `No banding in smooth gradients (steps of ${v?.toFixed(2)} levels at most).`;
    case "captions": {
      const captions = report.captions;
      if (check.result === "info")
        return check.status === "unclear"
          ? "The captions couldn't be told apart from the picture behind them."
          : "The captions are too short to judge on their frames.";
      if (!flagged) return "Every caption on its planned frames.";
      const missed = (captions?.missed ?? [])
        .slice(0, 3)
        .map((entry) => `${formatTime(entry.start)} to ${formatTime(entry.end)}`)
        .join(", ");
      return `${plural(v ?? 0, "caption")} not on ${(v ?? 0) === 1 ? "its" : "their"} planned frames${missed ? `: ${missed}` : ""}.`;
    }
    case "cuts": {
      if (check.result === "info") return "No cut to judge.";
      if (!flagged) return "Every cut on its frame.";
      const missed = (report.cuts?.cuts ?? []).filter((cut) => cut.reads_as === "missed");
      const first = missed[0];
      const off = first?.frames_off ?? 0;
      return first
        ? `The cut into clip ${first.clip} (at ${formatTime(first.time)}) lands ${plural(Math.abs(off), "frame")} ${off > 0 ? "late" : "early"}${missed.length > 1 ? `, and ${plural(missed.length - 1, "more cut")} off ${missed.length > 2 ? "their" : "its"} frame` : ""}.`
        : `${plural(v ?? 0, "cut")} off ${(v ?? 0) === 1 ? "its" : "their"} frame.`;
    }
    case "sync":
      if (check.result === "info") return "The voiceover's sync couldn't be measured clearly.";
      return flagged
        ? `The voiceover is ${Math.round(v ?? 0)} ms off where it was placed (${limit} ms at most).`
        : `The voiceover is where it was placed (within ${Math.round(v ?? 0)} ms).`;
    case "loudness": {
      const loudness = report.loudness;
      if (!loudness || loudness.integrated_lufs === null) return "No sound to measure.";
      const range = loudness.range_lu !== null ? `, range ${loudness.range_lu.toFixed(1)} LU` : "";
      if (check.result === "info")
        return `Loudness ${loudness.integrated_lufs.toFixed(1)} LUFS${range} (not evened out).`;
      return flagged
        ? `Loudness ${loudness.integrated_lufs.toFixed(1)} LUFS, off its ${limit} LUFS target${range}.`
        : `Loudness ${loudness.integrated_lufs.toFixed(1)} LUFS on its ${limit} LUFS target${range}.`;
    }
    case "true_peak":
      return flagged
        ? `True peak ${v?.toFixed(1)} dBTP: above ${limit}, so a platform's own encode may clip it.`
        : `True peak ${v?.toFixed(1)} dBTP (${limit} or below).`;
    default:
      return `${check.id}: ${check.result}`;
  }
}

export interface QualityLine {
  result: QualityCheck["result"];
  text: string;
}

/** Every check in plain words, flags first. */
export function qualityLines(report: QualityReport): QualityLine[] {
  const order = { flag: 0, pass: 1, info: 2 } as const;
  return [...report.checks]
    .sort((a, b) => order[a.result] - order[b.result])
    .map((check) => ({ result: check.result, text: line(check, report) }));
}

/** The report at a glance: what was measured and how it came out. */
export function qualitySummary(report: QualityReport): string {
  if (report.status === "unmeasured")
    return report.reason === "took too long"
      ? "Not measured: measuring took too long. The video is as rendered."
      : "Not measured: the measurement failed. The video is as rendered.";
  if (report.status === "passed_through")
    return "Passed through untouched: the picture is the source file's own, packet for packet.";
  const what = report.fidelity
    ? report.fidelity.every > 1
      ? `${report.fidelity.frames_measured} frames (every ${ordinal(report.fidelity.every)})`
      : `every frame (${report.fidelity.frames_measured})`
    : "the render";
  return report.flags
    ? `Measured ${what}: ${plural(report.flags, "flag")}, ${report.passes} passed.`
    : `Measured ${what}: all ${report.passes} checks passed.`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** What the measurement can't see: the clips' own encode before the final pass, at standard quality. */
export function referenceNote(report: QualityReport): string | null {
  if (report.status !== "measured") return null;
  if (report.intermediates === "lossless") return null;
  return report.intermediates === "mixed"
    ? "Measured against the render's picture before its final encode. Some of its clips were encoded once before that (there wasn't disk for them lossless), which this doesn't count."
    : "Measured against the render's picture before its final encode. At standard quality its clips were encoded once before that, which this doesn't count: render as Master for nothing lossy before the final encode.";
}

/**
 * What a master render did with its clips, from the media service's report
 * (`metadata.probe.mastering`), or whether it was passed through
 * (`metadata.probe.pass_through`), in plain words; null for neither.
 */
export function masteringNote(videoMetadata: unknown): string | null {
  const probe =
    isRecord(videoMetadata) && isRecord(videoMetadata["probe"]) ? videoMetadata["probe"] : null;
  if (!probe) return null;
  const through = isRecord(probe["pass_through"]) ? probe["pass_through"] : null;
  if (through?.["used"] === true) return "Passed through as it is: the file is the source's own.";
  const mastering = isRecord(probe["mastering"]) ? probe["mastering"] : null;
  const numbers = (value: unknown) =>
    Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
  const reason =
    through?.["used"] === false && typeof through["reason"] === "string"
      ? ` It couldn't go out as it is: ${through["reason"]}.`
      : "";
  if (!mastering) return reason ? reason.trim() : null;
  const standard = numbers(mastering["standard_clips"]);
  if (!standard.length) return `Master: every clip kept lossless, one fine encode.${reason}`;
  const gb = (value: unknown) =>
    typeof value === "number" ? `${(value / 1024 ** 3).toFixed(1)} GB` : null;
  const needed = gb(mastering["needed_bytes"]);
  const budget = gb(mastering["budget_bytes"]);
  return `Master: ${plural(standard.length, "clip")} (${standard.join(", ")}) encoded the standard way first${needed && budget ? `: lossless ones needed about ${needed} of the media service's ${budget}` : ""}.${reason}`;
}

/** A brand kit's own colours (its text, accent and background, and its palette), each once: what a render looks for. */
export function brandColoursOf(kit: Record<string, unknown> | null, limit = 12): string[] {
  if (!kit) return [];
  const hex = (value: unknown) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  const palette = Array.isArray(kit["palette"]) ? kit["palette"] : [];
  const all = [
    hex(kit["text_color"]),
    hex(kit["accent_color"]),
    hex(kit["background_color"]),
    ...palette.map((entry) => (isRecord(entry) ? hex(entry["hex"]) : null)),
  ];
  return [...new Set(all.filter((value): value is string => value !== null))].slice(0, limit);
}
