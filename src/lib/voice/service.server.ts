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
  const load = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data } = await supabaseAdmin
      .from("brand_voices")
      .select("*")
      .eq("id", id)
      .eq("is_archived", false)
      .maybeSingle();
    return (data ?? null) as unknown as BrandVoiceRow | null;
  };
  let projectId = input.projectId ?? null;
  const { data: campaign } = input.campaignId
    ? await supabaseAdmin
        .from("campaigns")
        .select("brand_voice_id,project_id")
        .eq("id", input.campaignId)
        .maybeSingle()
    : { data: null };
  projectId = projectId ?? campaign?.project_id ?? null;
  const usable = (voice: BrandVoiceRow | null) =>
    voice && voiceInScope(voice, projectId) ? voice : null;

  const explicit = await load(input.voiceId);
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
    const { data } = await supabaseAdmin
      .from("projects")
      .select("brand_voice_id")
      .eq("id", projectId)
      .maybeSingle();
    const fromProject = usable(await load(data?.brand_voice_id));
    if (fromProject) return { voice: fromProject, via: "project" };
  }
  const { data: fallback } = await supabaseAdmin
    .from("brand_voices")
    .select("*")
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
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

/**
 * A take whose audio was stored but whose last update didn't land is finished
 * from that file (each stored file names its take). Anything else comes back
 * unchanged.
 */
async function relinkedTake<T extends { id: string; status: string; asset_id: string | null }>(
  row: T,
): Promise<T> {
  if (row.status !== "generating" || row.asset_id) return row;
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id,duration_seconds")
    .eq("metadata->>voiceover_id", row.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!asset) return row;
  const { data } = await supabaseAdmin
    .from("voiceovers")
    .update({
      status: "completed",
      asset_id: asset.id,
      ...(asset.duration_seconds !== null ? { duration_seconds: asset.duration_seconds } : {}),
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
 * One whose audio was stored is finished instead.
 */
async function settleInterrupted(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_VOICEOVER_MS).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("voiceovers")
    .select("id,status,asset_id")
    .eq("status", "generating")
    .lt("created_at", cutoff)
    .limit(50);
  for (const row of stale ?? []) await relinkedTake(row);
  await supabaseAdmin
    .from("voiceovers")
    .update({
      status: "submission_uncertain",
      error_code: "INTERRUPTED",
      error_message:
        "This take was interrupted before it was saved. It may still have been billed, so it was not retried.",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("status", "generating")
    .lt("created_at", cutoff);
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
    const row = (await relinkedTake(existing as never)) as unknown as {
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
    const { data: sequence } = await supabaseAdmin
      .from("sequences")
      .select("project_id,campaign_id")
      .eq("id", input.sequenceId)
      .maybeSingle();
    projectId = projectId ?? sequence?.project_id ?? null;
    campaignId = campaignId ?? sequence?.campaign_id ?? null;
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
  // The details are kept with the take first, so a take recovered from its
  // stored file (if the last update fails) still has its word timings.
  await finish({
    duration_seconds: result.durationSeconds,
    alignment: { words: result.words } as never,
    provider_request_id: result.requestId,
    characters: result.characters,
  });
  const scope = projectId ? `projects/${projectId}` : `unassigned/${input.userId}`;
  const path = `${scope}/voiceovers/${voiceoverId}.mp3`;
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
