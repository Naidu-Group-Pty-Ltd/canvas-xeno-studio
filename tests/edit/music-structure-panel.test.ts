import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseTimeline, layoutTimeline, type Timeline } from "../../src/lib/edit/timeline";
import { fitMusicToLength } from "../../src/lib/music/fit";
import type { KnownStructure } from "../../src/hooks/useMusicStructure";

// A track of 24 bars at 120 BPM (a bar every 2 s from 1 s): an intro of 8 bars, then the drop.
const KNOWN: KnownStructure = {
  structure: {
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
  },
  features: {
    version: 1,
    loudness: Array.from({ length: 24 }, (_, bar) => (bar < 8 ? -30 : -10)),
    bands: Array.from({ length: 24 }, () => new Array(6).fill(-20)),
    chroma: Array.from({ length: 24 }, (_, bar) =>
      Array.from({ length: 12 }, (_, pc) => (pc === bar % 4 ? 1 : 0)),
    ),
    rhythm: Array.from({ length: 24 }, () => new Array(8).fill(0.5)),
  },
};

// The track's structure is known (found earlier); nothing here reaches the network.
mock.module("@/hooks/useMusicStructure", () => ({
  useMusicStructure: () => ({ data: KNOWN, isPending: false }),
  findStructure: async () => ({ beats: null, known: KNOWN, duration: 49.5, note: null }),
  rememberStructure: () => undefined,
}));

const { MusicPiecesNote, MusicStructureSection } =
  await import("../../src/components/editor/MusicStructureSection");
const { proposeFit } = await import("../../src/hooks/useFitProposal");

const MUSIC = "cccccccc-1111-4111-8111-111111111111";

function edit(audio: Record<string, unknown> = {}): Timeline {
  const timeline = parseTimeline({
    clips: [
      { id: "c", assetId: "aaaaaaaa-1111-4111-8111-111111111111", kind: "image", duration: 40 },
    ],
    audio: [{ id: "m1", assetId: MUSIC, role: "music", sourceDuration: 49.5, ...audio }],
  });
  if (!timeline) throw new Error("the edit didn't parse");
  return timeline;
}

function render(timeline: Timeline): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MusicStructureSection, {
        bed: timeline.audio[0]!,
        track: undefined,
        layout: layoutTimeline(timeline),
        playhead: () => 0,
        onUpdate: () => undefined,
      }),
    ),
  );
}

describe("the Music panel's bars and sections", () => {
  test("shows the tempo, the bars and where each section plays in the edit", () => {
    const html = render(edit());
    expect(html).toContain("120 BPM · 4/4 · 24 bars");
    expect(html).toContain("Intro");
    expect(html).toContain("Drop");
    expect(html).toContain("0:17.0");
    expect(html).toContain("Fit to the edit");
    expect(html).toContain("The edit (0:40.0)");
  });

  test("a proposed fit says which bars go, where the landmark lands, and lays the pieces out", () => {
    const timeline = edit();
    const fit = fitMusicToLength(KNOWN.structure, KNOWN.features, 40, {
      landmarks: [{ section: 1, at: 13 }],
      ending: "bar",
    })!;
    proposeFit("m1", fit);
    try {
      const html = render(timeline);
      // Two bars of the intro go so the drop lands at 13 s; it stops on the bar line nearest 40 s.
      expect(html).toContain("Plays 0:40.9 in 2 pieces");
      expect(html).toContain("Bars 5 to 6 of the intro left out");
      expect(html).toContain("The drop starts at 0:13.0");
      expect(html).toContain("Apply");
      expect(html).toContain(">1–4</div>");
      expect(html).toContain(">7–22</div>");
    } finally {
      proposeFit("m1", null);
    }
  });

  test("an item in pieces says so in its settings, with the way back to the whole track", () => {
    const item = edit({
      pieces: [
        { from: 0, to: 8.98 },
        { from: 4.98, to: 49.5 },
      ],
    }).audio[0]!;
    const html = renderToStaticMarkup(
      createElement(MusicPiecesNote, { item, onPlayWhole: () => undefined }),
    );
    expect(html).toContain("Edited on its bars: plays 2 pieces");
    expect(html).toContain("Play the whole track");
    expect(
      renderToStaticMarkup(
        createElement(MusicPiecesNote, { item: edit().audio[0]!, onPlayWhole: () => undefined }),
      ),
    ).toBe("");
  });
});
