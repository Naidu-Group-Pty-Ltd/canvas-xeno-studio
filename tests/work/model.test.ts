import { describe, expect, test } from "bun:test";
import {
  blobPath,
  BRIEF_LINK_ORDER,
  chunkCount,
  CODE_SNAPSHOT,
  codeLine,
  codeOf,
  currentFiles,
  decisionsOf,
  diffPatch,
  holdLine,
  holdOf,
  isWorkPath,
  LINK_KINDS,
  linksFromCall,
  mergePatch,
  resumeBrief,
  sizeLabel,
  stepsOf,
  textList,
  WORK_LIMITS,
  type JournalRow,
  type LinkKind,
  type WorkRow,
  type WorkView,
} from "../../src/lib/work/model";

const WORK_ID = "00000000-0000-4000-8000-0000000000f1";
const GEN = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const EDIT = "33333333-3333-4333-8333-333333333333";
const RENDER = "44444444-4444-4444-8444-444444444444";

describe("a work's paths", () => {
  test("are a root's name and a path under it, as the table's check says (0037_work_journal)", () => {
    for (const good of [
      "records/spec.json",
      "renders/12.1/film.json",
      "records/.hidden/a b ü.json",
      "work/x",
    ])
      expect(isWorkPath(good)).toBe(true);
    for (const bad of [
      "/abs/file",
      "a//b",
      "a\\b",
      "../up",
      "a/../b",
      "a/./b",
      ".",
      "a/..",
      "a\nb",
      "",
      "records",
      "-x/y",
    ])
      expect(isWorkPath(bad)).toBe(false);
    expect(isWorkPath(`r/${"x".repeat(498)}`)).toBe(true);
    expect(isWorkPath(`r/${"x".repeat(499)}`)).toBe(false);
  });

  test("a file's parts are kept by their SHA-256, under the work, in folders of their first two digits", () => {
    expect(blobPath(WORK_ID, "ab".repeat(32))).toBe(`${WORK_ID}/ab/${"ab".repeat(32)}`);
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(WORK_LIMITS.chunkBytes)).toBe(1);
    expect(chunkCount(WORK_LIMITS.chunkBytes + 1)).toBe(2);
    // A part is within what the bucket takes (50 MiB).
    expect(WORK_LIMITS.chunkBytes).toBeLessThan(WORK_LIMITS.blobMaxBytes);
    expect(WORK_LIMITS.blobMaxBytes).toBe(52_428_800);
  });

  test("files as they stand are each path's latest version, unless it deletes the path", () => {
    const rows = [
      { path: "renders/film.mp4", version: 1, deleted: false },
      { path: "renders/film.mp4", version: 3, deleted: true },
      { path: "renders/film.mp4", version: 2, deleted: false },
      { path: "records/spec.json", version: 2, deleted: false },
      { path: "records/spec.json", version: 1, deleted: false },
    ];
    expect(currentFiles(rows)).toEqual([{ path: "records/spec.json", version: 2, deleted: false }]);
    // In the order pages are read by: "B" before "a", so a page ending at "a" leaves nothing behind it.
    expect(
      currentFiles([
        { path: "work/a.txt", version: 1, deleted: false },
        { path: "work/B.txt", version: 1, deleted: false },
        { path: "work/_.txt", version: 1, deleted: false },
      ]).map((row) => row.path),
    ).toEqual(["work/B.txt", "work/_.txt", "work/a.txt"]);
  });

  test("sizes read as people say them", () => {
    expect(sizeLabel(512)).toBe("512 B");
    expect(sizeLabel(12_400)).toBe("12.4 KB");
    expect(sizeLabel(199_593_310)).toBe("200 MB");
    expect(sizeLabel(2_100_000_000)).toBe("2.1 GB");
    expect(sizeLabel(null)).toBe("—");
  });
});

