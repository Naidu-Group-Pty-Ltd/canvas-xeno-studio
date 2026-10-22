import { describe, expect, test } from "bun:test";
import { emptyTimeline, type Timeline, type TimelineClip } from "../../src/lib/edit/timeline";
import {
  breakCost,
  budgetState,
  canStart,
  clipFrame,
  EMPTY_WORK,
  extensionSteps,
  frameIndex,
  joinClips,
  joinsOf,
  joinLookOf,
  joinMeasuresOf,
  joinVerdictOf,
  judgeJoin,
  mergeSection,
  ownedByAsset,
  planReport,
  planSections,
  planViewOf,
  renderJoinAt,
  SECTION_LIMITS,
  sectionBrief,
  sectionCount,
  sectionSteps,
  sectionTitle,
  sectionWorkOf,
  shotSteps,
  startsFromNumbers,
  statusAfterTurn,
  stepBudget,
  TAKING_FRAME,
  turnLimit,
  unavailableFrame,
  unsavedShots,
  warnFrom,
  withGenerations,
  withLoose,
  withSaved,
  type JoinMeasures,
  type ReelShot,
  type SavedShot,
  type SectionBriefInput,
} from "../../src/lib/supercomputer/sections";

const ASSET = (n: number) => `${String(n).padStart(8, "0")}-58c4-4a93-9d43-1b2c3d4e5f60`;

function shot(index: number, extra: Partial<ReelShot> = {}): ReelShot {
  return {
    ref: `ref-${index}`,
    index,
    label: `Clip ${index + 1}`,
    seconds: 2,
    assetId: ASSET(index + 1),
    kind: "video",
    beat: `Beat ${index + 1}`,
    group: null,
    continuous: false,
    firstFrame: { kind: "video", assetId: ASSET(index + 1), seconds: 0 },
    lastFrame: { kind: "video", assetId: ASSET(index + 1), seconds: 2 },
    ...extra,
  };
}

const reel = (count: number, extra: (index: number) => Partial<ReelShot> = () => ({})) =>
  Array.from({ length: count }, (_, index) => shot(index, extra(index)));

/* ------------------------------------------------------------------ */
/* Turn limits                                                         */
/* ------------------------------------------------------------------ */

describe("a worker's turn limit, from its work", () => {
  test("a shot's steps: looked at if made, made (with a second wait for a video) if not", () => {
    expect(shotSteps(shot(0))).toBe(2);
    expect(shotSteps(shot(0, { assetId: null, kind: "image" }))).toBe(5);
    expect(shotSteps(shot(0, { assetId: null, kind: "video" }))).toBe(6);
    // Opening a section by carrying straight on from another's last frame: one more step.
    expect(shotSteps(shot(3, { continuous: true }), true)).toBe(3);
    expect(shotSteps(shot(3, { continuous: true }), false)).toBe(2);
    // The reel's first shot carries on from nothing.
    expect(shotSteps(shot(0, { continuous: true }), true)).toBe(2);
  });

  test("a section's steps and its limit: a quarter's room, at least six, at most a turn", () => {
    const shots = reel(6, (index) => (index >= 3 ? { assetId: null } : {}));
    // Three made (2 each), three to make (6 each), and its own two.
    expect(sectionSteps(shots, 0, 5)).toBe(2 + 3 * 2 + 3 * 6);
    expect(stepBudget(26)).toBe(SECTION_LIMITS.turnSteps);
    expect(stepBudget(10)).toBe(13);
    expect(stepBudget(1)).toBe(SECTION_LIMITS.minBudget);
    expect(stepBudget(25.6)).toBe(32);
  });

  test("warned a fifth before its limit (two steps at least); a turn takes what is left", () => {
    expect(warnFrom(14)).toBe(11);
    expect(warnFrom(6)).toBe(4);
    expect(warnFrom(32)).toBe(25);
    expect(warnFrom(2)).toBe(1);
    expect(turnLimit(14, 0)).toBe(14);
    expect(turnLimit(14, 10)).toBe(4);
    // Spent: one step, to save and say so (a carry-on extends it first).
    expect(turnLimit(14, 20)).toBe(1);
    expect(turnLimit(60, 0)).toBe(SECTION_LIMITS.turnSteps);
    expect(budgetState(3, 14)).toBe("ok");
    expect(budgetState(11, 14)).toBe("near");
    expect(budgetState(14, 14)).toBe("reached");
  });

  test("a carry-on adds the steps its unsaved shots need, within bounds", () => {
    const shots = reel(4, (index) => (index > 1 ? { assetId: null } : {}));
    expect(extensionSteps(shots, [2, 3])).toBe(Math.ceil((2 + 6 + 6) * 1.25));
    expect(extensionSteps(shots, [])).toBe(SECTION_LIMITS.minExtension);
    expect(
      extensionSteps(
        reel(10, () => ({ assetId: null })),
        [...Array(10).keys()],
      ),
    ).toBe(SECTION_LIMITS.maxExtension);
  });
});

