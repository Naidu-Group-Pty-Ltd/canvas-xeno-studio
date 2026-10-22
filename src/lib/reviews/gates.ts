/**
 * Review gates on a project, as Reel 1 moved through them: style frames, an
 * animatic, a proof and the film, each approved before the next, costlier
 * stage began. A gate holds versions of what is being reviewed; each version
 * is approved, or changes are asked for, by a team member, and the record of
 * who decided what, and when, is kept whole (a new decision supersedes the
 * one before, never replaces it). A gate can be held until the one before it
 * is approved.
 *
 * A gate's state follows its latest version: no versions yet; in review
 * (the latest has no decision); changes asked for; or approved. A gate is
 * approved only while its latest version is: a new version reopens it, and
 * a gate held behind it waits again.
 *
 * Pure rules, shared by the Reviews section, the studio API and tests; the
 * database enforces the hold and the numbering too (migration 0030).
 */

/** The gates Reel 1 went through, offered to start a project's reviews with. */
export const STANDARD_GATES = ["Style frames", "Animatic", "Proof", "Film"] as const;

export const REVIEW_DECISIONS = ["approved", "changes_requested"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const VERSION_KINDS = ["files", "render", "storyboard"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export const VERSION_KIND_LABELS: Record<VersionKind, string> = {
  files: "Library files",
  render: "A render",
  storyboard: "A storyboard",
};

/** The most library files one version can hold (a gate of style frames, one a block). */
export const VERSION_FILE_LIMIT = 40;

export interface GateRow {
  id: string;
  project_id: string;
  name: string;
  position: number;
  held_until_previous: boolean;
  created_by: string | null;
  created_at: string;
}

export interface VersionRow {
  id: string;
  gate_id: string;
  number: number;
  kind: VersionKind;
  label: string;
  note: string | null;
  render_id: string | null;
  storyboard_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DecisionRow {
  id: string;
  version_id: string;
  decision: ReviewDecision;
  note: string | null;
  on_behalf_of: string | null;
  via: "app" | "api";
  decided_by: string | null;
  created_at: string;
}

export type GateStatus = "empty" | "in_review" | "changes_requested" | "approved";

export const GATE_STATUS_LABELS: Record<GateStatus, string> = {
  empty: "Nothing to review yet",
  in_review: "In review",
  changes_requested: "Changes asked for",
  approved: "Approved",
};

export interface GateState {
  gate: GateRow;
  status: GateStatus;
  /** Its versions, newest first. */
  versions: VersionRow[];
  latest: VersionRow | null;
  /** The latest version's own latest decision. */
  decision: DecisionRow | null;
  /** The last version approved, even when a newer one is in review since. */
  lastApproved: { version: VersionRow; decision: DecisionRow } | null;
  /** The gate before it that it waits for, while held; null when it can go ahead. */
  heldBy: GateRow | null;
}

const byTime = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1;

/** Gates in their order: by position, then the older first. */
export function orderGates<T extends Pick<GateRow, "position" | "created_at" | "id">>(
  gates: T[],
): T[] {
  return [...gates].sort((a, b) => a.position - b.position || byTime(a, b));
}

/** A version's decisions, the latest last. */
export function decisionsFor(decisions: DecisionRow[], versionId: string): DecisionRow[] {
  return decisions.filter((entry) => entry.version_id === versionId).sort(byTime);
}

/** Each gate's state, in the gates' order. */
export function gateStates(
  gates: GateRow[],
  versions: VersionRow[],
  decisions: DecisionRow[],
): GateState[] {
  const ordered = orderGates(gates);
  const states: GateState[] = [];
  for (const gate of ordered) {
    const own = versions
      .filter((version) => version.gate_id === gate.id)
      .sort((a, b) => b.number - a.number);
    const latest = own[0] ?? null;
    const decision = latest ? (decisionsFor(decisions, latest.id).at(-1) ?? null) : null;
    let lastApproved: GateState["lastApproved"] = null;
    for (const version of own) {
      const last = decisionsFor(decisions, version.id).at(-1);
      if (last?.decision === "approved") {
        lastApproved = { version, decision: last };
        break;
      }
    }
    const status: GateStatus = !latest
      ? "empty"
      : !decision
        ? "in_review"
        : decision.decision === "approved"
          ? "approved"
          : "changes_requested";
    const before = states.at(-1);
    const heldBy =
      gate.held_until_previous && before && before.status !== "approved" ? before.gate : null;
    states.push({ gate, status, versions: own, latest, decision, lastApproved, heldBy });
  }
  return states;
}

export type Allowed = { ok: true } | { ok: false; reason: string };

const held = (state: GateState): Allowed =>
  state.heldBy
    ? {
        ok: false,
        reason: `${state.gate.name} is held until ${state.heldBy.name} is approved.`,
      }
    : { ok: true };

/** Whether a version can be added to a gate now. */
export function canAddVersion(state: GateState): Allowed {
  return held(state);
}

/**
 * Whether a version can be decided now: only a gate's latest version (an
 * older one has been answered by the next), and a held gate can't be
 * approved until the gate before it is.
 */
export function canDecide(state: GateState, versionId: string, decision: ReviewDecision): Allowed {
  const version = state.versions.find((entry) => entry.id === versionId);
  if (!version) return { ok: false, reason: "That version isn't in this gate." };
  if (state.latest && version.id !== state.latest.id)
    return {
      ok: false,
      reason: `Version ${state.latest.number} is newer: decide on that one.`,
    };
  if (decision === "approved") return held(state);
  return { ok: true };
}

/** Where a new gate goes: after the last. */
export function nextPosition(gates: Pick<GateRow, "position">[]): number {
  return gates.reduce((most, gate) => Math.max(most, gate.position), 0) + 1;
}

/**
 * The positions to save to move a gate one place earlier (-1) or later (1):
 * every gate numbered again in its new order, so ties from older gates are
 * settled too. Only the gates whose position changes are returned.
 */
export function moveGate(
  gates: GateRow[],
  gateId: string,
  direction: -1 | 1,
): { id: string; position: number }[] {
  const ordered = orderGates(gates);
  const from = ordered.findIndex((gate) => gate.id === gateId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  const moved = [...ordered];
  [moved[from], moved[to]] = [moved[to]!, moved[from]!];
  return moved
    .map((gate, index) => ({ id: gate.id, position: index + 1, was: gate.position }))
    .filter((gate) => gate.position !== gate.was)
    .map(({ id, position }) => ({ id, position }));
}

/** "v3", the way versions are named. */
export const versionName = (version: Pick<VersionRow, "number">) => `v${version.number}`;
