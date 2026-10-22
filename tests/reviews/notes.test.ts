import { describe, expect, test } from "bun:test";
import {
  chosenShot,
  mapNote,
  mapNotes,
  matchWords,
  noteTimes,
  splitNotes,
} from "../../src/lib/reviews/notes";
import {
  renderSnapshot,
  storyboardSnapshot,
  type SnapshotShot,
} from "../../src/lib/reviews/snapshot";
import { planFromBrief, readBrief } from "../../src/lib/storyboard/brief";
import { timelineSchema } from "../../src/lib/edit/timeline";
import { BRIEF } from "../storyboard/reel-1";

// The system edition's storyboard as its brief imports it, on the brief's (the film's) clock.
const reading = readBrief(JSON.parse(JSON.stringify(BRIEF)));
if (!reading.ok) throw new Error("Reel 1's brief should read");
const plan = planFromBrief(reading.brief);
let shotIds = 0;
const board = storyboardSnapshot({
  id: "board",
  title: plan.storyboard.title,
  scenes: plan.scenes.map((scene) => ({
    scene_number: scene.scene_number,
    shots: scene.shots.map((shot) => ({
      id: `shot-${(shotIds += 1)}`,
      shot_number: shot.shot_number,
      name: shot.name,
      duration_seconds: shot.duration_seconds,
      spec: shot.spec,
    })),
  })),
});
const shots = board.shots;
const labels = (body: string, context: Parameters<typeof mapNote>[1] = { shots }) =>
  mapNote(body, context).map((target) => target.label);

/**
 * The client's notes on the second cut, in the handover's words (HANDOVER 1.1 lists the
 * fourteen in these thirteen phrases), as they might be pasted from an email.
 */
const CLIENT_NOTES = `Notes on the second cut, from Aurixa:

1. A captivating opening.
2. A satellite map and pins.
3. A mock address.
4. An A+ grade.
5. Report pages as charts.
6. Give the video room to breathe.
7. No repeated screens.
8. Show the portals one at a time.
9. A logo that leaps out.
10. A living call to action.
11. A better floor plan.
12. A closing card with a punch.
13. National Treasures under it all.`;

describe("splitting a note list", () => {
  test("keeps the giver's numbers and leaves the line before the list aside", () => {
    const split = splitNotes(CLIENT_NOTES);
    expect(split.preamble).toBe("Notes on the second cut, from Aurixa:");
    expect(split.notes).toHaveLength(13);
    expect(split.notes[3]).toEqual({ number: 4, body: "An A+ grade." });
    expect(split.notes.at(-1)).toEqual({ number: 13, body: "National Treasures under it all." });
  });

  test("reads every way a list is numbered or bulleted, and carries a note over its lines", () => {
    const split = splitNotes(
      [
        "1. The pins land a beat late,",
        "   and the gold one should rise higher.",
        "2) The address card.",
        "(3) The A+ grade.",
        "#4 The report pages.",
        "Note 5: The portals.",
        "6 - The logo.",
        "- A bullet after six.",
        "• And another.",
        "",
        "7. Two paragraphs:",
        "",
        "the second one here.",
      ].join("\n"),
    );
    expect(split.notes.map((note) => note.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 7]);
    expect(split.notes[0]!.body).toBe(
      "The pins land a beat late, and the gold one should rise higher.",
    );
    expect(split.notes[6]!.body).toBe("A bullet after six.");
    expect(split.notes[8]!.body).toBe("Two paragraphs:\nthe second one here.");
    expect(split.preamble).toBeNull();
  });

  test("doesn't read a time at the start of a line as a number", () => {
    const split = splitNotes("1. Fine.\n0:42 the pins are late\n2. Also fine.");
    expect(split.notes).toEqual([
      { number: 1, body: "Fine. 0:42 the pins are late" },
      { number: 2, body: "Also fine." },
    ]);
  });

  test("splits an unmarked list into paragraphs, or lines when it is one paragraph", () => {
    expect(splitNotes("The opening drags.\n\nThe logo is small.").notes).toEqual([
      { number: 1, body: "The opening drags." },
      { number: 2, body: "The logo is small." },
    ]);
    expect(
      splitNotes("The opening drags.\nThe logo is small.\n").notes.map((note) => note.body),
    ).toEqual(["The opening drags.", "The logo is small."]);
    expect(splitNotes("   ").notes).toEqual([]);
  });
});

