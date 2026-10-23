/**
 * Work that outlives a session (migration 0037_work_journal): a piece of work
 * that runs over many sessions, by Claude Code through the studio's API, by
 * the Supercomputer or by a person, each picking up where the last stopped.
 * What it keeps, its limits, and what anyone resuming it is told.
 *
 * Shared by the server, the browser and tests: nothing here reads or writes.
 */

export const WORK_MIGRATION = "0037_work_journal";
export const WORK_NEEDS_UPDATE = `Work in progress needs a database update (migration ${WORK_MIGRATION}). Ask an admin to apply it.`;

export const WORK_STATUSES = ["active", "blocked", "paused", "done", "abandoned"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  active: "Active",
  blocked: "Blocked",
  paused: "Paused",
  done: "Done",
  abandoned: "Abandoned",
};

export const STEP_STATUSES = ["todo", "doing", "done", "blocked", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const ENTRY_KINDS = [
  "start",
  "save",
  "auto",
  "turn",
  "interrupted",
  "note",
  "claim",
  "takeover",
  "release",
  "status",
  "link",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
/** What people see an entry's kind as. */
export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  start: "Started",
  save: "Saved",
  auto: "Saved by itself",
  turn: "Turn ended",
  interrupted: "Interrupted",
  note: "Note",
  claim: "Picked up",
  takeover: "Taken over",
  release: "Let go",
  status: "Status",
  link: "Attached",
};

export const ACTOR_KINDS = ["claude_code", "supercomputer", "person", "script", "studio"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];
export const HOLDER_KINDS = ["claude_code", "supercomputer", "person", "script"] as const;
export type HolderKind = (typeof HOLDER_KINDS)[number];
export const ACTOR_LABELS: Record<ActorKind, string> = {
  claude_code: "Claude Code",
  supercomputer: "Supercomputer",
  person: "A person",
  script: "A script",
  studio: "The studio",
};

export const LINK_KINDS = [
  "generation",
  "asset",
  "edit",
  "render",
  "long_video",
  "review_gate",
  "storyboard",
  "brief",
  "character",
  "brand_kit",
  "composition",
  "thread",
  "section_plan",
  "work",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  generation: "Generation",
  asset: "Library file",
  edit: "Edit",
  render: "Render",
  long_video: "Long video",
  review_gate: "Review gate",
  storyboard: "Storyboard",
  brief: "Creative brief",
  character: "Character",
  brand_kit: "Brand kit",
  composition: "Motion graphic",
  thread: "Supercomputer conversation",
  section_plan: "Sections",
  work: "Work",
};

const MIB = 1024 * 1024;

export const WORK_LIMITS = {
  /** A file is stored in parts of this size (the last part smaller). */
  chunkBytes: 32 * MIB,
  /** The most one part may be: the work-files bucket's own limit, 50 MiB. */
  blobMaxBytes: 50 * MIB,
  /** The most parts one file may have (128 GiB at 32 MiB a part). */
  chunksPerFile: 4096,
  filesPerSave: 500,
  blobsPerUpload: 200,
  /** The record (state) as JSON, and one change to it. */
  stateBytes: 1024 * 1024,
  patchBytes: 512 * 1024,
  summaryChars: 20_000,
  goalChars: 20_000,
  listItems: 50,
  listItemChars: 2_000,
  stepChanges: 100,
  linksPerSave: 200,
  /** How long a hold lasts unless renewed: 15 minutes, never less than one or more than a day. */
  holdSeconds: 900,
  holdMinSeconds: 60,
  holdMaxSeconds: 86_400,
} as const;

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type JsonObject = Record<string, unknown>;

export interface WorkStep {
  key: string;
  title: string;
  status: StepStatus;
  note: string;
  updated_at?: string;
}

export interface WorkRow {
  id: string;
  title: string;
  goal: string;
  status: WorkStatus;
  project_id: string | null;
  campaign_id: string | null;
  brand_kit_id: string | null;
  parent_work_id: string | null;
  steps: unknown;
  state: unknown;
  state_version: number;
  roots: unknown;
  code: unknown;
  holder: string | null;
  holder_label: string | null;
  holder_kind: string | null;
  held_since: string | null;
  heard_at: string | null;
  lease_expires_at: string | null;
  last_summary: string;
  next_steps: unknown;
  questions: unknown;
  entries: number;
  last_entry_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface JournalRow {
  id: string;
  n: number;
  work_id: string;
  kind: EntryKind;
  summary: string;
  next_steps: unknown;
  decisions: unknown;
  questions: unknown;
  step_changes: unknown;
  state_patch: unknown;
  state_version: number | null;
  files: unknown;
  links: unknown;
  changes: unknown;
  code: unknown;
  actor_kind: ActorKind;
  actor_session: string | null;
  actor_label: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FileRow {
  id: string;
  work_id: string;
  path: string;
  version: number;
  deleted: boolean;
  sha256: string | null;
  size: number | null;
  mime_type: string | null;
  chunks: unknown;
  modified_at: string | null;
  executable: boolean;
  note: string | null;
  asset_id: string | null;
  entry_id: string | null;
  created_at: string;
}

export interface LinkRow {
  id: string;
  work_id: string;
  kind: LinkKind;
  object_id: string;
  role: string | null;
  note: string | null;
  created_at: string;
}

/** A link with what the studio knows of the thing it points at. */
export interface LinkView extends LinkRow {
  title: string | null;
  status: string | null;
}

/** A row as it crosses to the browser: whatever it holds that is any JSON is JSON. */
type Serial<T> = { [K in keyof T]: unknown extends T[K] ? Json : T[K] };
export type WorkRowOut = Serial<WorkRow>;
export type JournalRowOut = Serial<JournalRow>;
export type FileRowOut = Serial<FileRow>;

/** A work as its page reads it. */
export interface WorkPageData {
  work: WorkRowOut;
  journal: JournalRowOut[];
  files: FileRowOut[];
  links: LinkView[];
  project: { id: string; name: string } | null;
  people: Record<string, string>;
  brief: string;
}

/** A work as a page or an agent sees it: the work, its latest entries, its files as they stand, its links. */
export interface WorkView {
  work: WorkRow;
  journal: JournalRow[];
  files: FileRow[];
  links: LinkView[];
  project: { id: string; name: string } | null;
  people: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Reading what is stored                                              */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A stored list of words (next steps, questions), each a line. */
export function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === "string" ? item : isRecord(item) ? String(item["text"] ?? "") : "",
        )
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

/** A stored list of decisions: what was decided and why. */
export function decisionsOf(value: unknown): { what: string; why: string }[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item === "string" && item.trim()) return [{ what: item.trim(), why: "" }];
        if (!isRecord(item)) return [];
        const what = String(item["what"] ?? "").trim();
        return what ? [{ what, why: String(item["why"] ?? "").trim() }] : [];
      })
    : [];
}

