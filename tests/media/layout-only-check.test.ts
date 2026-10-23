import { beforeAll, describe, expect, mock, test } from "bun:test";

/** The library's marks, as the server would answer them; null: it can't be read. */
let marks: Record<string, { layoutOnly: boolean } | null> | null = {};
mock.module("@/lib/privacy.functions", () => ({
  getPrivacyMarks: async () => {
    if (marks === null) throw new Error("Reference screenshots need a database update");
    return marks;
  },
}));

type Check = typeof import("../../src/lib/media/layout-only-check");
let check: Check;
beforeAll(async () => {
  check = await import("../../src/lib/media/layout-only-check");
});

const SCREEN = "11111111-1111-4111-8111-111111111111";
const FRAME = "22222222-2222-4222-8222-222222222222";

describe("the Editor's check before a file goes on a timeline", () => {
  test("refuses a client's screen marked layout only, in the words the render uses", async () => {
    marks = { [SCREEN]: { layoutOnly: true }, [FRAME]: null };
    expect(await check.timelineRefusal([{ id: SCREEN, title: "Command Centre" }])).toBe(
      "“Command Centre” is layout only: a reference for how a screen is laid out, never placed in a frame, so it can't be used in an edit. Take it out of the timeline. If it may be shown after all, an admin can lift the mark in the library.",
    );
  });

  test("lets through a file with no mark, or one whose mark was lifted", async () => {
    marks = { [SCREEN]: { layoutOnly: false }, [FRAME]: null };
    expect(await check.timelineRefusal([{ id: SCREEN, title: "Command Centre" }])).toBeNull();
    expect(await check.timelineRefusal([{ id: FRAME, title: "F-04A" }])).toBeNull();
    expect(await check.timelineRefusal([])).toBeNull();
  });

  test("lets a file through when the marks can't be read: the render still refuses one", async () => {
    marks = null;
    expect(await check.timelineRefusal([{ id: SCREEN, title: "Command Centre" }])).toBeNull();
  });
});