describe("matching notes to shots, on Reel 1's brief", () => {
  test("maps the client's notes where the brief says each went, and the film-wide ones nowhere", () => {
    const mapped = mapNotes(CLIENT_NOTES, { shots });
    const by = Object.fromEntries(
      mapped.map((note) => [note.number, note.targets.map((target) => target.label)]),
    );
    expect(by).toEqual({
      1: ["01.1"], // the opening: the first shot
      2: ["01.1"], // the satellite globe and its pins
      3: [], // a mock address: everywhere the record is
      4: ["05.1", "08.2"], // A+ and the grade
      5: ["05.2", "08.2"], // the report as figures and charts
      6: [], // room to breathe: the pacing, film-wide
      7: [],
      8: ["04.2"], // one portal at a time
      9: ["10.2"], // the logo at the viewer
      10: ["10.2", "15.1"], // the living call to action, on the trial and closing cards
      11: ["09.2", "12.2", "12.3"], // the floor plan, wherever it is shown
      12: ["15.1"], // the closing card: the last shot
      13: [], // the music, under it all
    });
  });

  test("shows the evidence for each match", () => {
    const [grade] = mapNote("An A+ grade.", { shots });
    expect(grade!.evidence).toEqual([{ kind: "words", text: "A+, grade" }]);
    expect(grade).toMatchObject({
      shotId: expect.any(String),
      name: "05.1 · From research into financial analysis",
      by: "auto",
    });
    const [close] = mapNote("A closing card with a punch.", { shots });
    expect(close!.evidence).toEqual([{ kind: "place", text: "closing card" }]);
    const [cta] = mapNote("A living call to action.", { shots });
    expect(cta!.evidence[0]!.text).toBe("call to action");
  });

  test("reads explicit times on the storyboard's clock", () => {
    const [portals] = mapNote("At 0:42 the portals move too fast", { shots });
    expect(portals).toMatchObject({ label: "04.2", start: 35.733, end: 44.533 });
    expect(portals!.evidence).toEqual([
      { kind: "time", text: "0:42 is in it (0:35.7 to 0:44.5)" },
      { kind: "words", text: "portal" },
    ]);
    expect(labels("Between 1:38 and 1:44 it feels rushed")).toEqual(["11.1", "12.1", "12.2"]);
    expect(labels("Something at 0:05")).toEqual(["01.1"]);
    expect(labels("Lose the pause at 2:30")).toEqual(["2:30"]);
  });

  test("reads shots by id, by place, and blocks by number", () => {
    expect(labels("04.1: the emblem bursts too early")).toEqual(["04.1"]);
    expect(labels("shot 4.1 again")).toEqual(["04.1"]);
    expect(labels("Shot 5 is too long")).toEqual(["04.1"]);
    expect(labels("Block 12 drags")).toEqual(["12.1", "12.2", "12.3", "12.4"]);
    // A length is not a shot.
    expect(labels("Drifted by 2.6 s")).toEqual([]);
  });

  test("finds quoted words where they are said or shown", () => {
    expect(labels("Hold “Your decision.” longer")).toEqual(["14.1"]);
    expect(labels('The "Expressions of interest close Friday" chip is too small')).toEqual([
      "01.2",
    ]);
    expect(labels("“Nobody says this”")).toEqual([]);
  });
});