describe("the record", () => {
  test("changes by RFC 7386's merge patch, as the database applies it", () => {
    expect(mergePatch({ a: "b" }, { a: "c" })).toEqual({ a: "c" });
    expect(mergePatch({ a: "b" }, { b: "c" })).toEqual({ a: "b", b: "c" });
    expect(mergePatch({ a: "b" }, { a: null })).toEqual({});
    expect(mergePatch({ a: ["b"] }, { a: "c" })).toEqual({ a: "c" });
    expect(mergePatch({ a: { b: "c" } }, { a: { b: "d", c: null } })).toEqual({ a: { b: "d" } });
    expect(mergePatch({ a: [{ b: "c" }] }, { a: [1] })).toEqual({ a: [1] });
    expect(mergePatch({ e: null }, { a: 1 })).toEqual({ e: null, a: 1 });
    expect(mergePatch([1, 2], { a: "b", c: null })).toEqual({ a: "b" });
    expect(mergePatch({}, { a: { bb: { ccc: null } } })).toEqual({ a: { bb: {} } });
  });

  test("the patch between two records turns the one into the other", () => {
    const before = { shots: { P: { take: 3, notes: ["x"] }, D: { take: 1 } }, mix: "v2", gone: 1 };
    const after = {
      shots: { P: { take: 4, notes: ["x", "y"] }, D: { take: 1 } },
      mix: "v3",
      added: { a: true },
    };
    const patch = diffPatch(before, after)!;
    expect(patch).toEqual({
      gone: null,
      shots: { P: { take: 4, notes: ["x", "y"] } },
      mix: "v3",
      added: { a: true },
    });
    expect(mergePatch(before, patch)).toEqual(after);
    expect(diffPatch(after, after)).toEqual({});
  });
});

describe("who holds a work", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const base = {
    holder: null,
    holder_label: null,
    holder_kind: null,
    heard_at: null,
    lease_expires_at: null,
  };

  test("nobody, someone heard from in time, or someone who stopped renewing it", () => {
    expect(holdOf(base, now).state).toBe("free");
    const held = holdOf(
      {
        holder: "claude-code:s1",
        holder_label: "Claude Code session s1",
        holder_kind: "claude_code",
        heard_at: "2026-10-23T11:57:00Z",
        lease_expires_at: "2026-10-23T12:12:00Z",
      },
      now,
    );
    expect(held).toMatchObject({ state: "held", kind: "claude_code", heardMinutesAgo: 3 });
    expect(holdLine(held)).toBe(
      "Claude Code session s1 is working on it (last heard from 3 minutes ago).",
    );
    const lapsed = holdOf(
      {
        ...held,
        holder: "claude-code:s1",
        holder_label: "Claude Code session s1",
        holder_kind: "claude_code",
        heard_at: "2026-10-23T07:00:00Z",
        lease_expires_at: "2026-10-23T07:15:00Z",
      },
      now,
    );
    expect(lapsed.state).toBe("lapsed");
    expect(holdLine(lapsed)).toBe(
      "Nobody is working on it: Claude Code session s1 stopped renewing its hold (last heard from 5 hours ago), so it is free to pick up.",
    );
    expect(holdLine(holdOf(base, now))).toBe("Nobody is working on it: it is free to pick up.");
  });
});

describe("what an operation made", () => {
  test("is read from its answer, to any depth, and from the things its arguments name", () => {
    expect(
      linksFromCall("queue_generation", { modelId: GEN }, { generationId: GEN, status: "queued" }),
    ).toEqual([{ kind: "generation", id: GEN }]);
    const stage = linksFromCall(
      "queue_stage",
      {},
      {
        queued: [
          { index: 0, take: 1, generationId: GEN },
          { index: 0, take: 2, generationId: GEN.replace(/1/g, "5") },
        ],
      },
    );
    expect(stage.map((link) => link.kind)).toEqual(["generation", "generation"]);
    expect(linksFromCall("render_edit", { sequenceId: EDIT }, { renderId: RENDER })).toEqual([
      { kind: "render", id: RENDER },
      { kind: "edit", id: EDIT },
    ]);
    expect(
      linksFromCall("import_image", { title: "Logo" }, { assetId: ASSET, imported: true }),
    ).toEqual([{ kind: "asset", id: ASSET }]);
  });

  test("a motion graphic's drawing is a composition, not an edit's render", () => {
    expect(
      linksFromCall(
        "draw_motion_graphic",
        { sequenceId: EDIT },
        { renderId: RENDER, status: "drawing" },
      ),
    ).toEqual([
      { kind: "composition", id: RENDER },
      { kind: "edit", id: EDIT },
    ]);
  });

  test("a generation's inputs, its project and its brand are its own record, not the work's", () => {
    expect(
      linksFromCall(
        "queue_generation",
        { inputs: [{ assetId: ASSET, role: "source" }], projectId: EDIT, brandKitId: RENDER },
        { generationId: GEN },
      ),
    ).toEqual([{ kind: "generation", id: GEN }]);
    expect(linksFromCall("whatever", { sequenceId: "not-an-id" }, { assetId: 42 })).toEqual([]);
  });
});

