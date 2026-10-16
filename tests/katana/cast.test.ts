import { describe, expect, test } from "bun:test";
import {
  KATANA_SHEET_IMAGES,
  castOfInputs,
  katanaSheet,
  sheetGaps,
  tagCast,
} from "../../src/lib/katana/cast";
import { kickoffMessage } from "../../src/lib/katana/messages";
import { katanaFromPlan } from "../../src/lib/supercomputer/katana";
import type { RunCharacter } from "../../src/lib/characters/model";
import type { CompileRun } from "../../src/lib/edit/compile";
import type { SupercomputerDraft } from "../../src/lib/supercomputer/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function character(n: number, views: RunCharacter["images"][number]["view"][]): RunCharacter {
  return {
    id: id(n),
    name: `C${n}`,
    description: "",
    images: views.map((view, index) => ({ assetId: id(n * 100 + index), view })),
  };
}

const FULL = ["face", "front", "three_quarter", "side", "back", "outfit", "expression"] as const;

describe("a character's sheet in a Katana run", () => {
  test("goes best views first, five at most", () => {
    const sheet = katanaSheet([character(1, [...FULL])], 10);
    expect(sheet).toHaveLength(KATANA_SHEET_IMAGES);
    expect(sheet.map((image) => image.view)).toEqual([
      "face",
      "front",
      "three_quarter",
      "side",
      "back",
    ]);
  });

  test("everyone's face before anyone's second view, when room is short", () => {
    const sheet = katanaSheet(
      [character(1, [...FULL]), character(2, [...FULL]), character(3, [...FULL])],
      10,
    );
    expect(sheet).toHaveLength(10);
    expect(sheet.slice(0, 3).map((image) => [image.characterId, image.view])).toEqual([
      [id(1), "face"],
      [id(2), "face"],
      [id(3), "face"],
    ]);
    // A preset field that takes one image gets the first character's face.
    expect(katanaSheet([character(1, [...FULL]), character(2, ["face"])], 1)).toEqual([
      { assetId: id(100), characterId: id(1), view: "face" },
    ]);
  });

  test("says which key views a sheet lacks", () => {
    expect(sheetGaps(character(1, ["face", "front"]))).toEqual([]);
    expect(sheetGaps(character(1, ["three_quarter", "back"]))).toEqual(["face", "front"]);
  });
});

describe("marking a run's images with its characters", () => {
  const janice = { id: id(50), name: "Janice", images: [{ assetId: id(1), view: "face" }] };

  test("each image of a character's is marked, and the rest left as they are", () => {
    const { inputs, missing } = tagCast(
      [
        { asset_id: id(1), kind: "image" },
        { asset_id: id(2), kind: "image" },
        { asset_id: id(1), kind: "video" },
      ],
      [janice],
    );
    expect(inputs[0]).toEqual({
      asset_id: id(1),
      kind: "image",
      character_id: id(50),
      character_name: "Janice",
      view: "face",
    });
    expect(inputs[1]).toEqual({ asset_id: id(2), kind: "image" });
    expect(inputs[2]).toEqual({ asset_id: id(1), kind: "video" });
    expect(missing).toEqual([]);
  });

  test("a character none of the images show is named", () => {
    const { missing } = tagCast([{ asset_id: id(2), kind: "image" }], [janice]);
    expect(missing).toEqual(["Janice"]);
  });

  test("the cast reads back from the inputs, in order", () => {
    expect(
      castOfInputs([
        { asset_id: id(9), kind: "video", media_id: id(19) },
        {
          asset_id: id(1),
          kind: "image",
          media_id: id(11),
          character_id: id(50),
          character_name: "Janice",
          view: "face",
        },
        {
          asset_id: id(3),
          kind: "image",
          media_id: id(13),
          character_id: id(50),
          character_name: "Janice",
          view: "front",
        },
      ]),
    ).toEqual([
      {
        id: id(50),
        name: "Janice",
        images: [
          { mediaId: id(11), view: "face" },
          { mediaId: id(13), view: "front" },
        ],
      },
    ]);
  });
});

