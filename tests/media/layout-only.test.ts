import { describe, expect, test } from "bun:test";
import {
  layoutOnlyRefusal,
  PLACEMENTS,
  privacyBadge,
  privacyMarkOf,
} from "../../src/lib/media/layout-only";
import {
  boxCounts,
  redactionBoxes,
  redactionMessage,
  redactionTaskParams,
} from "../../src/lib/media/redaction";

describe("a layout-only picture, refused", () => {
  test("the refusal names the file, says why, and what to do, wherever it was going", () => {
    expect(layoutOnlyRefusal(["Client portal"], "generation")).toBe(
      "“Client portal” is layout only: a reference for how a screen is laid out, never placed in a frame, so it can't go into a generation. Take it out of the references; it stays in the library to build from. If it may be shown after all, an admin can lift the mark in the library.",
    );
    expect(layoutOnlyRefusal(["Client portal"], "render")).toContain(
      "so this edit can't be rendered with it. Take it out of the timeline, then render again.",
    );
    expect(layoutOnlyRefusal([null], "edit")).toContain("“A picture” is layout only");
    for (const where of PLACEMENTS) {
      const words = layoutOnlyRefusal(["Inbox"], where);
      expect(words.startsWith("“Inbox” is layout only")).toBe(true);
      expect(words.endsWith("an admin can lift the mark in the library.")).toBe(true);
    }
  });

  test("several files are named together, and a long list is cut short", () => {
    expect(layoutOnlyRefusal(["Inbox", "Portal"], "katana")).toBe(
      "“Inbox” and “Portal” are layout only: references for how a screen is laid out, never placed in a frame, so they can't be handed to Katana. Take them out of the run. If they may be shown after all, an admin can lift the mark in the library.",
    );
    expect(layoutOnlyRefusal(["A", "B", "C", "D"], "copy")).toContain(
      "“A”, “B” and “C” and others are layout only",
    );
  });

  test("a mark reads back; a file with none, or a lifted one, has no badge", () => {
    const mark = privacyMarkOf({
      layout_only: true,
      redacted_areas: 3,
      redaction_id: "r1",
      marked_at: "t",
    });
    expect(mark).toEqual({
      layoutOnly: true,
      redactedAreas: 3,
      redactionId: "r1",
      note: null,
      markedAt: "t",
    });
    expect(privacyBadge(mark)).toBe("Redacted · layout only");
    expect(privacyBadge(privacyMarkOf({ layout_only: true }))).toBe("Layout only");
    expect(privacyBadge(privacyMarkOf({ layout_only: false, redacted_areas: 2 }))).toBe("Redacted");
    expect(privacyMarkOf({ layout_only: false })).toBeNull();
    // Joined the library with nothing blurred: no mark unless it is layout only.
    expect(privacyMarkOf({ layout_only: false, redacted_areas: 0 })).toBeNull();
    expect(privacyBadge(privacyMarkOf({ layout_only: true, redacted_areas: 0 }))).toBe(
      "Layout only",
    );
    expect(privacyMarkOf(null)).toBeNull();
  });
});

describe("a screenshot's boxes, as a person gives them back", () => {
  test("kept inside the picture with an id, a kind and a label; anything else dropped", () => {
    const boxes = redactionBoxes([
      {
        id: "t2",
        x: 0.1,
        y: 0.2,
        w: 0.2,
        h: 0.05,
        kind: "name",
        source: "ai",
        label: "J••• C••••",
      },
      { x: 0.9, y: 0.9, w: 0.3, h: 0.3 },
      { x: "0.1", y: 0, w: 0.1, h: 0.1 },
      { x: 0.5, y: 0.5, w: 0, h: 0.1 },
      "junk",
      { id: "bad id!", x: 0, y: 0, w: 0.1, h: 0.1, kind: "password" },
    ]);
    expect(boxes.map((box) => [box.id, box.kind, box.source, box.label])).toEqual([
      ["t2", "name", "ai", "J••• C••••"],
      ["p2", "drawn", "person", "Marked by hand"],
      ["p6", "drawn", "person", "Marked by hand"],
    ]);
    expect(boxes[1]!.w).toBeCloseTo(0.1, 9);
    expect(redactionBoxes("junk")).toEqual([]);
    expect(boxCounts(boxes)).toEqual({ name: 1, email: 0, phone: 0, address: 0, drawn: 2 });
  });

  test("the worker is given the boxes in the picture's own pixels, and nothing else", () => {
    const boxes = redactionBoxes([{ x: 0.1, y: 0.25, w: 0.2, h: 0.5, kind: "email" }]);
    expect(redactionTaskParams(boxes, 1000, 400)).toEqual({
      boxes: [{ x: 100, y: 100, w: 200, h: 200 }],
      format: "png",
    });
  });

  test("what happens next is said plainly at each step", () => {
    const one = redactionBoxes([{ x: 0, y: 0, w: 0.1, h: 0.1 }]);
    expect(redactionMessage("review", one)).toBe(
      "1 area to blur. Check every box (remove one that isn't private, drag to add one that is), then blur them.",
    );
    expect(redactionMessage("review", [])).toContain(
      "Nothing private was found. Look for yourself",
    );
    expect(redactionMessage("failed", one, "The media service couldn't blur it")).toBe(
      "The copy couldn't be made: The media service couldn't blur it. Check the boxes and try again.",
    );
    expect(redactionMessage("completed", one)).toBe(
      "The copy with its private details blurred is in the library.",
    );
    expect(redactionMessage("completed", [])).toBe(
      "The screenshot is in the library as it was: nothing in it was blurred.",
    );
    expect(redactionMessage("cancelled", one, "Left unchecked for 7 days")).toBe(
      "Cancelled: the screenshot was deleted (left unchecked for 7 days).",
    );
  });
});
