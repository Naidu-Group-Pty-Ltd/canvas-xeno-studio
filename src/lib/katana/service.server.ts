/**
 * Katana runs on the server. A run hands the studio's media to Higgsfield,
 * starts a Claude Managed Agents session that runs Higgsfield's Katana
 * workflow with the team's Higgsfield account, answers each paid call that
 * session asks to make (the credit guard), follows its progress and saves the
 * finished video to the library.
 *
 * A session's events are read by whoever gets there first (the run's page,
 * the one-minute tick, the five-minute reconcile job or an Anthropic webhook),
 * one reader per run at a time (a lease with an owner token), from where the
 * last reader stopped. Credits are committed in the database in one locked
 * step per call, never from a running total, so no ordering of readers can
 * let a run spend past its limit. Starting a session is never retried on its
 * own: an unclear answer is checked against the sessions Anthropic lists
 * before anything else happens.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { isAllowedOutputUrl } from "../higgsfield/provider.server";
import { getSettings } from "../generation-pipeline.server";
import {
  anthropicClient,
  anthropicConfigured,
  ensureKatanaSetup,
  ensureVaultToken,
  isApiStatus,
} from "./agent.server";
import {
  KATANA_TABLES_MISSING,
  higgsfieldConnectionStatus,
  higgsfieldMcp,
  isMissingTable,
  renewHiggsfieldToken,
} from "./connection.server";
import {
  KATANA_EVENT_TYPES,
  interpretEvents,
  type EventEffects,
  type FeedEntry,
  type SessionEventLike,
  type SessionState,
  type ToolUse,
} from "./events";
import {
  callLabel,
  classifyGuardedCall,
  decideSpend,
  formatCredits,
  freeBillingFlag,
  quoteCredits,
  quoteParams,
  requestCount,
  submittedJobIds,
  unmadeIndexes,
  type PricedItem,
} from "./guard";
import { KATANA_CHARACTERS_MAX, castOfInputs, tagCast, type CastCharacter } from "./cast";
import { findAll, firstUrl, isObject, isUuid } from "./mcp";
import { HiggsfieldMcpError, type HiggsfieldMcpClient } from "./mcp-client.server";
import {
  FIELD_KIND,
  KATANA_FIELDS,
  MEDIA_FIELD,
  PRESET_SLUG,
  followUpMessage,
  kickoffMessage,
  parsePresetInputs,
  revisionMessage,
  type KickoffCharacter,
  type KatanaMediaInput,
  type KatanaMediaKind,
  type KatanaMode,
  type PresetInput,
} from "./messages";

type RunRow = Database["public"]["Tables"]["katana_runs"]["Row"];
type RunUpdate = Database["public"]["Tables"]["katana_runs"]["Update"];
type ResultRow = Database["public"]["Tables"]["katana_results"]["Row"];

const db = supabaseAdmin;
const nowIso = () => new Date().toISOString();

/** Statuses whose session (or its start) still needs following. */
export const ACTIVE_RUN_STATUSES = [
  "preparing",
  "starting",
  "running",
  "waiting",
  "uncertain",
] as const;
const SETTLED = new Set(["delivered", "idle", "paused", "failed", "cancelled"]);

/** What Higgsfield takes by URL; bigger files are uploaded (streamed). */
const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
/** A file the runtime can't stream with a known length is held in memory, up to this. */
const BUFFER_MAX_BYTES = 60 * 1024 * 1024;
/** Katana delivers a size-capped file (about 90 MB a minute at 1080p). */
const RESULT_MAX_BYTES = 500 * 1024 * 1024;
const MAX_RESULT_ATTEMPTS = 5;
const STUDIO_BUCKETS = new Set(["generation-inputs", "generated-assets"]);

/** How long one reader holds a run (renewed before it answers the session). */
const LEASE_MS = 150_000;
/** How long handing a run's files over may hold it between renewals. */
const HANDOVER_LEASE_MS = 5 * 60_000;
/** A run still being handed over after this long is settled as not started. */
const PREPARE_MAX_MS = 30 * 60_000;
const QUOTE_TIMEOUT_MS = 30_000;
/** A run whose events stopped this long ago has its session asked where it stands. */
const QUIET_MS = 10 * 60_000;
const STATE_CHECK_EVERY_MS = 5 * 60_000;

const CANCELLED_MESSAGE =
  "This run was cancelled, so nothing more is made for it. End your turn now.";

const LIMITS = {
  images: 10,
  videos: 3,
  briefChars: 4000,
  titleChars: 120,
  claudeBudgetUsd: { min: 1, max: 1000 },
} as const;

// ---------- Settings ----------

export interface KatanaSettings {
  defaultCreditLimit: number;
  maxCreditLimit: number;
  defaultClaudeBudgetUsd: number;
  removeBackgroundCredits: number;
  removeBackgroundVideoCredits: number;
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export async function katanaSettings(): Promise<KatanaSettings> {
  const settings = await getSettings();
  const maxCreditLimit = positive(settings["katana_max_credit_limit"], 3000);
  return {
    defaultCreditLimit: Math.min(
      positive(settings["katana_default_credit_limit"], 300),
      maxCreditLimit,
    ),
    maxCreditLimit,
    defaultClaudeBudgetUsd: positive(settings["katana_default_claude_budget_usd"], 25),
    removeBackgroundCredits: positive(settings["katana_remove_background_credits"], 2),
    removeBackgroundVideoCredits: positive(settings["katana_remove_background_video_credits"], 5),
  };
}

// ---------- Rows ----------

async function readRun(runId: string): Promise<RunRow> {
  const { data, error } = await db.from("katana_runs").select("*").eq("id", runId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
    throw new AppError("STORAGE_FAILED", error.message);
  }
  if (!data) throw new AppError("INVALID_PARAMETERS", "That Katana run doesn't exist");
  return data;
}

async function updateRun(runId: string, values: RunUpdate): Promise<void> {
  const { error } = await db.from("katana_runs").update(values).eq("id", runId);
  if (error) throw new AppError("STORAGE_FAILED", error.message);
}

/** One reader's hold on a run: only its owner token can renew or release it. */
interface Lease {
  run: RunRow;
  token: string;
}

/** Holds a run for one reader; null when another one has it. */
async function claimRun(
  runId: string,
  statuses?: readonly string[],
  ms = LEASE_MS,
): Promise<Lease | null> {
  const now = new Date();
  const token = crypto.randomUUID();
  let query = db
    .from("katana_runs")
    .update({
      sync_lease_until: new Date(now.getTime() + ms).toISOString(),
      sync_lease_owner: token,
    })
    .eq("id", runId)
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`);
  if (statuses) query = query.in("status", [...statuses]);
  const { data } = await query.select("*").maybeSingle();
  return data ? { run: data, token } : null;
}

/** Extends a hold (writing `values` with it), or says it was lost to another reader. */
async function stillHeld(lease: Lease, ms = LEASE_MS, values: RunUpdate = {}): Promise<boolean> {
  const { data } = await db
    .from("katana_runs")
    .update({ ...values, sync_lease_until: new Date(Date.now() + ms).toISOString() })
    .eq("id", lease.run.id)
    .eq("sync_lease_owner", lease.token)
    .select("id");
  return !!data?.length;
}

/** Ends a hold, writing `values` with it; false when the hold had already been lost. */
async function releaseRun(lease: Lease, values: RunUpdate = {}): Promise<boolean> {
  const { data, error } = await db
    .from("katana_runs")
    .update({ ...values, sync_lease_until: null, sync_lease_owner: null })
    .eq("id", lease.run.id)
    .eq("sync_lease_owner", lease.token)
    .select("id");
  if (error) throw new AppError("STORAGE_FAILED", error.message);
  return !!data?.length;
}

async function addFeed(runId: string, entries: FeedEntry[]): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((entry) => ({
    run_id: runId,
    source_id: entry.sourceId,
    kind: entry.kind,
    title: entry.title.slice(0, 200),
    body: entry.body.slice(0, 8000),
    data: entry.data as Json,
    occurred_at: entry.occurredAt,
  }));
  const { error } = await db
    .from("katana_run_events")
    .upsert(rows, { onConflict: "run_id,source_id", ignoreDuplicates: true });
  if (error) console.error("katana feed not saved", { runId, message: error.message });
}

async function note(
  runId: string,
  kind: FeedEntry["kind"],
  title: string,
  body = "",
  data: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("katana_run_events").insert({
    run_id: runId,
    kind,
    title: title.slice(0, 200),
    body: body.slice(0, 8000),
    data: data as Json,
  });
  if (error) console.error("katana note not saved", { runId, message: error.message });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------- Streams ----------

type FixedLengthStreamClass = new (length: number) => TransformStream<Uint8Array, Uint8Array>;

/** Cloudflare's FixedLengthStream, which lets a streamed request carry its Content-Length. */
function fixedLengthStream(): FixedLengthStreamClass | null {
  const candidate = (globalThis as { FixedLengthStream?: FixedLengthStreamClass })
    .FixedLengthStream;
  return typeof candidate === "function" ? candidate : null;
}

/** A stream sent with its length (where the runtime can), else null. */
function withLength(
  stream: ReadableStream<Uint8Array>,
  length: number,
): ReadableStream<Uint8Array> | null {
  const Fixed = fixedLengthStream();
  if (!Fixed || !(length > 0)) return null;
  const fixed = new Fixed(length);
  void stream.pipeTo(fixed.writable).catch(() => undefined);
  return fixed.readable;
}

/** Counts what passes and stops a stream that grows past `max` bytes. */
function byteCounter(max: number): {
  stream: TransformStream<Uint8Array, Uint8Array>;
  bytes: () => number;
} {
  let bytes = 0;
  return {
    stream: new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > max) controller.error(new Error("The file is too large"));
        else controller.enqueue(chunk);
      },
    }),
    bytes: () => bytes,
  };
}

/**
 * Fetches a file from Higgsfield, following at most three redirects by hand so
 * every hop is checked to be one of Higgsfield's addresses.
 */
async function fetchFromHiggsfield(url: string, timeoutMs: number): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!isAllowedOutputUrl(current))
      throw new Error("The file's address isn't one of Higgsfield's");
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) throw new Error(`Higgsfield answered ${response.status} with nowhere to go`);
    current = new URL(location, current).toString();
  }
  throw new Error("Too many redirects");
}

// ---------- Inputs ----------

export interface RunInputRow {
  asset_id: string;
  field: string;
  kind: KatanaMediaKind;
  title: string;
  media_id: string | null;
  /** The team's character the image shows (one of their sheet images or photos), if any. */
  character_id?: string | null;
  character_name?: string | null;
  /** Which of their views it is. */
  view?: string | null;
}

function runInputs(run: Pick<RunRow, "inputs">): RunInputRow[] {
  return Array.isArray(run.inputs) ? (run.inputs as unknown as RunInputRow[]) : [];
}

function mediaInputs(inputs: RunInputRow[]): KatanaMediaInput[] {
  return inputs
    .filter((input): input is RunInputRow & { media_id: string } => !!input.media_id)
    .map((input) => ({ field: input.field, kind: input.kind, mediaId: input.media_id }));
}

interface AssetForInput {
  id: string;
  asset_type: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  title: string | null;
  deleted_at: string | null;
}

/** The library media a run asks for, checked: the studio's own files, of the kind each field takes. */
async function resolveInputs(
  requested: Array<{ assetId: string; field: string }>,
): Promise<RunInputRow[]> {
  if (!requested.length) return [];
  const ids = [...new Set(requested.map((input) => input.assetId))];
  // A layout-only picture (a real client's screen, say) is never handed to Katana.
  const { assertPlaceable } = await import("../media/layout-only.server");
  await assertPlaceable(ids, "katana");
  const { data, error } = await db
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,file_size,title,deleted_at")
    .in("id", ids);
  if (error) throw new AppError("STORAGE_FAILED", error.message);
  const assets = new Map((data ?? []).map((asset) => [asset.id, asset as AssetForInput]));
  return requested.map((input) => {
    const asset = assets.get(input.assetId);
    if (!asset || asset.deleted_at)
      throw new AppError(
        "INVALID_PARAMETERS",
        "One of the chosen files is no longer in the library",
      );
    if (!STUDIO_BUCKETS.has(asset.storage_bucket)) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "A chosen file"} can't be used here`,
      );
    }
    if (!MEDIA_FIELD.test(input.field))
      throw new AppError("INVALID_PARAMETERS", "A file was given an unknown role");
    const expected = FIELD_KIND[input.field as keyof typeof FIELD_KIND] as
      KatanaMediaKind | undefined;
    const kind = asset.asset_type as KatanaMediaKind;
    if (kind !== "image" && kind !== "video" && kind !== "audio") {
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "A chosen file"} isn't an image, video or audio file`,
      );
    }
    if (expected && expected !== kind) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "A chosen file"} is ${kind === "image" ? "an image" : `a ${kind}`}, not ${expected === "image" ? "an image" : `a ${expected}`}`,
      );
    }
    if ((asset.file_size ?? 0) > UPLOAD_MAX_BYTES) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "A chosen file"} is over 500 MB; trim or compress it first`,
      );
    }
    return {
      asset_id: asset.id,
      field: input.field,
      kind,
      title: (asset.title ?? `Untitled ${kind}`).slice(0, 120),
      media_id: null,
    };
  });
}

