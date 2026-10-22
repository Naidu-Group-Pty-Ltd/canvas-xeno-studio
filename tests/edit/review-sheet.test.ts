import { describe, expect, test } from "bun:test";
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