/** A stored plan. */
export function stepsOf(value: unknown): WorkStep[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item) || typeof item["key"] !== "string") return [];
        const status = (STEP_STATUSES as readonly string[]).includes(String(item["status"]))
          ? (item["status"] as StepStatus)
          : "todo";
        return [
          {
            key: item["key"],
            title: String(item["title"] ?? item["key"]),
            status,
            note: String(item["note"] ?? ""),
            ...(typeof item["updated_at"] === "string" ? { updated_at: item["updated_at"] } : {}),
          },
        ];
      })
    : [];
}

/** A work's roots: where its files sit on a machine, by name. */
export function rootsOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && isRootName(entry[0]),
    ),
  );
}

export interface CodeVersion {
  repository?: string;
  branch?: string;
  commit?: string;
  dirty?: boolean;
  /** The branch it follows on a remote ("origin/claude/eager-bell-1y7y1m"). */
  upstream?: string;
  /** How many of its commits no remote held when it was saved: only that machine, or the work, has them. */
  unpushed?: number;
}

export function codeOf(value: unknown): CodeVersion | null {
  if (!isRecord(value)) return null;
  const code: CodeVersion = {};
  if (typeof value["repository"] === "string") code.repository = value["repository"];
  if (typeof value["branch"] === "string") code.branch = value["branch"];
  if (typeof value["commit"] === "string") code.commit = value["commit"];
  if (typeof value["dirty"] === "boolean") code.dirty = value["dirty"];
  if (typeof value["upstream"] === "string") code.upstream = value["upstream"];
  if (
    typeof value["unpushed"] === "number" &&
    Number.isInteger(value["unpushed"]) &&
    value["unpushed"] >= 0
  )
    code.unpushed = value["unpushed"];
  return Object.keys(code).length ? code : null;
}

