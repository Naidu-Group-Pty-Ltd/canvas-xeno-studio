/**
 * Katana runs on the server. A run hands the studio's media to Higgsfield,
 * starts a Claude Managed Agents session that runs Higgsfield's Katana
 * workflow with the team's Higgsfield account, answers each paid call that
 * session asks to make (the credit guard), follows its progress and saves the
 * finished video to the library.
 *
 * A session's events are read by whoever gets there first (the run's page,
 * the one-minute tick, the five-minute reconcile job or an Anthropic webhook),
 * one at a time per run, from where the last reader stopped. Starting a
 * session is never retried on its own: an unclear answer is checked against
 * the sessions Anthropic lists before anything else happens.
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
  type FeedEntry,
  type SessionEventLike,
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
  type GuardDecision,
  type PricedItem,
} from "./guard";
import { findAll, firstUrl, isObject, isUuid } from "./mcp";
import type { HiggsfieldMcpClient } from "./mcp-client.server";
import {
  FIELD_KIND,
  KATANA_FIELDS,
  MEDIA_FIELD,
  PRESET_SLUG,
  followUpMessage,
  kickoffMessage,
  parsePresetInputs,
  revisionMessage,
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

/** What the studio hands Higgsfield by URL; bigger files are uploaded. */
const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 95 * 1024 * 1024;
/** The finished video is downloaded whole; Katana delivers a size-capped file. */
const RESULT_MAX_BYTES = 300 * 1024 * 1024;
const MAX_RESULT_ATTEMPTS = 5;
const STUDIO_BUCKETS = new Set(["generation-inputs", "generated-assets"]);

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

/** Holds a run for one reader; null when another one has it. */
async function claimRun(
  runId: string,
  ms: number,
  statuses?: readonly string[],
): Promise<RunRow | null> {
  const now = new Date();
  let query = db
    .from("katana_runs")
    .update({ sync_lease_until: new Date(now.getTime() + ms).toISOString() })
    .eq("id", runId)
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`);
  if (statuses) query = query.in("status", [...statuses]);
  const { data } = await query.select("*").maybeSingle();
  return data ?? null;
}

async function releaseRun(runId: string, values: RunUpdate = {}): Promise<void> {
  await db
    .from("katana_runs")
    .update({ ...values, sync_lease_until: null })
    .eq("id", runId);
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

// ---------- Inputs ----------

export interface RunInputRow {
  asset_id: string;
  field: string;
  kind: KatanaMediaKind;
  title: string;
  media_id: string | null;
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
        `${asset.title ?? "A chosen file"} is over 95 MB; trim or compress it first`,
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
  if ((asset.file_size ?? 0) <= IMPORT_MAX_BYTES) {
    const signed = await db.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, 30 * 60);
    if (signed.error || !signed.data?.signedUrl)
      throw new AppError("UPLOAD_FAILED", `${input.title} couldn't be shared with Higgsfield`);
    const imported = await mcp.callTool(
      "media_import_url",
      { url: signed.data.signedUrl, type: input.kind },
      { timeoutMs: 150_000 },
    );
    const mediaId = imported.isError ? null : firstMediaId(imported.payload);
    if (mediaId) return mediaId;
    // An import Higgsfield refused (or answered without an ID) is tried once more as an upload.
  }

  const download = await db.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (download.error || !download.data)
    throw new AppError("UPLOAD_FAILED", `${input.title} couldn't be read from the library`);
  const bytes = await download.data.arrayBuffer();
  if (bytes.byteLength > UPLOAD_MAX_BYTES)
    throw new AppError("UPLOAD_FAILED", `${input.title} is over 95 MB`);
  const mime =
    asset.mime_type ||
    download.data.type ||
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
    body: bytes,
    headers: { "Content-Type": mime, ...extraHeaders },
    signal: AbortSignal.timeout(180_000),
  });
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

