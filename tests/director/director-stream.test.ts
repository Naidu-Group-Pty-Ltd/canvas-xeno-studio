import { describe, expect, test } from "bun:test";
import { handleBrandDnaRequest } from "../../src/lib/brand/dna-stream.server";
import { directorRequest } from "../../src/lib/director-request";
import { handleDirectorRequest } from "../../src/lib/director-stream.server";
import { decodeEventStream } from "../../src/lib/event-stream";
import { eventStreamResponse } from "../../src/lib/event-stream.server";

const post = (path: string, body: unknown, token?: string) =>
  new Request(`https://studio.example${path}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

describe("the Director endpoint", () => {
  test("refuses a request without a session, in words", async () => {
    const response = await handleDirectorRequest(
      post("/api/public/director-plan", { action: "plan", brief: "A 30-second ad" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in again to plan with the Director" });
  });

  test("takes a plan or a revision, nothing else", () => {
    const plan = {
      action: "plan",
      brief: "A 30-second LinkedIn ad",
      brandKitId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
      formula: { id: "saas-demo-ad", seconds: 30, channel: "linkedin" },
    };
    expect(directorRequest.safeParse(plan).success).toBe(true);
    expect(directorRequest.safeParse({ ...plan, formula: null }).success).toBe(true);
    expect(
      directorRequest.safeParse({ ...plan, formula: { id: "saas-demo-ad", channel: "myspace" } })
        .success,
    ).toBe(false);
    expect(directorRequest.safeParse({ ...plan, brief: "Hi" }).success).toBe(false);
    expect(
      directorRequest.safeParse({
        action: "revise",
        planId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
        instruction: "Shorter hook",
      }).success,
    ).toBe(true);
    expect(directorRequest.safeParse({ action: "delete", planId: "x" }).success).toBe(false);
  });
});

describe("the brand DNA endpoint", () => {
  test("refuses a request without a session, in words", async () => {
    const response = await handleBrandDnaRequest(
      post("/api/public/brand-dna", { name: "Aurixa", website: null }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in again to read a brand's DNA" });
  });
});

describe("a streamed answer", () => {
  test("carries the work's events, then closes", async () => {
    const response = eventStreamResponse<{ type: string; n?: number }>(async (send) => {
      send({ type: "plan", n: 1 });
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const { events, rest } = decodeEventStream(await response.text());
    expect(events).toEqual([{ type: "plan", n: 1 }]);
    expect(rest).toBe("");
  });

  test("closes even when the work fails", async () => {
    const response = eventStreamResponse(async () => {
      throw new Error("lost");
    });
    // The stream ends (empty) rather than hanging; the work sends its own errors.
    expect(await response.text().catch(() => "")).toBe("");
  });
});
