import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newApiToken, tokenPrefixOf } from "../../src/lib/studio-api/tokens";
import { answerLikePostgres, serve, StudioDb } from "./fake-studio";

/**
 * scripts/studio-work/work.py, the way a Claude Code session runs it: the
 * real script against the studio's own API code (handleRestRequest, the work
 * service) over HTTP, with storage's signed addresses, and two checkouts of
 * one repository standing for two sessions on two machines. One session
 * starts a work and is cut short by a usage limit; another, somewhere else,
 * carries it on from exactly where it stopped: its files, its unpushed
 * commit, its changes not committed, its words.
 */

type Row = Record<string, unknown>;

// Each step runs python and git in processes of their own: slower machines get the time they need.
setDefaultTimeout(60_000);
const TOOLS = !!Bun.which("python3") && !!Bun.which("git");

const db = new StudioDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const WORK_PY = join(import.meta.dir, "../../scripts/studio-work/work.py");
/** The hooks as this repository declares them for Claude Code: each event's command, run as written. */
const SETTINGS = JSON.parse(
  readFileSync(join(import.meta.dir, "../../.claude/settings.json"), "utf8"),
) as {
  hooks: Record<string, { matcher?: string; hooks: { command: string; async?: boolean }[] }[]>;
};
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const C = "cccccccc-3333-4333-8333-333333333333";
const F = "f0f0f0f0-7777-4777-8777-777777777777";
const G = "00000000-9999-4999-8999-999999999999";
const repoF = () => join(root, "f");
const repoG = () => join(root, "g");

let server: ReturnType<typeof serve>;
let token = "";
let root = "";
let repoA = "";
let repoB = "";
let repoC = "";
let workId = "";
let batchId = "";

const member = db.add("profiles", {
  is_active: true,
  role: "member",
  full_name: "Rugesh",
  email: "r@example.test",
});

async function run(
  command: string[],
  options: { cwd: string; env?: Record<string, string>; input?: string },
) {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? (process.env as Record<string, string>),
    stdin: options.input !== undefined ? Buffer.from(options.input) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code: await child.exited, stdout, stderr };
}

async function git(repo: string, ...args: string[]) {
  const result = await run(["git", ...args], { cwd: repo });
  if (result.code !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function envFor(repo: string, session: string): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  for (const key of [
    "CLAUDE_CODE_REMOTE_SDK_URL",
    "CLAUDE_CODE_REMOTE_SESSION_ID",
    "XENO_WORK_SESSION",
    "XENO_WORK_HOME",
    "XENO_WORK_HOOKS",
    "XENO_WORK_CODE",
  ])
    delete env[key];
  return {
    ...env,
    CLAUDE_PROJECT_DIR: repo,
    CLAUDE_CODE_SESSION_ID: session,
    XENO_STUDIO_URL: db.origin,
    XENO_STUDIO_TOKEN: token,
    // Parts of a kilobyte, so a small file is several; one try, so the studio being away is quick to see.
    XENO_WORK_CHUNK_BYTES: "1000",
    XENO_WORK_TRIES: "1",
    XENO_WORK_TIMEOUT: "20",
    XENO_WORK_SETTLE_SECONDS: "0",
    XENO_WORK_AUTOSAVE_SECONDS: "0",
  };
}

function work(
  repo: string,
  session: string,
  args: string[],
  input?: string,
  extra: Record<string, string> = {},
) {
  return run(["python3", WORK_PY, ...args], {
    cwd: repo,
    env: { ...envFor(repo, session), ...extra },
    ...(input !== undefined ? { input } : {}),
  });
}

/**
 * A hook, as Claude Code runs it: the command .claude/settings.json gives the
 * event, through a shell, in the checkout (CLAUDE_PROJECT_DIR), with the
 * event's JSON on stdin.
 */
function hook(
  repo: string,
  session: string,
  event: string,
  input: Row,
  extra: Record<string, string> = {},
) {
  const command = SETTINGS.hooks[event]![0]!.hooks[0]!.command;
  return run(["sh", "-c", command], {
    cwd: repo,
    env: { ...envFor(repo, session), ...extra },
    input: JSON.stringify({ session_id: session, hook_event_name: event, ...input }),
  });
}

/**
 * A session's transcript as Claude Code writes it (JSON lines): the person's
 * message, the agent's words and tool calls, tools' results, and a
 * subagent's events (a sidechain), which aren't the session's own.
 */
function transcript(name: string, asked: string, said: string[], tools: string[]): string {
  const path = join(root, `${name}.jsonl`);
  const lines: Row[] = [
    { type: "user", message: { role: "user", content: "An earlier turn's request" } },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Earlier." }] },
    },
    { type: "user", message: { role: "user", content: [{ type: "text", text: asked }] } },
    ...tools.map((tool, index) => ({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          ...(said[index] ? [{ type: "text", text: said[index] }] : []),
          { type: "tool_use", id: `t${index}`, name: tool, input: {} },
        ],
      },
    })),
    {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t0", content: "ok" }],
      },
    },
    {
      type: "assistant",
      isSidechain: true,
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "s", name: "Grep", input: {} }],
      },
    },
  ];
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return path;
}