/**
 * Marks the run's images that show its characters. Each character must still
 * be on the Characters page and be shown by at least one image: that is how a
 * character is in a run.
 */
async function castCharacters(ids: string[], inputs: RunInputRow[]): Promise<RunInputRow[]> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return inputs;
  if (wanted.length > KATANA_CHARACTERS_MAX) {
    throw new AppError(
      "INVALID_PARAMETERS",
      `A run keeps ${KATANA_CHARACTERS_MAX} characters the same at most`,
    );
  }
  const { data, error } = await db
    .from("characters")
    .select("id,name,archived_at,character_images(asset_id,view,position)")
    .in("id", wanted);
  if (error) throw new AppError("STORAGE_FAILED", error.message);
  type Row = {
    id: string;
    name: string;
    archived_at: string | null;
    character_images: { asset_id: string; view: string; position: number }[] | null;
  };
  const rows = new Map(((data ?? []) as unknown as Row[]).map((row) => [row.id, row]));
  const characters: CastCharacter[] = wanted.map((id) => {
    const row = rows.get(id);
    if (!row || row.archived_at) {
      throw new AppError(
        "INVALID_PARAMETERS",
        "One of the chosen characters is no longer on the Characters page",
      );
    }
    return {
      id: row.id,
      name: row.name,
      images: [...(row.character_images ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((image) => ({ assetId: image.asset_id, view: image.view })),
    };
  });
  const { inputs: tagged, missing } = tagCast(inputs, characters);
  if (missing.length) {
    throw new AppError(
      "INVALID_PARAMETERS",
      `Add at least one of ${missing[0]}'s reference images, or take ${missing[0]} out`,
    );
  }
  return tagged;
}

/**
 * The run's characters for its first message: their handed-over images, and
 * their names and looks as they are now (or as the run recorded them, if the
 * characters can't be read).
 */
async function kickoffCast(inputs: RunInputRow[]): Promise<KickoffCharacter[]> {
  const cast = castOfInputs(inputs)
    .map((character) => ({
      ...character,
      images: character.images.flatMap((image) =>
        image.mediaId ? [{ mediaId: image.mediaId, view: image.view }] : [],
      ),
    }))
    .filter((character) => character.images.length);
  if (!cast.length) return [];
  const rows = new Map<string, { name: string; description: string }>();
  try {
    const { data } = await db
      .from("characters")
      .select("id,name,description")
      .in(
        "id",
        cast.map((character) => character.id),
      );
    for (const row of data ?? []) rows.set(row.id, row);
  } catch {
    // The names the run recorded are enough to start with.
  }
  return cast.map((character) => ({
    name: rows.get(character.id)?.name.trim() || character.name,
    description: rows.get(character.id)?.description ?? "",
    images: character.images,
  }));
}

function firstMediaId(payload: unknown): string | null {
  for (const key of ["media_id", "id"]) {
    for (const value of findAll(payload, key)) if (isUuid(value)) return value;
  }
  return null;
}

/** Puts one library file into the team's Higgsfield media, by URL or (when large) by upload. */
async function handOver(mcp: HiggsfieldMcpClient, input: RunInputRow): Promise<string> {
  const { data: asset } = await db
    .from("assets")
    .select("storage_bucket,storage_path,mime_type,file_size,title")
    .eq("id", input.asset_id)
    .maybeSingle();
  if (!asset || !STUDIO_BUCKETS.has(asset.storage_bucket)) {
    throw new AppError("UPLOAD_FAILED", `${input.title} is no longer in the library`);
  }
  const signed = await db.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 30 * 60);
  if (signed.error || !signed.data?.signedUrl)
    throw new AppError("UPLOAD_FAILED", `${input.title} couldn't be shared with Higgsfield`);
  if ((asset.file_size ?? 0) <= IMPORT_MAX_BYTES) {
    try {
      const imported = await mcp.callTool(
        "media_import_url",
        { url: signed.data.signedUrl, type: input.kind },
        { timeoutMs: 150_000 },
      );
      const mediaId = imported.isError ? null : firstMediaId(imported.payload);
      if (mediaId) return mediaId;
    } catch (error) {
      // Adding media is free, so an import that failed or timed out is tried once more as
      // an upload below; a refused sign-in would refuse that too.
      if (error instanceof HiggsfieldMcpError && error.kind === "auth") throw error;
    }
  }

  const source = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(300_000) });
  if (!source.ok || !source.body)
    throw new AppError("UPLOAD_FAILED", `${input.title} couldn't be read from the library`);
  const length = Number(source.headers.get("content-length") ?? asset.file_size ?? 0);
  if (length > UPLOAD_MAX_BYTES) {
    await source.body.cancel().catch(() => undefined);
    throw new AppError("UPLOAD_FAILED", `${input.title} is over 500 MB`);
  }
  // Streamed with its length where the runtime allows; otherwise only a small file is held in memory.
  let body: ReadableStream<Uint8Array> | ArrayBuffer | null = withLength(source.body, length);
  if (!body) {
    if (!(length > 0) || length > BUFFER_MAX_BYTES) {
      await source.body.cancel().catch(() => undefined);
      throw new AppError("UPLOAD_FAILED", `${input.title} is too large to hand over from here`);
    }
    body = await source.arrayBuffer();
  }
  const mime =
    asset.mime_type ||
    source.headers.get("content-type")?.split(";")[0] ||
    (input.kind === "image" ? "image/png" : input.kind === "audio" ? "audio/mpeg" : "video/mp4");
  const extension =
    (asset.storage_path.split(".").pop() ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 5) ||
    (input.kind === "image" ? "png" : input.kind === "audio" ? "mp3" : "mp4");
  const slot = await mcp.callTool("media_upload", {
    filename: `xeno-${input.asset_id}.${extension}`,
    content_type: mime,
  });
  const uploadUrl = firstUrl(slot.payload, ["upload_url"]);
  const mediaId = firstMediaId(slot.payload);
  if (slot.isError || !uploadUrl || !mediaId) {
    if (body instanceof ReadableStream) await body.cancel().catch(() => undefined);
    throw new AppError("UPLOAD_FAILED", `Higgsfield didn't give an upload slot for ${input.title}`);
  }
  const extraHeaders: Record<string, string> = {};
  for (const headers of findAll(slot.payload, "headers")) {
    if (!isObject(headers)) continue;
    for (const [name, value] of Object.entries(headers))
      if (typeof value === "string") extraHeaders[name] = value;
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": mime, ...extraHeaders },
    signal: AbortSignal.timeout(300_000),
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
  await put.body?.cancel().catch(() => undefined);
  if (!put.ok)
    throw new AppError(
      "UPLOAD_FAILED",
      `${input.title} couldn't be uploaded to Higgsfield (HTTP ${put.status})`,
    );
  const confirmed = await mcp.callTool("media_confirm", { media_id: mediaId, type: input.kind });
  if (confirmed.isError)
    throw new AppError(
      "UPLOAD_FAILED",
      `Higgsfield didn't confirm ${input.title}: ${confirmed.text.slice(0, 200)}`,
    );
  return mediaId;
}

/** The credits a balance answer names. */
export function balanceCredits(payload: unknown): number | null {
  for (const key of ["credits", "balance", "available_credits"]) {
    for (const value of findAll(payload, key)) {
      const number = typeof value === "string" ? Number(value) : value;
      if (typeof number === "number" && Number.isFinite(number)) return number;
    }
  }
  return null;
}

