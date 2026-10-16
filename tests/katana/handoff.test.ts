import { describe, expect, test } from "bun:test";
import {
  addToKatanaDraft,
  editBrief,
  emptyKatanaDraft,
  isEmptyKatanaDraft,
  joinBrief,
  katanaChoices,
  parseKatanaDraft,
} from "../../src/lib/katana/handoff";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VIDEO = { id: id(1), asset_type: "video", title: "Reel 01", project_id: id(90) };

describe("sending to Katana", () => {
  test("a video goes as footage to edit, or as the reference to remix", () => {
    const [edit, remix] = katanaChoices(VIDEO);
    expect(edit!.send).toMatchObject({
      mode: "edit",
      files: [{ assetId: VIDEO.id, slot: "footage", title: "Reel 01" }],
      projectId: id(90),
    });
    expect(remix!.send).toMatchObject({
      mode: "remix",
      files: [{ assetId: VIDEO.id, slot: "reference" }],
    });
  });

  test("an image or a track fits any tab, so it doesn't choose one", () => {
    const [image] = katanaChoices({ id: id(2), asset_type: "image", title: "Logo" });
    const [track] = katanaChoices({ id: id(3), asset_type: "audio", title: "Drop" });
    expect(image!.send.mode).toBeUndefined();
    expect(image!.send.files?.[0]?.slot).toBe("images");
    expect(track!.send.files?.[0]?.slot).toBe("soundtrack");
    expect(katanaChoices({ id: id(4), asset_type: "document", title: null })).toEqual([]);
  });

  test("the characters in a file go along with it", () => {
    const [edit] = katanaChoices(VIDEO, {
      characters: [{ id: id(50), name: "Janice" }],
      title: "Reel 01 · Katana",
    });
    expect(edit!.send.characters).toEqual([{ id: id(50), name: "Janice" }]);
    expect(edit!.send.title).toBe("Reel 01 · Katana");
  });
});

