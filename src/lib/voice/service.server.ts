/**
 * Brand voice service: turns a brand voice and a script into a voiceover in
 * the library, with word timings for captions.
 *
 * Consistency comes from always speaking with the same provider voice, model,
 * settings (and seed, where supported) and pronunciation list. Every billable
 * call is recorded first; an uncertain outcome is never retried by itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingTableError } from "@/lib/edit/errors";
import { derivedUuid } from "../derived-id";
import { AppError } from "../higgsfield/errors";
import {
  alignScript,
  DEFAULT_ELEVENLABS_MODEL,
  elevenLabsSettingsSchema,
  openAISettingsSchema,
  OPENAI_TTS_MODEL,
  pronunciationSchema,
  spokenText,
  tokenizeScript,
  voiceInScope,
  type BrandVoiceRow,
  type Pronunciation,
  type TimedWord,
  type VoiceProvider,
} from "./catalog";
import { mp3Duration } from "./audio";
import {
  elevenLabsAccountVoices,
  elevenLabsSpeech,
  openAISpeech,
  openAIWordTimings,
  type ProviderFailure,
} from "./providers.server";

const OUTPUT_BUCKET = "generated-assets";
export const MAX_SCRIPT_CHARS = 4000;

export interface VoiceConfig {
  provider: VoiceProvider;
  providerVoiceId: string;
  model: string;
  settings: Record<string, unknown>;
  pronunciations: Pronunciation[];
  language: string | null;
}

export function configFromRow(
  row: Pick<
    BrandVoiceRow,
    "provider" | "provider_voice_id" | "model" | "settings" | "pronunciations" | "language"
  >,
): VoiceConfig {
  return {
    provider: row.provider,
    providerVoiceId: row.provider_voice_id,
    model: row.model,
    settings: row.settings ?? {},
    pronunciations: (Array.isArray(row.pronunciations) ? row.pronunciations : [])
      .map((entry) => pronunciationSchema.safeParse(entry))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data!),
    language: row.language,
  };
}

export interface Synthesis {
  audio: Uint8Array;
  mime: string;
  durationSeconds: number | null;
  /** Timing of each written word of the script. */
  words: TimedWord[];
  spoken: string;
  requestId: string | null;
  characters: number | null;
}

/** One billable call to the voice provider, plus (for OpenAI) a timing pass. */
export async function synthesize(
  config: VoiceConfig,
  script: string,
): Promise<{ ok: true; result: Synthesis } | ProviderFailure> {
  const tokens = tokenizeScript(script, config.pronunciations);
  const text = spokenText(tokens);
  if (!text)
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "The script is empty.",
      uncertain: false,
    };

  if (config.provider === "openai") {
    const settings = openAISettingsSchema.parse(config.settings ?? {});
    const speech = await openAISpeech({
      text,
      voice: config.providerVoiceId,
      model: config.model || OPENAI_TTS_MODEL,
      instructions: settings.instructions,
      speed: settings.speed,
    });
    if (!speech.ok) return speech;
    const timing = await openAIWordTimings(speech.audio);
    const duration = mp3Duration(speech.audio) ?? timing?.duration ?? null;
    return {
      ok: true,
      result: {
        audio: speech.audio,
        mime: speech.mime,
        durationSeconds: duration,
        words: alignScript(tokens, timing?.words ?? [], duration),
        spoken: text,
        requestId: speech.requestId,
        characters: speech.characters,
      },
    };
  }

  const settings = elevenLabsSettingsSchema.parse(config.settings ?? {});
  const speech = await elevenLabsSpeech({
    voiceId: config.providerVoiceId,
    model: config.model || DEFAULT_ELEVENLABS_MODEL,
    text,
    settings,
    languageCode: config.language,
  });
  if (!speech.ok) return speech;
  const duration = mp3Duration(speech.audio) ?? speech.words?.at(-1)?.end ?? null;
  return {
    ok: true,
    result: {
      audio: speech.audio,
      mime: speech.mime,
      durationSeconds: duration,
      words: alignScript(tokens, speech.words ?? [], duration),
      spoken: text,
      requestId: speech.requestId,
      characters: speech.characters,
    },
  };
}

export async function requireActiveMember(userId: string): Promise<{ isAdmin: boolean }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { isAdmin: profile.role === "admin" };
}