async function accountBalance(mcp: HiggsfieldMcpClient): Promise<number | null> {
  try {
    const answer = await mcp.callTool("balance", {}, { timeoutMs: 20_000 });
    return answer.isError ? null : balanceCredits(answer.payload);
  } catch {
    return null;
  }
}

// ---------- Starting a run ----------

export interface StartKatanaRunInput {
  userId: string;
  mode: KatanaMode;
  presetSlug: string | null;
  presetName: string | null;
  title: string;
  brief: string;
  referenceUrl: string | null;
  inputs: Array<{ assetId: string; field: string }>;
  /** The team's characters in it, each shown by some of the images in `inputs`. */
  characterIds: string[];
  creditLimit: number;
  claudeBudgetUsd: number;
  projectId: string | null;
}

async function assertReady(): Promise<KatanaSettings> {
  if (!anthropicConfigured()) {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Katana runs on Claude: an admin needs to add an ANTHROPIC_API_KEY backend secret.",
    );
  }
  const connection = await higgsfieldConnectionStatus();
  if (!connection.tablesReady) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
  if (connection.status !== "connected") {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      connection.lastError ??
        "The team's Higgsfield account isn't connected. An admin can connect it in Settings.",
    );
  }
  return katanaSettings();
}

function checkLimits(settings: KatanaSettings, creditLimit: number, claudeBudgetUsd: number): void {
  if (!(creditLimit > 0) || creditLimit > settings.maxCreditLimit) {
    throw new AppError(
      "INVALID_PARAMETERS",
      `Set a credit limit between 1 and ${formatCredits(settings.maxCreditLimit)}.`,
    );
  }
  if (
    !(claudeBudgetUsd >= LIMITS.claudeBudgetUsd.min) ||
    claudeBudgetUsd > LIMITS.claudeBudgetUsd.max
  ) {
    throw new AppError(
      "INVALID_PARAMETERS",
      `Set a Claude budget between $${LIMITS.claudeBudgetUsd.min} and $${LIMITS.claudeBudgetUsd.max}.`,
    );
  }
}

function checkReferenceUrl(url: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new AppError("INVALID_PARAMETERS", "The reference link isn't a web address");
  }
  if (parsed.protocol !== "https:")
    throw new AppError("INVALID_PARAMETERS", "The reference link must start with https://");
  return parsed.toString().slice(0, 2048);
}

/**
 * Saves a new run. Its media is handed over and its session started by the
 * next reader (the run's page, which opens next, or the tick), so a slow
 * hand-over never looks like a failed start.
 */
