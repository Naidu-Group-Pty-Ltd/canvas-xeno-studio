import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

/** The admin client, with tables that can be missing and storage that signs links. */
class RightsDb extends FakeDb {
  missing = new Set<string>();
  override storage = {
    from: () => ({
      remove: async () => ({ error: null }),
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${path}` },
        error: null,
      }),
      createSignedUploadUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/upload/${path}` },
        error: null,
      }),
    }),
  };
  override from(table: string) {
    if (!this.missing.has(table)) return super.from(table);
    const answer = {
      data: null,
      error: { code: "42P01", message: `relation "public.${table}" does not exist` },
    };
    const chain: unknown = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "then"
            ? (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve)
            : () => chain,
      },
    );
    return chain as ReturnType<FakeDb["from"]>;
  }
}

const db = new RightsDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const OUTPUT = "generated-assets";
const sunburst = db.add("model_registry", { display_name: "Marketing Studio 2.5 Sunburst" });
const generation = db.add("generations", {
  model_path: "marketing-studio/image/sunburst",
  model_registry_id: sunburst["id"],
});

/** The supplied screenshot (an upload), and a frame made from it. */
const screenshot = db.add("assets", {
  title: "Command Centre screenshot",
  asset_type: "image",
  source_type: "uploaded",
  storage_bucket: "generation-inputs",
  storage_path: "projects/p/inputs/screenshot.png",
  uploaded_by: member["id"],
  generation_id: null,
  metadata: {},
});
const frame = db.add("assets", {
  title: "F-04A",
  asset_type: "image",
  source_type: "generated",
  storage_bucket: OUTPUT,
  storage_path: "projects/p/frame.png",
  generation_id: generation["id"],
  metadata: {},
});
db.add("generation_inputs", { generation_id: generation["id"], asset_id: screenshot["id"] });
/** A plate made with no inputs: cleared under Higgsfield's terms. */
const plateRun = db.add("generations", {
  model_path: "marketing-studio/image/sunburst",
  model_registry_id: sunburst["id"],
});
const plate = db.add("assets", {
  title: "Plate",
  asset_type: "video",
  source_type: "generated",
  storage_bucket: OUTPUT,
  storage_path: "projects/p/plate.mp4",
  generation_id: plateRun["id"],
  duration_seconds: 6,
  metadata: {},
});
/** The music: a CC BY track from Openverse. */
const music = db.add("assets", {
  title: "Rain",
  asset_type: "audio",
  source_type: "uploaded",
  storage_bucket: OUTPUT,
  storage_path: "projects/p/music/rain.mp3",
  generation_id: null,
  duration_seconds: 30,
  metadata: {},
});
db.add("music_tracks", {
  asset_id: music["id"],
  title: "Rain",
  artist: "Jo",
  source: "openverse",
  provider: "Freesound",
  license: "by",
  license_version: "4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  attribution: null,
  source_url: "https://freesound.org/s/1/",
  usage_notes: null,
  rights: {},
});
/** The paced voiceover, imported through the API. */
const voice = db.add("assets", {
  title: "Paced master",
  asset_type: "audio",
  source_type: "uploaded",
  storage_bucket: "generation-inputs",
  storage_path: "projects/p/music-uploads/voice.flac",
  generation_id: null,
  duration_seconds: 8,
  metadata: {
    source: "studio_api",
    imported_voiceover: {
      statement:
        "Recorded by or for the brand, with the speaker's permission to use their voice in its content.",
    },
  },
});
db.add("voiceovers", { asset_id: voice["id"], provider: "upload", status: "completed" });

const edit = db.add("sequences", {
  title: "Reel 1",
  version: 3,
  project_id: null,
  campaign_id: null,
  timeline: {
    aspectRatio: "9:16",
    clips: [{ id: "c1", assetId: plate["id"], kind: "video", duration: 6 }],
    audio: [
      { id: "a1", assetId: voice["id"], role: "voiceover", start: 0 },
      { id: "a2", assetId: music["id"], role: "music", start: 0 },
    ],
  },
});

/** What the worker was sent, and the render's media task as it was recorded. */
const sentTasks: Record<string, unknown>[] = [];
const recordedTasks: Record<string, unknown>[] = [];
db.rpcs.set("start_sequence_render", (args) => {
  recordedTasks.push(args["p_task"] as Record<string, unknown>);
  db.add("sequence_renders", { id: args["p_render_id"], status: "queued", public_use: false });
  db.add("media_tasks", { id: args["p_task_id"], status: "submitting" });
  return { outcome: "started", render_id: args["p_render_id"] };
});

const before = {
  url: process.env["MEDIA_WORKER_URL"],
  secret: process.env["MEDIA_WORKER_SHARED_SECRET"],
};
const realFetch = globalThis.fetch;
beforeAll(async () => {
  process.env["MEDIA_WORKER_URL"] = "https://worker.test";
  process.env["MEDIA_WORKER_SHARED_SECRET"] = "0123456789abcdef0123";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://worker.test/tasks") {
      sentTasks.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ accepted: true, task_id: "t" }, { status: 202 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of [
    ["MEDIA_WORKER_URL", before.url],
    ["MEDIA_WORKER_SHARED_SECRET", before.secret],
  ] as const)
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});