/* ------------------------------------------------------------------ */
/* Sectioning                                                          */
/* ------------------------------------------------------------------ */

describe("splitting a reel into sections", () => {
  test("as many as the work needs, each a run of whole shots that tile the reel", () => {
    const shots = reel(12);
    expect(sectionCount(shots)).toBe(2);
    const sections = planSections(shots);
    expect(sections.map((section) => [section.first, section.last])).toEqual([
      [0, 5],
      [6, 11],
    ]);
    expect(sections[0]).toMatchObject({ position: 0, title: "Shots 1–6", seconds: 12, steps: 14 });
    expect(sections[0]!.budget).toBe(stepBudget(14));
    // More work, more sections.
    expect(sectionCount(reel(12, () => ({ assetId: null })))).toBe(4);
    expect(planSections([])).toEqual([]);
  });

  test("they break between scenes rather than inside one", () => {
    const groups = ["1. Opening", "2. The kitchen", "3. The close"];
    const shots = reel(12, (index) => ({ group: groups[Math.floor(index / 4)]!, assetId: null }));
    const sections = planSections(shots, { sections: 3 });
    expect(sections.map((section) => section.first)).toEqual([0, 4, 8]);
    expect(sections.map((section) => section.title)).toEqual([
      "1. Opening · shots 1–4",
      "2. The kitchen · shots 5–8",
      "3. The close · shots 9–12",
    ]);
    expect(breakCost(shots, 4)).toBe(0);
    expect(breakCost(shots, 5)).toBeGreaterThan(0);
  });

  test("a run carried straight on is broken last: at the one hard cut if there is one", () => {
    // A long video: every clip continues from the one before, except clip 5.
    const shots = reel(8, (index) => ({ continuous: index > 0 && index !== 4 }));
    expect(planSections(shots, { sections: 2 }).map((section) => section.first)).toEqual([0, 4]);
    expect(breakCost(shots, 3)).toBe(1);
    // The section that opens on a continuous join carries the step to match it.
    const unbroken = reel(8, (index) => ({ continuous: index > 0 }));
    const [, second] = planSections(unbroken, { sections: 2 });
    expect(second!.steps).toBe(sectionSteps(unbroken, second!.first, second!.last));
    expect(second!.steps).toBe(2 + 4 * 2 + 1);
  });

  test("a section whose work won't fit a turn is avoided when an even split can't help", () => {
    // Twelve videos to make in two sections would overflow one turn each: three fit.
    const shots = reel(12, () => ({ assetId: null }));
    const two = planSections(shots, { sections: 2 });
    expect(two.every((section) => section.budget <= SECTION_LIMITS.turnSteps)).toBe(true);
    expect(planSections(shots).length).toBeGreaterThanOrEqual(4);
  });

  test("by hand: the shot numbers sections start at (shot 1 always starts one)", () => {
    const shots = reel(10);
    expect(startsFromNumbers(shots, [5, 3, 3, 0, 11, 1.5])).toEqual([0, 2, 4]);
    const sections = planSections(shots, { starts: [4, 8] });
    expect(sections.map((section) => [section.first, section.last])).toEqual([
      [0, 2],
      [3, 6],
      [7, 9],
    ]);
    expect(planSections(reel(40), { sections: 50 })).toHaveLength(SECTION_LIMITS.maxSections);
  });

  test("titles name the scenes they cover", () => {
    const shots = reel(6, (index) => ({ group: index < 3 ? "Opening" : "Kitchen" }));
    expect(sectionTitle(shots, 0, 2)).toBe("Opening · shots 1–3");
    expect(sectionTitle(shots, 1, 4)).toBe("Opening to Kitchen · shots 2–5");
    expect(sectionTitle(reel(3), 2, 2)).toBe("Shot 3");
  });
});

/* ------------------------------------------------------------------ */
/* Joins and frames                                                    */
/* ------------------------------------------------------------------ */

describe("how sections meet", () => {
  test("each join is one shot carrying on, a cut in a scene, or a cut to another", () => {
    const shots = reel(6, (index) => ({
      group: index < 4 ? "A" : "B",
      continuous: index === 2,
    }));
    const sections = planSections(shots, { starts: [3, 4, 5] });
    expect(joinsOf(sections, shots)).toEqual([
      { position: 0, before: 1, after: 2, kind: "continuous" },
      { position: 1, before: 2, after: 3, kind: "cut" },
      { position: 2, before: 3, after: 4, kind: "scene" },
    ]);
  });

  test("a frame is counted from its time: the first shown, or the one before an out point", () => {
    expect(frameIndex(0, 30, "first")).toBe(0);
    expect(frameIndex(2, 30, "last")).toBe(59);
    expect(frameIndex(1.5, 24, "first")).toBe(36);
    expect(frameIndex(0, 30, "last")).toBe(0);
    expect(frameIndex(1, 0, "first")).toBe(30);
    const clip = {
      ...emptyTimeline().clips[0],
      id: "c",
      assetId: ASSET(1),
      kind: "video",
      trimStart: 0.5,
      duration: 2,
      speed: 1.5,
    } as TimelineClip;
    expect(clipFrame(clip, "first")).toEqual({ kind: "video", assetId: ASSET(1), seconds: 0.5 });
    expect(clipFrame(clip, "last")).toEqual({ kind: "video", assetId: ASSET(1), seconds: 3.5 });
    expect(clipFrame({ ...clip, kind: "image" }, "last")).toEqual({
      kind: "still",
      assetId: ASSET(1),
    });
  });
});

