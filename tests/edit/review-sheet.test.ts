import { describe, expect, test } from "bun:test";
import {
  briefImageNotes,
  draftNotes,
  reviewSheetParams,
  reviewSheetState,
  reviewTiles,
  shotNotes,
  tileWidthFor,
} from "../../src/lib/edit/review-sheet";
import { parseTimeline, type Timeline } from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import * as review from "../../media-worker/src/review.js";

interface SheetPlan {
  tiles: { time: number; label: string; note: string }[];
  columns: number;
  tileWidth: number;
  title: string;
}
interface Geometry {
  tileWidth: number;
  tileHeight: number;
  band: number;
  labelSize: number;
  noteSize: number;
  pad: number;
  header: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
}
const worker = review as {
  REVIEW_LIMITS: { tiles: number; label: number; note: number; title: number; columns: number };
  sheetText: (value: unknown, max: number) => string;
  planReviewSheet: (params: unknown) => SheetPlan;
  sheetGeometry: (plan: SheetPlan, width: number, height: number) => Geometry;
  sheetScript: (plan: SheetPlan, geometry: Geometry) => string;
};

const tiles = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    time: index,
    label: `${index + 1} · Shot`,
    note: "0:00.5",
  }));

describe("a review sheet's text", () => {
  test("is one paragraph without anything that could act as markup", () => {
    expect(worker.sheetText("{\\b1}Bold{\\b0} and\nnext line\\N", 80)).toBe(
      "b1Boldb0 and next lineN",
    );
    expect(worker.sheetText("one\ntwo\nthree\nfour\nfive", 80)).toBe("one two three four five");
    expect(worker.sheetText("  spaced   out \t text ", 80)).toBe("spaced out text");
    expect(worker.sheetText(42, 80)).toBe("");
    expect(worker.sheetText(undefined, 80)).toBe("");
  });

  test("is cut at a word, with an ellipsis, to its length", () => {
    expect(worker.sheetText("The quick brown fox jumps over the lazy dog", 20)).toBe(
      "The quick brown…",
    );
    expect(worker.sheetText("a".repeat(30), 10)).toBe(`${"a".repeat(9)}…`);
    expect(worker.sheetText("Short enough", 12)).toBe("Short enough");
  });
});

