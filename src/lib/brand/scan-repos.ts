/**
 * Scanning repositories for their design system, step by step: a
 * repository's file tree, the styling files planned from it, those files
 * read, then the stylesheets they import (a second round), then every
 * repository merged (./scan-code). Where the files come from is given to it
 * (GitHub on the server, ./github.server; a checkout for a script; a fake in
 * tests), so the steps are the same wherever it runs.
 *
 * Shared by the server, scripts and tests.
 */
import {
  CODE_SCAN_LIMITS,
  codeFileKind,
  importedFiles,
  type CodeFileKind,
  mergeCodeScans,
  planCodeFiles,
  readCodeFile,
  repoLabel,
  type CodeDesignSystem,
  type FileReading,
  type PlannedFile,
  type RepoRef,
  type RepoScan,
  type TreeFile,
} from "./scan-code";

export interface RepoTree {
  /** The commit the tree is of (null when the source can't say). */
  sha: string | null;
  files: TreeFile[];
  /** Whether the source gave only part of the tree (a very large repository). */
  truncated: boolean;
}

/** Where a repository's files come from. Each call may throw; a failure is recorded, never fatal to the scan. */
export interface RepoSource {
  tree(ref: RepoRef): Promise<RepoTree>;
  /** A file's text at the commit (null when it is gone or larger than `maxBytes`). */
  text(ref: RepoRef, sha: string | null, path: string, maxBytes: number): Promise<string | null>;
}

export class RepoScanError extends Error {
  constructor(
    readonly repo: string,
    message: string,
  ) {
    super(message);
  }
}

const TEXT_KINDS = new Set<CodeFileKind>(["css", "scss", "less"]);
/** The files whose imports are followed: stylesheets, and an app's entry module. */
const IMPORTING_KINDS = new Set<CodeFileKind>(["css", "scss", "less", "entry"]);
const BATCH = 6;

/** Words in repository names that say what a repository is, not whose: never the brand's name. */
const GENERIC_WORDS = new Set(
  (
    "app apps web www site website client clients dashboard portal portals studio system systems " +
    "frontend front backend back end ui admin mission control builder builders network core main " +
    "api server mobile docs the and platform cloud service services monorepo mono repo project " +
    "landing marketing home page pages store shop design tokens theme kit starter template next " +
    "react vite lovable new old dev prod staging test demo hub console engine tools tool lib"
  ).split(" "),
);

/** The words of the repositories' names that name the brand (`aurixa` from aurixa-systems and aurixa-builders). */
export function brandWords(refs: Pick<RepoRef, "repo">[]): string[] {
  const words = new Set<string>();
  for (const ref of refs)
    for (const word of ref.repo.toLowerCase().split(/[^a-z0-9]+/))
      if (word.length >= 3 && !/^\d+$/.test(word) && !GENERIC_WORDS.has(word)) words.add(word);
  return [...words].slice(0, 8);
}

export interface ScanRepoOptions {
  onStage?: (stage: string) => void;
  /** Words of the brand's name: its logo files are picked first. */
  brand?: string[];
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < items.length; at += size)
    out.push(...(await Promise.all(items.slice(at, at + size).map(run))));
  return out;
}

/**
 * One repository's styling files, read. Throws (RepoScanError) only when its
 * tree can't be read at all: a file that can't be read is recorded on the
 * scan and the rest carry on.
 */