export async function startKatanaRun(input: StartKatanaRunInput): Promise<{ runId: string }> {
  const settings = await assertReady();
  checkLimits(settings, input.creditLimit, input.claudeBudgetUsd);
  const brief = input.brief.trim().slice(0, LIMITS.briefChars);
  const referenceUrl = input.mode === "remix" ? checkReferenceUrl(input.referenceUrl) : null;
  const inputs = await castCharacters(input.characterIds, await resolveInputs(input.inputs));
  const count = (field: string) => inputs.filter((entry) => entry.field === field).length;
  const images = inputs.filter((entry) => entry.kind === "image").length;
  if (images > LIMITS.images)
    throw new AppError("INVALID_PARAMETERS", `Use at most ${LIMITS.images} images`);

  let presetSlug: string | null = null;
  if (input.mode === "preset") {
    presetSlug = (input.presetSlug ?? "").replace(/^\/?katana\//, "");
    if (!PRESET_SLUG.test(presetSlug))
      throw new AppError("INVALID_PARAMETERS", "Choose a Katana preset");
  } else {
    if (inputs.some((entry) => !Object.values(KATANA_FIELDS).includes(entry.field as never))) {
      throw new AppError("INVALID_PARAMETERS", "A file was given an unknown role");
    }
    if (count(KATANA_FIELDS.audio) > 1)
      throw new AppError("INVALID_PARAMETERS", "Use one soundtrack at most");
  }
  if (input.mode === "remix") {
    if (count(KATANA_FIELDS.referenceVideo) > 1)
      throw new AppError("INVALID_PARAMETERS", "Choose one reference video");
    if (count(KATANA_FIELDS.videos) > 0)
      throw new AppError("INVALID_PARAMETERS", "A remix takes one reference video");
    if (count(KATANA_FIELDS.referenceVideo) && referenceUrl) {
      throw new AppError(
        "INVALID_PARAMETERS",
        "Use either a reference video from the library or a link, not both",
      );
    }
    if (!count(KATANA_FIELDS.referenceVideo) && !referenceUrl && brief.length < 12) {
      throw new AppError(
        "INVALID_PARAMETERS",
        "Give Katana a reference video, a link to one, or a brief it can find one from",
      );
    }
  }
  if (input.mode === "edit") {
    if (!count(KATANA_FIELDS.videos))
      throw new AppError("INVALID_PARAMETERS", "Choose the footage to edit");
    if (count(KATANA_FIELDS.videos) > LIMITS.videos)
      throw new AppError("INVALID_PARAMETERS", `Edit at most ${LIMITS.videos} clips at once`);
    if (count(KATANA_FIELDS.referenceVideo))
      throw new AppError("INVALID_PARAMETERS", "An edit takes your footage, not a reference");
    if (brief.length < 4)
      throw new AppError("INVALID_PARAMETERS", "Say how Katana should edit the footage");
  }

  const title =
    input.title.trim().slice(0, LIMITS.titleChars) ||
    (input.mode === "preset"
      ? `${input.presetName ?? presetSlug}`
      : brief.split("\n")[0]?.slice(0, 80)) ||
    (input.mode === "edit" ? "Footage edit" : "Katana remix");

  const { data: run, error } = await db
    .from("katana_runs")
    .insert({
      created_by: input.userId,
      project_id: input.projectId,
      title,
      mode: input.mode,
      preset_slug: presetSlug,
      preset_name: input.mode === "preset" ? (input.presetName?.slice(0, 200) ?? null) : null,
      brief,
      reference_url: referenceUrl,
      inputs: inputs as unknown as Json,
      credit_limit: input.creditLimit,
      claude_budget_cents: Math.round(input.claudeBudgetUsd * 100),
      status: "preparing",
    })
    .select("id")
    .single();
  if (error || !run) {
    if (isMissingTable(error)) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
    throw new AppError("STORAGE_FAILED", error?.message ?? "The run couldn't be saved");
  }
  const cast = [
    ...new Set(inputs.flatMap((entry) => (entry.character_name ? [entry.character_name] : []))),
  ];
  await note(run.id, "user", "Run requested", brief, {
    mode: input.mode,
    preset: presetSlug,
    ...(cast.length ? { characters: cast } : {}),
  });
  return { runId: run.id };
}

/** A revision in a new session, from an earlier run's saved state (Katana's resume line). */
export async function startKatanaRevision(input: {
  userId: string;
  runId: string;
  text: string;
  assetIds: Array<{ assetId: string; field: string }>;
  creditLimit: number;
  claudeBudgetUsd: number;
}): Promise<{ runId: string }> {
  const settings = await assertReady();
  checkLimits(settings, input.creditLimit, input.claudeBudgetUsd);
  const parent = await readRun(input.runId);
  if (!parent.resume_line) {
    throw new AppError(
      "INVALID_PARAMETERS",
      "This run saved no state to continue from. Start a new run instead.",
    );
  }
  const text = input.text.trim().slice(0, LIMITS.briefChars);
  if (text.length < 4) throw new AppError("INVALID_PARAMETERS", "Say what to change");
  const added = await resolveInputs(input.assetIds);
  const inputs = [...runInputs(parent), ...added];
  const { data: run, error } = await db
    .from("katana_runs")
    .insert({
      created_by: input.userId,
      project_id: parent.project_id,
      parent_run_id: parent.id,
      title: `${parent.title || "Katana run"} · revision`.slice(0, LIMITS.titleChars),
      mode: parent.mode,
      preset_slug: parent.preset_slug,
      preset_name: parent.preset_name,
      brief: text,
      reference_url: parent.reference_url,
      inputs: inputs as unknown as Json,
      credit_limit: input.creditLimit,
      claude_budget_cents: Math.round(input.claudeBudgetUsd * 100),
      resume_line: parent.resume_line,
      status: "preparing",
    })
    .select("id")
    .single();
  if (error || !run)
    throw new AppError("STORAGE_FAILED", error?.message ?? "The revision couldn't be saved");
  await note(run.id, "user", "Revision requested", text, { parent: parent.id });
  return { runId: run.id };
}

/** Moves a run that hasn't got a session yet along: hands over its media, then starts it. */
async function advanceRun(runId: string): Promise<void> {
  const run = await readRun(runId);
  if (run.status === "preparing") return prepareRun(runId);
  if (run.status === "starting" || run.status === "uncertain") return recoverStart(run);
}

/** Settles a run as failed (only from the statuses given, so a cancel is never overwritten). */
async function failRun(lease: Lease, message: string, statuses: readonly string[]): Promise<void> {
  const { data } = await db
    .from("katana_runs")
    .update({
      status: "failed",
      error: message.slice(0, 2000),
      status_detail: null,
      finished_at: nowIso(),
      sync_lease_until: null,
      sync_lease_owner: null,
    })
    .eq("id", lease.run.id)
    .eq("sync_lease_owner", lease.token)
    .in("status", [...statuses])
    .select("id");
  if (data?.length) await note(lease.run.id, "error", "The run couldn't start", message);
  else await releaseRun(lease).catch(() => undefined);
}

async function prepareRun(runId: string): Promise<void> {
  const lease = await claimRun(runId, ["preparing"], HANDOVER_LEASE_MS);
  if (!lease) return;
  // Readers that keep getting cut off midway would otherwise retry forever.
  if (Date.now() - Date.parse(lease.run.created_at) > PREPARE_MAX_MS) {
    await failRun(
      lease,
      "Handing the files to Higgsfield didn't finish within 30 minutes, so the run didn't start and nothing was charged. Start it again; smaller files hand over faster.",
      ["preparing"],
    );
    return;
  }
  let mcp: HiggsfieldMcpClient | null = null;
  try {
    mcp = await higgsfieldMcp({ timeoutMs: 60_000 });
    const inputs = runInputs(lease.run);
    for (const input of inputs) {
      if (input.media_id) continue;
      input.media_id = await handOver(mcp, input);
      // Each file handed over is kept (and the hold renewed), so a reader cut off midway
      // leaves the next one less to do. A hold lost to another reader ends this one.
      const kept = await stillHeld(lease, HANDOVER_LEASE_MS, {
        inputs: inputs as unknown as Json,
      });
      if (!kept) return;
    }
    if (inputs.length)
      await note(
        runId,
        "note",
        `Handed ${inputs.length} file${inputs.length === 1 ? "" : "s"} to Higgsfield`,
      );
    const balance = await accountBalance(mcp);
    // Only the hold's owner moves it on, and only if nobody cancelled it meanwhile.
    const { data: moved } = await db
      .from("katana_runs")
      .update({
        status: "starting",
        balance_start: balance,
        started_at: nowIso(),
        inputs: inputs as unknown as Json,
      })
      .eq("id", runId)
      .eq("status", "preparing")
      .eq("sync_lease_owner", lease.token)
      .select("*")
      .maybeSingle();
    if (!moved) {
      await releaseRun(lease).catch(() => undefined);
      return;
    }
    await startSession({ run: moved, token: lease.token });
  } catch (error) {
    await failRun(lease, messageOf(error), ["preparing", "starting"]);
  } finally {
    await mcp?.close();
  }
}

/** True when Anthropic definitely turned the request down (nothing was created). */
function definitelyRefused(error: unknown): boolean {
  return isApiStatus(error, 400, 401, 403, 404, 409, 413, 422, 429);
}

/** Sends a stop to a session; true when it arrived (or the session was already done). */
async function interrupt(sessionId: string): Promise<boolean> {
  try {
    await anthropicClient().beta.sessions.events.send(sessionId, {
      events: [{ type: "user.interrupt" }],
    });
    return true;
  } catch (error) {
    // A finished or missing session has nothing left to stop.
    return isApiStatus(error, 400, 404, 409);
  }
}

/**
 * Starts a run's session. Once Anthropic has answered with a session, nothing
 * here throws: if its record can't be written, the start check finds the
 * session by the run's ID instead.
 */
async function startSession(lease: Lease): Promise<void> {
  const { run } = lease;
  const setup = await ensureKatanaSetup();
  await ensureVaultToken(45 * 60_000);
  const inputs = mediaInputs(runInputs(run));
  const text =
    run.parent_run_id && run.resume_line
      ? revisionMessage({
          resumeLine: run.resume_line,
          text: run.brief,
          inputs,
          creditLimit: Number(run.credit_limit),
        })
      : kickoffMessage({
          mode: run.mode as KatanaMode,
          presetSlug: run.preset_slug,
          brief: run.brief,
          referenceUrl: run.reference_url,
          inputs,
          creditLimit: Number(run.credit_limit),
          characters: await kickoffCast(runInputs(run)),
        });
  const anthropic = anthropicClient();
  let session;
  try {
    // Never retried on its own: a retry after an unclear answer could start a second, billed session.
    session = await anthropic.beta.sessions.create(
      {
        agent: { type: "agent", id: setup.agentId, version: setup.agentVersion },
        environment_id: setup.environmentId,
        vault_ids: [setup.vaultId],
        title: `Katana · ${run.title}`.slice(0, 200),
        metadata: { app: "xeno-studio", xeno_run_id: run.id },
        budget: {
          type: "limit",
          max_list_cost: { amount: String(run.claude_budget_cents), currency: "USD" },
        },
        initial_events: [{ type: "user.message", content: [{ type: "text", text }] }],
      },
      { maxRetries: 0, timeout: 120_000 },
    );
  } catch (error) {
    if (definitelyRefused(error)) {
      await failRun(lease, `Anthropic didn't start the session: ${messageOf(error)}`, ["starting"]);
      return;
    }
    await releaseRun(lease, {
      status: "uncertain",
      status_detail:
        "Starting the session got no clear answer; checking whether it began before doing anything else.",
    }).catch(() => undefined);
    await note(run.id, "status", "Checking whether the session started", messageOf(error));
    return;
  }
  try {
    // A start check that ran meanwhile may have marked the run uncertain; it is still this one.
    const { data: attached } = await db
      .from("katana_runs")
      .update({
        status: "running",
        session_id: session.id,
        agent_version: setup.agentVersion,
        status_detail: null,
        error: null,
        sync_lease_until: null,
        sync_lease_owner: null,
      })
      .eq("id", run.id)
      .in("status", ["starting", "uncertain"])
      .select("id")
      .maybeSingle();
    if (attached) {
      await note(run.id, "status", "Katana is working", "", { session: session.id });
      return;
    }
    const current = await readRun(run.id);
    if (current.session_id === session.id && current.status !== "cancelled") {
      // The start check found this session first and follows it already.
      await releaseRun(lease).catch(() => undefined);
      return;
    }
    // Cancelled (or settled) while the session was starting: keep its record, and stop it.
    const stopped = await interrupt(session.id);
    await db
      .from("katana_runs")
      .update({
        session_id: current.session_id ?? session.id,
        agent_version: current.agent_version ?? setup.agentVersion,
        cancel_requested: !stopped,
      })
      .eq("id", run.id);
    await releaseRun(lease).catch(() => undefined);
    await note(
      run.id,
      "status",
      current.status === "cancelled"
        ? "The session started after the run was cancelled, so it was stopped"
        : "The session started after the run had settled, so it was stopped",
    );
  } catch (error) {
    console.error("katana session record not written", {
      runId: run.id,
      sessionId: session.id,
      message: messageOf(error),
    });
  }
}

/** The session started for a run, found among Anthropic's by the run's ID. */
async function findSessionFor(runId: string, startedAt: number): Promise<string | null> {
  const { data: setup } = await db
    .from("katana_setup")
    .select("agent_id")
    .eq("id", "default")
    .maybeSingle();
  if (!setup?.agent_id) return null;
  const page = await anthropicClient().beta.sessions.list({
    agent_id: setup.agent_id,
    "created_at[gte]": new Date(startedAt - 5 * 60_000).toISOString(),
    limit: 100,
    include_archived: true,
  });
  return page.data.find((session) => session.metadata?.["xeno_run_id"] === runId)?.id ?? null;
}

/** A start that got no clear answer: find its session among Anthropic's, or settle it as not started. */
async function recoverStart(run: RunRow): Promise<void> {
  if (run.session_id) {
    await db
      .from("katana_runs")
      .update({ status: "running", status_detail: null })
      .eq("id", run.id)
      .in("status", ["starting", "uncertain"]);
    return;
  }
  const startedAt = Date.parse(run.started_at ?? run.created_at);
  // A start still in progress elsewhere is left alone for a few minutes.
  if (run.status === "starting" && Date.now() - startedAt < 4 * 60_000) return;
  const lease = await claimRun(run.id, ["starting", "uncertain"], 60_000);
  if (!lease) return;
  try {
    const found = await findSessionFor(run.id, startedAt);
    if (found) {
      await releaseRun(lease, { status: "running", session_id: found, status_detail: null });
      await note(run.id, "status", "The session had started; following it now", "", {
        session: found,
      });
      return;
    }
    if (Date.now() - startedAt > 15 * 60_000) {
      await failRun(
        lease,
        "The session never appeared at Anthropic, so it didn't start and nothing was charged. Start the run again.",
        ["starting", "uncertain"],
      );
      return;
    }
    await releaseRun(lease, { status: "uncertain" });
  } catch (error) {
    await releaseRun(lease).catch(() => undefined);
    console.error("katana start check failed", { runId: run.id, message: messageOf(error) });
  }
}

/**
 * A cancelled run whose session wasn't known, or whose stop didn't arrive:
 * find the session and stop it, giving up after twenty minutes without one.
 */
async function followCancel(run: RunRow): Promise<void> {
  const lease = await claimRun(run.id, undefined, 60_000);
  if (!lease) return;
  try {
    const startedAt = Date.parse(run.started_at ?? run.created_at);
    const sessionId = run.session_id ?? (await findSessionFor(run.id, startedAt));
    if (sessionId) {
      if (await interrupt(sessionId)) {
        await releaseRun(lease, { session_id: sessionId, cancel_requested: false });
        await note(run.id, "status", "Stopped the cancelled run's session");
        return;
      }
    } else if (Date.now() - startedAt > 20 * 60_000) {
      await releaseRun(lease, { cancel_requested: false });
      return;
    }
    await releaseRun(lease);
  } catch (error) {
    await releaseRun(lease).catch(() => undefined);
    console.error("katana cancel follow-up failed", { runId: run.id, message: messageOf(error) });
  }
}

// ---------- Following a session ----------

interface ReadEvents {
  events: SessionEventLike[];
  lastEventAt: string | null;
  boundary: string[];
}

/** The session's events after where the last reader stopped, oldest first (up to `max`). */
async function readNewEvents(sessionId: string, run: RunRow, max = 600): Promise<ReadEvents> {
  const anthropic = anthropicClient();
  const seen = new Set(run.boundary_event_ids ?? []);
  const params = {
    limit: 200,
    order: "asc" as const,
    types: [...KATANA_EVENT_TYPES],
    ...(run.last_event_at ? { "created_at[gte]": run.last_event_at } : {}),
  };
  let lastEventAt = run.last_event_at;
  let boundary = [...seen];
  const events: SessionEventLike[] = [];
  let page = await anthropic.beta.sessions.events.list(sessionId, params);
  for (;;) {
    for (const raw of page.data) {
      const event = raw as unknown as SessionEventLike;
      const at = event.processed_at ?? null;
      if (at) {
        if (!lastEventAt || Date.parse(at) > Date.parse(lastEventAt)) {
          lastEventAt = at;
          boundary = [event.id];
        } else if (Date.parse(at) === Date.parse(lastEventAt) && !boundary.includes(event.id)) {
          boundary.push(event.id);
        }
      }
      if (seen.has(event.id)) continue;
      events.push(event);
    }
    if (events.length >= max || !page.hasNextPage()) break;
    page = await page.getNextPage();
  }
  return { events, lastEventAt, boundary: boundary.slice(-200) };
}

/** Earlier calls (read in a previous pass) that results in this pass answer, as far as they matter. */
async function earlierCalls(
  runId: string,
  events: SessionEventLike[],
): Promise<Map<string, { name: string; input: unknown }>> {
  const inBatch = new Set(
    events.filter((event) => event.type === "agent.mcp_tool_use").map((event) => event.id),
  );
  const wanted = events
    .filter((event) => event.type === "agent.mcp_tool_result")
    .map((event) => event["mcp_tool_use_id"])
    .filter((id): id is string => typeof id === "string" && !inBatch.has(id));
  const found = new Map<string, { name: string; input: unknown }>();
  if (!wanted.length) return found;
  const { data } = await db
    .from("katana_run_events")
    .select("source_id,data")
    .eq("run_id", runId)
    .in("source_id", [...new Set(wanted)]);
  for (const row of data ?? []) {
    const value = isObject(row.data) ? row.data : {};
    if (!row.source_id || typeof value["tool"] !== "string") continue;
    const delivery = isObject(value["delivery"]) ? value["delivery"] : null;
    found.set(row.source_id, {
      name: value["tool"],
      input:
        value["quote"] === true
          ? { params: { get_cost: true } }
          : delivery
            ? { action: "katana_video", media_id: delivery["media_id"], url: delivery["url"] }
            : null,
    });
  }
  return found;
}

interface GuardContext {
  run: RunRow;
  settings: KatanaSettings;
  mcp: HiggsfieldMcpClient | null;
}

async function pricingClient(context: GuardContext): Promise<HiggsfieldMcpClient> {
  if (!context.mcp) context.mcp = await higgsfieldMcp({ timeoutMs: QUOTE_TIMEOUT_MS });
  return context.mcp;
}

/** What one paid call comes to, before the ledger decides whether it fits. */
type Pricing =
  | { kind: "answer"; allow: boolean; reason: string }
  | { kind: "paid"; items: PricedItem[]; priced: boolean; label: string };

const answer = (allow: boolean, reason: string): Pricing => ({ kind: "answer", allow, reason });

async function price(context: GuardContext, ask: ToolUse): Promise<Pricing> {
  if (context.run.status === "cancelled") return answer(false, CANCELLED_MESSAGE);
  const call = classifyGuardedCall(ask.name, ask.input);
  switch (call.kind) {
    case "quote":
      return answer(true, "Price check (free)");
    case "invalid":
      return answer(
        false,
        `The studio's credit guard turned this call down: ${call.reason}. Nothing was made or charged.`,
      );
    case "preset_session":
      return call.free
        ? answer(
            false,
            "This run is billed to credits, not a free Katana run: call get_katana_config with free_generation: false.",
          )
        : answer(true, "Preset run session (no charge by itself)");
    case "estimate": {
      const each =
        call.mediaType === "image"
          ? context.settings.removeBackgroundCredits
          : context.settings.removeBackgroundVideoCredits;
      return {
        kind: "paid",
        items: [{ index: 0, model: "remove_background", credits: each * call.jobs }],
        priced: false,
        label:
          call.mediaType === "image"
            ? "an image's background removal"
            : "a video's background removal",
      };
    }
    case "submit": {
      for (const item of call.items) {
        const flag = freeBillingFlag(item.params);
        if (flag) {
          return answer(
            false,
            `This run is billed to credits: send the call without ${flag}. Nothing was made or charged.`,
          );
        }
        if (requestCount(item.params) > 1) {
          return answer(
            false,
            "The studio prices one result per request: send count 1 (or one batch item per result). Nothing was made or charged.",
          );
        }
      }
      const mcp = await pricingClient(context);
      const items: PricedItem[] = [];
      // A few at a time: a batch has up to twelve.
      for (let start = 0; start < call.items.length; start += 4) {
        const slice = call.items.slice(start, start + 4);
        items.push(
          ...(await Promise.all(
            slice.map(async (item) => {
              const model = typeof item.params["model"] === "string" ? item.params["model"] : null;
              try {
                const quote = await mcp.callTool(
                  call.quoteTool,
                  { params: quoteParams(item.params) },
                  { timeoutMs: QUOTE_TIMEOUT_MS },
                );
                return {
                  index: item.index,
                  model,
                  credits: quote.isError ? null : quoteCredits(quote.payload),
                };
              } catch {
                return { index: item.index, model, credits: null };
              }
            }),
          )),
        );
      }
      return { kind: "paid", items, priced: true, label: callLabel(call) };
    }
  }
}

/** Records a decision that costs nothing (a price check, a refusal). The first answer stays. */
async function recordAnswer(
  run: RunRow,
  ask: ToolUse,
  allow: boolean,
  reason: string,
  items: PricedItem[] = [],
  credits = 0,
): Promise<boolean> {
  const { data, error } = await db
    .from("katana_spend")
    .upsert(
      {
        run_id: run.id,
        tool_use_id: ask.id,
        tool_name: ask.name,
        decision: allow ? "allowed" : "denied",
        credits: allow ? 0 : credits,
        priced: true,
        reason: reason.slice(0, 1000),
        items: items as unknown as Json,
      },
      { onConflict: "run_id,tool_use_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new AppError("STORAGE_FAILED", error.message);
  return !!data?.length;
}

/**
 * Decides every paid call waiting in this pass. A call with credits is
 * committed by the database in one locked step (what the run's allowed calls
 * add up to, plus this one, against its limit), so readers racing each other
 * can never both spend the same room.
 */
async function guardAsks(context: GuardContext, asks: ToolUse[]): Promise<void> {
  if (!asks.length) return;
  const { run } = context;
  const { data: existing } = await db
    .from("katana_spend")
    .select("tool_use_id")
    .eq("run_id", run.id)
    .in(
      "tool_use_id",
      asks.map((ask) => ask.id),
    );
  const decided = new Set((existing ?? []).map((row) => row.tool_use_id));
  for (const ask of asks) {
    if (decided.has(ask.id)) continue;
    let pricing: Pricing;
    try {
      pricing = await price(context, ask);
    } catch (error) {
      pricing = answer(
        false,
        `The studio couldn't check this call's price (${messageOf(error).slice(0, 200)}), so it wasn't submitted. Nothing was made or charged; you may try it once more later.`,
      );
    }
    if (pricing.kind === "answer") {
      const fresh = await recordAnswer(run, ask, pricing.allow, pricing.reason);
      if (fresh && !pricing.allow) {
        await note(run.id, "credit", "Credit guard: turned down", pricing.reason, {
          tool: ask.name,
          allowed: false,
        });
      }
      continue;
    }
    const total = pricing.items.reduce((sum, item) => sum + (item.credits ?? 0), 0);
    if (pricing.items.some((item) => item.credits === null)) {
      const unpriced = decideSpend({
        items: pricing.items,
        reserved: 0,
        limit: Number(run.credit_limit),
        priced: pricing.priced,
        label: pricing.label,
      });
      if (await recordAnswer(run, ask, false, unpriced.reason, pricing.items)) {
        await note(run.id, "credit", "Credit guard: turned down", unpriced.reason, {
          tool: ask.name,
          allowed: false,
        });
      }
      continue;
    }
    const { data, error } = await db.rpc("katana_reserve_credits", {
      p_run_id: run.id,
      p_tool_use_id: ask.id,
      p_tool_name: ask.name,
      p_credits: Math.round(total * 1000) / 1000,
      p_priced: pricing.priced,
      p_items: pricing.items as unknown as Json,
    });
    if (error) throw new AppError("STORAGE_FAILED", error.message);
    const outcome = data?.[0];
    if (!outcome || outcome.o_existing) continue;
    const committed = Number(outcome.o_committed);
    const decision = decideSpend({
      items: pricing.items,
      reserved: outcome.o_allowed ? committed - total : committed,
      limit: Number(outcome.o_limit),
      priced: pricing.priced,
      label: pricing.label,
    });
    // The ledger's answer stands; its words come from the same arithmetic. They only
    // differ when the run was cancelled as this call was priced.
    const reason =
      decision.allow === outcome.o_allowed
        ? decision.reason
        : outcome.o_allowed
          ? `${pricing.label}: ${formatCredits(total)} credits.`
          : CANCELLED_MESSAGE;
    await db
      .from("katana_spend")
      .update({ reason: reason.slice(0, 1000) })
      .eq("run_id", run.id)
      .eq("tool_use_id", ask.id);
    await note(
      run.id,
      "credit",
      outcome.o_allowed ? "Credit guard: allowed" : "Credit guard: turned down",
      reason,
      { tool: ask.name, credits: total, allowed: outcome.o_allowed },
    );
  }
}

/**
 * Sends every decided answer the session hasn't had yet, while this reader
 * still holds the run (the one that took it over sends otherwise). A run
 * cancelled meanwhile has its unsent allowances turned into refusals first.
 */
async function sendAnswers(lease: Lease): Promise<number> {
  const sessionId = lease.run.session_id;
  if (!sessionId || !(await stillHeld(lease))) return 0;
  const current = await readRun(lease.run.id);
  if (current.status === "cancelled") {
    const { data: withdrawn } = await db
      .from("katana_spend")
      .update({ decision: "denied", credits: 0, reason: CANCELLED_MESSAGE })
      .eq("run_id", lease.run.id)
      .eq("decision", "allowed")
      .is("sent_at", null)
      .select("id");
    if (withdrawn?.length) await db.rpc("katana_recount_credits", { p_run_id: lease.run.id });
  }
  const { data: unsent } = await db
    .from("katana_spend")
    .select("id,tool_use_id,decision,reason")
    .eq("run_id", lease.run.id)
    .is("sent_at", null)
    .order("decided_at", { ascending: true })
    .limit(50);
  if (!unsent?.length) return 0;
  return sendConfirmations(sessionId, unsent);
}

type Confirmable = { id: string; tool_use_id: string; decision: string; reason: string | null };

async function sendConfirmations(sessionId: string, rows: Confirmable[]): Promise<number> {
  const anthropic = anthropicClient();
  const confirmation = (row: Confirmable) =>
    row.decision === "allowed"
      ? {
          type: "user.tool_confirmation" as const,
          tool_use_id: row.tool_use_id,
          result: "allow" as const,
        }
      : {
          type: "user.tool_confirmation" as const,
          tool_use_id: row.tool_use_id,
          result: "deny" as const,
          deny_message: row.reason ?? "The studio's credit guard turned this call down.",
        };
  const markSent = (ids: string[]) =>
    db.from("katana_spend").update({ sent_at: nowIso() }).in("id", ids);
  try {
    await anthropic.beta.sessions.events.send(sessionId, { events: rows.map(confirmation) });
    await markSent(rows.map((row) => row.id));
    return rows.length;
  } catch (error) {
    if (!isApiStatus(error, 400, 409)) throw error;
    // One of them was already answered (or the session moved on): send them one by one.
    // One that still waits is answered again when the session is next asked where it stands.
    let sent = 0;
    for (const row of rows) {
      try {
        await anthropic.beta.sessions.events.send(sessionId, { events: [confirmation(row)] });
        sent += 1;
      } catch (single) {
        if (!isApiStatus(single, 400, 409)) throw single;
      }
      await markSent([row.id]);
    }
    return sent;
  }
}

/**
 * Reads each allowed call's result once: records the jobs it made, and frees
 * the credits of jobs Higgsfield said it didn't make (a concurrency refusal, an
 * unlimited-generations question, a preset suggestion). Any other failure may
 * still have made a job, so its credits stay committed.
 */
async function recordJobs(run: RunRow, results: EventEffects["toolResults"]): Promise<void> {
  for (const result of results) {
    const tool = result.tool ?? "";
    if (!tool.startsWith("generate_") && tool !== "remove_background") continue;
    const { data: spend } = await db
      .from("katana_spend")
      .select("id,decision,credits,items,result_at")
      .eq("run_id", run.id)
      .eq("tool_use_id", result.toolUseId)
      .maybeSingle();
    if (!spend || spend.decision !== "allowed" || spend.result_at || Number(spend.credits) <= 0)
      continue;
    const items = (Array.isArray(spend.items) ? spend.items : []) as unknown as PricedItem[];
    const jobs = submittedJobIds(result.payload);
    const unmade = new Set(
      unmadeIndexes(
        result.payload,
        result.text,
        items.map((item) => item.index),
      ),
    );
    const freed = items
      .filter((item) => unmade.has(item.index))
      .reduce((sum, item) => sum + (item.credits ?? 0), 0);
    if (jobs.length) await db.from("katana_spend").update({ job_ids: jobs }).eq("id", spend.id);
    const { error } = await db.rpc("katana_release_credits", {
      p_run_id: run.id,
      p_tool_use_id: result.toolUseId,
      p_credits: Math.round(freed * 1000) / 1000,
      p_reason:
        freed > 0
          ? `Higgsfield made no job for ${unmade.size === items.length ? "it" : `${unmade.size} of its requests`}, so ${formatCredits(freed)} credits were freed.`
          : null,
    });
    if (error) throw new AppError("STORAGE_FAILED", error.message);
  }
}

async function resultKey(candidate: {
  mediaId: string | null;
  url: string | null;
}): Promise<string | null> {
  if (candidate.mediaId) return candidate.mediaId;
  if (!candidate.url) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate.url));
  return `url-${[...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The run's state that follows from where its session stands. */
function stateUpdate(
  run: RunRow,
  state: SessionState,
  options: { answered: number; hasResult: boolean; noResult: string | null },
): RunUpdate {
  const values: RunUpdate = {};
  if (state.kind === "running") {
    values.status = "running";
    values.status_detail = null;
  } else if (state.kind === "idle") {
    if (state.stop === "requires_action") {
      values.status = options.answered > 0 ? "running" : "waiting";
    } else if (state.stop === "end_turn") {
      const delivered = options.hasResult && !options.noResult;
      values.status = delivered ? "delivered" : "idle";
      values.status_detail = options.noResult ? options.noResult.slice(0, 1000) : null;
      if (delivered) values.finished_at = nowIso();
    } else if (state.stop === "budget_reached") {
      values.status = "paused";
      values.status_detail = "The run's Claude budget is used up. Raise it to let Katana carry on.";
    } else {
      values.status = "failed";
      values.status_detail = null;
      values.error = (
        state.stop === "refusal"
          ? `Claude declined to continue${state.refusal ? `: ${state.refusal}` : ""}`
          : "Katana stopped after repeated errors."
      ).slice(0, 2000);
      values.finished_at = nowIso();
    }
  } else {
    values.status = options.hasResult ? "delivered" : "failed";
    if (!options.hasResult) values.error = "The session ended without a finished video.";
    values.finished_at = nowIso();
  }
  if (run.status === values.status && values.status !== "delivered") delete values.finished_at;
  return values;
}

/**
 * A run whose events stopped coming: the session itself is asked where it
 * stands (every few minutes at most). A call it still waits on is answered
 * again, or decided when it was never read.
 */
async function checkState(lease: Lease, context: GuardContext): Promise<SessionState | null> {
  const { run } = lease;
  const sessionId = run.session_id;
  if (!sessionId || !["running", "waiting"].includes(run.status)) return null;
  const lastActivity = Date.parse(run.last_event_at ?? run.started_at ?? run.created_at);
  if (Date.now() - lastActivity < QUIET_MS) return null;
  if (
    run.state_checked_at &&
    Date.now() - Date.parse(run.state_checked_at) < STATE_CHECK_EVERY_MS
  ) {
    return null;
  }
  await updateRun(run.id, { state_checked_at: nowIso() });
  const anthropic = anthropicClient();
  const session = await anthropic.beta.sessions.retrieve(sessionId);
  if (session.status === "terminated") return { kind: "terminated" };
  if (session.status !== "idle") return null;
  const latest = await anthropic.beta.sessions.events.list(sessionId, {
    order: "desc",
    limit: 1,
    types: ["session.status_idle"],
  });
  const idle = latest.data[0] as unknown as SessionEventLike | undefined;
  if (!idle) return null;
  const effects = interpretEvents([idle], () => null);
  const state = effects.state;
  if (state?.kind !== "idle" || state.stop !== "requires_action") return state;

  // Still waiting on calls: answer the decided ones again, decide the ones never read.
  const { data: decided } = await db
    .from("katana_spend")
    .select("id,tool_use_id,decision,reason")
    .eq("run_id", run.id)
    .in("tool_use_id", state.eventIds.length ? state.eventIds : ["-"]);
  const known = new Set((decided ?? []).map((row) => row.tool_use_id));
  const missing = state.eventIds.filter((id) => !known.has(id));
  if (missing.length) {
    const recent = await anthropic.beta.sessions.events.list(sessionId, {
      order: "desc",
      limit: 100,
      types: ["agent.mcp_tool_use"],
    });
    const asks = interpretEvents(
      (recent.data as unknown as SessionEventLike[]).filter((event) => missing.includes(event.id)),
      () => null,
    ).asks;
    await guardAsks(context, asks);
  }
  if (await stillHeld(lease)) {
    const { data: waiting } = await db
      .from("katana_spend")
      .select("id,tool_use_id,decision,reason")
      .eq("run_id", run.id)
      .in("tool_use_id", state.eventIds.length ? state.eventIds : ["-"]);
    if (waiting?.length) await sendConfirmations(sessionId, waiting);
  }
  return null;
}

/** Writes where a reader got to, and the run's new state unless it was cancelled meanwhile. */
async function finishPass(lease: Lease, progress: RunUpdate, outcome: RunUpdate): Promise<void> {
  if (Object.keys(outcome).length) {
    const { data, error } = await db
      .from("katana_runs")
      .update({ ...progress, ...outcome, sync_lease_until: null, sync_lease_owner: null })
      .eq("id", lease.run.id)
      .eq("sync_lease_owner", lease.token)
      .neq("status", "cancelled")
      .select("id");
    if (error) throw new AppError("STORAGE_FAILED", error.message);
    if (data?.length) return;
  }
  await releaseRun(lease, progress);
}

/**
 * Reads what happened in a run's session since the last reader, answers the
 * paid calls waiting on the guard and saves anything it delivered. Safe to
 * call from anywhere at any time: one reader per run at a time.
 */
export async function syncKatanaRun(
  runId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const current = await readRun(runId);
  if (current.cancel_requested) await followCancel(current).catch(() => undefined);
  if (
    current.status === "preparing" ||
    current.status === "starting" ||
    current.status === "uncertain"
  ) {
    await advanceRun(runId);
    return;
  }
  if (!current.session_id) return;
  // A settled run's session is quiet until someone acts on it, so a page open on it reads it rarely.
  if (
    !options.force &&
    SETTLED.has(current.status) &&
    current.synced_at &&
    Date.now() - Date.parse(current.synced_at) < 30_000
  ) {
    await savePendingResults(runId);
    return;
  }
  const lease = await claimRun(runId);
  if (!lease || !lease.run.session_id) return;
  const { run } = lease;
  const sessionId = lease.run.session_id;
  const context: GuardContext = { run, settings: await katanaSettings(), mcp: null };
  let finished = false;
  try {
    let read: ReadEvents;
    try {
      read = await readNewEvents(sessionId, run);
    } catch (error) {
      if (!isApiStatus(error, 404)) throw error;
      // The session is gone (deleted, or the key now belongs elsewhere): nothing more will come.
      await finishPass(
        lease,
        { synced_at: nowIso() },
        {
          status: "failed",
          error: "The run's session no longer exists at Anthropic.",
          finished_at: nowIso(),
        },
      );
      finished = true;
      return;
    }
    const earlier = await earlierCalls(run.id, read.events);
    const effects = interpretEvents(read.events, (id) => earlier.get(id) ?? null);
    await addFeed(run.id, effects.feed);
    await recordJobs(run, effects.toolResults);
    await guardAsks(context, effects.asks);
    const answered = await sendAnswers(lease);

    for (const candidate of effects.results) {
      const key = await resultKey(candidate);
      if (!key) continue;
      await db
        .from("katana_results")
        .upsert(
          { run_id: run.id, media_id: key, url: candidate.url },
          { onConflict: "run_id,media_id", ignoreDuplicates: true },
        );
      if (candidate.url) {
        await db
          .from("katana_results")
          .update({ url: candidate.url })
          .eq("run_id", run.id)
          .eq("media_id", key)
          .is("url", null);
      }
    }

    const progress: RunUpdate = {
      last_event_at: read.lastEventAt,
      boundary_event_ids: read.boundary,
      synced_at: nowIso(),
    };
    if (Object.keys(effects.knownMedia).length) {
      const known = isObject(run.known_media) ? run.known_media : {};
      progress.known_media = Object.fromEntries(
        Object.entries({ ...known, ...effects.knownMedia }).slice(-200),
      ) as Json;
    }
    if (effects.resumeLine) progress.resume_line = effects.resumeLine.slice(0, 4000);
    if (effects.summary) progress.summary = effects.summary.slice(0, 8000);
    if (effects.claudeCostCents !== null) progress.claude_cost_cents = effects.claudeCostCents;

    const { count: resultCount } = await db
      .from("katana_results")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id);
    const hasResult = (resultCount ?? 0) > 0;
    const state = effects.state ?? (read.events.length ? null : await checkState(lease, context));
    let outcome: RunUpdate = {};
    if (state && run.status !== "cancelled") {
      outcome = stateUpdate(run, state, { answered, hasResult, noResult: effects.noResult });
    } else if (!state && answered > 0 && run.status === "waiting") {
      outcome = { status: "running" };
    }
    const settling =
      outcome.status &&
      ["delivered", "failed"].includes(outcome.status) &&
      !SETTLED.has(run.status);
    if (settling || (run.status === "cancelled" && run.balance_end === null)) {
      const mcp = await pricingClient(context).catch(() => null);
      if (mcp) progress.balance_end = await accountBalance(mcp);
    }
    await finishPass(lease, progress, outcome);
    finished = true;

    if (effects.mcpAuthFailed) {
      const renewed = await renewHiggsfieldToken();
      if (renewed) {
        await ensureVaultToken(30 * 60_000).catch(() => undefined);
        await note(run.id, "note", "Renewed the Higgsfield sign-in for the session");
      }
    }
  } finally {
    await context.mcp?.close();
    if (!finished) await releaseRun(lease).catch(() => undefined);
  }
  await savePendingResults(runId);
}

// ---------- Saving the finished video ----------

async function savePendingResults(runId: string): Promise<void> {
  const { data } = await db
    .from("katana_results")
    .select("id,status,attempts,claimed_until")
    .eq("run_id", runId)
    .in("status", ["pending", "failed", "saving"])
    .lt("attempts", MAX_RESULT_ATTEMPTS);
  for (const row of data ?? []) {
    if (row.status === "saving" && row.claimed_until && Date.parse(row.claimed_until) > Date.now())
      continue;
    await saveKatanaResult(row.id).catch((error: unknown) => {
      console.error("katana result not saved", { resultId: row.id, message: messageOf(error) });
    });
  }
}

/** Finds the file of a confirmed Higgsfield video among the account's media. */
async function findMediaUrl(mcp: HiggsfieldMcpClient, mediaId: string): Promise<string | null> {
  let cursor: number | null = null;
  for (let page = 0; page < 4; page += 1) {
    const listing = await mcp.callTool("show_medias", {
      type: "video",
      size: 100,
      ...(cursor !== null ? { cursor } : {}),
    });
    if (listing.isError) return null;
    const payload = listing.payload;
    const lists = [
      ...findAll(payload, "items"),
      ...findAll(payload, "medias"),
      ...findAll(payload, "data"),
    ].filter(Array.isArray);
    for (const list of lists.length ? lists : [payload]) {
      for (const entry of Array.isArray(list) ? list : []) {
        if (!isObject(entry)) continue;
        if (entry["id"] !== mediaId && entry["media_id"] !== mediaId) continue;
        const url = firstUrl(entry, ["url", "file_url", "media_url", "download_url"]);
        if (url) return url;
      }
    }
    const next = findAll(payload, "next_cursor").find((value) => typeof value === "number");
    if (typeof next !== "number") return null;
    cursor = next;
  }
  return null;
}

/** An address Katana itself named is used only when it is on Higgsfield's own domain. */
function onHiggsfieldDomain(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" && (host === "higgsfield.ai" || host.endsWith(".higgsfield.ai"))
    );
  } catch {
    return false;
  }
}

export async function saveKatanaResult(resultId: string): Promise<void> {
  const now = new Date();
  const { data: claimed } = await db
    .from("katana_results")
    .update({
      status: "saving",
      claimed_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
      error: null,
    })
    .eq("id", resultId)
    .lt("attempts", MAX_RESULT_ATTEMPTS)
    .or(`status.in.(pending,failed),and(status.eq.saving,claimed_until.lt.${now.toISOString()})`)
    .select("*")
    .maybeSingle();
  if (!claimed) return;
  const result = claimed as ResultRow;
  await db
    .from("katana_results")
    .update({ attempts: result.attempts + 1 })
    .eq("id", result.id);
  const run = await readRun(result.run_id);
  const fail = async (message: string) => {
    await db
      .from("katana_results")
      .update({ status: "failed", error: message.slice(0, 1000), claimed_until: null })
      .eq("id", result.id);
    if (result.attempts + 1 >= MAX_RESULT_ATTEMPTS) {
      await note(run.id, "error", "The finished video couldn't be saved to the library", message);
    }
  };
  let mcp: HiggsfieldMcpClient | null = null;
  try {
    // The file is found through Higgsfield's own answers: the account's media list
    // (by the confirmed media ID), then its tools' media answers; an address Katana
    // only wrote down counts only on Higgsfield's own domain.
    let url: string | null = null;
    if (isUuid(result.media_id)) {
      mcp = await higgsfieldMcp({ timeoutMs: 30_000 });
      url = await findMediaUrl(mcp, result.media_id);
    }
    const known = isObject(run.known_media) ? run.known_media : {};
    if (!url && typeof known[result.media_id] === "string") url = known[result.media_id] as string;
    if (!url && onHiggsfieldDomain(result.url)) url = result.url;
    if (!url) return await fail("The finished video's file wasn't found on Higgsfield yet.");
    if (!isAllowedOutputUrl(url))
      return await fail("The finished video's address isn't one of Higgsfield's.");

    const scope = run.project_id
      ? `projects/${run.project_id}`
      : `unassigned/${run.created_by ?? "katana"}`;
    const path = `${scope}/katana/${run.id}/${result.media_id}.mp4`;
    const { data: existing } = await db
      .from("assets")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    let assetId = existing?.id ?? null;
    if (!assetId) {
      const response = await fetchFromHiggsfield(url, 300_000);
      if (!response.ok || !response.body)
        return await fail(`Downloading the finished video failed (HTTP ${response.status}).`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > RESULT_MAX_BYTES) {
        await response.body.cancel().catch(() => undefined);
        return await fail("The finished video is too large to keep in the library.");
      }
      const mime = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
      // Streamed into storage (with its length where the runtime allows), so a large
      // video never has to fit in memory.
      const counter = byteCounter(RESULT_MAX_BYTES);
      const counted = response.body.pipeThrough(counter.stream);
      let body: ReadableStream<Uint8Array> | ArrayBuffer = withLength(counted, declared) ?? counted;
      if (!fixedLengthStream() && declared > 0 && declared <= BUFFER_MAX_BYTES) {
        body = await new Response(counted).arrayBuffer();
      }
      const upload = await db.storage
        .from("generated-assets")
        .upload(path, body, { contentType: mime, upsert: true });
      if (upload.error) return await fail(`The video couldn't be stored: ${upload.error.message}`);
      const { data: asset, error } = await db
        .from("assets")
        .insert({
          project_id: run.project_id,
          uploaded_by: run.created_by,
          asset_type: "video",
          source_type: "generated",
          title: `${run.title || "Katana video"}`.slice(0, 120),
          storage_bucket: "generated-assets",
          storage_path: path,
          mime_type: mime,
          file_size: counter.bytes() || declared || null,
          metadata: {
            provider: "higgsfield_katana",
            katana_run_id: run.id,
            higgsfield_media_id: isUuid(result.media_id) ? result.media_id : null,
            katana_preset: run.preset_slug,
            provider_url: url,
          } as Json,
        })
        .select("id")
        .single();
      if (error || !asset)
        return await fail(
          `The video couldn't be added to the library: ${error?.message ?? "unknown error"}`,
        );
      assetId = asset.id;
    }
    await db
      .from("katana_results")
      .update({ status: "saved", asset_id: assetId, url, error: null, claimed_until: null })
      .eq("id", result.id);
    await note(run.id, "result", "Saved to the library", "", {
      asset_id: assetId,
      media_id: result.media_id,
    });
  } catch (error) {
    await fail(messageOf(error));
  } finally {
    await mcp?.close();
  }
}

