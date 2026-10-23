import { describe, expect, test } from "bun:test";
import {
  briefTime,
  cueOf,
  planFromBrief,
  readBrief,
  readBriefText,
  saveStoryboardPlan,
  type Brief,
} from "../../src/lib/storyboard/brief";
import { FakeDb } from "../long-video/fake-db";
import { BRIEF, BRIEF_TEXT, SPEC } from "./reel-1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Reel 1's brief, changed by `edit`. */
function edited(
  edit: (brief: { shots: Record<string, unknown>[] } & Record<string, unknown>) => void,
) {
  const brief = clone(BRIEF) as unknown as { shots: Record<string, unknown>[] } & Record<
    string,
    unknown
  >;
  edit(brief);
  return readBrief(brief);
}

describe("reading a brief", () => {
  test("reads Reel 1's system edition clean, but for its delivery's stale length", () => {
    const reading = readBriefText(BRIEF_TEXT);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.brief.shots).toHaveLength(27);
    // Its delivery still gives the voiceover's 106.031 s; the third cut runs to 131.2 s.
    expect(reading.warnings).toEqual([
      "The shots run to 02:11.200, but the brief's delivery is 106.031 s.",
    ]);
  });

  test("stops at what would make a wrong storyboard, naming the shot", () => {
    const twice = edited((brief) => {
      brief.shots[3]!["id"] = "01.1";
    });
    expect(twice).toEqual({ ok: false, problems: ["Shot 01.1 is in the brief twice."] });

    const backwards = edited((brief) => {
      brief.shots[1]!["out"] = 5;
    });
    expect(backwards.ok).toBe(false);
    if (!backwards.ok)
      expect(backwards.problems[0]).toBe("Shot 01.2 ends (00:05.000) before it starts.");

    const order = edited((brief) => {
      const beats = brief.shots[0]!["beats"] as { at: number }[];
      beats[2]!.at = 0.5;
    });
    expect(order.ok).toBe(false);
    if (!order.ok)
      expect(order.problems).toContain(
        "Shot 01.1: its beat at 00:00.500 comes before the one above it.",
      );

    const outside = edited((brief) => {
      (brief.shots[4]!["beats"] as { at: number }[]).at(-1)!.at = 40;
    });
    expect(outside.ok).toBe(false);
    if (!outside.ok)
      expect(outside.problems).toEqual([
        "Shot 04.1: a beat at 00:40.000 falls outside 00:28.933–00:35.733.",
      ]);
  });

  test("says what is missing in the brief's own words", () => {
    const shape = edited((brief) => {
      delete brief.shots[2]!["id"];
      (brief.shots[5]!["beats"] as Record<string, unknown>[])[0]!["do"] = "";
    });
    expect(shape.ok).toBe(false);
    if (!shape.ok) {
      expect(shape.problems.some((problem) => problem.startsWith("Shot 3 (id):"))).toBe(true);
      expect(shape.problems.some((problem) => problem.startsWith("Shot 04.2 (beats.0.do):"))).toBe(
        true,
      );
    }
    expect(readBrief({ title: "Nothing in it", shots: [] }).ok).toBe(false);
    expect(readBrief(null).ok).toBe(false);
    expect(readBriefText("{ not json")).toEqual({
      ok: false,
      problems: ["That isn't JSON: export the brief as its brief.json."],
    });
    expect(readBriefText(" ".repeat(2_000_001)).ok).toBe(false);
  });

  test("warns of gaps, overlaps and lengths that don't add up", () => {
    const reading = readBrief({
      title: "Three shots",
      shots: [
        { id: "a", in: 0, out: 2, seconds: 2 },
        { id: "b", in: 2.5, out: 4, seconds: 1 },
        { id: "c", in: 3.5, out: 6 },
      ],
    });
    expect(reading).toEqual({
      ok: true,
      brief: expect.anything() as Brief,
      warnings: [
        "Shot b says it is 1 s, but runs 1.500 s.",
        "There is a gap of 0.500 s between a and b.",
        "c starts 0.500 s before b ends.",
      ],
    });
  });

  test("times read as the brief's page writes them", () => {
    expect(briefTime(0)).toBe("00:00.000");
    expect(briefTime(131.2)).toBe("02:11.200");
    expect(briefTime(59.9996)).toBe("01:00.000");
    expect(briefTime(28.933)).toBe("00:28.933");
  });
});