export type VoiceOrigin = "chosen" | "campaign" | "project" | "default";

/** The brand-voice tables aren't there yet: their migration is still to be applied. */
export class VoicesNotSetUp extends AppError {
  constructor() {
    super("UNKNOWN", "Brand voices aren't set up yet: a database update is still to be applied.");
  }
}

/**
 * A lookup that fails stops here: going on would speak (and bill) with a
 * different voice than the one that applies.
 */
function lookupFailed(error: unknown): AppError {
  return isMissingTableError(error)
    ? new VoicesNotSetUp()
    : new AppError("UNKNOWN", "The brand voice couldn't be looked up. Try again in a moment.");
}

/** Where some work's voiceovers are kept, and so which voices may speak for it. */
export interface VoiceScope {
  projectId: string | null;
  campaignId: string | null;
  /** The campaign's own voice, when it has one. */
  campaignVoiceId: string | null;
}

/**
 * The scope of some work. An edit decides for itself, whatever the request
 * says: its takes are kept in its own project (its campaign's, when the edit
 * has none), so the voices the editor offers, the voice that speaks and the
 * project the take is kept in always agree. Other work for a campaign is in
 * the campaign's project, whatever project the request names.
 */
export async function voiceScope(input: {
  sequenceId?: string | null | undefined;
  campaignId?: string | null | undefined;
  projectId?: string | null | undefined;
}): Promise<VoiceScope> {
  let projectId = input.projectId ?? null;
  let campaignId = input.campaignId ?? null;
  let editsProject = false;
  if (input.sequenceId) {
    const { data: sequence, error } = await supabaseAdmin
      .from("sequences")
      .select("project_id,campaign_id")
      .eq("id", input.sequenceId)
      .maybeSingle();
    if (error)
      throw new AppError("UNKNOWN", "The edit couldn't be looked up. Try again in a moment.");
    if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit no longer exists.");
    projectId = sequence.project_id;
    campaignId = sequence.campaign_id;
    editsProject = projectId !== null;
  }
  if (!campaignId) return { projectId, campaignId: null, campaignVoiceId: null };
  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .select("brand_voice_id,project_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw lookupFailed(error);
  if (!campaign) throw new AppError("INVALID_PARAMETERS", "That campaign no longer exists.");
  return {
    projectId: editsProject ? projectId : (campaign.project_id ?? null),
    campaignId,
    campaignVoiceId: campaign.brand_voice_id ?? null,
  };
}

/**
 * The voice to use: the one asked for, else the campaign's, the project's,
 * then the studio default. A voice kept for one project only speaks for that
 * project's work: one chosen outside it is refused, and an inherited one
 * outside it is passed over.
 */
export async function voiceForScope(
  scope: VoiceScope,
  voiceId?: string | null,
): Promise<{ voice: BrandVoiceRow; via: VoiceOrigin } | null> {
  const load = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data, error } = await supabaseAdmin
      .from("brand_voices")
      .select("*")
      .eq("id", id)
      .eq("is_archived", false)
      .maybeSingle();
    if (error) throw lookupFailed(error);
    return (data ?? null) as unknown as BrandVoiceRow | null;
  };
  const usable = (voice: BrandVoiceRow | null) =>
    voice && voiceInScope(voice, scope.projectId) ? voice : null;

  const explicit = await load(voiceId);
  // A chosen voice that has since been archived or removed is never swapped
  // for another speaker.
  if (voiceId && !explicit)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The chosen brand voice is no longer available. Choose another voice.",
    );
  if (explicit) {
    if (!usable(explicit))
      throw new AppError(
        "INVALID_PARAMETERS",
        `“${explicit.name}” is kept for another project. Choose a voice for this project, or one for any project.`,
      );
    return { voice: explicit, via: "chosen" };
  }
  const fromCampaign = usable(await load(scope.campaignVoiceId));
  if (fromCampaign) return { voice: fromCampaign, via: "campaign" };
  if (scope.projectId) {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("brand_voice_id")
      .eq("id", scope.projectId)
      .maybeSingle();
    if (error) throw lookupFailed(error);
    const fromProject = usable(await load(data?.brand_voice_id));
    if (fromProject) return { voice: fromProject, via: "project" };
  }
  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from("brand_voices")
    .select("*")
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
  if (fallbackError) throw lookupFailed(fallbackError);
  const studioDefault = usable(fallback as unknown as BrandVoiceRow | null);
  return studioDefault ? { voice: studioDefault, via: "default" } : null;
}

