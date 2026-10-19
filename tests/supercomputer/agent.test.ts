import { describe, expect, test } from "bun:test";
import {
  applyAgentEvent,
  awaitingApprovals,
  decodeEvents,
  displayOf,
  displayText,
  documentsOf,
  EMPTY_DISPLAY,
  encodeEvent,
  generationsOf,
  STALE_STREAM_MS,
  storedDisplay,
  type AgentDisplay,
  type AgentEvent,
} from "../../src/lib/supercomputer/agent-events";
import {
  agentModelLabel,
  DEFAULT_THREAD_SETTINGS,
  threadSettingsOf,
  takesFallbacks,
} from "../../src/lib/supercomputer/agent-settings";
import {
  addressesIn,
  contextText,
  historyOf,
  stateOf,
  userTurnContent,
  type MessageRow,
} from "../../src/lib/supercomputer/agent-history.server";
import {
  agentTools,
  apiTools,
  requestKeyFor,
  resultText,
} from "../../src/lib/supercomputer/agent-tools.server";
import Anthropic from "@anthropic-ai/sdk";
import {
  abandonPending,
  afterFallback,
  freshState,
  mergePayload,
  runTurn,
  type ApiMessage,
  type StepStream,
  type TurnIo,
  type TurnState,
} from "../../src/lib/supercomputer/agent-loop.server";

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

const run = (events: AgentEvent[], from: AgentDisplay = EMPTY_DISPLAY) =>
  events.reduce(applyAgentEvent, from);

