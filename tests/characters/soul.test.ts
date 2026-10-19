import { describe, expect, test } from "bun:test";
import {
  defaultTrainingSet,
  likenessOf,
  packKeyPrefix,
  packOfKey,
  packPrompt,
  packRequestKey,
  pickSoul,
  proofKeyPrefix,
  proofPrompt,
  proofRequestKey,
  soulStillPrompt,
  storedLikeness,
  storedTrainingCheck,
  trainingImageCheck,
  trainingSetVerdict,
  type CharacterSoul,
  type TrainingImageCheck,
} from "../../src/lib/characters/soul";
import { paintsWithSoul, storedKeyframeSettings } from "../../src/lib/long-video/keyframes";
import {
  readCustomReference,
  readCustomReferenceList,
} from "../../src/lib/higgsfield/provider.server";

const soul = (extra: Partial<CharacterSoul>): CharacterSoul => ({
  id: "s",
  characterId: "c",
  version: "v2",
  referenceId: "ref",
  source: "trained",
  active: true,
  imageCount: 12,
  trainingAssetIds: [],
  thumbnailUrl: null,
  likeness: null,
  approvedAt: null,
  readyAt: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("which Soul ID a job uses", () => {
  test("the version asked for, else the best in use for the look", () => {
    const v2 = soul({ id: "a", version: "v2", referenceId: "v2-ref" });
    const cinema = soul({ id: "b", version: "cinema", referenceId: "cinema-ref" });
    expect(pickSoul([v2, cinema])?.id).toBe("a");
    expect(pickSoul([v2, cinema], { look: "film" })?.id).toBe("b");
    expect(pickSoul([v2, cinema], { version: "cinema" })?.id).toBe("b");
    expect(pickSoul([v2], { version: "v1" })).toBeNull();
  });

  test("an approved likeness beats an unproven one, and a weak likeness comes last", () => {
    const weakV2 = soul({
      id: "weak",
      version: "v2",
      likeness: {
        score: 4,
        verdict: "weak",
        summary: "",
        assetIds: [],
        perImage: [],
        model: null,
        checkedAt: "",
      },
    });
    const approvedCinema = soul({
      id: "ok",
      version: "cinema",
      approvedAt: "2026-10-02T00:00:00Z",
    });
    expect(pickSoul([weakV2, approvedCinema])?.id).toBe("ok");
    // Retired Soul IDs are never picked.
    expect(pickSoul([soul({ id: "old", active: false })])).toBeNull();
  });
});

describe("what a Soul ID is trained on by default", () => {
  const image = (assetId: string, role: "sheet" | "photo", position: number) => ({
    assetId,
    role,
    view: "face" as const,
    position,
  });

  test("the training photos when there are enough, else photos then the sheet", () => {
    const photos = Array.from({ length: 6 }, (_, index) => image(`p${index}`, "photo", index));
    const sheet = [image("s0", "sheet", 10), image("s1", "sheet", 11)];
    expect(defaultTrainingSet([...sheet, ...photos])).toEqual(photos.map((entry) => entry.assetId));
    const few = photos.slice(0, 2);
    expect(defaultTrainingSet([...sheet, ...few])).toEqual(["p0", "p1", "s0", "s1"]);
  });

  test("leaves out what the check found unusable", () => {
    const checks = new Map<string, TrainingImageCheck>([
      [
        "p1",
        trainingImageCheck({
          issues: ["multiple_faces"],
          angle: "front",
          framing: "close_up",
          checkedAt: "t",
        }),
      ],
    ]);
    expect(defaultTrainingSet([image("p0", "photo", 0), image("p1", "photo", 1)], checks)).toEqual([
      "p0",
    ]);
  });
});

describe("the training set check", () => {
  const check = (issues: string[], angle = "front", framing = "close_up") =>
    trainingImageCheck({ issues, angle, framing, checkedAt: "t" });

  test("an image with a blocking issue is unusable; a weak one only weakens the set", () => {
    expect(check(["no_face"]).usable).toBe(false);
    expect(check(["different_person"]).usable).toBe(false);
    expect(check(["blurry", "sunglasses"]).usable).toBe(true);
    // Unknown words from the AI are dropped, and the angle falls back to unknown.
    const odd = trainingImageCheck({
      issues: ["nope", "blurry"],
      angle: "upside",
      framing: 3,
      checkedAt: "t",
    });
    expect(odd.issues).toEqual(["blurry"]);
    expect(odd.angle).toBe("unknown");
  });

  test("a set's verdict: weak under the minimum or with two people, good when large and varied", () => {
    const varied = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `a${index}`,
        check(
          [],
          ["front", "three_quarter", "side"][index % 3]!,
          ["close_up", "head_and_shoulders", "waist_up"][index % 3]!,
        ),
      ]),
    );
    const good = trainingSetVerdict({
      images: varied,
      samePerson: true,
      lighting: "good",
      expressions: "ok",
      advice: [],
      model: null,
      checkedAt: "t",
    });
    expect(good.verdict).toBe("good");
    expect(good.variety.angles).toBe("good");
    expect(good.usable).toBe(12);

    const two = trainingSetVerdict({
      ...{ images: varied },
      samePerson: false,
      lighting: "good",
      expressions: "ok",
      advice: [],
      model: null,
      checkedAt: "t",
    });
    expect(two.verdict).toBe("weak");
    expect(two.advice[0]).toContain("same person");

    const few = trainingSetVerdict({
      images: { a: check([]), b: check([]), c: check(["no_face"]) },
      samePerson: true,
      lighting: "low",
      expressions: "low",
      advice: ["Add photos in daylight"],
      model: null,
      checkedAt: "t",
    });
    expect(few.verdict).toBe("weak");
    expect(few.usable).toBe(2);
    expect(few.advice.some((line) => line.includes("at least 5"))).toBe(true);
    expect(few.variety.angles).toBe("low");
  });

  test("a stored check is read back from an image's metadata", () => {
    expect(
      storedTrainingCheck({
        soul_check: {
          usable: true,
          issues: ["blurry"],
          angle: "side",
          framing: "full_body",
          checked_at: "t",
        },
      }),
    ).toMatchObject({
      usable: true,
      issues: ["blurry"],
      angle: "side",
      framing: "full_body",
    });
    expect(storedTrainingCheck({})).toBeNull();
    expect(storedTrainingCheck(null)).toBeNull();
  });
});

