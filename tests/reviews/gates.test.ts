import { describe, expect, test } from "bun:test";
import {
  canAddVersion,
  canDecide,
  gateStates,
  moveGate,
  nextPosition,
  orderGates,
  STANDARD_GATES,
  versionName,
  type DecisionRow,
  type GateRow,
  type VersionRow,
} from "../../src/lib/reviews/gates";

const PROJECT = "project-aurixa";

function gate(
  id: string,
  name: string,
  position: number,
  held = true,
  at = "2026-10-21T08:00:00Z",
) {
  return {
    id,
    project_id: PROJECT,
    name,
    position,
    held_until_previous: held,
    created_by: "producer",
    created_at: at,
  } satisfies GateRow;
}

function version(id: string, gateId: string, number: number, at: string): VersionRow {
  return {
    id,
    gate_id: gateId,
    number,
    kind: "files",
    label: `v${number}`,
    note: null,
    render_id: null,
    storyboard_id: null,
    created_by: "producer",
    created_at: at,
  };
}

function decision(
  id: string,
  versionId: string,
  value: DecisionRow["decision"],
  at: string,
  extra: Partial<DecisionRow> = {},
): DecisionRow {
  return {
    id,
    version_id: versionId,
    decision: value,
    note: null,
    on_behalf_of: null,
    via: "app",
    decided_by: "producer",
    created_at: at,
    ...extra,
  };
}

// Reel 1's gates, as the system edition went through them (HANDOVER 1.1).
const GATES = [
  gate("frames", "Style frames", 1, false),
  gate("animatic", "Animatic", 2),
  gate("proof", "Proof", 3),
  gate("film", "Film", 4),
];

describe("a gate's state", () => {
  test("follows its latest version: nothing yet, in review, changes asked for, approved", () => {
    const versions = [version("frames-1", "frames", 1, "2026-10-21T10:00:00Z")];
    expect(gateStates(GATES, [], [])[0]!.status).toBe("empty");
    expect(gateStates(GATES, versions, [])[0]!.status).toBe("in_review");
    const asked = [decision("d1", "frames-1", "changes_requested", "2026-10-21T11:00:00Z")];
    expect(gateStates(GATES, versions, asked)[0]!.status).toBe("changes_requested");
    // A later decision supersedes the one before it; both are kept.
    const approved = [...asked, decision("d2", "frames-1", "approved", "2026-10-21T12:00:00Z")];
    const state = gateStates(GATES, versions, approved)[0]!;
    expect(state.status).toBe("approved");
    expect(state.decision!.id).toBe("d2");
    expect(state.lastApproved!.version.id).toBe("frames-1");
  });

  test("goes back into review with a new version, remembering the one approved", () => {
    const versions = [
      version("film-1", "film", 1, "2026-10-22T09:00:00Z"),
      version("film-2", "film", 2, "2026-10-22T16:00:00Z"),
    ];
    const decisions = [decision("d1", "film-1", "approved", "2026-10-22T10:00:00Z")];
    const film = gateStates(GATES, versions, decisions).find((state) => state.gate.id === "film")!;
    expect(film.status).toBe("in_review");
    expect(film.latest!.id).toBe("film-2");
    expect(film.versions.map(versionName)).toEqual(["v2", "v1"]);
    expect(film.lastApproved!.version.id).toBe("film-1");
  });
});

describe("holding a gate until the one before it is approved", () => {
  // The style frames approved, the animatic in review.
  const versions = [
    version("frames-1", "frames", 1, "2026-10-21T10:00:00Z"),
    version("animatic-1", "animatic", 1, "2026-10-21T15:00:00Z"),
  ];
  const decisions = [decision("d1", "frames-1", "approved", "2026-10-21T12:00:00Z")];

  test("holds each gate behind one not yet approved, and lets it go once it is", () => {
    const states = gateStates(GATES, versions, decisions);
    expect(states.map((state) => state.heldBy?.id ?? null)).toEqual([
      null,
      null,
      "animatic",
      "proof",
    ]);
    expect(canAddVersion(states[1]!)).toEqual({ ok: true });
    expect(canAddVersion(states[2]!)).toEqual({
      ok: false,
      reason: "Proof is held until Animatic is approved.",
    });
  });

  test("holds a gate again when the one before it takes a new version", () => {
    const reopened = [...versions, version("frames-2", "frames", 2, "2026-10-21T16:00:00Z")];
    const states = gateStates(GATES, reopened, decisions);
    expect(states[0]!.status).toBe("in_review");
    expect(states[1]!.heldBy?.name).toBe("Style frames");
    // Changes can still be asked for on a held gate; it can't be approved.
    expect(canDecide(states[1]!, "animatic-1", "changes_requested")).toEqual({ ok: true });
    expect(canDecide(states[1]!, "animatic-1", "approved")).toEqual({
      ok: false,
      reason: "Animatic is held until Style frames is approved.",
    });
  });

  test("never holds a gate that isn't set to wait, or the first gate", () => {
    const loose = GATES.map((entry) => ({ ...entry, held_until_previous: entry.id !== "proof" }));
    const states = gateStates(loose, [], []);
    expect(states[0]!.heldBy).toBeNull();
    expect(states[2]!.heldBy).toBeNull();
    expect(states[3]!.heldBy?.id).toBe("proof");
  });
});

