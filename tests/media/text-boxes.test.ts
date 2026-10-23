import { describe, expect, test } from "bun:test";
import {
  boxFromAnswer,
  boxesInPixels,
  cleanBoxes,
  letteringBoxes,
  looksLikeEmail,
  looksLikePhone,
  maskedText,
  mergeBoxes,
  padBox,
  privateKind,
  proposeRedaction,
  textPieces,
} from "../../src/lib/media/text-boxes";

const near = (value: number, expected: number) => expect(value).toBeCloseTo(expected, 6);

describe("text read with where it is", () => {
  test("a box from the AI is in thousandths of the picture, its corners in either order", () => {
    expect(boxFromAnswer({ x0: 100, y0: 200, x1: 300, y1: 250 })).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.2,
      h: 0.05,
    });
    const flipped = boxFromAnswer({ x0: 300, y0: 250, x1: 100, y1: 200 })!;
    near(flipped.x, 0.1);
    near(flipped.w, 0.2);
    // Past the picture's edge it is cut at it; a box of no size, or not a box, is none.
    expect(boxFromAnswer({ x0: 900, y0: 0, x1: 1400, y1: 50 })).toEqual({
      x: 0.9,
      y: 0,
      w: 0.1,
      h: 0.05,
    });
    expect(boxFromAnswer({ x0: 10, y0: 10, x1: 10, y1: 90 })).toBeNull();
    expect(boxFromAnswer({ x0: "10", y0: 10, x1: 20, y1: 90 })).toBeNull();
    expect(boxFromAnswer(null)).toBeNull();
  });

  test("an AI answer is cleaned: pieces without a box dropped, an unknown kind taken as other", () => {
    expect(
      textPieces({
        findings: [
          { text: " Jane Citizen ", box: { x0: 0, y0: 0, x1: 200, y1: 40 }, kind: "name" },
          { text: "Dashboard", box: { x0: 0, y0: 50, x1: 200, y1: 90 }, kind: "heading" },
          { text: "no box", kind: "name" },
          "junk",
        ],
      }),
    ).toEqual([
      { text: "Jane Citizen", box: { x: 0, y: 0, w: 0.2, h: 0.04 }, kind: "name" },
      { text: "Dashboard", box: { x: 0, y: 0.05, w: 0.2, h: 0.04 }, kind: "other" },
    ]);
    expect(textPieces({})).toEqual([]);
  });
});

describe("what a reference screenshot must not show", () => {
  test("emails are found by their pattern, a reading's stray spaces and all", () => {
    for (const text of [
      "jane.citizen@banksiarise.com.au",
      "J.CITIZEN+portal@EXAMPLE.ORG",
      "Contact: jane @ example.com",
      "From Jane <jane_c@mail.example.net>",
    ])
      expect(looksLikeEmail(text)).toBe(true);
    for (const text of ["@aurixa", "a@b", "jane at example dot com", "Email address"])
      expect(looksLikeEmail(text)).toBe(false);
  });

  test("phone numbers are found by their pattern, whatever their country writes them as", () => {
    for (const text of [
      "+61 2 9876 5432",
      "(02) 9876 5432",
      "0412 345 678",
      "1300 123 456",
      "555-123-4567",
      "+1 (555) 123-4567",
      "Mobile: 0412.345.678",
    ])
      expect(looksLikePhone(text)).toBe(true);
  });

  test("dates, times, amounts, postcodes and counts are not phone numbers", () => {
    for (const text of [
      "22/10/2026",
      "2026-10-22",
      "10:45:32",
      "$1,250,000",
      "12.345.678",
      "Banksia Rise NSW 2155",
      "14 Wattle Grove",
      "Score 84 · STRONG BUY",
      "3,936 frames",
    ])
      expect(looksLikePhone(text)).toBe(false);
  });

  test("names and addresses are what the AI says they are; emails and phones by pattern first", () => {
    expect(privateKind({ text: "Jane Citizen", kind: "name" })).toBe("name");
    expect(privateKind({ text: "14 Wattle Grove, Banksia Rise", kind: "address" })).toBe("address");
    // The pattern wins over the AI's reading, both ways.
    expect(privateKind({ text: "jane@example.com", kind: "other" })).toBe("email");
    expect(privateKind({ text: "Call 0412 345 678", kind: "name" })).toBe("phone");
    // An email or phone the AI saw that a reading slip keeps from its pattern is kept too.
    expect(privateKind({ text: "jane@examplecom", kind: "email" })).toBe("email");
    expect(privateKind({ text: "Overview", kind: "other" })).toBeNull();
  });

  test("a box's label hides most of what it covers", () => {
    expect(maskedText("Jane Citizen", "name")).toBe("J••• C••••");
    expect(maskedText("jane@example.com", "email")).toBe("j•••@•••");
    expect(maskedText("+61 2 9876 5432", "phone")).toBe("••• 32");
    expect(maskedText("14 Wattle Grove", "address")).toBe("1• W•••• G••••");
    expect(maskedText("  ", "name")).toBe("•••");
  });

  test("the proposed boxes are the private pieces, grown a quarter of their height all round", () => {
    const boxes = proposeRedaction(
      [
        { text: "Overview", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.04 }, kind: "other" },
        { text: "Jane Citizen", box: { x: 0.1, y: 0.2, w: 0.2, h: 0.04 }, kind: "name" },
        { text: "jane@example.com", box: { x: 0.5, y: 0.2, w: 0.3, h: 0.04 }, kind: "other" },
      ],
      2,
    );
    expect(boxes.map((box) => [box.id, box.kind, box.source, box.label])).toEqual([
      ["t2", "name", "ai", "J••• C••••"],
      ["t3", "email", "pattern", "j•••@•••"],
    ]);
    // 0.01 down each side; across, the same in pixels on a picture twice as wide as high.
    near(boxes[0]!.y, 0.19);
    near(boxes[0]!.h, 0.06);
    near(boxes[0]!.x, 0.095);
    near(boxes[0]!.w, 0.21);
  });
});

