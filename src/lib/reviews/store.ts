/**
 * Reviews read and written through a Supabase client: the browser's, as the
 * signed-in member under row-level security, or the server's for the studio
 * API, as the token's owner. One set of steps and checks for both, so the
 * app and a script reviewing the same gate agree; the database holds the
 * hold, the numbering and "decide only the latest version" again
 * (migration 0030), in case two people act at once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { isMissingTableError } from "../edit/errors";
import {
  canAddVersion,
  canDecide,
  gateStates,
  nextPosition,
  STANDARD_GATES,
  VERSION_FILE_LIMIT,
  type DecisionRow,
  type GateRow,
  type ReviewDecision,
  type VersionKind,
  type VersionRow,
} from "./gates";
import {
  readSnapshot,
  renderSnapshot,
  storyboardSnapshot,
  type StoryboardInput,
  type VersionSnapshot,
} from "./snapshot";

type Client = SupabaseClient<Database>;
type Via = "app" | "api";

export const REVIEWS_MIGRATION = "0030_review_gates";
export const REVIEWS_NEED_UPDATE = `Reviews need a database update (migration ${REVIEWS_MIGRATION}). Ask an admin to apply it.`;

export interface ReviewAsset {
  id: string;
  asset_type: "image" | "video" | "audio";
  title: string | null;
  storage_bucket: string;
  storage_path: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  /** Frames a second, where the library measured it. */
  fps: number | null;
}

export interface ReviewFile {
  id: string;
  version_id: string;
  asset_id: string | null;
  position: number;
  title: string | null;
  /** The library file, while it is in the library. */
  asset: ReviewAsset | null;
}

export interface ReviewVersion extends VersionRow {
  snapshot: VersionSnapshot | null;
}

export interface ReviewComment {
  id: string;
  version_id: string;
  file_id: string | null;
  at_seconds: number | null;
  frame: number | null;
  x: number | null;
  y: number | null;
  shot_id: string | null;
  body: string;
  via: Via;
  created_by: string | null;
  created_at: string;
}

/** One target of a note: a shot, a time, or both, with why it was matched. */
export interface NoteTarget {
  shotId: string | null;
  label: string;
  name: string | null;
  start: number | null;
  end: number | null;
  evidence: { kind: string; text: string }[];
  by: "auto" | "person";
}