describe("deciding", () => {
  test("decides only a gate's latest version", () => {
    const versions = [
      version("proof-1", "proof", 1, "2026-10-22T08:00:00Z"),
      version("proof-2", "proof", 2, "2026-10-22T09:00:00Z"),
    ];
    const ready = [
      decision("a", "frames-1", "approved", "2026-10-21T12:00:00Z"),
      decision("b", "animatic-1", "approved", "2026-10-21T18:00:00Z"),
    ];
    const all = [
      ...versions,
      version("frames-1", "frames", 1, "2026-10-21T10:00:00Z"),
      version("animatic-1", "animatic", 1, "2026-10-21T15:00:00Z"),
    ];
    const proof = gateStates(GATES, all, ready).find((state) => state.gate.id === "proof")!;
    expect(canDecide(proof, "proof-1", "approved")).toEqual({
      ok: false,
      reason: "Version 2 is newer: decide on that one.",
    });
    expect(canDecide(proof, "proof-2", "approved")).toEqual({ ok: true });
    expect(canDecide(proof, "nowhere", "approved").ok).toBe(false);
  });

  test("walks Reel 1 from style frames to the third cut", () => {
    // Each approval in chat, recorded on behalf of the client.
    const client = { on_behalf_of: "Aurixa (the client, in chat)" };
    const versions = [
      version("frames-1", "frames", 1, "2026-10-21T10:00:00Z"),
      version("animatic-1", "animatic", 1, "2026-10-21T15:00:00Z"),
      version("proof-1", "proof", 1, "2026-10-22T08:00:00Z"),
      version("film-1", "film", 1, "2026-10-22T12:00:00Z"),
      version("film-2", "film", 2, "2026-10-22T20:00:00Z"),
    ];
    const decisions = [
      decision("a", "frames-1", "approved", "2026-10-21T12:00:00Z", client),
      decision("b", "animatic-1", "approved", "2026-10-21T18:00:00Z", client),
      decision("c", "proof-1", "approved", "2026-10-22T09:00:00Z", {
        ...client,
        note: "We can proceed using this method: captions in the brand's type, and the logo made with a video model.",
      }),
      decision("d", "film-1", "changes_requested", "2026-10-22T13:00:00Z", {
        ...client,
        note: "Fourteen notes.",
      }),
    ];
    const states = gateStates(GATES, versions, decisions);
    expect(states.map((state) => state.status)).toEqual([
      "approved",
      "approved",
      "approved",
      "in_review",
    ]);
    expect(states.every((state) => !state.heldBy)).toBe(true);
    expect(states[2]!.decision!.on_behalf_of).toBe("Aurixa (the client, in chat)");
    expect(states[3]!.lastApproved).toBeNull();
    expect(canDecide(states[3]!, "film-2", "approved")).toEqual({ ok: true });
  });
});

describe("ordering gates", () => {
  test("orders by position, then the older first", () => {
    const tied = [
      gate("b", "B", 2, false, "2026-10-21T09:00:00Z"),
      gate("a", "A", 2, false, "2026-10-21T08:00:00Z"),
      gate("c", "C", 1, false),
    ];
    expect(orderGates(tied).map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(nextPosition(tied)).toBe(3);
    expect(nextPosition([])).toBe(1);
  });

  test("moves a gate a place, renumbering only what changes", () => {
    expect(moveGate(GATES, "proof", -1)).toEqual([
      { id: "proof", position: 2 },
      { id: "animatic", position: 3 },
    ]);
    expect(moveGate(GATES, "frames", -1)).toEqual([]);
    expect(moveGate(GATES, "film", 1)).toEqual([]);
    expect(moveGate(GATES, "missing", 1)).toEqual([]);
    // Two gates sharing a position (from before a move) are settled as one moves: y keeps 1.
    const tied = [gate("x", "X", 1, false), gate("y", "Y", 1, false, "2026-10-21T09:00:00Z")];
    expect(moveGate(tied, "x", 1)).toEqual([{ id: "x", position: 2 }]);
  });

  test("offers Reel 1's four gates to start with", () => {
    expect(STANDARD_GATES).toEqual(["Style frames", "Animatic", "Proof", "Film"]);
  });
});