describe("stored lists", () => {
  test("are read leniently: words, decisions, a plan", () => {
    expect(textList(["  Animatic ", "", 3, { text: "Mix" }])).toEqual(["Animatic", "Mix"]);
    expect(textList("not a list")).toEqual([]);
    expect(
      decisionsOf([
        "9:16",
        { what: "Cinema Studio", why: "the client chose it" },
        { why: "no what" },
      ]),
    ).toEqual([
      { what: "9:16", why: "" },
      { what: "Cinema Studio", why: "the client chose it" },
    ]);
    expect(
      stepsOf([
        { key: "plates", status: "done", title: "Plates" },
        { key: "x", status: "weird" },
        { title: "no key" },
      ]),
    ).toEqual([
      { key: "plates", title: "Plates", status: "done", note: "" },
      { key: "x", title: "x", status: "todo", note: "" },
    ]);
  });
});

function entry(overrides: Partial<JournalRow>): JournalRow {
  return {
    id: crypto.randomUUID(),
    n: 1,
    work_id: WORK_ID,
    kind: "save",
    summary: "",
    next_steps: [],
    decisions: [],
    questions: [],
    step_changes: [],
    state_patch: null,
    state_version: null,
    files: [],
    links: [],
    changes: {},
    code: null,
    actor_kind: "claude_code",
    actor_session: "claude-code:s1",
    actor_label: "Claude Code session s1",
    created_by: "u1",
    created_at: "2026-10-23T10:00:00Z",
    ...overrides,
  };
}

function view(): WorkView {
  const work: WorkRow = {
    id: WORK_ID,
    title: "Aurixa Reel 1",
    goal: "A 60-second reel for Aurixa, delivered as a master.",
    status: "active",
    project_id: "p1",
    campaign_id: null,
    brand_kit_id: null,
    parent_work_id: null,
    steps: [
      { key: "plates", title: "Make the plates", status: "done", note: "11 of 11" },
      { key: "12.1", title: "Listing photos in 12.1", status: "doing", note: "" },
      { key: "mix", title: "Mix", status: "todo", note: "" },
    ],
    state: { shots: { "12.1": { photos: 11 } } },
    state_version: 4,
    roots: { records: "docs/brands/aurixa-reel-1", renders: "renders" },
    code: { repository: "canvas-xeno-studio", branch: "main", commit: "5438ea7aa1b2", dirty: true },
    holder: "claude-code:s1",
    holder_label: "Claude Code session s1",
    holder_kind: "claude_code",
    held_since: "2026-10-23T09:00:00Z",
    heard_at: "2026-10-23T07:00:00Z",
    lease_expires_at: "2026-10-23T07:15:00Z",
    last_summary: "12.1 drawn again with the photos",
    next_steps: ["Splice 12.1 into the master", "Measure it"],
    questions: ["Which master is final?"],
    entries: 9,
    last_entry_at: "2026-10-23T10:00:00Z",
    created_by: "u1",
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-23T10:00:00Z",
    finished_at: null,
  };
  return {
    work,
    journal: [
      entry({
        n: 9,
        kind: "interrupted",
        summary: "The turn ended on a usage limit",
        created_at: "2026-10-23T10:05:00Z",
      }),
      entry({
        n: 8,
        summary: "12.1 drawn again with the 11 listing photos.\nMeasured at 46.9 dB.",
        decisions: [{ what: "Splice rather than re-render", why: "the reference is gone" }],
      }),
      entry({ n: 7, kind: "auto", files: [{ path: "renders/12.1/film.json", version: 1 }] }),
    ],
    files: [
      {
        id: "f1",
        work_id: WORK_ID,
        path: "renders/film.mp4",
        version: 2,
        deleted: false,
        sha256: "d0".repeat(32),
        size: 199_593_310,
        mime_type: "video/mp4",
        chunks: [],
        modified_at: null,
        executable: false,
        note: "the delivered master",
        asset_id: null,
        entry_id: null,
        created_at: "2026-10-23T10:00:00Z",
      },
    ],
    links: [
      {
        id: "l1",
        work_id: WORK_ID,
        kind: "generation",
        object_id: GEN,
        role: "listing photo",
        note: null,
        created_at: "2026-10-23T10:00:00Z",
        title: "A modern house at dusk",
        status: "completed",
      },
    ],
    project: { id: "p1", name: "Aurixa Reels" },
    people: { u1: "Rugesh" },
  };
}

