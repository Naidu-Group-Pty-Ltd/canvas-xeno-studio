import { describe, expect, test } from "bun:test";
import {
  callLabel,
  classifyGuardedCall,
  decideSpend,
  formatCredits,
  freeBillingFlag,
  quoteCredits,
  quoteParams,
  readParams,
  requestCount,
  submittedJobIds,
} from "../../src/lib/katana/guard";

const JOB_A = "11111111-1111-4111-8111-111111111111";
const JOB_B = "22222222-2222-4222-8222-222222222222";

describe("classifyGuardedCall", () => {
  test("a price check is a quote", () => {
    const call = classifyGuardedCall("generate_video", {
      params: { model: "seedance_2_5", get_cost: true },
    });
    expect(call).toEqual({ kind: "quote", tool: "generate_video", model: "seedance_2_5" });
  });

  test("a single submit, with params given as a JSON string", () => {
    const call = classifyGuardedCall("generate_image", {
      params: JSON.stringify({ model: "soul_cinematic", prompt: "x" }),
    });
    expect(call.kind).toBe("submit");
    if (call.kind !== "submit") return;
    expect(call.quoteTool).toBe("generate_image");
    expect(call.items).toEqual([{ index: 0, params: { model: "soul_cinematic", prompt: "x" } }]);
  });

  test("a batch keeps each request's index", () => {
    const call = classifyGuardedCall("generate_video_batch", {
      requests: [
        { index: 3, params: { model: "seedance_2_5", duration: 5 } },
        { index: 7, params: { model: "seedance_2_5", duration: 8 } },
      ],
    });
    expect(call.kind).toBe("submit");
    if (call.kind !== "submit") return;
    expect(call.quoteTool).toBe("generate_video");
    expect(call.items.map((item) => item.index)).toEqual([3, 7]);
    expect(callLabel(call)).toBe("2 videos");
  });

  test("a batch carrying a price check is refused", () => {
    const call = classifyGuardedCall("generate_image_batch", {
      requests: [{ index: 0, params: { model: "m", get_cost: true } }],
    });
    expect(call.kind).toBe("invalid");
  });

  test("unreadable params and unknown tools are refused", () => {
    expect(classifyGuardedCall("generate_video", { params: "{nope" }).kind).toBe("invalid");
    expect(classifyGuardedCall("generate_video_batch", { requests: [] }).kind).toBe("invalid");
    expect(classifyGuardedCall("execute_preset", {}).kind).toBe("invalid");
  });

  test("background removal is estimated; a preset session notes free runs", () => {
    expect(
      classifyGuardedCall("remove_background", {
        params: { media_id: JOB_A, media_type: "video" },
      }),
    ).toEqual({
      kind: "estimate",
      tool: "remove_background",
      jobs: 1,
    });
    expect(
      classifyGuardedCall("get_katana_config", {
        preset: "/katana/power-suit",
        free_generation: true,
      }),
    ).toEqual({
      kind: "preset_session",
      tool: "get_katana_config",
      free: true,
      preset: "/katana/power-suit",
    });
  });
});

