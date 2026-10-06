/**
 * Brand voice service: turns a brand voice and a script into a voiceover in
 * the library, with word timings for captions.
 *
 * Consistency comes from always speaking with the same provider voice, model,
 * settings (and seed, where supported) and pronunciation list. Every billable
 * call is recorded first; an uncertain outcome is never retried by itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

/**
 * The voice to use: the one asked for, else the campaign's, the project's,
 * then the studio default. A voice kept for one project only speaks for that
 * project's work: one chosen outside it is refused, and an inherited one
 * outside it is passed over.
 */
export async function resolveVoiceWithOrigin(input: {
  voiceId?: string | null | undefined;
  campaignId?: string | null | undefined;
  projectId?: string | null | undefined;
}): Promise<{ voice: BrandVoiceRow; via: VoiceOrigin } | null> {
  // A lookup that fails stops here: falling back would speak (and bill) with
  // a different voice than the one that applies.
  const unavailable = () =>
    new AppError("UNKNOWN", "The brand voice couldn't be looked up. Try again in a moment.");
  const load = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data, error } = await supabaseAdmin
      .from("brand_voices")
      .select("*")
      .eq("id", id)
      .eq("is_archived", false)
      .maybeSingle();
    if (error) throw unavailable();
    return (data ?? null) as unknown as BrandVoiceRow | null;
  };
  let projectId = input.projectId ?? null;
  const { data: campaign, error: campaignError } = input.campaignId
    ? await supabaseAdmin
        .from("campaigns")
        .select("brand_voice_id,project_id")
        .eq("id", input.campaignId)
        .maybeSingle()
    : { data: null, error: null };
  if (campaignError) throw unavailable();
  projectId = projectId ?? campaign?.project_id ?? null;
  const usable = (voice: BrandVoiceRow | null) =>
    voice && voiceInScope(voice, projectId) ? voice : null;

  const explicit = await load(input.voiceId);
  // A chosen voice that has since been archived or removed is never swapped
  // for another speaker.
  if (input.voiceId && !explicit)
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
  const fromCampaign = usable(await load(campaign?.brand_voice_id));
  if (fromCampaign) return { voice: fromCampaign, via: "campaign" };
  if (projectId) {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("brand_voice_id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw unavailable();
    const fromProject = usable(await load(data?.brand_voice_id));
    if (fromProject) return { voice: fromProject, via: "project" };
  }
  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from("brand_voices")
    .select("*")
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
  if (fallbackError) throw unavailable();
  const studioDefault = usable(fallback as unknown as BrandVoiceRow | null);
  return studioDefault ? { voice: studioDefault, via: "default" } : null;
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
}
const TAKE_COLUMNS = "id,status,asset_id,project_id,created_by,alignment,duration_seconds";

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