describe("the brief anyone resuming a work is given", () => {
  const brief = resumeBrief(view(), { now: new Date("2026-10-23T12:00:00Z") });

  test("says what it is, who has it and whether it is free", () => {
    expect(brief).toStartWith("# Work: Aurixa Reel 1\n");
    expect(brief).toContain(`Work id ${WORK_ID} · status active · project Aurixa Reels (p1)`);
    expect(brief).toContain(
      "Claude Code session s1 stopped renewing its hold (last heard from 5 hours ago), so it is free to pick up.",
    );
    expect(brief).toContain("## Goal\nA 60-second reel for Aurixa");
  });

  test("lays out the plan, the last account, what comes next, what waits on a person and what was decided", () => {
    expect(brief).toContain("## Plan (1 of 3 done)");
    expect(brief).toContain("- [x] plates: Make the plates — 11 of 11");
    expect(brief).toContain("- [>] 12.1: Listing photos in 12.1");
    expect(brief).toContain("- [ ] mix: Mix");
    expect(brief).toContain(
      "Last account (saved, 2026-10-23 10:00 UTC, Claude Code session s1, for Rugesh):\n12.1 drawn again with the 11 listing photos.",
    );
    expect(brief).toContain(
      "Its last turn was cut short (2026-10-23 10:05 UTC): The turn ended on a usage limit",
    );
    expect(brief).toContain("Next steps:\n1. Splice 12.1 into the master\n2. Measure it");
    expect(brief).toContain("Waiting on a person:\n- Which master is final?");
    expect(brief).toContain(
      "- Splice rather than re-render — because the reference is gone (2026-10-23)",
    );
  });

  test("and its journal, record, files, what it made, the code it ran on and how to carry on", () => {
    expect(brief).toContain("## Journal (latest 3)");
    expect(brief).toContain("Saved by itself · Claude Code session s1, for Rugesh: 1 file kept");
    expect(brief).toContain('## Its record (version 4)\n```json\n{\n "shots": {');
    expect(brief).toContain("## Files (1, 200 MB)");
    expect(brief).toContain("- renders/film.mp4 · 200 MB · v2 — the delivered master");
    expect(brief).toContain("Roots: records → docs/brands/aurixa-reel-1, renders → renders");
    expect(brief).toContain(
      `- Generation ${GEN} · A modern house at dusk · completed — listing photo`,
    );
    expect(brief).toContain(
      "canvas-xeno-studio, branch main at 5438ea7aa1b2, with changes not committed when last saved",
    );
    expect(brief).toContain(`python3 scripts/studio-work/work.py resume ${WORK_ID}`);
    expect(brief).toContain("Continue in Supercomputer");
  });

  test("names the code a work keeps, and how to put it back", () => {
    const kept = view();
    kept.work = { ...kept.work, code: { ...(kept.work.code as object), unpushed: 2 } };
    kept.files = [
      ...kept.files,
      ...[CODE_SNAPSHOT.bundle, CODE_SNAPSHOT.patch, CODE_SNAPSHOT.state].map((path, index) => ({
        ...kept.files[0]!,
        id: `c${index}`,
        path,
        version: 1,
        size: 100,
        note: null,
      })),
    ];
    const text = resumeBrief(kept, { now: new Date("2026-10-23T12:00:00Z") });
    expect(text).toContain(
      "## Code\ncanvas-xeno-studio, branch main at 5438ea7aa1b2, with 2 commits no remote held and changes not committed when last saved: kept with the work (work/code/commits.bundle, work/code/uncommitted.patch).",
    );
    expect(text).toContain("`python3 scripts/studio-work/work.py restore-code` checks it out");
  });

  /** A section of a brief, from its heading to the next. */
  const section = (text: string, heading: string) =>
    text.split("\n## ").find((part) => part.startsWith(heading)) ?? "";
  const items = (part: string) => part.split("\n").filter((line) => line.startsWith("- "));

  test("lists the files only it holds first, and says where they sit on a machine", () => {
    const kept = view();
    const file = (path: string, size: number) => ({
      ...kept.files[0]!,
      id: path,
      path,
      size,
      version: 1,
      note: null,
    });
    // As the service gives them: in order of their paths.
    kept.files = [
      file("records/spec.json", 2_000),
      file(CODE_SNAPSHOT.state, 300),
      file("work/masters/third-cut-revised.mp4", 199_593_310),
      file("work/shots/12.1/reference.mkv", 63_507_134),
    ];
    const files = section(resumeBrief(kept, { now: new Date("2026-10-23T12:00:00Z") }), "Files");
    expect(files).toContain(
      `Roots: records → docs/brands/aurixa-reel-1, renders → renders, work → its own folder, outside git (on a machine, .xeno-work/${WORK_ID}/files beside the checkout)`,
    );
    expect(items(files).map((line) => line.slice(2).split(" · ")[0])).toEqual([
      "work/masters/third-cut-revised.mp4",
      "work/shots/12.1/reference.mkv",
      "records/spec.json",
      CODE_SNAPSHOT.state,
    ]);
    // With nothing under work/, the roots are only its own.
    expect(section(resumeBrief(view()), "Files")).toContain(
      "Roots: records → docs/brands/aurixa-reel-1, renders → renders\n",
    );
  });

  test("counts what it has in the studio by kind, and lists what shapes it before the many things it made", () => {
    const kept = view();
    const link = (kind: LinkKind, id: string, role: string) => ({
      ...kept.links[0]!,
      id: `${kind}:${id}`,
      kind,
      object_id: id,
      role,
      title: null,
      status: null,
    });
    // As the service gives them: the latest first.
    kept.links = [
      link("generation", GEN, "P take1"),
      link("asset", ASSET, "P take1, picked"),
      link("brief", EDIT, "the prompt pack"),
      link("generation", RENDER, "P take2"),
    ];
    const studio = section(resumeBrief(kept), "In the studio");
    expect(studio).toStartWith(
      "In the studio (4)\n1 creative brief, 1 library file, 2 generations\n",
    );
    expect(items(studio)).toEqual([
      `- Creative brief ${EDIT} — the prompt pack`,
      `- Library file ${ASSET} — P take1, picked`,
      `- Generation ${GEN} — P take1`,
      `- Generation ${RENDER} — P take2`,
    ]);
    // One kind alone needs no count.
    expect(section(resumeBrief(view()), "In the studio")).toStartWith(
      `In the studio (1)\n- Generation ${GEN}`,
    );
  });

  test("every kind of link has its place in a brief", () => {
    expect([...BRIEF_LINK_ORDER].sort()).toEqual([...LINK_KINDS].sort());
  });

  test("is cut to the length asked, and says so", () => {
    const short = resumeBrief(view(), { maxChars: 600 });
    expect(short.length).toBeLessThanOrEqual(600);
    expect(short).toEndWith("(The brief is cut at 600 characters: get_work has all of it.)");
  });

  test("a new work with nothing written says so", () => {
    const fresh = view();
    fresh.journal = [];
    fresh.files = [];
    fresh.links = [];
    fresh.work = {
      ...fresh.work,
      steps: [],
      state: {},
      last_summary: "",
      next_steps: [],
      questions: [],
      code: null,
      holder: null,
      lease_expires_at: null,
    };
    const text = resumeBrief(fresh);
    expect(text).toContain("Nothing has been written yet.");
    expect(text).not.toContain("## Plan");
    expect(text).not.toContain("## Files");
    expect(text).toContain("Nobody is working on it: it is free to pick up.");
  });
});

