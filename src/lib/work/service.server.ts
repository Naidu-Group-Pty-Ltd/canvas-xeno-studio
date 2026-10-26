/**
 * Work that outlives a session, kept in the database (migration
 * 0037_work_journal): made, listed and read; held by one session at a time;
 * saved as it goes (its journal, record, plan, files and links in one
 * transaction, work_save); its files' parts uploaded straight to storage and
 * checked there before a save may name them. The studio API, the
 * Supercomputer and the app all go through here, as the member they act for.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { isMissingColumnError, isMissingTableError } from "../edit/errors";
import {
  blobPath,
  byPath,
  isMd5,
  isSha256,
  isWorkPath,
  linksFromCall,
  resumeBrief,
  stepsOf,
  textList,
  WORK_LIMITS,
  WORK_NEEDS_UPDATE,
  type ActorKind,
  type BriefOptions,
  type CodeVersion,
  type EntryKind,
  type FileRow,
  type HolderKind,
  type JournalRow,
  type LinkKind,
  type LinkRow,
  type LinkTarget,
  type LinkView,
  type WorkRow,
  type WorkStatus,
  type WorkView,
  holdOf,
  type Json as ModelJson,
} from "./model";

export const WORK_BUCKET = "work-files";

/** Who is doing something to a work: the member they act for, and the session doing it. */
export interface WorkActor {
  /** The member (null for the studio itself). */
  userId: string | null;
  kind: ActorKind;
  /** The session's id: what holds the work while it works on it. */
  session: string | null;
  /** What to call the session ("Claude Code session 0467c194", "Supercomputer: Reel 2"). */
  label: string | null;
}

export interface StepChange {
  key: string;
  title?: string;
  status?: string;
  note?: string;
  remove?: boolean;
}

export interface FileChange {
  path: string;
  deleted?: boolean;
  sha256?: string;
  size?: number;
  chunks?: string[];
  mimeType?: string | null;
  modifiedAt?: string | null;
  executable?: boolean;
  note?: string | null;
}

export interface LinkChange {
  kind: LinkKind;
  id: string;
  role?: string | null;
  note?: string | null;
}

type PgError = { code?: string; message?: string; details?: string } | null;
type JsonObject = Record<string, unknown>;

/** What a failed read or write says: the update the database needs, the rule a save broke, or that it failed. */
function failure(error: PgError, fallback: string): AppError {
  if (
    isMissingTableError(error) ||
    error?.code === "PGRST202" ||
    /function .* does not exist|could not find the function/i.test(error?.message ?? "") ||
    isMissingColumnError(error, "work_id")
  )
    return new AppError("INVALID_PARAMETERS", WORK_NEEDS_UPDATE);
  // The rules the database holds a save to (0037_work_journal): its own words.
  if (error?.code === "23514" || error?.code === "P0001")
    return new AppError(
      "INVALID_PARAMETERS",
      (error.message ?? fallback).replace(/^ERROR:\s*/, ""),
    );
  if (error?.code === "22P02")
    return new AppError(
      "INVALID_PARAMETERS",
      "A value isn't of the right kind (an id that isn't one?)",
    );
  if (error?.code === "23503")
    return new AppError(
      "INVALID_PARAMETERS",
      "Something it names (a project, a kit, a file) doesn't exist",
    );
  if (error?.message)
    console.error("work: database refused", { code: error.code, message: error.message });
  return new AppError("UNKNOWN", fallback);
}

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Whether the database has work in progress yet (0037 applied). */
export async function workReady(): Promise<boolean> {
  const { error } = await db.from("works").select("id").limit(1);
  return !error || !isMissingTableError(error);
}

/** The member doing it: active, or turned away. */
export async function activeMember(userId: string): Promise<{ role: string; name: string | null }> {
  const { data } = await db
    .from("profiles")
    .select("is_active,role,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "That account is not an active team member");
  return { role: data.role, name: data.full_name ?? null };
}

/** A work's id, title, project and status (what an operation run for it needs). */
export async function workRef(workId: string): Promise<{
  id: string;
  title: string;
  project_id: string | null;
  status: WorkStatus;
  brand_kit_id: string | null;
}> {
  const { data, error } = await db
    .from("works")
    .select("id,title,project_id,status,brand_kit_id")
    .eq("id", workId)
    .maybeSingle();
  if (error) throw failure(error, "The work couldn't be read");
  if (!data) throw new AppError("INVALID_PARAMETERS", "That work doesn't exist");
  return data as {
    id: string;
    title: string;
    project_id: string | null;
    status: WorkStatus;
    brand_kit_id: string | null;
  };
}

async function exists(
  table: "projects" | "campaigns" | "brand_kits" | "works",
  id: string | null | undefined,
  what: string,
) {
  if (!id) return;
  const { data } = await db.from(table).select("id").eq("id", id).maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", `That ${what} doesn't exist`);
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

/**
 * A project, made for its owner. The same name from the same member within
 * ten minutes returns that project (a retried request), not a second one.
 */
export async function createProject(input: {
  userId: string;
  name: string;
  description?: string | null;
}): Promise<{ projectId: string; created: boolean; name: string }> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new AppError("INVALID_PARAMETERS", "A project needs a name");
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent } = await db
    .from("projects")
    .select("id,name,created_at")
    .eq("created_by", input.userId)
    .eq("name", name)
    .gte("created_at", since as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) return { projectId: recent.id, created: false, name: recent.name };
  const { data, error } = await db
    .from("projects")
    .insert({ name, description: input.description?.trim() || null, created_by: input.userId })
    .select("id,name")
    .single();
  if (error || !data) throw new AppError("UNKNOWN", "The project couldn't be made");
  return { projectId: data.id, created: true, name: data.name };
}