describe("a likeness proof", () => {
  test("is stored and read back, its verdict from its score", () => {
    const stored = storedLikeness({
      score: 8.24,
      verdict: "strong",
      summary: "Consistent",
      assetIds: ["x"],
      perImage: [{ assetId: "x", score: 8.24, notes: "matches" }],
      model: "m",
      checkedAt: "t",
    });
    const read = likenessOf(stored);
    expect(read?.score).toBe(8.2);
    expect(read?.verdict).toBe("strong");
    expect(read?.perImage[0]).toEqual({ assetId: "x", score: 8.2, notes: "matches" });
    expect(likenessOf({ score: 5 })?.verdict).toBe("weak");
    expect(likenessOf({ score: 6 })?.verdict).toBe("fair");
    expect(likenessOf({ score: "x" })).toBeNull();
  });

  test("proof images are made from the shot alone; pack images keep the person, not the outfit", () => {
    expect(proofPrompt("A portrait.")).toBe(
      "A photo of this person. A portrait. Photorealistic, natural skin texture, sharp focus.",
    );
    const pack = packPrompt("A side profile.", {
      description: "A woman in her thirties with short black hair.",
    });
    expect(pack).toContain("exactly the same person");
    expect(pack).toContain("short black hair");
    expect(pack).toContain("different everyday clothes");
  });
});

describe("request keys", () => {
  test("a pack's images and a proof's are found by their keys", () => {
    const key = packRequestKey("char-1", "pack-9", 3);
    expect(key.startsWith(packKeyPrefix("char-1"))).toBe(true);
    expect(packOfKey(key)).toEqual({ packId: "pack-9", index: 3 });
    expect(packOfKey("chr:char-1:face:abc")).toBeNull();
    expect(proofRequestKey("soul-1", "round-2", 0).startsWith(proofKeyPrefix("soul-1"))).toBe(true);
  });
});

