import { describe, expect, test } from "bun:test";
import { handleBrandImportRequest } from "../../src/lib/brand/import-stream.server";
import { brandImportRequest } from "../../src/lib/brand/import-request";
import { decodeEventStream, encodeStreamEvent, KEEP_ALIVE } from "../../src/lib/event-stream";

describe("the brand import endpoint", () => {
  test("refuses a request without a session, in words", async () => {
    const response = await handleBrandImportRequest(
      new Request("https://studio.example/api/public/brand-import", {
        method: "POST",
        body: JSON.stringify({ action: "website", url: "aurixasystems.com.au" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in again to import a brand" });
  });

  test("takes a website or a document, nothing else", () => {
    expect(
      brandImportRequest.safeParse({ action: "website", url: "aurixasystems.com.au" }).success,
    ).toBe(true);
    expect(
      brandImportRequest.safeParse({
        action: "document",
        importId: "7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60",
        text: "Guidelines",
        pageCount: 3,
        pictures: [],
      }).success,
    ).toBe(true);
    expect(brandImportRequest.safeParse({ action: "website", url: "x" }).success).toBe(false);
    expect(brandImportRequest.safeParse({ action: "delete", importId: "x" }).success).toBe(false);
  });

  test("takes up to six repositories, and a GitHub token only shaped like one", () => {
    const repos = brandImportRequest.parse({
      action: "repos",
      repos: ["Naidu-Group-Pty-Ltd/aurixa-systems", "github.com/acme/app/tree/main/apps/web"],
    });
    expect(repos).toMatchObject({ action: "repos", token: null });
    expect(
      brandImportRequest.safeParse({
        action: "repos",
        repos: ["acme/site"],
        token: `github_pat_${"A1b2".repeat(20)}`,
      }).success,
    ).toBe(true);
    expect(
      brandImportRequest.safeParse({ action: "repos", repos: ["acme/site"], token: "hunter2" })
        .success,
    ).toBe(false);
    expect(brandImportRequest.safeParse({ action: "repos", repos: [] }).success).toBe(false);
    expect(
      brandImportRequest.safeParse({
        action: "repos",
        repos: Array.from({ length: 7 }, (_, index) => `acme/site-${index}`),
      }).success,
    ).toBe(false);
  });

  test("its events survive the wire, keep-alives and splits included", () => {
    const wire =
      encodeStreamEvent({ type: "import", importId: "i" }) +
      KEEP_ALIVE +
      encodeStreamEvent({ type: "done", importId: "i", ok: true, error: null });
    const first = decodeEventStream(wire.slice(0, 20));
    const second = decodeEventStream(first.rest + wire.slice(20));
    expect([...first.events, ...second.events]).toEqual([
      { type: "import", importId: "i" },
      { type: "done", importId: "i", ok: true, error: null },
    ]);
  });
});