describe("what the agent shows", () => {
  test("text and thinking stream into their blocks, and end", () => {
    const display = run([
      { type: "block", key: "0:0", block: { kind: "thinking", text: "", done: false } },
      { type: "thinking", key: "0:0", text: "Weighing " },
      { type: "thinking", key: "0:0", text: "options" },
      { type: "end", key: "0:0" },
      { type: "block", key: "0:1", block: { kind: "text", text: "", done: false } },
      { type: "text", key: "0:1", text: "Here's " },
      { type: "text", key: "0:1", text: "the plan." },
    ]);
    expect(display.blocks.map((entry) => entry.block)).toEqual([
      { kind: "thinking", text: "Weighing options", done: true },
      { kind: "text", text: "Here's the plan.", done: false },
    ]);
    expect(displayText(display)).toBe("Here's the plan.");
    // Text never goes into a thinking block, or the other way round.
    const crossed = run([{ type: "text", key: "0:0", text: "x" }], display);
    expect(crossed.blocks[0]!.block).toEqual(display.blocks[0]!.block);
  });

  test("a tool call is updated as it runs, and a finished turn leaves nothing running", () => {
    const display = run([
      {
        type: "block",
        key: "0:2",
        block: {
          kind: "tool",
          id: "t1",
          name: "queue_generation",
          label: "Generating",
          input: null,
          status: "streaming",
          summary: null,
          ui: null,
          approval: null,
        },
      },
      { type: "update", key: "0:2", patch: { status: "running", input: { a: 1 } } },
      { type: "status", status: "stopped" },
    ]);
    const tool = display.blocks[0]!.block;
    expect(tool.kind === "tool" && tool.status).toBe("error");
    expect(tool.kind === "tool" && tool.summary).toBe("Stopped before it finished");
    expect(tool.kind === "tool" && tool.input).toEqual({ a: 1 });
    expect(display.status).toBe("stopped");
  });

  test("waiting for an approval keeps the call waiting", () => {
    const display = run([
      {
        type: "block",
        key: "1:0",
        block: {
          kind: "tool",
          id: "t1",
          name: "queue_generation",
          label: "Generating",
          input: {},
          status: "awaiting_approval",
          summary: null,
          ui: null,
          approval: null,
        },
      },
      { type: "status", status: "awaiting_approval" },
    ]);
    const tool = display.blocks[0]!.block;
    expect(tool.kind === "tool" && tool.status).toBe("awaiting_approval");
  });

  test("a redone step's blocks are dropped; web results are kept to twelve", () => {
    const display = run([
      { type: "block", key: "2:0", block: { kind: "text", text: "half", done: false } },
      { type: "block", key: "3:0", block: { kind: "text", text: "kept", done: false } },
      {
        type: "block",
        key: "3:1",
        block: {
          kind: "web",
          id: "w",
          tool: "web_search",
          query: "",
          results: [],
          status: "running",
        },
      },
      {
        type: "update",
        key: "3:1",
        patch: {
          status: "done",
          query: "brand trends",
          results: Array.from({ length: 20 }, (_, i) => ({
            title: `r${i}`,
            url: `https://x/${i}`,
          })),
        },
      },
      { type: "drop", prefix: "2:" },
    ]);
    expect(display.blocks.map((entry) => entry.key)).toEqual(["3:0", "3:1"]);
    const web = display.blocks[1]!.block;
    expect(web.kind === "web" && web.results.length).toBe(12);
    expect(web.kind === "web" && web.query).toBe("brand trends");
  });

  test("events go over the wire and come back, even split mid-event", () => {
    const events: AgentEvent[] = [
      { type: "text", key: "0:0", text: "Hello\n\nworld" },
      { type: "status", status: "complete" },
    ];
    const wire = events.map(encodeEvent).join("") + ": keep-alive\n\n";
    const cut = 17;
    const first = decodeEvents(wire.slice(0, cut));
    const second = decodeEvents(first.rest + wire.slice(cut));
    expect([...first.events, ...second.events]).toEqual(events);
    expect(second.rest).toBe("");
    expect(decodeEvents("data: {nope}\n\n").events).toEqual([]);
  });

  test("a stored display is read back tolerantly", () => {
    const display = run([
      { type: "block", key: "0:0", block: { kind: "text", text: "Hi", done: true } },
      { type: "status", status: "complete" },
    ]);
    expect(displayOf(JSON.parse(JSON.stringify(display)))).toEqual(display);
    expect(displayOf({ blocks: [{ nope: 1 }], status: "weird" })).toEqual({
      blocks: [],
      status: "complete",
      error: null,
      usage: null,
      model: null,
    });
    expect(displayOf(null)).toBeNull();
  });

  test("a kept answer shows as its row says; one that stopped saving was cut off", () => {
    const writing = run([
      { type: "block", key: "0:0", block: { kind: "text", text: "Half", done: false } },
      {
        type: "block",
        key: "0:1",
        block: {
          kind: "tool",
          id: "t1",
          name: "list_assets",
          label: "Looking",
          input: {},
          status: "running",
          summary: null,
          ui: null,
          approval: null,
        },
      },
    ]);
    const payload = { agent: { display: writing } };
    const now = Date.parse("2026-10-19T12:00:00Z");
    const fresh = new Date(now - 5_000).toISOString();
    const old = new Date(now - STALE_STREAM_MS - 1_000).toISOString();

    expect(storedDisplay({ payload, status: "streaming", updated_at: fresh }, now)?.status).toBe(
      "streaming",
    );
    const cut = storedDisplay({ payload, status: "streaming", updated_at: old }, now)!;
    expect(cut.status).toBe("failed");
    expect(cut.error).toMatch(/cut off/);
    expect(cut.blocks[0]!.block).toMatchObject({ kind: "text", done: true });
    expect(cut.blocks[1]!.block).toMatchObject({ kind: "tool", status: "error" });

    // Stopped from another page: the row says so, though the display was saved mid-stream.
    const stopped = storedDisplay({ payload, status: "stopped", updated_at: fresh }, now)!;
    expect(stopped.status).toBe("stopped");
    const failed = storedDisplay({ payload, status: "failed", error_message: "Overloaded" }, now)!;
    expect(failed.error).toBe("Overloaded");
    expect(storedDisplay({ payload: { intent: "chat" }, status: "complete" })).toBeNull();
  });

  test("what a conversation made, and what waits for a person", () => {
    const tool = (id: string, ui: unknown, status = "done", approval: unknown = null) =>
      ({
        type: "block",
        key: `0:${id}`,
        block: {
          kind: "tool",
          id,
          name: "x",
          label: "x",
          input: {},
          status,
          summary: null,
          ui,
          approval,
        },
      }) as AgentEvent;
    const generation = (id: string) => ({
      type: "generation",
      generationId: id,
      modelName: null,
      outputType: "image",
      prompt: `p-${id}`,
    });
    const first = run([
      tool("a", { type: "document", title: "Script", markdown: "# Hi" }),
      tool("b", generation("g1")),
    ]);
    const second = run([
      tool("c", generation("g1")),
      tool("d", generation("g2")),
      tool("e", null, "awaiting_approval", {
        toolUseId: "e",
        title: "Make a video",
        details: [],
        estimateUsd: 1.5,
        reason: "It spends credits",
      }),
      tool("f", null, "awaiting_approval", {
        toolUseId: "f",
        title: "Make another",
        details: [],
        estimateUsd: null,
        reason: "It spends credits",
      }),
    ]);
    expect(documentsOf([first, second])).toEqual([{ title: "Script", markdown: "# Hi" }]);
    expect(generationsOf([first, second])).toEqual([
      { generationId: "g1", prompt: "p-g1" },
      { generationId: "g2", prompt: "p-g2" },
    ]);
    expect(awaitingApprovals(second).map((approval) => approval.toolUseId)).toEqual(["e", "f"]);
    expect(awaitingApprovals(first)).toEqual([]);
  });
});

