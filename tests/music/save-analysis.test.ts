import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BarFeatures, MusicStructure } from "../../src/lib/music/structure";

// A stand-in for the admin client: an active member, and every update to a
// track recorded. A database without migration 0033 refuses the structure
// columns the way PostgREST does.
const updates: Array<Record<string, unknown>> = [];
let structureColumns: "present" | "missing" | "broken" = "present";
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "profiles"
              ? { data: { id: "user-1", is_active: true, role: "member" }, error: null }
              : { data: null, error: null },
        }),
      }),
      update: (values: Record<string, unknown>) => {
        const refused =
          "structure" in values && structureColumns !== "present"
            ? structureColumns === "missing"
              ? {
                  code: "PGRST204",
                  message:
                    "Could not find the 'bar_features' column of 'music_tracks' in the schema cache",
                }
              : { code: "XX000", message: "the database is down" }
            : null;
        if (!refused) updates.push(values);
        const result = { data: null, error: refused };
        const chain = {
          eq: () => chain,
          is: () => chain,
          then: (resolve: (value: typeof result) => unknown) => resolve(result),
        };
        return chain;
      },
    }),
  },
}));

const { saveTrackAnalysis, STRUCTURE_NEEDS_MIGRATION } =
  await import("../../src/lib/music/service.server");

const STRUCTURE: MusicStructure = {
  bpm: 120,
  beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5],
  beatsPerBar: 4,
  downbeats: [0.5, 2.5, 4.5],
  bars: [0.5, 2.5],
  sections: [{ start: 0, end: 5, kind: "section", energy: 1 }],
  confidence: 0.9,
};
const FEATURES: BarFeatures = {
  version: 1,
  loudness: [-10, -10],
  bands: [new Array(6).fill(-20), new Array(6).fill(-20)],
  chroma: [new Array(12).fill(1 / 12), new Array(12).fill(1 / 12)],
  rhythm: [new Array(8).fill(0.5), new Array(8).fill(0.5)],
};
const BASE = {
  userId: "user-1",
  trackId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  bpm: 120,
  beats: STRUCTURE.beats,
  durationSeconds: null,
};

beforeEach(() => {
  updates.length = 0;
  structureColumns = "present";
});

describe("keeping a track's analysis", () => {
  test("the beats, then the bars and sections in their own columns", async () => {
    const kept = await saveTrackAnalysis({ ...BASE, structure: STRUCTURE, features: FEATURES });
    expect(kept).toEqual({ structureKept: true, message: null });
    expect(updates).toEqual([
      { bpm: 120, beats: STRUCTURE.beats },
      { structure: STRUCTURE, bar_features: FEATURES },
    ]);
  });

  test("before migration 0033 the beats are still kept, and it says what to ask for", async () => {
    structureColumns = "missing";
    const kept = await saveTrackAnalysis({ ...BASE, structure: STRUCTURE, features: FEATURES });
    expect(kept.structureKept).toBe(false);
    expect(kept.message).toBe(STRUCTURE_NEEDS_MIGRATION);
    expect(kept.message).toContain("migration 0033_music_structure");
    expect(kept.message).toContain("Ask an admin to apply it.");
    expect(updates).toEqual([{ bpm: 120, beats: STRUCTURE.beats }]);
  });

  test("any other failure to keep the structure is reported", async () => {
    structureColumns = "broken";
    await expect(
      saveTrackAnalysis({ ...BASE, structure: STRUCTURE, features: FEATURES }),
    ).rejects.toThrow("bars and sections couldn't be");
  });

  test("music with no bars found keeps its beats only", async () => {
    const kept = await saveTrackAnalysis(BASE);
    expect(kept).toEqual({ structureKept: false, message: null });
    expect(updates).toHaveLength(1);
  });
});