describe("the Katana draft", () => {
  test("what is sent is added, and the page is told what came", () => {
    const draft = addToKatanaDraft(emptyKatanaDraft(), katanaChoices(VIDEO)[0]!.send);
    expect(draft.mode).toBe("edit");
    expect(draft.files.footage).toEqual([VIDEO.id]);
    expect(draft.projectId).toBe(id(90));
    expect(draft.arrivals).toEqual(["“Reel 01” added to the footage."]);
  });

  test("files from several pages make one run", () => {
    let draft = addToKatanaDraft(emptyKatanaDraft(), katanaChoices(VIDEO)[0]!.send);
    draft = addToKatanaDraft(draft, {
      files: [{ assetId: id(3), slot: "soundtrack", title: "Drop" }],
    });
    draft = addToKatanaDraft(draft, { characters: [{ id: id(50), name: "Janice" }] });
    expect(draft.mode).toBe("edit");
    expect(draft.files.soundtrack).toEqual([id(3)]);
    expect(draft.characterIds).toEqual([id(50)]);
    expect(draft.arrivals.at(-1)).toBe("Janice joins the cast.");
  });

  test("a place that takes one file takes the one sent", () => {
    let draft = addToKatanaDraft(emptyKatanaDraft(), {
      mode: "remix",
      files: [{ assetId: id(1), slot: "reference", title: "A" }],
    });
    draft = addToKatanaDraft(draft, {
      mode: "remix",
      files: [{ assetId: id(2), slot: "reference", title: "B" }],
    });
    expect(draft.files.reference).toEqual([id(2)]);
    expect(draft.arrivals.at(-1)).toBe(
      "“B” is now the reference video, in place of the one before.",
    );
  });

  test("footage keeps the newest three, and says so", () => {
    let draft = emptyKatanaDraft();
    for (const n of [1, 2, 3, 4]) {
      draft = addToKatanaDraft(draft, {
        mode: "edit",
        files: [{ assetId: id(n), slot: "footage", title: `Clip ${n}` }],
      });
    }
    expect(draft.files.footage).toEqual([id(2), id(3), id(4)]);
    expect(draft.arrivals.at(-1)).toBe(
      "The footage takes 3 at most, so the oldest one was taken out.",
    );
    // Sending one that's already there changes nothing.
    const again = addToKatanaDraft(draft, {
      files: [{ assetId: id(4), slot: "footage", title: "Clip 4" }],
    });
    expect(again.files.footage).toEqual([id(2), id(3), id(4)]);
  });

  test("a run keeps three characters at most", () => {
    let draft = emptyKatanaDraft();
    for (const n of [50, 51, 52, 53]) {
      draft = addToKatanaDraft(draft, { characters: [{ id: id(n), name: `C${n}` }] });
    }
    expect(draft.characterIds).toEqual([id(51), id(52), id(53)]);
  });

  test("a brief sent is added after the one there, never over it", () => {
    expect(joinBrief("", "Cut it fast")).toBe("Cut it fast");
    expect(joinBrief("Keep it short", "Cut it fast")).toBe("Keep it short\n\nCut it fast");
    expect(joinBrief("Keep it short\n\nCut it fast", "Cut it fast")).toBe(
      "Keep it short\n\nCut it fast",
    );
    const draft = addToKatanaDraft(
      { ...emptyKatanaDraft(), brief: "Mine", title: "Mine" },
      { brief: "Theirs", title: "Theirs", projectId: id(90) },
    );
    expect(draft.brief).toBe("Mine\n\nTheirs");
    expect(draft.title).toBe("Mine");
    expect(draft.projectId).toBe(id(90));
  });

  test("anything that isn't a library id is left out", () => {
    const draft = addToKatanaDraft(emptyKatanaDraft(), {
      files: [{ assetId: "not-an-id", slot: "images" }],
      characters: [{ id: "nope", name: "X" }],
    });
    expect(isEmptyKatanaDraft(draft)).toBe(true);
  });

  test("a stored draft is read back checked", () => {
    const stored = JSON.parse(
      JSON.stringify(
        addToKatanaDraft(emptyKatanaDraft(), {
          mode: "preset",
          files: [{ assetId: id(7), slot: "images", title: "Photo" }],
          characters: [{ id: id(50), name: "Janice" }],
        }),
      ),
    );
    expect(parseKatanaDraft(stored)).toMatchObject({
      mode: "preset",
      files: { images: [id(7)] },
      characterIds: [id(50)],
    });
    expect(
      parseKatanaDraft({
        mode: "wild",
        files: { footage: [id(1), "x", id(1), id(2), id(3), id(4)] },
        presetFiles: { "media.images": [id(5)], "not a field": [id(6)] },
      }),
    ).toMatchObject({
      mode: "remix",
      files: { footage: [id(1), id(2), id(3)] },
      presetFiles: { "media.images": [id(5)] },
    });
    expect(parseKatanaDraft("nope")).toBeNull();
    expect(parseKatanaDraft([])).toBeNull();
  });
});

describe("an edit brief from a plan", () => {
  test("names the clips in order, then the sound and titles", () => {
    expect(
      editBrief({
        title: "Summer Drop",
        aspectRatio: "9:16",
        shots: [
          { title: "Walk-in", seconds: 4, note: "slow push-in" },
          { title: "Reveal", seconds: 5, transition: "dissolve" },
          { title: "Logo", seconds: 3, transition: "cut" },
        ],
        stills: ["Product still"],
        voiceover: "Summer starts here.",
        music: "Upbeat house",
        captions: true,
        openingTitle: "Summer",
        closingCta: "Shop now",
      }),
    ).toBe(
      [
        "Cut these 3 clips into one edit, “Summer Drop” (about 12 s, 9:16), in this order:",
        "1. Walk-in (4 s): slow push-in",
        "2. Reveal (5 s) (dissolve in)",
        "3. Logo (3 s)",
        "Stills to use where they fit: “Product still”.",
        "Voiceover: “Summer starts here.”",
        "Music: Upbeat house",
        "Add captions.",
        "Opening title: “Summer”. End card: “Shop now”.",
      ].join("\n"),
    );
  });

  test("one clip without notes is one line", () => {
    expect(editBrief({ shots: [{ title: "Reel" }] })).toBe("Cut this clip into one edit.");
  });

  test("stays within Katana's length", () => {
    const brief = editBrief({ shots: [{ title: "A" }], voiceover: "word ".repeat(2000) });
    expect(brief.length).toBeLessThanOrEqual(4000);
  });
});