export async function startKatanaRun(input: StartKatanaRunInput): Promise<{ runId: string }> {
  const settings = await assertReady();
  checkLimits(settings, input.creditLimit, input.claudeBudgetUsd);
  const brief = input.brief.trim().slice(0, LIMITS.briefChars);
  const referenceUrl = input.mode === "remix" ? checkReferenceUrl(input.referenceUrl) : null;
  const inputs = await resolveInputs(input.inputs);
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
  await note(run.id, "user", "Run requested", brief, { mode: input.mode, preset: presetSlug });
  await advanceRun(run.id).catch((cause: unknown) => {
    console.error("katana start failed", { runId: run.id, message: messageOf(cause) });
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
  await advanceRun(run.id).catch((cause: unknown) => {
    console.error("katana revision start failed", { runId: run.id, message: messageOf(cause) });
  });
  return { runId: run.id };
}

/** Moves a run that hasn't got a session yet along: hands over its media, then starts it. */
async function advanceRun(runId: string): Promise<void> {
  const run = await readRun(runId);
  if (run.status === "preparing") return prepareRun(runId);
  if (run.status === "starting" || run.status === "uncertain") return recoverStart(run);
}

async function failRun(runId: string, message: string, values: RunUpdate = {}): Promise<void> {
  await releaseRun(runId, {
    ...values,
    status: "failed",
    error: message.slice(0, 2000),
    status_detail: null,
    finished_at: nowIso(),
  });
  await note(runId, "error", "The run couldn't start", message);
}

async function prepareRun(runId: string): Promise<void> {
  const run = await claimRun(runId, 5 * 60_000, ["preparing"]);
  if (!run) return;
  let mcp: HiggsfieldMcpClient | null = null;
  try {
    mcp = await higgsfieldMcp({ timeoutMs: 60_000 });
    const inputs = runInputs(run);
    for (const input of inputs) {
      if (input.media_id) continue;
      input.media_id = await handOver(mcp, input);
      await updateRun(runId, { inputs: inputs as unknown as Json });
    }
    if (inputs.length)
      await note(
        runId,
        "note",
        `Handed ${inputs.length} file${inputs.length === 1 ? "" : "s"} to Higgsfield`,
      );
    const balance = await accountBalance(mcp);
    // Only this request moves it on: a second reader finds it "starting".
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
      .select("*")
      .maybeSingle();
    if (!moved) return;
    await startSession(moved);
  } catch (error) {
    const current = await readRun(runId).catch(() => null);
    if (current?.status === "preparing" || current?.status === "starting") {
      await failRun(runId, messageOf(error));
    }
  } finally {
    await mcp?.close();
    await db
      .from("katana_runs")
      .update({ sync_lease_until: null })
      .eq("id", runId)
      .in("status", ["preparing", "failed"]);
  }
}

/** True when Anthropic definitely turned the request down (nothing was created). */
function definitelyRefused(error: unknown): boolean {
  return isApiStatus(error, 400, 401, 403, 404, 409, 413, 422, 429);
}

async function startSession(run: RunRow): Promise<void> {
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
      await failRun(run.id, `Anthropic didn't start the session: ${messageOf(error)}`);
      return;
    }
    await releaseRun(run.id, {
      status: "uncertain",
      status_detail:
        "Starting the session got no clear answer; checking whether it began before doing anything else.",
    });
    await note(run.id, "status", "Checking whether the session started", messageOf(error));
    return;
  }
  const { data: attached } = await db
    .from("katana_runs")
    .update({
      status: "running",
      session_id: session.id,
      agent_version: setup.agentVersion,
      status_detail: null,
      error: null,
      sync_lease_until: null,
    })
    .eq("id", run.id)
    .eq("status", "starting")
    .select("id")
    .maybeSingle();
  if (!attached) {
    // Cancelled while the session was starting: keep its record, and stop it.
    await releaseRun(run.id, { session_id: session.id, agent_version: setup.agentVersion });
    await anthropic.beta.sessions.events
      .send(session.id, { events: [{ type: "user.interrupt" }] })
      .catch(() => undefined);
    await note(
      run.id,
      "status",
      "The session started after the run was cancelled, so it was stopped",
    );
    return;
  }
  await note(run.id, "status", "Katana is working", "", { session: session.id });
}

