import { describe, expect, test } from "bun:test";
import {
  textCheckOf,
  textFindings,
  textSummary,
  textVerdict,
} from "../../src/lib/media/text-check";

describe("text in generated pictures", () => {
  test("no text, readable text and garbled text read as such", () => {
    expect(textVerdict([])).toBe("none");
    expect(textVerdict([{ text: "AURIXA", where: "monolith", legible: true }])).toBe("legible");
    expect(
      textVerdict([
        { text: "AURIXA", where: "monolith", legible: true },
        { text: "Q3 Revnue Anlysys", where: "dashboard heading", legible: false },
      ]),
    ).toBe("garbled");
  });

  test("the summary names where the garbled text is", () => {
    const findings = [
      { text: "Rpoert", where: "the report's title", legible: false },
      { text: "2026", where: "the calendar", legible: true },
    ];
    expect(textSummary(findings)).toBe("Garbled text: the report's title.");
    expect(textSummary([])).toBe("No text in the picture.");
  });

  test("an AI answer is cleaned: odd entries dropped, legibility only when said", () => {
    expect(
      textFindings({
        findings: [
          { text: " SALE ", where: "sign", legible: true },
          { text: "xq#", where: "screen" },
          "junk",
          { text: "", where: "" },
        ],
      }),
    ).toEqual([
      { text: "SALE", where: "sign", legible: true },
      { text: "xq#", where: "screen", legible: false },
    ]);
  });

  test("a kept check reads back; a file never checked has none", () => {
    const kept = textCheckOf({
      text_check: {
        verdict: "garbled",
        findings: [{ text: "Rpoert", where: "title", legible: false }],
        summary: "Garbled text: title.",
        frames: 4,
        model: "m",
        checkedAt: "2026-10-17T00:00:00Z",
      },
    });
    expect(kept).toMatchObject({ verdict: "garbled", frames: 4 });
    expect(textCheckOf({})).toBeNull();
    expect(textCheckOf({ text_check: { verdict: "maybe" } })).toBeNull();
  });
});
