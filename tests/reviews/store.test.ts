import { describe, expect, test } from "bun:test";
import {
  addComment,
  addGate,
  addNotes,
  addStandardGates,
  addVersion,
  decide,
  deleteVersion,
  loadProjectReviews,
  REVIEWS_NEED_UPDATE,
  updateGate,
  updateNote,
} from "../../src/lib/reviews/store";
import { orderGates, type GateRow } from "../../src/lib/reviews/gates";
import { readSnapshot } from "../../src/lib/reviews/snapshot";
import { planFromBrief, readBrief } from "../../src/lib/storyboard/brief";
import { timelineSchema } from "../../src/lib/edit/timeline";
import { FakeDb, fakeId } from "../long-video/fake-db";
import { BRIEF } from "../storyboard/reel-1";

const db = new FakeDb();
const client = db as never;
const producer = db.add("profiles", {
  full_name: "Rugesh",
  email: "r@example.test",
  is_active: true,
});
const editor = db.add("profiles", {
  full_name: null,
  email: "editor@example.test",
  is_active: true,
});
const project = db.add("projects", { name: "Aurixa Reel 1" });
const me = String(producer["id"]);

// The fifteen style frames (one a block), and the proof's video.
const frames = Array.from({ length: 15 }, (_, index) =>
  db.add("assets", {
    asset_type: "image",
    title: `Style frame ${String(index + 1).padStart(2, "0")}`,
    storage_bucket: "generation-inputs",
    storage_path: `frames/${index + 1}.png`,
    width: 1080,
    height: 1920,
    metadata: {},
  }),
);
const voice = db.add("assets", {
  asset_type: "audio",
  title: "Voiceover",
  storage_bucket: "generation-inputs",
  storage_path: "voiceover.wav",
  metadata: {},
});
const film = db.add("assets", {
  asset_type: "video",
  title: "Reel 1 · second cut",
  storage_bucket: "assets",
  storage_path: "renders/second-cut.mp4",
  duration_seconds: 106.03,
  metadata: { fps: 30 },
});

// An edit and its renders: its clips as a storyboard compiles them, and two captions.
const sequence = db.add("sequences", { title: "Reel 1 edit", project_id: project["id"] });
const timeline = timelineSchema.parse({
  fps: 30,
  clips: [
    {
      id: "c1",
      assetId: film["id"],
      kind: "video",
      duration: 5.467,
      label: "1.1 01.1 · Somewhere in Australia",
    },
    {
      id: "c2",
      assetId: film["id"],
      kind: "video",
      duration: 4.166,
      label: "1.2 01.2 · The client asks",
    },
  ],
  captions: {
    enabled: true,
    segments: [
      { start: 0, end: 1.63, text: "Somewhere in Australia," },
      { start: 5.6, end: 7.4, text: "A client wants to know if it's right for them," },
    ],
  },
});
const rendering = db.add("sequence_renders", {
  sequence_id: sequence["id"],
  sequence_version: 2,
  status: "rendering",
  asset_id: null,
  duration_seconds: null,
  timeline,
});
const rendered = db.add("sequence_renders", {
  sequence_id: sequence["id"],
  sequence_version: 3,
  status: "completed",
  asset_id: film["id"],
  duration_seconds: 9.633,
  timeline,
});

// The system edition's storyboard, as its brief imports it.
const reading = readBrief(JSON.parse(JSON.stringify(BRIEF)));
if (!reading.ok) throw new Error("Reel 1's brief should read");
const plan = planFromBrief(reading.brief);
const board = db.add("storyboards", {
  title: plan.storyboard.title,
  project_id: project["id"],
  scenes: plan.scenes.map((scene) => ({
    scene_number: scene.scene_number,
    shots: scene.shots.map((shot) => ({
      id: fakeId(),
      shot_number: shot.shot_number,
      name: shot.name,
      duration_seconds: shot.duration_seconds,
      spec: shot.spec,
    })),
  })),
});

const gates = () =>
  orderGates(
    db
      .rows("review_gates")
      .filter((row) => row["project_id"] === project["id"]) as unknown as GateRow[],
  );
const gateNamed = (name: string) => gates().find((gate) => gate.name === name)!.id;
const versionsOf = (gateId: string) =>
  db.rows("review_versions").filter((row) => row["gate_id"] === gateId);

