import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";
import { blobPath } from "../../src/lib/work/model";
import { answerSaves, WorkDb } from "./fake-work-db";

type Row = Record<string, unknown>;

const db = new WorkDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tools = typeof import("../../src/lib/studio-api/tools.server");
let mcp: Mcp;
let tools: Tools;
let editToken = "";
let readToken = "";

const member = db.add("profiles", {
  is_active: true,
  role: "member",
  full_name: "Rugesh",
  email: "r@example.test",
});

async function tokenFor(scopes: string[]) {
  const { hashApiToken } = await import("../../src/lib/studio-api/tokens.server");
  const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: member["id"],
    name: "test",
    token_prefix: tokenPrefixOf(token),
    token_hash: await hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  return token;
}

async function call(tool: string, body: unknown, token = editToken) {
  const response = await mcp.handleRestRequest(
    new Request(`https://studio.test/api/public/studio/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    tool,
  );
  return { status: response.status, body: (await response.json()) as Row };
}

const SESSION = {
  id: "claude-code:0467c194",
  label: "Claude Code session 0467c194",
  kind: "claude_code",
};
const sha = (character: string) => character.repeat(64);

beforeAll(async () => {
  mcp = await import("../../src/lib/studio-api/mcp.server");
  tools = await import("../../src/lib/studio-api/tools.server");
  editToken = await tokenFor(["read", "edit"]);
  readToken = await tokenFor(["read"]);
});

beforeEach(() => {
  db.calls = [];
  db.handlers.clear();
  answerSaves(db);
});

describe("work through the API", () => {
  test("is offered to tokens that may read it and those that may write it", async () => {
    const list = async (token: string) => {
      const response = await mcp.handleRestRequest(
        new Request("https://studio.test/api/public/studio/tools", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        "tools",
      );
      return ((await response.json()) as { tools: { name: string }[] }).tools.map(
        (entry) => entry.name,
      );
    };
    const reading = await list(readToken);
    expect(reading).toEqual(
      expect.arrayContaining(["list_works", "get_work", "get_work_files", "get_work_file_history"]),
    );
    expect(reading).not.toContain("save_work");
    const writing = await list(editToken);
    expect(writing).toEqual(
      expect.arrayContaining([
        "create_project",
        "start_work",
        "claim_work",
        "release_work",
        "save_work",
        "upload_work_files",
        "attach_to_work",
      ]),
    );
  });

  test("every operation that makes something takes a workId; reading ones and work's own don't", () => {
    const schema = (name: string) =>
      tools.toolInputSchema(tools.studioTool(name)!) as { properties: Row };
    for (const name of [
      "queue_generation",
      "queue_stage",
      "import_image",
      "import_audio",
      "create_edit",
      "render_edit",
      "start_presenter_video",
      "draw_motion_graphic",
    ])
      expect(Object.keys(schema(name).properties)).toContain("workId");
    for (const name of ["get_generation", "list_assets", "get_render"])
      expect(Object.keys(schema(name).properties)).not.toContain("workId");
    // Work's own operations name the work they act on, which is not one to attach their answer to.
    for (const name of [
      "get_work",
      "save_work",
      "claim_work",
      "attach_to_work",
      "upload_work_files",
    ])
      expect(String((schema(name).properties["workId"] as Row)["description"] ?? "")).not.toContain(
        "attached to the work",
      );
    expect(Object.keys(schema("start_work").properties)).not.toContain("workId");
  });

  test("a work starts in a project of its own, with its plan and record, held by its maker", async () => {
    const { status, body } = await call("start_work", {
      title: "Aurixa Reel 2",
      goal: "A sixty-second reel",
      steps: [{ key: "plates", title: "Make the plates" }],
      state: { shots: [] },
      roots: { records: "docs/brands/aurixa-reel-2" },
      session: SESSION,
      clientRequestId: "start-reel-2-0001",
    });
    expect(status).toBe(200);
    const result = body["result"] as Row;
    expect(result["created"]).toBe(true);
    const work = db.find("works", result["workId"])!;
    expect(work["title"]).toBe("Aurixa Reel 2");
    expect(work["roots"]).toEqual({ records: "docs/brands/aurixa-reel-2" });
    const project = db.find("projects", result["projectId"])!;
    expect(project["name"]).toBe("Aurixa Reel 2");
    expect(work["project_id"]).toBe(project["id"]);
    const start = db.calls.find((entry) => entry.name === "work_save")!;
    expect((start.args["p_entry"] as Row)["kind"]).toBe("start");
    expect(start.args["p_step_changes"]).toEqual([{ key: "plates", title: "Make the plates" }]);
    expect(start.args["p_state_patch"]).toEqual({ shots: [] });
    const claim = db.calls.find((entry) => entry.name === "work_claim")!;
    expect(claim.args).toMatchObject({
      p_holder: SESSION.id,
      p_label: SESSION.label,
      p_kind: "claude_code",
    });

    const again = await call("start_work", {
      title: "Aurixa Reel 2",
      clientRequestId: "start-reel-2-0001",
    });
    expect((again.body["result"] as Row)["created"]).toBe(false);
    expect((again.body["result"] as Row)["workId"]).toBe(result["workId"]);
    expect(db.rows("works").filter((row) => row["title"] === "Aurixa Reel 2")).toHaveLength(1);
  });

  test("a save sends its account, its plan, its record and the code it ran on in one call", async () => {
    const work = db.add("works", {
      title: "W",
      project_id: null,
      status: "active",
      brand_kit_id: null,
    });
    const { status, body } = await call("save_work", {
      workId: work["id"],
      session: SESSION,
      summary: "Plates made",
      nextSteps: ["Animatic"],
      decisions: [{ what: "9:16", why: "Reels" }],
      questions: [],
      steps: [{ key: "plates", status: "done" }],
      state: { shots: { P: { take: 3 } } },
      baseVersion: 0,
      code: {
        branch: "main",
        commit: "abc123",
        dirty: false,
        upstream: "origin/main",
        unpushed: 2,
        password: "never kept",
      },
      status: "active",
      holdSeconds: 1800,
      clientRequestId: "save-0000000001",
    });
    expect(status).toBe(200);
    const sent = db.calls.find((entry) => entry.name === "work_save")!.args;
    expect(sent["p_entry"]).toMatchObject({
      kind: "save",
      summary: "Plates made",
      next_steps: ["Animatic"],
      questions: [],
      decisions: [{ what: "9:16", why: "Reels" }],
      actor_kind: "claude_code",
      actor_session: SESSION.id,
      client_request_id: "save-0000000001",
      code: {
        branch: "main",
        commit: "abc123",
        dirty: false,
        upstream: "origin/main",
        unpushed: 2,
      },
    });
    expect((sent["p_entry"] as Row)["code"]).not.toHaveProperty("password");
    expect(sent["p_seconds"]).toBe(1800);
    expect(sent["p_step_changes"]).toEqual([{ key: "plates", status: "done" }]);
    expect(sent["p_base_version"]).toBe(0);
    expect(sent["p_changes"]).toEqual({ status: "active" });
    expect(sent["p_holder"]).toBe(SESSION.id);
    expect((body["result"] as Row)["stateChanged"]).toBe(true);
  });

  test("a change made from an old record is refused as a conflict, saying what to do", async () => {
    const work = db.add("works", { title: "W", project_id: null, status: "active" });
    db.handlers.set("work_save", () => ({
      found: true,
      conflict: true,
      stateVersion: 7,
      baseVersion: 3,
    }));
    const { status, body } = await call("save_work", {
      workId: work["id"],
      state: { x: 1 },
      baseVersion: 3,
      clientRequestId: "conflict-0000001",
    });
    expect(status).toBe(409);
    expect((body["error"] as Row)["code"]).toBe("CONFLICT");
    expect(String((body["error"] as Row)["message"])).toContain("version 7, not 3");
    expect(String((body["error"] as Row)["message"])).toContain("Nothing was written");
  });

  test("files go straight to storage by their parts, and a save naming a part not there is refused", async () => {
    const work = db.add("works", { title: "Files", project_id: null, status: "active" });
    const workId = String(work["id"]);
    const offered = await call("upload_work_files", {
      workId,
      parts: [
        { sha256: sha("a"), size: 10, md5: "a".repeat(32) },
        { sha256: sha("b"), size: 6 },
      ],
    });
    expect(offered.status).toBe(200);
    const parts = (offered.body["result"] as { parts: Row[] }).parts;
    expect(parts.map((part) => part["stored"])).toEqual([false, false]);
    expect(parts[0]).toMatchObject({ method: "PUT", headers: { "x-upsert": "false" } });
    expect(String(parts[0]!["uploadUrl"])).toContain(blobPath(workId, sha("a")));
    expect(db.rows("work_blobs").map((row) => row["status"])).toEqual(["pending", "pending"]);

    // Saved before its bytes are there: refused, naming the file and what to do.
    const early = await call("save_work", {
      workId,
      files: [
        { path: "renders/film.mp4", sha256: sha("f"), size: 16, chunks: [sha("a"), sha("b")] },
      ],
      clientRequestId: "files-00000001",
    });
    expect(early.status).toBe(400);
    expect(String((early.body["error"] as Row)["message"])).toContain(
      "2 parts of renders/film.mp4 aren't stored yet",
    );
    expect(db.calls.some((entry) => entry.name === "work_save")).toBe(false);

    // The bytes arrive (one of them wrong), and the save checks them in storage.
    db.objects.set(blobPath(workId, sha("a")), { size: 10, eTag: "a".repeat(32) });
    db.objects.set(blobPath(workId, sha("b")), { size: 5, eTag: "c".repeat(32) });
    const half = await call("save_work", {
      workId,
      files: [
        { path: "renders/film.mp4", sha256: sha("f"), size: 16, chunks: [sha("a"), sha("b")] },
      ],
      clientRequestId: "files-00000002",
    });
    expect(half.status).toBe(400);
    expect(String((half.body["error"] as Row)["message"])).toContain(
      "1 part of renders/film.mp4 isn't stored yet",
    );
    expect(db.rows("work_blobs").find((row) => row["sha256"] === sha("a"))!["status"]).toBe(
      "stored",
    );

    // Offered again, the wrong one is removed and offered afresh; the stored one isn't sent again.
    const again = await call("upload_work_files", {
      workId,
      parts: [
        { sha256: sha("a"), size: 10 },
        { sha256: sha("b"), size: 6 },
      ],
    });
    const parts2 = (again.body["result"] as { parts: Row[] }).parts;
    expect(parts2.find((part) => part["sha256"] === sha("a"))!["stored"]).toBe(true);
    expect(parts2.find((part) => part["sha256"] === sha("b"))!["stored"]).toBe(false);
    expect(db.removed).toContain(blobPath(workId, sha("b")));

    db.objects.set(blobPath(workId, sha("b")), { size: 6, eTag: "d".repeat(32) });
    const saved = await call("save_work", {
      workId,
      session: SESSION,
      files: [
        {
          path: "renders/film.mp4",
          sha256: sha("f"),
          size: 16,
          chunks: [sha("a"), sha("b")],
          note: "the master",
        },
        { path: "records/old.json", deleted: true },
      ],
      clientRequestId: "files-00000003",
    });
    expect(saved.status).toBe(200);
    const files = db.calls.find((entry) => entry.name === "work_save")!.args["p_files"] as Row[];
    expect(files[0]).toMatchObject({
      path: "renders/film.mp4",
      sha256: sha("f"),
      size: 16,
      chunks: [sha("a"), sha("b")],
      note: "the master",
    });
    expect(files[1]).toEqual({ path: "records/old.json", deleted: true });

    // And back out: the file, its parts in order, each with a link.
    const out = await call("get_work_files", { workId });
    const listed = (out.body["result"] as { files: Row[] }).files;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ path: "renders/film.mp4", sha256: sha("f"), size: 16 });
    const outParts = listed[0]!["parts"] as Row[];
    expect(outParts.map((part) => part["sha256"])).toEqual([sha("a"), sha("b")]);
    expect(String(outParts[1]!["url"])).toContain(blobPath(workId, sha("b")));
  });

  test("a path that climbs out, or a part that isn't one, is refused before anything is sent", async () => {
    const work = db.add("works", { title: "W", project_id: null, status: "active" });
    const climbing = await call("save_work", {
      workId: work["id"],
      files: [{ path: "records/../../etc/passwd", sha256: sha("a"), size: 1, chunks: [sha("a")] }],
      clientRequestId: "bad-path-000001",
    });
    expect(climbing.status).toBe(400);
    expect(String((climbing.body["error"] as Row)["message"])).toContain("isn't a work path");
    const huge = await call("upload_work_files", {
      workId: work["id"],
      parts: [{ sha256: sha("a"), size: 60_000_000 }],
    });
    expect(huge.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  test("an operation run for a work goes in its project, and what it makes is attached to it", async () => {
    const project = db.add("projects", { name: "Reels", created_by: member["id"] });
    const work = db.add("works", {
      title: "W",
      project_id: project["id"],
      status: "active",
      brand_kit_id: null,
    });
    const seen: Row[] = [];
    const fake = {
      name: "queue_generation",
      title: "Queue a generation",
      description: "",
      scope: "generate" as const,
      readOnly: false,
      input: tools.studioTool("queue_generation")!.input,
      run: async (args: unknown) => {
        seen.push(args as Row);
        return { generationId: "11111111-1111-4111-8111-111111111111", status: "queued" };
      },
    };
    const caller = {
      userId: String(member["id"]),
      tokenId: "t",
      scopes: new Set(["read", "generate", "edit"] as const),
    };
    const result = (await tools.runForWork(
      fake,
      { modelId: "x" },
      caller as never,
      String(work["id"]),
    )) as Row;
    expect(seen[0]!["projectId"]).toBe(project["id"]);
    expect(result["work"]).toEqual({ workId: work["id"], attached: 1 });
    const link = db.calls.find((entry) => entry.name === "work_save")!.args;
    expect((link["p_entry"] as Row)["kind"]).toBe("link");
    expect(link["p_links"]).toEqual([
      {
        kind: "generation",
        object_id: "11111111-1111-4111-8111-111111111111",
        role: null,
        note: "Queue a generation",
      },
    ]);
    expect(link["p_holder"]).toBeUndefined();

    // A project named in the call wins over the work's.
    await tools.runForWork(
      fake,
      { modelId: "x", projectId: "22222222-2222-4222-8222-222222222222" },
      caller as never,
      String(work["id"]),
    );
    expect(seen[1]!["projectId"]).toBe("22222222-2222-4222-8222-222222222222");

    // A link the work can't keep never undoes the operation: its answer says why.
    db.handlers.delete("work_save");
    const unkept = (await tools.runForWork(
      fake,
      { modelId: "x" },
      caller as never,
      String(work["id"]),
    )) as Row;
    expect(unkept["generationId"]).toBe("11111111-1111-4111-8111-111111111111");
    expect((unkept["work"] as Row)["attached"]).toBe(0);
    expect(String((unkept["work"] as Row)["error"])).toContain("database update");
  });

  test("a workId that isn't one, or names no work, is refused before the operation runs", async () => {
    const bad = await call("import_image", {
      title: "x",
      url: "https://example.test/a.png",
      clientRequestId: "img-00000001",
      workId: "nope",
    });
    expect(bad.status).toBe(400);
    expect(String((bad.body["error"] as Row)["message"])).toContain("workId");
    const missing = await call("import_image", {
      title: "x",
      url: "https://example.test/a.png",
      clientRequestId: "img-00000002",
      workId: "99999999-9999-4999-8999-999999999999",
    });
    expect(missing.status).toBe(400);
    expect(String((missing.body["error"] as Row)["message"])).toBe("That work doesn't exist");
  });

  test("taking up a work held by another says who has it; letting go is the holder's", async () => {
    const work = db.add("works", { title: "W", project_id: null, status: "active" });
    db.handlers.set("work_claim", () => ({
      found: true,
      claimed: false,
      holder: "supercomputer:t1",
      holderLabel: "Supercomputer",
      holderKind: "supercomputer",
      heardAt: "2026-10-23T11:59:00Z",
      leaseExpiresAt: "2026-10-23T12:14:00Z",
    }));
    const refused = await call("claim_work", {
      workId: work["id"],
      session: SESSION,
      brief: false,
    });
    expect(refused.status).toBe(200);
    expect(refused.body["result"]).toMatchObject({
      claimed: false,
      holder: "supercomputer:t1",
      holderLabel: "Supercomputer",
    });
    await call("claim_work", {
      workId: work["id"],
      session: SESSION,
      takeOver: true,
      seconds: 120,
      brief: false,
    });
    expect(db.calls.at(-1)!.args).toMatchObject({
      p_take_over: true,
      p_seconds: 120,
      p_holder: SESSION.id,
    });
    // A heartbeat only renews: it never takes over, whatever else it says.
    await call("claim_work", {
      workId: work["id"],
      session: SESSION,
      renew: true,
      takeOver: true,
      brief: false,
    });
    expect(db.calls.at(-1)!.args).toMatchObject({ p_renew_only: true, p_take_over: false });
    const released = await call("release_work", {
      workId: work["id"],
      session: SESSION,
      summary: "Stopping here",
    });
    expect(released.body["result"]).toEqual({ released: true });
    expect(db.calls.at(-1)!.args).toMatchObject({
      p_summary: "Stopping here",
      p_holder: SESSION.id,
    });
  });

  test("a work reads whole: its plan, journal, files, links and brief", async () => {
    const work = db.add("works", {
      title: "Aurixa Reel 1",
      goal: "A reel",
      status: "active",
      project_id: null,
      campaign_id: null,
      brand_kit_id: null,
      parent_work_id: null,
      steps: [{ key: "plates", title: "Plates", status: "done", note: "" }],
      state: { a: 1 },
      state_version: 2,
      roots: { records: "docs" },
      code: null,
      holder: null,
      holder_label: null,
      holder_kind: null,
      held_since: null,
      heard_at: null,
      lease_expires_at: null,
      last_summary: "Plates made",
      next_steps: ["Animatic"],
      questions: [],
      entries: 1,
      last_entry_at: "2026-10-23T10:00:00Z",
      created_by: member["id"],
      finished_at: null,
    });
    db.add("work_journal", {
      n: 1,
      work_id: work["id"],
      kind: "save",
      summary: "Plates made",
      next_steps: ["Animatic"],
      decisions: [{ what: "9:16", why: "Reels" }],
      questions: [],
      step_changes: [],
      state_patch: null,
      state_version: null,
      files: [],
      links: [],
      changes: {},
      code: null,
      actor_kind: "claude_code",
      actor_session: SESSION.id,
      actor_label: SESSION.label,
      created_by: member["id"],
    });
    const generation = db.add("generations", {
      prompt: "A house at dusk",
      status: "completed",
      model_path: "x",
    });
    db.add("work_links", {
      work_id: work["id"],
      kind: "generation",
      object_id: generation["id"],
      role: "listing photo",
      note: null,
    });
    const { status, body } = await call("get_work", { workId: work["id"] }, readToken);
    expect(status).toBe(200);
    const result = body["result"] as Row;
    expect(result).toMatchObject({
      title: "Aurixa Reel 1",
      stateVersion: 2,
      state: { a: 1 },
      nextSteps: ["Animatic"],
    });
    expect((result["journal"] as Row[])[0]).toMatchObject({
      kind: "save",
      summary: "Plates made",
      decisions: [{ what: "9:16", why: "Reels" }],
    });
    expect((result["journal"] as Row[])[0]!["by"]).toEqual({
      kind: "claude_code",
      session: SESSION.id,
      label: SESSION.label,
      member: "Rugesh",
    });
    expect((result["links"] as Row[])[0]).toMatchObject({
      kind: "generation",
      title: "A house at dusk",
      status: "completed",
      role: "listing photo",
    });
    expect(String(result["brief"])).toContain("# Work: Aurixa Reel 1");
    expect(String(result["brief"])).toContain("Last account (saved");
  });

  test("before the database has work, every work operation says it needs its update", async () => {
    const real = db.from.bind(db);
    db.from = ((table: string) =>
      table === "works"
        ? ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "42P01", message: 'relation "public.works" does not exist' },
                }),
              }),
            }),
          } as never)
        : real(table)) as typeof db.from;
    try {
      const { status, body } = await call(
        "get_work",
        { workId: "99999999-9999-4999-8999-999999999999" },
        readToken,
      );
      expect(status).toBe(400);
      expect(String((body["error"] as Row)["message"])).toContain("0037_work_journal");
    } finally {
      db.from = real;
    }
  });
});
