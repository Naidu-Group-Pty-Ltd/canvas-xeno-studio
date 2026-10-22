import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../../drizzle/migrations");
const journal = JSON.parse(readFileSync(join(DIR, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string; when: number }[];
};
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.replace(/\.sql$/, ""))
  .sort();

describe("the migrations' journal", () => {
  test("names every migration file, in order, and only those", () => {
    expect(journal.entries.map((entry) => entry.tag)).toEqual(files);
  });

  test("numbers its entries one after another, each later than the one before", () => {
    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      if (index) expect(entry.when).toBeGreaterThan(journal.entries[index - 1]!.when);
    });
  });

  test("each migration's number is its place", () => {
    for (const [index, tag] of files.entries()) expect(Number(tag.slice(0, 4))).toBe(index);
  });
});
