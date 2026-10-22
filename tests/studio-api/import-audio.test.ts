import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { flacFile } from "../music/flac";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

/** The admin client, with storage that keeps what is uploaded (the music library reads it back by range). */
class StorageDb extends FakeDb {
  files = new Map<string, Uint8Array>();
  override storage = {
    from: (bucket: string) => ({
      upload: async (path: string, bytes: Uint8Array) => {
        const key = `${bucket}/${path}`;
        if (this.files.has(key))
          return { data: null, error: { message: "The resource already exists" } };
        this.files.set(key, new Uint8Array(bytes));
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
const other = db.add("profiles", { is_active: true, role: "member", full_name: "Someone else" });
const edit = db.add("sequences", { title: "Reel 1", project_id: null, campaign_id: null });

/** A 16-bit mono PCM WAV of a tone. */
function wavFile(seconds: number, rate = 48_000): Uint8Array {
  const samples = Math.round(seconds * rate);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1)
    view.setInt16(
      44 + index * 2,
      Math.round(8000 * Math.sin((2 * Math.PI * 440 * index) / rate)),
      true,
    );
  return bytes;
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Files served at public addresses, and storage's signed links, read by range as storage serves them. */
const published = new Map<string, Uint8Array>();
const realFetch = globalThis.fetch;
beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const type = new URL(url).searchParams.get("type");
      return Response.json({
        Status: 0,
        Answer: type === "A" ? [{ type: 1, data: "93.184.216.34" }] : [],
      });
    }
    if (url.startsWith("https://storage.test/")) {
      const key = decodeURIComponent(url.slice("https://storage.test/".length).split("?")[0]!);
      const bytes = db.files.get(key);
      if (!bytes) return new Response("missing", { status: 404 });
      const range = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get("range") ?? "");
      return range
        ? new Response(bytes.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 })
        : new Response(bytes);
    }
    const file = published.get(url);
    if (file)
      return new Response(file, {
        headers: { "content-type": "audio/flac", "content-length": String(file.length) },
      });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function tokenFor(userId: unknown, scopes: string[]) {
  const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: userId,
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

interface Imported {
  assetId: string;
  imported: boolean;
  use: string;
  trackId: string | null;
  voiceoverId: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
}

async function importAudio(token: string, body: Record<string, unknown>) {
  const response = await mcp.handleRestRequest(
    new Request("https://studio.test/api/public/studio/import_audio", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    "import_audio",
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Imported;
      error?: { code: string; message: string };
    },
  };
}

const RIGHTS = { licensor: "The client", scopes: ["organic_social", "paid_social"] };

describe("import_audio", () => {
  test("music goes into the music library as the app's licensed upload, its licence confirmed by the token's owner", async () => {
    const token = await tokenFor(member["id"], ["read", "edit"]);
    const music = flacFile({ rate: 44_100, channels: 2, bits: 16, samples: 44_100 * 12 });
    const { status, body } = await importAudio(token, {
      title: "National Treasures (Instrumental)",
      data: base64(music),
      use: "music",
      licence: "licensed",
      rights: { ...RIGHTS, notes: "The client confirms public use before release" },
      confirmed: true,
      clientRequestId: "reel-1-music-1",
    });
    expect(status).toBe(200);
    const result = body.result!;
    expect(result).toMatchObject({ imported: true, use: "music", mimeType: "audio/flac" });
    expect(result.durationSeconds).toBe(12);

    const track = db.find("music_tracks", result.trackId)!;
    expect(track).toMatchObject({
      asset_id: result.assetId,
      source: "upload",
      license: "licensed",
      kind: "music",
      status: "ready",
      created_by: member["id"],
    });
    expect(track["rights"]).toMatchObject({
      licensor: "The client",
      scopes: ["organic_social", "paid_social"],
      territories: "Worldwide",
      notes: "The client confirms public use before release",
      confirmedBy: member["id"],
    });
    const asset = db.find("assets", result.assetId)!;
    expect(asset).toMatchObject({
      asset_type: "audio",
      source_type: "uploaded",
      mime_type: "audio/flac",
      deleted_at: null,
      storage_bucket: "generation-inputs",
    });
    expect(asset["metadata"]).toMatchObject({
      source: "studio_api",
      client_request_id: "reel-1-music-1",
    });
    // The upload the app's form would have staged, now registered.
    const upload = db.find(
      "music_uploads",
      (asset["metadata"] as { music_upload_id: string }).music_upload_id,
    )!;
    expect(upload["registered_at"]).not.toBeNull();
    expect(upload["user_id"]).toBe(member["id"]);
    expect(db.files.has(`generation-inputs/${String(asset["storage_path"])}`)).toBe(true);
  });

  test("the same clientRequestId returns the first import, and adds nothing", async () => {
    const token = await tokenFor(member["id"], ["edit"]);
    const before = {
      assets: db.rows("assets").length,
      tracks: db.rows("music_tracks").length,
      uploads: db.rows("music_uploads").length,
      files: db.files.size,
    };
    const again = await importAudio(token, {
      title: "National Treasures (Instrumental)",
      data: base64(flacFile({ rate: 44_100, channels: 2, bits: 16, samples: 44_100 * 12 })),
      use: "music",
      licence: "licensed",
      rights: RIGHTS,
      confirmed: true,
      clientRequestId: "reel-1-music-1",
    });
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ imported: false, use: "music", durationSeconds: 12 });
    expect({
      assets: db.rows("assets").length,
      tracks: db.rows("music_tracks").length,
      uploads: db.rows("music_uploads").length,
      files: db.files.size,
    }).toEqual(before);
    // Another person's request with the same id is their own import.
    const theirs = await importAudio(await tokenFor(other["id"], ["edit"]), {
      title: "Sting",
      data: base64(wavFile(1)),
      use: "sound_effect",
      licence: "owned",
      confirmed: true,
      clientRequestId: "reel-1-music-1",
    });
    expect(theirs.body.result).toMatchObject({ imported: true, use: "sound_effect" });
    expect(db.find("music_tracks", theirs.body.result!.trackId)!["license"]).toBe("owned");
  });

  test("a voiceover becomes a take in its edit's Voice tab, with the consent statement on its file", async () => {
    const token = await tokenFor(member["id"], ["edit"]);
    const { status, body } = await importAudio(token, {
      title: "Paced master",
      data: base64(wavFile(3.5)),
      use: "voiceover",
      sequenceId: edit["id"],
      transcript: "Fourteen Wattle Grove.",
      confirmed: true,
      clientRequestId: "reel-1-voice-paced",
    });
    expect(status).toBe(200);
    const result = body.result!;
    expect(result).toMatchObject({ imported: true, use: "voiceover", mimeType: "audio/wav" });
    expect(result.durationSeconds).toBe(3.5);
    const take = db.find("voiceovers", result.voiceoverId)!;
    expect(take).toMatchObject({
      provider: "upload",
      status: "completed",
      sequence_id: edit["id"],
      asset_id: result.assetId,
      spoken_text: "Fourteen Wattle Grove.",
      created_by: member["id"],
    });
    const metadata = db.find("assets", result.assetId)!["metadata"] as Record<string, unknown>;
    expect(metadata["imported_voiceover"]).toMatchObject({
      voiceoverId: take["id"],
      statement:
        "Recorded by or for the brand, with the speaker's permission to use their voice in its content.",
      confirmedBy: member["id"],
    });
    expect(metadata["source"]).toBe("studio_api");

    const again = await importAudio(token, {
      title: "Paced master",
      data: base64(wavFile(3.5)),
      use: "voiceover",
      sequenceId: edit["id"],
      confirmed: true,
      clientRequestId: "reel-1-voice-paced",
    });
    expect(again.body.result).toMatchObject({
      imported: false,
      voiceoverId: take["id"],
      assetId: result.assetId,
    });
  });

  test("reads a public https address, and keeps where it came from", async () => {
    const token = await tokenFor(member["id"], ["edit"]);
    published.set(
      "https://files.example.com/sting.flac",
      flacFile({ rate: 48_000, channels: 1, bits: 24, samples: 72_000 }),
    );
    const { status, body } = await importAudio(token, {
      title: "Sting",
      url: "https://files.example.com/sting.flac",
      use: "sound_effect",
      licence: "owned",
      confirmed: true,
      clientRequestId: "reel-1-sting",
    });
    expect(status).toBe(200);
    expect(body.result).toMatchObject({
      imported: true,
      use: "sound_effect",
      durationSeconds: 1.5,
    });
    expect(db.find("assets", body.result!.assetId)!["metadata"]).toMatchObject({
      origin: "https://files.example.com/sting.flac",
    });
  });

  test("refuses what isn't audio, a licence without its terms, and a request that's unclear", async () => {
    const token = await tokenFor(member["id"], ["edit"]);
    const assets = db.rows("assets").length;
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(200).fill(0),
    ]);
    const cases: [Record<string, unknown>, string][] = [
      [{ data: base64(png), use: "music", licence: "owned" }, "WAV, MP3, M4A (AAC) or FLAC"],
      [{ data: base64(wavFile(1)), use: "music", licence: "licensed" }, "licensor"],
      [{ data: base64(wavFile(1)), use: "music" }, 'licence "licensed"'],
      [{ data: base64(wavFile(1)), use: "voiceover" }, "sequenceId"],
      [
        {
          data: base64(wavFile(1)),
          url: "https://files.example.com/a.wav",
          use: "music",
          licence: "owned",
        },
        "not both",
      ],
      [{ url: "http://files.example.com/a.wav", use: "music", licence: "owned" }, "https"],
      [
        { url: "https://files.example.com/missing.wav", use: "music", licence: "owned" },
        "couldn't be read",
      ],
    ];
    for (const [body, message] of cases) {
      const answer = await importAudio(token, {
        title: "Not imported",
        confirmed: true,
        clientRequestId: crypto.randomUUID(),
        ...body,
      });
      expect(answer.status).toBe(400);
      expect(answer.body.error?.message).toContain(message);
    }
    // Without the confirmation nothing is taken.
    const unconfirmed = await importAudio(token, {
      title: "Unconfirmed",
      data: base64(wavFile(1)),
      use: "music",
      licence: "owned",
      clientRequestId: crypto.randomUUID(),
    });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error?.message).toContain("confirmed");
    expect(db.rows("assets").length).toBe(assets);
  });

  test("needs a token that may edit", async () => {
    const reader = await tokenFor(member["id"], ["read"]);
    const answer = await importAudio(reader, {
      title: "No",
      data: base64(wavFile(1)),
      use: "music",
      licence: "owned",
      confirmed: true,
      clientRequestId: crypto.randomUUID(),
    });
    expect(answer.status).toBe(403);
  });
});