describe("review gates, step by step through Reel 1", () => {
  test("starts a project with its four gates, each after the first held", async () => {
    await addStandardGates(client, { projectId: String(project["id"]), userId: me });
    expect(gates().map((gate) => [gate.name, gate.position, gate.held_until_previous])).toEqual([
      ["Style frames", 1, false],
      ["Animatic", 2, true],
      ["Proof", 3, true],
      ["Film", 4, true],
    ]);
    const extra = await addGate(client, {
      projectId: String(project["id"]),
      name: "  Captions  ",
      heldUntilPrevious: false,
      userId: me,
    });
    expect(db.find("review_gates", extra)).toMatchObject({ name: "Captions", position: 5 });
    await updateGate(client, extra, { name: "Captions, again", held_until_previous: true });
    expect(db.find("review_gates", extra)).toMatchObject({
      name: "Captions, again",
      held_until_previous: true,
    });
    await expect(updateGate(client, extra, { name: " " })).rejects.toThrow("Give the gate a name.");
    await expect(
      addGate(client, {
        projectId: String(project["id"]),
        name: "",
        heldUntilPrevious: false,
        userId: me,
      }),
    ).rejects.toThrow("Give the gate a name.");
  });

  test("adds the style frames as one version of fifteen stills, once per request", async () => {
    const request = {
      gateId: gateNamed("Style frames"),
      userId: me,
      via: "app" as const,
      assetIds: frames.map((frame) => String(frame["id"])),
      note: "One still per block, at its key beat, in the final look.",
      clientRequestId: "frames-v1-request",
    };
    const added = await addVersion(client, request);
    expect(added).toMatchObject({ number: 1, duplicate: false });
    expect(db.find("review_versions", added.versionId)).toMatchObject({
      kind: "files",
      label: "15 stills",
    });
    const files = db
      .rows("review_version_files")
      .filter((row) => row["version_id"] === added.versionId);
    expect(files.map((file) => file["position"])).toEqual([...Array(15).keys()]);
    expect(files[5]!["title"]).toBe("Style frame 06");
    // The same request again: the same version, not a second one.
    expect(await addVersion(client, request)).toEqual({ ...added, duplicate: true });
    expect(versionsOf(gateNamed("Style frames"))).toHaveLength(1);
  });

  test("holds the animatic until the style frames are approved", async () => {
    const animatic = {
      gateId: gateNamed("Animatic"),
      userId: me,
      via: "app" as const,
      storyboardId: String(board["id"]),
    };
    await expect(addVersion(client, animatic)).rejects.toThrow(
      "Animatic is held until Style frames is approved.",
    );
    const framesVersion = versionsOf(gateNamed("Style frames"))[0]!;
    const approval = await decide(client, {
      versionId: String(framesVersion["id"]),
      userId: me,
      via: "app",
      decision: "approved",
      onBehalfOf: "Aurixa (the client, in chat)",
      note: "Approved: go ahead with the animatic.",
    });
    expect(db.find("review_decisions", approval.decisionId)).toMatchObject({
      decision: "approved",
      decided_by: me,
      on_behalf_of: "Aurixa (the client, in chat)",
      via: "app",
    });
    const added = await addVersion(client, animatic);
    const row = db.find("review_versions", added.versionId)!;
    expect(row).toMatchObject({ kind: "storyboard", label: plan.storyboard.title });
    const snapshot = readSnapshot(row["snapshot"]);
    expect(snapshot?.kind).toBe("storyboard");
    if (snapshot?.kind !== "storyboard") return;
    // The brief's own clock: every shot has its in and out.
    expect(snapshot.clock).toBe("brief");
    expect(snapshot.shots).toHaveLength(27);
    expect(snapshot.shots[4]).toMatchObject({ label: "04.1", start: 28.933, end: 35.733 });
    expect(snapshot.shots[4]!.sources).toContain("G-EMBLEM");
  });

  test("adds a render only once it has finished, with its video, clips and captions", async () => {
    // The proof is held behind the animatic: approve the animatic first.
    const animaticVersion = versionsOf(gateNamed("Animatic"))[0]!;
    await decide(client, {
      versionId: String(animaticVersion["id"]),
      userId: me,
      via: "app",
      decision: "approved",
    });
    const proof = { gateId: gateNamed("Proof"), userId: me, via: "app" as const };
    await expect(
      addVersion(client, { ...proof, renderId: String(rendering["id"]) }),
    ).rejects.toThrow("That render hasn't finished");
    const added = await addVersion(client, { ...proof, renderId: String(rendered["id"]) });
    const row = db.find("review_versions", added.versionId)!;
    expect(row).toMatchObject({
      kind: "render",
      label: "Reel 1 edit · version 3",
      render_id: rendered["id"],
    });
    const files = db
      .rows("review_version_files")
      .filter((file) => file["version_id"] === added.versionId);
    expect(files.map((file) => file["asset_id"])).toEqual([film["id"]]);
    const snapshot = readSnapshot(row["snapshot"]);
    expect(snapshot).toMatchObject({
      kind: "render",
      fps: 30,
      seconds: 9.633,
      clips: [
        { label: "1.1 01.1 · Somewhere in Australia", start: 0, end: 5.467 },
        { label: "1.2 01.2 · The client asks", start: 5.467, end: 9.633 },
      ],
    });
    if (snapshot?.kind === "render") expect(snapshot.captions[1]!.text).toContain("A client wants");
  });

  test("a version is of one thing, from the library, of stills or videos", async () => {
    const gateId = gateNamed("Style frames");
    const base = { gateId, userId: me, via: "app" as const };
    await expect(addVersion(client, base)).rejects.toThrow("A version is of one thing");
    await expect(
      addVersion(client, {
        ...base,
        assetIds: [String(frames[0]!["id"])],
        renderId: String(rendered["id"]),
      }),
    ).rejects.toThrow("A version is of one thing");
    await expect(addVersion(client, { ...base, assetIds: [String(voice["id"])] })).rejects.toThrow(
      "A version's files are stills or videos.",
    );
    const gone = fakeId();
    await expect(addVersion(client, { ...base, assetIds: [gone] })).rejects.toThrow(
      `Not in the library: ${gone}`,
    );
    await expect(addVersion(client, { ...base, renderId: fakeId() })).rejects.toThrow(
      "That render doesn't exist.",
    );
    await expect(addVersion(client, { ...base, storyboardId: fakeId() })).rejects.toThrow(
      "That storyboard doesn't exist.",
    );
    await expect(
      addVersion(client, { ...base, gateId: fakeId(), assetIds: [String(film["id"])] }),
    ).rejects.toThrow("That review gate doesn't exist.");
  });
});

