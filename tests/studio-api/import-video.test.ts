import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";

/** The admin client, with storage that keeps what is sent to its signed upload addresses. */
class StorageDb extends FakeDb {
  files = new Map<string, Uint8Array>();
  override storage = {
    from: (bucket: string) => ({
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
      createSignedUploadUrl: async (path: string) => ({
        data: {
          signedUrl: `https://storage.test/upload/${bucket}/${path}?token=u`,
          token: "u",
          path,
        },
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

/** A file whose first box is ftyp with this brand, padded to a size. */
function isoMedia(brand: string, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x20], 0);
  bytes.set(new TextEncoder().encode(`ftyp${brand}`), 4);
  return bytes;
}
function webm(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 0);
  bytes.set(new TextEncoder().encode("webm"), 8);
  return bytes;
}

/** The PUT the caller makes to the address it was given. */
function put(url: string, bytes: Uint8Array) {
  const key = decodeURIComponent(url.slice("https://storage.test/upload/".length).split("?")[0]!);
  db.files.set(key, bytes);
  return key;
}

const realFetch = globalThis.fetch;
beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://storage.test/")) {
      const key = decodeURIComponent(url.slice("https://storage.test/".length).split("?")[0]!);
      const bytes = db.files.get(key);
      if (!bytes) return new Response("missing", { status: 404 });
      const range = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get("range") ?? "");
      return range
        ? new Response(bytes.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 })
        : new Response(bytes);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  tokens = await import("../../src/lib/studio-api/tokens.server");
  mcp = await import("../../src/lib/studio-api/mcp.server");
});
afterAll(() => {
  globalThis.fetch = realFetch;
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

describe("a video into the library over the API", () => {
  test("goes straight to storage, then into the library, once", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const ask = {
      title: "Reel 2 animatic",
      mimeType: "video/mp4",
      byteSize: 4096,
      width: 1080,
      height: 1920,
      durationSeconds: 99.97,
      fps: 30,
      sha256: "a".repeat(64),
      projectId: project["id"],
      clientRequestId: "animatic-1",
    };
    const offered = await run(editor, "import_video", ask);
    expect(offered.status).toBe(200);
    expect(offered.body.result).toMatchObject({ status: "upload", byteSize: 4096 });
    const upload = offered.body.result!["upload"] as {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(upload.method).toBe("PUT");
    expect(upload.headers["content-type"]).toBe("video/mp4");
    expect(upload.url).toStartWith(
      `https://storage.test/upload/generation-inputs/projects/${project["id"]}/inputs/api-video-`,
    );
    // Asked again before the bytes are there, it offers the same place.
    const again = await run(editor, "import_video", ask);
    expect((again.body.result!["upload"] as { url: string }).url).toBe(upload.url);

    const key = put(upload.url, isoMedia("isom", 4096));
    const added = await run(editor, "import_video", ask);
    expect(added.status).toBe(200);
    expect(added.body.result).toMatchObject({
      status: "imported",
      imported: true,
      mimeType: "video/mp4",
      byteSize: 4096,
      width: 1080,
      height: 1920,
      durationSeconds: 99.97,
      measuring: false,
    });
    const asset = db.find("assets", added.body.result!["assetId"])!;
    expect(asset).toMatchObject({
      asset_type: "video",
      source_type: "uploaded",
      uploaded_by: member["id"],
      project_id: project["id"],
      storage_bucket: "generation-inputs",
      storage_path: key.slice("generation-inputs/".length),
      title: "Reel 2 animatic",
    });
    expect(asset["metadata"]).toEqual({
      client_request_id: "animatic-1",
      imported_by: "import_video",
      sha256: "a".repeat(64),
      fps: 30,
    });
    const once = await run(editor, "import_video", ask);
    expect(once.body.result).toMatchObject({
      status: "imported",
      imported: false,
      assetId: added.body.result!["assetId"],
    });
    expect(db.rows("assets").filter((row) => row["title"] === "Reel 2 animatic")).toHaveLength(1);
  });

  test("a stored file that isn't what was declared is removed, and asked for again", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const ask = (clientRequestId: string, mimeType = "video/mp4") => ({
      title: "Proof",
      mimeType,
      byteSize: 2048,
      projectId: project["id"],
      clientRequestId,
    });
    const offer = async (request: Record<string, unknown>) =>
      ((await run(editor, "import_video", request)).body.result!["upload"] as { url: string }).url;

    const short = put(await offer(ask("proof-short")), isoMedia("isom", 2000));
    const cut = await run(editor, "import_video", ask("proof-short"));
    expect(cut.status).toBe(400);
    expect(cut.body.error?.message).toContain(
      "The stored file is 2000 bytes, not the 2048 declared",
    );
    expect(db.files.has(short)).toBe(false);
    expect((await run(editor, "import_video", ask("proof-short"))).body.result).toMatchObject({
      status: "upload",
    });

    const text = new Uint8Array(2048);
    text.set(new TextEncoder().encode("hello, not a film"), 0);
    put(await offer(ask("proof-text")), text);
    const notVideo = await run(editor, "import_video", ask("proof-text"));
    expect(notVideo.body.error?.message).toContain("isn't an MP4, QuickTime or WebM video");

    put(await offer(ask("proof-webm", "video/webm")), isoMedia("isom", 2048));
    const otherKind = await run(editor, "import_video", ask("proof-webm", "video/webm"));
    expect(otherKind.body.error?.message).toContain("is video/mp4, not the video/webm declared");

    // MP4 and QuickTime are one family: the file is recorded as what it is.
    put(await offer(ask("proof-mov")), isoMedia("qt  ", 2048));
    const mov = await run(editor, "import_video", ask("proof-mov"));
    expect(mov.body.result).toMatchObject({ status: "imported", mimeType: "video/quicktime" });

    put(await offer(ask("proof-webm-ok", "video/webm")), webm(2048));
    const real = await run(editor, "import_video", ask("proof-webm-ok", "video/webm"));
    expect(real.body.result).toMatchObject({ status: "imported", mimeType: "video/webm" });
  });

  test("says what it takes, before anything is stored", async () => {
    const editor = await tokenFor(["read", "edit"]);
    const big = await run(editor, "import_video", {
      title: "Master",
      mimeType: "video/mp4",
      byteSize: 199_385_354,
      clientRequestId: "master-too-large",
    });
    expect(big.status).toBe(400);
    expect(big.body.error?.message).toContain("byteSize");
    const gif = await run(editor, "import_video", {
      title: "Loop",
      mimeType: "image/gif",
      byteSize: 1000,
      clientRequestId: "loop-not-a-video",
    });
    expect(gif.status).toBe(400);
    expect(gif.body.error?.message).toContain("mimeType");
    const nowhere = await run(editor, "import_video", {
      title: "Film",
      mimeType: "video/mp4",
      byteSize: 1000,
      projectId: "11111111-1111-4111-8111-111111111111",
      clientRequestId: "film-nowhere",
    });
    expect(nowhere.body.error?.message).toContain("That project doesn't exist");
  });

  test("importing needs the edit scope", async () => {
    const reader = await tokenFor(["read"]);
    const denied = await run(reader, "import_video", {
      title: "Film",
      mimeType: "video/mp4",
      byteSize: 1000,
      clientRequestId: "film-denied",
    });
    expect(denied.status).toBe(403);
  });
});