export interface ReviewNote {
  id: string;
  gate_id: string;
  version_id: string | null;
  number: number;
  body: string;
  given_by: string | null;
  targets: NoteTarget[];
  status: "open" | "done";
  answered_in_version_id: string | null;
  done_by: string | null;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProjectReviews {
  /** False before migration 0030 is applied: then nothing else is filled in. */
  supported: boolean;
  gates: GateRow[];
  versions: ReviewVersion[];
  files: ReviewFile[];
  decisions: DecisionRow[];
  comments: ReviewComment[];
  notes: ReviewNote[];
  /** Team members' names, by id: who added, commented and decided. */
  people: Record<string, string>;
}

const EMPTY: Omit<ProjectReviews, "supported"> = {
  gates: [],
  versions: [],
  files: [],
  decisions: [],
  comments: [],
  notes: [],
  people: {},
};

/** A database error as the person should read it. */
function failure(error: { code?: string; message?: string } | null, fallback: string): AppError {
  if (isMissingTableError(error)) return new AppError("UNKNOWN", REVIEWS_NEED_UPDATE);
  // The database's own rules (a held gate, a newer version) say what happened in its words.
  if (error?.code === "23514" && error.message)
    return new AppError("INVALID_PARAMETERS", error.message);
  return new AppError("UNKNOWN", fallback);
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Rows of a table whose column is one of `ids` (none for none). */
async function rowsIn<T>(
  query: (ids: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  ids: string[],
  what: string,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { data, error } = await query(unique);
  if (error)
    throw failure(error as { code?: string; message?: string }, `The ${what} couldn't be read`);
  return (data ?? []) as T[];
}

function assetOf(row: Record<string, unknown>): ReviewAsset {
  const metadata = asRecord(row["metadata"]);
  return {
    id: String(row["id"]),
    asset_type: row["asset_type"] as ReviewAsset["asset_type"],
    title: (row["title"] as string | null) ?? null,
    storage_bucket: String(row["storage_bucket"]),
    storage_path: String(row["storage_path"]),
    duration_seconds: row["duration_seconds"] == null ? null : Number(row["duration_seconds"]),
    width: (row["width"] as number | null) ?? null,
    height: (row["height"] as number | null) ?? null,
    fps: typeof metadata["fps"] === "number" && metadata["fps"] > 0 ? metadata["fps"] : null,
  };
}

const ASSET_COLUMNS =
  "id,asset_type,title,storage_bucket,storage_path,duration_seconds,width,height,metadata";

/** Everything a project's reviews hold, in one read. */
export async function loadProjectReviews(
  client: Client,
  projectId: string,
): Promise<ProjectReviews> {
  const { data: gates, error } = await client
    .from("review_gates")
    .select("id,project_id,name,position,held_until_previous,created_by,created_at")
    .eq("project_id", projectId);
  if (error) {
    if (isMissingTableError(error)) return { supported: false, ...EMPTY };
    throw failure(error, "The project's reviews couldn't be read");
  }
  const gateIds = (gates ?? []).map((gate) => gate.id);
  const [versionRows, notes] = await Promise.all([
    rowsIn<Record<string, unknown>>(
      (ids) =>
        client
          .from("review_versions")
          .select(
            "id,gate_id,number,kind,label,note,render_id,storyboard_id,snapshot,created_by,created_at",
          )
          .in("gate_id", ids),
      gateIds,
      "versions",
    ),
    rowsIn<ReviewNote>(
      (ids) => client.from("review_notes").select("*").in("gate_id", ids),
      gateIds,
      "notes",
    ),
  ]);
  const versions: ReviewVersion[] = versionRows.map((row) => ({
    ...(row as unknown as VersionRow),
    snapshot: readSnapshot(row["snapshot"]),
  }));
  const versionIds = versions.map((version) => version.id);
  const [fileRows, decisions, comments] = await Promise.all([
    rowsIn<Omit<ReviewFile, "asset">>(
      (ids) =>
        client
          .from("review_version_files")
          .select("id,version_id,asset_id,position,title")
          .in("version_id", ids),
      versionIds,
      "versions' files",
    ),
    rowsIn<DecisionRow>(
      (ids) => client.from("review_decisions").select("*").in("version_id", ids),
      versionIds,
      "decisions",
    ),
    rowsIn<ReviewComment>(
      (ids) => client.from("review_comments").select("*").in("version_id", ids),
      versionIds,
      "comments",
    ),
  ]);
  const assets = await rowsIn<Record<string, unknown>>(
    (ids) => client.from("assets").select(ASSET_COLUMNS).in("id", ids).is("deleted_at", null),
    fileRows.map((file) => file.asset_id).filter((id): id is string => !!id),
    "library files",
  );
  const assetById = new Map(assets.map((row) => [String(row["id"]), assetOf(row)]));
  const peopleIds = [
    ...(gates ?? []).map((gate) => gate.created_by),
    ...versions.map((version) => version.created_by),
    ...decisions.map((decision) => decision.decided_by),
    ...comments.map((comment) => comment.created_by),
    ...notes.flatMap((note) => [note.created_by, note.done_by]),
  ].filter((id): id is string => !!id);
  const profiles = await rowsIn<{ id: string; full_name: string | null; email: string | null }>(
    (ids) => client.from("profiles").select("id,full_name,email").in("id", ids),
    peopleIds,
    "team members",
  );
  return {
    supported: true,
    gates: (gates ?? []) as GateRow[],
    versions,
    files: fileRows
      .map((file) => ({
        ...file,
        asset: file.asset_id ? (assetById.get(file.asset_id) ?? null) : null,
      }))
      .sort((a, b) => a.position - b.position),
    decisions,
    comments: comments.map((comment) => ({
      ...comment,
      at_seconds: comment.at_seconds === null ? null : Number(comment.at_seconds),
    })),
    notes: notes.map((note) => ({
      ...note,
      targets: Array.isArray(note.targets) ? (note.targets as NoteTarget[]) : [],
    })),
    people: Object.fromEntries(
      profiles.map((person) => [
        person.id,
        person.full_name?.trim() || person.email || "A teammate",
      ]),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

export async function addGate(
  client: Client,
  input: { projectId: string; name: string; heldUntilPrevious: boolean; userId: string },
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new AppError("INVALID_PARAMETERS", "Give the gate a name.");
  const { data: gates, error: readError } = await client
    .from("review_gates")
    .select("position")
    .eq("project_id", input.projectId);
  if (readError) throw failure(readError, "The gate couldn't be added");
  const { data, error } = await client
    .from("review_gates")
    .insert({
      project_id: input.projectId,
      name,
      position: nextPosition(gates ?? []),
      held_until_previous: input.heldUntilPrevious,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw failure(error, "The gate couldn't be added");
  return data.id;
}

/** Reel 1's four gates, each held until the one before it is approved. */
export async function addStandardGates(
  client: Client,
  input: { projectId: string; userId: string },
): Promise<void> {
  const { error } = await client.from("review_gates").insert(
    STANDARD_GATES.map((name, index) => ({
      project_id: input.projectId,
      name,
      position: index + 1,
      held_until_previous: index > 0,
      created_by: input.userId,
    })),
  );
  if (error) throw failure(error, "The gates couldn't be added");
}

export async function updateGate(
  client: Client,
  gateId: string,
  patch: { name?: string; position?: number; held_until_previous?: boolean },
): Promise<void> {
  const name = patch.name?.trim().slice(0, 80);
  if (patch.name !== undefined && !name)
    throw new AppError("INVALID_PARAMETERS", "Give the gate a name.");
  const { error } = await client
    .from("review_gates")
    .update({ ...patch, ...(name ? { name } : {}) })
    .eq("id", gateId);
  if (error) throw failure(error, "The gate couldn't be changed");
}

export async function deleteGate(client: Client, gateId: string): Promise<void> {
  const { error } = await client.from("review_gates").delete().eq("id", gateId);
  if (error) throw failure(error, "The gate couldn't be deleted");
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

/** A gate with the project around it: what its state, and its hold, are read from. */
async function gateContext(client: Client, gateId: string) {
  const { data: gate, error } = await client
    .from("review_gates")
    .select("id,project_id,name,position,held_until_previous,created_by,created_at")
    .eq("id", gateId)
    .maybeSingle();
  if (error) throw failure(error, "The gate couldn't be read");
  if (!gate) throw new AppError("INVALID_PARAMETERS", "That review gate doesn't exist.");
  const { data: gates, error: gatesError } = await client
    .from("review_gates")
    .select("id,project_id,name,position,held_until_previous,created_by,created_at")
    .eq("project_id", gate.project_id);
  if (gatesError) throw failure(gatesError, "The project's gates couldn't be read");
  const versions = await rowsIn<VersionRow>(
    (ids) =>
      client
        .from("review_versions")
        .select("id,gate_id,number,kind,label,note,render_id,storyboard_id,created_by,created_at")
        .in("gate_id", ids),
    (gates ?? []).map((entry) => entry.id),
    "versions",
  );
  const decisions = await rowsIn<DecisionRow>(
    (ids) => client.from("review_decisions").select("*").in("version_id", ids),
    versions.map((version) => version.id),
    "decisions",
  );
  const states = gateStates((gates ?? []) as GateRow[], versions, decisions);
  const state = states.find((entry) => entry.gate.id === gateId)!;
  return { gate: gate as GateRow, state };
}

export interface NewVersion {
  gateId: string;
  userId: string;
  via: Via;
  /** Exactly one of: library files (stills or videos), a completed render, a storyboard. */
  assetIds?: string[] | null;
  renderId?: string | null;
  storyboardId?: string | null;
  note?: string | null;
  clientRequestId?: string | null;
}

export interface AddedVersion {
  versionId: string;
  number: number;
  /** The same request was made before: this is the version it added. */
  duplicate: boolean;
}

async function existingVersion(
  client: Client,
  userId: string,
  clientRequestId: string | null | undefined,
): Promise<AddedVersion | null> {
  if (!clientRequestId) return null;
  const { data } = await client
    .from("review_versions")
    .select("id,number")
    .eq("created_by", userId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  return data ? { versionId: data.id, number: data.number, duplicate: true } : null;
}

/** What a version is of, read and checked: its kind, label, files and snapshot. */
async function artefactOf(
  client: Client,
  input: NewVersion,
): Promise<{
  kind: VersionKind;
  label: string;
  snapshot: VersionSnapshot | null;
  files: { asset_id: string; title: string | null }[];
}> {
  const given = [!!input.assetIds?.length, !!input.renderId, !!input.storyboardId].filter(Boolean);
  if (given.length !== 1)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A version is of one thing: library files, a render or a storyboard.",
    );
  if (input.assetIds?.length) {
    const ids = [...new Set(input.assetIds)];
    if (ids.length > VERSION_FILE_LIMIT)
      throw new AppError(
        "INVALID_PARAMETERS",
        `A version holds up to ${VERSION_FILE_LIMIT} files.`,
      );
    const { data, error } = await client
      .from("assets")
      .select("id,asset_type,title")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw failure(error, "The library files couldn't be read");
    const found = new Map((data ?? []).map((row) => [row.id, row]));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length)
      throw new AppError("INVALID_PARAMETERS", `Not in the library: ${missing.join(", ")}`);
    const rows = ids.map((id) => found.get(id)!);
    if (rows.some((row) => row.asset_type !== "image" && row.asset_type !== "video"))
      throw new AppError("INVALID_PARAMETERS", "A version's files are stills or videos.");
    const stills = rows.filter((row) => row.asset_type === "image").length;
    const noun = stills === rows.length ? "still" : stills === 0 ? "video" : "file";
    const label =
      rows.length === 1 ? rows[0]!.title?.trim() || `One ${noun}` : `${rows.length} ${noun}s`;
    return {
      kind: "files",
      label: label.slice(0, 200),
      snapshot: null,
      files: rows.map((row) => ({ asset_id: row.id, title: row.title })),
    };
  }
  if (input.renderId) {
    const { data: render, error } = await client
      .from("sequence_renders")
      .select("id,sequence_id,sequence_version,status,asset_id,duration_seconds,timeline")
      .eq("id", input.renderId)
      .maybeSingle();
    if (error) throw failure(error, "The render couldn't be read");
    if (!render) throw new AppError("INVALID_PARAMETERS", "That render doesn't exist.");
    if (render.status !== "completed" || !render.asset_id)
      throw new AppError(
        "INVALID_PARAMETERS",
        "That render hasn't finished: add it once its video is in the library.",
      );
    const { data: sequence } = await client
      .from("sequences")
      .select("title")
      .eq("id", render.sequence_id)
      .maybeSingle();
    const title = sequence?.title ?? "Edit";
    return {
      kind: "render",
      label: `${title} · version ${render.sequence_version}`.slice(0, 200),
      snapshot: renderSnapshot({
        sequenceId: render.sequence_id,
        sequenceVersion: render.sequence_version,
        title,
        timeline: render.timeline,
        durationSeconds: render.duration_seconds === null ? null : Number(render.duration_seconds),
      }),
      files: [{ asset_id: render.asset_id, title }],
    };
  }
  const { data: board, error } = await client
    .from("storyboards")
    .select("id,title,scenes(scene_number,shots(id,shot_number,name,duration_seconds,spec))")
    .eq("id", input.storyboardId!)
    .maybeSingle();
  if (error) throw failure(error, "The storyboard couldn't be read");
  if (!board) throw new AppError("INVALID_PARAMETERS", "That storyboard doesn't exist.");
  const snapshot = storyboardSnapshot(board as unknown as StoryboardInput);
  return { kind: "storyboard", label: board.title.slice(0, 200), snapshot, files: [] };
}

/**
 * Adds a version to a gate, numbered after the last, unless the gate is
 * held. Sent again with the same clientRequestId, it returns the version
 * that request added.
 */
export async function addVersion(client: Client, input: NewVersion): Promise<AddedVersion> {
  const before = await existingVersion(client, input.userId, input.clientRequestId);
  if (before) return before;
  const { state } = await gateContext(client, input.gateId);
  const allowed = canAddVersion(state);
  if (!allowed.ok) throw new AppError("INVALID_PARAMETERS", allowed.reason);
  const artefact = await artefactOf(client, input);
  const note = input.note?.trim().slice(0, 4000) || null;
  const { data, error } = await client
    .from("review_versions")
    .insert({
      gate_id: input.gateId,
      // The next number as read here; the database gives it again under the gate's lock.
      number: (state.latest?.number ?? 0) + 1,
      kind: artefact.kind,
      label: artefact.label,
      note,
      render_id: input.renderId ?? null,
      storyboard_id: input.storyboardId ?? null,
      snapshot: artefact.snapshot as unknown as Json,
      client_request_id: input.clientRequestId ?? null,
      created_by: input.userId,
    })
    .select("id,number")
    .single();
  if (error || !data) {
    // The same request, sent twice at once: the other one added it.
    const raced =
      error?.code === "23505"
        ? await existingVersion(client, input.userId, input.clientRequestId)
        : null;
    if (raced) return raced;
    throw failure(error, "The version couldn't be added");
  }
  if (artefact.files.length) {
    const { error: filesError } = await client.from("review_version_files").insert(
      artefact.files.map((file, position) => ({
        version_id: data.id,
        asset_id: file.asset_id,
        position,
        title: file.title,
      })),
    );
    if (filesError) {
      await client.from("review_versions").delete().eq("id", data.id);
      throw failure(filesError, "The version's files couldn't be added");
    }
  }
  return { versionId: data.id, number: data.number, duplicate: false };
}

export async function deleteVersion(client: Client, versionId: string): Promise<void> {
  const { data, error } = await client
    .from("review_versions")
    .delete()
    .eq("id", versionId)
    .select("id");
  if (error) throw failure(error, "The version couldn't be taken out");
  if (!data?.length)
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only whoever added a version (or an admin) can take it out, and only before it is decided.",
    );
}

/* ------------------------------------------------------------------ */
/* Comments and decisions                                              */
/* ------------------------------------------------------------------ */

/** A version with its gate and what tells its frames apart (its frame rate). */
async function versionContext(client: Client, versionId: string) {
  const { data: version, error } = await client
    .from("review_versions")
    .select("id,gate_id,number,kind,snapshot")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw failure(error, "The version couldn't be read");
  if (!version) throw new AppError("INVALID_PARAMETERS", "That version doesn't exist.");
  const snapshot = readSnapshot(version.snapshot);
  const { data: files } = await client
    .from("review_version_files")
    .select("id,asset_id,position")
    .eq("version_id", versionId);
  const assets = await rowsIn<Record<string, unknown>>(
    (ids) => client.from("assets").select(ASSET_COLUMNS).in("id", ids),
    (files ?? []).map((file) => file.asset_id).filter((id): id is string => !!id),
    "library files",
  );
  const fps =
    snapshot?.kind === "render"
      ? snapshot.fps
      : (assets.map(assetOf).find((asset) => asset.fps)?.fps ?? 30);
  return { version, files: files ?? [], fps };
}

export interface NewComment {
  versionId: string;
  userId: string;
  via: Via;
  body: string;
  /** Seconds into the video or render, or its frame: either gives the other. */
  atSeconds?: number | null;
  frame?: number | null;
  /** A point on the picture, 0 to 1 across and down. */
  point?: { x: number; y: number } | null;
  /** The version's file it is on (of several), by the file's id in the version or its library id. */
  fileId?: string | null;
  assetId?: string | null;
  shotId?: string | null;
  clientRequestId?: string | null;
}

export async function addComment(
  client: Client,
  input: NewComment,
): Promise<{ commentId: string; duplicate: boolean }> {
  const body = input.body.trim();
  if (!body) throw new AppError("INVALID_PARAMETERS", "Write the comment first.");
  if (body.length > 4000)
    throw new AppError("INVALID_PARAMETERS", "A comment is at most 4,000 characters.");
  if (input.clientRequestId) {
    const { data } = await client
      .from("review_comments")
      .select("id")
      .eq("created_by", input.userId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (data) return { commentId: data.id, duplicate: true };
  }
  const { files, fps } = await versionContext(client, input.versionId);
  const file =
    (input.fileId ? files.find((entry) => entry.id === input.fileId) : undefined) ??
    (input.assetId ? files.find((entry) => entry.asset_id === input.assetId) : undefined) ??
    null;
  if ((input.fileId || input.assetId) && !file)
    throw new AppError("INVALID_PARAMETERS", "That file isn't in this version.");
  const point = input.point ?? null;
  if (point && !(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1))
    throw new AppError("INVALID_PARAMETERS", "A point on the picture is 0 to 1 across and down.");
  const atSeconds =
    input.atSeconds ??
    (input.frame !== null && input.frame !== undefined ? input.frame / fps : null);
  const frame = input.frame ?? (atSeconds !== null ? Math.floor(atSeconds * fps + 1e-6) : null);
  const { data, error } = await client
    .from("review_comments")
    .insert({
      version_id: input.versionId,
      file_id: file?.id ?? null,
      at_seconds: atSeconds,
      frame,
      x: point?.x ?? null,
      y: point?.y ?? null,
      shot_id: input.shotId ?? null,
      body,
      via: input.via,
      client_request_id: input.clientRequestId ?? null,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw failure(error, "The comment couldn't be saved");
  return { commentId: data.id, duplicate: false };
}

export async function deleteComment(client: Client, commentId: string): Promise<void> {
  const { error } = await client.from("review_comments").delete().eq("id", commentId);
  if (error) throw failure(error, "The comment couldn't be taken back");
}

export interface NewDecision {
  versionId: string;
  userId: string;
  via: Via;
  decision: ReviewDecision;
  note?: string | null;
  onBehalfOf?: string | null;
  clientRequestId?: string | null;
}

/**
 * Approves a version, or asks for changes to it, as the member (or the API
 * token's owner). Only a gate's latest version is decided, and a held gate
 * isn't approved until the gate before it is.
 */
export async function decide(
  client: Client,
  input: NewDecision,
): Promise<{ decisionId: string; duplicate: boolean }> {
  if (input.clientRequestId) {
    const { data } = await client
      .from("review_decisions")
      .select("id")
      .eq("decided_by", input.userId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (data) return { decisionId: data.id, duplicate: true };
  }
  const { data: version, error: readError } = await client
    .from("review_versions")
    .select("gate_id")
    .eq("id", input.versionId)
    .maybeSingle();
  if (readError) throw failure(readError, "The version couldn't be read");
  if (!version) throw new AppError("INVALID_PARAMETERS", "That version doesn't exist.");
  const { state } = await gateContext(client, version.gate_id);
  const allowed = canDecide(state, input.versionId, input.decision);
  if (!allowed.ok) throw new AppError("INVALID_PARAMETERS", allowed.reason);
  const { data, error } = await client
    .from("review_decisions")
    .insert({
      version_id: input.versionId,
      decision: input.decision,
      note: input.note?.trim().slice(0, 4000) || null,
      on_behalf_of: input.onBehalfOf?.trim().slice(0, 200) || null,
      via: input.via,
      client_request_id: input.clientRequestId ?? null,
      decided_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw failure(error, "The decision couldn't be recorded");
  return { decisionId: data.id, duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export async function addNotes(
  client: Client,
  input: {
    gateId: string;
    userId: string;
    versionId: string | null;
    givenBy: string | null;
    notes: { number: number; body: string; targets: NoteTarget[] }[];
  },
): Promise<number> {
  if (!input.notes.length) return 0;
  const { error } = await client.from("review_notes").insert(
    input.notes.map((note) => ({
      gate_id: input.gateId,
      version_id: input.versionId,
      number: Math.max(1, Math.round(note.number)),
      body: note.body.trim().slice(0, 4000),
      given_by: input.givenBy?.trim().slice(0, 200) || null,
      targets: note.targets as unknown as Json,
      created_by: input.userId,
    })),
  );
  if (error) throw failure(error, "The notes couldn't be saved");
  return input.notes.length;
}

export async function updateNote(
  client: Client,
  noteId: string,
  patch: {
    body?: string;
    targets?: NoteTarget[];
    status?: "open" | "done";
    answered_in_version_id?: string | null;
  },
): Promise<void> {
  const { error } = await client
    .from("review_notes")
    .update({
      ...(patch.body !== undefined ? { body: patch.body.trim().slice(0, 4000) } : {}),
      ...(patch.targets !== undefined ? { targets: patch.targets as unknown as Json } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.answered_in_version_id !== undefined
        ? { answered_in_version_id: patch.answered_in_version_id }
        : {}),
    })
    .eq("id", noteId);
  if (error) throw failure(error, "The note couldn't be saved");
}

export async function deleteNote(client: Client, noteId: string): Promise<void> {
  const { error } = await client.from("review_notes").delete().eq("id", noteId);
  if (error) throw failure(error, "The note couldn't be deleted");
}