// ---------- People acting on a run ----------

export async function sendKatanaFollowUp(input: {
  userId: string;
  runId: string;
  text: string;
  assets: Array<{ assetId: string; field: string }>;
}): Promise<void> {
  const run = await readRun(input.runId);
  const text = input.text.trim().slice(0, LIMITS.briefChars);
  if (!text) throw new AppError("INVALID_PARAMETERS", "Write what to change");
  if (!run.session_id)
    throw new AppError("INVALID_PARAMETERS", "This run has no session to send to");
  if (run.status === "paused")
    throw new AppError(
      "INVALID_PARAMETERS",
      "Raise the run's Claude budget first, then send this.",
    );
  if (!["delivered", "idle"].includes(run.status)) {
    throw new AppError(
      "INVALID_PARAMETERS",
      "Katana is still working on this run. Wait until it finishes its turn.",
    );
  }
  const added = await resolveInputs(input.assets);
  const anthropic = anthropicClient();
  const session = await anthropic.beta.sessions.retrieve(run.session_id);
  if (session.status === "terminated") {
    throw new AppError(
      "INVALID_PARAMETERS",
      "This run's session has ended. Start a revision instead, which continues from its saved state.",
    );
  }
  if (session.status === "running")
    throw new AppError("INVALID_PARAMETERS", "Katana is still working on this run.");

  // One follow-up at a time, and no reader acts on the run while its files are handed over
  // and the message sent (a state check could otherwise settle it again first).
  let lease: Lease | null = null;
  for (let attempt = 0; attempt < 3 && !lease; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_500));
    lease = await claimRun(run.id, ["delivered", "idle"], HANDOVER_LEASE_MS);
  }
  if (!lease) {
    throw new AppError(
      "INVALID_PARAMETERS",
      "Someone just sent this run a follow-up, or the studio is checking on it. Try again in a moment.",
    );
  }
  const held = lease;
  const sessionId = run.session_id;
  try {
    if (added.length) {
      const mcp = await higgsfieldMcp({ timeoutMs: 60_000 });
      try {
        for (const entry of added) entry.media_id = await handOver(mcp, entry);
      } finally {
        await mcp.close();
      }
    }
    await ensureVaultToken(30 * 60_000);
  } catch (error) {
    await releaseRun(held).catch(() => undefined);
    throw error;
  }
  // A hand-over that outlasted the hold may have let another follow-up in.
  if (!(await stillHeld(held))) {
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "Handing the files over took too long, so the message wasn't sent. Send it again.",
    );
  }
  const inputs = [...runInputs(held.run), ...added] as unknown as Json;
  /** The message is (or may be) on its way: Katana is working, unless the run was cancelled meanwhile. */
  const markSent = async () => {
    const { data } = await db
      .from("katana_runs")
      .update({
        status: "running",
        status_detail: null,
        finished_at: null,
        inputs,
        state_checked_at: nowIso(),
        sync_lease_until: null,
        sync_lease_owner: null,
      })
      .eq("id", run.id)
      .in("status", ["delivered", "idle"])
      .select("id");
    if (data?.length) return;
    await releaseRun(held, { inputs }).catch(() => undefined);
    const current = await readRun(run.id);
    if (current.status === "cancelled" && !(await interrupt(sessionId)))
      await updateRun(run.id, { cancel_requested: true });
  };
  const message = followUpMessage({ text, inputs: mediaInputs(added) });
  try {
    await anthropic.beta.sessions.events.send(
      sessionId,
      { events: [{ type: "user.message", content: [{ type: "text", text: message }] }] },
      { maxRetries: 0 },
    );
  } catch (error) {
    if (definitelyRefused(error)) {
      await releaseRun(held).catch(() => undefined);
      throw new AppError("PROVIDER_REJECTED", `The message wasn't delivered: ${messageOf(error)}`);
    }
    // Followed as if it arrived: a session that stays idle is settled again by the state check.
    await markSent();
    await note(run.id, "user", "Follow-up (delivery unclear)", text);
    throw new AppError(
      "SUBMISSION_UNCERTAIN",
      "The message may not have arrived. Check the run's progress before sending it again.",
    );
  }
  await markSent();
  await note(run.id, "user", "Follow-up", text, { by: input.userId, files: added.length });
}