/** The voice for some work, in its scope (see voiceScope and voiceForScope). */
export async function resolveVoiceWithOrigin(input: {
  voiceId?: string | null | undefined;
  sequenceId?: string | null | undefined;
  campaignId?: string | null | undefined;
  projectId?: string | null | undefined;
}): Promise<{ voice: BrandVoiceRow; via: VoiceOrigin } | null> {
  return voiceForScope(await voiceScope(input), input.voiceId);
}

export async function resolveVoice(
  input: Parameters<typeof resolveVoiceWithOrigin>[0],
): Promise<BrandVoiceRow | null> {
  return (await resolveVoiceWithOrigin(input))?.voice ?? null;
}

export interface VoiceoverResult {
  voiceoverId: string;
  /**
   * "completed", "generating" (still being made), or a recorded "failed" /
   * "submission_uncertain" outcome. Provider outcomes are returned, not thrown,
   * so a thrown error always means the caller couldn't hear the answer.
   */
  status: "completed" | "generating" | "failed" | "submission_uncertain" | "pending";
  errorMessage: string | null;
  assetId: string | null;
  durationSeconds: number | null;
  words: TimedWord[];
  title: string;
  voiceId: string | null;
  voiceName: string | null;
  duplicate: boolean;
  /**
   * The request id the take answers to. It differs from the one sent when the
   * same take was already being made for another request; asking with this
   * id then follows that take.
   */
  requestId: string | null;
}

function titleFor(voiceName: string, script: string): string {
  const opening = script.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return `Voiceover · ${voiceName} · “${opening}${script.trim().split(/\s+/).length > 6 ? "…" : ""}”`.slice(
    0,
    200,
  );
}

/** How long a voiceover may stay "generating" before it counts as interrupted. */
export const STALE_VOICEOVER_MS = 5 * 60_000;

interface TakeRow {
  id: string;
  status: string;
  asset_id: string | null;
  project_id: string | null;
  created_by: string | null;
  alignment: unknown;
  duration_seconds: number | null;
  voice_id: string | null;
  script: string;
  provider: string | null;
  model: string | null;
}
const TAKE_COLUMNS =
  "id,status,asset_id,project_id,created_by,alignment,duration_seconds,voice_id,script,provider,model";

const takeUnchecked = () =>
  new AppError("UNKNOWN", "The take couldn't be checked. Try again in a moment.");

/**
 * Where a take's audio (and, if needed, its details) is stored. Only the
 * server writes to this bucket, and each take has a fixed place in it.
 */
function takePath(
  take: Pick<TakeRow, "id" | "project_id" | "created_by">,
  kind: "audio" | "details",
) {
  const scope = take.project_id ? `projects/${take.project_id}` : `unassigned/${take.created_by}`;
  return `${scope}/voiceovers/${take.id}.${kind === "audio" ? "mp3" : "json"}`;
}

/**
 * A stored file's listing entry, or null if it isn't there. Listed rather
 * than probed: a listing says plainly whether the file is there, and any
 * storage error is thrown, never read as "no file".
 */
async function storedFile(
  path: string,
): Promise<{ name: string; metadata?: Record<string, unknown> | null } | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .list(path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw takeUnchecked();
  return (listed ?? []).find((entry) => entry.name === name) ?? null;
}

/** The library record of a take's audio, apart from its id and place. */
function takeAssetValues(
  take: Pick<TakeRow, "id" | "project_id" | "created_by" | "voice_id" | "provider" | "model">,
  file: { mime: string; size: number | null; durationSeconds: number | null; title: string },
) {
  return {
    uploaded_by: take.created_by,
    project_id: take.project_id,
    asset_type: "audio",
    mime_type: file.mime,
    file_size: file.size,
    duration_seconds: file.durationSeconds,
    source_type: "generated",
    title: file.title,
    metadata: {
      voiceover_id: take.id,
      brand_voice_id: take.voice_id,
      provider: take.provider,
      model: take.model,
      ai_generated_voice: true,
    },
  };
}