/** Where scripts/studio-work/work.py keeps the code with a work, in its own root: see snapshot_code there. */
export const CODE_SNAPSHOT = {
  bundle: "work/code/commits.bundle",
  patch: "work/code/uncommitted.patch",
  state: "work/code/state.json",
} as const;

/**
 * The code a work last ran on, in a sentence: its repository, branch and
 * commit, what no remote held then, and where that is kept (the code
 * snapshot, when the work holds one).
 */
export function codeLine(code: CodeVersion, paths: Iterable<string> = []): string {
  const held = new Set(paths);
  const base = `${code.repository ? `${code.repository}, ` : ""}${code.branch && code.branch !== "HEAD" ? `branch ${code.branch}` : "a commit"}${code.commit ? ` at ${code.commit.slice(0, 12)}` : ""}`;
  const loose = [
    code.unpushed
      ? `${code.unpushed} commit${code.unpushed === 1 ? "" : "s"} no remote held`
      : null,
    code.dirty ? "changes not committed" : null,
  ].filter((part): part is string => !!part);
  if (!loose.length) return `${base}.`;
  const kept: string[] = [];
  if (code.unpushed && held.has(CODE_SNAPSHOT.bundle)) kept.push(CODE_SNAPSHOT.bundle);
  if (code.dirty && held.has(CODE_SNAPSHOT.patch)) kept.push(CODE_SNAPSHOT.patch);
  return `${base}, with ${loose.join(" and ")} when last saved${
    kept.length
      ? `: kept with the work (${kept.join(", ")})`
      : code.dirty
        ? " (what its roots hold is kept as its files)"
        : ""
  }.`;
}

/* ------------------------------------------------------------------ */
/* Paths and bytes                                                     */
/* ------------------------------------------------------------------ */

const SHA256 = /^[0-9a-f]{64}$/;
const MD5 = /^[0-9a-f]{32}$/;
export const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && SHA256.test(value);
export const isMd5 = (value: unknown): value is string =>
  typeof value === "string" && MD5.test(value);

/** A root's name: what a file's path starts with ("records", "renders", "work"). */
export function isRootName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/i.test(name);
}

/**
 * A file's path in a work: a root's name, then its path under it, with "/"
 * between: never absolute, never climbing out, nothing unprintable. The same
 * rule as the table's (0037_work_journal).
 */
export function isWorkPath(path: string): boolean {
  if (path.length < 1 || path.length > 500) return false;
  if (path.startsWith("/") || path.includes("//") || path.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some((part) => part === "." || part === ".." || part === "")) return false;
  return isRootName(parts[0]!) && parts.length >= 2;
}

/** The root a path is under. */
export const rootOf = (path: string) => path.split("/")[0]!;

/** Where a part of a work's file is kept in the work-files bucket. */
export const blobPath = (workId: string, sha256: string) =>
  `${workId}/${sha256.slice(0, 2)}/${sha256}`;