/* ------------------------------------------------------------------ */
/* Making and reading works                                            */
/* ------------------------------------------------------------------ */

export interface CreateWorkInput {
  actor: WorkActor & { userId: string };
  title: string;
  goal?: string;
  /** The project its work goes in: undefined makes one named after it, null puts it in none. */
  projectId?: string | null;
  projectName?: string;
  campaignId?: string | null;
  brandKitId?: string | null;
  parentWorkId?: string | null;
  steps?: StepChange[];
  state?: JsonObject;
  roots?: Record<string, string>;
  nextSteps?: string[];
  clientRequestId?: string | null;
  /** Its maker holds it from the start (for holdSeconds). */
  hold?: boolean;
  holdSeconds?: number;
}

/**
 * A new work: its project (made for it unless one is named, so what it makes
 * is never left unassigned), its first entry (its goal, plan and record), and
 * its maker holding it. The same request id returns the first.
 */
export async function createWork(input: CreateWorkInput) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new AppError("INVALID_PARAMETERS", "A work needs a title");
  if (input.clientRequestId) {
    const { data: before, error } = await db
      .from("works")
      .select("id,project_id")
      .eq("created_by", input.actor.userId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (error) throw failure(error, "The work couldn't be read");
    if (before)
      return {
        workId: before.id,
        created: false,
        projectId: before.project_id,
        projectCreated: false,
      };
  }
  await Promise.all([
    exists("projects", input.projectId, "project"),
    exists("campaigns", input.campaignId, "campaign"),
    exists("brand_kits", input.brandKitId, "brand kit"),
    exists("works", input.parentWorkId, "parent work"),
  ]);
  const { data: work, error } = await db
    .from("works")
    .insert({
      title,
      goal: (input.goal ?? "").slice(0, WORK_LIMITS.goalChars),
      project_id: input.projectId ?? null,
      campaign_id: input.campaignId ?? null,
      brand_kit_id: input.brandKitId ?? null,
      parent_work_id: input.parentWorkId ?? null,
      roots: (input.roots ?? {}) as Json,
      client_request_id: input.clientRequestId ?? null,
      created_by: input.actor.userId,
    })
    .select("id,project_id")
    .single();
  if (error || !work) {
    // Made at the same moment by the same request: that one.
    if (error?.code === "23505" && input.clientRequestId) {
      const { data: raced } = await db
        .from("works")
        .select("id,project_id")
        .eq("created_by", input.actor.userId)
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle();
      if (raced)
        return {
          workId: raced.id,
          created: false,
          projectId: raced.project_id,
          projectCreated: false,
        };
    }
    throw failure(error, "The work couldn't be made");
  }
  let projectId = work.project_id;
  let projectCreated = false;
  if (input.projectId === undefined) {
    const project = await createProject({
      userId: input.actor.userId,
      name: input.projectName?.trim() || title,
      description: `Made for the work “${title}”.`,
    });
    projectId = project.projectId;
    projectCreated = project.created;
    await db.from("works").update({ project_id: projectId }).eq("id", work.id);
  }
  await saveWork(work.id, input.actor, {
    kind: "start",
    summary: input.goal?.trim() ? `Started: ${input.goal.trim().slice(0, 2000)}` : "Started.",
    stepChanges: input.steps ?? [],
    ...(input.state && Object.keys(input.state).length ? { statePatch: input.state } : {}),
    ...(input.nextSteps?.length ? { nextSteps: input.nextSteps } : {}),
    clientRequestId: input.clientRequestId ? `${input.clientRequestId.slice(0, 56)}-start` : null,
    hold: false,
  });
  const hold =
    input.hold && input.actor.session
      ? await claimWork(
          work.id,
          input.actor,
          input.holdSeconds !== undefined ? { seconds: input.holdSeconds } : {},
        )
      : null;
  return { workId: work.id, created: true, projectId, projectCreated, hold };
}

const SUMMARY_COLUMNS =
  "id,title,status,project_id,parent_work_id,holder,holder_label,holder_kind,heard_at,lease_expires_at,last_summary,next_steps,questions,entries,last_entry_at,steps,created_by,created_at,finished_at";