export async function cancelKatanaRun(input: { userId: string; runId: string }): Promise<void> {
  const run = await readRun(input.runId);
  if (run.status === "cancelled" || run.status === "failed") return;
  // A session that may be starting (or start) without the studio knowing it yet is
  // looked for and stopped by the tick.
  const unseen = !run.session_id && (run.status === "starting" || run.status === "uncertain");
  await updateRun(run.id, {
    status: "cancelled",
    status_detail:
      "Cancelled from the studio. Jobs Higgsfield had already started still finish there.",
    finished_at: nowIso(),
    cancel_requested: unseen,
  });
  if (run.session_id && !(await interrupt(run.session_id))) {
    await updateRun(run.id, { cancel_requested: true });
  }
  await note(run.id, "status", "Run cancelled", "", { by: input.userId });
  // Answers any call still waiting (each is turned down now).
  await syncKatanaRun(run.id, { force: true }).catch(() => undefined);
}

export async function updateKatanaLimits(input: {
  runId: string;
  creditLimit: number | null;
  claudeBudgetUsd: number | null;
}): Promise<void> {
  const settings = await katanaSettings();
  const run = await readRun(input.runId);
  const values: RunUpdate = {};
  if (input.creditLimit !== null) {
    const { data: committed } = await db.rpc("katana_recount_credits", { p_run_id: run.id });
    const already = Number(committed ?? run.credits_reserved);
    if (input.creditLimit < already) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `This run has already committed ${formatCredits(already)} credits.`,
      );
    }
    if (input.creditLimit > settings.maxCreditLimit) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `The most a run can have is ${formatCredits(settings.maxCreditLimit)} credits.`,
      );
    }
    values.credit_limit = input.creditLimit;
  }
  if (input.claudeBudgetUsd !== null) {
    const cents = Math.round(input.claudeBudgetUsd * 100);
    if (cents <= run.claude_cost_cents) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `This run has already used $${(run.claude_cost_cents / 100).toFixed(2)} of Claude.`,
      );
    }
    if (input.claudeBudgetUsd > LIMITS.claudeBudgetUsd.max) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `The most a run can have is $${LIMITS.claudeBudgetUsd.max} of Claude.`,
      );
    }
    if (run.session_id) {
      // A session paused at its budget carries on by itself once the budget is raised.
      await anthropicClient().beta.sessions.update(run.session_id, {
        budget: { type: "limit", max_list_cost: { amount: String(cents), currency: "USD" } },
      });
    }
    values.claude_budget_cents = cents;
    if (run.status === "paused") {
      values.status = "running";
      values.status_detail = null;
    }
  }
  if (!Object.keys(values).length) return;
  await updateRun(run.id, values);
  await note(
    run.id,
    "note",
    "Limits changed",
    [
      input.creditLimit !== null ? `Credit limit: ${formatCredits(input.creditLimit)}` : null,
      input.claudeBudgetUsd !== null ? `Claude budget: $${input.claudeBudgetUsd.toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

// ---------- Background work ----------

/**
 * One pass over the runs still going (and cancelled runs whose session is
 * still to be stopped): each is read (and answered) once, and saves still
 * owed are retried. Returns how many runs were looked at.
 */
export async function sweepKatanaRuns(limit = 20, deadline = Date.now() + 60_000): Promise<number> {
  const { data, error } = await db
    .from("katana_runs")
    .select("id")
    .or(`status.in.(${ACTIVE_RUN_STATUSES.join(",")}),cancel_requested.eq.true`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new AppError("STORAGE_FAILED", error.message);
  }
  let looked = 0;
  for (const row of data ?? []) {
    if (Date.now() > deadline) break;
    await syncKatanaRun(row.id).catch((cause: unknown) => {
      console.error("katana sync failed", { runId: row.id, message: messageOf(cause) });
    });
    looked += 1;
  }
  const { data: owed } = await db
    .from("katana_results")
    .select("run_id")
    .lt("attempts", MAX_RESULT_ATTEMPTS)
    .or(`status.in.(pending,failed),and(status.eq.saving,claimed_until.lt.${nowIso()})`)
    .limit(10);
  for (const runId of new Set((owed ?? []).map((row) => row.run_id))) {
    if (Date.now() > deadline) break;
    await savePendingResults(runId);
  }
  return looked;
}

/**
 * The one-minute tick: while runs are going it keeps their sessions answered
 * for most of the minute (every few seconds), and keeps the vault's Higgsfield
 * token fresh.
 */
export async function katanaTick(deadline: number): Promise<{ passes: number; runs: number }> {
  let passes = 0;
  let runs = 0;
  let refreshed = false;
  while (Date.now() < deadline) {
    const looked = await sweepKatanaRuns(20, deadline);
    passes += 1;
    runs = Math.max(runs, looked);
    if (!looked) break;
    if (!refreshed) {
      refreshed = true;
      await ensureVaultToken(20 * 60_000).catch((error: unknown) => {
        console.error("katana token refresh failed", { message: messageOf(error) });
      });
    }
    const wait = Math.min(3_000, deadline - Date.now());
    if (wait <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return { passes, runs };
}

/** Follows one run's session now (an Anthropic webhook named it). */
export async function syncRunForSession(sessionId: string): Promise<boolean> {
  const { data } = await db
    .from("katana_runs")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data) return false;
  await syncKatanaRun(data.id, { force: true });
  return true;
}

// ---------- Catalog ----------

export interface KatanaPreset {
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
}

/** Published Katana presets, from Higgsfield's catalog (free to read). */
export async function listKatanaPresets(input: {
  cursor: string | null;
  category: string | null;
}): Promise<{
  presets: KatanaPreset[];
  nextCursor: string | null;
}> {
  const mcp = await higgsfieldMcp({ timeoutMs: 30_000 });
  try {
    const listing = await mcp.callTool("get_presets", {
      source: "katana",
      limit: 20,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.category ? { category: input.category } : {}),
    });
    if (listing.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        `Higgsfield didn't list its presets: ${listing.text.slice(0, 200)}`,
      );
    const items = findAll(listing.payload, "items").find(Array.isArray) ?? [];
    const presets: KatanaPreset[] = [];
    for (const item of items as unknown[]) {
      if (!isObject(item)) continue;
      const id = typeof item["id"] === "string" ? item["id"] : "";
      const slug = id.replace(/^katana\//, "");
      if (!PRESET_SLUG.test(slug)) continue;
      presets.push({
        slug,
        name: typeof item["name"] === "string" ? item["name"] : slug,
        thumbnailUrl: typeof item["thumbnail_url"] === "string" ? item["thumbnail_url"] : null,
        previewUrl: typeof item["preview_url"] === "string" ? item["preview_url"] : null,
      });
    }
    const next = findAll(listing.payload, "next_cursor").find(
      (value) => typeof value === "string" && value,
    );
    return { presets, nextCursor: typeof next === "string" ? next : null };
  } finally {
    await mcp.close();
  }
}