describe("Higgsfield's answers about Soul IDs", () => {
  test("a reference is read with its name, Soul model and thumbnail", () => {
    expect(
      readCustomReference({
        id: "abc",
        name: "Janice",
        status: "completed",
        model_version: "V2",
        thumbnail_url: "https://cdn.example.com/t.jpg",
        created_at: "2026-10-16T13:50:00Z",
      }),
    ).toEqual({
      id: "abc",
      state: "ready",
      status: "completed",
      message: null,
      name: "Janice",
      modelVersion: "v2",
      thumbnailUrl: "https://cdn.example.com/t.jpg",
      createdAt: "2026-10-16T13:50:00Z",
    });
    // Nested under data, an insecure thumbnail dropped, an unknown version null.
    expect(
      readCustomReference({
        data: { id: "x", status: "in_progress", model_version: "v9", thumbnail_url: "http://a/b" },
      }),
    ).toMatchObject({ id: "x", state: "training", modelVersion: null, thumbnailUrl: null });
    expect(readCustomReference({ status: "completed" })).toBeNull();
  });

  test("the account's list is read from items, results or data, with its page count", () => {
    const page = readCustomReferenceList({
      items: [{ id: "a", status: "completed" }, { nope: true }, { id: "b", status: "failed" }],
      total_pages: 3,
    });
    expect(page.references.map((reference) => [reference.id, reference.state])).toEqual([
      ["a", "ready"],
      ["b", "failed"],
    ]);
    expect(page.totalPages).toBe(3);
    expect(readCustomReferenceList({ data: [{ id: "c" }] }).references[0]?.id).toBe("c");
    expect(readCustomReferenceList({ results: [{ id: "d" }] }).references[0]?.id).toBe("d");
    expect(readCustomReferenceList(null)).toEqual({ references: [], totalPages: null });
  });
});

describe("a Soul ID in other workflows", () => {
  const opening = {
    modelId: "soul-model",
    characterId: "janice",
    version: "v2" as const,
    referenceId: "ref-1",
  };

  test("a long video's opening keyframe is painted from the Soul ID only when it shows that character alone", () => {
    const settings = { soulOpening: opening };
    expect(paintsWithSoul(settings, 0, [{ id: "janice" }])).toEqual(opening);
    // Later keyframes keep the painter, chained from the opening one.
    expect(paintsWithSoul(settings, 1, [{ id: "janice" }])).toBeNull();
    // Two people in the frame, or someone else: a Soul model paints one person.
    expect(paintsWithSoul(settings, 0, [{ id: "janice" }, { id: "omar" }])).toBeNull();
    expect(paintsWithSoul(settings, 0, [{ id: "omar" }])).toBeNull();
    expect(paintsWithSoul({ soulOpening: null }, 0, [{ id: "janice" }])).toBeNull();
    expect(paintsWithSoul({}, 0, [{ id: "janice" }])).toBeNull();
  });

  test("the Soul opening is read back with a run's keyframe settings", () => {
    const base = { modelId: "painter", values: {}, width: 1080, height: 1920, format: "png" };
    expect(storedKeyframeSettings({ ...base, soulOpening: opening })?.soulOpening).toEqual(opening);
    expect(
      storedKeyframeSettings({ ...base, soulOpening: { ...opening, version: "v9" } })?.soulOpening,
    ).toBeNull();
    expect(storedKeyframeSettings(base)?.soulOpening).toBeNull();
  });

  test("a still painted from a Soul ID carries the scene and the look, not a second face", () => {
    const prompt = soulStillPrompt("  She walks   through a night market.  ", {
      description: "A woman in her thirties in a green linen jacket.",
    });
    expect(prompt).toStartWith("A photo of this person: A woman in her thirties");
    expect(prompt).toContain("She walks through a night market.");
    expect(prompt).toContain("no text");
    expect(soulStillPrompt("A portrait.", { description: " " })).toStartWith(
      "A photo of this person. A portrait.",
    );
  });
});