describe("pricing", () => {
  test("quoteCredits reads Higgsfield's exact figure first", () => {
    expect(quoteCredits({ cost: { credits_exact: 12.75, credits: 13 } })).toBe(12.75);
    expect(quoteCredits({ result: { cost: { credits_exact: "4.5" } } })).toBe(4.5);
    expect(quoteCredits({ cost: { credits: 9 } })).toBe(9);
    expect(quoteCredits({ credits: 3 })).toBe(3);
  });

  test("a missing price is unknown, never zero; a bare cost number doesn't count", () => {
    expect(quoteCredits({ unlim_choice: { question: "?" } })).toBeNull();
    expect(quoteCredits({ cost: 0.5 })).toBeNull();
    expect(quoteCredits(null)).toBeNull();
    expect(quoteCredits({ cost: { credits_exact: -1 } })).toBeNull();
  });

  test("quoteParams adds the price-check flag without changing the rest", () => {
    const params = { model: "seedance_2_5", duration: 5 };
    expect(quoteParams(params)).toEqual({ model: "seedance_2_5", duration: 5, get_cost: true });
    expect(params).toEqual({ model: "seedance_2_5", duration: 5 });
  });

  test("free billing flags and counts", () => {
    expect(freeBillingFlag({ use_unlim: true })).toBe("use_unlim");
    expect(freeBillingFlag({ use_free_gens: true })).toBe("use_free_gens");
    expect(freeBillingFlag({ use_unlim: false })).toBeNull();
    expect(requestCount({})).toBe(1);
    expect(requestCount({ count: 3 })).toBe(3);
    expect(requestCount({ count: "bad" })).toBe(1);
  });

  test("readParams", () => {
    expect(readParams({ a: 1 })).toEqual({ a: 1 });
    expect(readParams('{"a":1}')).toEqual({ a: 1 });
    expect(readParams("[1]")).toBeNull();
    expect(readParams(5)).toBeNull();
  });
});

describe("decideSpend", () => {
  test("allows jobs that fit in what's left", () => {
    const decision = decideSpend({
      items: [{ index: 0, model: "seedance_2_5", credits: 40 }],
      reserved: 100,
      limit: 300,
      label: "a video (seedance_2_5)",
    });
    expect(decision.allow).toBe(true);
    expect(decision.credits).toBe(40);
    expect(decision.reason).toContain("160 left");
  });

  test("allows a call that uses exactly what's left", () => {
    expect(
      decideSpend({
        items: [{ index: 0, model: null, credits: 50 }],
        reserved: 250,
        limit: 300,
        label: "x",
      }).allow,
    ).toBe(true);
  });

  test("turns down a call over the limit, saying what's left", () => {
    const decision = decideSpend({
      items: [
        { index: 0, model: "m", credits: 120 },
        { index: 1, model: "m", credits: 120 },
      ],
      reserved: 100,
      limit: 300,
      label: "2 videos",
    });
    expect(decision.allow).toBe(false);
    expect(decision.credits).toBe(240);
    expect(decision.reason).toContain("would cost 240 credits");
    expect(decision.reason).toContain("only 200");
    expect(decision.reason).toContain("nothing was made or charged");
  });

  test("turns down a call whose price is unknown", () => {
    const decision = decideSpend({
      items: [
        { index: 0, model: "m", credits: 5 },
        { index: 4, model: "seedance_2_5", credits: null },
      ],
      reserved: 0,
      limit: 1000,
      label: "2 videos",
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain("request 4");
  });

  test("marks estimates", () => {
    const decision = decideSpend({
      items: [{ index: 0, model: null, credits: 2 }],
      reserved: 0,
      limit: 10,
      priced: false,
      label: "a background removal",
    });
    expect(decision.priced).toBe(false);
    expect(decision.reason).toContain("estimated");
  });

  test("formatCredits", () => {
    expect(formatCredits(12)).toBe("12");
    expect(formatCredits(12.5)).toBe("12.5");
    expect(formatCredits(1.146)).toBe("1.15");
  });
});

describe("submittedJobIds", () => {
  test("reads single and batch answers", () => {
    expect(submittedJobIds({ results: [{ id: JOB_A, status: "pending" }] })).toEqual([JOB_A]);
    expect(
      submittedJobIds({
        jobs: [
          { index: 0, job_id: JOB_A },
          { index: 1, job_id: JOB_B },
        ],
      }),
    ).toEqual([JOB_A, JOB_B]);
  });

  test("ignores entries that aren't job IDs", () => {
    expect(
      submittedJobIds({
        results: [{ id: "abc" }],
        jobs: [{ index: 2, error: "Rate limit reached: max 6 concurrent job(s)" }],
      }),
    ).toEqual([]);
  });
});
