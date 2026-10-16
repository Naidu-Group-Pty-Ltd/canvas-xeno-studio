import { describe, expect, test } from "bun:test";
import {
  deliveredBy,
  describeToolUse,
  interpretEvents,
  isQuote,
  mediaUrls,
  type SessionEventLike,
} from "../../src/lib/katana/events";

const MEDIA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const at = (second: number) => `2026-10-16T08:00:${String(second).padStart(2, "0")}.000Z`;
const none = () => null;

function text(value: string) {
  return [{ type: "text", text: value }];
}

describe("interpretEvents", () => {
  test("a paid call held for the guard becomes an ask and a step", () => {
    const events: SessionEventLike[] = [
      {
        id: "sevt_1",
        type: "agent.mcp_tool_use",
        name: "generate_video",
        mcp_server_name: "higgsfield",
        input: { params: { model: "seedance_2_5", duration: 5, resolution: "720p" } },
        evaluated_permission: "ask",
        processed_at: at(1),
      },
      {
        id: "sevt_2",
        type: "session.status_idle",
        stop_reason: { type: "requires_action", event_ids: ["sevt_1"] },
        processed_at: at(2),
      },
    ];
    const effects = interpretEvents(events, none);
    expect(effects.asks.map((ask) => ask.id)).toEqual(["sevt_1"]);
    expect(effects.feed[0]).toMatchObject({
      kind: "step",
      title: "Generating a video",
      body: "seedance_2_5 · 720p · 5 s",
    });
    expect(effects.state).toEqual({
      kind: "idle",
      stop: "requires_action",
      eventIds: ["sevt_1"],
      refusal: null,
    });
    expect(effects.lastEventAt).toBe(at(2));
  });

  test("calls that run without asking are only steps", () => {
    const effects = interpretEvents(
      [
        {
          id: "sevt_1",
          type: "agent.mcp_tool_use",
          name: "sandbox_exec",
          input: { command: 'source "$HF_WORKFLOWS/katana/scripts/rr.sh"\nls' },
          evaluated_permission: "allow",
          processed_at: at(1),
        },
      ],
      none,
    );
    expect(effects.asks).toEqual([]);
    expect(effects.feed[0]).toMatchObject({
      title: "Working in Higgsfield's sandbox",
      body: 'source "$HF_WORKFLOWS/katana/scripts/rr.sh"',
    });
  });

  test("a quote's answer shows the price; a submit's answer lists its jobs", () => {
    const effects = interpretEvents(
      [
        {
          id: "u1",
          type: "agent.mcp_tool_use",
          name: "generate_video",
          input: { params: { model: "seedance_2_5", get_cost: true } },
          evaluated_permission: "ask",
          processed_at: at(1),
        },
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: text('{"cost":{"credits_exact":42}}'),
          processed_at: at(2),
        },
        {
          id: "r2",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u2",
          content: text(`{"results":[{"id":"${JOB}"}]}`),
          processed_at: at(3),
        },
      ],
      (id) => (id === "u2" ? { name: "generate_video", input: null } : null),
    );
    expect(effects.feed.find((entry) => entry.sourceId === "u1")?.data).toEqual({
      tool: "generate_video",
      quote: true,
    });
    expect(effects.feed.find((entry) => entry.sourceId === "r1")).toMatchObject({
      kind: "credit",
      title: "Higgsfield quoted 42 credits",
    });
    expect(effects.feed.find((entry) => entry.sourceId === "r2")).toMatchObject({
      kind: "note",
      data: { jobs: [JOB] },
    });
    expect(effects.toolResults.map((result) => result.tool)).toEqual([
      "generate_video",
      "generate_video",
    ]);
  });

  test("a delivery, Katana's result line, its resume line and its summary", () => {
    const effects = interpretEvents(
      [
        {
          id: "u1",
          type: "agent.mcp_tool_use",
          name: "show_result",
          input: { action: "katana_video", media_id: MEDIA },
          evaluated_permission: "allow",
          processed_at: at(1),
        },
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: text('{"ok":true}'),
          processed_at: at(2),
        },
        {
          id: "m1",
          type: "agent.message",
          content: text(
            `Delivered the remix.\nRESUME katana slug=s state=https://x/s.tgz stage=delivered jobs=\nXENO_RESULT media_id=${MEDIA} url=https://d8j0ntlcm91z4.cloudfront.net/final.mp4`,
          ),
          processed_at: at(3),
        },
        {
          id: "i1",
          type: "session.status_idle",
          stop_reason: { type: "end_turn" },
          processed_at: at(4),
        },
      ],
      none,
    );
    expect(effects.results).toEqual([
      { mediaId: MEDIA, url: null, via: "show_result" },
      { mediaId: MEDIA, url: "https://d8j0ntlcm91z4.cloudfront.net/final.mp4", via: "message" },
    ]);
    expect(effects.resumeLine).toBe(
      "RESUME katana slug=s state=https://x/s.tgz stage=delivered jobs=",
    );
    expect(effects.summary).toBe(
      "Delivered the remix.\nRESUME katana slug=s state=https://x/s.tgz stage=delivered jobs=",
    );
    expect(effects.state).toMatchObject({ kind: "idle", stop: "end_turn" });
    expect(effects.feed.find((entry) => entry.sourceId === "u1")?.data).toMatchObject({
      delivery: { media_id: MEDIA, url: null },
    });
  });

  test("a delivery counts only once its call succeeds", () => {
    const use: SessionEventLike = {
      id: "u1",
      type: "agent.mcp_tool_use",
      name: "show_result",
      input: { action: "katana_video", media_id: MEDIA },
      evaluated_permission: "allow",
      processed_at: at(1),
    };
    expect(interpretEvents([use], none).results).toEqual([]);
    const failed = interpretEvents(
      [
        use,
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: text("media not found"),
          is_error: true,
          processed_at: at(2),
        },
      ],
      none,
    );
    expect(failed.results).toEqual([]);
    // A result read in a later pass is matched to the call from an earlier one.
    const later = interpretEvents(
      [
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: text('{"ok":true}'),
          processed_at: at(2),
        },
      ],
      (id) => (id === "u1" ? { name: "show_result", input: use.input } : null),
    );
    expect(later.results).toEqual([{ mediaId: MEDIA, url: null, via: "show_result" }]);
  });

  test("file addresses are read only from Higgsfield's media answers", () => {
    const answer = text(
      JSON.stringify({ media_id: MEDIA, url: "https://attacker.example/final.mp4" }),
    );
    const sandbox = interpretEvents(
      [
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: answer,
          processed_at: at(1),
        },
      ],
      () => ({ name: "sandbox_exec", input: { command: "cat result.json" } }),
    );
    expect(sandbox.knownMedia).toEqual({});
    const medias = interpretEvents(
      [
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u1",
          content: text(
            JSON.stringify({
              medias: [{ id: MEDIA, url: "https://d8j0ntlcm91z4.cloudfront.net/final.mp4" }],
            }),
          ),
          processed_at: at(1),
        },
      ],
      () => ({ name: "show_medias", input: { media_ids: [MEDIA] } }),
    );
    expect(medias.knownMedia).toEqual({
      [MEDIA]: "https://d8j0ntlcm91z4.cloudfront.net/final.mp4",
    });
  });

  test("a stop without a video says why", () => {
    const effects = interpretEvents(
      [
        {
          id: "m1",
          type: "agent.message",
          content: text("XENO_RESULT none reason=the credit limit ran out"),
          processed_at: at(1),
        },
      ],
      none,
    );
    expect(effects.noResult).toBe("the credit limit ran out");
    const long = interpretEvents(
      [
        {
          id: "m2",
          type: "agent.message",
          content: text(`XENO_RESULT none reason=${"x".repeat(5000)}`),
          processed_at: at(2),
        },
      ],
      none,
    );
    expect(long.noResult?.length).toBeLessThanOrEqual(1000);
    expect(effects.feed).toEqual([]);
  });

  test("usage, budget pauses and sign-in failures", () => {
    const effects = interpretEvents(
      [
        {
          id: "e1",
          type: "session.error",
          error: { type: "mcp_authentication_failed_error", message: "401" },
          processed_at: at(1),
        },
        {
          id: "s1",
          type: "session.usage",
          usage: { list_cost: { amount: "1234", currency: "USD" } },
          processed_at: at(2),
        },
        {
          id: "i1",
          type: "session.status_idle",
          stop_reason: { type: "budget_reached" },
          processed_at: at(3),
        },
      ],
      none,
    );
    expect(effects.mcpAuthFailed).toBe(true);
    expect(effects.claudeCostCents).toBe(1234);
    expect(effects.state).toMatchObject({ kind: "idle", stop: "budget_reached" });
    expect(effects.feed.map((entry) => entry.kind)).toEqual(["error", "status"]);
  });

  test("a refused tool's error shows as an error", () => {
    const effects = interpretEvents(
      [
        {
          id: "r1",
          type: "agent.mcp_tool_result",
          mcp_tool_use_id: "u9",
          content: text("Rate limit reached"),
          is_error: true,
          processed_at: at(1),
        },
      ],
      () => ({ name: "generate_image", input: null }),
    );
    expect(effects.feed[0]).toMatchObject({
      kind: "error",
      title: "Generating an image didn't work",
    });
  });
});