/** How many parts a file of this size is stored in. */
export const chunkCount = (size: number) =>
  size <= 0 ? 0 : Math.ceil(size / WORK_LIMITS.chunkBytes);

/** A size for people: 1.2 GB, 340 KB. */
export function sizeLabel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A work's files as they stand: each path's latest version, unless it deletes the path. */
export function currentFiles<T extends Pick<FileRow, "path" | "version" | "deleted">>(
  rows: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const before = latest.get(row.path);
    if (!before || row.version > before.version) latest.set(row.path, row);
  }
  return [...latest.values()].filter((row) => !row.deleted).sort((a, b) => byPath(a.path, b.path));
}

/**
 * Paths in the order a page of them is read in: by their characters' codes,
 * the order `path > after` pages by (a locale's order would put "B" after "a"
 * and a page could skip it).
 */
export const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

/**
 * RFC 7386 JSON merge patch, as the database applies it (work_merge_patch):
 * an object's keys merged in, a null removing its key, anything else
 * replacing what was there.
 */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) return patch;
  const result: JsonObject = isRecord(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

/** The merge patch that turns one record into another (what changed). */
export function diffPatch(before: unknown, after: unknown): JsonObject | null {
  if (!isRecord(after)) return null;
  const base = isRecord(before) ? before : {};
  const patch: JsonObject = {};
  for (const key of Object.keys(base)) if (!(key in after)) patch[key] = null;
  for (const [key, value] of Object.entries(after)) {
    const old = base[key];
    if (isRecord(value) && isRecord(old)) {
      const inner = diffPatch(old, value);
      if (inner && Object.keys(inner).length) patch[key] = inner;
    } else if (JSON.stringify(old) !== JSON.stringify(value)) {
      // A null in the record can't be written by a merge patch (it means "remove"): left out.
      if (value !== null) patch[key] = value;
    }
  }
  return patch;
}

/* ------------------------------------------------------------------ */
/* Who holds it                                                        */
/* ------------------------------------------------------------------ */

export interface Hold {
  /** free: nobody; held: someone, and they were heard from in time; lapsed: they stopped renewing it. */
  state: "free" | "held" | "lapsed";
  holder: string | null;
  label: string | null;
  kind: HolderKind | null;
  heardAt: string | null;
  expiresAt: string | null;
  /** Minutes since its holder was last heard from. */
  heardMinutesAgo: number | null;
}

export function holdOf(
  work: Pick<WorkRow, "holder" | "holder_label" | "holder_kind" | "heard_at" | "lease_expires_at">,
  now: Date = new Date(),
): Hold {
  const kind = (HOLDER_KINDS as readonly string[]).includes(String(work.holder_kind))
    ? (work.holder_kind as HolderKind)
    : null;
  const heard = work.heard_at ? new Date(work.heard_at).getTime() : NaN;
  const heardMinutesAgo = Number.isFinite(heard)
    ? Math.max(0, Math.round((now.getTime() - heard) / 60_000))
    : null;
  if (!work.holder)
    return {
      state: "free",
      holder: null,
      label: null,
      kind: null,
      heardAt: work.heard_at,
      expiresAt: null,
      heardMinutesAgo,
    };
  const expires = work.lease_expires_at ? new Date(work.lease_expires_at).getTime() : 0;
  return {
    state: expires > now.getTime() ? "held" : "lapsed",
    holder: work.holder,
    label: work.holder_label,
    kind,
    heardAt: work.heard_at,
    expiresAt: work.lease_expires_at,
    heardMinutesAgo,
  };
}

/** "3 minutes ago", "5 hours ago", "2 days ago". */
export function agoLabel(minutes: number | null): string {
  if (minutes === null) return "at an unknown time";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Who holds a work, in a line. */
export function holdLine(hold: Hold): string {
  const who = hold.label ?? hold.holder ?? "someone";
  if (hold.state === "held")
    return `${who} is working on it (last heard from ${agoLabel(hold.heardMinutesAgo)}).`;
  if (hold.state === "lapsed")
    return `Nobody is working on it: ${who} stopped renewing its hold (last heard from ${agoLabel(hold.heardMinutesAgo)}), so it is free to pick up.`;
  return "Nobody is working on it: it is free to pick up.";
}

/* ------------------------------------------------------------------ */
/* What an operation made                                              */
/* ------------------------------------------------------------------ */

export interface LinkTarget {
  kind: LinkKind;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids an operation's answer (or its arguments) names, by their key, as the things they are. */
const KEYS: Record<string, LinkKind> = {
  generationId: "generation",
  generationIds: "generation",
  assetId: "asset",
  assetIds: "asset",
  outputAssetId: "asset",
  resultAssetId: "asset",
  sequenceId: "edit",
  renderId: "render",
  longVideoId: "long_video",
  characterId: "character",
  gateId: "review_gate",
  storyboardId: "storyboard",
  briefId: "brief",
  threadId: "thread",
  planId: "section_plan",
};

/** Where a key means something else in one operation's answer. */
const OVERRIDES: Record<string, Partial<Record<string, LinkKind | null>>> = {
  // A motion graphic's drawing is a composition render, not an edit's render.
  draw_motion_graphic: { renderId: "composition" },
  // A brief read for a storyboard is used, not made; the storyboard is what the work keeps.
  import_storyboard_brief: { briefId: "brief" },
};

/**
 * What an operation made or changed, for the work it was run for: the ids
 * its answer names (to any depth, in lists too) and those its arguments name
 * at their top (the edit it changed, the long video it steered). The inputs
 * a generation takes are its own record, not the work's.
 */
export function linksFromCall(tool: string, args: unknown, result: unknown): LinkTarget[] {
  const found = new Map<string, LinkTarget>();
  const keyKind = (key: string): LinkKind | null => {
    const override = OVERRIDES[tool];
    if (override && key in override) return override[key] ?? null;
    return KEYS[key] ?? null;
  };
  const add = (kind: LinkKind | null, value: unknown) => {
    if (!kind) return;
    for (const item of Array.isArray(value) ? value : [value])
      if (typeof item === "string" && UUID.test(item))
        found.set(`${kind}:${item}`, { kind, id: item.toLowerCase() });
  };
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 500)) walk(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      add(keyKind(key), item);
      if (item && typeof item === "object") walk(item, depth + 1);
    }
  };
  walk(result, 0);
  if (isRecord(args))
    for (const [key, item] of Object.entries(args)) {
      if (key === "inputs" || key === "projectId" || key === "campaignId" || key === "brandKitId")
        continue;
      add(keyKind(key), item);
    }
  return [...found.values()].slice(0, WORK_LIMITS.linksPerSave);
}

