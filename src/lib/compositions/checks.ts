/**
 * How a drawing's frames were checked, as the media worker reports it for each
 * task that drew them (media-worker/src/settle.js): every drawing kept once two
 * captures of it agreed, and for a final drawing a sample of frames put to the
 * vote, drawn again by a browser of its own. A drawing in stretches is checked
 * stretch by stretch, so its checks are theirs together. Pure.
 */

/** What a completed drawing's checks came to. */
export interface DrawingChecks {
  /** Frames whose drawings had to be captured again before two captures agreed. */
  recaptured: number;
  /** Frames with a drawing that never settled: kept as last captured. */
  unsettled: number[];
  /** Frames put to the vote, or null where none were (a draft). */
  voted: number | null;
  /** Of those, where the run and the draw made to check it disagreed... */
  disagreed: number[];
  /** ...the frame two draws agreed on replaced the run's... */
  replaced: number[];
  /** ...or no two agreed, and the run's frame stands. */
  unresolved: number[];
  /** Tasks the media service ran before it reported its checks: nothing is known of their frames. */
  unreported: number;
}

type Report = {
  settle?: { frames_recaptured?: unknown; unsettled?: unknown } | null;
  verified?: {
    frames?: unknown;
    disagreed?: unknown;
    replaced_by_agreement?: unknown;
    unresolved?: unknown;
  } | null;
};

const frames = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((f): f is number => Number.isInteger(f)) : [];

/**
 * The checks of the tasks that drew a composition, from each task's metadata
 * (its `composition` block, as the worker reports it), in frame order.
 */
export function drawingChecksOf(reports: (unknown | null | undefined)[]): DrawingChecks {
  const out: DrawingChecks = {
    recaptured: 0,
    unsettled: [],
    voted: null,
    disagreed: [],
    replaced: [],
    unresolved: [],
    unreported: 0,
  };
  for (const raw of reports) {
    const report = (raw && typeof raw === "object" ? raw : {}) as Report;
    if (!report.settle || typeof report.settle !== "object") {
      out.unreported += 1;
      continue;
    }
    const recaptured = Number(report.settle.frames_recaptured);
    out.recaptured += Number.isFinite(recaptured) ? recaptured : 0;
    out.unsettled.push(...frames(report.settle.unsettled));
    const vote = report.verified;
    if (vote && typeof vote === "object") {
      const voted = Number(vote.frames);
      out.voted = (out.voted ?? 0) + (Number.isFinite(voted) ? voted : 0);
      out.disagreed.push(...frames(vote.disagreed));
      out.replaced.push(...frames(vote.replaced_by_agreement));
      out.unresolved.push(...frames(vote.unresolved));
    }
  }
  for (const list of [out.unsettled, out.disagreed, out.replaced, out.unresolved])
    list.sort((a, b) => a - b);
  return out;
}

/** The checks in a sentence, for the Editor and the API: null where nothing was reported. */
export function describeChecks(checks: DrawingChecks | null): string | null {
  if (
    !checks ||
    (checks.unreported &&
      checks.voted === null &&
      checks.recaptured === 0 &&
      !checks.unsettled.length)
  )
    return null;
  const parts = [
    checks.recaptured
      ? `${checks.recaptured} frame${checks.recaptured === 1 ? "" : "s"} captured again before two captures agreed`
      : "every drawing settled at once",
  ];
  if (checks.unsettled.length)
    parts.push(
      `${checks.unsettled.length} with a drawing that never settled (${checks.unsettled.join(", ")})`,
    );
  if (checks.voted !== null) {
    const outcome = checks.disagreed.length
      ? `${checks.disagreed.length} disagreed: ${checks.replaced.length} replaced by the frame two draws agreed on` +
        (checks.unresolved.length
          ? `, ${checks.unresolved.length} unresolved (${checks.unresolved.join(", ")})`
          : "")
      : "all agreed";
    parts.push(
      `${checks.voted} frame${checks.voted === 1 ? "" : "s"} drawn again to check: ${outcome}`,
    );
  }
  return `${parts.join("; ")}.`;
}
