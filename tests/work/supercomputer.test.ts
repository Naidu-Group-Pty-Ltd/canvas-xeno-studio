import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { answerSaves, WorkDb } from "./fake-work-db";
import type { AgentDisplay } from "../../src/lib/supercomputer/agent-events";
import { DEFAULT_THREAD_SETTINGS } from "../../src/lib/supercomputer/agent-settings";

type Row = Record<string, unknown>;

const db = new WorkDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Tools = typeof import("../../src/lib/supercomputer/agent-tools.server");
type Turn = typeof import("../../src/lib/supercomputer/work-turn.server");
type History = typeof import("../../src/lib/supercomputer/agent-history.server");
let tools: Tools;
let turn: Turn;
let history: History;

const member = db.add("profiles", {
  is_active: true,
  role: "member",
  full_name: "Rugesh",
  email: "r@example.test",
});
const thread = db.add("supercomputer_threads", {
  title: "Reel 2 plates",
  work_id: null,
  created_by: member["id"],
});

function display(
  status: AgentDisplay["status"],
  text: string,
  calls: { name: string; status: string; title?: string }[] = [],
): AgentDisplay {
  return {
    status,
    error: status === "failed" ? "The provider timed out" : null,
    usage: null,
    model: "claude-opus-5-5",
    blocks: [
      ...calls.map((call, index) => ({
        key: `t${index}`,
        block: {
          kind: "tool" as const,
          id: `t${index}`,
          name: call.name,
          label: call.name,
          input: {},
          status: call.status as never,
          summary: null,
          ui: null,
          approval: call.title
            ? { title: call.title, details: [], estimateUsd: null, reason: "" }
            : null,
        },
      })),
      { key: "x", block: { kind: "text" as const, text, done: true } },
    ],
  };
}

function context(workId: string | null) {
  return {
    userId: String(member["id"]),
    threadId: String(thread["id"]),
    turnId: "2b6b1d6e-58c4-4a93-9d43-1b2c3d4e5f60",
    settings: { ...DEFAULT_THREAD_SETTINGS },
    projectId: null,
    campaignId: null,
    workId,
    threadTitle: "Reel 2 plates",
    signal: new AbortController().signal,
  };
}

beforeAll(async () => {
  tools = await import("../../src/lib/supercomputer/agent-tools.server");
  turn = await import("../../src/lib/supercomputer/work-turn.server");
  history = await import("../../src/lib/supercomputer/agent-history.server");
});

beforeEach(() => {
  db.calls = [];
  db.handlers.clear();
  answerSaves(db);
});