/** What to give Claude Code to carry a work on. */
export function claudeCodePrompt(work: { id: string; title: string }): string {
  return [
    `Carry on with the Xeno Studio work “${work.title}” (work ${work.id}).`,
    `In the canvas-xeno-studio repository, run: python3 scripts/studio-work/work.py resume ${work.id}`,
    'It takes the work up for this session, puts its files and code back and prints where it stands. Then carry on with its next step, saving as you go (work.py save -m "what was done" --next "what comes next").',
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* What anyone resuming it is told                                     */
/* ------------------------------------------------------------------ */

const STEP_MARK: Record<StepStatus, string> = {
  done: "[x]",
  doing: "[>]",
  todo: "[ ]",
  blocked: "[!]",
  skipped: "[-]",
};

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
const firstLine = (text: string) =>
  text
    .split("\n")
    .find((line) => line.trim())
    ?.trim() ?? "";
const utc = (iso: string | null) =>
  iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "an unknown time";

/** Who wrote an entry, for people and agents. */
export function actorLine(
  entry: Pick<JournalRow, "actor_kind" | "actor_label" | "actor_session" | "created_by">,
  people: Record<string, string> = {},
): string {
  const label = entry.actor_label || ACTOR_LABELS[entry.actor_kind] || entry.actor_kind;
  const person = entry.created_by ? people[entry.created_by] : null;
  return person && entry.actor_kind !== "person" ? `${label}, for ${person}` : (person ?? label);
}

export interface BriefOptions {
  now?: Date;
  /** How the brief tells Claude Code to pick it up (the CLI's path in the repository). */
  cli?: string;
  /** The most characters the brief runs to. */
  maxChars?: number;
}

/**
 * Everything someone picking up a work needs, in Markdown: what it is for,
 * who has it, its plan, what was last done and comes next, what was decided,
 * the questions left for a person, the latest of its journal, its record,
 * its files, what it made in the studio, the code it ran on, and how to carry
 * on. Written for an agent (the Supercomputer's context, Claude Code's
 * session start) and readable by a person.
 */
export function resumeBrief(view: WorkView, options: BriefOptions = {}): string {
  const { work, journal, files, links, project, people } = view;
  const now = options.now ?? new Date();
  const cli = options.cli ?? "scripts/studio-work/work.py";
  const max = options.maxChars ?? 24_000;
  const hold = holdOf(work, now);
  const steps = stepsOf(work.steps);
  const out: string[] = [];

  out.push(`# Work: ${work.title}`);
  out.push(
    [
      `Work id ${work.id}`,
      `status ${work.status}`,
      project ? `project ${project.name} (${project.id})` : "no project",
      `${work.entries} journal entr${work.entries === 1 ? "y" : "ies"}`,
      work.last_entry_at ? `last written ${utc(work.last_entry_at)}` : "nothing written yet",
    ].join(" · "),
  );
  out.push(holdLine(hold));
  if (work.goal.trim()) out.push("", "## Goal", clip(work.goal.trim(), 4000));

  if (steps.length) {
    const done = steps.filter((step) => step.status === "done").length;
    out.push("", `## Plan (${done} of ${steps.length} done)`);
    for (const step of steps)
      out.push(
        `- ${STEP_MARK[step.status]} ${step.key}: ${step.title}${step.note ? ` — ${clip(step.note, 300)}` : ""}`,
      );
  }

  // The last account of its progress; an interruption after it is said apart (it isn't progress).
  const latest = journal.find(
    (entry) =>
      ["save", "turn", "start", "note", "status"].includes(entry.kind) && entry.summary.trim(),
  );
  const next = textList(work.next_steps);
  const questions = textList(work.questions);
  out.push("", "## Where it stands");
  if (latest)
    out.push(
      `Last account (${ENTRY_KIND_LABELS[latest.kind].toLowerCase()}, ${utc(latest.created_at)}, ${actorLine(latest, people)}):`,
      clip(latest.summary.trim(), 6000),
    );
  else
    out.push(
      work.last_summary.trim()
        ? clip(work.last_summary.trim(), 6000)
        : "Nothing has been written yet.",
    );
  const interrupted = journal.find((entry) => entry.kind === "interrupted");
  if (interrupted && (!latest || interrupted.n > latest.n))
    out.push(
      "",
      `Its last turn was cut short (${utc(interrupted.created_at)}): ${clip(firstLine(interrupted.summary), 400)}`,
    );
  if (next.length)
    out.push("", "Next steps:", ...next.map((step, index) => `${index + 1}. ${clip(step, 600)}`));
  if (questions.length)
    out.push("", "Waiting on a person:", ...questions.map((item) => `- ${clip(item, 600)}`));

  const decisions = journal.flatMap((entry) =>
    decisionsOf(entry.decisions).map((decision) => ({ ...decision, at: entry.created_at })),
  );
  if (decisions.length) {
    out.push("", "## Decided (latest first)");
    for (const decision of decisions.slice(0, 20))
      out.push(
        `- ${clip(decision.what, 300)}${decision.why ? ` — because ${clip(decision.why, 300)}` : ""} (${decision.at.slice(0, 10)})`,
      );
    if (decisions.length > 20)
      out.push(`- and ${decisions.length - 20} earlier (get_work with more entries)`);
  }

  if (journal.length) {
    out.push("", `## Journal (latest ${Math.min(journal.length, 15)})`);
    for (const entry of journal.slice(0, 15)) {
      const what =
        firstLine(entry.summary) ||
        (Array.isArray(entry.files) && entry.files.length
          ? `${entry.files.length} file${entry.files.length === 1 ? "" : "s"} kept`
          : Array.isArray(entry.links) && entry.links.length
            ? `${entry.links.length} attached`
            : "");
      out.push(
        `- ${utc(entry.created_at)} · ${ENTRY_KIND_LABELS[entry.kind]} · ${actorLine(entry, people)}${what ? `: ${clip(what, 240)}` : ""}`,
      );
    }
  }

  const state = JSON.stringify(work.state ?? {}, null, 1);
  if (state !== "{}") {
    out.push(
      "",
      `## Its record (version ${work.state_version})`,
      "```json",
      clip(state, 6000),
      "```",
    );
    if (state.length > 6000)
      out.push(
        `(The record runs to ${state.length} characters: get_work with includeState for all of it.)`,
      );
  }

  if (files.length) {
    const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    out.push(
      "",
      `## Files (${files.length}, ${sizeLabel(total)})`,
      `Every version is kept. On a machine, \`python3 ${cli} pull\` puts them back (each checked against its SHA-256).`,
    );
    const roots = rootsOf(work.roots);
    if (Object.keys(roots).length)
      out.push(
        `Roots: ${Object.entries(roots)
          .map(([name, path]) => `${name} → ${path}`)
          .join(", ")}`,
      );
    for (const file of files.slice(0, 60))
      out.push(
        `- ${file.path} · ${sizeLabel(file.size)} · v${file.version}${file.note ? ` — ${clip(file.note, 120)}` : ""}`,
      );
    if (files.length > 60) out.push(`- and ${files.length - 60} more (get_work_files)`);
  }

  if (links.length) {
    out.push("", `## In the studio (${links.length})`);
    for (const link of links.slice(0, 60))
      out.push(
        `- ${LINK_KIND_LABELS[link.kind]} ${link.object_id}${link.title ? ` · ${clip(link.title, 100)}` : ""}${link.status ? ` · ${link.status}` : ""}${link.role ? ` — ${clip(link.role, 120)}` : ""}`,
      );
    if (links.length > 60) out.push(`- and ${links.length - 60} more`);
  }

  const code = codeOf(work.code);
  if (code) {
    const paths = files.map((file) => file.path);
    out.push("", "## Code", codeLine(code, paths));
    if (paths.includes(CODE_SNAPSHOT.state))
      out.push(
        `\`python3 ${cli} resume\` puts it back where nothing in the checkout is disturbed; otherwise \`python3 ${cli} restore-code\` checks it out (or \`restore-code --here\` brings it onto the branch you are on).`,
      );
  }

  out.push(
    "",
    "## To carry on",
    `- Claude Code: \`python3 ${cli} resume ${work.id}\` takes it up, puts its files and code back and prints this. Save as you go: \`python3 ${cli} save -m "what was done" --next "what comes next"\`; this repository's hooks also keep its files and code every few minutes, save each turn's last words, and say when a turn is cut short.`,
    "- The studio's API or MCP: claim_work, then save_work as you go; pass workId to the operations that make things, and what they make is kept with the work.",
    "- The Supercomputer: open the work on the Work page and press Continue in Supercomputer.",
  );

  const text = out.join("\n");
  return text.length <= max
    ? text
    : `${text.slice(0, max - 80).trimEnd()}\n\n(The brief is cut at ${max} characters: get_work has all of it.)`;
}