export async function scanRepo(
  ref: RepoRef,
  source: RepoSource,
  options: ScanRepoOptions = {},
): Promise<RepoScan> {
  const { onStage } = options;
  const label = repoLabel(ref);
  onStage?.(`Reading ${label}'s files`);
  let tree: RepoTree;
  try {
    tree = await source.tree(ref);
  } catch (error) {
    throw new RepoScanError(
      label,
      error instanceof Error ? error.message : `${label} couldn't be read`,
    );
  }
  const plan = planCodeFiles(tree.files, { path: ref.path, brand: options.brand ?? [] });
  const paths = new Set(tree.files.map((file) => file.path));
  const sizes = new Map(tree.files.map((file) => [file.path, file.size] as const));
  const failed: RepoScan["failed"] = [];
  const texts = new Map<string, string>();
  let bytes = 0;

  const readAll = async (files: PlannedFile[]) => {
    await inBatches(files, BATCH, async (file) => {
      try {
        const text = await source.text(ref, tree.sha, file.path, CODE_SCAN_LIMITS.fileBytes);
        if (text === null) failed.push({ path: file.path, why: "it couldn't be read" });
        else {
          texts.set(file.path, text);
          bytes += text.length;
        }
      } catch (error) {
        failed.push({
          path: file.path,
          why: error instanceof Error ? error.message.slice(0, 200) : "it couldn't be read",
        });
      }
    });
  };

  onStage?.(`Reading ${label}'s styling code`);
  const first = plan.files.filter((file) => file.kind !== "logo");
  await readAll(first);

  // The stylesheets those import, and the one shadcn's config names, when the plan didn't have them.
  const planned = new Set(plan.files.map((file) => file.path));
  const kinds = new Map(plan.files.map((file) => [file.path, file.kind] as const));
  const more: PlannedFile[] = [];
  const consider = (path: string, why: string) => {
    if (planned.has(path) || !paths.has(path)) return;
    const kind = codeFileKind(path);
    if (!kind || !TEXT_KINDS.has(kind)) return;
    const size = sizes.get(path) ?? null;
    if ((size ?? 0) > CODE_SCAN_LIMITS.fileBytes) return;
    planned.add(path);
    more.push({ path, kind, size, why });
  };
  for (const [path, text] of texts) {
    const kind = kinds.get(path);
    if (kind && IMPORTING_KINDS.has(kind))
      for (const target of importedFiles(text, path, paths))
        consider(target, `imported by ${path}`);
    if (kind === "shadcn") {
      const reading = readCodeFile({ path, kind, text });
      const css = reading.shadcn?.css;
      if (css) consider(css.replace(/^\.\//, ""), "the theme stylesheet shadcn's config names");
    }
  }
  const extra: PlannedFile[] = [];
  let budget = CODE_SCAN_LIMITS.repoBytes - bytes;
  for (const file of more) {
    if (first.length + extra.length < CODE_SCAN_LIMITS.files && (file.size ?? 0) <= budget) {
      extra.push(file);
      budget -= file.size ?? 0;
    } else plan.skipped.push({ path: file.path, why: "over the scan's budget" });
  }
  if (extra.length) await readAll(extra);
  plan.files.push(...extra);

  const readings: FileReading[] = [];
  for (const file of plan.files) {
    if (file.kind === "logo") continue;
    const text = texts.get(file.path);
    if (text !== undefined) readings.push(readCodeFile({ path: file.path, kind: file.kind, text }));
  }
  if (tree.truncated)
    plan.skipped.push({
      path: "(the rest of the tree)",
      why: "the repository is too large to list in full",
    });
  return {
    ref,
    sha: tree.sha,
    readings,
    plan,
    failed,
    logos: plan.files.filter((file) => file.kind === "logo").map((file) => file.path),
  };
}

export interface ReposScanned {
  system: CodeDesignSystem;
  scans: RepoScan[];
  /** Repositories that couldn't be read at all, and why. */
  failed: { repo: string; why: string }[];
}

/**
 * Every repository given, read in order (the first is the primary) and
 * merged. A repository that can't be read is reported and left out; when
 * none can be, it throws the first one's reason.
 */
export async function scanRepos(
  refs: RepoRef[],
  source: RepoSource,
  options: Pick<ScanRepoOptions, "onStage"> = {},
): Promise<ReposScanned> {
  const scans: RepoScan[] = [];
  const failed: ReposScanned["failed"] = [];
  const chosen = refs.slice(0, CODE_SCAN_LIMITS.repos);
  const brand = brandWords(chosen);
  for (const ref of chosen) {
    try {
      scans.push(await scanRepo(ref, source, { ...options, brand }));
    } catch (error) {
      failed.push({
        repo: repoLabel(ref),
        why: error instanceof Error ? error.message : "it couldn't be read",
      });
    }
  }
  if (!scans.length)
    throw new RepoScanError(failed[0]?.repo ?? "", failed[0]?.why ?? "No repository could be read");
  options.onStage?.("Merging their design systems");
  const system = mergeCodeScans(scans);
  for (const failure of failed)
    system.notes.unshift(`${failure.repo} couldn't be read: ${failure.why}`);
  return { system, scans, failed };
}