describe("a conversation's settings", () => {
  test("unknown values fall back, spending without asking is capped", () => {
    expect(threadSettingsOf(null)).toEqual(DEFAULT_THREAD_SETTINGS);
    expect(
      threadSettingsOf({
        model: "claude-sonnet-5-5",
        effort: "max",
        autoApproveUsd: 999,
        brandKitId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
      }),
    ).toEqual({
      model: "claude-sonnet-5-5",
      effort: "max",
      autoApproveUsd: 25,
      brandKitId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
    });
    expect(
      threadSettingsOf({ model: "gpt-9", effort: "ultra", autoApproveUsd: -3, brandKitId: "x" }),
    ).toEqual(DEFAULT_THREAD_SETTINGS);
    expect(takesFallbacks("claude-haiku-5-5")).toBe(false);
    expect(takesFallbacks("claude-opus-5-5")).toBe(true);
  });

  test("models are named for people, a fallback one too", () => {
    expect(agentModelLabel("claude-opus-5-5")).toBe("Claude Opus 5.5");
    expect(agentModelLabel("claude-opus-4-8")).toBe("Claude Opus 4.8");
    expect(agentModelLabel("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(agentModelLabel("claude-sonnet-4-5-20250929")).toBe("Claude Sonnet 4.5");
    expect(agentModelLabel("something-else")).toBe("something-else");
  });
});

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

const row = (extra: Partial<MessageRow>): MessageRow => ({
  id: "m",
  role: "user",
  content: "",
  attachments: [],
  payload: {},
  status: "complete",
  created_at: "2026-10-19T00:00:00Z",
  ...extra,
});

describe("the conversation as Claude reads it", () => {
  test("messages as first sent, turns' transcripts unchanged, older answers in brief", () => {
    const sent = [
      { type: "text", text: "<context>…</context>" },
      { type: "text", text: "Make a reel" },
    ];
    const transcript: ApiMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "On it." }] },
    ];
    const messages = historyOf([
      row({
        id: "a",
        role: "user",
        content: "Old question",
        attachments: [{ assetId: "x", type: "image", title: "Logo" }],
      }),
      row({
        id: "b",
        role: "assistant",
        content: "Old answer",
        payload: { drafts: [{ title: "Hero", modelName: "Model" }] },
      }),
      row({ id: "c", role: "user", content: "Make a reel", payload: { agent: { content: sent } } }),
      row({ id: "d", role: "assistant", payload: { agent: { transcript } } }),
      row({ id: "e", role: "assistant", status: "failed", content: "boom" }),
      row({ id: "f", role: "user", content: "gone", superseded_at: "2026-10-19T01:00:00Z" }),
      row({
        id: "g",
        role: "assistant",
        status: "awaiting_approval",
        payload: { agent: { transcript } },
      }),
    ]);
    expect(messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: 'Old question\n[Attached: image "Logo" (x)]' }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Old answer\n[Drafts: 1) Hero — Model]" }],
      },
      { role: "user", content: sent },
      ...transcript,
    ]);
  });

  test("a stopped answer says so, so the next turn doesn't pick its work up", () => {
    const ask = (id: string, text: string) =>
      row({
        id,
        role: "user",
        content: text,
        payload: { agent: { content: [{ type: "text", text }] } },
      });
    const stoppedBefore = row({
      id: "s1",
      role: "assistant",
      status: "stopped",
      payload: { agent: { transcript: [], steps: 0, display: { blocks: [], status: "stopped" } } },
    });
    // Stopped part-way through a second step: its words so far, after the first step's exchange.
    const firstStep: ApiMessage[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t", name: "list_assets", input: {} }],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] },
    ];
    const stoppedMidway = row({
      id: "s2",
      role: "assistant",
      status: "stopped",
      payload: {
        agent: {
          transcript: firstStep,
          steps: 1,
          display: {
            status: "stopped",
            blocks: [
              { key: "0:0", block: { kind: "text", text: "Looking first.", done: true } },
              { key: "1:0", block: { kind: "text", text: "Once upon a time", done: true } },
            ],
          },
        },
      },
    });
    const messages = historyOf([
      ask("u1", "Write a story"),
      stoppedBefore,
      ask("u2", "Write another"),
      stoppedMidway,
      ask("u3", "Remember I like squares"),
    ]);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages[1]!.content).toEqual([
      { type: "text", text: "[The person stopped this answer before it was written.]" },
    ]);
    expect(messages[5]!.content).toEqual([
      { type: "text", text: "Once upon a time\n\n[Stopped here by the person.]" },
    ]);
  });

  test("the web addresses a message names are written out in full", () => {
    expect(
      addressesIn(
        "Search for what Aurixa Systems (aurixasystems.com.au) does, see https://Example.com/a/b?x=1. and http://www.plain.org!",
      ),
    ).toEqual([
      "https://aurixasystems.com.au",
      "https://example.com/a/b?x=1",
      "http://www.plain.org",
    ]);
    // Not addresses: an email, file names, versions, abbreviations; each address once.
    expect(
      addressesIn(
        "Mail rugesh@aurixasystems.com.au the logo.png and brief.pdf, built on next.js v2.7, e.g. twice: aurixa.io aurixa.io",
      ),
    ).toEqual(["https://aurixa.io"]);
    const text = contextText({
      person: { name: null, role: "member" },
      project: null,
      campaign: null,
      brand: null,
      brief: null,
      memories: [],
      attachments: [],
      addresses: ["https://aurixasystems.com.au"],
      changed: { brand: false, brief: false, first: false },
      now: new Date("2026-10-19T00:00:00Z"),
    });
    expect(text).toContain("Web addresses in this message:\n- https://aurixasystems.com.au");
  });

  test("a kept turn is resumed with its drafts", () => {
    const state = stateOf({
      drafts: [{ title: "x" }],
      agent: {
        transcript: [],
        display: { blocks: [], status: "awaiting_approval" },
        pending: null,
        model: "claude-opus-5-5",
        steps: 2,
      },
    });
    expect(state?.steps).toBe(2);
    expect(state?.payload.drafts).toHaveLength(1);
    expect(state?.display.status).toBe("awaiting_approval");
    expect(stateOf({})).toBeNull();
  });

  test("the context: given in full on the first message, then only when the brand or brief change", () => {
    const base = {
      person: { name: "Rugesh", role: "admin" },
      project: { name: "Launch", description: null },
      campaign: null,
      brand: { id: "k1", name: "Aurixa", block: "BRAND …" },
      brief: { id: "b1", title: "Q4", block: "{…}" },
      memories: [{ id: "m1", content: "Always 9:16 for social", scope: "team" }],
      attachments: [{ assetId: "a1", type: "image", title: "Hero" }],
      now: new Date("2026-10-19T03:00:00Z"),
    };
    const first = contextText({ ...base, changed: { first: true, brand: true, brief: true } });
    expect(first).toContain("Date: Monday 19 October 2026 (UTC)");
    expect(first).toContain("Brand kit: Aurixa (brandKitId k1)");
    expect(first).toContain("BRAND …");
    expect(first).toContain("[m1] (team) Always 9:16 for social");
    expect(first).toContain('- a1 · image · "Hero"');
    const later = contextText({ ...base, changed: { first: false, brand: false, brief: false } });
    expect(later).not.toContain("BRAND …");
    expect(later).not.toContain("Always 9:16");
    expect(later).toContain("Brand kit: Aurixa");
  });

  test("a message's content: context, words, then each picture with its label", () => {
    expect(
      userTurnContent({
        context: "<context/>",
        text: "  Look at this  ",
        pictures: [{ bucket: "b", path: "p.png", label: "a1:" }],
      }),
    ).toEqual([
      { type: "text", text: "<context/>" },
      { type: "text", text: "Look at this" },
      { type: "text", text: "a1:" },
      { type: "image", source: { type: "url", url: "xeno-asset://b/p.png" } },
    ]);
    expect(userTurnContent({ context: "c", text: " ", pictures: [] })).toEqual([
      { type: "text", text: "c" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

describe("the agent's tools", () => {
  test("every tool has a distinct name and an object schema without the studio's own fields", () => {
    const tools = agentTools();
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.inputSchema["type"]).toBe("object");
      const properties = (tool.inputSchema["properties"] ?? {}) as Record<string, unknown>;
      expect(properties["clientRequestId"]).toBeUndefined();
      expect(properties["estimatedCostUsd"]).toBeUndefined();
    }
    expect(names).toContain("queue_generation");
    expect(names).toContain("view_media");
    expect(names).not.toContain("whoami");
    const api = apiTools();
    expect(api.slice(-2).map((tool) => (tool as { type: string }).type)).toEqual([
      "web_search_20260209",
      "web_fetch_20260209",
    ]);
    // The order is fixed, so a conversation's prompt never changes under it.
    expect(apiTools().map((tool) => tool.name)).toEqual(api.map((tool) => tool.name));
  });

  test("what spends is asked about; what doesn't isn't", () => {
    const spends = (name: string, input: Record<string, unknown> = {}) =>
      agentTools()
        .find((tool) => tool.name === name)!
        .spends(input);
    expect(spends("queue_generation")).toBe(true);
    expect(spends("train_soul_id")).toBe(true);
    expect(spends("steer_long_video", { action: "continue" })).toBe(true);
    expect(spends("steer_long_video", { action: "stop" })).toBe(false);
    expect(spends("steer_clip", { action: "redo" })).toBe(true);
    expect(spends("steer_clip", { action: "hold" })).toBe(false);
    expect(spends("list_assets")).toBe(false);
    expect(spends("write_document")).toBe(false);
  });

  test("a studio tool's input is checked without its request id; an own tool's as given", () => {
    const queue = agentTools().find((tool) => tool.name === "queue_generation")!;
    expect(
      queue.parse({ modelId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60", parameters: { prompt: "x" } })
        .ok,
    ).toBe(true);
    const bad = queue.parse({ modelId: "nope" });
    expect(bad.ok).toBe(false);
    const view = agentTools().find((tool) => tool.name === "view_media")!;
    expect(view.parse({ assetIds: [] }).ok).toBe(false);
    expect(view.label({ assetIds: ["7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60"] })).toBe(
      "Looking at a picture",
    );
  });

  test("request ids are stable per call and fit the studio's limit", () => {
    const key = requestKeyFor(
      "2b6b1d6e-58c4-4a93-9d43-1b2c3d4e5f60",
      "toolu_01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123",
    );
    expect(key).toBe(
      requestKeyFor(
        "2b6b1d6e-58c4-4a93-9d43-1b2c3d4e5f60",
        "toolu_01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123",
      ),
    );
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(64);
    expect(resultText("x".repeat(40_000))).toContain("(cut: 10000 more characters");
  });
});

/* ------------------------------------------------------------------ */
/* Turns                                                               */
/* ------------------------------------------------------------------ */

type Block = Record<string, unknown>;

/** A scripted model call: its events as Claude streams them, then the whole message. */
function scripted(content: Block[], stopReason: string, model = "claude-opus-5-5"): StepStream {
  const events: Record<string, unknown>[] = [{ type: "message_start", message: { model } }];
  content.forEach((block, index) => {
    if (block["type"] === "text") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" },
      });
      const text = String(block["text"]);
      for (let at = 0; at < text.length; at += 5)
        events.push({
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text: text.slice(at, at + 5) },
        });
    } else if (block["type"] === "thinking") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "thinking", thinking: "" },
      });
      events.push({
        type: "content_block_delta",
        index,
        delta: { type: "thinking_delta", thinking: block["thinking"] },
      });
    } else if (block["type"] === "fallback" || String(block["type"]).endsWith("_tool_result")) {
      events.push({ type: "content_block_start", index, content_block: block });
    } else if (block["type"] === "server_tool_use") {
      // Sent with its input empty and never streamed: the finished message has it.
      events.push({ type: "content_block_start", index, content_block: { ...block, input: {} } });
    } else if (block["type"] === "tool_use") {
      events.push({
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id: block["id"], name: block["name"], input: {} },
      });
      events.push({
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(block["input"]) },
      });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push(
    { type: "message_delta", delta: { stop_reason: stopReason } },
    { type: "message_stop" },
  );
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event as never;
    },
    finalMessage: async () =>
      ({
        id: "msg",
        type: "message",
        role: "assistant",
        model,
        content,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 0,
        },
      }) as never,
  };
}