/** Until a detached save a hook started has reached the studio. */
async function until(check: () => boolean, what: string, repo: string) {
  for (let tries = 0; tries < 300; tries += 1) {
    if (check()) return;
    await Bun.sleep(50);
  }
  const log = join(repo, ".xeno-work", workId, "log.txt");
  throw new Error(
    `Timed out waiting for ${what}.${existsSync(log) ? `\n${readFileSync(log, "utf8")}` : ""}`,
  );
}

const journal = () => db.journal(workId);
const kinds = () => journal().map((entry) => entry["kind"]);
const theWork = () => db.find("works", workId)!;
const read = (path: string) => readFileSync(path, "utf8");

async function clone(into: string) {
  await git(root, "clone", "-q", join(root, "origin.git"), into);
  await git(into, "config", "user.name", "Test");
  await git(into, "config", "user.email", "test@example.test");
}

beforeAll(async () => {
  if (!TOOLS) return;
  const mcp = await import("../../src/lib/studio-api/mcp.server");
  const { hashApiToken } = await import("../../src/lib/studio-api/tokens.server");
  answerLikePostgres(db);
  token = newApiToken((bytes) => crypto.getRandomValues(bytes));
  db.add("api_tokens", {
    user_id: member["id"],
    name: "work.py",
    token_prefix: tokenPrefixOf(token),
    token_hash: await hashApiToken(token),
    scopes: ["read", "edit"],
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  });
  server = serve(db, (request, tool) => mcp.handleRestRequest(request, tool));

  root = mkdtempSync(join(tmpdir(), "work-py-"));
  repoA = join(root, "a");
  repoB = join(root, "b");
  repoC = join(root, "c");
  mkdirSync(join(repoA, "docs", "reel"), { recursive: true });
  mkdirSync(join(repoA, "scripts", "studio-work"), { recursive: true });
  mkdirSync(join(repoA, ".claude"), { recursive: true });
  writeFileSync(join(repoA, "scripts", "studio-work", "work.py"), readFileSync(WORK_PY));
  writeFileSync(
    join(repoA, ".claude", "settings.json"),
    readFileSync(join(import.meta.dir, "../../.claude/settings.json")),
  );
  await git(repoA, "init", "-q", "-b", "main");
  await git(repoA, "config", "user.name", "Test");
  await git(repoA, "config", "user.email", "test@example.test");
  writeFileSync(join(repoA, "README.md"), "# The repository\n");
  writeFileSync(join(repoA, "docs", "reel", "spec.json"), '{"shots": 12}\n');
  writeFileSync(join(repoA, "docs", "reel", "old.txt"), "notes that go\n");
  writeFileSync(join(repoA, "scripts", "x.py"), "print('one')\n");
  await git(repoA, "add", "-A");
  await git(repoA, "commit", "-q", "-m", "First");
  await git(root, "init", "-q", "--bare", "-b", "main", join(root, "origin.git"));
  await git(repoA, "remote", "add", "origin", join(root, "origin.git"));
  await git(repoA, "push", "-q", "-u", "origin", "main");
});