async function call(name: string, body: Record<string, unknown>, scopes = ["read", "edit"]) {
  const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: member["id"],
    name: "test",
    token_prefix: tokenPrefixOf(token),
    token_hash: await tokens.hashApiToken(token),
    scopes,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  const response = await mcp.handleRestRequest(
    new Request(`https://studio.test/api/public/studio/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    name,
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: string; message: string };
    },
  };
}

type File = { assetId: string; status: string; source: string; licence: string; notes: string };

describe("files' rights", () => {
  test("are worked out until someone records them", async () => {
    const { body } = await call("get_asset_rights", {
      assetIds: [screenshot["id"], frame["id"], plate["id"], music["id"], voice["id"]],
    });
    const files = body.result!["files"] as File[];
    const of = (asset: Record<string, unknown>) =>
      files.find((file) => file.assetId === asset["id"])!;
    expect(of(screenshot)).toMatchObject({ status: "to_confirm", source: "Uploaded by Rugesh" });
    expect(of(frame)).toMatchObject({
      status: "to_confirm",
      source: "Generated with Marketing Studio 2.5 Sunburst through Higgsfield",
      notes: "Made from “Command Centre screenshot” (to confirm): its rights follow theirs.",
    });
    expect(of(plate)).toMatchObject({
      status: "cleared",
      licence: "Higgsfield's terms of service",
    });
    expect(of(music)).toMatchObject({ status: "cleared", licence: "CC BY 4.0" });
    expect(of(voice)).toMatchObject({
      status: "to_confirm",
      source: "Imported through the studio's API",
    });
    expect(body.result!["missing"]).toEqual([]);
  });

  test("a person records them, with who and when, and a music track's licence stays the library's", async () => {
    const set = await call("set_asset_rights", {
      assetId: screenshot["id"],
      status: "not_cleared",
      notes: "Real client names: layout only.",
    });
    expect(set.body.result).toMatchObject({
      status: "not_cleared",
      recorded: true,
      notes: "Real client names: layout only.",
      updatedBy: member["id"],
      confirmedBy: member["id"],
    });
    // What was made from it follows it.
    const frameRights = await call("get_asset_rights", { assetIds: [frame["id"]] });
    expect((frameRights.body.result!["files"] as File[])[0]!.notes).toContain("(not cleared)");

    const refused = await call("set_asset_rights", {
      assetId: music["id"],
      status: "cleared",
      licence: "Something else",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toContain("kept in the music library");

    const cleared = await call("set_asset_rights", { assetId: screenshot["id"], clear: true });
    expect(cleared.body.result).toMatchObject({ status: "to_confirm", recorded: false });
  });

  test("before the ledger exists, recording one says what it needs", async () => {
    db.missing.add("asset_rights");
    try {
      const answer = await call("set_asset_rights", { assetId: voice["id"], status: "cleared" });
      expect(answer.body.error?.message).toContain("migration 0027_asset_rights");
      // Reading still works: rights are worked out.
      const read = await call("get_asset_rights", { assetIds: [plate["id"]] });
      expect((read.body.result!["files"] as File[])[0]!.status).toBe("cleared");
    } finally {
      db.missing.delete("asset_rights");
    }
  });
});

describe("an edit's credits, and a render for public use", () => {
  test("lists every file it uses, the credit lines owed, and what isn't cleared", async () => {
    const { body } = await call("get_edit_credits", { sequenceId: edit["id"] });
    const files = body.result!["files"] as (File & { uses: string[] })[];
    expect(files.map((file) => [file.assetId, file.uses, file.status])).toEqual([
      [plate["id"], ["clip"], "cleared"],
      [voice["id"], ["voiceover"], "to_confirm"],
      [music["id"], ["music"], "cleared"],
    ]);
    expect(body.result!["creditLines"]).toEqual([
      "“Rain” by Jo, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://freesound.org/s/1/.",
    ]);
    expect(body.result!["notCleared"]).toEqual([voice["id"]]);
  });

  test("is held, with nothing started, until its exceptions are confirmed; its credits go with it", async () => {
    const held = await call("render_edit", {
      sequenceId: edit["id"],
      expectedVersion: 3,
      clientRequestId: "reel-1-public-1",
      publicUse: true,
    });
    expect(held.status).toBe(400);
    expect(held.body.error?.message).toBe(
      "This render is for public use, but 1 file it uses isn't cleared: “Paced master” (to confirm). Clear it in the library (the file's details), or confirm it as an exception to render anyway.",
    );
    expect(recordedTasks).toHaveLength(0);
    expect(sentTasks).toHaveLength(0);

    const started = await call("render_edit", {
      sequenceId: edit["id"],
      expectedVersion: 3,
      clientRequestId: "reel-1-public-1",
      publicUse: true,
      confirmExceptions: [voice["id"]],
    });
    expect(started.status).toBe(200);
    const payload = recordedTasks[0]!["input_payload"] as Record<string, unknown>;
    expect(payload["credit_lines"]).toHaveLength(1);
    expect((payload["credits"] as unknown[]).length).toBe(3);
    expect(payload["rights_check"]).toMatchObject({
      public_use: true,
      status: "cleared",
      exceptions: [{ asset_id: voice["id"], title: "Paced master", status: "to_confirm" }],
      confirmed_by: member["id"],
    });
    const render = db.find("sequence_renders", started.body.result!["renderId"])!;
    expect(render["public_use"]).toBe(true);
    expect(render["rights_check"]).toMatchObject({ confirmed_by: member["id"] });
    expect(sentTasks).toHaveLength(1);
  });

  test("a render not for public use isn't held, and still takes its credits", async () => {
    const started = await call("render_edit", {
      sequenceId: edit["id"],
      expectedVersion: 3,
      clientRequestId: "reel-1-draft-1",
    });
    expect(started.status).toBe(200);
    const payload = recordedTasks.at(-1)!["input_payload"] as Record<string, unknown>;
    expect(payload["rights_check"]).toEqual({
      public_use: false,
      status: "to_confirm",
      files: 3,
      not_cleared: 1,
    });
  });
});
