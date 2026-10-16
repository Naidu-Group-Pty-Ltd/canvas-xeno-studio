/**
 * What a render did at its smart-blended joins, read from the media service's
 * report on the rendered video (its library record's `metadata.probe
 * .smart_joins`; see media-worker/README.md). Pure, so it is unit-testable.
 */

export interface JoinReport {
  /** Smart-blended joins in the render. */
  joins: number;
  /** Of those, the ones put back in register. */
  matched: number;
  /** The most a join's next clip had been moved by its re-render, as a share of the frame. */
  largestMove: number | null;
  /** Joins whose colour, and whose detail, were matched. */
  colour: number;
  detail: number;
  /** Joins left as they were, and why. */
  left: { clip: number; reason: JoinLeftReason }[];
}

export type JoinLeftReason = "different_pictures" | "already_matching" | "unmeasured";

const REASONS: Record<JoinLeftReason, string> = {
  different_pictures: "the clips don't show the same picture there",
  already_matching: "they already matched",
  unmeasured: "it couldn't be measured",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** The report on a rendered video's smart joins, or null when it had none. */
export function readJoinReport(metadata: unknown): JoinReport | null {
  const probe = isRecord(metadata) && isRecord(metadata["probe"]) ? metadata["probe"] : null;
  const entries = probe && Array.isArray(probe["smart_joins"]) ? probe["smart_joins"] : null;
  if (!entries?.length) return null;
  const report: JoinReport = {
    joins: 0,
    matched: 0,
    largestMove: null,
    colour: 0,
    detail: 0,
    left: [],
  };
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    report.joins += 1;
    if (entry["matched"] === true) report.matched += 1;
    else {
      const reason = entry["left"];
      report.left.push({
        clip: typeof entry["clip"] === "number" ? entry["clip"] : -1,
        reason:
          reason === "different_pictures" || reason === "already_matching" ? reason : "unmeasured",
      });
    }
    const framing = isRecord(entry["framing"]) ? entry["framing"] : null;
    const moved = framing && typeof framing["moved"] === "number" ? framing["moved"] : null;
    if (moved !== null && Number.isFinite(moved)) {
      report.largestMove = Math.max(report.largestMove ?? 0, moved);
    }
    if (isRecord(entry["colour"])) report.colour += 1;
    if (isRecord(entry["detail"])) report.detail += 1;
  }
  return report.joins ? report : null;
}

/** The report as a line for people: what was put right, and what was left. */
export function joinSummary(report: JoinReport): string {
  const parts: string[] = [];
  if (report.matched) {
    const fixed: string[] = [];
    if (report.largestMove !== null && report.largestMove >= 0.002) {
      fixed.push(`framing (re-renders out by up to ${(report.largestMove * 100).toFixed(1)}%)`);
    }
    if (report.colour) fixed.push("colour");
    if (report.detail) fixed.push("detail");
    parts.push(
      `${report.matched} of ${report.joins} join${report.joins === 1 ? "" : "s"} smart-blended` +
        (fixed.length ? `: ${fixed.join(", ")}` : ""),
    );
  }
  const reasons = [...new Set(report.left.map((entry) => entry.reason))];
  if (report.left.length) {
    const what = reasons.map((reason) => REASONS[reason]).join("; ");
    parts.push(
      `${report.left.length} left as ${report.left.length === 1 ? "it was" : "they were"} (${what})`,
    );
  }
  return parts.join(" · ");
}
