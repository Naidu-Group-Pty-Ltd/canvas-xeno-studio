/**
 * A take aligned to the picture it must end on (or start on): a logo's
 * reveal that must land on the logo exactly, a living card that must start
 * on the card. The media worker registers the take on the picture, matches
 * its colour, and crosses to the picture itself before anything else moves
 * (its align_take task); this is what it reports, as the app and the API
 * read it. See ./align-take.server.
 *
 * Shared by the server, the browser and tests.
 */

export const ALIGN_ANCHORS = ["last", "first"] as const;
export type AlignAnchor = (typeof ALIGN_ANCHORS)[number];

/** The cross to the picture and its hold, in seconds: the worker's limits. */
export const ALIGN_LIMITS = { cross: 3, hold: 10 } as const;
export const ALIGN_DEFAULTS = { cross: 0.5, hold: 0.5 } as const;

export interface PlaneMatch {
  gain: number;
  offset: number;
}

export interface AlignmentReport {
  anchor: AlignAnchor;
  /** How alike the frame and the picture were (1 is identical), before and once in register. */
  likenessBefore: number;
  likenessAfter: number;
  registered: boolean;
  /** How the take showed the picture: its size (1 the same) and how far it was moved, in pixels. */
  framing: { scaleX: number; scaleY: number; shiftX: number; shiftY: number } | null;
  /** The match made on each plane (light, then the two colour planes), where one was needed. */
  colour: { y: PlaneMatch | null; u: PlaneMatch | null; v: PlaneMatch | null } | null;
  /** How far the anchor frame was from the picture, in levels of light (0-255), before and after. */
  errorBefore: number;
  errorAfter: number | null;
  /** Set when the frame wasn't the picture at all, so nothing was moved. */
  differentPictures: boolean;
  crossSeconds: number;
  holdSeconds: number;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function planeMatch(value: unknown): PlaneMatch | null {
  const record = asRecord(value);
  return typeof record["gain"] === "number" && typeof record["offset"] === "number"
    ? { gain: record["gain"], offset: record["offset"] }
    : null;
}

/** The worker's report, from a finished task's metadata (null when there is none). */
export function alignmentOf(metadata: unknown): AlignmentReport | null {
  const report = asRecord(asRecord(metadata)["alignment"]);
  if (!Object.keys(report).length) return null;
  const framing = asRecord(report["framing"]);
  const colour = asRecord(report["colour"]);
  const errors = asRecord(report["anchor_error_levels"]);
  return {
    anchor: report["anchor"] === "first" ? "first" : "last",
    likenessBefore: numberOr(report["likeness_before"], 0),
    likenessAfter: numberOr(report["likeness_after"], 0),
    registered: report["registered"] === true,
    framing: Object.keys(framing).length
      ? {
          scaleX: numberOr(framing["scale_x"], 1),
          scaleY: numberOr(framing["scale_y"], 1),
          shiftX: numberOr(framing["shift_x"], 0),
          shiftY: numberOr(framing["shift_y"], 0),
        }
      : null,
    colour: Object.keys(colour).length
      ? { y: planeMatch(colour["y"]), u: planeMatch(colour["u"]), v: planeMatch(colour["v"]) }
      : null,
    errorBefore: numberOr(errors["before"], 0),
    errorAfter: typeof errors["after"] === "number" ? errors["after"] : null,
    differentPictures: report["left"] === "different_pictures",
    crossSeconds: numberOr(report["cross_seconds"], 0),
    holdSeconds: numberOr(report["hold_seconds"], 0),
  };
}

const pixels = (value: number) => {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return `${rounded} px`;
};

/** How the take was moved, in words: "moved 7 px left and 4 px down, 3% smaller". */
function framingWords(framing: NonNullable<AlignmentReport["framing"]>): string | null {
  const parts: string[] = [];
  // The take showed the picture moved by (shiftX, shiftY), so it was moved back the other way.
  const across =
    Math.abs(framing.shiftX) >= 0.5
      ? `${pixels(framing.shiftX)} ${framing.shiftX > 0 ? "left" : "right"}`
      : null;
  const down =
    Math.abs(framing.shiftY) >= 0.5
      ? `${pixels(framing.shiftY)} ${framing.shiftY > 0 ? "up" : "down"}`
      : null;
  if (across || down) parts.push(`moved ${[across, down].filter(Boolean).join(" and ")}`);
  const scale = (framing.scaleX + framing.scaleY) / 2;
  if (Math.abs(scale - 1) >= 0.002) {
    const percent = Math.round(Math.abs(1 / scale - 1) * 1000) / 10;
    parts.push(`${percent}% ${scale > 1 ? "smaller" : "larger"}`);
  }
  return parts.length ? parts.join(", ") : null;
}

/** One line for people on what was done, e.g. for the library. */
export function alignmentSummary(report: AlignmentReport): string {
  const end = report.anchor === "last" ? "ends on" : "starts on";
  if (report.differentPictures)
    return `The take's ${report.anchor} frame isn't the picture it should land on (likeness ${report.likenessBefore.toFixed(2)}), so nothing was moved: it just crosses to the picture. Look at the take before using it.`;
  const moves: string[] = [];
  const framing = report.framing ? framingWords(report.framing) : null;
  if (framing) moves.push(framing);
  const light = report.colour?.y ?? null;
  if (light) {
    const shift = Math.round((128 * (light.gain - 1) + light.offset) * 10) / 10;
    if (Math.abs(shift) >= 0.5)
      moves.push(`${shift > 0 ? "lighter" : "darker"} by ${Math.abs(shift)} levels`);
  }
  if (report.colour?.u || report.colour?.v) moves.push("its colour matched");
  const done = moves.length ? `${moves.join("; ")}. ` : "Already in register. ";
  const after =
    report.errorAfter !== null
      ? `It now ${end} the picture within ${report.errorAfter.toFixed(1)} levels (from ${report.errorBefore.toFixed(1)})`
      : `It ${end} the picture`;
  const cross = report.crossSeconds > 0 ? `, crossing to it over ${report.crossSeconds} s` : "";
  return `${done.charAt(0).toUpperCase()}${done.slice(1)}${after}${cross}.`;
}
