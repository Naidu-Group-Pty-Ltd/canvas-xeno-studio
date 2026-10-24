import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * work.py gate: a project's review gates from a session, as Reel 2 posted its Film gate. The studio here is a
 * stand-in that answers the operations the command uses the way the studio's API does (its signed upload, its
 * 50 MB limit on one video, request ids that return the first answer); the review copy is made by the real
 * ffmpeg.
 */
setDefaultTimeout(120_000);
const TOOLS = !!Bun.which("python3") && !!Bun.which("ffmpeg") && !!Bun.which("ffprobe");
const WORK_PY = join(import.meta.dir, "../../scripts/studio-work/work.py");
const PROJECT = "11111111-2222-4333-8444-555555555555";
const WORK = "29ad590c-1f57-4a84-92de-f2652b78f3a3";

type Row = Record<string, unknown>;
const gates: { id: string; name: string; status: string; versions: Row[] }[] = [];
const uploads = new Map<string, Buffer>();
const assets: Row[] = [];
const requests = new Map<string, unknown>();
let limit = 50 * 1024 * 1024;
let made = 0;
const id = () => `00000000-0000-4000-8000-${String(++made).padStart(12, "0")}`;

function answer(op: string, args: Row, base: string): unknown {
  const once = (key: unknown, make: () => unknown) => {
    if (typeof key === "string" && requests.has(key))
      return { ...(requests.get(key) as Row), duplicate: true };
    const result = make();
    if (typeof key === "string") requests.set(key, result);
    return result;
  };
  switch (op) {
    case "list_review_gates":
      return {
        gates: gates.map((gate) => ({
          ...gate,
          statusLabel: gate.status === "approved" ? "Approved" : "In review",
          versions: [...gate.versions].reverse(),
        })),
      };
    case "get_work": {
      // As the studio's API takes it: one entry at the fewest, two hundred at most.
      const entries = Number(args["entries"] ?? 20);
      if (!Number.isInteger(entries) || entries < 1 || entries > 200)
        throw Object.assign(new Error("entries: Invalid input"), { code: "INVALID_PARAMETERS" });
      if (args["workId"] !== WORK)
        throw Object.assign(new Error("No such work"), { code: "NOT_FOUND" });
      return { id: WORK, title: "Reel 2", project: { id: PROJECT, name: "Aurixa Reel 2" } };
    }
    case "add_review_gate": {
      const gate = { id: id(), name: String(args["name"]), status: "open", versions: [] };
      gates.push(gate);
      return { gateId: gate.id };
    }
    case "import_video": {
      if (Number(args["byteSize"]) > limit)
        throw Object.assign(new Error("A video is 1 byte to 50 MB"), {
          code: "INVALID_PARAMETERS",
        });
      const key = String(args["clientRequestId"]);
      const sent = uploads.get(key);
      if (!sent)
        return {
          status: "upload",
          upload: {
            url: `${base}/upload/${key}`,
            headers: { "content-type": String(args["mimeType"]) },
          },
        };
      return once(`${key}:done`, () => {
        const asset = { id: id(), title: args["title"], bytes: sent.length };
        assets.push(asset);
        return { status: "imported", assetId: asset.id, imported: true };
      });
    }
    case "import_image":
      return once(args["clientRequestId"], () => {
        const asset = {
          id: id(),
          title: args["title"],
          bytes: Buffer.from(String(args["data"]), "base64").length,
        };
        assets.push(asset);
        return { assetId: asset.id };
      });
    case "add_review_version":
      return once(args["clientRequestId"], () => {
        const gate = gates.find((g) => g.id === args["gateId"])!;
        const version = {
          id: id(),
          number: gate.versions.length + 1,
          note: args["note"],
          assetIds: args["assetIds"],
          addedAt: "2026-10-24T18:00:00Z",
        };
        gate.versions.push(version);
        return { versionId: version.id, number: version.number };
      });
    case "decide_review":
      return once(args["clientRequestId"], () => {
        const gate = gates.find((g) => g.versions.some((v) => v["id"] === args["versionId"]))!;
        gate.versions.find((v) => v["id"] === args["versionId"])!["decision"] = {
          decision: args["decision"],
          note: args["note"],
        };
        if (args["decision"] === "approved") gate.status = "approved";
        return { decisionId: id() };
      });
    default:
      throw Object.assign(new Error(`no ${op} here`), { code: "NOT_FOUND" });
  }
}