/** Works, latest first: those in progress unless finished ones are asked for. */
export async function listWorks(input: {
  statuses?: WorkStatus[];
  projectId?: string | null;
  search?: string | null;
  includeFinished?: boolean;
  limit?: number;
}) {
  let query = db
    .from("works")
    .select(SUMMARY_COLUMNS)
    .order("last_entry_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 200));
  if (input.statuses?.length) query = query.in("status", input.statuses);
  else if (!input.includeFinished) query = query.in("status", ["active", "blocked", "paused"]);
  if (input.projectId) query = query.eq("project_id", input.projectId);
  if (input.search?.trim())
    query = query.ilike("title", `%${input.search.trim().replace(/[%_*\\]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw failure(error, "The works couldn't be read");
  const rows = (data ?? []) as unknown as WorkRow[];
  const projectIds = [
    ...new Set(rows.map((row) => row.project_id).filter((id): id is string => !!id)),
  ];
  const { data: projects } = projectIds.length
    ? await db.from("projects").select("id,name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const now = new Date();
  return rows.map((row) => {
    const steps = stepsOf(row.steps);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      projectId: row.project_id,
      projectName: (projects ?? []).find((project) => project.id === row.project_id)?.name ?? null,
      parentWorkId: row.parent_work_id,
      hold: holdOf(row, now),
      lastSummary:
        row.last_summary.length > 600 ? `${row.last_summary.slice(0, 599)}…` : row.last_summary,
      nextSteps: textList(row.next_steps).slice(0, 5),
      questions: textList(row.questions).length,
      steps: { done: steps.filter((step) => step.status === "done").length, total: steps.length },
      entries: row.entries,
      lastEntryAt: row.last_entry_at,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    };
  });
}

const FILE_COLUMNS =
  "id,work_id,path,version,deleted,sha256,size,mime_type,modified_at,executable,note,asset_id,entry_id,created_at";

/** A work's files as they stand (each path's latest version), a page at a time. */
async function currentFileRows(workId: string, withChunks: boolean): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .rpc("work_files_now", { p_work_id: workId })
      .select(withChunks ? `${FILE_COLUMNS},chunks` : FILE_COLUMNS)
      .range(from, from + 999);
    if (error) throw failure(error, "The work's files couldn't be read");
    const page = (data ?? []) as unknown as FileRow[];
    rows.push(...page.map((row) => ({ ...row, chunks: withChunks ? row.chunks : [] })));
    if (page.length < 1000) break;
  }
  return rows;
}

/** What the studio knows of the things a work's links point at: a title and a status for each. */
async function linkViews(links: LinkRow[]): Promise<LinkView[]> {
  const byKind = new Map<LinkKind, string[]>();
  for (const link of links)
    byKind.set(link.kind, [...(byKind.get(link.kind) ?? []), link.object_id]);
  const facts = new Map<string, { title: string | null; status: string | null }>();
  const read = async (
    kind: LinkKind,
    table: string,
    columns: string,
    describe: (row: JsonObject) => { title: string | null; status: string | null },
  ) => {
    const ids = byKind.get(kind);
    if (!ids?.length) return;
    for (let at = 0; at < ids.length; at += 200) {
      const { data, error } = await db
        .from(table as never)
        .select(columns)
        .in("id", ids.slice(at, at + 200));
      if (error) return; // A table not there yet: its links show their ids.
      for (const row of (data ?? []) as unknown as JsonObject[])
        facts.set(`${kind}:${String(row["id"])}`, describe(row));
    }
  };
  const text = (value: unknown, max = 120) =>
    typeof value === "string" && value.trim()
      ? value.replace(/\s+/g, " ").trim().slice(0, max)
      : null;
  await Promise.all([
    read("generation", "generations", "id,prompt,status,model_path", (row) => ({
      title: text(row["prompt"]) ?? text(row["model_path"]),
      status: text(row["status"]),
    })),
    read("asset", "assets", "id,title,asset_type,deleted_at", (row) => ({
      title: text(row["title"]),
      status: row["deleted_at"] ? "removed" : text(row["asset_type"]),
    })),
    read("edit", "sequences", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
    read("render", "sequence_renders", "id,status,sequence_version", (row) => ({
      title: `Render of version ${String(row["sequence_version"])}`,
      status: text(row["status"]),
    })),
    read("long_video", "long_videos", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
    read("review_gate", "review_gates", "id,name", (row) => ({
      title: text(row["name"]),
      status: null,
    })),
    read("storyboard", "storyboards", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
    read("brief", "creative_briefs", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
    read("character", "characters", "id,name", (row) => ({
      title: text(row["name"]),
      status: null,
    })),
    read("brand_kit", "brand_kits", "id,name", (row) => ({
      title: text(row["name"]),
      status: null,
    })),
    read("composition", "composition_renders", "id,template,status", (row) => ({
      title: text(row["template"]),
      status: text(row["status"]),
    })),
    read("thread", "supercomputer_threads", "id,title", (row) => ({
      title: text(row["title"]),
      status: null,
    })),
    read("section_plan", "supercomputer_section_plans", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
    read("work", "works", "id,title,status", (row) => ({
      title: text(row["title"]),
      status: text(row["status"]),
    })),
  ]);
  return links.map((link) => ({
    ...link,
    ...(facts.get(`${link.kind}:${link.object_id}`) ?? { title: null, status: null }),
  }));
}

/**
 * A work as a page or an agent sees it: the work (with its record), its
 * latest entries, its files as they stand, and its links with what they are.
 */
export async function loadWorkView(
  workId: string,
  options: { entries?: number; before?: number | null } = {},
): Promise<WorkView> {
  const { data: work, error } = await db.from("works").select("*").eq("id", workId).maybeSingle();
  if (error) throw failure(error, "The work couldn't be read");
  if (!work) throw new AppError("INVALID_PARAMETERS", "That work doesn't exist");
  let journalQuery = db
    .from("work_journal")
    .select("*")
    .eq("work_id", workId)
    .order("n", { ascending: false })
    .limit(Math.min(Math.max(options.entries ?? 30, 1), 500));
  if (options.before) journalQuery = journalQuery.lt("n", options.before);
  const [journal, files, links, project] = await Promise.all([
    journalQuery,
    currentFileRows(workId, false),
    db
      .from("work_links")
      .select("id,work_id,kind,object_id,role,note,created_at")
      .eq("work_id", workId)
      .order("created_at", { ascending: false })
      .limit(1000),
    work.project_id
      ? db.from("projects").select("id,name").eq("id", work.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (journal.error) throw failure(journal.error, "The work's journal couldn't be read");
  const entries = (journal.data ?? []) as unknown as JournalRow[];
  const people: Record<string, string> = {};
  const ids = [
    ...new Set(
      [work.created_by, ...entries.map((entry) => entry.created_by)].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  if (ids.length) {
    const { data: profiles } = await db.from("profiles").select("id,full_name,email").in("id", ids);
    for (const profile of profiles ?? [])
      people[profile.id] = profile.full_name?.trim() || profile.email.split("@")[0]!;
  }
  return {
    work: work as unknown as WorkRow,
    journal: entries,
    files,
    links: await linkViews((links.data ?? []) as unknown as LinkRow[]),
    project: (project.data as { id: string; name: string } | null) ?? null,
    people,
  };
}

/** A work's brief: everything someone picking it up needs (see resumeBrief). */
export async function workBrief(workId: string, options: BriefOptions & { entries?: number } = {}) {
  const view = await loadWorkView(workId, { entries: options.entries ?? 40 });
  return { view, brief: resumeBrief(view, options) };
}

/* ------------------------------------------------------------------ */
/* Holding                                                             */
/* ------------------------------------------------------------------ */

const holderKind = (kind: ActorKind): HolderKind => (kind === "studio" ? "script" : kind);

function holdSeconds(seconds: number | undefined): number {
  return Math.min(
    Math.max(Math.round(seconds ?? WORK_LIMITS.holdSeconds), WORK_LIMITS.holdMinSeconds),
    WORK_LIMITS.holdMaxSeconds,
  );
}

/**
 * A session takes up a work (or renews its hold): refused while another's
 * hold is live unless takeOver, which the journal records as a takeover.
 */
export async function claimWork(
  workId: string,
  actor: WorkActor,
  options: { seconds?: number; takeOver?: boolean; renewOnly?: boolean } = {},
) {
  if (!actor.session)
    throw new AppError("INVALID_PARAMETERS", "Name the session taking it up (session.id)");
  const { data, error } = await db.rpc("work_claim", {
    p_work_id: workId,
    p_holder: actor.session,
    p_label: actor.label ?? actor.session,
    p_kind: holderKind(actor.kind),
    p_user: actor.userId as string,
    p_seconds: holdSeconds(options.seconds),
    p_take_over: options.takeOver ?? false,
    ...(options.renewOnly ? { p_renew_only: true } : {}),
  });
  if (error) throw failure(error, "The work couldn't be taken up");
  const result = (data ?? {}) as JsonObject;
  if (!result["found"]) throw new AppError("INVALID_PARAMETERS", "That work doesn't exist");
  return result["claimed"]
    ? {
        claimed: true as const,
        tookOver: result["tookOver"] === true,
        previousHolder: (result["previousHolder"] as string | null) ?? null,
        previousLabel: (result["previousLabel"] as string | null) ?? null,
        previousHeardAt: (result["previousHeardAt"] as string | null) ?? null,
      }
    : {
        claimed: false as const,
        ...(result["renewOnly"] ? { renewOnly: true as const } : {}),
        holder: String(result["holder"] ?? ""),
        holderLabel: (result["holderLabel"] as string | null) ?? null,
        holderKind: (result["holderKind"] as string | null) ?? null,
        heardAt: (result["heardAt"] as string | null) ?? null,
        leaseExpiresAt: (result["leaseExpiresAt"] as string | null) ?? null,
      };
}

/** A session lets a work go (only its own hold). */
export async function releaseWork(workId: string, actor: WorkActor, summary?: string | null) {
  if (!actor.session)
    throw new AppError("INVALID_PARAMETERS", "Name the session letting it go (session.id)");
  const { data, error } = await db.rpc("work_release", {
    p_work_id: workId,
    p_holder: actor.session,
    p_kind: holderKind(actor.kind),
    p_label: actor.label ?? actor.session,
    p_user: actor.userId as string,
    ...(summary ? { p_summary: summary.slice(0, WORK_LIMITS.summaryChars) } : {}),
  });
  if (error) throw failure(error, "The work couldn't be let go");
  const result = (data ?? {}) as JsonObject;
  if (!result["found"]) throw new AppError("INVALID_PARAMETERS", "That work doesn't exist");
  return result["released"]
    ? { released: true as const }
    : {
        released: false as const,
        holder: (result["holder"] as string | null) ?? null,
        holderLabel: (result["holderLabel"] as string | null) ?? null,
      };
}

/* ------------------------------------------------------------------ */
/* Files' parts, straight to storage                                   */
/* ------------------------------------------------------------------ */

interface BlobRow {
  sha256: string;
  size: number;
  md5: string | null;
  storage_path: string;
  status: "pending" | "stored";
}

async function blobRows(workId: string, shas: string[]): Promise<Map<string, BlobRow>> {
  const rows = new Map<string, BlobRow>();
  for (let at = 0; at < shas.length; at += 300) {
    const { data, error } = await db
      .from("work_blobs")
      .select("sha256,size,md5,storage_path,status")
      .eq("work_id", workId)
      .in("sha256", shas.slice(at, at + 300));
    if (error) throw failure(error, "The work's files couldn't be read");
    for (const row of (data ?? []) as BlobRow[]) rows.set(row.sha256, row);
  }
  return rows;
}

/** An object in the work-files bucket, as storage describes it: its size and its ETag (an MD5 for a plain upload). */
async function storedObject(path: string): Promise<{ size: number; etag: string | null } | null> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await db.storage
    .from(WORK_BUCKET)
    .list(folder, { search: name, limit: 5 });
  if (error) return null;
  const item = (data ?? []).find((entry) => entry.name === name);
  if (!item) return null;
  const metadata = (item.metadata ?? {}) as JsonObject;
  const size = Number(metadata["size"] ?? metadata["contentLength"]);
  const etag =
    typeof metadata["eTag"] === "string" ? metadata["eTag"].replace(/"/g, "").toLowerCase() : null;
  return Number.isFinite(size) ? { size, etag } : null;
}

/** Whether a stored object is the part it should be: its size, and its MD5 where storage gave one. */
function matches(
  row: Pick<BlobRow, "size" | "md5">,
  object: { size: number; etag: string | null },
): boolean {
  if (object.size !== row.size) return false;
  if (row.md5 && object.etag && isMd5(object.etag)) return object.etag === row.md5;
  return true;
}

/**
 * Parts checked in storage, recorded as stored: 300 at a time, as blobRows reads them. The filter travels in the
 * request's URL, and a save naming 667 new parts (Reel 3's assets) was refused whole with no reason given.
 */
async function markStored(workId: string, shas: string[]) {
  const storedAt = new Date().toISOString();
  for (let at = 0; at < shas.length; at += 300) {
    const { error } = await db
      .from("work_blobs")
      .update({ status: "stored", stored_at: storedAt })
      .eq("work_id", workId)
      .in("sha256", shas.slice(at, at + 300));
    if (error) throw failure(error, "The work's files couldn't be recorded");
  }
}

/** In parallel, a few at a time. */
async function inTurn<T, R>(items: T[], each: (item: T) => Promise<R>, width = 8): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await each(items[index]!);
      }
    }),
  );
  return out;
}

/**
 * Where each part of a file goes: a part already stored is said to be (sent
 * once a work, by its SHA-256); one uploaded before but not yet checked is
 * checked now; the rest get a link to PUT their bytes to, straight to
 * storage (never through the app), valid for two hours.
 */
export async function offerUploads(
  workId: string,
  parts: { sha256: string; size: number; md5?: string | null }[],
) {
  await workRef(workId);
  if (parts.length > WORK_LIMITS.blobsPerUpload)
    throw new AppError(
      "INVALID_PARAMETERS",
      `At most ${WORK_LIMITS.blobsPerUpload} parts at a time`,
    );
  for (const part of parts) {
    if (!isSha256(part.sha256))
      throw new AppError("INVALID_PARAMETERS", "A part's sha256 is 64 lowercase hex digits");
    if (!Number.isInteger(part.size) || part.size < 0 || part.size > WORK_LIMITS.blobMaxBytes)
      throw new AppError(
        "INVALID_PARAMETERS",
        `A part is 0 to ${WORK_LIMITS.blobMaxBytes} bytes (files are sent in parts of ${WORK_LIMITS.chunkBytes})`,
      );
    if (part.md5 && !isMd5(part.md5))
      throw new AppError("INVALID_PARAMETERS", "A part's md5 is 32 lowercase hex digits");
  }
  const unique = [...new Map(parts.map((part) => [part.sha256, part])).values()];
  const known = await blobRows(
    workId,
    unique.map((part) => part.sha256),
  );
  const stored: string[] = [];
  const verified: string[] = [];
  const offer: typeof unique = [];
  await inTurn(unique, async (part) => {
    const row = known.get(part.sha256);
    if (row?.status === "stored") {
      stored.push(part.sha256);
      return;
    }
    if (row) {
      if (row.size !== part.size)
        throw new AppError(
          "INVALID_PARAMETERS",
          `Part ${part.sha256.slice(0, 12)}… was offered at ${row.size} bytes, not ${part.size}: its SHA-256 can't be both`,
        );
      // Offered before: perhaps uploaded since, and never checked.
      const object = await storedObject(row.storage_path);
      if (object && matches(row, object)) {
        verified.push(part.sha256);
        return;
      }
      if (object) await db.storage.from(WORK_BUCKET).remove([row.storage_path]);
    }
    offer.push(part);
  });
  await markStored(workId, verified);
  if (offer.length) {
    const { error } = await db.from("work_blobs").upsert(
      offer.map((part) => ({
        work_id: workId,
        sha256: part.sha256,
        size: part.size,
        md5: part.md5 ?? null,
        storage_path: blobPath(workId, part.sha256),
        status: "pending",
      })),
      { onConflict: "work_id,sha256", ignoreDuplicates: true },
    );
    if (error) throw failure(error, "The parts couldn't be offered");
  }
  const links = await inTurn(offer, async (part) => {
    const path = blobPath(workId, part.sha256);
    const { data, error } = await db.storage.from(WORK_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new AppError("STORAGE_FAILED", "An upload link couldn't be made");
    return { sha256: part.sha256, size: part.size, uploadUrl: data.signedUrl };
  });
  return {
    chunkBytes: WORK_LIMITS.chunkBytes,
    parts: [
      ...[...stored, ...verified].map((sha256) => ({ sha256, stored: true as const })),
      ...links.map((link) => ({
        ...link,
        stored: false as const,
        method: "PUT" as const,
        headers: { "content-type": "application/octet-stream", "x-upsert": "false" },
        expiresInSeconds: 7200,
      })),
    ],
  };
}