/** A start that got no clear answer: find its session among Anthropic's, or settle it as not started. */
async function recoverStart(run: RunRow): Promise<void> {
  if (run.session_id) {
    await updateRun(run.id, { status: "running", status_detail: null });
    return;
  }
  const startedAt = Date.parse(run.started_at ?? run.created_at);
  // A start still in progress elsewhere is left alone for a few minutes.
  if (run.status === "starting" && Date.now() - startedAt < 4 * 60_000) return;
  const claimed = await claimRun(run.id, 60_000, ["starting", "uncertain"]);
  if (!claimed) return;
  try {
    const { data: setup } = await db
      .from("katana_setup")
      .select("agent_id")
      .eq("id", "default")
      .maybeSingle();
    const anthropic = anthropicClient();
    if (setup?.agent_id) {
      const page = await anthropic.beta.sessions.list({
        agent_id: setup.agent_id,
        "created_at[gte]": new Date(startedAt - 5 * 60_000).toISOString(),
        limit: 100,
        include_archived: true,
      });
      const found = page.data.find((session) => session.metadata?.["xeno_run_id"] === run.id);
      if (found) {
        await releaseRun(run.id, { status: "running", session_id: found.id, status_detail: null });
        await note(run.id, "status", "The session had started; following it now", "", {
          session: found.id,
        });
        return;
      }
    }
    if (Date.now() - startedAt > 15 * 60_000) {
      await failRun(
        run.id,
        "The session never appeared at Anthropic, so it didn't start and nothing was charged. Start the run again.",
      );
      return;
    }
    await releaseRun(run.id, { status: "uncertain" });
  } catch (error) {
    await releaseRun(run.id);
    console.error("katana start check failed", { runId: run.id, message: messageOf(error) });
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

/** Names of earlier calls (read in a previous pass) that results in this pass answer. */
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
    found.set(row.source_id, {
      name: value["tool"],
      input: value["quote"] === true ? { params: { get_cost: true } } : null,
    });
  }
  return found;
}

interface GuardContext {
  run: RunRow;
  settings: KatanaSettings;
  reserved: number;
  mcp: HiggsfieldMcpClient | null;
}

async function pricingClient(context: GuardContext): Promise<HiggsfieldMcpClient> {
  if (!context.mcp) context.mcp = await higgsfieldMcp({ timeoutMs: 45_000 });
  return context.mcp;
}

function deny(reason: string, items: PricedItem[] = []): GuardDecision {
  return { allow: false, credits: 0, priced: true, reason, items };
}