function harness(steps: (() => StepStream)[], options: { signal?: AbortSignal } = {}) {
  const events: AgentEvent[] = [];
  const saves: { state: TurnState; phase: string }[] = [];
  const requests: Record<string, unknown>[] = [];
  let next = 0;
  const io: TurnIo = {
    context: {
      userId: "u",
      threadId: "t",
      turnId: "2b6b1d6e-58c4-4a93-9d43-1b2c3d4e5f60",
      settings: { ...DEFAULT_THREAD_SETTINGS },
      projectId: null,
      campaignId: null,
      signal: options.signal ?? new AbortController().signal,
    },
    system: "You are a test.",
    history: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    emit: (event) => events.push(event),
    persist: async (state, phase) => {
      saves.push({ state, phase });
    },
    resolve: async (messages) => messages,
    openStream: (params) => {
      requests.push(params);
      const step = steps[next];
      next += 1;
      if (!step) throw new Error("No more scripted steps");
      return step();
    },
  };
  return { io, events, saves, requests };
}

describe("a turn", () => {
  test("a plain answer: streamed, kept as the API returned it, and saved as complete", async () => {
    const { io, saves, requests } = harness([
      () =>
        scripted(
          [
            { type: "thinking", thinking: "Short answer.", signature: "sig" },
            { type: "text", text: "Hello! What shall we make today?" },
          ],
          "end_turn",
        ),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.display.status).toBe("complete");
    expect(displayText(state.display)).toBe("Hello! What shall we make today?");
    expect(state.transcript).toHaveLength(1);
    expect((state.transcript[0]!.content as Block[])[0]).toEqual({
      type: "thinking",
      thinking: "Short answer.",
      signature: "sig",
    });
    expect(state.usage).toMatchObject({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 });
    expect(saves.at(-1)?.phase).toBe("final");
    // The request: adaptive summarised thinking, effort, the web tools, fallbacks and binding controls.
    const first = requests[0]!;
    expect(first["thinking"]).toEqual({
      type: "adaptive",
      display: "summarized",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    });
    expect(first["output_config"]).toEqual({ effort: "high" });
    expect(first["fallbacks"]).toBe("default");
    expect(first["betas"]).toEqual([
      "thinking-binding-controls-2026-08-01",
      "server-side-fallback-2026-07-01",
    ]);
    expect((first["messages"] as unknown[]).length).toBe(1);
  });

  test("a tool call runs, its result goes back, and the answer carries on", async () => {
    const { io, events, requests } = harness([
      () =>
        scripted(
          [
            { type: "text", text: "Writing the script." },
            {
              type: "tool_use",
              id: "toolu_1",
              name: "write_document",
              input: { title: "Script", markdown: "# Scene 1" },
            },
          ],
          "tool_use",
        ),
      () => scripted([{ type: "text", text: "Done: it's beside the chat." }], "end_turn"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.display.status).toBe("complete");
    expect(state.transcript.map((message) => message.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    const results = state.transcript[1]!.content as Block[];
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(results[0]!["is_error"]).toBeUndefined();
    const tool = state.display.blocks.find((entry) => entry.block.kind === "tool")!.block;
    expect(tool.kind === "tool" && tool.status).toBe("done");
    expect(tool.kind === "tool" && tool.ui).toEqual({
      type: "document",
      title: "Script",
      markdown: "# Scene 1",
    });
    expect(tool.kind === "tool" && tool.label).toBe("Writing “Script”");
    // The second request carries the first answer and its result.
    expect((requests[1]!["messages"] as unknown[]).length).toBe(3);
    expect(events.some((event) => event.type === "update")).toBe(true);
  });

  test("an input that doesn't fit the tool goes back as an error for Claude to fix", async () => {
    const { io } = harness([
      () =>
        scripted(
          [{ type: "tool_use", id: "toolu_2", name: "write_document", input: { title: "" } }],
          "tool_use",
        ),
      () => scripted([{ type: "text", text: "Fixed." }], "end_turn"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    const results = state.transcript[1]!.content as Block[];
    expect(results[0]!["is_error"]).toBe(true);
    expect(String(results[0]!["content"])).toContain("INVALID_INPUT");
    expect(displayText(state.display)).toBe("Fixed.");
  });

  test("spending waits for approval; a decline goes back to Claude, which carries on", async () => {
    const generate = {
      type: "tool_use",
      id: "toolu_3",
      name: "queue_generation",
      input: {
        modelId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
        parameters: { prompt: "A red fox" },
      },
    };
    const first = harness([() => scripted([generate], "tool_use")]);
    const waiting = await runTurn(first.io, freshState("claude-opus-5-5"));
    expect(waiting.display.status).toBe("awaiting_approval");
    expect(waiting.pending?.awaiting).toEqual(["toolu_3"]);
    // Nothing is sent until it is answered.
    expect(waiting.transcript).toEqual([]);
    const card = waiting.display.blocks.find((entry) => entry.block.kind === "tool")!.block;
    expect(card.kind === "tool" && card.status).toBe("awaiting_approval");
    expect(card.kind === "tool" && card.approval?.toolUseId).toBe("toolu_3");

    const second = harness([() => scripted([{ type: "text", text: "OK, I won't." }], "end_turn")]);
    const answered = await runTurn(second.io, JSON.parse(JSON.stringify(waiting)), {
      toolu_3: "deny",
    });
    expect(answered.display.status).toBe("complete");
    expect(answered.pending).toBeNull();
    expect(answered.transcript.map((message) => message.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    const result = (answered.transcript[1]!.content as Block[])[0]!;
    expect(result["is_error"]).toBe(true);
    expect(String(result["content"])).toContain("declined");
    const denied = answered.display.blocks.find((entry) => entry.block.kind === "tool")!.block;
    expect(denied.kind === "tool" && denied.status).toBe("denied");
  });

  test("a call left waiting when the conversation moves on is sent as not approved", async () => {
    const generate = {
      type: "tool_use",
      id: "toolu_4",
      name: "queue_generation",
      input: { modelId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60", parameters: { prompt: "x" } },
    };
    const { io } = harness([() => scripted([generate], "tool_use")]);
    const waiting = await runTurn(io, freshState("claude-opus-5-5"));
    const closed = abandonPending(waiting);
    expect(closed.pending).toBeNull();
    expect(closed.display.status).toBe("complete");
    expect(closed.transcript.map((message) => message.role)).toEqual(["assistant", "user"]);
    expect(String((closed.transcript[1]!.content as Block[])[0]!["content"])).toContain(
      "Not approved",
    );
  });

  test("a refusal keeps nothing of its step, and says so", async () => {
    const { io } = harness([() => scripted([{ type: "text", text: "I'll start by…" }], "refusal")]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.transcript).toEqual([]);
    expect(state.display.blocks.map((entry) => entry.block.kind)).toEqual(["notice"]);
    expect(state.display.status).toBe("complete");
  });

  test("a paused turn is sent back to carry on", async () => {
    const { io, requests } = harness([
      () => scripted([{ type: "text", text: "Searching…" }], "pause_turn"),
      () => scripted([{ type: "text", text: "Found it." }], "end_turn"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.transcript).toHaveLength(2);
    expect((requests[1]!["messages"] as unknown[]).length).toBe(2);
  });

  test("a tool input that can't be parsed is asked for again, its half-shown step dropped", async () => {
    const { AnthropicError } = (await import("@anthropic-ai/sdk")).default;
    const broken: StepStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        } as never;
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Half" },
        } as never;
        throw new AnthropicError("Unable to parse tool parameter JSON from model.");
      },
      finalMessage: async () => {
        throw new Error("unreachable");
      },
    };
    const { io } = harness([
      () => broken,
      () => scripted([{ type: "text", text: "Whole." }], "end_turn"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(displayText(state.display)).toBe("Whole.");
    expect(state.display.status).toBe("complete");
  });

  test("an API failure is reported in words; a stop is a stop", async () => {
    const failing = harness([
      () => {
        throw new Error("socket hang up");
      },
    ]);
    const failed = await runTurn(failing.io, freshState("claude-opus-5-5"));
    expect(failed.display.status).toBe("failed");
    expect(failed.display.error).toBe("socket hang up");

    const controller = new AbortController();
    controller.abort();
    const stopped = harness([() => scripted([{ type: "text", text: "x" }], "end_turn")], {
      signal: controller.signal,
    });
    const state = await runTurn(stopped.io, freshState("claude-opus-5-5"));
    expect(state.display.status).toBe("stopped");
  });

  test("drafts from two calls in a turn are shown together, each plan on its own drafts", () => {
    const draft = (title: string) => ({ title }) as never;
    const first = mergePayload(
      {},
      {
        drafts: [draft("a"), draft("b")],
        editPlan: { shots: [{ draftIndex: 0 }, { draftIndex: 1 }] },
      },
    );
    const both = mergePayload(first, {
      drafts: [draft("c"), draft("d"), draft("e")],
      editPlan: { title: "Second", shots: [{ draftIndex: 2 }, { draftIndex: 0 }] },
    });
    expect(both.drafts?.map((entry) => (entry as { title: string }).title)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    // The second plan's shots count its own drafts, which now follow the first call's.
    expect(both.editPlan).toEqual({
      title: "Second",
      shots: [{ draftIndex: 4 }, { draftIndex: 2 }],
    });
    // A plan without a second call keeps its shots as they are.
    expect(mergePayload(first, { ideas: [] }).editPlan).toEqual(first.editPlan);
  });

  test("after a switch part-way, the declined model's thinking and calls are neither run nor sent back", () => {
    const content = [
      { type: "thinking", thinking: "x", signature: "s" },
      { type: "text", text: "Let me" },
      { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "a" } },
      { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] },
      { type: "server_tool_use", id: "srv_2", name: "web_search", input: { query: "b" } },
      { type: "tool_use", id: "toolu_old", name: "write_document", input: {} },
      { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
      { type: "thinking", thinking: "y", signature: "t" },
      { type: "tool_use", id: "toolu_new", name: "write_document", input: {} },
    ];
    const { content: kept, skipped } = afterFallback(content as never);
    expect((kept as unknown as Block[]).map((block) => block["type"])).toEqual([
      "text",
      "server_tool_use",
      "web_search_tool_result",
      "thinking",
      "tool_use",
    ]);
    expect(skipped).toEqual(["toolu_old"]);
    // Without a switch, nothing changes.
    const plain = [{ type: "text", text: "Hi" }];
    expect(afterFallback(plain as never)).toEqual({ content: plain as never, skipped: [] });
  });

  test("a switch part-way: only the new model's call runs, and the switch is shown", async () => {
    const { io, requests } = harness([
      () =>
        scripted(
          [
            { type: "thinking", thinking: "Declined part-way.", signature: "s" },
            { type: "text", text: "Let me write" },
            {
              type: "tool_use",
              id: "toolu_old",
              name: "write_document",
              input: { title: "Old", markdown: "x" },
            },
            {
              type: "fallback",
              from: { model: "claude-opus-5-5" },
              to: { model: "claude-opus-4-8" },
            },
            { type: "text", text: "Writing it now." },
            {
              type: "tool_use",
              id: "toolu_new",
              name: "write_document",
              input: { title: "New", markdown: "y" },
            },
          ],
          "tool_use",
          "claude-opus-4-8",
        ),
      () => scripted([{ type: "text", text: "Done." }], "end_turn", "claude-opus-4-8"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.display.status).toBe("complete");
    expect(state.display.model).toBe("claude-opus-4-8");
    const sent = state.transcript[0]!.content as Block[];
    expect(sent.map((block) => block["type"])).toEqual(["text", "text", "tool_use"]);
    const results = state.transcript[1]!.content as Block[];
    expect(results.map((block) => block["tool_use_id"])).toEqual(["toolu_new"]);
    const tools = state.display.blocks.flatMap(({ block }) =>
      block.kind === "tool" ? [block] : [],
    );
    expect(tools.map((tool) => [tool.id, tool.status])).toEqual([
      ["toolu_old", "denied"],
      ["toolu_new", "done"],
    ]);
    expect(
      state.display.blocks.some(
        ({ block }) =>
          block.kind === "notice" &&
          block.text === "Claude Opus 5.5 declined this, so Claude Opus 4.8 took over.",
      ),
    ).toBe(true);
    expect((requests[1]!["messages"] as unknown[]).length).toBe(3);
  });

  test("an optional part the API rejects is left out for the rest of the turn", async () => {
    const rejected = () => {
      throw new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "fallbacks: unknown" } },
        "fallbacks: Extra inputs are not permitted",
        new Headers(),
      );
    };
    const { io, requests } = harness([
      rejected,
      () =>
        scripted(
          [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "write_document",
              input: { title: "A", markdown: "b" },
            },
          ],
          "tool_use",
        ),
      () => scripted([{ type: "text", text: "Done." }], "end_turn"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.display.status).toBe("complete");
    expect(requests).toHaveLength(3);
    expect(requests[0]!["fallbacks"]).toBe("default");
    // The step went again without the betas, and the next step started there.
    expect(requests[1]!["fallbacks"]).toBeUndefined();
    expect(requests[1]!["betas"]).toBeUndefined();
    expect(requests[2]!["betas"]).toBeUndefined();
    expect(requests[2]!["output_config"]).toEqual({ effort: "high" });
  });

  test("searches and page reads are shown with what they looked for; the code sorting them isn't", async () => {
    const { io } = harness([
      () =>
        scripted(
          [
            { type: "server_tool_use", id: "c1", name: "code_execution", input: { code: "x" } },
            {
              type: "server_tool_use",
              id: "w1",
              name: "web_search",
              input: { query: "aurixa systems" },
            },
            {
              type: "web_search_tool_result",
              tool_use_id: "w1",
              content: [{ type: "web_search_result", url: "https://a.example/", title: "A" }],
            },
            {
              type: "code_execution_tool_result",
              tool_use_id: "c1",
              content: { type: "code_execution_result", stdout: "A" },
            },
            {
              type: "server_tool_use",
              id: "f1",
              name: "web_fetch",
              input: { url: "https://aurixasystems.com.au" },
            },
            {
              type: "web_fetch_tool_result",
              tool_use_id: "f1",
              content: {
                type: "web_fetch_tool_result_error",
                error_code: "url_not_in_prior_context",
              },
            },
            { type: "text", text: "Done." },
          ],
          "end_turn",
        ),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    const web = state.display.blocks.flatMap(({ block }) => (block.kind === "web" ? [block] : []));
    expect(
      web.map((block) => [block.tool, block.query, block.status, block.results.length]),
    ).toEqual([
      ["web_search", "aurixa systems", "done", 1],
      ["web_fetch", "https://aurixasystems.com.au", "error", 0],
    ]);
    expect(web[1]!.summary).toContain("already in the conversation");
    // Kept as the API returned it, code and all.
    expect((state.transcript[0]!.content as Block[]).length).toBe(7);
  });

  test("a finished turn leaves no search running", () => {
    const search = (id: string, results: number): AgentEvent => ({
      type: "block",
      key: `0:${id}`,
      block: {
        kind: "web",
        id,
        tool: "web_search",
        query: "q",
        results: Array.from({ length: results }, (_, index) => ({
          title: "t",
          url: `https://x.example/${index}`,
        })),
        status: "running",
      },
    });
    const ended = run([search("a", 2), search("b", 0), { type: "status", status: "complete" }]);
    expect(ended.blocks.map(({ block }) => block.kind === "web" && block.status)).toEqual([
      "done",
      "error",
    ]);
  });

  test("a fallback model that answers is shown", async () => {
    const { io } = harness([
      () => scripted([{ type: "text", text: "Hi" }], "end_turn", "claude-opus-4-8"),
    ]);
    const state = await runTurn(io, freshState("claude-opus-5-5"));
    expect(state.display.model).toBe("claude-opus-4-8");
  });
});