/* ------------------------------------------------------------------ */
/* Briefs                                                              */
/* ------------------------------------------------------------------ */

describe("a worker's brief", () => {
  const shots = reel(9, (index) => ({
    continuous: index === 3,
    ...(index === 6 ? { assetId: null } : {}),
  }));
  const sections = planSections(shots, { starts: [4, 7] });
  const base: SectionBriefInput = {
    plan: {
      title: "Launch in sections",
      kind: "long_video",
      sourceTitle: "Launch",
      editTitle: "Launch · sections",
      sections: 3,
    },
    section: sections[1]!,
    shots,
    before: {
      section: 0,
      shot: shots[2]!,
      join: "continuous",
      frame: { status: "ready", assetId: ASSET(99), bucket: "b", path: "p.png", note: null },
    },
    after: { section: 2, shot: shots[6]!, join: "cut", frame: TAKING_FRAME },
    budget: 13,
  };

  test("it names its shots and its neighbours' last and first frames, and how to meet them", () => {
    const brief = sectionBrief(base);
    expect(brief).toContain("# Section 2 of 3: Shots 4–6");
    expect(brief).toContain("You own shots 4–6 and nothing else");
    expect(brief).toContain("“Launch · sections”");
    expect(brief).toContain(`Shot 4 “Clip 4” · 2.0 s · made: library file ${ASSET(4)}: Beat 4`);
    expect(brief).toContain(
      `Section 1's last frame (shot 3 “Clip 3”) is library image ${ASSET(99)}, shown below.`,
    );
    expect(brief).toContain("opens on exactly this picture");
    expect(brief).toContain("start frame");
    expect(brief).toContain("Section 3's first frame (shot 7 “Clip 7”) is still being taken");
    expect(brief).toContain("a cut within the scene");
    expect(brief).toContain("You have 13 steps");
    expect(brief).toContain("save_section");
    expect(brief).toContain("finish_section");
  });

  test("a frame not to be had says why, and what to work from instead", () => {
    const brief = sectionBrief({
      ...base,
      before: null,
      after: { ...base.after!, frame: unavailableFrame("the media service isn't set up") },
    });
    expect(brief).not.toContain("It starts where");
    expect(brief).toContain(
      "Section 3's first frame (shot 7 “Clip 7”) isn't to be had (the media service isn't set up): work from what the shot is, Beat 7.",
    );
  });

  test("carrying on: what it saved, what it made and didn't place, its note, its steps left", () => {
    const work = withLoose(withSaved(EMPTY_WORK, [saved(3, ASSET(50))]), [
      { assetId: ASSET(51), kind: "video", generationId: "g1", madeAt: "2026-10-22T00:00:00Z" },
    ]);
    const brief = sectionBrief({
      ...base,
      work: { ...work, note: "Make shot 4 again from section 1's last frame: the colour jumps." },
      budget: 20,
      used: 13,
    });
    expect(brief).toContain(`Shot 4 “Clip 4” · 2.0 s · saved: library file ${ASSET(50)}`);
    expect(brief).toContain(`Library file ${ASSET(51)} (video, generation g1)`);
    expect(brief).toContain("## To put right\nMake shot 4 again");
    expect(brief).toContain("You have 7 steps");
  });
});

/* ------------------------------------------------------------------ */
/* What a worker saves                                                 */
/* ------------------------------------------------------------------ */

function saved(shotIndex: number, assetId: string, extra: Partial<SavedShot> = {}): SavedShot {
  return {
    shot: shotIndex,
    assetId,
    kind: "video",
    seconds: null,
    trimStart: 0,
    fileSeconds: 5,
    savedAt: "2026-10-22T00:00:00Z",
    ...extra,
  };
}