/** A preset's title, its form's inputs and its reference video, from its instructions (free to read). */
export async function katanaPresetDetails(slug: string): Promise<{
  slug: string;
  title: string;
  inputs: PresetInput[];
  referenceUrl: string | null;
}> {
  if (!PRESET_SLUG.test(slug))
    throw new AppError("INVALID_PARAMETERS", "That isn't a Katana preset");
  const mcp = await higgsfieldMcp({ timeoutMs: 30_000 });
  try {
    const instructions = await mcp.callTool("get_preset_instructions", {
      preset: `/katana/${slug}`,
    });
    if (instructions.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        `Higgsfield didn't open that preset: ${instructions.text.slice(0, 200)}`,
      );
    const markdown =
      (findAll(instructions.payload, "instructions_markdown").find(
        (value) => typeof value === "string",
      ) as string | undefined) ?? instructions.text;
    const title =
      markdown.match(/^#\s*Katana preset:\s*(.+?)\s*\(\/katana\//m)?.[1]?.trim() ?? slug;
    const referenceUrl =
      markdown.match(/Reference video:[^\n]*?(https:\/\/\S+?\.mp4)/i)?.[1] ?? null;
    return { slug, title, inputs: parsePresetInputs(markdown), referenceUrl };
  } finally {
    await mcp.close();
  }
}

/** The account's credits, to check the connection works. */
export async function testHiggsfieldConnection(): Promise<{
  credits: number | null;
  plan: string | null;
}> {
  const mcp = await higgsfieldMcp({ timeoutMs: 20_000 });
  try {
    const balance = await mcp.callTool("balance", {});
    if (balance.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        balance.text.slice(0, 300) || "Higgsfield didn't answer",
      );
    const plan =
      findAll(balance.payload, "subscription_plan_type").find(
        (value) => typeof value === "string",
      ) ??
      findAll(balance.payload, "plan").find((value) => typeof value === "string") ??
      null;
    return {
      credits: balanceCredits(balance.payload),
      plan: typeof plan === "string" ? plan : null,
    };
  } finally {
    await mcp.close();
  }
}
