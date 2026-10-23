import { beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";
import type { BarFeatures, MusicStructure } from "../../src/lib/music/structure";

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

// A track of 24 bars at 120 BPM (a bar every 2 s from 1 s): an intro of 8 bars, then the drop.
const STRUCTURE: MusicStructure = {
  bpm: 120,
  beats: Array.from({ length: 96 }, (_, beat) => 1 + beat * 0.5),
  beatsPerBar: 4,
  downbeats: Array.from({ length: 24 }, (_, bar) => 1 + bar * 2),
  bars: Array.from({ length: 24 }, (_, bar) => 1 + bar * 2),
  sections: [
    { start: 0, end: 17, kind: "intro", energy: 0.1 },
    { start: 17, end: 49.5, kind: "drop", energy: 1 },
  ],
  confidence: 0.9,
};
const FEATURES: BarFeatures = {
  version: 1,
  loudness: Array.from({ length: 24 }, (_, bar) => (bar < 8 ? -30 : -10)),
  bands: Array.from({ length: 24 }, () => new Array(6).fill(-20)),
  chroma: Array.from({ length: 24 }, (_, bar) =>
    Array.from({ length: 12 }, (_, pc) => (pc === bar % 4 ? 1 : 0)),
  ),
  rhythm: Array.from({ length: 24 }, () => new Array(8).fill(0.5)),
};

const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const still = db.add("assets", { asset_type: "image", title: "Still", deleted_at: null });
const music = db.add("assets", { asset_type: "audio", title: "Bed", deleted_at: null });
const unfound = db.add("assets", { asset_type: "audio", title: "Not yet", deleted_at: null });
const before = db.add("assets", { asset_type: "audio", title: "Before 0033", deleted_at: null });
db.add("music_tracks", {
  asset_id: music["id"],
  title: "Bed",
  structure: STRUCTURE,
  bar_features: FEATURES,
});
db.add("music_tracks", {
  asset_id: unfound["id"],
  title: "Not yet",
  structure: null,
  bar_features: null,
});
// A database without migration 0033 has no structure columns at all.
db.add("music_tracks", { asset_id: before["id"], title: "Before 0033" });

async function tokenFor(scopes: string[]) {
  const token = newApiToken((bytes: Uint8Array) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: member["id"],
    name: "test",
    token_prefix: tokenPrefixOf(token),
    token_hash: await tokens.hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  return token;
}

type Answer = { result?: Record<string, unknown>; error?: { code: string; message: string } };

async function run(token: string, name: string, body: unknown) {
  const response = await mcp.handleRestRequest(
    new Request(`https://studio.test/api/public/studio/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    name,
  );
  return { status: response.status, body: (await response.json()) as Answer };
}

beforeAll(async () => {
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});

describe("music on its bars over the API", () => {
  test("a track's bars and sections, as found in the Editor", async () => {
    const reader = await tokenFor(["read"]);
    const found = await run(reader, "get_music_structure", { assetId: music["id"] });
    expect(found.status).toBe(200);
    expect(found.body.result).toMatchObject({ bpm: 120, beatsPerBar: 4, confidence: 0.9 });
    expect((found.body.result!["bars"] as number[]).length).toBe(24);
    expect(found.body.result!["sections"]).toEqual([
      { index: 0, start: 0, end: 17, kind: "intro", energy: 0.1 },
      { index: 1, start: 17, end: 49.5, kind: "drop", energy: 1 },
    ]);
    expect("beats" in found.body.result!).toBe(false);
    const withBeats = await run(reader, "get_music_structure", {
      assetId: music["id"],
      includeBeats: true,
    });
    expect((withBeats.body.result!["beats"] as number[]).length).toBe(96);
  });

  test("says how to find them, or what the database needs, when they aren't kept", async () => {
    const reader = await tokenFor(["read"]);
    const notYet = await run(reader, "get_music_structure", { assetId: unfound["id"] });
    expect(notYet.status).toBe(400);
    expect(notYet.body.error?.message).toContain("Find bars and sections");
    const old = await run(reader, "get_music_structure", { assetId: before["id"] });
    expect(old.body.error?.message).toContain("migration 0033_music_structure");
    expect(old.body.error?.message).toContain("Ask an admin to apply it.");
    const elsewhere = await run(reader, "get_music_structure", { assetId: still["id"] });
    expect(elsewhere.body.error?.message).toContain("isn't in the music library");
  });

  test("fits an edit's music on its bars, landing the drop on a time, at the version read", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const made = await run(editor, "create_edit", {
      title: "Reel",
      timeline: {
        clips: [{ id: "c1", assetId: still["id"], kind: "image", duration: 40 }],
        audio: [{ id: "m1", assetId: music["id"], role: "music", start: 0, sourceDuration: 49.5 }],
      },
    });
    const { sequenceId } = made.body.result as { sequenceId: string };

    // Asked first only what it would do: nothing changes.
    const asked = await run(editor, "fit_music", {
      sequenceId,
      expectedVersion: 1,
      ending: "bar",
      landmarks: [{ section: 1, at: 13 }],
      apply: false,
    });
    expect(asked.status).toBe(200);
    const plan = asked.body.result!["plan"] as {
      seconds: number;
      pieces: { from: number; to: number }[];
      edits: { kind: string; bar: number; count: number }[];
      landmarks: { section: number; at: number }[];
    };
    expect(plan.edits).toEqual([expect.objectContaining({ kind: "remove", bar: 4, count: 2 })]);
    expect(plan.landmarks[0]!.at).toBeCloseTo(13, 3);
    expect(db.find("sequences", sequenceId)!["version"]).toBe(1);

    const applied = await run(editor, "fit_music", {
      sequenceId,
      expectedVersion: 1,
      ending: "bar",
      landmarks: [{ section: 1, at: 13 }],
    });
    expect(applied.body.result!["version"]).toBe(2);
    const timeline = db.find("sequences", sequenceId)!["timeline"] as {
      audio: { pieces?: unknown; duration: unknown; fittedTo?: number }[];
    };
    expect(timeline.audio[0]!.pieces).toEqual(plan.pieces);
    expect(timeline.audio[0]!.duration).toBeNull();
    // Fitted to the edit (40 s from its start), it says so, so a later change in the edit shows.
    expect((timeline.audio[0] as { fittedTo?: number }).fittedTo).toBe(40);

    const stale = await run(editor, "fit_music", { sequenceId, expectedVersion: 1 });
    expect(stale.body.error?.message).toContain("changed since that version");
    const noMusic = await run(editor, "fit_music", {
      sequenceId,
      expectedVersion: 2,
      itemId: "c1",
    });
    expect(noMusic.body.error?.message).toContain("isn't music in this edit");

    // Fitted to a length of its own, it isn't tied to the edit's.
    const own = await run(editor, "fit_music", { sequenceId, expectedVersion: 2, seconds: 30 });
    expect(own.body.result!["version"]).toBe(3);
    const after = db.find("sequences", sequenceId)!["timeline"] as {
      audio: { fittedTo?: number }[];
    };
    expect(after.audio[0]!.fittedTo).toBeUndefined();
  });

  test("fitting changes an edit, so it needs the edit scope", async () => {
    const reader = await tokenFor(["read"]);
    const denied = await run(reader, "fit_music", {
      sequenceId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 1,
    });
    expect(denied.status).toBe(403);
  });
});