describe("comments", () => {
  const proofVersion = () => String(versionsOf(gateNamed("Proof"))[0]!["id"]);
  const framesVersion = () => String(versionsOf(gateNamed("Style frames"))[0]!["id"]);

  test("pin to a time and its frame, or a frame and its time, and a point on the picture", async () => {
    const atTime = await addComment(client, {
      versionId: proofVersion(),
      userId: me,
      via: "app",
      body: "The pin lands a beat late.",
      atSeconds: 2.5,
      point: { x: 0.62, y: 0.41 },
    });
    expect(db.find("review_comments", atTime.commentId)).toMatchObject({
      at_seconds: 2.5,
      frame: 75,
      x: 0.62,
      y: 0.41,
      via: "app",
      created_by: me,
    });
    const atFrame = await addComment(client, {
      versionId: proofVersion(),
      userId: me,
      via: "api",
      body: "Hold here.",
      frame: 100,
    });
    expect(db.find("review_comments", atFrame.commentId)!["at_seconds"]).toBeCloseTo(100 / 30, 9);
    expect(db.find("review_comments", atFrame.commentId)!["via"]).toBe("api");
  });

  test("on one still of several, by its library file", async () => {
    const sixth = String(frames[5]!["id"]);
    const added = await addComment(client, {
      versionId: framesVersion(),
      userId: me,
      via: "app",
      body: "The rail sits too close to the window.",
      assetId: sixth,
      point: { x: 0.5, y: 0.17 },
    });
    const file = db
      .rows("review_version_files")
      .find((row) => row["version_id"] === framesVersion() && row["asset_id"] === sixth)!;
    expect(db.find("review_comments", added.commentId)).toMatchObject({
      file_id: file["id"],
      at_seconds: null,
      frame: null,
    });
    await expect(
      addComment(client, {
        versionId: framesVersion(),
        userId: me,
        via: "app",
        body: "x",
        assetId: String(film["id"]),
      }),
    ).rejects.toThrow("That file isn't in this version.");
  });

  test("say what is wrong with one that can't be saved, and are made once per request", async () => {
    const base = { versionId: proofVersion(), userId: me, via: "app" as const };
    await expect(addComment(client, { ...base, body: "   " })).rejects.toThrow(
      "Write the comment first.",
    );
    await expect(addComment(client, { ...base, body: "x".repeat(4001) })).rejects.toThrow(
      "at most 4,000",
    );
    await expect(
      addComment(client, { ...base, body: "x", point: { x: 1.2, y: 0 } }),
    ).rejects.toThrow("0 to 1 across and down");
    await expect(addComment(client, { ...base, versionId: fakeId(), body: "x" })).rejects.toThrow(
      "That version doesn't exist.",
    );
    const once = { ...base, body: "Once.", clientRequestId: "comment-once-1" };
    const first = await addComment(client, once);
    expect(await addComment(client, once)).toEqual({ commentId: first.commentId, duplicate: true });
  });
});