describe("a Supercomputer turn, in its work's journal", () => {
  test("a finished turn is its words and the tools it used", () => {
    const entry = turn.turnEntry(
      display("complete", "Made the eleven plates and checked each.", [
        { name: "queue_generation", status: "done" },
        { name: "queue_generation", status: "done" },
        { name: "view_media", status: "error" },
      ]),
      null,
    );
    expect(entry.kind).toBe("turn");
    expect(entry.summary).toBe(
      "Made the eleven plates and checked each.\n\n1 call failed.\n\nTools used: queue_generation ×2, view_media.",
    );
  });

  test("one cut short is interrupted, saying how, with what it had written", () => {
    expect(turn.turnEntry(display("stopped", "Halfway through the plates"), null)).toEqual({
      kind: "interrupted",
      summary: "Stopped by a person.\n\nWhat it had written:\nHalfway through the plates",
    });
    const failed = turn.turnEntry(display("failed", "Started"), null);
    expect(failed.kind).toBe("interrupted");
    expect(failed.summary).toStartWith("The turn failed: The provider timed out.");
    expect(turn.turnEntry(null, new Error("usage limit reached"))).toEqual({
      kind: "interrupted",
      summary: "The turn failed: usage limit reached.",
    });
  });

  test("one waiting for an approval says what for", () => {
    const entry = turn.turnEntry(
      display("awaiting_approval", "Ready to generate", [
        { name: "queue_generation", status: "awaiting_approval", title: "Generate with Seedream" },
      ]),
      null,
    );
    expect(entry.kind).toBe("turn");
    expect(entry.summary).toStartWith("Waiting for a person to approve: Generate with Seedream.");
  });

  test("is written as the conversation, renewing its hold", async () => {
    const work = db.add("works", {
      title: "Reel 2",
      project_id: null,
      brand_kit_id: null,
      status: "active",
    });
    const actor = turn.threadActor({
      userId: String(member["id"]),
      threadId: String(thread["id"]),
      threadTitle: "Reel 2 plates",
    });
    expect(actor).toEqual({
      userId: member["id"],
      kind: "supercomputer",
      session: `supercomputer:${thread["id"]}`,
      label: "Supercomputer · Reel 2 plates",
    });
    await turn.recordTurn(
      { id: String(work["id"]), title: "Reel 2", project_id: null, brand_kit_id: null },
      actor,
      display("complete", "Done"),
      null,
    );
    const save = db.calls.find((entry) => entry.name === "work_save")!.args;
    expect(save["p_entry"]).toMatchObject({
      kind: "turn",
      summary: "Done",
      actor_kind: "supercomputer",
      actor_session: `supercomputer:${thread["id"]}`,
    });
    expect(save["p_holder"]).toBe(`supercomputer:${thread["id"]}`);
  });

  test("a work that can't be written never fails the turn", async () => {
    db.handlers.clear();
    const actor = turn.threadActor({
      userId: String(member["id"]),
      threadId: String(thread["id"]),
      threadTitle: null,
    });
    await turn.recordTurn(
      {
        id: "99999999-9999-4999-8999-999999999999",
        title: "x",
        project_id: null,
        brand_kit_id: null,
      },
      actor,
      display("complete", "x"),
      null,
    );
    await turn.holdForTurn(
      {
        id: "99999999-9999-4999-8999-999999999999",
        title: "x",
        project_id: null,
        brand_kit_id: null,
      },
      actor,
    );
  });
});

describe("a conversation working on a work", () => {
  test("is told where it stands first, then what other sessions wrote since", () => {
    const base = {
      person: { name: "Rugesh", role: "admin" },
      project: null,
      campaign: null,
      brand: null,
      brief: null,
      memories: [],
      attachments: [],
      now: new Date("2026-10-23T03:00:00Z"),
    };
    const first = history.contextText({
      ...base,
      work: { id: "w1", title: "Reel 2", brief: "# Work: Reel 2\n…", since: [] },
      changed: { first: true, brand: false, brief: false, work: true },
    });
    expect(first).toContain("Work: Reel 2 (workId w1): what you make is kept with it");
    expect(first).toContain("Where the work stands (its brief, from the studio):\n# Work: Reel 2");
    const later = history.contextText({
      ...base,
      work: {
        id: "w1",
        title: "Reel 2",
        brief: null,
        since: ["2026-10-23 02:50 UTC · save · Claude Code session s1: Plates rendered"],
      },
      changed: { first: false, brand: false, brief: false },
    });
    expect(later).not.toContain("Where the work stands");
    expect(later).toContain(
      "Since the last message, the work's journal says (written by other sessions or people):\n- 2026-10-23 02:50 UTC · save · Claude Code session s1: Plates rendered",
    );
    // A conversation on no work hears nothing of it.
    expect(
      history.contextText({ ...base, changed: { first: true, brand: false, brief: false } }),
    ).not.toContain("Work:");
  });

  test("hears what others wrote since, and not its own turns or the links its tools made", async () => {
    const work = db.add("works", {
      title: "Reel 2",
      project_id: null,
      brand_kit_id: null,
      status: "active",
    });
    const own = `supercomputer:${thread["id"]}`;
    for (const [n, kind, session, summary] of [
      [5, "turn", own, "My own turn"],
      [6, "save", "claude-code:s1", "Plates rendered\nmore detail"],
      [7, "link", "claude-code:s1", "queue_generation: 1 attached"],
      [8, "interrupted", "claude-code:s1", "The turn failed: rate limit"],
    ] as const)
      db.add("work_journal", {
        work_id: work["id"],
        n,
        kind,
        actor_session: session,
        actor_label: session === own ? "Supercomputer" : "Claude Code session s1",
        summary,
        created_at: `2026-10-23T02:0${n}:00Z`,
      });
    const result = await turn.workContext(
      { id: String(work["id"]), title: "Reel 2", project_id: null, brand_kit_id: null },
      String(thread["id"]),
      { workId: String(work["id"]), workSeen: 4 },
      false,
    );
    expect(result.facts.brief).toBeNull();
    expect(result.facts.since).toEqual([
      "2026-10-23 02:06 UTC · save · Claude Code session s1: Plates rendered",
      "2026-10-23 02:08 UTC · interrupted · Claude Code session s1: The turn failed: rate limit",
    ]);
    expect(result.seen).toBe(8);
  });
});