afterAll(async () => {
  // The saves hooks started in processes of their own finish before their checkouts go.
  for (let tries = 0; root && tries < 100; tries += 1) {
    const running = await run(["pgrep", "-f", root], { cwd: "/" }).catch(() => ({ code: 1 }));
    if (running.code !== 0) break;
    await Bun.sleep(100);
  }
  server?.stop(true);
  if (root) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!TOOLS)("work.py, as a Claude Code session runs it", () => {
  let frames: Buffer;
  let headA = "";

  test("a work is started, held by its session, and its files and code kept at once", async () => {
    const started = await work(repoA, A, [
      "start",
      "Reel 2",
      "--goal",
      "A 30-second reel for Aurixa",
      "--root",
      "records=docs/reel",
      "--step",
      "plates=Make the plates",
      "--step",
      "animatic=Animatic: timed to the voice",
      "--next",
      "Make the plates",
      "--save-now",
    ]);
    expect(started.stderr).toBe("");
    expect(started.code).toBe(0);
    workId = started.stdout.match(/Started Reel 2 \(([0-9a-f-]{36})\)/)![1]!;
    expect(started.stdout).toContain("in the project Reel 2");
    const row = theWork();
    expect(row["holder"]).toBe(`claude-code:${A}`);
    expect(row["holder_label"]).toBe("Claude Code session aaaaaaaa");
    expect(row["roots"]).toEqual({ records: "docs/reel" });
    // A title with a colon in it is a title, not a status and a note.
    expect((row["steps"] as Row[]).map((step) => [step["key"], step["title"]])).toEqual([
      ["plates", "Make the plates"],
      ["animatic", "Animatic: timed to the voice"],
    ]);
    expect(kinds()).toEqual(["start", "claim", "save"]);
    expect([...db.filesNow(workId).keys()]).toEqual([
      "records/old.txt",
      "records/spec.json",
      "work/code/state.json",
    ]);
    const local = JSON.parse(read(join(repoA, ".xeno-work", workId, "work.json"))) as Row;
    expect(local["attached"]).toBe(true);
    expect(read(join(repoA, ".git", "info", "exclude"))).toContain(".xeno-work/");
  });

  test("a save keeps what was done, the files that changed, and the code no remote holds", async () => {
    frames = randomBytes(5500);
    mkdirSync(join(repoA, ".xeno-work", workId, "files", "frames"), { recursive: true });
    writeFileSync(join(repoA, ".xeno-work", workId, "files", "frames", "plates.bin"), frames);
    writeFileSync(join(repoA, "docs", "reel", "spec.json"), '{"shots": 12, "plates": 11}\n');
    writeFileSync(join(repoA, "scripts", "new.py"), "print('committed, never pushed')\n");
    await git(repoA, "add", "scripts/new.py");
    await git(repoA, "commit", "-q", "-m", "Plates script");
    headA = await git(repoA, "rev-parse", "HEAD");
    writeFileSync(join(repoA, "scripts", "x.py"), "print('two, not committed')\n");
    writeFileSync(join(repoA, "notes.txt"), "an untracked file\n");

    const saved = await work(repoA, A, [
      "save",
      "-m",
      "Plates made: 11 of 11.",
      "--next",
      "Animatic",
      "--decision",
      "Seedream for the plates :: cheaper and sharper",
      "--step",
      "plates=done:11 of 11",
      "--step",
      "animatic=doing",
    ]);
    expect(saved.code).toBe(0);
    expect(saved.stdout).toContain("Saved to the studio");
    const entry = journal().at(-1)!;
    expect(entry).toMatchObject({
      kind: "save",
      summary: "Plates made: 11 of 11.",
      next_steps: ["Animatic"],
      decisions: [{ what: "Seedream for the plates", why: "cheaper and sharper" }],
      actor_session: `claude-code:${A}`,
    });
    expect(entry["code"]).toMatchObject({
      branch: "main",
      commit: headA,
      dirty: true,
      unpushed: 1,
    });
    expect((theWork()["steps"] as Row[]).map((step) => [step["key"], step["status"]])).toEqual([
      ["plates", "done"],
      ["animatic", "doing"],
    ]);
    const files = db.filesNow(workId);
    expect(files.get("records/spec.json")!["version"]).toBe(2);
    const plates = files.get("work/frames/plates.bin")!;
    expect((plates["chunks"] as string[]).length).toBe(6);
    expect(db.fileBytes(plates).equals(frames)).toBe(true);
    for (const path of ["commits.bundle", "uncommitted.patch", "state.json"])
      expect(files.has(`work/code/${path}`)).toBe(true);
    const patch = db.fileBytes(files.get("work/code/uncommitted.patch")!).toString();
    expect(patch).toContain("two, not committed");
    expect(patch).toContain("notes.txt");
    // The work's own roots are kept as its files, not again in the patch.
    expect(patch).not.toContain("spec.json");
  });

  test("a save that changes nothing keeps nothing again", async () => {
    const before = db.rows("work_files").length;
    const objects = db.objects.size;
    const again = await work(repoA, A, ["push"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Nothing changed since the last save.");
    expect(db.rows("work_files").length).toBe(before);
    expect(db.objects.size).toBe(objects);
  });

  test("while a session works, its changed files are kept by themselves", async () => {
    expect(SETTINGS.hooks["PostToolUse"]![0]).toMatchObject({
      matcher: "Bash|Write|Edit|MultiEdit|NotebookEdit",
      hooks: [{ async: true }],
    });
    writeFileSync(
      join(repoA, ".xeno-work", workId, "files", "frames", "notes.md"),
      "plate notes\n",
    );
    const ran = await hook(repoA, A, "PostToolUse", {
      tool_name: "Write",
      tool_input: { file_path: "notes.md" },
    });
    expect(ran).toMatchObject({ code: 0, stdout: "", stderr: "" });
    await until(() => db.filesNow(workId).has("work/frames/notes.md"), "the file kept", repoA);
    await until(() => kinds().at(-1) === "auto", "the automatic save", repoA);
  });

  test("a turn's last words are saved as it ends, by a hook that never makes the session wait", async () => {
    const ran = await hook(repoA, A, "Stop", {
      stop_hook_active: false,
      transcript_path: transcript("stop", "Make the plates", ["Making them."], ["Bash", "Bash"]),
      last_assistant_message: "The plates are done. Next: the animatic, timed to the voice.",
    });
    expect(ran).toMatchObject({ code: 0, stdout: "", stderr: "" });
    await until(() => kinds().includes("turn"), "the turn's entry", repoA);
    expect(journal().at(-1)).toMatchObject({
      kind: "turn",
      summary:
        "The plates are done. Next: the animatic, timed to the voice.\n\nTools used: Bash ×2.",
    });
  });

  test("a turn cut short by a usage limit says so, and lets the work go for the next session", async () => {
    const ran = await hook(repoA, A, "StopFailure", {
      error: "rate_limit",
      error_details: "429 Too Many Requests",
      // What it was in the middle of is only in its transcript: the hook is handed the error alone.
      transcript_path: transcript(
        "cut",
        "Now time the animatic to the voice",
        ["Reading the voice's pauses.", "Cutting shot 3 to the second pause."],
        ["Bash", "Edit", "Bash"],
      ),
      last_assistant_message: "API Error: Rate limit reached",
    });
    expect(ran).toMatchObject({ code: 0, stderr: "" });
    await until(() => kinds().at(-1) === "release", "the work let go", repoA);
    const interrupted = journal().find((entry) => entry["kind"] === "interrupted")!;
    expect(String(interrupted["summary"])).toStartWith(
      "The turn was cut short: rate_limit (429 Too Many Requests).\n\nIt had been asked: Now time the animatic to the voice\n\nWhat it said last: Cutting shot 3 to the second pause.\n\nTools it used in the turn: Bash ×2, Edit.",
    );
    expect(theWork()["holder"]).toBeNull();
  });

  test("another session, on another machine, carries it on from exactly there", async () => {
    await clone(repoB);
    expect(await git(repoB, "rev-parse", "HEAD")).not.toBe(headA);
    const resumed = await work(repoB, B, ["resume", workId]);
    expect(resumed).toMatchObject({ stderr: "", code: 0 });
    // Its commit, from the bundle kept with the work, and its changes not committed.
    expect(resumed.stdout).toContain(`Checked out main at ${headA.slice(0, 12)}`);
    expect(resumed.stdout).toContain("Its changes not committed are back.");
    expect(await git(repoB, "rev-parse", "HEAD")).toBe(headA);
    expect(read(join(repoB, "scripts", "x.py"))).toBe("print('two, not committed')\n");
    expect(read(join(repoB, "notes.txt"))).toBe("an untracked file\n");
    // Its files, each checked by its SHA-256: the roots, and its own folder.
    expect(read(join(repoB, "docs", "reel", "spec.json"))).toBe('{"shots": 12, "plates": 11}\n');
    expect(
      readFileSync(join(repoB, ".xeno-work", workId, "files", "frames", "plates.bin")).equals(
        frames,
      ),
    ).toBe(true);
    // And where it stands.
    expect(resumed.stdout).toContain("# Work: Reel 2");
    expect(resumed.stdout).toContain("- [x] plates: Make the plates — 11 of 11");
    expect(resumed.stdout).toContain("Last account (turn ended, 2026");
    expect(resumed.stdout).toContain("Its last turn was cut short");
    expect(resumed.stdout).toContain("1. Animatic");
    expect(resumed.stdout).toContain("Seedream for the plates — because cheaper and sharper");
    expect(theWork()["holder"]).toBe(`claude-code:${B}`);
    expect(kinds().at(-1)).toBe("claim");
  });

  test("a session starting on a checkout that is on a work is told where it stands", async () => {
    const started = await hook(repoB, B, "SessionStart", { source: "startup" });
    expect(started).toMatchObject({ code: 0, stderr: "" });
    expect(started.stdout).toStartWith("Xeno Studio: this checkout is on work in progress");
    expect(started.stdout).toContain("# Work: Reel 2");
    expect(started.stdout.length).toBeLessThan(10_000);
  });

  test("while the studio can't be reached, the words are kept, and the next save sends them first", async () => {
    db.down = true;
    const away = await work(repoA, A, ["save", "-m", "Animatic sketched while offline."]);
    db.down = false;
    expect(away.code).not.toBe(0);
    expect(away.stderr).toContain("Its words are kept on this machine");
    expect(readdirSync(join(repoA, ".xeno-work", workId, "outbox"))).toHaveLength(1);
    const back = await work(repoA, A, ["save", "-m", "Back online."]);
    expect(back.code).toBe(0);
    // A saves from a checkout another session now holds the work for: kept, and told so.
    expect(back.stdout).toContain("Claude Code session bbbbbbbb holds this work now");
    const [late, now] = journal().slice(-2);
    expect(String(late!["summary"])).toStartWith(
      "Animatic sketched while offline.\n\n(Kept on the machine while the studio couldn't be reached",
    );
    expect(now!["summary"]).toBe("Back online.");
    expect(readdirSync(join(repoA, ".xeno-work", workId, "outbox"))).toHaveLength(0);
  });

  test("a file changed on both sides keeps this machine's, with the studio's beside it", async () => {
    writeFileSync(join(repoB, "docs", "reel", "spec.json"), '{"shots": 14}\n');
    expect((await work(repoB, B, ["save", "-m", "Two more shots."])).code).toBe(0);
    writeFileSync(join(repoA, "docs", "reel", "spec.json"), '{"shots": 13}\n');
    const pulled = await work(repoA, A, ["pull"]);
    expect(pulled.code).toBe(0);
    expect(pulled.stdout).toContain("1 set aside");
    expect(read(join(repoA, "docs", "reel", "spec.json"))).toBe('{"shots": 13}\n');
    expect(read(join(repoA, "docs", "reel", "spec.json.studio-v3"))).toBe('{"shots": 14}\n');
  });

  test("a file deleted in the work goes from a machine that hasn't changed it", async () => {
    rmSync(join(repoB, "docs", "reel", "old.txt"));
    expect((await work(repoB, B, ["save", "-m", "Old notes gone."])).code).toBe(0);
    expect(db.filesNow(workId).has("records/old.txt")).toBe(false);
    const pulled = await work(repoA, A, ["pull"]);
    expect(pulled.stdout).toContain("1 deleted as the studio deleted them");
    expect(existsSync(join(repoA, "docs", "reel", "old.txt"))).toBe(false);
  });

  test("a work another session holds isn't taken without asking; taken over, the journal says so", async () => {
    await clone(repoC);
    await git(repoC, "checkout", "-q", "-b", "feature");
    writeFileSync(join(repoC, "feature.md"), "a branch of its own\n");
    await git(repoC, "add", "feature.md");
    await git(repoC, "commit", "-q", "-m", "Feature");
    const refused = await work(repoC, C, ["resume", workId]);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toContain("Claude Code session bbbbbbbb is working on this");
    const taken = await work(repoC, C, ["resume", workId, "--take-over"]);
    expect(taken.code).toBe(0);
    expect(journal().at(-1)).toMatchObject({ kind: "takeover", actor_session: `claude-code:${C}` });
    expect(String(journal().at(-1)!["summary"])).toStartWith(
      "Taken over from Claude Code session bbbbbbbb",
    );
    // On another branch, the code is left alone, and the way to bring it over is said.
    expect(taken.stdout).toContain("this checkout is on feature");
    expect(taken.stdout).toContain("restore-code --here");
    expect(await git(repoC, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
  });

  test("restore-code --here brings the work's commits and changes onto the branch it is on", async () => {
    const restored = await work(repoC, C, ["restore-code", "--here"]);
    expect(restored).toMatchObject({ stderr: "", code: 0 });
    // Merged, so its commits keep who they are: pushing this branch pushes them too.
    expect(restored.stdout).toContain("Merged the work's code from main into feature.");
    expect(await git(repoC, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
    expect(read(join(repoC, "scripts", "new.py"))).toBe("print('committed, never pushed')\n");
    expect(read(join(repoC, "scripts", "x.py"))).toBe("print('two, not committed')\n");
    expect(read(join(repoC, "feature.md"))).toBe("a branch of its own\n");
    expect(await git(repoC, "log", "-1", "--format=%s")).toBe(
      "Carry on Reel 2: its code from main",
    );
    expect(await git(repoC, "merge-base", "--is-ancestor", headA, "HEAD")).toBe("");
  });

  test("a checkout on no work hears what is in progress, and who is on it", async () => {
    const fresh = join(root, "fresh");
    await clone(fresh);
    const started = await hook(fresh, "dddddddd-4444-4444-8444-444444444444", "SessionStart", {
      source: "startup",
    });
    expect(started).toMatchObject({ code: 0, stderr: "" });
    expect(started.stdout).toStartWith("Xeno Studio has work in progress");
    expect(started.stdout).toContain(
      `- Reel 2 (${workId}) · active · Claude Code session cccccccc is on it`,
    );
    expect(started.stdout).toContain("next: Animatic");
  });

  test("letting go saves first, and the checkout stops saving to it", async () => {
    const released = await work(repoC, C, [
      "release",
      "-m",
      "Stopping here: the animatic is next.",
    ]);
    expect(released.code).toBe(0);
    expect(released.stdout).toContain(
      "Let go: the next session, here or anywhere, can take it up.",
    );
    expect(theWork()["holder"]).toBeNull();
    const local = JSON.parse(read(join(repoC, ".xeno-work", workId, "work.json"))) as Row;
    expect(local["attached"]).toBe(false);
    const entries = kinds().length;
    await hook(repoC, C, "Stop", { last_assistant_message: "Unrelated." });
    await Bun.sleep(400);
    expect(kinds().length).toBe(entries);
  });

  test("a session ending saves once more, and lets go of its own hold and nobody else's", async () => {
    // B's checkout is still on the work, but C took it over, then let it go: nothing of B's to let go.
    const entries = kinds().length;
    const ended = await hook(repoB, B, "SessionEnd", { reason: "other" });
    expect(ended).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(kinds().length).toBe(entries);
    expect(theWork()["holder"]).toBeNull();
    // Taken up again, a change made, and the session ends: the change is kept, then the work let go.
    expect((await work(repoB, B, ["resume", workId])).code).toBe(0);
    writeFileSync(join(repoB, "docs", "reel", "spec.json"), '{"shots": 15}\n');
    expect((await hook(repoB, B, "SessionEnd", { reason: "prompt_input_exit" })).code).toBe(0);
    const [save, release] = journal().slice(-2);
    expect(save).toMatchObject({ kind: "auto", actor_session: `claude-code:${B}` });
    expect((save!["files"] as Row[]).map((file) => file["path"])).toContain("records/spec.json");
    expect(release).toMatchObject({ kind: "release", summary: "The session ended." });
    expect(theWork()["holder"]).toBeNull();
  });

  test("more files than one request takes go in several, and come back a page at a time", async () => {
    const small = {
      XENO_WORK_FILES_PER_SAVE: "2",
      XENO_WORK_PARTS_PER_OFFER: "3",
      XENO_WORK_FILES_PER_PAGE: "2",
    };
    const repoD = join(root, "d");
    const repoE = join(root, "e");
    await clone(repoD);
    const started = await work(
      repoD,
      "eeeeeeee-5555-4555-8555-555555555555",
      ["start", "Batch", "--root", "many=many", "--no-project"],
      undefined,
      small,
    );
    expect(started.code).toBe(0);
    batchId = started.stdout.match(/Started Batch \(([0-9a-f-]{36})\)/)![1]!;
    mkdirSync(join(repoD, "many"));
    const contents = Array.from({ length: 7 }, () => randomBytes(1500));
    contents.forEach((bytes, index) => writeFileSync(join(repoD, "many", `f${index}.bin`), bytes));
    const saved = await work(
      repoD,
      "eeeeeeee-5555-4555-8555-555555555555",
      ["save", "-m", "Seven files."],
      undefined,
      small,
    );
    expect(saved.code).toBe(0);
    const entries = db.journal(batchId);
    // Eight files (seven and the code's state), two a save: three on their own, the last with the words.
    expect(entries.slice(-4).map((entry) => entry["kind"])).toEqual([
      "auto",
      "auto",
      "auto",
      "save",
    ]);
    expect(entries.at(-1)).toMatchObject({ summary: "Seven files." });
    expect(String(entries.at(-4)!["summary"])).toBe("Files kept (part 1 of 4 of one save)");
    expect(db.filesNow(batchId).size).toBe(8);
    await clone(repoE);
    const resumed = await work(
      repoE,
      "ffffffff-6666-4666-8666-666666666666",
      ["resume", batchId, "--take-over"],
      undefined,
      small,
    );
    expect(resumed).toMatchObject({ stderr: "", code: 0 });
    expect(resumed.stdout).toContain("Files: 7 put back");
    contents.forEach((bytes, index) =>
      expect(readFileSync(join(repoE, "many", `f${index}.bin`)).equals(bytes)).toBe(true),
    );
  });

  test("a fresh checkout of the default branch takes up the work on the work's own branch", async () => {
    // The work's code is now where C left it: its branch, at the merge.
    const kept = JSON.parse(
      db.fileBytes(db.filesNow(workId).get("work/code/state.json")!).toString(),
    ) as Row;
    expect(kept["branch"]).toBe("feature");
    await clone(repoF());
    // By words of its title, not its id.
    const resumed = await work(repoF(), F, ["resume", "Reel 2", "--take-over"]);
    expect(resumed).toMatchObject({ stderr: "", code: 0 });
    expect(resumed.stdout).toContain(
      `Checked out feature at ${String(kept["head"]).slice(0, 12)}, where the work left it.`,
    );
    expect(resumed.stdout).toContain("Its changes not committed are back.");
    expect(await git(repoF(), "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
    expect(await git(repoF(), "rev-parse", "HEAD")).toBe(String(kept["head"]));
    expect(read(join(repoF(), "scripts", "x.py"))).toBe("print('two, not committed')\n");
    expect(read(join(repoF(), "feature.md"))).toBe("a branch of its own\n");
  });

  test("a branch just made from it, as a cloud session starts on, has the work's code brought onto it", async () => {
    const kept = JSON.parse(
      db.fileBytes(db.filesNow(workId).get("work/code/state.json")!).toString(),
    ) as Row;
    await clone(repoG());
    await git(repoG(), "checkout", "-q", "-b", "claude/carry-on");
    const resumed = await work(repoG(), G, ["resume", workId, "--take-over"]);
    expect(resumed).toMatchObject({ stderr: "", code: 0 });
    expect(resumed.stdout).toContain(
      `Brought the work's code onto claude/carry-on (to ${String(kept["head"]).slice(0, 12)}).`,
    );
    expect(await git(repoG(), "rev-parse", "--abbrev-ref", "HEAD")).toBe("claude/carry-on");
    expect(await git(repoG(), "rev-parse", "HEAD")).toBe(String(kept["head"]));
    expect(read(join(repoG(), "notes.txt"))).toBe("an untracked file\n");
    // Asked again, it says the code is there already, and changes nothing.
    const again = await work(repoG(), G, ["restore-code"]);
    expect(again).toMatchObject({ stderr: "", code: 0 });
    expect(again.stdout).toContain("The work's code is here already (feature at ");
    // Its next save keeps its own code as the work's: it holds what was kept.
    expect((await work(repoG(), G, ["push"])).code).toBe(0);
    const now = JSON.parse(
      db.fileBytes(db.filesNow(workId).get("work/code/state.json")!).toString(),
    ) as Row;
    expect(now["branch"]).toBe("claude/carry-on");
  });

  test("a checkout that hasn't taken up the work's code never puts it out of view", async () => {
    // B is on main with changes of its own, so resume leaves its code alone, and its saves leave the work's.
    const resumed = await work(repoB, B, ["resume", workId, "--take-over"]);
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("Until then, saves from here keep the work's code as it is.");
    writeFileSync(join(repoB, "docs", "reel", "spec.json"), '{"shots": 16}\n');
    const saved = await work(repoB, B, ["save", "-m", "Sixteen shots."]);
    expect(saved.stdout).toContain(
      "this checkout hasn't taken up the work's code (restore-code), so the work keeps the code it had",
    );
    expect(journal().at(-1)!["code"]).toBeNull();
    const kept = JSON.parse(
      db.fileBytes(db.filesNow(workId).get("work/code/state.json")!).toString(),
    ) as Row;
    expect(kept["branch"]).toBe("claude/carry-on");
    expect((await work(repoB, B, ["status"])).stdout).toContain(
      "This checkout doesn't hold the work's code yet",
    );
    // Told its own is the work's now, it keeps it from its next save.
    expect((await work(repoB, B, ["restore-code", "--mine"])).code).toBe(0);
    expect((await work(repoB, B, ["push"])).code).toBe(0);
    const mine = JSON.parse(
      db.fileBytes(db.filesNow(workId).get("work/code/state.json")!).toString(),
    ) as Row;
    expect(mine["branch"]).toBe("main");
    // And G takes it back, for the rest.
    expect((await work(repoG(), G, ["resume", workId, "--take-over", "--no-code"])).code).toBe(0);
  });

  test("the rest of the commands: list, status, a note, another root, and a link", async () => {
    const listed = await work(repoG(), G, ["list"]);
    expect(listed.stdout).toContain(`${workId}  Reel 2 · active · 1/2 steps`);
    expect(listed.stdout).toContain("· this checkout's");
    const status = await work(repoG(), G, ["status"]);
    expect(status.stdout).toContain("# Work: Reel 2");
    expect(status.stdout).toContain(
      "On this machine: 0 files changed and 0 gone since the last save",
    );
    expect(
      (await work(repoF(), F, ["note", "-m", "The client prefers the warmer grade."])).code,
    ).toBe(0);
    expect(journal().at(-1)).toMatchObject({
      kind: "note",
      summary: "The client prefers the warmer grade.",
    });
    mkdirSync(join(repoG(), "refs"));
    writeFileSync(join(repoG(), "refs", "grade.txt"), "warm\n");
    const tracked = await work(repoG(), G, ["track", "refs=refs"]);
    expect(tracked.stdout).toContain("Tracked: refs → ");
    expect(theWork()["roots"]).toEqual({ records: "docs/reel", refs: "refs" });
    expect((await work(repoG(), G, ["push"])).code).toBe(0);
    expect(db.filesNow(workId).has("refs/grade.txt")).toBe(true);
    const generation = db.add("generations", { project_id: null, prompt: "A warm plate" });
    const linked = await work(repoG(), G, [
      "link",
      "generation",
      String(generation["id"]),
      "--role",
      "the warm grade",
      "--adopt",
    ]);
    expect(linked.stdout).toBe("Attached; 1 put in the work's project.\n");
    expect(db.find("generations", generation["id"])!["project_id"]).toBe(theWork()["project_id"]);
  });

  test("a checkout moving on to another work lets go of the one it was on", async () => {
    const repoD = join(root, "d");
    const moved = await work(repoD, "eeeeeeee-5555-4555-8555-555555555555", [
      "resume",
      workId,
      "--take-over",
      "--no-code",
    ]);
    expect(moved.code).toBe(0);
    expect(moved.stdout).toContain(
      `Let go of Batch here (python3 scripts/studio-work/work.py resume ${batchId}`,
    );
    const local = (id: string) =>
      JSON.parse(read(join(repoD, ".xeno-work", id, "work.json"))) as Row;
    expect(local(batchId)["attached"]).toBe(false);
    expect(local(workId)["attached"]).toBe(true);
    // E took Batch over from D earlier: D lets go of it here, and E's hold on it stands.
    expect(db.find("works", batchId)!["holder"]).toBe(
      "claude-code:ffffffff-6666-4666-8666-666666666666",
    );
    expect(db.journal(batchId).at(-1)!["kind"]).toBe("takeover");
  });

  test("a work finished leaves the list of work in progress, and its checkout", async () => {
    const repoE = join(root, "e");
    const E = "ffffffff-6666-4666-8666-666666666666";
    const done = await work(repoE, E, ["save", "-m", "Batch delivered.", "--status", "done"]);
    expect(done.code).toBe(0);
    expect(db.find("works", batchId)).toMatchObject({ status: "done", holder: null });
    expect(
      (JSON.parse(read(join(repoE, ".xeno-work", batchId, "work.json"))) as Row)["attached"],
    ).toBe(false);
    expect((await work(repoE, E, ["list"])).stdout).not.toContain("Batch");
    expect((await work(repoE, E, ["list", "--all"])).stdout).toContain(`${batchId}  Batch · done`);
  });

  test("a turn begun by a compacted context is read from there, claiming no request", async () => {
    const path = join(root, "compacted.jsonl");
    writeFileSync(
      path,
      [
        { type: "user", message: { role: "user", content: "Before the compaction" } },
        {
          type: "user",
          isCompactSummary: true,
          isVisibleInTranscriptOnly: true,
          message: { role: "user", content: "This session is being continued…" },
        },
        { type: "user", isMeta: true, message: { role: "user", content: "a caveat" } },
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Carrying on." },
              { type: "tool_use", id: "t", name: "Bash", input: {} },
            ],
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );
    const read = await run(
      [
        "python3",
        "-I",
        "-c",
        `import importlib.util, json, sys; spec = importlib.util.spec_from_file_location("w", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(json.dumps(m.turn_account(sys.argv[2])))`,
        WORK_PY,
        path,
      ],
      { cwd: root, env: envFor(repoA, A) },
    );
    expect(JSON.parse(read.stdout)).toEqual({
      asked: null,
      said: ["Carrying on."],
      tools: { Bash: 1 },
      whole: true,
    });
  });

  test("with the studio unreachable a hook says nothing and never fails the session", async () => {
    for (const event of [
      "SessionStart",
      "PostToolUse",
      "Stop",
      "StopFailure",
      "PreCompact",
      "SessionEnd",
    ]) {
      const ran = await hook(repoA, A, event, {}, { XENO_STUDIO_URL: "http://127.0.0.1:9" });
      expect(ran).toMatchObject({ code: 0, stderr: "" });
      // A checkout on a work is told it couldn't be reached, and what happens meanwhile; nothing else says a word.
      if (event === "SessionStart")
        expect(ran.stdout).toContain(
          "the studio couldn't be reached ([Errno 111] Connection refused). It was last saved from here",
        );
      else expect(ran.stdout).toBe("");
    }
  });
});