describe("decisions", () => {
  test("are made on a gate's latest version, by whoever records them, through the app or the API", async () => {
    const proof = gateNamed("Proof");
    const first = String(versionsOf(proof)[0]!["id"]);
    const second = await addVersion(client, {
      gateId: proof,
      userId: String(editor["id"]),
      via: "api",
      renderId: String(rendered["id"]),
      note: "The captions in the brand's type, and the logo's motion.",
    });
    expect(second.number).toBe(2);
    await expect(
      decide(client, { versionId: first, userId: me, via: "app", decision: "approved" }),
    ).rejects.toThrow("Version 2 is newer: decide on that one.");
    const approved = await decide(client, {
      versionId: second.versionId,
      userId: String(editor["id"]),
      via: "api",
      decision: "approved",
      clientRequestId: "approve-proof-v2",
    });
    expect(db.find("review_decisions", approved.decisionId)).toMatchObject({
      via: "api",
      decided_by: editor["id"],
    });
    expect(
      await decide(client, {
        versionId: second.versionId,
        userId: String(editor["id"]),
        via: "api",
        decision: "approved",
        clientRequestId: "approve-proof-v2",
      }),
    ).toEqual({ decisionId: approved.decisionId, duplicate: true });
  });

  test("a decided version stays; an undecided one can be taken back", async () => {
    const proof = gateNamed("Proof");
    const decided = String(versionsOf(proof).find((row) => row["number"] === 2)!["id"]);
    // The database's own policy keeps a decided version (row-level security): nothing is deleted.
    const guarded = {
      from: (table: string) =>
        table === "review_versions"
          ? {
              delete: () => ({
                eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
              }),
            }
          : db.from(table),
    };
    await expect(deleteVersion(guarded as never, decided)).rejects.toThrow(
      "only before it is decided",
    );
    const film = gateNamed("Film");
    const draft = await addVersion(client, {
      gateId: film,
      userId: me,
      via: "app",
      assetIds: [String(frames[0]!["id"])],
    });
    await deleteVersion(client, draft.versionId);
    expect(db.find("review_versions", draft.versionId)).toBeUndefined();
  });
});

describe("reading a project's reviews", () => {
  test("brings back gates, versions with their files, decisions, comments, notes and names", async () => {
    const gateId = gateNamed("Film");
    await addNotes(client, {
      gateId,
      userId: me,
      versionId: null,
      givenBy: "Aurixa (the client)",
      notes: [
        { number: 1, body: "A captivating opening.", targets: [] },
        { number: 2, body: "A satellite map and pins.", targets: [] },
      ],
    });
    const reviews = await loadProjectReviews(client, String(project["id"]));
    expect(reviews.supported).toBe(true);
    expect(reviews.gates).toHaveLength(5);
    const frameFiles = reviews.files.filter(
      (file) => file.version_id === String(versionsOf(gateNamed("Style frames"))[0]!["id"]),
    );
    expect(frameFiles).toHaveLength(15);
    expect(frameFiles[0]!.asset).toMatchObject({ asset_type: "image", width: 1080, fps: null });
    const render = reviews.files.find((file) => file.asset_id === film["id"])!;
    expect(render.asset!.fps).toBe(30);
    expect(reviews.versions.find((version) => version.kind === "render")!.snapshot?.kind).toBe(
      "render",
    );
    expect(reviews.decisions.length).toBeGreaterThanOrEqual(3);
    expect(reviews.comments.length).toBeGreaterThanOrEqual(4);
    expect(reviews.notes.map((note) => note.number)).toEqual([1, 2]);
    expect(reviews.people[me]).toBe("Rugesh");
    expect(reviews.people[String(editor["id"])]).toBe("editor@example.test");

    const note = reviews.notes[0]!;
    await updateNote(client, note.id, { status: "done", answered_in_version_id: null });
    expect(db.find("review_notes", note.id)!["status"]).toBe("done");
  });

  test("says the reviews need a database update before migration 0030 is applied", async () => {
    const missing = { code: "42P01", message: 'relation "public.review_gates" does not exist' };
    const before = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: missing }),
        }),
      }),
    };
    expect(await loadProjectReviews(before as never, String(project["id"]))).toMatchObject({
      supported: false,
      gates: [],
    });
    await expect(
      addGate(before as never, {
        projectId: String(project["id"]),
        name: "Film",
        heldUntilPrevious: false,
        userId: me,
      }),
    ).rejects.toThrow(REVIEWS_NEED_UPDATE);
    expect(REVIEWS_NEED_UPDATE).toBe(
      "Reviews need a database update (migration 0030_review_gates). Ask an admin to apply it.",
    );
  });

  test("passes the database's own rule through in its words", async () => {
    // Two people at once: the read said the gate could take a version; the database says it can't.
    const held = {
      code: "23514",
      message: "This gate is held until the one before it is approved.",
    };
    const racing = {
      from: (table: string) =>
        table === "review_versions"
          ? Object.assign(db.from(table), {
              insert: () => ({
                select: () => ({ single: () => Promise.resolve({ data: null, error: held }) }),
              }),
            })
          : db.from(table),
    };
    await expect(
      addVersion(racing as never, {
        gateId: gateNamed("Film"),
        userId: me,
        via: "app",
        assetIds: [String(film["id"])],
      }),
    ).rejects.toThrow("This gate is held until the one before it is approved.");
  });
});