describe("the agent's tools, for a conversation's work", () => {
  test("work's own tools are offered without the session (the conversation is it), the rest held back", () => {
    const names = tools.agentTools().map((entry) => entry.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "start_work",
        "list_works",
        "get_work",
        "save_work",
        "attach_to_work",
        "create_project",
      ]),
    );
    for (const left of [
      "upload_work_files",
      "get_work_files",
      "get_work_file_history",
      "claim_work",
      "release_work",
    ])
      expect(names).not.toContain(left);
    const save = tools.agentTool("save_work")!;
    const properties = save.inputSchema["properties"] as Row;
    expect(properties["session"]).toBeUndefined();
    expect(properties["clientRequestId"]).toBeUndefined();
    expect(save.inputSchema["required"]).not.toContain("workId");
    expect(String((properties["workId"] as Row)["description"])).toContain(
      "the conversation's own work",
    );
    expect(save.parse({ summary: "x" }).ok).toBe(true);
    expect(save.spends({})).toBe(false);
    expect(save.label({})).toBe("Saving the work's progress");
  });

  test("a save is the conversation's, for its work unless another is named", async () => {
    const work = db.add("works", {
      title: "Reel 2",
      project_id: null,
      brand_kit_id: null,
      status: "active",
    });
    const outcome = await tools
      .agentTool("save_work")!
      .run(
        { summary: "Plates approved", nextSteps: ["Animatic"] },
        context(String(work["id"])) as never,
        "toolu_1",
      );
    expect(outcome.summary).toBe("Saved");
    const save = db.calls.find((entry) => entry.name === "work_save")!.args;
    expect(save["p_work_id"]).toBe(work["id"]);
    expect(save["p_entry"]).toMatchObject({
      summary: "Plates approved",
      next_steps: ["Animatic"],
      actor_kind: "supercomputer",
      actor_session: `supercomputer:${thread["id"]}`,
    });
    expect((save["p_entry"] as Row)["client_request_id"]).toStartWith("sc-");
  });

  test("a work the agent starts becomes the conversation's", async () => {
    const ctx = context(null);
    const outcome = await tools
      .agentTool("start_work")!
      .run({ title: "Reel 3", goal: "Another reel" }, ctx as never, "toolu_2");
    expect(outcome.summary).toBe("Started");
    expect(typeof ctx.workId).toBe("string");
    expect(db.find("supercomputer_threads", thread["id"])!["work_id"]).toBe(ctx.workId);
    const link = db.calls.filter((entry) => entry.name === "work_save").at(-1)!.args;
    expect(link["p_links"]).toEqual([
      { kind: "thread", object_id: thread["id"], role: "Supercomputer conversation", note: null },
    ]);
  });
});
