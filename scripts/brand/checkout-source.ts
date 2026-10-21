/**
 * Where the brand scripts read a repository's files: a local checkout (its
 * files in git's index, read from the working tree at HEAD) when one is
 * given, else GitHub (GITHUB_TOKEN for private repositories).
 *
 *   owner/repo=/path/to/checkout   a checkout
 *   owner/repo                     GitHub
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { githubSource } from "../../src/lib/brand/github-source";
import { parseRepoRef, repoLabel, type RepoRef } from "../../src/lib/brand/scan-code";
import type { RepoSource } from "../../src/lib/brand/scan-repos";

export interface CheckoutSource extends RepoSource {
  /** Where a repository was read from: its checkout, or "GitHub". */
  from(ref: RepoRef): string;
}

/** Repositories as the scripts take them (`owner/repo=checkout` or `owner/repo`), and where each is. */
export function reposFrom(specs: string[]): { refs: RepoRef[]; checkouts: Map<string, string> } {
  const checkouts = new Map<string, string>();
  const refs = specs.map((spec) => {
    const at = spec.indexOf("=");
    const name = at < 0 ? spec : spec.slice(0, at);
    const ref = parseRepoRef(name);
    if (!ref) throw new Error(`Not a repository: ${name}`);
    if (at >= 0) checkouts.set(repoLabel(ref), spec.slice(at + 1));
    return ref;
  });
  return { refs, checkouts };
}

export function checkoutSource(checkouts: Map<string, string>): CheckoutSource {
  const github = githubSource({ token: process.env["GITHUB_TOKEN"] ?? null });
  return {
    from: (ref) => checkouts.get(repoLabel(ref)) ?? "GitHub",
    async tree(ref) {
      const dir = checkouts.get(repoLabel(ref));
      if (!dir) return github.tree(ref);
      const sha = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
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
      const dir = checkouts.get(repoLabel(ref));
      if (!dir) return github.text(ref, sha, path, maxBytes);
      const file = join(dir, path);
      return statSync(file).size > maxBytes ? null : readFileSync(file, "utf8");
    },
  };
}