describe("a section's record of its work", () => {
  test("read tolerantly; a shot saved again takes its new file", () => {
    expect(sectionWorkOf(null)).toEqual(EMPTY_WORK);
    const read = sectionWorkOf({
      shots: [saved(2, ASSET(1)), { shot: "x" }, { shot: 1, assetId: ASSET(2), kind: "audio" }],
      loose: [{ assetId: ASSET(3), kind: "image" }, {}],
      summary: "  Made the kitchen.  ",
      finished: true,
    });
    expect(read.shots).toHaveLength(1);
    expect(read.loose).toEqual([
      { assetId: ASSET(3), kind: "image", generationId: null, madeAt: new Date(0).toISOString() },
    ]);
    expect(read.summary).toBe("Made the kitchen.");
    expect(read.finished).toBe(true);

    const again = withSaved(read, [saved(2, ASSET(4)), saved(0, ASSET(3))]);
    expect(again.shots.map((entry) => [entry.shot, entry.assetId])).toEqual([
      [0, ASSET(3)],
      [2, ASSET(4)],
    ]);
    // The loose take now saved to a shot isn't loose any more.
    expect(again.loose).toEqual([]);
    expect(unsavedShots({ first: 0, last: 3 }, again)).toEqual([1, 3]);
  });

  test("what was made but not saved is kept once, never one already saved", () => {
    const work = withSaved(EMPTY_WORK, [saved(0, ASSET(1))]);
    const take = (n: number) => ({
      assetId: ASSET(n),
      kind: "video" as const,
      generationId: null,
      madeAt: "2026-10-22T00:00:00Z",
    });
    const kept = withLoose(work, [take(1), take(2), take(2)]);
    expect(kept.loose.map((entry) => entry.assetId)).toEqual([ASSET(2)]);
    expect(withLoose(kept, [take(2)])).toBe(kept);
  });

  test("a turn's end sets the section's state", () => {
    expect(statusAfterTurn("complete", { finished: true })).toBe("done");
    expect(statusAfterTurn("complete", { finished: false })).toBe("saved");
    expect(statusAfterTurn("awaiting_approval", { finished: true })).toBe("awaiting_approval");
    expect(statusAfterTurn("stopped", { finished: false })).toBe("stopped");
    expect(statusAfterTurn("failed", { finished: false })).toBe("failed");
    expect(canStart("working")).toBe(false);
    expect(canStart("done")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The merge                                                           */
/* ------------------------------------------------------------------ */

function clip(id: string, assetId: string, extra: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id,
    assetId,
    kind: "video",
    trimStart: 0,
    duration: 2,
    speed: 1,
    volume: 0,
    fit: null,
    focus: null,
    motion: "none",
    transition: { type: "cut", duration: 0 },
    matchPrevious: false,
    smartBlend: false,
    ...extra,
  };
}

function edit(clips: TimelineClip[]): Timeline {
  return { ...emptyTimeline(), clips };
}

describe("merging a section into the integration edit", () => {
  const shots = reel(6, (index) => ({ continuous: index === 3 }));
  const timeline = edit([
    clip("a", ASSET(1)),
    clip("b", ASSET(2)),
    clip("c", ASSET(3), { transition: { type: "fade", duration: 0.4 } }),
    clip("d", ASSET(4), { smartBlend: true, matchPrevious: true }),
    clip("e", ASSET(5)),
    clip("f", ASSET(6)),
  ]);
  const owned = (pairs: [number, string][]) =>
    pairs.map(([shotIndex, clipId]) => ({ shot: shotIndex, clipId }));
  const others = [
    { position: 0, clipIds: ["a", "b", "c"] },
    { position: 2, clipIds: ["f"] },
  ];

  test("a saved shot takes its clip's place, keeping its transition and join", () => {
    const result = mergeSection({
      timeline,
      shots,
      section: { position: 1, first: 3, last: 4 },
      owned: owned([
        [3, "d"],
        [4, "e"],
      ]),
      others,
      saved: [saved(3, ASSET(40), { seconds: 2.5 })],
    });
    expect(result.timeline.clips.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
      `s2-4-${ASSET(40).slice(0, 8)}`,
      "e",
      "f",
    ]);
    const placed = result.timeline.clips[3]!;
    expect(placed).toMatchObject({
      assetId: ASSET(40),
      duration: 2.5,
      smartBlend: true,
      matchPrevious: true,
      label: "Clip 4",
      sourceDuration: 5,
    });
    expect(result.owned).toEqual(
      owned([
        [3, placed.id],
        [4, "e"],
      ]),
    );
    expect(result.placed).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.notes).toEqual([
      "Section 2 runs 4.5 s against 4.0 s planned: what follows it moves 0.5 s later.",
    ]);
    expect(result.changed).toBe(true);
    // Only the section's own clips changed.
    expect(result.timeline.clips[2]).toBe(timeline.clips[2]!);

    // Merged again with the same work: the same clips, the same ids, nothing changed.
    const again = mergeSection({
      timeline: result.timeline,
      shots,
      section: { position: 1, first: 3, last: 4 },
      owned: result.owned,
      others,
      saved: [saved(3, ASSET(40), { seconds: 2.5 })],
    });
    expect(again.changed).toBe(false);
    expect(again.timeline.clips.map((entry) => entry.id)).toEqual(
      result.timeline.clips.map((entry) => entry.id),
    );
  });

  test("a section with nothing in the edit yet goes after the sections before it", () => {
    const shorter = edit(timeline.clips.filter((entry) => entry.id !== "d" && entry.id !== "e"));
    const result = mergeSection({
      timeline: shorter,
      shots,
      section: { position: 1, first: 3, last: 4 },
      owned: [],
      others,
      saved: [saved(4, ASSET(45)), saved(3, ASSET(44))],
    });
    expect(result.timeline.clips.map((entry) => entry.assetId)).toEqual([
      ASSET(1),
      ASSET(2),
      ASSET(3),
      ASSET(44),
      ASSET(45),
      ASSET(6),
    ]);
    // A new clip carrying straight on from another section is smart-blended in.
    expect(result.timeline.clips[3]).toMatchObject({ smartBlend: true, matchPrevious: true });
    expect(result.timeline.clips[4]).toMatchObject({ smartBlend: false, matchPrevious: false });
  });

  test("shots not saved keep their clips; shots with nothing to show are named", () => {
    const result = mergeSection({
      timeline,
      shots,
      section: { position: 1, first: 3, last: 4 },
      owned: owned([[3, "d"]]),
      others,
      saved: [],
    });
    expect(result.timeline.clips.map((entry) => entry.id)).toEqual(
      timeline.clips.map((entry) => entry.id),
    );
    expect(result.missing).toEqual([4]);
    expect(result.notes).toEqual(["Shot 5 has nothing to show yet."]);
    expect(result.changed).toBe(false);
  });

  test("the first section's first clip carries on from nothing; a still keeps its look", () => {
    const result = mergeSection({
      timeline,
      shots: reel(6, () => ({ continuous: true })),
      section: { position: 0, first: 0, last: 0 },
      owned: owned([[0, "a"]]),
      others: [],
      saved: [saved(0, ASSET(70), { kind: "image", fileSeconds: null })],
    });
    expect(result.timeline.clips[0]).toMatchObject({
      assetId: ASSET(70),
      kind: "image",
      trimStart: 0,
      smartBlend: false,
      matchPrevious: false,
    });
  });

  test("within what an edit holds: shots past the limit are named, never dropped silently", () => {
    const many = edit(
      Array.from({ length: 59 }, (_, index) => clip(`k${index}`, ASSET(index + 100))),
    );
    const result = mergeSection({
      timeline: many,
      shots: reel(3),
      section: { position: 0, first: 0, last: 2 },
      owned: [],
      others: [],
      saved: [saved(0, ASSET(1)), saved(1, ASSET(2)), saved(2, ASSET(3))],
    });
    expect(result.timeline.clips).toHaveLength(60);
    expect(result.placed).toBe(1);
    expect(result.notes[0]).toBe("The edit holds 60 clips, so shots 2, 3 aren't in it.");
  });

  test("the clips either side of a join, and whether anything was put between them", () => {
    const sides = joinClips(
      timeline,
      owned([[2, "c"]]),
      owned([
        [3, "d"],
        [4, "e"],
      ]),
    );
    expect(sides.before?.id).toBe("c");
    expect(sides.after?.id).toBe("d");
    expect(sides.afterIndex).toBe(3);
    expect(sides.adjacent).toBe(true);
    expect(joinClips(timeline, owned([[1, "b"]]), owned([[3, "d"]])).adjacent).toBe(false);
    expect(joinClips(timeline, [], owned([[3, "d"]])).before).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Join checks                                                         */
/* ------------------------------------------------------------------ */

const measures = (extra: Partial<JoinMeasures>): JoinMeasures => ({
  kind: "continuous",
  look: null,
  render: null,
  characters: null,
  lettering: null,
  videos: true,
  blend: "plain",
  ...extra,
});

const look = (
  framing: "same" | "minor" | "different" | "unseen",
  colour: "same" | "minor" | "different" | "unseen",
  continuity: "same" | "minor" | "different" | "unseen",
  differences: string[] = [],
) => ({ framing, colour, continuity, differences });

describe("checking a join on both sides", () => {
  const sides = { before: 1, after: 2 };

  test("one shot carrying on that is the same picture either side meets as it should", () => {
    const verdict = judgeJoin(
      measures({ look: look("same", "same", "same"), blend: "smart" }),
      sides,
    );
    expect(verdict.status).toBe("matches");
    expect(verdict.fixes).toEqual([]);
    expect(verdict.summary).toBe(
      "Sections 2 → 3 (one shot carrying straight on): it meets as it should.",
    );
  });

  test("a framing jump is a difference, fixed by making the later shot from the earlier's frame", () => {
    const verdict = judgeJoin(
      measures({ look: look("different", "same", "same", ["framing: closer after the cut"]) }),
      sides,
    );
    expect(verdict.status).toBe("differs");
    expect(verdict.findings[0]).toEqual({
      aspect: "framing",
      status: "differs",
      detail: "closer after the cut",
    });
    expect(verdict.fixes.map((entry) => entry.kind)).toEqual(["redo_after"]);
    expect(verdict.fixes[0]).toMatchObject({ section: 2 });
    expect(verdict.summary).toBe(
      "Sections 2 → 3 (one shot carrying straight on): framing: closer after the cut.",
    );
  });

  test("a slight shift matches, and offers the render's smart blend and colour match", () => {
    const verdict = judgeJoin(
      measures({ look: look("minor", "minor", "same", ["colour: a touch warmer after"]) }),
      sides,
    );
    expect(verdict.status).toBe("matches");
    expect(verdict.fixes.map((entry) => entry.kind)).toEqual(["smart_blend", "colour_match"]);
    // Already smart-blended: nothing to offer.
    expect(
      judgeJoin(measures({ look: look("minor", "minor", "same"), blend: "smart" }), sides).fixes,
    ).toEqual([]);
    // Stills can't be blended by the render.
    expect(
      judgeJoin(measures({ look: look("minor", "same", "same"), videos: false }), sides).fixes,
    ).toEqual([]);
  });

  test("the last render's smart-join measurement is used: in register, or not the same picture", () => {
    const fine = judgeJoin(
      measures({
        render: {
          matched: true,
          moved: 0.012,
          likenessBefore: 0.9,
          likenessAfter: 0.97,
          left: null,
        },
        look: look("same", "same", "same"),
      }),
      sides,
    );
    expect(fine.findings[0]!.detail).toBe(
      "Put back in register by the render (the later side was out by 1.2%).",
    );
    const apart = judgeJoin(
      measures({
        render: {
          matched: false,
          moved: null,
          likenessBefore: 0.4,
          likenessAfter: 0.4,
          left: "different_pictures",
        },
      }),
      sides,
    );
    expect(apart.status).toBe("differs");
    expect(apart.findings[0]!.detail).toContain("aren't the same picture");
  });

  test("a cut within a scene: the framing may change, the grade and continuity hold", () => {
    const verdict = judgeJoin(
      measures({ kind: "cut", look: look("different", "different", "same", ["colour: cooler"]) }),
      sides,
    );
    expect(verdict.findings.map((entry) => [entry.aspect, entry.status])).toEqual([
      ["framing", "expected"],
      ["colour", "differs"],
      ["continuity", "ok"],
    ]);
    expect(verdict.fixes.map((entry) => entry.kind)).toEqual(["redo_after"]);
  });

  test("a cut between scenes holds only the cast and the lettering", () => {
    const verdict = judgeJoin(
      measures({
        kind: "scene",
        look: look("different", "different", "different"),
        characters: { flagged: true, summary: "Mia: a red jacket instead of navy" },
        lettering: { before: "garbled", after: "legible", summary: "Garbled text: the sign" },
      }),
      sides,
    );
    expect(verdict.status).toBe("differs");
    expect(verdict.findings.map((entry) => [entry.aspect, entry.status])).toEqual([
      ["framing", "expected"],
      ["colour", "expected"],
      ["continuity", "expected"],
      ["characters", "differs"],
      ["lettering", "differs"],
    ]);
    expect(verdict.fixes.map((entry) => entry.kind)).toEqual(["redo_after", "redo_before"]);
    expect(verdict.fixes[1]).toMatchObject({ section: 1 });
  });

  test("nothing measured yet is said so", () => {
    const verdict = judgeJoin(measures({}), sides);
    expect(verdict.status).toBe("unmeasured");
    expect(verdict.summary).toContain("it couldn't be judged");
  });

  test("a render's smart-join record is read for one clip", () => {
    const metadata = {
      probe: {
        smart_joins: [
          { clip: 2, matched: false, left: "already_matching", likeness_before: 0.98 },
          {
            clip: 4,
            matched: true,
            likeness_before: 0.91,
            likeness_after: 0.97,
            framing: { moved: 0.0123 },
          },
        ],
      },
    };
    expect(renderJoinAt(metadata, 4)).toEqual({
      matched: true,
      moved: 0.0123,
      likenessBefore: 0.91,
      likenessAfter: 0.97,
      left: null,
    });
    expect(renderJoinAt(metadata, 2)?.left).toBe("already_matching");
    expect(renderJoinAt(metadata, 3)).toBeNull();
    expect(renderJoinAt(null, 0)).toBeNull();
  });

  test("a verdict is kept and read back as it was", () => {
    const verdict = judgeJoin(
      measures({ kind: "scene", lettering: { before: "garbled", after: null, summary: null } }),
      sides,
    );
    expect(joinVerdictOf(JSON.parse(JSON.stringify(verdict)))).toEqual(verdict);
    expect(
      joinVerdictOf({ findings: [{ aspect: "smell", status: "ok" }], fixes: [{ kind: "x" }] }),
    ).toEqual({ status: "unmeasured", findings: [], summary: "", fixes: [] });
    expect(joinVerdictOf(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Plans as kept                                                       */
/* ------------------------------------------------------------------ */

describe("a plan as the tables keep it", () => {
  const shots = reel(6, (index) => ({
    continuous: index === 3,
    ...(index === 5 ? { assetId: null } : {}),
  }));
  const planned = planSections(shots, { starts: [4] });
  const planRow = {
    id: "11111111-58c4-4a93-9d43-1b2c3d4e5f60",
    thread_id: "22222222-58c4-4a93-9d43-1b2c3d4e5f60",
    title: "Launch in sections",
    source_kind: "long_video",
    source_id: "33333333-58c4-4a93-9d43-1b2c3d4e5f60",
    source_title: "Launch",
    sequence_id: "44444444-58c4-4a93-9d43-1b2c3d4e5f60",
    project_id: null,
    status: "working",
    shots: JSON.parse(JSON.stringify(shots)),
    created_at: "2026-10-22T00:00:00Z",
  };
  const sectionRows = planned.map((section) => ({
    id: `5555555${section.position}-58c4-4a93-9d43-1b2c3d4e5f60`,
    position: section.position,
    title: section.title,
    first_shot: section.first,
    last_shot: section.last,
    status: section.position === 0 ? "done" : "saved",
    step_budget: section.budget,
    estimated_steps: section.steps,
    steps_used: section.position === 0 ? 7 : 13,
    worker_thread_id: null,
    work:
      section.position === 0
        ? {
            shots: [saved(0, ASSET(1)), saved(1, ASSET(2))],
            finished: true,
            summary: "The opening is in.",
          }
        : {
            shots: [saved(3, ASSET(9))],
            loose: [{ assetId: ASSET(8), kind: "video" }],
            left: "Shot 6 to make.",
          },
    clips: [{ shot: section.first, clipId: `c${section.first}` }],
  }));
  const joinRows = [
    {
      id: "66666666-58c4-4a93-9d43-1b2c3d4e5f60",
      position: 0,
      kind: "continuous",
      status: "differs",
      frames: {
        before: {
          clipId: "c2",
          source: { kind: "video", assetId: ASSET(3), seconds: 2 },
          frame: { status: "ready", assetId: ASSET(70), bucket: "b", path: "x.png" },
        },
        after: {
          clipId: "c3",
          source: { kind: "still", assetId: ASSET(71) },
          frame: { status: "taking" },
        },
      },
      verdict: judgeJoin(
        measures({ look: look("different", "same", "same", ["framing: closer"]) }),
        {
          before: 0,
          after: 1,
        },
      ),
    },
  ];

  test("its shots, sections and joins come back as they were planned and worked", () => {
    const view = planViewOf(planRow, [...sectionRows].reverse(), joinRows)!;
    expect(view.shots).toEqual(shots);
    expect(view.kind).toBe("long_video");
    expect(
      view.sections.map((section) => [section.position, section.status, section.used]),
    ).toEqual([
      [0, "done", 7],
      [1, "saved", 13],
    ]);
    expect(view.sections[1]!.work.loose).toHaveLength(1);
    expect(view.sections[0]!.clips).toEqual([{ shot: 0, clipId: "c0" }]);
    expect(view.joins[0]!.before?.frame.assetId).toBe(ASSET(70));
    expect(view.joins[0]!.after?.frame.status).toBe("taking");
    expect(view.joins[0]!.verdict?.status).toBe("differs");
    expect(planViewOf({ ...planRow, source_kind: "film" }, [], [])).toBeNull();
    expect(
      planViewOf({ ...planRow, shots: [{ ref: "x" }, ...planRow.shots] }, [], [])!.shots,
    ).toHaveLength(6);
  });

  test("the agent reads every section's state and work, and every join's check", () => {
    const report = planReport(planViewOf(planRow, sectionRows, joinRows)!);
    expect(report).toContain(
      "Plan “Launch in sections” (planId 11111111-58c4-4a93-9d43-1b2c3d4e5f60) for the long video “Launch”",
    );
    expect(report).toContain("6 shots in 2 sections, working.");
    expect(report).toContain("Integration edit: 44444444-58c4-4a93-9d43-1b2c3d4e5f60");
    expect(report).toContain("- Section 1 · Shots 1–3 · done · 7 of");
    expect(report).toContain("saved shots 1, 2");
    expect(report).toContain("“The opening is in.”");
    expect(report).toContain(`1 made but not placed (${ASSET(8)})`);
    expect(report).toContain("left: Shot 6 to make.");
    expect(report).toContain(
      "- Join 1 (sections 1 → 2, one shot carrying straight on): doesn't match. framing: closer",
    );
    expect(report).toContain("Fixes: Make section 2's first shot again");
  });

  test("a new integration edit's clips are matched to the shots: by id when copied, else by file", () => {
    const copied = edit([clip("ref-0", ASSET(1)), clip("ref-1", ASSET(2))]);
    expect(ownedByAsset(reel(2), copied)).toEqual([
      { shot: 0, clipId: "ref-0" },
      { shot: 1, clipId: "ref-1" },
    ]);
    // Laid out afresh: matched by the file each shot shows, in order, each clip once.
    const twice = reel(3, (index) => ({
      ref: `x${index}`,
      assetId: index === 2 ? ASSET(1) : ASSET(index + 1),
    }));
    const laid = edit([
      clip("a", ASSET(1)),
      clip("b", ASSET(2)),
      clip("c", ASSET(1)),
      clip("end", ASSET(9)),
    ]);
    expect(ownedByAsset(twice, laid)).toEqual([
      { shot: 0, clipId: "a" },
      { shot: 1, clipId: "b" },
      { shot: 2, clipId: "c" },
    ]);
    expect(
      ownedByAsset(
        reel(1, () => ({ assetId: null, ref: "none" })),
        laid,
      ),
    ).toEqual([]);
  });

  test("the AI's look at a join is read, anything it couldn't judge as unseen", () => {
    expect(
      joinLookOf({
        framing: "minor",
        colour: "different",
        continuity: "maybe",
        differences: ["colour: warmer after", "", 4, "a", "b", "c"],
      }),
    ).toEqual({
      framing: "minor",
      colour: "different",
      continuity: "unseen",
      differences: ["colour: warmer after", "a", "b", "c"],
    });
    expect(joinLookOf(null).framing).toBe("unseen");
  });

  test("a verdict keeps what it was judged from, so a fix judges it again", () => {
    const measured = measures({
      look: look("minor", "minor", "same"),
      render: {
        matched: false,
        moved: null,
        likenessBefore: 0.9,
        likenessAfter: 0.9,
        left: "already_matching",
      },
      characters: { flagged: false, summary: null },
      lettering: { before: "none", after: "legible", summary: null },
      apart: true,
    });
    const kept = JSON.parse(
      JSON.stringify({ ...judgeJoin(measured, { before: 0, after: 1 }), measures: measured }),
    );
    expect(joinMeasuresOf(kept)).toEqual(measured);
    expect(joinMeasuresOf({})).toBeNull();
    // Smart-blended since: nothing left to offer.
    const again = judgeJoin({ ...joinMeasuresOf(kept)!, blend: "smart" }, { before: 0, after: 1 });
    expect(again.fixes).toEqual([]);
    expect(again.summary).toContain("Clips were put between the two sections in the edit.");
  });
});

describe("what a worker started that is still being made", () => {
  const file = (n: number, generationId: string) => ({
    assetId: ASSET(n),
    kind: "video" as const,
    generationId,
    madeAt: "2026-10-22T00:00:00Z",
  });

  test("is kept until its file is in, then kept as a take to place", () => {
    // A video queued in a turn that ended before it finished.
    const started = withGenerations(EMPTY_WORK, ["g1", "g2"], [file(1, "g1")]);
    expect(started.generations).toEqual(["g2"]);
    expect(started.loose.map((take) => take.assetId)).toEqual([ASSET(1)]);
    // Its file came in by the next run.
    const later = withGenerations(started, [], [file(2, "g2")]);
    expect(later.generations).toEqual([]);
    expect(later.loose.map((take) => take.assetId)).toEqual([ASSET(1), ASSET(2)]);
    // One saved to a shot meanwhile isn't kept loose as well.
    const saved = withSaved(started, [saved_(0, ASSET(2))]);
    expect(withGenerations(saved, [], [file(2, "g2")]).loose.map((take) => take.assetId)).toEqual([
      ASSET(1),
    ]);
    expect(sectionWorkOf(JSON.parse(JSON.stringify(started))).generations).toEqual(["g2"]);
  });

  test("its brief and the plan's report name it", () => {
    const shots = reel(4);
    const [section] = planSections(shots, { starts: [3] });
    const work = { ...EMPTY_WORK, generations: ["g9"] };
    const brief = sectionBrief({
      plan: { title: "P", kind: "edit", sourceTitle: "Reel", editTitle: null, sections: 2 },
      section: section!,
      shots,
      before: null,
      after: null,
      work,
      budget: 10,
    });
    expect(brief).toContain("## Started before, still being made");
    expect(brief).toContain("Generation g9: wait for it with wait_for_generation");
  });
});

function saved_(shotIndex: number, assetId: string) {
  return {
    shot: shotIndex,
    assetId,
    kind: "video" as const,
    seconds: null,
    trimStart: 0,
    fileSeconds: 5,
    savedAt: "2026-10-22T00:00:00Z",
  };
}
