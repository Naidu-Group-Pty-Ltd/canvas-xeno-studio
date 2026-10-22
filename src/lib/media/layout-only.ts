/**
 * Layout-only pictures. A screenshot supplied as a reference (a client's
 * portal, say) shows how a screen is laid out and may show real people's
 * details, so it can be marked layout only: it stays in the library to look
 * at and build from, but no generation and no edit may place it in a frame.
 * The mark is kept apart from the file (asset_privacy, migration
 * 0035_reference_privacy), and only the server writes it: anyone may mark a
 * picture, and only an admin may lift the mark. The server refuses a
 * layout-only file wherever it would reach a frame (see ./layout-only.server).
 *
 * Shared by the server, the browser and tests.
 */

/** Where a file was going when it was refused. */
export const PLACEMENTS = [
  "generation",
  "estimate",
  "provider",
  "katana",
  "edit",
  "render",
  "copy",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** The migration the marks live in, as people are told it. */
export const PRIVACY_MIGRATION = "0035_reference_privacy";

export const PRIVACY_NEEDS_UPDATE = `Reference screenshots need a database update (migration ${PRIVACY_MIGRATION}). Ask an admin to apply it.`;

/** A list of names in words: "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Why a layout-only file can't go where it was going, and what to do: the
 * same words wherever it is refused, naming the files (titles; untitled ones
 * as "a picture").
 */
export function layoutOnlyRefusal(titles: (string | null)[], where: Placement): string {
  const names = titles.map((title) => `“${title?.trim() || "A picture"}”`);
  const one = names.length === 1;
  const subject = one
    ? `${names[0]} is`
    : `${listed(names.slice(0, 3))}${names.length > 3 ? " and others" : ""} are`;
  const it = one ? "it" : "they";
  const them = one ? "it" : "them";
  const stays = one ? "it stays" : "they stay";
  const what: Record<Placement, string> = {
    generation: `so ${it} can't go into a generation. Take ${them} out of the references; ${stays} in the library to build from.`,
    estimate: `so ${it} can't be sent to a model, even to price one. Take ${them} out of the references.`,
    provider: `so ${it} can't be sent to Higgsfield.`,
    katana: `so ${it} can't be handed to Katana. Take ${them} out of the run.`,
    edit: `so ${it} can't be used in an edit. Take ${them} out of the timeline.`,
    render: `so this edit can't be rendered with ${them}. Take ${them} out of the timeline, then render again.`,
    copy: `so no copy can be made from ${them} here.`,
  };
  return `${subject} layout only: ${one ? "a reference" : "references"} for how a screen is laid out, never placed in a frame, ${what[where]} If ${it} may be shown after all, an admin can lift the mark in the library.`;
}

/** A file's privacy mark as the library shows it (null: it has none). */
export interface PrivacyMark {
  layoutOnly: boolean;
  /** Set on a redacted copy: how many areas were blurred in it. */
  redactedAreas: number | null;
  redactionId: string | null;
  note: string | null;
  markedAt: string | null;
}

type Json = Record<string, unknown>;

/** A privacy row as the browser or the server reads it. */
export function privacyMarkOf(row: unknown): PrivacyMark | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Json;
  const layoutOnly = record["layout_only"] === true;
  // A screenshot that joined the library with nothing blurred (0 areas) isn't a redacted copy.
  const areas = record["redacted_areas"];
  const redactedAreas = typeof areas === "number" && areas > 0 ? areas : null;
  if (!layoutOnly && redactedAreas === null) return null;
  return {
    layoutOnly,
    redactedAreas,
    redactionId: typeof record["redaction_id"] === "string" ? record["redaction_id"] : null,
    note: typeof record["note"] === "string" ? record["note"] : null,
    markedAt: typeof record["marked_at"] === "string" ? record["marked_at"] : null,
  };
}

/** The mark's short label for a card in the library. */
export function privacyBadge(mark: PrivacyMark | null): string | null {
  if (!mark) return null;
  if (mark.layoutOnly && mark.redactedAreas !== null) return "Redacted · layout only";
  if (mark.layoutOnly) return "Layout only";
  return "Redacted";
}