/**
 * Adds a take's audio to the library, once. The record's id is derived from
 * the take's, so trying again (after an insert whose answer was lost, or when
 * the take is finished later from its file) finds the record already made
 * instead of adding another. A record under that id counts only if it is the
 * take's own file in the server-only bucket. Returns its id, or null if it
 * couldn't be added just now; a lookup that fails is thrown.
 */
async function keptAsset(
  take: Pick<TakeRow, "id" | "project_id" | "created_by">,
  values: Record<string, unknown>,
): Promise<string | null> {
  const id = await derivedUuid(`voiceover-asset:${take.id}`);
  const path = takePath(take, "audio");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabaseAdmin
      .from("assets")
      .insert({ ...values, id, storage_bucket: OUTPUT_BUCKET, storage_path: path } as never);
    if (!error) return id;
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("assets")
      .select("storage_bucket,storage_path")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw takeUnchecked();
    if (existing) {
      if (existing.storage_bucket === OUTPUT_BUCKET && existing.storage_path === path) return id;
      throw takeUnchecked();
    }
  }
  return null;
}

/** The take details kept beside its audio, if they couldn't be kept with the take. */
async function carriedDetails(take: TakeRow): Promise<Record<string, unknown> | null> {
  const { data: file, error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .download(takePath(take, "details"));
  if (error) {
    const { status, statusCode } = error as { status?: number; statusCode?: string };
    if (status === 404 || String(statusCode) === "404") return null;
    throw takeUnchecked();
  }
  try {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    const words = (parsed["alignment"] as { words?: unknown } | null)?.words;
    return {
      ...(typeof parsed["duration_seconds"] === "number"
        ? { duration_seconds: parsed["duration_seconds"] }
        : {}),
      ...(Array.isArray(words) ? { alignment: { words } } : {}),
      ...(typeof parsed["provider_request_id"] === "string"
        ? { provider_request_id: parsed["provider_request_id"] }
        : {}),
      ...(typeof parsed["characters"] === "number" ? { characters: parsed["characters"] } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * A take whose audio was stored but whose last steps didn't land is finished
 * from that file: its library record is added if it is missing, and the take
 * is completed with it. Only the take's own file counts: it is found at its
 * fixed place in the server-only bucket (and must really be there), so a
 * library record (which any member can create or edit) can't stand in for it.
 * Anything else comes back unchanged; a lookup or write that fails is thrown,
 * so nothing is decided without knowing.
 */
async function relinkedTake<T extends TakeRow>(row: T): Promise<T> {
  if (row.status !== "generating" || row.asset_id) return row;
  const file = await storedFile(takePath(row, "audio"));
  if (!file) return row;
  const carried = row.alignment ? null : await carriedDetails(row);
  const carriedDuration = carried?.["duration_seconds"];
  const durationSeconds =
    row.duration_seconds ?? (typeof carriedDuration === "number" ? carriedDuration : null);
  const { data: speaker, error: speakerError } = row.voice_id
    ? await supabaseAdmin.from("brand_voices").select("name").eq("id", row.voice_id).maybeSingle()
    : { data: null, error: null };
  if (speakerError) throw takeUnchecked();
  const size = Number(file.metadata?.["size"]);
  const mime = file.metadata?.["mimetype"];
  const assetId = await keptAsset(
    row,
    takeAssetValues(row, {
      mime: typeof mime === "string" && mime ? mime : "audio/mpeg",
      size: Number.isFinite(size) ? size : null,
      durationSeconds,
      title: titleFor(speaker?.name ?? "Brand voice", row.script),
    }),
  );
  if (!assetId) throw takeUnchecked();
  const { data, error: linkError } = await supabaseAdmin
    .from("voiceovers")
    .update({
      status: "completed",
      asset_id: assetId,
      ...(row.duration_seconds === null && durationSeconds !== null
        ? { duration_seconds: durationSeconds }
        : {}),
      ...(carried ?? {}),
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "generating")
    .select("*")
    .maybeSingle();
  // Not finished after all: thrown, so the take is never written off meanwhile.
  if (linkError) throw takeUnchecked();
  if (data) return data as unknown as T;
  // Settled by someone else in the meantime: as it is now.
  const { data: now, error: rereadError } = await supabaseAdmin
    .from("voiceovers")
    .select("*")
    .eq("id", row.id)
    .maybeSingle();
  if (rereadError || !now) throw takeUnchecked();
  return now as unknown as T;
}

/**
 * Takes cut off mid-way (the server stopped before recording the result) are
 * marked uncertain: the provider may have been billed, so they are never retried.
 * One whose audio was stored is finished instead, and one that can't be checked
 * right now is left for the next sweep.
 */
async function settleInterrupted(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_VOICEOVER_MS).toISOString();
  const { data: stale, error } = await supabaseAdmin
    .from("voiceovers")
    .select(TAKE_COLUMNS)
    .eq("status", "generating")
    .lt("created_at", cutoff)
    .limit(50);
  if (error) return;
  for (const row of (stale ?? []) as unknown as TakeRow[]) {
    try {
      if ((await relinkedTake(row)).status !== "generating") continue;
    } catch {
      continue;
    }
    await supabaseAdmin
      .from("voiceovers")
      .update({
        status: "submission_uncertain",
        error_code: "INTERRUPTED",
        error_message:
          "This take was interrupted before it was saved. It may still have been billed, so it was not retried.",
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("status", "generating");
  }
}

export async function generateVoiceover(input: {
  userId: string;
  script: string;
  voiceId?: string | null | undefined;
  sequenceId?: string | null | undefined;
  projectId?: string | null | undefined;
  campaignId?: string | null | undefined;
  clientRequestId: string;
}): Promise<VoiceoverResult> {
  await requireActiveMember(input.userId);
  await settleInterrupted();
  const script = input.script.trim();
  if (!script) throw new AppError("INVALID_PARAMETERS", "Write the script first.");
  if (script.length > MAX_SCRIPT_CHARS)
    throw new AppError(
      "INVALID_PARAMETERS",
      `Scripts are limited to ${MAX_SCRIPT_CHARS} characters.`,
    );

  // A take as the panel hears about it.
  const reported = async (taken: TakeRow, duplicate: boolean): Promise<VoiceoverResult> => {
    const row = taken as unknown as TakeRow & {
      status: VoiceoverResult["status"];
      error_message: string | null;
      alignment: { words?: TimedWord[] } | null;
      dedupe_key: string | null;
    };
    const { data: speaker } = row.voice_id
      ? await supabaseAdmin.from("brand_voices").select("name").eq("id", row.voice_id).maybeSingle()
      : { data: null };
    return {
      voiceoverId: row.id,
      status: row.status,
      errorMessage: row.error_message,
      assetId: row.asset_id,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      words: row.alignment?.words ?? [],
      title: titleFor(speaker?.name ?? "Brand voice", row.script),
      voiceId: row.voice_id,
      voiceName: speaker?.name ?? null,
      duplicate,
      requestId: row.dedupe_key,
    };
  };
  const unchecked = () =>
    new AppError("UNKNOWN", "The voiceover couldn't be checked. Try again in a moment.");
  const byRequest = async () => {
    const { data, error } = await supabaseAdmin
      .from("voiceovers")
      .select("*")
      .eq("dedupe_key", input.clientRequestId)
      .maybeSingle();
    if (error) throw unchecked();
    return (data ?? null) as unknown as TakeRow | null;
  };

  // A repeated click returns the voiceover already made (or being made).
  const existing = await byRequest();
  if (existing) return reported(await relinkedTake(existing), true);

  // Where the take is kept, and so which voices may speak it (see voiceScope).
  const scope = await voiceScope(input);
  const { projectId, campaignId } = scope;
  const voice = (await voiceForScope(scope, input.voiceId))?.voice ?? null;
  if (!voice)
    throw new AppError(
      "INVALID_PARAMETERS",
      "Choose a brand voice first, or set a studio default in Brand voices.",
    );

  // The same script, by the same voice, for the same work is made once at a
  // time (a database index holds it): asked for again while it is being made
  // (say its answer was lost and a reload forgot the request), that take is
  // returned rather than paid for twice.
  const inProgress = async () => {
    let query = supabaseAdmin
      .from("voiceovers")
      .select("*")
      .eq("status", "generating")
      .eq("voice_id", voice.id);
    query = input.sequenceId
      ? query.eq("sequence_id", input.sequenceId)
      : query.is("sequence_id", null);
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    query = campaignId ? query.eq("campaign_id", campaignId) : query.is("campaign_id", null);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
    if (error) throw unchecked();
    return ((data ?? []) as unknown as TakeRow[]).find((row) => row.script === script) ?? null;
  };
  const making = await inProgress();
  if (making) return reported(await relinkedTake(making), true);

  const config = configFromRow(voice);
  const tokens = tokenizeScript(script, config.pronunciations);
  const voiceoverId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin.from("voiceovers").insert({
    id: voiceoverId,
    voice_id: voice.id,
    script,
    spoken_text: spokenText(tokens),
    status: "generating",
    provider: voice.provider,
    model: voice.model,
    provider_voice_id: voice.provider_voice_id,
    sequence_id: input.sequenceId ?? null,
    project_id: projectId,
    campaign_id: campaignId,
    dedupe_key: input.clientRequestId,
    created_by: input.userId,
  } as never);
  if (insertError) {
    if (insertError.code === "23505") {
      // Another request got there first: this one, or the same take.
      const raced = (await byRequest()) ?? (await inProgress());
      if (raced) return reported(await relinkedTake(raced), true);
      throw new AppError("UNKNOWN", "This voiceover is already being made. Try again in a moment.");
    }
    throw new AppError("UNKNOWN", "The voiceover could not be recorded");
  }
  const outcome = (
    status: "failed" | "submission_uncertain",
    errorMessage: string,
  ): VoiceoverResult => ({
    voiceoverId,
    status,
    errorMessage,
    assetId: null,
    durationSeconds: null,
    words: [],
    title: "",
    voiceId: voice.id,
    voiceName: voice.name,
    duplicate: false,
    requestId: input.clientRequestId,
  });

  const finish = (values: Record<string, unknown>) =>
    supabaseAdmin
      .from("voiceovers")
      .update(values as never)
      .eq("id", voiceoverId);
  /** Writes to the take, checked and tried once more; false if it didn't land. */
  const record = async (values: Record<string, unknown>) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await finish(values).select("id").maybeSingle();
      if (!error && data) return true;
    }
    return false;
  };
  /**
   * A known outcome is returned only once it is recorded. If it can't be, the
   * request fails, so the panel keeps the request id and asks about this take
   * again rather than starting (and paying for) a new one.
   */
  const settle = async (
    status: "failed" | "submission_uncertain",
    code: string,
    message: string,
  ): Promise<VoiceoverResult> => {
    const recorded = await record({
      status,
      error_code: code,
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    if (!recorded)
      throw new AppError(
        "UNKNOWN",
        "The take's outcome couldn't be recorded. Try again in a moment to see how it ended.",
      );
    return outcome(status, message);
  };

  const spoken = await synthesize(config, script);
  if (!spoken.ok) {
    return settle(
      spoken.uncertain ? "submission_uncertain" : "failed",
      spoken.code,
      spoken.message,
    );
  }

  const result = spoken.result;
  // The details are kept with the take first, so a take finished later from
  // its stored file (if the last update fails) still has its word timings. If
  // they can't be kept with the take, they are stored beside its audio, where
  // only the server can write. If they can't be kept anywhere, the audio isn't
  // stored either: a take is never finished without its word timings.
  const details = {
    duration_seconds: result.durationSeconds,
    alignment: { words: result.words },
    provider_request_id: result.requestId,
    characters: result.characters,
  };
  const take = {
    id: voiceoverId,
    project_id: projectId,
    created_by: input.userId,
    voice_id: voice.id,
    provider: voice.provider,
    model: voice.model,
  };
  const keptBeside = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabaseAdmin.storage
        .from(OUTPUT_BUCKET)
        .upload(takePath(take, "details"), JSON.stringify(details), {
          contentType: "application/json",
          upsert: true,
        });
      if (!error) return true;
    }
    return false;
  };
  if (!(await record(details)) && !(await keptBeside()))
    return settle(
      "failed",
      "STORAGE_FAILED",
      "The voiceover was made but could not be saved to the library. Try again.",
    );

  // Once its audio is stored, a take is never written off: anything after that
  // which doesn't land leaves it being made, and the same request id (or the
  // sweep of interrupted takes) finishes it from its file.
  const stuck = () =>
    new AppError(
      "UNKNOWN",
      "The voiceover was made, but it couldn't be added to the library just now. Try again in a moment.",
    );
  const path = takePath(take, "audio");
  let stored = false;
  for (let attempt = 0; attempt < 2 && !stored; attempt += 1) {
    const { error } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .upload(path, result.audio, { contentType: result.mime, upsert: true });
    stored = !error;
  }
  if (!stored) {
    // An upload whose answer was lost may still have landed: only a listing
    // that shows the file missing fails the take.
    const landed = await storedFile(path).catch(() => {
      throw stuck();
    });
    if (!landed)
      return settle(
        "failed",
        "STORAGE_FAILED",
        "The voiceover was made but could not be saved to the library. Try again.",
      );
  }

  const title = titleFor(voice.name, script);
  const assetId = await keptAsset(
    take,
    takeAssetValues(take, {
      mime: result.mime,
      size: result.audio.length,
      durationSeconds: result.durationSeconds,
      title,
    }),
  ).catch(() => null);
  if (!assetId) throw stuck();

  // Success is only reported once it is recorded; if it can't be, the request
  // fails and the same request id later finishes the take from its stored file.
  const recorded = await record({
    status: "completed",
    asset_id: assetId,
    duration_seconds: result.durationSeconds,
    alignment: { words: result.words } as never,
    provider_request_id: result.requestId,
    characters: result.characters,
    completed_at: new Date().toISOString(),
  });
  if (!recorded)
    throw new AppError(
      "UNKNOWN",
      "The voiceover was saved, but the take couldn't be recorded. Try again in a moment.",
    );

  return {
    voiceoverId,
    status: "completed",
    errorMessage: null,
    assetId,
    durationSeconds: result.durationSeconds,
    words: result.words,
    title,
    voiceId: voice.id,
    voiceName: voice.name,
    duplicate: false,
    requestId: input.clientRequestId,
  };
}

/**
 * A voice added to ElevenLabs (with the name and details its attempt was
 * recorded with), or one whose outcome isn't known yet: asking again with the
 * same attempt picks it up once it shows in the account.
 */
export type VoiceAddition<Details> =
  { voiceId: string; name: string; details: Details } | { pending: string };

/**
 * Adds a voice to the ElevenLabs account (a designed voice, a clone, a library
 * voice) once per attempt; ElevenLabs keeps no request ids of its own. The
 * attempt is recorded first (an operation keyed by `key`), with its name and
 * details and the voices of that name already in the account. If the answer is
 * lost, the attempt stays pending: asking again with the same key looks for
 * the voice of the recorded name that appeared since. It is never added again
 * by itself, however long it takes to show, and a later request can't change
 * what it was for; only the person can give it up (a new attempt, with a new
 * key). Only an attempt that definitely failed is tried again as asked.
 */
export async function voiceAddedOnce<Details extends Record<string, unknown>>(input: {
  userId: string;
  key: string;
  name: string;
  details: Details;
  create: () => Promise<{ ok: true; voiceId: string } | ProviderFailure>;
}): Promise<VoiceAddition<Details>> {
  const unchecked = () =>
    new AppError("UNKNOWN", "The voice couldn't be checked in ElevenLabs. Try again in a moment.");
  const named = async (name: string) => {
    const result = await elevenLabsAccountVoices(name);
    if (!result.ok) throw unchecked();
    return result.voices.filter((voice) => voice.name === name).map((voice) => voice.voiceId);
  };
  interface Attempt {
    id: string;
    status: string;
    output_payload: { voice_id?: string } | null;
    input_payload: { name?: string; details?: Details; before?: string[] } | null;
  }
  const columns = "id,status,output_payload,input_payload";
  const load = async (): Promise<Attempt | null> => {
    const { data, error } = await supabaseAdmin
      .from("operations")
      .select(columns)
      .eq("dedupe_key", input.key)
      .maybeSingle();
    if (error) throw unchecked();
    return (data ?? null) as unknown as Attempt | null;
  };
  const record = async (id: string, values: Record<string, unknown>) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from("operations")
        .update(values as never)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (!error && data) return true;
    }
    return false;
  };
  const add = async (id: string): Promise<VoiceAddition<Details>> => {
    const result = await input.create();
    const at = new Date().toISOString();
    if (result.ok) {
      // If this can't be recorded, the voice is still found by its name next time.
      await record(id, {
        status: "completed",
        output_payload: { voice_id: result.voiceId },
        completed_at: at,
      });
      return { voiceId: result.voiceId, name: input.name, details: input.details };
    }
    // A failure that can't be recorded leaves the attempt pending, which is
    // only ever looked for, never added again.
    await record(id, {
      status: result.uncertain ? "submission_uncertain" : "failed",
      error_code: result.code,
      error_message: result.message,
      failed_at: at,
    });
    if (result.uncertain)
      return {
        pending:
          "ElevenLabs may have added this voice, but its answer was lost. Try again in a minute: the studio looks for it in your account rather than adding it twice.",
      };
    throw new AppError(result.code as never, result.message);
  };
  // A new attempt (or one that definitely failed, tried again as now asked)
  // records the voices of that name first.
  const begin = async (existing: Attempt | null): Promise<VoiceAddition<Details>> => {
    const before = await named(input.name);
    const payload = {
      status: "running",
      input_payload: { name: input.name, details: input.details, before },
      submitted_at: new Date().toISOString(),
    };
    if (existing) {
      // Only one request takes a failed attempt up again: the one whose
      // update still finds it failed. Another, meanwhile, follows that one.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("operations")
        .update({ ...payload, error_code: null, error_message: null, failed_at: null } as never)
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (claimError) throw unchecked();
      if (!claimed) return settled(await load(), true);
      return add(existing.id);
    }
    const { data, error } = await supabaseAdmin
      .from("operations")
      .insert({
        ...payload,
        created_by: input.userId,
        operation_type: "voice_add",
        provider: "elevenlabs",
        dedupe_key: input.key,
      } as never)
      .select("id")
      .maybeSingle();
    // Another request for the same attempt got there first.
    if (error?.code === "23505") return settled(await load());
    if (error || !data) throw new AppError("UNKNOWN", "The voice couldn't be recorded. Try again.");
    return add(data.id);
  };
  // An earlier attempt: its voice, the voice that appeared for it, a new try
  // after a definite failure, or still pending.
  const settled = async (
    attempt: Attempt | null,
    alreadyTakenUp = false,
  ): Promise<VoiceAddition<Details>> => {
    if (!attempt) return begin(null);
    if (attempt.status === "failed") {
      // Still failed although another request just took it up: ask again later.
      if (alreadyTakenUp) throw unchecked();
      return begin(attempt);
    }
    // What the attempt was for, not what this request says.
    const name = attempt.input_payload?.name ?? input.name;
    const details = attempt.input_payload?.details ?? input.details;
    if (attempt.status === "completed" && attempt.output_payload?.voice_id)
      return { voiceId: attempt.output_payload.voice_id, name, details };
    const before = new Set(attempt.input_payload?.before ?? []);
    const fresh = (await named(name)).filter((id) => !before.has(id));
    // New voices of that name that other attempts added are theirs.
    const { data: claimed, error: claimedError } = fresh.length
      ? await supabaseAdmin
          .from("operations")
          .select("output_payload")
          .eq("operation_type", "voice_add")
          .eq("status", "completed")
          .in("output_payload->>voice_id" as never, fresh as never)
      : { data: [], error: null };
    if (claimedError) throw unchecked();
    const taken = new Set(
      ((claimed ?? []) as { output_payload: { voice_id?: string } | null }[]).map(
        (row) => row.output_payload?.voice_id,
      ),
    );
    const appeared = fresh.filter((id) => !taken.has(id));
    if (appeared.length === 1) {
      await record(attempt.id, {
        status: "completed",
        output_payload: { voice_id: appeared[0] },
        completed_at: new Date().toISOString(),
      });
      return { voiceId: appeared[0]!, name, details };
    }
    if (appeared.length > 1)
      throw new AppError(
        "INVALID_PARAMETERS",
        `More than one new voice called “${name}” is in your ElevenLabs account, so the studio can't tell which is this one. Choose it under My voices.`,
      );
    return {
      pending: `“${name}” hasn't appeared in your ElevenLabs account yet. Try again in a minute to pick it up.`,
    };
  };
  return settled(await load());
}
