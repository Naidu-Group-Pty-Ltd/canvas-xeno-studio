import { describe, expect, test } from "bun:test";
import { briefExcerpt } from "../../src/lib/briefs/pages";

/** Text the way parse-document writes a PDF's: a marker before each page. */
const pdf = (pages: string[]) =>
  pages.map((text, index) => `${index ? "\n\n" : ""}--- Page ${index + 1} ---\n${text}`).join("");

describe("reading a brief a few pages at a time", () => {
  const pack = pdf(["Cover", "Brief", "Cast: Alex Morgan", "Shot 01A", "Shot 01B"]);

  test("the pages asked for, with how many there are and where to carry on", () => {
    const excerpt = briefExcerpt(pack, { fromPage: 3, toPage: 4 }, 10_000);
    expect(excerpt.text).toBe("--- Page 3 ---\nCast: Alex Morgan\n\n--- Page 4 ---\nShot 01A");
    expect(excerpt.pages).toEqual({ from: 3, to: 4, total: 5 });
    expect(excerpt.next).toBeNull();
    expect(excerpt.cut).toBe(false);
  });

  test("from the first page to the last by default", () => {
    const excerpt = briefExcerpt(pack, {}, 10_000);
    expect(excerpt.pages).toEqual({ from: 1, to: 5, total: 5 });
    expect(excerpt.text.startsWith("--- Page 1 ---\nCover")).toBe(true);
    expect(excerpt.text.endsWith("Shot 01B")).toBe(true);
  });

  test("whole pages up to the limit, then the page to carry on from", () => {
    const long = pdf(["a".repeat(40), "b".repeat(40), "c".repeat(40)]);
    const excerpt = briefExcerpt(long, {}, 120);
    expect(excerpt.pages).toEqual({ from: 1, to: 2, total: 3 });
    expect(excerpt.next).toEqual({ page: 3 });
    expect(excerpt.text).not.toContain("c");
    expect(briefExcerpt(long, { fromPage: 3 }, 120).text).toContain("c".repeat(40));
  });

  test("a page longer than the limit is shown cut, so a read always moves on", () => {
    const long = pdf(["a".repeat(500), "b"]);
    const excerpt = briefExcerpt(long, {}, 100);
    expect(excerpt.text.length).toBe(100);
    expect(excerpt.cut).toBe(true);
    expect(excerpt.next).toEqual({ page: 2 });
  });

  test("past the last page there is nothing more", () => {
    const excerpt = briefExcerpt(pack, { fromPage: 9 }, 10_000);
    expect(excerpt.text).toBe("");
    expect(excerpt.next).toBeNull();
    expect(excerpt.pages?.total).toBe(5);
  });

  test("text without pages is read by character", () => {
    const text = "x".repeat(250);
    const first = briefExcerpt(text, {}, 100);
    expect(first.pages).toBeNull();
    expect(first.text.length).toBe(100);
    expect(first.next).toEqual({ offset: 100 });
    const last = briefExcerpt(text, { offset: 200 }, 100);
    expect(last.text.length).toBe(50);
    expect(last.next).toBeNull();
  });
});
