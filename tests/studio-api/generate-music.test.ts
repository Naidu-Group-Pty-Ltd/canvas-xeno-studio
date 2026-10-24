import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

/** The admin client, with storage that keeps what is uploaded. */
class StorageDb extends FakeDb {
  files = new Map<string, Uint8Array>();
  override storage = {
    from: (bucket: string) => ({
      upload: async (path: string, bytes: Uint8Array) => {
        this.files.set(`${bucket}/${path}`, new Uint8Array(bytes));
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
const project = db.add("projects", { name: "Aurixa Reel 2" });

/** MPEG-1 Layer III frames of silence (128 kbps, 44.1 kHz): 200 of them play 5.22 s. */
function mp3(frames: number): Uint8Array {
  const length = 417;
  const bytes = new Uint8Array(frames * length);
  for (let frame = 0; frame < frames; frame += 1)
    bytes.set([0xff, 0xfb, 0x90, 0x00], frame * length);
  return bytes;
}

/** What Eleven Music was asked for, in order. */
const asked: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;
const realKey = process.env["ELEVENLABS_API_KEY"];

beforeAll(async () => {
  process.env["ELEVENLABS_API_KEY"] = "test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.elevenlabs.io/v1/music?")) {
      asked.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(mp3(200), {
        headers: { "content-type": "audio/mpeg", "song-id": `song-${asked.length}` },
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

type Answer = { result?: Record<string, unknown>; error?: { code: string; message: string } };

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

const STYLES = ["modern cinematic corporate", "120 BPM", "4/4", "warm analogue pads"];
// An intro of 11 bars at 120 BPM, and the drop on the film's cut.
const PLAN = {
  chunks: [
    { text: "[Intro]", durationMs: 22_000, positiveStyles: STYLES, negativeStyles: ["vocals"] },
    { text: "[Drop]", durationMs: 18_000, positiveStyles: ["confident groove", ...STYLES] },
  ],
};

describe("music made over the API", () => {
  test("from a prompt, as the Music page makes it", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const made = await run(editor, "generate_music", {
      title: "Reel 2 bed",
      prompt: "Instrumental, modern cinematic corporate at 120 BPM.",
      seconds: 30,
      projectId: project["id"],
      clientRequestId: "music-prompt-1",
    });
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({
      status: "ready",
      title: "Reel 2 bed",
      model: "music_v2_5",
      songId: "song-1",
      duplicate: false,
    });
    expect(made.body.result!["durationSeconds"]).toBeCloseTo((200 * 1152) / 44100, 3);
    expect(asked.at(-1)).toEqual({
      prompt: "Instrumental, modern cinematic corporate at 120 BPM.",
      music_length_ms: 30_000,
      model_id: "music_v2_5",
      force_instrumental: true,
    });
    const asset = db.find("assets", made.body.result!["assetId"])!;
    expect(asset).toMatchObject({
      asset_type: "audio",
      source_type: "generated",
      project_id: project["id"],
    });
    expect(asset["metadata"]).toMatchObject({ ai_generated_music: true, provider: "elevenlabs" });
    expect("composition_plan" in (asset["metadata"] as object)).toBe(false);
    const track = db.find("music_tracks", made.body.result!["trackId"])!;
    expect(track).toMatchObject({
      license: "ai_generated",
      source: "elevenlabs",
      duration_seconds: expect.any(Number),
    });
  });

  test("from a composition plan, which fixes where its parts fall, with a seed", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const made = await run(editor, "generate_music", {
      title: "Reel 2 score, take 1",
      prompt: "The score for Reel 2: an intro, then the drop on the brand's arrival.",
      plan: PLAN,
      seed: 42,
      projectId: project["id"],
      clientRequestId: "music-plan-1",
    });
    expect(made.status).toBe(200);
    expect(made.body.result).toMatchObject({ status: "ready", songId: `song-${asked.length}` });
    // The plan goes in ElevenLabs' own names, with no prompt, length or vocals switch beside it.
    expect(asked.at(-1)).toEqual({
      composition_plan: {
        chunks: [
          {
            text: "[Intro]",
            duration_ms: 22_000,
            positive_styles: STYLES,
            negative_styles: ["vocals"],
          },
          { text: "[Drop]", duration_ms: 18_000, positive_styles: ["confident groove", ...STYLES] },
        ],
      },
      model_id: "music_v2_5",
      seed: 42,
    });
    const track = db.find("music_tracks", made.body.result!["trackId"])!;
    expect(String(track["prompt"])).toStartWith(
      "The score for Reel 2: an intro, then the drop on the brand's arrival.\n\nComposition plan ",
    );
    expect(String(track["prompt"])).toEndWith(", seed 42: Intro 0 s–22 s · Drop 22 s–40 s");
    const asset = db.find("assets", made.body.result!["assetId"])!;
    expect(asset["metadata"]).toMatchObject({
      composition_plan: (asked.at(-1) as { composition_plan: unknown }).composition_plan,
      seed: 42,
    });
  });

  test("the same request returns its track, and nothing is made or paid for twice", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const before = asked.length;
    const first = db.rows("music_tracks").find((row) => row["dedupe_key"] === "music-plan-1")!;
    const again = await run(editor, "generate_music", {
      title: "Reel 2 score, take 1",
      prompt: "The score for Reel 2: an intro, then the drop on the brand's arrival.",
      plan: PLAN,
      seed: 42,
      projectId: project["id"],
      clientRequestId: "music-plan-1",
    });
    expect(again.body.result).toMatchObject({ trackId: first["id"], duplicate: true });
    expect(asked.length).toBe(before);
  });

  test("says what a prompt or a plan needs, before anything is asked for", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const before = asked.length;
    const prompt = "Instrumental, modern cinematic corporate at 120 BPM.";
    const noLength = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      clientRequestId: "music-bad-1",
    });
    expect(noLength.status).toBe(400);
    expect(noLength.body.error?.message).toContain("Give the music's length");
    const both = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      plan: PLAN,
      seconds: 40,
      clientRequestId: "music-bad-2",
    });
    expect(both.body.error?.message).toContain("leave seconds out");
    const seeded = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      seconds: 30,
      seed: 3,
      clientRequestId: "music-bad-3",
    });
    expect(seeded.body.error?.message).toContain("A seed goes with a plan only");
    const retired = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      plan: PLAN,
      model: "music_v1",
      clientRequestId: "music-bad-4",
    });
    expect(retired.body.error?.message).toContain("Eleven Music v2 or v2.5");
    const tooShort = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      plan: { chunks: [{ text: "[Hit]", durationMs: 1_000, positiveStyles: STYLES }] },
      clientRequestId: "music-bad-5",
    });
    expect(tooShort.status).toBe(400);
    const nowhere = await run(editor, "generate_music", {
      title: "Bed",
      prompt,
      seconds: 30,
      projectId: "11111111-1111-4111-8111-111111111111",
      clientRequestId: "music-bad-6",
    });
    expect(nowhere.body.error?.message).toContain("That project doesn't exist");
    expect(asked.length).toBe(before);
  });

  test("making music needs the edit scope", async () => {
    const reader = await tokenFor(["read"]);
    const denied = await run(reader, "generate_music", {
      title: "Bed",
      prompt: "Instrumental, modern cinematic corporate at 120 BPM.",
      seconds: 30,
      clientRequestId: "music-denied-1",
    });
    expect(denied.status).toBe(403);
  });
});