/** The take details kept beside its audio, if they couldn't be kept with the take. */
async function carriedDetails(take: TakeRow): Promise<Record<string, unknown> | null> {
  const { data: file, error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .download(takePath(take, "details"));
  if (error) {
    const { status, statusCode } = error as { status?: number; statusCode?: string };
    if (status === 404 || String(statusCode) === "404") return null;
    throw new AppError("UNKNOWN", "The take couldn't be checked. Try again in a moment.");
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
 * A take whose audio was stored but whose last update didn't land is finished
 * from that file. Only the take's own file counts: it is found at its fixed
 * place in the server-only bucket (and must really be there), so a library
 * record (which any member can create or edit) can't stand in for it.
 * Anything else comes back unchanged; a lookup that fails is thrown, so
 * nothing is decided without knowing.
 */
async function relinkedTake<T extends TakeRow>(row: T): Promise<T> {
  if (row.status !== "generating" || row.asset_id) return row;
  const unchecked = () =>
    new AppError("UNKNOWN", "The take couldn't be checked. Try again in a moment.");
  const path = takePath(row, "audio");
  const { data: asset, error } = await supabaseAdmin
    .from("assets")
    .select("id,duration_seconds")
    .eq("storage_bucket", OUTPUT_BUCKET)
    .eq("storage_path", path)
    .eq("asset_type", "audio")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw unchecked();
  if (!asset) return row;
  const stored = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .exists(path)
    .catch(() => {
      throw unchecked();
    });
  if (stored.data !== true) return row;
  const carried = row.alignment ? null : await carriedDetails(row);
  const { data } = await supabaseAdmin
    .from("voiceovers")
    .update({
      status: "completed",
      asset_id: asset.id,
      ...(row.duration_seconds === null && asset.duration_seconds !== null
        ? { duration_seconds: asset.duration_seconds }
        : {}),
      ...(carried ?? {}),
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "generating")
    .select("*")
    .maybeSingle();
  return (data ?? row) as unknown as T;
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

  // A repeated click returns the voiceover already made (or being made).
  const { data: existing } = await supabaseAdmin
    .from("voiceovers")
    .select("*")
    .eq("dedupe_key", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    const row = (await relinkedTake(existing as unknown as TakeRow)) as unknown as {
      id: string;
      status: VoiceoverResult["status"];
      error_message: string | null;
      asset_id: string | null;
      duration_seconds: number | null;
      alignment: { words?: TimedWord[] } | null;
      voice_id: string | null;
      script: string;
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
      duplicate: true,
    };
  }

  let projectId = input.projectId ?? null;
  let campaignId = input.campaignId ?? null;
  if (input.sequenceId) {
    // A take for an edit belongs to the edit's project and campaign, whatever
    // the request says: that is what its voice is checked against.
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
  }
  const voice = await resolveVoice({ voiceId: input.voiceId, campaignId, projectId });
  if (!voice)
    throw new AppError(
      "INVALID_PARAMETERS",
      "Choose a brand voice first, or set a studio default in Brand voices.",
    );

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
    if (insertError.code === "23505")
      return {
        voiceoverId: "",
        status: "generating",
        errorMessage: null,
        assetId: null,
        durationSeconds: null,
        words: [],
        title: "",
        voiceId: voice.id,
        voiceName: voice.name,
        duplicate: true,
      };
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
  // only the server can write.
  const details = {
    duration_seconds: result.durationSeconds,
    alignment: { words: result.words },
    provider_request_id: result.requestId,
    characters: result.characters,
  };
  const take = { id: voiceoverId, project_id: projectId, created_by: input.userId };
  if (!(await record(details)))
    await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .upload(takePath(take, "details"), JSON.stringify(details), {
        contentType: "application/json",
        upsert: true,
      });
  const path = takePath(take, "audio");
  const upload = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .upload(path, result.audio, { contentType: result.mime, upsert: true });
  if (upload.error) {
    return settle(
      "failed",
      "STORAGE_FAILED",
      "The voiceover was made but could not be saved to the library. Try again.",
    );
  }

  const title = titleFor(voice.name, script);
  const { data: asset, error: assetError } = await supabaseAdmin
    .from("assets")
    .insert({
      uploaded_by: input.userId,
      project_id: projectId,
      asset_type: "audio",
      storage_bucket: OUTPUT_BUCKET,
      storage_path: path,
      mime_type: result.mime,
      file_size: result.audio.length,
      duration_seconds: result.durationSeconds,
      source_type: "generated",
      title,
      metadata: {
        voiceover_id: voiceoverId,
        brand_voice_id: voice.id,
        provider: voice.provider,
        model: voice.model,
        ai_generated_voice: true,
      } as never,
    })
    .select("id")
    .single();
  if (assetError || !asset) {
    return settle(
      "failed",
      "STORAGE_FAILED",
      "The voiceover could not be added to the library. Try again.",
    );
  }

  // Success is only reported once it is recorded; if it can't be, the request
  // fails and the same request id later finishes the take from its stored file.
  const recorded = await record({
    status: "completed",
    asset_id: asset.id,
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
    assetId: asset.id,
    durationSeconds: result.durationSeconds,
    words: result.words,
    title,
    voiceId: voice.id,
    voiceName: voice.name,
    duplicate: false,
  };
}
