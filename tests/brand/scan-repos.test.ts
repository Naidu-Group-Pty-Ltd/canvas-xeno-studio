import { describe, expect, test } from "bun:test";
import { githubSource } from "../../src/lib/brand/github-source";
import { parseRepoRef, type RepoRef } from "../../src/lib/brand/scan-code";
import {
  brandWords,
  scanRepo,
  scanRepos,
  RepoScanError,
  type RepoSource,
} from "../../src/lib/brand/scan-repos";

/** A repository held in memory: its files by path, and which reads were asked for. */
function memorySource(repos: Record<string, Record<string, string>>): RepoSource & {
  reads: string[];
} {
  const reads: string[] = [];
  const filesOf = (ref: RepoRef) => {
    const files = repos[`${ref.owner}/${ref.repo}`];
    if (!files) throw new Error(`${ref.owner}/${ref.repo} wasn't found`);
    return files;
  };
  return {
    reads,
    async tree(ref) {
      const files = filesOf(ref);
      return {
        sha: "a".repeat(40),
        files: Object.entries(files).map(([path, text]) => ({ path, size: text.length })),
        truncated: false,
      };
    },
    async text(ref, _sha, path, maxBytes) {
      reads.push(path);
      const text = filesOf(ref)[path];
      if (text === "THROW") throw new Error("the connection dropped");
      return text === undefined || text.length > maxBytes ? null : text;
    },
  };
}

const ref = (spec: string) => parseRepoRef(spec)!;

describe("brandWords", () => {
  test("the words of the names that name the brand", () => {
    expect(
      brandWords([
        { repo: "aurixa-systems" },
        { repo: "aurixa-builders" },
        { repo: "npc-client-dashboard" },
        { repo: "aurixa-mission-control" },
      ]),
    ).toEqual(["aurixa", "npc"]);
    expect(brandWords([{ repo: "web" }, { repo: "app-v2" }])).toEqual([]);
  });
});

describe("scanRepo", () => {
  const source = memorySource({
    "acme/site": {
      "package.json": JSON.stringify({
        name: "acme-site",
        dependencies: { tailwindcss: "^4.1.0" },
      }),
      "src/main.tsx": `import "./vendor/brand.css";\nimport "./index.css";\nimport App from "./App";`,
      "src/index.css": `@import "./theme/colours.css";\n:root { --primary: #C89B3C; }`,
      "src/theme/colours.css": `:root { --ink: #040B16; }`,
      // The planner passes over a vendor folder; the app importing it is why it is read.
      "src/vendor/brand.css": `:root { --brand-cyan: #00A8B5; }`,
      "src/broken.css": "THROW",
      "public/brand/acme-mark.svg": "<svg/>",
      "public/brand/partner-logo.svg": "<svg/>",
    },
  });

  test("reads the plan, then what it imports, and records what couldn't be read", async () => {
    const stages: string[] = [];
    const scan = await scanRepo(ref("acme/site"), source, {
      onStage: (stage) => stages.push(stage),
      brand: ["acme"],
    });
    expect(scan.sha).toBe("a".repeat(40));
    const read = scan.readings.map((reading) => reading.path);
    expect(read).toContain("src/index.css");
    expect(read).toContain("src/theme/colours.css");
    expect(read).toContain("src/vendor/brand.css");
    expect(scan.plan.files.find((file) => file.path === "src/vendor/brand.css")?.why).toBe(
      "imported by src/main.tsx",
    );
    expect(scan.failed).toEqual([{ path: "src/broken.css", why: "the connection dropped" }]);
    // Logos are listed for staging, never read as text.
    expect(scan.logos).toEqual(["public/brand/acme-mark.svg", "public/brand/partner-logo.svg"]);
    expect(source.reads.some((path) => path.endsWith(".svg"))).toBe(false);
    expect(stages).toEqual(["Reading acme/site's files", "Reading acme/site's styling code"]);
  });

  test("a repository that can't be listed throws, saying which", async () => {
    await expect(scanRepo(ref("acme/missing"), source)).rejects.toBeInstanceOf(RepoScanError);
    await expect(scanRepo(ref("acme/missing"), source)).rejects.toMatchObject({
      repo: "acme/missing",
      message: "acme/missing wasn't found",
    });
  });
});