describe("the first message, with characters", () => {
  const base = {
    mode: "remix" as const,
    presetSlug: null,
    brief: "",
    referenceUrl: "https://www.tiktok.com/@a/video/1",
    inputs: [
      { field: "media.images", kind: "image" as const, mediaId: id(11) },
      { field: "media.images", kind: "image" as const, mediaId: id(13) },
    ],
    creditLimit: 200,
  };

  test("names the hero, their sheet among the media, and their look", () => {
    const message = kickoffMessage({
      ...base,
      characters: [
        {
          name: "Janice",
          description: "Woman in her 30s, auburn hair, navy coat",
          images: [
            { mediaId: id(11), view: "face" },
            { mediaId: id(13), view: "front" },
          ],
        },
      ],
    });
    const parts = message.split("\n\n");
    const cast = parts.findIndex((part) => part.startsWith("CHARACTERS:"));
    expect(parts[cast]).toBe(
      [
        "CHARACTERS:",
        `- Janice: reference sheet media_id=${id(11)} (face close-up), media_id=${id(13)} (full body, front). Look: Woman in her 30s, auburn hair, navy coat.`,
        "Janice is the hero of the new video. These images are identity references, not shots to cut in: keep Janice's face, hair, build and clothing as they are there in every scene Janice appears in, unless the brief says otherwise.",
      ].join("\n"),
    );
    // After the link and the media, before the limits.
    expect(parts.slice(0, cast).map((part) => part.split("\n")[0])).toEqual([
      "/katana",
      "Reference video: https://www.tiktok.com/@a/video/1",
      "MEDIA:",
    ]);
    expect(parts.slice(cast + 1).map((part) => part.slice(0, 12))).toEqual(["Credit limit"]);
  });

  test("several characters are the people in it", () => {
    const message = kickoffMessage({
      ...base,
      characters: [
        { name: "Janice", description: "", images: [{ mediaId: id(11), view: "face" }] },
        { name: "Marco", description: "", images: [{ mediaId: id(13), view: "other" }] },
      ],
    });
    expect(message).toContain(`- Marco: reference sheet media_id=${id(13)}.\n`);
    expect(message).toContain("Janice and Marco are the people in the new video.");
  });

  test("a run without characters reads as before", () => {
    expect(kickoffMessage({ ...base, characters: [] })).toBe(kickoffMessage(base));
    expect(kickoffMessage(base)).not.toContain("CHARACTERS:");
  });
});

describe("the Supercomputer's edit plan, to Katana", () => {
  const draft = (title: string, outputType: "video" | "image"): SupercomputerDraft => ({
    title,
    modelId: "m",
    modelName: "M",
    outputType,
    operation: "text-to-video",
    prompt: "",
    parameters: {},
    references: [],
    issues: [],
  });
  const done = (assetId: string, type: "video" | "image"): CompileRun[] => [
    {
      generation: { status: "completed", created_at: "2026-10-16T10:00:00Z" },
      assets: [
        { id: assetId, asset_type: type, title: null, duration_seconds: 5, created_at: "x" },
      ],
    },
  ];

  test("its clips are the footage, the plan the brief, the drafts' characters the cast", () => {
    const drafts = [
      { ...draft("Walk-in", "video"), characters: [{ id: id(50), name: "Janice" }] },
      draft("Still", "image"),
      draft("Logo", "video"),
    ];
    const runs = new Map([
      [0, done(id(1), "video")],
      [1, done(id(2), "image")],
      [2, done(id(3), "video")],
    ]);
    const result = katanaFromPlan(
      drafts,
      runs,
      {
        title: "Summer",
        shots: [
          { draftIndex: 0, seconds: 4 },
          { draftIndex: 1, seconds: 2 },
          { draftIndex: 2, seconds: 3, transition: "dissolve" },
        ],
        captions: true,
      },
      { projectId: id(90) },
    );
    expect(result.reason).toBeNull();
    expect(result.send).toMatchObject({
      mode: "edit",
      files: [
        { assetId: id(1), slot: "footage" },
        { assetId: id(3), slot: "footage" },
        { assetId: id(2), slot: "images" },
      ],
      characters: [{ id: id(50), name: "Janice" }],
      title: "Summer",
      projectId: id(90),
    });
    expect(result.send!.brief).toContain("Cut these 2 clips into one edit, “Summer”");
    expect(result.send!.brief).toContain("2. Logo (3 s) (dissolve in)");
    expect(result.send!.brief).toContain("Stills to use where they fit: “Still”.");
  });

  test("more clips than Katana edits at once go through the Editor first", () => {
    const drafts = [0, 1, 2, 3].map((n) => draft(`Shot ${n}`, "video"));
    const runs = new Map(drafts.map((_, n) => [n, done(id(n + 1), "video")] as const));
    const result = katanaFromPlan(
      drafts,
      runs,
      { shots: drafts.map((_, n) => ({ draftIndex: n })) },
      { projectId: null },
    );
    expect(result.send).toBeNull();
    expect(result.reason).toContain("Katana edits up to 3 clips at once, and this plan has 4");
  });

  test("nothing generated yet is nothing to send", () => {
    const result = katanaFromPlan(
      [draft("Walk-in", "video")],
      new Map(),
      { shots: [{ draftIndex: 0 }] },
      { projectId: null },
    );
    expect(result).toMatchObject({ send: null, reason: "Generate the plan's shots first" });
  });
});