/** The guard's answer to one paid call. */
async function decide(context: GuardContext, ask: ToolUse): Promise<GuardDecision> {
  const { run } = context;
  if (run.status === "cancelled")
    return deny("This run was cancelled, so nothing more is made for it. End your turn now.");
  const call = classifyGuardedCall(ask.name, ask.input);
  switch (call.kind) {
    case "quote":
      return { allow: true, credits: 0, priced: true, reason: "Price check (free)", items: [] };
    case "invalid":
      return deny(
        `The studio's credit guard turned this call down: ${call.reason}. Nothing was made or charged.`,
      );
    case "preset_session":
      return call.free
        ? deny(
            "This run is billed to credits, not a free Katana run: call get_katana_config with free_generation: false.",
          )
        : {
            allow: true,
            credits: 0,
            priced: true,
            reason: "Preset run session (no charge by itself)",
            items: [],
          };
    case "estimate": {
      const credits = context.settings.removeBackgroundCredits * call.jobs;
      return decideSpend({
        items: [{ index: 0, model: "remove_background", credits }],
        reserved: context.reserved,
        limit: Number(run.credit_limit),
        priced: false,
        label: "a background removal",
      });
    }
    case "submit": {
      for (const item of call.items) {
        const flag = freeBillingFlag(item.params);
        if (flag) {
          return deny(
            `This run is billed to credits: send the call without ${flag}. Nothing was made or charged.`,
          );
        }
        if (requestCount(item.params) > 1) {
          return deny(
            "The studio prices one result per request: send count 1 (or one batch item per result). Nothing was made or charged.",
          );
        }
      }
      const mcp = await pricingClient(context);
      const priced: PricedItem[] = [];
      // A few at a time: a batch has up to twelve.
      for (let start = 0; start < call.items.length; start += 4) {
        const slice = call.items.slice(start, start + 4);
        priced.push(
          ...(await Promise.all(
            slice.map(async (item) => {
              const model = typeof item.params["model"] === "string" ? item.params["model"] : null;
              try {
                const quote = await mcp.callTool(
                  call.quoteTool,
                  { params: quoteParams(item.params) },
                  { timeoutMs: 45_000 },
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
      return decideSpend({
        items: priced,
        reserved: context.reserved,
        limit: Number(run.credit_limit),
        label: callLabel(call),
      });
    }
  }
}

/** Decides every paid call waiting in this pass (in order, so each sees the ones before it). */
async function guardAsks(context: GuardContext, asks: ToolUse[]): Promise<void> {
  if (!asks.length) return;
  const { data: existing } = await db
    .from("katana_spend")
    .select("tool_use_id")
    .eq("run_id", context.run.id)
    .in(
      "tool_use_id",
      asks.map((ask) => ask.id),
    );
  const decided = new Set((existing ?? []).map((row) => row.tool_use_id));
  for (const ask of asks) {
    if (decided.has(ask.id)) continue;
    let decision: GuardDecision;
    try {
      decision = await decide(context, ask);
    } catch (error) {
      decision = deny(
        `The studio couldn't check this call's price (${messageOf(error).slice(0, 200)}), so it wasn't submitted. Nothing was made or charged; you may try it once more later.`,
      );
    }
    const { error } = await db.from("katana_spend").insert({
      run_id: context.run.id,
      tool_use_id: ask.id,
      tool_name: ask.name,
      decision: decision.allow ? "allowed" : "denied",
      credits: decision.credits,
      priced: decision.priced,
      reason: decision.reason.slice(0, 1000),
      items: decision.items as unknown as Json,
    });
    if (error && !/duplicate|unique/i.test(error.message))
      throw new AppError("STORAGE_FAILED", error.message);
    if (error) continue;
    if (decision.allow) context.reserved += decision.credits;
    if (decision.credits > 0 || !decision.allow) {
      await note(
        context.run.id,
        "credit",
        decision.allow ? "Credit guard: allowed" : "Credit guard: turned down",
        decision.reason,
        {
          tool: ask.name,
          credits: decision.credits,
          allowed: decision.allow,
        },
      );
    }
  }
  await updateRun(context.run.id, { credits_reserved: Math.round(context.reserved * 1000) / 1000 });
}

/** Sends every decided answer the session hasn't had yet. */
async function sendAnswers(run: RunRow): Promise<number> {
  if (!run.session_id) return 0;
  const { data: unsent } = await db
    .from("katana_spend")
    .select("id,tool_use_id,decision,reason")
    .eq("run_id", run.id)
    .is("sent_at", null)
    .order("decided_at", { ascending: true })
    .limit(50);
  if (!unsent?.length) return 0;
  const anthropic = anthropicClient();
  const confirmation = (row: (typeof unsent)[number]) =>
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
    await anthropic.beta.sessions.events.send(run.session_id, { events: unsent.map(confirmation) });
    await markSent(unsent.map((row) => row.id));
    return unsent.length;
  } catch (error) {
    if (!isApiStatus(error, 400, 409)) throw error;
    // One of them was already answered (or the session moved on): send them one by one.
    let sent = 0;
    for (const row of unsent) {
      try {
        await anthropic.beta.sessions.events.send(run.session_id, { events: [confirmation(row)] });
        sent += 1;
      } catch (single) {
        if (!isApiStatus(single, 400, 409)) throw single;
      }
      await markSent([row.id]);
    }
    return sent;
  }
}

/** Records the jobs each allowed call made, and frees what Higgsfield turned away unmade. */
async function recordJobs(
  run: RunRow,
  results: ReturnType<typeof interpretEvents>["toolResults"],
): Promise<number> {
  let released = 0;
  for (const result of results) {
    const tool = result.tool ?? "";
    if (!tool.startsWith("generate_") && tool !== "remove_background") continue;
    const { data: spend } = await db
      .from("katana_spend")
      .select("id,decision,credits,items,job_ids")
      .eq("run_id", run.id)
      .eq("tool_use_id", result.toolUseId)
      .maybeSingle();
    if (!spend || spend.decision !== "allowed" || Number(spend.credits) <= 0) continue;
    const jobs = submittedJobIds(result.payload);
    const values: Database["public"]["Tables"]["katana_spend"]["Update"] = {};
    if (jobs.length) values.job_ids = jobs;
    // Higgsfield said no job was made (a concurrency limit, a rejected request): nothing is charged
    // for it. An unclear answer (a timeout) may still have made one, so its credits stay counted.
    const unclear = /time[sd]?\s*out|timeout|unknown|uncertain|network|connection/i.test(
      result.text,
    );
    const refusedUnmade =
      jobs.length === 0 &&
      !unclear &&
      (result.isError || /rate limit reached|created no job/i.test(result.text));
    if (refusedUnmade) {
      released += Number(spend.credits);
      values.credits = 0;
      values.reason = "Higgsfield didn't make it, so nothing was charged.";
    }
    if (Object.keys(values).length) await db.from("katana_spend").update(values).eq("id", spend.id);
  }
  return released;
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
  const run = await claimRun(runId, 90_000);
  if (!run || !run.session_id) return;
  const settings = await katanaSettings();
  const context: GuardContext = {
    run,
    settings,
    reserved: Number(run.credits_reserved),
    mcp: null,
  };
  let released = false;
  try {
    const read = await readNewEvents(run.session_id, run);
    const earlier = await earlierCalls(run.id, read.events);
    const effects = interpretEvents(read.events, (id) => earlier.get(id) ?? null);
    await addFeed(run.id, effects.feed);

    const freed = await recordJobs(run, effects.toolResults);
    if (freed > 0) context.reserved = Math.max(0, context.reserved - freed);
    await guardAsks(context, effects.asks);
    const answered = await sendAnswers(run);

    for (const candidate of effects.results) {
      const key = await resultKey(candidate);
      if (!key) continue;
      await db.from("katana_results").upsert(
        {
          run_id: run.id,
          media_id: key,
          url: candidate.url ?? effects.knownMedia[candidate.mediaId ?? ""] ?? null,
        },
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

    const values: RunUpdate = {
      last_event_at: read.lastEventAt,
      boundary_event_ids: read.boundary,
      synced_at: nowIso(),
      credits_reserved: Math.round(context.reserved * 1000) / 1000,
    };
    if (Object.keys(effects.knownMedia).length) {
      const known = isObject(run.known_media) ? run.known_media : {};
      const merged = Object.fromEntries(
        Object.entries({ ...known, ...effects.knownMedia }).slice(-200),
      );
      values.known_media = merged as Json;
    }
    if (effects.resumeLine) values.resume_line = effects.resumeLine;
    if (effects.summary) values.summary = effects.summary.slice(0, 8000);
    if (effects.claudeCostCents !== null) values.claude_cost_cents = effects.claudeCostCents;

    const { count: resultCount } = await db
      .from("katana_results")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id);
    const hasResult = (resultCount ?? 0) > 0;
    const state = effects.state;
    if (!state && answered > 0 && run.status === "waiting") values.status = "running";
    if (state && run.status !== "cancelled") {
      if (state.kind === "running") {
        values.status = "running";
        values.status_detail = null;
      } else if (state.kind === "idle") {
        if (state.stop === "requires_action") {
          values.status = answered > 0 ? "running" : "waiting";
        } else if (state.stop === "end_turn") {
          values.status = effects.noResult ? "idle" : hasResult ? "delivered" : "idle";
          values.status_detail = effects.noResult;
          if (hasResult && !effects.noResult) values.finished_at = nowIso();
        } else if (state.stop === "budget_reached") {
          values.status = "paused";
          values.status_detail =
            "The run's Claude budget is used up. Raise it to let Katana carry on.";
        } else {
          values.status = "failed";
          values.status_detail = null;
          values.error =
            state.stop === "refusal"
              ? `Claude declined to continue${state.refusal ? `: ${state.refusal}` : ""}`
              : "Katana stopped after repeated errors.";
          values.finished_at = nowIso();
        }
      } else if (state.kind === "terminated" || state.kind === "deleted") {
        values.status = hasResult ? "delivered" : "failed";
        if (!hasResult) values.error = "The session ended without a finished video.";
        values.finished_at = nowIso();
      }
    }
    const settling =
      values.status && ["delivered", "failed"].includes(values.status) && !SETTLED.has(run.status);
    if (settling || (run.status === "cancelled" && run.balance_end === null && run.finished_at)) {
      const mcp = await pricingClient(context).catch(() => null);
      if (mcp) values.balance_end = await accountBalance(mcp);
    }
    // Where the reading got to is always kept; the run's state only moves if nobody cancelled
    // it meanwhile (this pass read the run before a cancel could land).
    const { status, status_detail, error, finished_at, ...progress } = values;
    await releaseRun(run.id, progress);
    released = true;
    const outcome: RunUpdate = {};
    if (status !== undefined) outcome.status = status;
    if (status_detail !== undefined) outcome.status_detail = status_detail;
    if (error !== undefined) outcome.error = error;
    if (finished_at !== undefined) outcome.finished_at = finished_at;
    if (Object.keys(outcome).length) {
      await db.from("katana_runs").update(outcome).eq("id", run.id).neq("status", "cancelled");
    }

    if (effects.mcpAuthFailed) {
      const renewed = await renewHiggsfieldToken();
      if (renewed) {
        await ensureVaultToken(30 * 60_000).catch(() => undefined);
        await note(run.id, "note", "Renewed the Higgsfield sign-in for the session");
      }
    }
  } finally {
    await context.mcp?.close();
    if (!released) await releaseRun(run.id);
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
    const answer = await mcp.callTool("show_medias", {
      type: "video",
      size: 100,
      ...(cursor !== null ? { cursor } : {}),
    });
    if (answer.isError) return null;
    const payload = answer.payload;
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

export async function saveKatanaResult(resultId: string): Promise<void> {
  const now = new Date();
  const { data: claimed } = await db
    .from("katana_results")
    .update({
      status: "saving",
      claimed_until: new Date(now.getTime() + 5 * 60_000).toISOString(),
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
    let url = result.url;
    const known = isObject(run.known_media) ? run.known_media : {};
    if (!url && typeof known[result.media_id] === "string") url = known[result.media_id] as string;
    if (!url && isUuid(result.media_id)) {
      mcp = await higgsfieldMcp({ timeoutMs: 30_000 });
      url = await findMediaUrl(mcp, result.media_id);
    }
    if (!url) return fail("The finished video's file wasn't found on Higgsfield yet.");
    if (!isAllowedOutputUrl(url))
      return fail("The finished video's address isn't one of Higgsfield's.");

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
      const response = await fetch(url, { signal: AbortSignal.timeout(240_000) });
      if (!response.ok)
        return fail(`Downloading the finished video failed (HTTP ${response.status}).`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > RESULT_MAX_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        return fail("The finished video is too large to keep in the library.");
      }
      const mime = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > RESULT_MAX_BYTES)
        return fail("The finished video is too large to keep in the library.");
      const upload = await db.storage
        .from("generated-assets")
        .upload(path, buffer, { contentType: mime, upsert: true });
      if (upload.error) return fail(`The video couldn't be stored: ${upload.error.message}`);
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
          file_size: buffer.byteLength,
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
        return fail(
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

  const added = await resolveInputs(input.assets);
  if (added.length) {
    const mcp = await higgsfieldMcp({ timeoutMs: 60_000 });
    try {
      for (const entry of added) entry.media_id = await handOver(mcp, entry);
    } finally {
      await mcp.close();
    }
  }
  await ensureVaultToken(30 * 60_000);
  const message = followUpMessage({ text, inputs: mediaInputs(added) });
  try {
    await anthropic.beta.sessions.events.send(
      run.session_id,
      { events: [{ type: "user.message", content: [{ type: "text", text: message }] }] },
      { maxRetries: 0 },
    );
  } catch (error) {
    if (definitelyRefused(error))
      throw new AppError("PROVIDER_REJECTED", `The message wasn't delivered: ${messageOf(error)}`);
    await note(run.id, "user", "Follow-up (delivery unclear)", text);
    throw new AppError(
      "SUBMISSION_UNCERTAIN",
      "The message may not have arrived. Check the run's progress before sending it again.",
    );
  }
  await updateRun(run.id, {
    status: "running",
    status_detail: null,
    finished_at: null,
    inputs: [...runInputs(run), ...added] as unknown as Json,
  });
  await note(run.id, "user", "Follow-up", text, { by: input.userId, files: added.length });
}

export async function cancelKatanaRun(input: { userId: string; runId: string }): Promise<void> {
  const run = await readRun(input.runId);
  if (run.status === "cancelled" || run.status === "failed") return;
  await updateRun(run.id, {
    status: "cancelled",
    status_detail:
      "Cancelled from the studio. Jobs Higgsfield had already started still finish there.",
    finished_at: nowIso(),
  });
  if (run.session_id) {
    try {
      await anthropicClient().beta.sessions.events.send(run.session_id, {
        events: [{ type: "user.interrupt" }],
      });
    } catch (error) {
      console.error("katana interrupt failed", { runId: run.id, message: messageOf(error) });
    }
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
    if (input.creditLimit < Number(run.credits_reserved)) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `This run has already committed ${formatCredits(Number(run.credits_reserved))} credits.`,
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
 * One pass over the runs still going: each is read (and answered) once, and
 * saves still owed are retried. Returns how many runs were looked at.
 */
export async function sweepKatanaRuns(limit = 20, deadline = Date.now() + 60_000): Promise<number> {
  const { data, error } = await db
    .from("katana_runs")
    .select("id")
    .in("status", [...ACTIVE_RUN_STATUSES])
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
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_RESULT_ATTEMPTS)
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
  await syncKatanaRun(data.id);
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
    const answer = await mcp.callTool("get_presets", {
      source: "katana",
      limit: 20,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.category ? { category: input.category } : {}),
    });
    if (answer.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        `Higgsfield didn't list its presets: ${answer.text.slice(0, 200)}`,
      );
    const items = findAll(answer.payload, "items").find(Array.isArray) ?? [];
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
    const next = findAll(answer.payload, "next_cursor").find(
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
    const answer = await mcp.callTool("get_preset_instructions", { preset: `/katana/${slug}` });
    if (answer.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        `Higgsfield didn't open that preset: ${answer.text.slice(0, 200)}`,
      );
    const markdown =
      (findAll(answer.payload, "instructions_markdown").find(
        (value) => typeof value === "string",
      ) as string | undefined) ?? answer.text;
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
    const answer = await mcp.callTool("balance", {});
    if (answer.isError)
      throw new AppError(
        "PROVIDER_REJECTED",
        answer.text.slice(0, 300) || "Higgsfield didn't answer",
      );
    const plan =
      findAll(answer.payload, "subscription_plan_type").find(
        (value) => typeof value === "string",
      ) ??
      findAll(answer.payload, "plan").find((value) => typeof value === "string") ??
      null;
    return {
      credits: balanceCredits(answer.payload),
      plan: typeof plan === "string" ? plan : null,
    };
  } finally {
    await mcp.close();
  }
}