describe("a review sheet's parameters", () => {
  test("take the frames, with a default layout", () => {
    const plan = worker.planReviewSheet({
      tiles: [
        { time: 0.5, label: "1 · Orbit", note: "0:00.5 · The globe turns" },
        { time: "1.25", label: "1 · last frame" },
      ],
    });
    expect(plan).toEqual({
      tiles: [
        { time: 0.5, label: "1 · Orbit", note: "0:00.5 · The globe turns" },
        { time: 1.25, label: "1 · last frame", note: "" },
      ],
      // Never more columns than frames.
      columns: 2,
      tileWidth: 270,
      title: "",
    });
  });

  test("hold labels, notes and the title to their lengths", () => {
    const plan = worker.planReviewSheet({
      title: "t".repeat(300),
      tiles: [{ time: 0, label: "l".repeat(300), note: "n".repeat(300) }],
    });
    expect(plan.title.length).toBe(worker.REVIEW_LIMITS.title);
    expect(plan.tiles[0].label.length).toBe(worker.REVIEW_LIMITS.label);
    expect(plan.tiles[0].note.length).toBe(worker.REVIEW_LIMITS.note);
  });

  test("round the tiles' width to even pixels and the columns to whole ones", () => {
    const plan = worker.planReviewSheet({ tiles: tiles(8), tile_width: 271, columns: 2.6 });
    expect(plan.tileWidth).toBe(272);
    expect(plan.columns).toBe(3);
  });

  test("refuse what can't be laid out", () => {
    const refused = (params: unknown) => {
      try {
        worker.planReviewSheet(params);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(refused({})).toBe("A review sheet needs at least one frame");
    expect(refused({ tiles: tiles(121) })).toBe("A review sheet holds at most 120 frames");
    expect(refused({ tiles: [{ label: "no time" }] })).toBe("frame 1 time is required");
    expect(refused({ tiles: [{ time: "soon" }] })).toBe("frame 1 time must be a number");
    expect(refused({ tiles: [{ time: -1 }] })).toBe("frame 1 time must be between 0 and 86400");
    expect(refused({ tiles: tiles(2), columns: 9 })).toBe("columns must be between 1 and 8");
    expect(refused({ tiles: tiles(2), tile_width: 100 })).toBe(
      "tile_width must be between 120 and 640",
    );
    expect(refused({ tiles: tiles(120) })).toBeNull();
  });
});

describe("a review sheet's layout", () => {
  test("puts tiles in the video's shape over their label bands, under a heading", () => {
    const plan = worker.planReviewSheet({ title: "Reel · version 3", tiles: tiles(4) });
    expect(worker.sheetGeometry(plan, 1080, 1920)).toEqual({
      tileWidth: 270,
      tileHeight: 480,
      band: 86,
      labelSize: 15,
      noteSize: 13,
      pad: 8,
      header: 42,
      columns: 4,
      rows: 1,
      // 16-pixel margins, 8 between tiles.
      width: 16 + 4 * 270 + 3 * 8 + 16,
      height: 16 + 42 + 480 + 86 + 16,
    });
  });

  test("leaves out the heading without a title, and wraps tiles into rows", () => {
    const plan = worker.planReviewSheet({ tiles: tiles(6), columns: 4, tile_width: 384 });
    const geometry = worker.sheetGeometry(plan, 1920, 1080);
    expect(geometry.header).toBe(0);
    expect(geometry.tileHeight).toBe(216);
    expect(geometry.rows).toBe(2);
    expect(geometry.height).toBe(16 + 2 * (216 + geometry.band) + 8 + 16);
  });

  test("takes more columns rather than grow too tall, and refuses a sheet too big to make", () => {
    // A tall picture: four across would be 30 rows and 30,144 pixels tall.
    const tall = worker.planReviewSheet({ tiles: tiles(120), tile_width: 300 });
    const geometry = worker.sheetGeometry(tall, 1080, 3240);
    expect([geometry.columns, geometry.rows, geometry.height]).toEqual([5, 24, 24_120]);
    const big = worker.planReviewSheet({ tiles: tiles(120), tile_width: 640 });
    expect(() => worker.sheetGeometry(big, 1080, 1920)).toThrow(/too big/);
    // The app's own sheets: 120 tiles of a vertical video at 270 pixels.
    const usual = worker.sheetGeometry(
      worker.planReviewSheet({ tiles: tiles(120), columns: 6 }),
      1080,
      1920,
    );
    expect(usual.width * usual.height).toBeLessThan(20_000_000);
  });
});

describe("a review sheet's script", () => {
  const plan = worker.planReviewSheet({
    title: "Reel, version 3",
    tiles: [
      { time: 0.5, label: "1 · {\\b1}Orbit{\\b0}", note: "0:00.5 · The globe turns, slowly" },
      { time: 1, label: "1 · last frame", note: "" },
      { time: 2, label: "", note: "A note with no label" },
    ],
  });
  const geometry = worker.sheetGeometry(plan, 1080, 1920);
  const script = worker.sheetScript(plan, geometry);
  const events = script.split("\n").filter((line) => line.startsWith("Dialogue: "));

  test("is sized to the sheet", () => {
    expect(script).toContain(`PlayResX: ${geometry.width}`);
    expect(script).toContain(`PlayResY: ${geometry.height}`);
  });

  test("draws the title, each label and each note in its own box, without markup", () => {
    expect(events.length).toBe(1 + 2 + 2);
    expect(script).not.toContain("{\\b1}");
    const fields = events.map((line) => line.slice("Dialogue: ".length).split(","));
    // The text is the tenth field and keeps its own commas.
    expect(fields[0].slice(9).join(",")).toBe("Reel, version 3");
    expect(fields[1].slice(9).join(",")).toBe("1 · b1Orbitb0");
    expect(fields[2].slice(9).join(",")).toBe("0:00.5 · The globe turns, slowly");
    const box = geometry.tileWidth - geometry.pad * 2;
    const [, , , style, , left, right, top] = fields[1];
    expect(style).toBe("Label");
    expect(Number(left)).toBe(16 + geometry.pad);
    expect(Number(right)).toBe(geometry.width - Number(left) - box);
    expect(Number(top)).toBe(geometry.header + 16 + geometry.tileHeight + geometry.pad);
    // The second tile's label is one tile and one gap along.
    expect(Number(fields[3][5])).toBe(16 + 270 + 8 + geometry.pad);
    // The third tile has a note but no label.
    expect(fields[4][3]).toBe("Note");
  });
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

/** An edit of clips, each [asset, seconds, label?, cross-fade into it?], at 30 fps. */
function edit(clips: [string, number, string?, number?][]): Timeline {
  const timeline = parseTimeline({
    fps: 30,
    clips: clips.map(([assetId, duration, label, fade], index) => ({
      id: `clip-${index + 1}`,
      assetId,
      kind: "video",
      duration,
      ...(label !== undefined ? { label } : {}),
      ...(fade ? { transition: { type: "fade", duration: fade } } : {}),
    })),
  });
  if (!timeline) throw new Error("not a timeline");
  return timeline;
}

describe("a render's review sheet frames", () => {
  test("take each shot half a second in and on its last frame, on the frame grid", () => {
    const tiles = reviewTiles(
      edit([
        [A, 2, "01.1 Orbit"],
        [B, 3, "01.2 Pins"],
      ]),
      ["The globe turns to Australia"],
    );
    expect(tiles).toEqual([
      { time: 0.5, label: "1 · 01.1 Orbit", note: "0:00.5 · The globe turns to Australia" },
      { time: 59 / 30, label: "1 · last frame", note: "0:01.9" },
      { time: 2.5, label: "2 · 01.2 Pins", note: "0:02.5" },
      { time: 149 / 30, label: "2 · last frame", note: "0:04.9" },
    ]);
  });

  test("keep out of transitions: in once a shot is on its own, out before the next fades in", () => {
    const tiles = reviewTiles(
      edit([
        [A, 2, "One"],
        [B, 3, "Two", 0.5],
      ]),
    );
    // The second clip fades in over frames 45 to 59.
    expect(tiles.map((tile) => Math.round(tile.time * 30))).toEqual([15, 44, 60, 134]);
  });

  test("show a clip too short for two frames once, and name an unnamed one by its place", () => {
    const tiles = reviewTiles(
      edit([
        [A, 0.2],
        [B, 1, "  Spaced   out  "],
      ]),
    );
    expect(tiles.map((tile) => tile.label)).toEqual([
      "1 · Clip 1",
      "2 · Spaced out",
      "2 · last frame",
    ]);
    expect(tiles[0]!.time).toBe(5 / 30);
  });
});

describe("a render's review sheet request", () => {
  test("heads the sheet with the edit, its version and length, in tiles of the render's shape", () => {
    const params = reviewSheetParams({
      title: "Aurixa reel",
      version: 3,
      timeline: edit([
        [A, 2, "One"],
        [B, 2, "Two"],
      ]),
      size: { width: 1080, height: 1920 },
    });
    expect(params.title).toBe("Aurixa reel · version 3 · 0:04.0");
    expect(params.columns).toBe(4);
    expect(params.tile_width).toBe(270);
    expect(params.tiles).toHaveLength(4);
    // The media service takes it as it is.
    const plan = worker.planReviewSheet(params);
    expect(plan.tiles.map((tile) => tile.label)).toEqual(params.tiles.map((tile) => tile.label));
    expect(plan.tileWidth).toBe(270);
  });

  test("sizes tiles to about the same area whatever the shape, and lays a long vertical edit six across", () => {
    expect([tileWidthFor(1080, 1920), tileWidthFor(1080, 1080), tileWidthFor(1920, 1080)]).toEqual([
      270, 360, 480,
    ]);
    const long = edit(Array.from({ length: 30 }, (_, index) => [A, 2, `Shot ${index + 1}`]));
    const params = reviewSheetParams({ title: "Long", version: 1, timeline: long });
    expect(params.tiles).toHaveLength(60);
    expect(params.columns).toBe(6);
    // Without the render's own size, the edit's frame.
    expect(params.tile_width).toBe(270);
    const landscape = reviewSheetParams({
      title: "Wide",
      version: 1,
      timeline: { ...long, aspectRatio: "16:9" },
    });
    expect([landscape.columns, landscape.tile_width]).toEqual([4, 480]);
  });
});

describe("a shot's description", () => {
  const shots = [
    {
      sceneNumber: 1,
      shotNumber: 1,
      description: "The globe turns to Australia",
      prompt: "orbit shot",
      assetIds: [A],
    },
    {
      sceneNumber: 2,
      shotNumber: 3,
      description: null,
      prompt: "Pins rain over the cities",
      assetIds: [],
    },
  ];

  test("comes from the storyboard shot whose take the clip plays, or the one its name numbers", () => {
    const clips = edit([
      [A, 2, "Renamed"],
      [B, 2, "2.3 Pins"],
      [C, 2, "Shot 9.9"],
    ]).clips;
    expect(shotNotes(clips, { shots })).toEqual([
      "The globe turns to Australia",
      "Pins rain over the cities",
      null,
    ]);
  });

  test("comes from the draft the clip is named for, or the brief's note on its picture", () => {
    const clips = edit([
      [A, 2, "Hero shot"],
      [B, 2, "Another"],
    ]).clips;
    expect(
      shotNotes(clips, {
        drafts: [{ title: "Hero shot", note: "Opens on the product" }],
        imageNotes: [{ assetId: B, description: "The style frame for the close" }],
      }),
    ).toEqual(["Opens on the product", "The style frame for the close"]);
  });

  test("of a Supercomputer draft is the edit plan's note on it, else its purpose, else its prompt", () => {
    expect(
      draftNotes({
        drafts: [
          { title: "Hero", purpose: "Hook", prompt: "a hero shot" },
          { title: "Close", prompt: "the logo" },
          { title: " ", prompt: "unnamed" },
          { title: "Middle", purpose: "Proof" },
        ],
        editPlan: { shots: [{ draftIndex: 0, note: "Open on it" }, { draftIndex: 3 }] },
      }),
    ).toEqual([
      { title: "Hero", note: "Open on it" },
      { title: "Close", note: "the logo" },
      { title: "Middle", note: "Proof" },
    ]);
    expect(draftNotes(null)).toEqual([]);
  });

  test("of a brief's picture is its analysis's note on it", () => {
    expect(
      briefImageNotes({
        image_notes: [
          { asset_id: A, description: "Style frame", suggested_use: "end card" },
          { asset_id: 4, description: "bad" },
          null,
        ],
      }),
    ).toEqual([{ assetId: A, description: "Style frame" }]);
    expect(briefImageNotes("nothing")).toEqual([]);
  });
});

describe("where a review sheet stands", () => {
  const task = { id: "task", result_asset_id: null, error_message: null };
  test("is read from its media task", () => {
    expect(reviewSheetState({ ...task, status: "processing" }).status).toBe("making");
    expect(reviewSheetState({ ...task, status: "submitting" }).status).toBe("making");
    expect(reviewSheetState({ ...task, status: "completed", result_asset_id: A })).toEqual({
      taskId: "task",
      status: "ready",
      assetId: A,
      error: null,
    });
    expect(reviewSheetState({ ...task, status: "failed", error_message: "No picture" })).toEqual({
      taskId: "task",
      status: "failed",
      assetId: null,
      error: "No picture",
    });
    // Finished without a picture to show.
    expect(reviewSheetState({ ...task, status: "completed" }).status).toBe("failed");
  });
});