describe("helpers", () => {
  test("deliveredBy only counts the final video", () => {
    expect(deliveredBy("show_result", { action: "some_gen", media_id: MEDIA })).toBeNull();
    expect(deliveredBy("show_katana_result", { url: "https://x.higgsfield.ai/a.mp4" })).toEqual({
      mediaId: null,
      url: "https://x.higgsfield.ai/a.mp4",
      via: "show_katana_result",
    });
    expect(
      deliveredBy("register_katana_result", { preset_id: JOB, media_id: MEDIA })?.mediaId,
    ).toBe(MEDIA);
    expect(deliveredBy("sandbox_exec", { media_id: MEDIA })).toBeNull();
  });

  test("mediaUrls pairs media IDs with their files", () => {
    expect(
      mediaUrls({
        items: [
          { id: MEDIA, url: "https://cdn.higgsfield.ai/m.mp4" },
          { id: "x", url: "https://y" },
        ],
      }),
    ).toEqual({
      [MEDIA]: "https://cdn.higgsfield.ai/m.mp4",
    });
  });

  test("isQuote and describeToolUse", () => {
    expect(isQuote("generate_image", { params: '{"get_cost":true}' })).toBe(true);
    expect(isQuote("generate_image_batch", { params: { get_cost: true } })).toBe(false);
    expect(
      describeToolUse("generate_image_batch", {
        requests: [{ params: { model: "a" } }, { params: { model: "b" } }],
      }),
    ).toEqual({
      title: "Generating 2 images",
      body: "a, b",
    });
    expect(describeToolUse("get_workflow_bundle_file", { path: "references/budget.md" })).toEqual({
      title: "Reading Katana's notes",
      body: "references/budget.md",
    });
  });
});
