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

/** The voice to use: the one asked for, else the campaign's, the project's, then the studio default. */
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
  const explicit = await load(input.voiceId);
  if (explicit) return { voice: explicit, via: "chosen" };
  let projectId = input.projectId ?? null;
  if (input.campaignId) {
    const { data } = await supabaseAdmin
      .from("campaigns")
      .select("brand_voice_id,project_id")
      .eq("id", input.campaignId)
      .maybeSingle();
    const fromCampaign = await load(data?.brand_voice_id);
    if (fromCampaign) return { voice: fromCampaign, via: "campaign" };
    projectId = projectId ?? data?.project_id ?? null;
  }
  if (projectId) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("brand_voice_id")
      .eq("id", projectId)
      .maybeSingle();
    const fromProject = await load(data?.brand_voice_id);
    if (fromProject) return { voice: fromProject, via: "project" };
  }
  const { data: fallback } = await supabaseAdmin
    .from("brand_voices")
    .select("*")
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
  return fallback ? { voice: fallback as unknown as BrandVoiceRow, via: "default" } : null;
}

export async function resolveVoice(
  input: Parameters<typeof resolveVoiceWithOrigin>[0],
): Promise<BrandVoiceRow | null> {
  return (await resolveVoiceWithOrigin(input))?.voice ?? null;
}

export interface VoiceoverResult {
  voiceoverId: string;
  status: string;
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
 * Takes cut off mid-way (the server stopped before recording the result) are
 * marked uncertain: the provider may have been billed, so they are never retried.
 */
async function settleInterrupted(): Promise<void> {
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
    .lt("created_at", new Date(Date.now() - STALE_VOICEOVER_MS).toISOString());
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
    const row = existing as unknown as {
      id: string;
      status: string;
      asset_id: string | null;
      duration_seconds: number | null;
      alignment: { words?: TimedWord[] } | null;
      voice_id: string | null;
      script: string;
    };
    return {
      voiceoverId: row.id,
      status: row.status,
      assetId: row.asset_id,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      words: row.alignment?.words ?? [],
      title: titleFor("Brand voice", row.script),
      voiceId: row.voice_id,
      voiceName: null,
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
      throw new AppError("UNKNOWN", "This voiceover is already being made. Give it a moment.");
    throw new AppError("UNKNOWN", "The voiceover could not be recorded");
  }

  const finish = (values: Record<string, unknown>) =>
    supabaseAdmin
      .from("voiceovers")
      .update(values as never)
      .eq("id", voiceoverId);

  const spoken = await synthesize(config, script);
  if (!spoken.ok) {
    await finish({
      status: spoken.uncertain ? "submission_uncertain" : "failed",
      error_code: spoken.code,
      error_message: spoken.message,
      completed_at: new Date().toISOString(),
    });
    throw new AppError(
      spoken.uncertain ? "SUBMISSION_UNCERTAIN" : (spoken.code as never),
      spoken.message,
    );
  }

  const result = spoken.result;
  const scope = projectId ? `projects/${projectId}` : `unassigned/${input.userId}`;
  const path = `${scope}/voiceovers/${voiceoverId}.mp3`;
  const upload = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .upload(path, result.audio, { contentType: result.mime, upsert: true });
  if (upload.error) {
    await finish({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The voiceover was made but could not be saved to the library.",
      completed_at: new Date().toISOString(),
    });
    throw new AppError(
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
    await finish({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The voiceover could not be added to the library.",
      completed_at: new Date().toISOString(),
    });
    throw new AppError("STORAGE_FAILED", "The voiceover could not be added to the library.");
  }

  await finish({
    status: "completed",
    asset_id: asset.id,
    duration_seconds: result.durationSeconds,
    alignment: { words: result.words } as never,
    provider_request_id: result.requestId,
    characters: result.characters,
    completed_at: new Date().toISOString(),
  });

  return {
    voiceoverId,
    status: "completed",
    assetId: asset.id,
    durationSeconds: result.durationSeconds,
    words: result.words,
    title,
    voiceId: voice.id,
    voiceName: voice.name,
    duplicate: false,
  };
}
