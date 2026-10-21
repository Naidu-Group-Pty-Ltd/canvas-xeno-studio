/**
 * Reads repositories' design systems the way Xeno Studio's code import does, from the command line:
 *
 *   bun scripts/brand/scan-repos.ts owner/repo=/path/to/checkout ... [--out <dir>]
 *   bun scripts/brand/scan-repos.ts owner/repo ...   # from GitHub (GITHUB_TOKEN for private ones)
 *
 * The first repository is the primary. Writes <out>/design-system.json (everything found, with where)
 * and <out>/tokens.css (the tokens as one stylesheet), and prints a summary.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { githubSource } from "../../src/lib/brand/github-source";
import {
  codeEvidenceText,
  codeTokensCss,
  parseRepoRef,
  repoLabel,
  type RepoRef,
} from "../../src/lib/brand/scan-code";
import { scanRepos, type RepoSource } from "../../src/lib/brand/scan-repos";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1]! : null;
const specs = args.filter(
  (arg, index) => !arg.startsWith("--") && (outAt < 0 || index !== outAt + 1),
);
if (!specs.length) {
  console.error("Usage: bun scripts/brand/scan-repos.ts owner/repo[=checkout] ... [--out dir]");
  process.exit(1);
}

const local = new Map<string, string>();
const refs: RepoRef[] = specs.map((spec) => {
  const [name = "", dir] = spec.split("=");
  const ref = parseRepoRef(name);
  if (!ref) throw new Error(`Not a repository: ${name}`);
  if (dir) local.set(repoLabel(ref), dir);
  return ref;
});

const github = githubSource({ token: process.env["GITHUB_TOKEN"] ?? null });
const checkout: RepoSource = {
  async tree(ref) {
    const dir = local.get(repoLabel(ref));
    if (!dir) return github.tree(ref);
    const sha = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const files = execFileSync("git", ["-C", dir, "ls-files"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean)
      .map((path) => {
        try {
          return { path, size: statSync(join(dir, path)).size };
        } catch {
          return { path, size: null };
        }
      });
    return { sha, files, truncated: false };
  },
  async text(ref, sha, path, maxBytes) {
    const dir = local.get(repoLabel(ref));
    if (!dir) return github.text(ref, sha, path, maxBytes);
    const file = join(dir, path);
    return statSync(file).size > maxBytes ? null : readFileSync(file, "utf8");
  },
};

const { system, scans, failed } = await scanRepos(refs, checkout, {
  onStage: (stage) => console.error(`· ${stage}`),
});
for (const scan of scans)
  console.log(
    `${repoLabel(scan.ref)} @ ${scan.sha?.slice(0, 7)}: ${scan.readings.length} files read (${scan.plan.files
      .map((file) => file.path)
      .slice(0, 12)
      .join(
        ", ",
      )}${scan.plan.files.length > 12 ? ", …" : ""}); ${scan.plan.skipped.length} skipped; ${scan.failed.length} failed; logos: ${scan.logos.join(", ") || "none"}`,
  );
for (const failure of failed) console.log(`FAILED ${failure.repo}: ${failure.why}`);
console.log("\n" + codeEvidenceText(system));
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "design-system.json"), JSON.stringify(system, null, 1) + "\n");
  writeFileSync(
    join(out, "tokens.css"),
    codeTokensCss(system, { generatedAt: new Date().toISOString().slice(0, 10) }),
  );
  console.error(`Wrote ${join(out, "design-system.json")} and ${join(out, "tokens.css")}`);
}