describe("boxes", () => {
  test("padding stays inside the picture", () => {
    expect(padBox({ x: 0, y: 0, w: 0.5, h: 0.1 }, { aspect: 1, around: 0.5 })).toEqual({
      x: 0,
      y: 0,
      w: 0.55,
      h: 0.15000000000000002,
    });
  });

  test("overlapping boxes, and ones within the gap, are joined; others kept apart", () => {
    const merged = mergeBoxes(
      [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
        { x: 0.25, y: 0.12, w: 0.2, h: 0.1 },
        { x: 0.46, y: 0.12, w: 0.1, h: 0.1 },
        { x: 0.8, y: 0.8, w: 0.1, h: 0.1 },
      ],
      0.02,
    );
    expect(merged).toHaveLength(2);
    near(merged[0]!.x, 0.1);
    near(merged[0]!.w, 0.46);
    near(merged[0]!.h, 0.12);
    expect(merged[1]).toEqual({ x: 0.8, y: 0.8, w: 0.1, h: 0.1 });
  });

  test("boxes from a person are kept inside the picture, of a real size, and at most 200", () => {
    const cleaned = cleanBoxes([
      { x: -0.1, y: 0.5, w: 0.3, h: 0.7 },
      { x: 0.5, y: 0.5, w: 0, h: 0.1 },
    ]);
    expect(cleaned).toHaveLength(1);
    near(cleaned[0]!.x, 0);
    near(cleaned[0]!.w, 0.2);
    near(cleaned[0]!.h, 0.5);
    expect(
      cleanBoxes(Array.from({ length: 250 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 }))),
    ).toHaveLength(200);
  });

  test("in pixels a box covers every pixel it touches, at least one each way", () => {
    expect(boxesInPixels([{ x: 0.1, y: 0.25, w: 0.2, h: 0.5 }], 1000, 400)).toEqual([
      { x: 100, y: 100, w: 200, h: 200 },
    ]);
    expect(boxesInPixels([{ x: 0.1234, y: 0, w: 0.0001, h: 0.0001 }], 1000, 400)).toEqual([
      { x: 123, y: 0, w: 1, h: 1 },
    ]);
    expect(boxesInPixels([{ x: 1, y: 1, w: 0, h: 0 }], 1000, 400)).toEqual([
      { x: 999, y: 399, w: 1, h: 1 },
    ]);
  });

  test("a logo's lettering is one box a line, grown a fifth of its height", () => {
    const boxes = letteringBoxes(
      [
        { text: "AURIXA", box: { x: 0.3, y: 0.7, w: 0.18, h: 0.1 }, kind: "other" },
        { text: "SYSTEMS", box: { x: 0.5, y: 0.7, w: 0.2, h: 0.1 }, kind: "other" },
        { text: "tagline", box: { x: 0.35, y: 0.9, w: 0.3, h: 0.04 }, kind: "other" },
      ],
      1.5,
    );
    expect(boxes).toHaveLength(2);
    near(boxes[0]!.y, 0.68);
    near(boxes[0]!.h, 0.14);
  });
});