describe("a storyboard from a brief", () => {
  const reading = readBrief(clone(BRIEF));
  if (!reading.ok) throw new Error("Reel 1's brief should read");
  const plan = planFromBrief(reading.brief);

  test("makes a scene a block and a shot a shot, in the brief's order", () => {
    expect(plan.scenes.map((scene) => scene.name)).toEqual(
      Array.from({ length: 15 }, (_, index) => `Block ${String(index + 1).padStart(2, "0")}`),
    );
    expect(plan.shotCount).toBe(27);
    expect(
      plan.scenes.flatMap((scene) => scene.shots).map((shot) => shot.name.split(" · ")[0]),
    ).toEqual(BRIEF.shots.map((shot) => shot.id));
    const [first, second] = plan.scenes[0]!.shots;
    expect(first).toMatchObject({
      shot_number: 1,
      name: "01.1 · Somewhere in Australia, one pin turns gold",
      description: "The property's card, readable, above its gold pin on the satellite map.",
      duration_seconds: 5.467,
    });
    expect(second!.shot_number).toBe(2);
    expect(first!.prompt!.split("\n")[0]).toMatch(/^00:00\.000 The continent from orbit/);
    expect(plan.scenes[0]!.purpose).toBe("(00:00.000 to 00:09.633, 9.63 s)");
    expect(plan.seconds).toBeCloseTo(131.2, 6);
  });

  test("keeps everything the brief says about a shot in its spec, with its cue", () => {
    const shots = plan.scenes.flatMap((scene) => scene.shots);
    shots.forEach((shot, index) => {
      const source = BRIEF.shots[index]!;
      expect(shot.spec).toEqual({ ...source, cue: source.voiceover[0]!, brief: BRIEF["title"] });
    });
    expect(shots[26]!.spec["cue"]).toBe("Aurixa Systems.");
  });

  test("keeps the brief's delivery and voiceover on the storyboard", () => {
    expect(plan.storyboard).toMatchObject({
      title: "Aurixa Systems · Reel 1 · System edition",
      primary_aspect_ratio: "9:16",
      target_duration_seconds: 131,
    });
    expect(plan.storyboard.objective).toMatch(
      /^Watch one property move through one connected system/,
    );
    expect(plan.storyboard.creative_direction).toMatchObject({
      source: "brief",
      voiceover_asset_id: "84c0abf7-60d1-4439-84fd-e7038feffc01",
      delivery: { fps: 30, aspect_ratio: "9:16" },
      brief: { written: "2026-10-21" },
    });
  });

  test("names scenes from the brief's blocks when it has them", () => {
    const withBlocks = readBrief({ ...clone(BRIEF), blocks: SPEC.timing.blocks });
    if (!withBlocks.ok) throw new Error("should read");
    const scenes = planFromBrief(withBlocks.brief).scenes;
    expect(scenes[0]!.name).toBe("Block 01 · The opportunity and the client");
    expect(scenes[0]!.purpose).toMatch(
      /^Give the viewer one recognisable property.*\(00:00\.000 to/,
    );
  });

  test("runs shots without a block into one scene, and starts a scene each time the block changes", () => {
    const loose = readBrief({
      title: "Loose",
      shots: [
        { id: "x" },
        { id: "y", block: "A" },
        { id: "z", block: "B" },
        { id: "w", block: "A" },
      ],
    });
    if (!loose.ok) throw new Error("should read");
    const scenes = planFromBrief(loose.brief).scenes;
    expect(scenes.map((scene) => scene.name)).toEqual([
      "Shots x to x",
      "Block A",
      "Block B",
      "Block A",
    ]);
    expect(scenes[0]!.shots[0]).toMatchObject({
      duration_seconds: null,
      prompt: null,
      description: null,
    });
  });

  test("a shot's cue is its own, else its first voiceover line", () => {
    expect(cueOf({ cue: "  Not this one  ", voiceover: ["But this"] })).toBe("Not this one");
    expect(cueOf({ voiceover: ["", " Somewhere in Australia, "] })).toBe("Somewhere in Australia,");
    expect(cueOf({})).toBeNull();
  });
});

describe("saving the plan", () => {
  const reading = readBrief(clone(BRIEF));
  if (!reading.ok) throw new Error("Reel 1's brief should read");
  const plan = planFromBrief(reading.brief);

  test("saves the storyboard, its scenes and its shots", async () => {
    const db = new FakeDb();
    const id = await saveStoryboardPlan(db as never, plan, {
      userId: "user-1",
      projectId: "project-1",
    });
    expect(db.find("storyboards", id)).toMatchObject({
      title: plan.storyboard.title,
      project_id: "project-1",
      created_by: "user-1",
      status: "draft",
    });
    const scenes = db.rows("scenes");
    expect(scenes).toHaveLength(15);
    const shots = db.rows("shots");
    expect(shots).toHaveLength(27);
    const block5 = scenes.find((scene) => scene["scene_number"] === 5)!;
    expect(
      shots.filter((shot) => shot["scene_id"] === block5["id"]).map((shot) => shot["name"]),
    ).toEqual([
      "05.1 · From research into financial analysis",
      "05.2 · Into a report the client can understand",
    ]);
  });

  test("leaves nothing behind when the shots can't be saved", async () => {
    const db = new FakeDb();
    const failing = {
      from: (table: string) =>
        table === "shots"
          ? { insert: () => Promise.resolve({ data: null, error: { message: "Shots are full" } }) }
          : db.from(table),
    };
    await expect(
      saveStoryboardPlan(failing as never, plan, { userId: "user-1", projectId: null }),
    ).rejects.toThrow("Shots are full");
    expect(db.rows("storyboards")).toHaveLength(0);
  });
});
