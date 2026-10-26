import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

/** The admin client, with storage that keeps what is uploaded. */
class StorageDb extends FakeDb {
  files = new Map<string, Uint8Array>();
  override storage = {
    from: (bucket: string) => ({
      upload: async (path: string, bytes: Uint8Array | string) => {
        const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
        this.files.set(`${bucket}/${path}`, new Uint8Array(data));
        return { data: { path }, error: null };
      },
      list: async (folder: string, options: { search?: string } = {}) => ({
        data: [...this.files.entries()]
          .filter(([key]) => key.startsWith(`${bucket}/${folder}/`))
          .map(([key, bytes]) => ({
            name: key.slice(`${bucket}/${folder}/`.length),
            metadata: { size: bytes.length },
          }))
          .filter((entry) => !options.search || entry.name.includes(options.search)),
        error: null,
      }),
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` },
        error: null,
      }),
      remove: async (paths: string[]) => {
        for (const path of paths) this.files.delete(`${bucket}/${path}`);
        return { error: null };
      },
    }),
  };
}

const db = new StorageDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Mcp = typeof import("../../src/lib/studio-api/mcp.server");
type Tokens = typeof import("../../src/lib/studio-api/tokens.server");
let mcp: Mcp;
let tokens: Tokens;

const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const project = db.add("projects", { name: "Aurixa Teaser", brand_voice_id: null });
const other = db.add("projects", { name: "Another brand", brand_voice_id: null });
const VOICE = {
  description: null,
  provider: "elevenlabs",
  model: "eleven_multilingual_v2",
  settings: {},
  language: "en",
  pronunciations: [],
  script_guidelines: null,
  sample_asset_id: null,
  source: {},
  is_archived: false,
  created_by: null,
};
const gabby = db.add("brand_voices", {
  ...VOICE,
  name: "Gabby",
  provider_voice_id: "voice-gabby",
  project_id: null,
  is_default: true,
});
const kept = db.add("brand_voices", {
  ...VOICE,
  name: "Kept for another brand",
  provider_voice_id: "voice-kept",
  project_id: other["id"],
  is_default: false,
});
db.add("brand_voices", {
  ...VOICE,
  name: "Archived",
  provider_voice_id: "voice-old",
  project_id: null,
  is_default: false,
  is_archived: true,
});

/** MPEG-1 Layer III frames of silence (128 kbps, 44.1 kHz): 40 of them play 1.04 s. */
function mp3(frames: number): Uint8Array {
  const length = 417;
  const bytes = new Uint8Array(frames * length);
  for (let frame = 0; frame < frames; frame += 1)
    bytes.set([0xff, 0xfb, 0x90, 0x00], frame * length);
  return bytes;
}

/** What ElevenLabs was asked to speak, and by which voice, in order. */
const spoken: { voice: string; text: string }[] = [];
const realFetch = globalThis.fetch;
const realKey = process.env["ELEVENLABS_API_KEY"];

beforeAll(async () => {
  process.env["ELEVENLABS_API_KEY"] = "test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const match = /\/v1\/text-to-speech\/([^/]+)\/with-timestamps/.exec(url);
    if (match) {
      const { text } = JSON.parse(String(init?.body)) as { text: string };
      spoken.push({ voice: decodeURIComponent(match[1]!), text });
      // Every character a tenth of a second long: "Soon." is spoken from 0 to 0.5 s.
      const characters = [...text];
      return Response.json({
        audio_base64: Buffer.from(mp3(40)).toString("base64"),
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, index) => index / 10),
          character_end_times_seconds: characters.map((_, index) => (index + 1) / 10),
        },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});
afterAll(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env["ELEVENLABS_API_KEY"];
  else process.env["ELEVENLABS_API_KEY"] = realKey;
});

async function tokenFor(scopes: string[]) {
  const token = newApiToken((bytes: Uint8Array) => crypto.getRandomValues(bytes));
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
  return token;
}

type Answer = { result?: unknown; error?: { code: string; message: string } };

async function run(token: string, name: string, body: unknown) {
  const response = await mcp.handleRestRequest(
    new Request(`https://studio.test/api/public/studio/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    name,
  );
  return { status: response.status, body: (await response.json()) as Answer };
}

describe("brand voices over the API", () => {
  test("are listed without the archived ones, and narrowed to a project's", async () => {
    const reader = await tokenFor(["read"]);
    const all = await run(reader, "list_brand_voices", {});
    expect(all.status).toBe(200);
    const names = (all.body.result as { name: string }[]).map((voice) => voice.name);
    expect(names).toEqual(["Gabby", "Kept for another brand"]);
    expect(all.body.result).toContainEqual(
      expect.objectContaining({ id: gabby["id"], isDefault: true, projectId: null }),
    );
    // Nothing a caller doesn't need: never the provider's own voice id or settings.
    expect(JSON.stringify(all.body.result)).not.toContain("voice-gabby");

    const forTeaser = await run(reader, "list_brand_voices", { projectId: project["id"] });
    expect((forTeaser.body.result as { name: string }[]).map((voice) => voice.name)).toEqual([
      "Gabby",
    ]);
  });
});

describe("a voiceover spoken over the API", () => {
  test("speaks the script in the voice named and keeps the take, its file and its words", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const made = await run(editor, "generate_voiceover", {
      script: "Soon.",
      voiceId: gabby["id"],
      projectId: project["id"],
      clientRequestId: "teaser-line-8",
    });
    expect(made.status).toBe(200);
    const take = made.body.result as Record<string, unknown>;
    expect(take).toMatchObject({
      status: "completed",
      voiceId: gabby["id"],
      voiceName: "Gabby",
      duplicate: false,
      requestId: "teaser-line-8",
    });
    expect(spoken).toEqual([{ voice: "voice-gabby", text: "Soon." }]);
    expect(take["durationSeconds"]).toBeCloseTo(1.04, 1);
    expect(take["words"]).toEqual([{ text: "Soon.", start: 0, end: 0.5 }]);

    const asset = db.find("assets", take["assetId"] as string)!;
    expect(asset).toMatchObject({ asset_type: "audio", project_id: project["id"] });
    expect(asset["metadata"]).toMatchObject({
      ai_generated_voice: true,
      brand_voice_id: gabby["id"],
    });
    expect(db.find("voiceovers", take["voiceoverId"] as string)).toMatchObject({
      status: "completed",
      project_id: project["id"],
    });
  });

  test("asked again with the same request id, returns the first take and pays for nothing", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const before = spoken.length;
    const again = await run(editor, "generate_voiceover", {
      script: "Soon.",
      voiceId: gabby["id"],
      projectId: project["id"],
      clientRequestId: "teaser-line-8",
    });
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ status: "completed", duplicate: true });
    expect(spoken.length).toBe(before);
  });

  test("speaks in the studio default when no voice is named", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const made = await run(editor, "generate_voiceover", {
      script: "Every property comes with three questions.",
      clientRequestId: "teaser-line-1",
    });
    expect(made.body.result).toMatchObject({ status: "completed", voiceName: "Gabby" });
    expect(spoken.at(-1)).toEqual({
      voice: "voice-gabby",
      text: "Every property comes with three questions.",
    });
  });

  test("refuses a voice kept for another project, and a token that can only read", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const before = spoken.length;
    const refused = await run(editor, "generate_voiceover", {
      script: "Can they afford it?",
      voiceId: kept["id"],
      projectId: project["id"],
      clientRequestId: "teaser-line-4",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toMatch(/kept for another project/);

    const reader = await tokenFor(["read"]);
    const denied = await run(reader, "generate_voiceover", {
      script: "Can they afford it?",
      clientRequestId: "teaser-line-4b",
    });
    expect(denied.status).toBe(403);
    expect(spoken.length).toBe(before);
  });
});