describe("matching notes to an edit's clips and captions", () => {
  // A storyboard's edit, compiled: each clip labelled with its shot.
  const film = "00000000-0000-4000-8000-000000000001";
  const render = renderSnapshot({
    sequenceId: "edit",
    sequenceVersion: 2,
    title: "Reel 1 edit",
    durationSeconds: null,
    timeline: timelineSchema.parse({
      clips: [
        {
          id: "a",
          assetId: film,
          kind: "video",
          duration: 4,
          label: "1.1 01.1 · Somewhere in Australia, one pin turns gold",
        },
        { id: "b", assetId: film, kind: "video", duration: 4, label: "1.2 01.2 · The client asks" },
        { id: "c", assetId: film, kind: "video", duration: 4, label: "Kling take 3" },
      ],
      captions: {
        segments: [
          { start: 0.2, end: 1.6, text: "Somewhere in Australia," },
          { start: 4.6, end: 6.4, text: "A client wants to know if it's right for them," },
          { start: 8.5, end: 10, text: "But before you can answer," },
        ],
      },
    }),
  });

  test("puts a time in the edit's clip, and the clip's shot where it is labelled with one", () => {
    expect(render.clips.map((clip) => [clip.start, clip.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
    ]);
    const [client] = mapNote("At 0:05 the window swings in too late", { shots, render });
    expect(client).toMatchObject({ label: "01.2", start: 5.467 });
    expect(client!.evidence[0]!.text).toBe("0:05 is in “1.2 01.2 · The client asks”");
    const [take] = mapNote("0:09 is soft", { shots, render });
    expect(take).toMatchObject({ shotId: null, label: "Kling take 3", start: 8, end: 12 });
  });

  test("finds a quoted caption at its time", () => {
    const [asks] = mapNote("When she says “a client wants to know” the cut is late", {
      shots: [],
      render,
    });
    expect(asks).toMatchObject({ label: "1.2 01.2 · The client asks", start: 4 });
    expect(asks!.evidence[0]!.text).toBe("“a client wants to know” at 0:04.6");
  });

  test("without a storyboard, matches clips by the words of their labels", () => {
    expect(
      mapNote("The Kling take is soft", { shots: [], render }).map((target) => target.label),
    ).toEqual(["Kling take 3"]);
    expect(mapNote("Room to breathe", { shots: [], render })).toEqual([]);
  });
});

describe("the parts", () => {
  test("times in the forms notes use", () => {
    const at = (text: string) => noteTimes(text).map((time) => [time.start, time.end]);
    expect(at("at 0:42")).toEqual([[42, 42]]);
    expect(at("1:05.4 and 00:28.933")).toEqual([
      [65.4, 65.4],
      [28.933, 28.933],
    ]);
    expect(at("1:02:03")).toEqual([[3723, 3723]]);
    expect(at("0:40–0:45, and between 1:00 and 1:10")).toEqual([
      [40, 45],
      [60, 70],
    ]);
    expect(at("around 42 s, at 7.5 seconds")).toEqual([
      [42, 42],
      [7.5, 7.5],
    ]);
    // A length, a trial's days and the frame's shape aren't times; "at 9:16" is.
    expect(at("hold it 2.6 s; the 14-day trial; 9:16 is fine")).toEqual([]);
    expect(at("at 9:16")).toEqual([[556, 556]]);
  });

  test("words to match: grades, calls to action, compounds, never the common ones", () => {
    expect(matchWords("An A+ grade")).toEqual(["aplus", "aplusgrade", "grade"]);
    expect(matchWords("A living call to action")).toEqual(["living", "livingcta", "cta"]);
    expect(matchWords("A better floor plan")).toEqual(["floor", "floorplan", "plan"]);
    expect(matchWords("This is all of it")).toEqual([]);
    expect(matchWords("The satellite map and its pins")).toEqual([
      "satellite",
      "satellitemap",
      "map",
      "pin",
    ]);
  });

  test("a shot a person chooses says so", () => {
    const shot = shots[4] as SnapshotShot;
    expect(chosenShot(shot)).toEqual({
      shotId: shot.id,
      label: "04.1",
      name: shot.name,
      start: 28.933,
      end: 35.733,
      evidence: [{ kind: "person", text: "chosen by hand" }],
      by: "person",
    });
  });
});
