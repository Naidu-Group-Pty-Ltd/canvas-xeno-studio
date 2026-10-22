import { beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";
import { BRIEF } from "../storyboard/reel-1";

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

const producer = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const project = db.add("projects", { name: "Aurixa Reel 1" });
const stills = [1, 2, 3].map((n) =>
  db.add("assets", {
    asset_type: "image",
    title: `Style frame ${n}`,
    storage_bucket: "generation-inputs",
    storage_path: `frames/${n}.png`,
    metadata: {},
  }),
);

async function tokenFor(scopes: string[]) {
  const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: producer["id"],
    name: "reviews",
    token_prefix: tokenPrefixOf(token),
    token_hash: await tokens.hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  return token;
}

interface Answer {
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

function runner(token: string) {
  return async (name: string, body: unknown) => {
    const response = await mcp.handleRestRequest(
      new Request(`https://studio.test/api/public/studio/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      name,
    );
    return { status: response.status, body: (await response.json()) as Answer };
  };
}

beforeAll(async () => {
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});

describe("a storyboard from a brief, over the studio API", () => {
  test("imports Reel 1's brief as its scenes and shots, once per request", async () => {
    const run = runner(await tokenFor(["read", "edit"]));
    const request = {
      brief: BRIEF,
      projectId: project["id"],
      clientRequestId: "reel-1-brief-import",
    };
    const made = await run("import_storyboard_brief", request);
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ imported: true, scenes: 15, shots: 27 });
    const storyboardId = made.body.result!["storyboardId"] as string;
    expect(db.find("storyboards", storyboardId)).toMatchObject({
      title: "Aurixa Systems · Reel 1 · System edition",
      project_id: project["id"],
      created_by: producer["id"],
    });
    const scenes = db.rows("scenes").filter((scene) => scene["storyboard_id"] === storyboardId);
    expect(scenes).toHaveLength(15);
    const shots = db
      .rows("shots")
      .filter((shot) => scenes.some((scene) => scene["id"] === shot["scene_id"]));
    expect(shots).toHaveLength(27);
    expect((shots[0]!["spec"] as Record<string, unknown>)["cue"]).toBe("Somewhere in Australia,");

    const again = await run("import_storyboard_brief", request);
    expect(again.body.result).toMatchObject({ storyboardId, imported: false });
    expect(db.rows("storyboards")).toHaveLength(1);

    const broken = await run("import_storyboard_brief", {
      brief: { title: "Nothing to it", shots: [{ id: "a", in: 2, out: 1 }] },
      clientRequestId: "broken-brief-import",
    });
    expect(broken.status).toBe(400);
    expect(broken.body.error?.message).toBe(
      "The brief can't be made into a storyboard: Shot a ends (00:01.000) before it starts.",
    );
  });
});

describe("review gates over the studio API", () => {
  test("a script adds the gates, puts up a version, comments and approves, as the token's owner", async () => {
    const run = runner(await tokenFor(["read", "edit"]));
    const frames = await run("add_review_gate", {
      projectId: project["id"],
      name: "Style frames",
      heldUntilPrevious: false,
    });
    expect(frames.status).toBe(200);
    const animatic = await run("add_review_gate", { projectId: project["id"], name: "Animatic" });
    const framesGate = frames.body.result!["gateId"] as string;
    const animaticGate = animatic.body.result!["gateId"] as string;

    // Held until the style frames are approved.
    const early = await run("add_review_version", {
      gateId: animaticGate,
      assetIds: [stills[0]!["id"]],
      clientRequestId: "animatic-too-early",
    });
    expect(early.status).toBe(400);
    expect(early.body.error).toEqual({
      code: "INVALID_PARAMETERS",
      message: "Animatic is held until Style frames is approved.",
    });

    const put = await run("add_review_version", {
      gateId: framesGate,
      assetIds: stills.map((still) => still["id"]),
      note: "One still per block.",
      clientRequestId: "frames-v1",
    });
    expect(put.body.result).toMatchObject({ number: 1, duplicate: false });
    const versionId = put.body.result!["versionId"] as string;
    const again = await run("add_review_version", {
      gateId: framesGate,
      assetIds: stills.map((still) => still["id"]),
      clientRequestId: "frames-v1",
    });
    expect(again.body.result).toMatchObject({ versionId, duplicate: true });

    const comment = await run("comment_on_review", {
      versionId,
      body: "The rail sits too close to the window.",
      assetId: stills[1]!["id"],
      point: { x: 0.5, y: 0.17 },
    });
    expect(comment.status).toBe(200);

    const approved = await run("decide_review", {
      versionId,
      decision: "approved",
      onBehalfOf: "Aurixa (the client, in chat)",
      note: "Go ahead with the animatic.",
    });
    expect(approved.status).toBe(200);
    const recorded = db.find("review_decisions", approved.body.result!["decisionId"])!;
    expect(recorded).toMatchObject({ via: "api", decided_by: producer["id"] });

    const listed = await run("list_review_gates", { projectId: project["id"] });
    const gates = listed.body.result!["gates"] as {
      name: string;
      status: string;
      heldBy: unknown;
      versions: { decision: Record<string, unknown>; comments: number; files: unknown[] }[];
    }[];
    expect(gates.map((gate) => [gate.name, gate.status, gate.heldBy])).toEqual([
      ["Style frames", "approved", null],
      ["Animatic", "empty", null],
    ]);
    expect(gates[0]!.versions[0]).toMatchObject({
      comments: 1,
      decision: {
        decision: "approved",
        by: "Rugesh",
        onBehalfOf: "Aurixa (the client, in chat)",
        via: "api",
      },
    });
    expect(gates[0]!.versions[0]!.files).toHaveLength(3);

    const detailed = await run("list_review_gates", {
      projectId: project["id"],
      gateId: framesGate,
      includeComments: true,
    });
    const only = detailed.body.result!["gates"] as { versions: { comments: unknown[] }[] }[];
    expect(only).toHaveLength(1);
    expect(only[0]!.versions[0]!.comments[0]).toMatchObject({
      body: "The rail sits too close to the window.",
      assetId: stills[1]!["id"],
      point: { x: 0.5, y: 0.17 },
      via: "api",
    });
  });

  test("a read-only token can see the gates but not decide them", async () => {
    const run = runner(await tokenFor(["read"]));
    const listed = await run("list_review_gates", { projectId: project["id"] });
    expect(listed.status).toBe(200);
    const denied = await run("decide_review", {
      versionId: "11111111-1111-4111-8111-111111111111",
      decision: "approved",
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("NOT_AUTHORIZED");
    const nowhere = await run("list_review_gates", {
      projectId: "11111111-1111-4111-8111-111111111111",
    });
    expect(nowhere.status).toBe(400);
    expect(nowhere.body.error?.message).toBe("That project doesn't exist");
  });

  test("the operations are listed, each under its scope", async () => {
    const tools = await mcp.handleRestRequest(
      new Request("https://studio.test/api/public/studio/tools", {
        headers: { Authorization: `Bearer ${await tokenFor(["read", "edit"])}` },
      }),
      "tools",
    );
    const catalogue = (await tools.json()) as { tools: { name: string }[] };
    const names = catalogue.tools.map((entry) => entry.name);
    for (const name of [
      "import_storyboard_brief",
      "list_review_gates",
      "add_review_gate",
      "add_review_version",
      "comment_on_review",
      "decide_review",
    ])
      expect(names).toContain(name);
  });
});