describe("scanRepos", () => {
  const source = memorySource({
    "acme/site": { "src/index.css": ":root { --primary: #C89B3C; }" },
    "acme/app": { "src/index.css": ":root { --primary: #C89B3C; --surface: #10233D; }" },
  });

  test("merges what can be read and notes what can't", async () => {
    const { system, scans, failed } = await scanRepos(
      [ref("acme/site"), ref("acme/missing"), ref("acme/app")],
      source,
    );
    expect(scans.map((scan) => `${scan.ref.owner}/${scan.ref.repo}`)).toEqual([
      "acme/site",
      "acme/app",
    ]);
    expect(failed).toEqual([{ repo: "acme/missing", why: "acme/missing wasn't found" }]);
    expect(system.primary).toBe("acme/site");
    expect(system.notes[0]).toBe("acme/missing couldn't be read: acme/missing wasn't found");
    expect(system.colours[0]).toMatchObject({ hex: "#c89b3c", repos: ["acme/site", "acme/app"] });
  });

  test("throws when none can be read", async () => {
    await expect(scanRepos([ref("acme/missing")], source)).rejects.toMatchObject({
      repo: "acme/missing",
    });
  });
});

describe("githubSource", () => {
  type Call = { url: string; init: RequestInit };
  const recorder = (answer: (url: string) => Response) => {
    const calls: Call[] = [];
    const run = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      return answer(url);
    }) as typeof fetch;
    return { calls, run };
  };
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  test("the default branch's commit, its tree, and files at that commit, from GitHub alone", async () => {
    const { calls, run } = recorder((url) => {
      if (url === "https://api.github.com/repos/acme/site")
        return Response.json({ default_branch: "main" });
      if (url === "https://api.github.com/repos/acme/site/commits/main") return new Response(SHA);
      if (url === `https://api.github.com/repos/acme/site/git/trees/${SHA}?recursive=1`)
        return Response.json({
          truncated: false,
          tree: [
            { type: "blob", path: "src/index.css", size: 30 },
            { type: "tree", path: "src" },
          ],
        });
      if (url === `https://raw.githubusercontent.com/acme/site/${SHA}/src/index.css`)
        return new Response(":root { --a: #fff; }");
      return new Response("missing", { status: 404 });
    });
    const github = githubSource({ token: "ghp_secret", fetch: run });
    const tree = await github.tree(ref("acme/site"));
    expect(tree).toEqual({
      sha: SHA,
      files: [{ path: "src/index.css", size: 30 }],
      truncated: false,
    });
    expect(await github.text(ref("acme/site"), SHA, "src/index.css", 1000)).toBe(
      ":root { --a: #fff; }",
    );
    expect(await github.text(ref("acme/site"), SHA, "src/gone.css", 1000)).toBeNull();
    for (const call of calls) {
      expect(new URL(call.url).hostname).toMatch(
        /^(?:api\.github\.com|raw\.githubusercontent\.com)$/,
      );
      // Never followed anywhere else, so the token can't be carried there.
      expect(call.init.redirect).toBe("manual");
      expect((call.init.headers as Record<string, string>)["authorization"]).toBe(
        "Bearer ghp_secret",
      );
    }
  });

  test("a branch and a folder are read as given; a path is encoded, never joined raw", async () => {
    const { calls, run } = recorder((url) =>
      url.includes("/commits/") ? new Response(SHA) : Response.json({ tree: [] }),
    );
    const github = githubSource({ fetch: run });
    expect((await github.tree(ref("acme/mono@release/2.0"))).sha).toBe(SHA);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.com/repos/acme/mono/commits/release/2.0",
      `https://api.github.com/repos/acme/mono/git/trees/${SHA}?recursive=1`,
    ]);
    expect((calls[0]!.init.headers as Record<string, string>)["authorization"]).toBeUndefined();
    await github.text(ref("acme/mono"), SHA, "apps/web/src/a b#c.css", 100);
    expect(calls.at(-1)!.url).toBe(
      `https://raw.githubusercontent.com/acme/mono/${SHA}/apps/web/src/a%20b%23c.css`,
    );
  });

  test("refusals say what to do", async () => {
    const limited = githubSource({
      fetch: (async () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        })) as unknown as typeof fetch,
    });
    await expect(limited.tree(ref("acme/site@main"))).rejects.toThrow(
      "GitHub's limit on reads without a token is used up; add a GitHub token, or try again in an hour",
    );
    const hidden = githubSource({
      token: "t",
      fetch: (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch,
    });
    await expect(hidden.tree(ref("acme/private@main"))).rejects.toThrow(
      "acme/private@main wasn't found, or the GitHub token can't read it",
    );
    const moved = githubSource({
      fetch: (async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://elsewhere.example/" },
        })) as unknown as typeof fetch,
    });
    await expect(moved.tree(ref("acme/site@main"))).rejects.toThrow(
      "GitHub moved acme/site@main somewhere this won't follow",
    );
  });

  test("a file larger than asked for is left out", async () => {
    const github = githubSource({
      fetch: (async () =>
        new Response("x".repeat(50), {
          headers: { "content-length": "50" },
        })) as unknown as typeof fetch,
    });
    expect(await github.text(ref("acme/site"), SHA, "big.css", 10)).toBeNull();
    expect(await github.bytes(ref("acme/site"), SHA, "logo.svg", 100)).toEqual(
      new Uint8Array(50).fill(120),
    );
  });
});