let server: ReturnType<typeof Bun.serve>;
let dir = "";
beforeAll(() => {
  if (!TOOLS) return;
  dir = mkdtempSync(join(tmpdir(), "work-gate-"));
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/upload/")) {
        uploads.set(
          decodeURIComponent(url.pathname.slice("/upload/".length)),
          Buffer.from(await request.arrayBuffer()),
        );
        return new Response("", { status: 200 });
      }
      const op = url.pathname.split("/").at(-1)!;
      try {
        return Response.json({ result: answer(op, (await request.json()) as Row, url.origin) });
      } catch (error) {
        const failure = error as Error & { code?: string };
        return Response.json(
          { error: { code: failure.code ?? "UNKNOWN", message: failure.message } },
          { status: 400 },
        );
      }
    },
  });
  // A picture, and a short noisy film (noise compresses badly, so it is large for its length).
  spawnSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x568:d=1",
    "-frames:v",
    "1",
    join(dir, "cover.png"),
  ]);
  spawnSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "nullsrc=s=640x1136:d=3,geq=random(1)*255:128:128",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=3",
    "-shortest",
    "-c:v",
    "libx264",
    "-crf",
    "8",
    "-c:a",
    "aac",
    join(dir, "film.mp4"),
  ]);
});
afterAll(() => {
  server?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The command in a process of its own; never spawnSync, which would stop this process answering it. */
async function work(args: string[]) {
  const env = { ...process.env } as Record<string, string>;
  for (const key of ["XENO_WORK_SESSION", "CLAUDE_CODE_SESSION_ID", "XENO_WORK_HOOKS"])
    delete env[key];
  const child = Bun.spawn(["python3", WORK_PY, ...args], {
    cwd: dir,
    env: {
      ...env,
      CLAUDE_PROJECT_DIR: dir,
      XENO_STUDIO_URL: `http://localhost:${server.port}`,
      XENO_STUDIO_TOKEN: "xs_test",
      XENO_WORK_TRIES: "1",
      // A review copy made outside a work is kept in the temporary folder: this test's own.
      TMPDIR: dir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code: await child.exited, stdout, stderr };
}

describe.skipIf(!TOOLS)("work.py gate", () => {
  test("a version of a picture and a video is posted to a gate made for it, once", async () => {
    writeFileSync(join(dir, "note.txt"), "The film, version 1.\n");
    const args = [
      "gate",
      "post",
      "Film",
      "--project",
      PROJECT,
      "--add",
      "--note-file",
      join(dir, "note.txt"),
      `The film=${join(dir, "film.mp4")}`,
      `The cover=${join(dir, "cover.png")}`,
    ];
    const posted = await work(args);
    expect(posted.stderr).toBe("");
    expect(posted.code).toBe(0);
    expect(posted.stdout).toContain("Film: version 1");
    expect(gates).toHaveLength(1);
    expect(gates[0]!.versions[0]).toMatchObject({ number: 1, note: "The film, version 1." });
    expect(assets.map((a) => a["title"])).toEqual(["The film", "The cover"]);
    // The film went to storage whole: under the limit, as it is.
    expect(assets[0]!["bytes"]).toBe(statSync(join(dir, "film.mp4")).size);
    const again = await work(args);
    expect(again.stdout).toContain("Film: version 1 (already posted)");
    expect(gates[0]!.versions).toHaveLength(1);
  });

  test("a video over the library's one upload goes as a review copy that fits", async () => {
    const size = statSync(join(dir, "film.mp4")).size;
    limit = Math.floor(size / 3);
    const posted = await work([
      "gate",
      "post",
      "Film",
      "--project",
      PROJECT,
      "--note",
      "Version 2",
      "--max-bytes",
      String(limit),
      `The film=${join(dir, "film.mp4")}`,
    ]);
    expect(posted.code).toBe(0);
    expect(posted.stdout).toContain("making a review copy");
    expect(posted.stdout).toContain("Film: version 2");
    const sent = assets.at(-1)!;
    expect(Number(sent["bytes"])).toBeLessThanOrEqual(limit);
    // Still the whole film, with its sound.
    const copy = [...uploads.values()].at(-1)!;
    writeFileSync(join(dir, "sent.mp4"), copy);
    const probed = JSON.parse(
      spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type",
          "-of",
          "json",
          join(dir, "sent.mp4"),
        ],
        { encoding: "utf8" },
      ).stdout,
    ) as { format: { duration: string }; streams: { codec_type: string }[] };
    expect(Math.abs(Number(probed.format.duration) - 3)).toBeLessThan(0.1);
    expect(probed.streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
    limit = 50 * 1024 * 1024;
  });

  test("a decision on the latest version, and the gates listed with what each holds", async () => {
    const decided = await work([
      "gate",
      "decide",
      "Film",
      "approved",
      "--project",
      PROJECT,
      "--note",
      "Approved by the client.",
    ]);
    expect(decided.code).toBe(0);
    expect(decided.stdout).toBe("Film v2: approved\n");
    expect(gates[0]!.versions[1]!["decision"]).toEqual({
      decision: "approved",
      note: "Approved by the client.",
    });
    const listed = await work(["gate", "list", "--project", PROJECT]);
    expect(listed.stdout).toContain("Film · Approved");
    expect(listed.stdout).toMatch(/v2 .* · approved/);
    expect(listed.stdout).toMatch(/v1 .* · in review/);
    const missing = await work([
      "gate",
      "post",
      "Proof",
      "--project",
      PROJECT,
      `x=${join(dir, "cover.png")}`,
    ]);
    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toContain(
      "The project has no gate called 'Proof': Film (--add makes it)",
    );
    expect(readFileSync(join(dir, "note.txt"), "utf8")).toBe("The film, version 1.\n");
  });

  test("on a checkout attached to a work, the gates are its project's, without naming it", async () => {
    // The work as this machine keeps it once taken up (start or resume).
    const kept = join(dir, ".xeno-work", WORK);
    mkdirSync(kept, { recursive: true });
    writeFileSync(
      join(kept, "work.json"),
      JSON.stringify({ workId: WORK, title: "Reel 2", attached: true }),
    );
    try {
      const listed = await work(["gate", "list"]);
      expect(listed.stderr).toBe("");
      expect(listed.code).toBe(0);
      expect(listed.stdout).toContain("Film · Approved");
    } finally {
      rmSync(join(dir, ".xeno-work"), { recursive: true, force: true });
    }
  });
});