/** The parts a save names that aren't stored: each checked in storage first, where it was offered. */
async function missingParts(workId: string, shas: string[]): Promise<string[]> {
  const unique = [...new Set(shas)];
  const rows = await blobRows(workId, unique);
  const missing: string[] = [];
  const verified: string[] = [];
  await inTurn(unique, async (sha) => {
    const row = rows.get(sha);
    if (!row) {
      missing.push(sha);
      return;
    }
    if (row.status === "stored") return;
    const object = await storedObject(row.storage_path);
    if (object && matches(row, object)) verified.push(sha);
    else missing.push(sha);
  });
  await markStored(workId, verified);
  return missing;
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export interface SaveInput {
  kind?: EntryKind;
  summary?: string;
  nextSteps?: string[];
  decisions?: { what: string; why?: string }[];
  questions?: string[];
  stepChanges?: StepChange[];
  /** A JSON merge patch to the work's record. */
  statePatch?: JsonObject;
  /** The record's version the patch was made from: refused (CONFLICT) if it is no longer the latest. */
  baseVersion?: number | null;
  files?: FileChange[];
  links?: LinkChange[];
  /** The work itself: its title, goal, status, roots (merged), project, brand. */
  changes?: {
    title?: string;
    goal?: string;
    status?: WorkStatus;
    roots?: Record<string, string | null>;
    projectId?: string | null;
    brandKitId?: string | null;
  };
  code?: CodeVersion | null;
  clientRequestId?: string | null;
  /** Its saver renews (or takes up) its hold: on unless false. */
  hold?: boolean;
  holdSeconds?: number;
}

const list = (items: string[] | undefined) =>
  (items ?? [])
    .map((item) => item.trim().slice(0, WORK_LIMITS.listItemChars))
    .filter(Boolean)
    .slice(0, WORK_LIMITS.listItems);

/**
 * One save, as one transaction (work_save): its entry, its changes to the
 * record and the plan, its files (every part already stored: checked here,
 * then again by the database), its links and any change to the work. The
 * same request id returns the first save.
 */
export async function saveWork(workId: string, actor: WorkActor, input: SaveInput) {
  const files = input.files ?? [];
  if (files.length > WORK_LIMITS.filesPerSave)
    throw new AppError(
      "INVALID_PARAMETERS",
      `At most ${WORK_LIMITS.filesPerSave} files a save: save the rest in another`,
    );
  for (const file of files) {
    if (!isWorkPath(file.path))
      throw new AppError(
        "INVALID_PARAMETERS",
        `“${file.path.slice(0, 120)}” isn't a work path: a root's name, then a path under it (records/spec.json), with no “..”`,
      );
    if (file.deleted) continue;
    const chunks = file.chunks ?? [];
    if (!isSha256(file.sha256) || !Number.isInteger(file.size) || (file.size ?? -1) < 0)
      throw new AppError("INVALID_PARAMETERS", `${file.path}: give its sha256 and its size`);
    if (chunks.length > WORK_LIMITS.chunksPerFile || chunks.some((chunk) => !isSha256(chunk)))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${file.path}: its parts are up to ${WORK_LIMITS.chunksPerFile} SHA-256s`,
      );
    if ((file.size ?? 0) > 0 && !chunks.length)
      throw new AppError("INVALID_PARAMETERS", `${file.path}: name its parts (chunks)`);
  }
  const patchText = input.statePatch ? JSON.stringify(input.statePatch) : "";
  if (patchText.length > WORK_LIMITS.patchBytes)
    throw new AppError(
      "INVALID_PARAMETERS",
      `A change to the record is at most ${WORK_LIMITS.patchBytes} bytes`,
    );
  const parts = files.flatMap((file) => (file.deleted ? [] : (file.chunks ?? [])));
  if (parts.length) {
    const missing = await missingParts(workId, parts);
    if (missing.length) {
      const named = files
        .filter(
          (file) => !file.deleted && (file.chunks ?? []).some((chunk) => missing.includes(chunk)),
        )
        .map((file) => file.path);
      throw new AppError(
        "INVALID_PARAMETERS",
        `${missing.length} part${missing.length === 1 ? "" : "s"} of ${named.slice(0, 5).join(", ")}${named.length > 5 ? ` and ${named.length - 5} more` : ""} ${missing.length === 1 ? "isn't" : "aren't"} stored yet: offer ${missing.length === 1 ? "it" : "them"} with upload_work_files, PUT the bytes, then save again`,
      );
    }
  }
  const changes: JsonObject = {};
  if (input.changes?.title !== undefined)
    changes["title"] = input.changes.title.trim().slice(0, 200);
  if (input.changes?.goal !== undefined)
    changes["goal"] = input.changes.goal.slice(0, WORK_LIMITS.goalChars);
  if (input.changes?.status !== undefined) changes["status"] = input.changes.status;
  if (input.changes?.roots !== undefined) changes["roots"] = input.changes.roots;
  if (input.changes?.projectId !== undefined) {
    await exists("projects", input.changes.projectId, "project");
    changes["project_id"] = input.changes.projectId;
  }
  if (input.changes?.brandKitId !== undefined) {
    await exists("brand_kits", input.changes.brandKitId, "brand kit");
    changes["brand_kit_id"] = input.changes.brandKitId;
  }
  const entry: JsonObject = {
    kind: input.kind ?? "save",
    summary: (input.summary ?? "").slice(0, WORK_LIMITS.summaryChars),
    actor_kind: actor.kind,
    actor_session: actor.session,
    actor_label: actor.label,
    client_request_id: input.clientRequestId ?? null,
    ...(input.nextSteps !== undefined ? { next_steps: list(input.nextSteps) } : {}),
    ...(input.questions !== undefined ? { questions: list(input.questions) } : {}),
    ...(input.decisions?.length
      ? {
          decisions: input.decisions
            .filter((decision) => decision.what.trim())
            .slice(0, WORK_LIMITS.listItems)
            .map((decision) => ({
              what: decision.what.trim().slice(0, 1000),
              why: (decision.why ?? "").trim().slice(0, 2000),
            })),
        }
      : {}),
    ...(input.code ? { code: input.code } : {}),
  };
  const { data, error } = await db.rpc("work_save", {
    p_work_id: workId,
    p_entry: entry as Json,
    p_user: actor.userId as string,
    ...(input.statePatch ? { p_state_patch: input.statePatch as Json } : {}),
    ...(input.baseVersion !== undefined && input.baseVersion !== null
      ? { p_base_version: input.baseVersion }
      : {}),
    ...(input.stepChanges?.length
      ? { p_step_changes: input.stepChanges.slice(0, WORK_LIMITS.stepChanges) as unknown as Json }
      : {}),
    ...(files.length
      ? {
          p_files: files.map((file) =>
            file.deleted
              ? { path: file.path, deleted: true }
              : {
                  path: file.path,
                  sha256: file.sha256,
                  size: file.size,
                  chunks: file.chunks ?? [],
                  mime_type: file.mimeType ?? null,
                  modified_at: file.modifiedAt ?? null,
                  executable: file.executable ?? false,
                  note: file.note ?? null,
                },
          ) as unknown as Json,
        }
      : {}),
    ...(input.links?.length
      ? {
          p_links: input.links.slice(0, WORK_LIMITS.linksPerSave).map((link) => ({
            kind: link.kind,
            object_id: link.id,
            role: link.role ?? null,
            note: link.note ?? null,
          })) as unknown as Json,
        }
      : {}),
    ...(Object.keys(changes).length ? { p_changes: changes as Json } : {}),
    ...(input.hold !== false && actor.session ? { p_holder: actor.session } : {}),
    p_seconds: holdSeconds(input.holdSeconds),
  });
  if (error) throw failure(error, "The work couldn't be saved");
  const result = (data ?? {}) as JsonObject;
  if (!result["found"]) throw new AppError("INVALID_PARAMETERS", "That work doesn't exist");
  if (result["conflict"])
    throw new AppError(
      "CONFLICT",
      `The work's record is at version ${String(result["stateVersion"])}, not ${String(result["baseVersion"])}: someone saved since. Read it again (get_work), make your change on that, and save again. Nothing was written.`,
    );
  return {
    entryId: String(result["entryId"]),
    n: Number(result["n"]),
    duplicate: result["duplicate"] === true,
    stateVersion: Number(result["stateVersion"]),
    stateChanged: result["stateChanged"] === true,
    files: (result["files"] as ModelJson[] | undefined) ?? [],
    links: (result["links"] as ModelJson[] | undefined) ?? [],
    status: (result["status"] as WorkStatus | undefined) ?? null,
    hold: (result["hold"] as string | null | undefined) ?? null,
    ...(result["hold"] === "held_by_other"
      ? {
          heldBy: {
            holder: (result["holder"] as string | null) ?? null,
            label: (result["holderLabel"] as string | null) ?? null,
            heardAt: (result["heardAt"] as string | null) ?? null,
          },
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Files back out                                                      */
/* ------------------------------------------------------------------ */

export interface FileOut {
  path: string;
  version: number;
  sha256: string;
  size: number;
  mimeType: string | null;
  modifiedAt: string | null;
  executable: boolean;
  note: string | null;
  createdAt: string;
  parts?: { sha256: string; size: number; url: string | null }[];
}

/**
 * A work's files as they stand (or one path's chosen version), each with its
 * parts' download links (an hour each) when asked: in order of path, a page
 * at a time (after: the last path of the page before).
 */
export async function workFiles(
  workId: string,
  options: {
    paths?: string[];
    version?: number;
    withUrls?: boolean;
    after?: string | null;
    limit?: number;
  } = {},
) {
  await workRef(workId);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  let rows: FileRow[];
  if (options.version !== undefined) {
    if (options.paths?.length !== 1)
      throw new AppError("INVALID_PARAMETERS", "A version is of one path: give exactly one");
    const { data, error } = await db
      .from("work_files")
      .select(`${FILE_COLUMNS},chunks`)
      .eq("work_id", workId)
      .eq("path", options.paths[0]!)
      .eq("version", options.version)
      .maybeSingle();
    if (error) throw failure(error, "The file couldn't be read");
    if (!data)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${options.paths[0]} has no version ${options.version}`,
      );
    rows = [data as unknown as FileRow];
  } else {
    rows = (await currentFileRows(workId, true)).sort((a, b) => byPath(a.path, b.path));
    if (options.paths?.length) {
      const wanted = new Set(options.paths);
      rows = rows.filter((row) => wanted.has(row.path));
    }
    if (options.after) rows = rows.filter((row) => row.path > options.after!);
  }
  const page = rows.filter((row) => !row.deleted).slice(0, limit);
  const more = rows.filter((row) => !row.deleted).length > page.length;
  const shas = [
    ...new Set(page.flatMap((row) => (Array.isArray(row.chunks) ? (row.chunks as string[]) : []))),
  ];
  const urls = new Map<string, string | null>();
  const blobs = options.withUrls ? await blobRows(workId, shas) : new Map<string, BlobRow>();
  if (options.withUrls) {
    const paths = [...blobs.values()].map((blob) => blob.storage_path);
    for (let at = 0; at < paths.length; at += 100) {
      const { data } = await db.storage
        .from(WORK_BUCKET)
        .createSignedUrls(paths.slice(at, at + 100), 3600);
      for (const item of data ?? []) if (item.path) urls.set(item.path, item.signedUrl ?? null);
    }
  }
  const files: FileOut[] = page.map((row) => ({
    path: row.path,
    version: row.version,
    sha256: row.sha256!,
    size: Number(row.size),
    mimeType: row.mime_type,
    modifiedAt: row.modified_at,
    executable: row.executable,
    note: row.note,
    createdAt: row.created_at,
    ...(options.withUrls
      ? {
          parts: (Array.isArray(row.chunks) ? (row.chunks as string[]) : []).map((sha) => {
            const blob = blobs.get(sha);
            return {
              sha256: sha,
              size: blob?.size ?? 0,
              url: blob ? (urls.get(blob.storage_path) ?? null) : null,
            };
          }),
        }
      : {}),
  }));
  return { files, more, next: more ? (page.at(-1)?.path ?? null) : null };
}

/** Every version of one of a work's files, latest first. */
export async function fileHistory(workId: string, path: string) {
  const { data, error } = await db
    .from("work_files")
    .select("path,version,deleted,sha256,size,note,entry_id,created_at")
    .eq("work_id", workId)
    .eq("path", path)
    .order("version", { ascending: false })
    .limit(500);
  if (error) throw failure(error, "The file's versions couldn't be read");
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

/**
 * Attaches things in the studio to a work. With adopt, library files and
 * generations that are in no project are put in the work's (what an earlier
 * session made without a project is found with the work again).
 */
export async function attachToWork(
  workId: string,
  actor: WorkActor,
  links: LinkChange[],
  options: { adopt?: boolean; summary?: string; clientRequestId?: string | null } = {},
) {
  if (!links.length) throw new AppError("INVALID_PARAMETERS", "Name at least one thing to attach");
  const work = await workRef(workId);
  let adopted = 0;
  if (options.adopt && work.project_id) {
    for (const [kind, table] of [
      ["asset", "assets"],
      ["generation", "generations"],
    ] as const) {
      const ids = links.filter((link) => link.kind === kind).map((link) => link.id);
      if (!ids.length) continue;
      const { data } = await db
        .from(table)
        .update({ project_id: work.project_id })
        .in("id", ids)
        .is("project_id", null)
        .select("id");
      adopted += data?.length ?? 0;
    }
  }
  const saved = await saveWork(workId, actor, {
    kind: "link",
    summary: options.summary ?? "",
    links,
    clientRequestId: options.clientRequestId ?? null,
  });
  return { ...saved, adopted };
}

/**
 * What an operation run for a work made, attached to it (its own journal
 * entry, named after the operation). Never fails the operation: a link that
 * can't be kept is said in its answer.
 */
export async function recordCall(
  workId: string,
  actor: WorkActor,
  tool: { name: string; title: string },
  args: unknown,
  result: unknown,
): Promise<{ linked: LinkTarget[]; error?: string }> {
  const targets = linksFromCall(tool.name, args, result);
  if (!targets.length) return { linked: [] };
  try {
    await saveWork(workId, actor, {
      kind: "link",
      summary: `${tool.title}: ${targets.length} attached`,
      links: targets.map((target) => ({ kind: target.kind, id: target.id, note: tool.title })),
      hold: false,
    });
    return { linked: targets };
  } catch (error) {
    return {
      linked: [],
      error: error instanceof Error ? error.message : "The work couldn't record it",
    };
  }
}

/* ------------------------------------------------------------------ */
/* The Supercomputer's conversations                                   */
/* ------------------------------------------------------------------ */

/** The work a conversation works on, if it does (and the database knows of works). */
export async function workOfThread(threadId: string): Promise<{
  id: string;
  title: string;
  project_id: string | null;
  brand_kit_id: string | null;
} | null> {
  const { data, error } = await db
    .from("supercomputer_threads")
    .select("work_id")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !data) return null;
  const workId = (data as { work_id?: string | null }).work_id;
  if (!workId) return null;
  const { data: work } = await db
    .from("works")
    .select("id,title,project_id,brand_kit_id")
    .eq("id", workId)
    .maybeSingle();
  return work ?? null;
}

/** A conversation set to work on a work (or on none), and the work told so. */
export async function setThreadWork(threadId: string, workId: string | null, actor: WorkActor) {
  if (workId) await workRef(workId);
  const { error } = await db
    .from("supercomputer_threads")
    .update({ work_id: workId })
    .eq("id", threadId);
  if (error) throw failure(error, "The conversation couldn't be changed");
  if (workId)
    await saveWork(workId, actor, {
      kind: "link",
      summary: "A Supercomputer conversation works on it",
      links: [{ kind: "thread", id: threadId, role: "Supercomputer conversation" }],
      hold: false,
    });
}

/** Members' names, for entries written by them. */
export async function memberName(userId: string): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("full_name,email")
    .eq("id", userId)
    .maybeSingle();
  return data ? data.full_name?.trim() || data.email.split("@")[0]! : null;
}

export { isRecord };