describe("the code a work ran on", () => {
  test("is read from what was stored, keeping only what it should hold", () => {
    expect(
      codeOf({
        repository: "Naidu-Group-Pty-Ltd/canvas-xeno-studio",
        branch: "claude/eager-bell-1y7y1m",
        commit: "5c6abe5",
        dirty: false,
        upstream: "origin/claude/eager-bell-1y7y1m",
        unpushed: 3,
        token: "never",
      }),
    ).toEqual({
      repository: "Naidu-Group-Pty-Ltd/canvas-xeno-studio",
      branch: "claude/eager-bell-1y7y1m",
      commit: "5c6abe5",
      dirty: false,
      upstream: "origin/claude/eager-bell-1y7y1m",
      unpushed: 3,
    });
    expect(codeOf({ unpushed: -1 })).toBeNull();
    expect(codeOf({ unpushed: 1.5, commit: "a" })).toEqual({ commit: "a" });
    expect(codeOf("main")).toBeNull();
  });

  test("is said in a sentence: where it was, what no remote held, and where that is kept", () => {
    expect(codeLine({ branch: "main", commit: "5438ea7aa1b2c3", dirty: false, unpushed: 0 })).toBe(
      "branch main at 5438ea7aa1b2.",
    );
    expect(codeLine({ branch: "HEAD", commit: "5438ea7aa1b2" })).toBe("a commit at 5438ea7aa1b2.");
    expect(codeLine({ branch: "main", commit: "abc", unpushed: 1 }, [CODE_SNAPSHOT.bundle])).toBe(
      "branch main at abc, with 1 commit no remote held when last saved: kept with the work (work/code/commits.bundle).",
    );
    // Changes not committed, kept only as the files its roots hold (a session saving through the API alone).
    expect(codeLine({ branch: "main", commit: "abc", dirty: true })).toBe(
      "branch main at abc, with changes not committed when last saved (what its roots hold is kept as its files).",
    );
  });
});
