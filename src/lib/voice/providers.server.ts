/**
 * Voice providers for Creative Studio brand voices. Server-only: keys never
 * leave the server, and these modules are only loaded inside server-function
 * handlers. (Avatar Studio talks to its own providers separately.)
 *
 * Billable calls report whether a failure is certain or not: a provider that
 * answered with an error did not produce audio, but a timeout or dropped
 * connection may have — those become `submission_uncertain` upstream and are
 * never retried automatically.
 */
import type { ElevenLabsVoiceSettings, TimedWord } from "./catalog";
import { elevenLabsFullSettings, wordsFromCharacters } from "./catalog";
import { base64ToBytes } from "./audio";

export type SpeechResult =
  | {
      ok: true;
      audio: Uint8Array;
      mime: string;
      /** Word timings as spoken, when the provider supplies them. */
      words: TimedWord[] | null;
      requestId: string | null;
      characters: number | null;
    }
  | { ok: false; code: string; message: string; uncertain: boolean };

export interface ProviderFailure {
  ok: false;
  code: string;
  message: string;
  uncertain: boolean;
}

const SPEECH_TIMEOUT_MS = 90_000;

async function timed(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function transportFailure(provider: string, error: unknown): ProviderFailure {
  const aborted = error instanceof Error && error.name === "AbortError";
  return {
    ok: false,
    code: "SUBMISSION_UNCERTAIN",
    uncertain: true,
    message: aborted
      ? `${provider} did not answer in time. It may still have produced the audio, so it was not retried automatically.`
      : `The connection to ${provider} dropped. It may still have produced the audio, so it was not retried automatically.`,
  };
}

/* ------------------------------------------------------------------ */
/* OpenAI                                                              */
/* ------------------------------------------------------------------ */

export function openAIVoiceConfigured(): boolean {
  return !!process.env["OPENAI_API_KEY"]?.trim();
}

function openAIFailure(status: number, body: string): ProviderFailure {
  let detail = "";
  try {
    detail = String((JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "");
  } catch {
    detail = "";
  }
  const message =
    status === 401
      ? "OpenAI rejected the API key."
      : status === 429
        ? "OpenAI is rate limiting or the account is out of credit. Try again shortly."
        : detail || `OpenAI could not produce the voiceover (HTTP ${status}).`;
  return {
    ok: false,
    code: status === 429 ? "RATE_LIMITED" : "PROVIDER_REJECTED",
    message,
    uncertain: false,
  };
}

export async function openAISpeech(input: {
  text: string;
  voice: string;
  model: string;
  instructions: string;
  speed: number;
}): Promise<SpeechResult> {
  const key = process.env["OPENAI_API_KEY"]?.trim();
  if (!key)
    return {
      ok: false,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "OpenAI is not configured.",
      uncertain: false,
    };
  const instructions = input.instructions.trim();
  const speed = Math.min(4, Math.max(0.25, input.speed));
  let response: Response;
  try {
    response = await timed(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          voice: input.voice,
          input: input.text,
          response_format: "mp3",
          ...(instructions ? { instructions } : {}),
          ...(speed !== 1 ? { speed } : {}),
        }),
      },
      SPEECH_TIMEOUT_MS,
    );
  } catch (error) {
    return transportFailure("OpenAI", error);
  }
  if (!response.ok) return openAIFailure(response.status, await response.text().catch(() => ""));
  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return transportFailure("OpenAI", error);
  }
  if (!audio.length) return unreadable("OpenAI", true, "no audio");
  return {
    ok: true,
    audio,
    mime: "audio/mpeg",
    words: null,
    requestId: response.headers.get("x-request-id"),
    characters: input.text.length,
  };
}

/**
 * Word timings for finished speech, from OpenAI's transcription (whisper-1 is
 * the model that returns word timestamps). Best effort: null on any failure.
 */
export async function openAIWordTimings(
  audio: Uint8Array,
): Promise<{ words: TimedWord[]; duration: number | null } | null> {
  const key = process.env["OPENAI_API_KEY"]?.trim();
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "voiceover.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const response = await timed(
      "https://api.openai.com/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form },
      60_000,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      duration?: number;
      words?: { word?: string; start?: number; end?: number }[];
    };
    const words = (data.words ?? [])
      .filter(
        (word) =>
          typeof word.word === "string" &&
          typeof word.start === "number" &&
          typeof word.end === "number",
      )
      .map((word) => ({ text: word.word!.trim(), start: word.start!, end: word.end! }))
      .filter((word) => word.text);
    return { words, duration: typeof data.duration === "number" ? data.duration : null };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* ElevenLabs                                                          */
/* ------------------------------------------------------------------ */

const ELEVEN = "https://api.elevenlabs.io";

export function elevenLabsConfigured(): boolean {
  return !!process.env["ELEVENLABS_API_KEY"]?.trim();
}

function elevenFailure(status: number, body: string): ProviderFailure {
  let message = "";
  let code = "";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    const detail = parsed.detail;
    if (Array.isArray(detail))
      message = detail
        .map((entry) => (entry as { msg?: string }).msg)
        .filter(Boolean)
        .join("; ");
    else if (detail && typeof detail === "object") {
      const record = detail as { message?: string; status?: string; code?: string };
      message = record.message ?? "";
      code = record.code ?? record.status ?? "";
    } else if (typeof detail === "string") message = detail;
  } catch {
    message = "";
  }
  const friendly =
    status === 401
      ? "ElevenLabs rejected the API key."
      : status === 402 || /credit|quota/i.test(code + message)
        ? "The ElevenLabs account is out of credits."
        : status === 429
          ? "ElevenLabs is busy or rate limiting. Try again shortly."
          : message || `ElevenLabs could not complete the request (HTTP ${status}).`;
  return {
    ok: false,
    code:
      status === 429
        ? "RATE_LIMITED"
        : status === 402
          ? "INSUFFICIENT_PROVIDER_BALANCE"
          : "PROVIDER_REJECTED",
    message: friendly,
    uncertain: false,
  };
}

async function eleven(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const key = process.env["ELEVENLABS_API_KEY"]?.trim() ?? "";
  const headers = new Headers(init.headers);
  headers.set("xi-api-key", key);
  return timed(`${ELEVEN}${path}`, { ...init, headers }, timeoutMs);
}

async function elevenJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<{ ok: true; data: T } | ProviderFailure> {
  if (!elevenLabsConfigured())
    return {
      ok: false,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "ElevenLabs is not connected. Add ELEVENLABS_API_KEY to the backend secrets.",
      uncertain: false,
    };
  // A request that makes something (speech, a voice) and was accepted may have
  // been carried out even when its answer can't be read: that is uncertain,
  // never a failure that could be tried again.
  const mutating = (init.method ?? "GET").toUpperCase() !== "GET";
  let response: Response;
  try {
    response = await eleven(path, init, timeoutMs);
  } catch (error) {
    return transportFailure("ElevenLabs", error);
  }
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (response.ok && mutating) return transportFailure("ElevenLabs", error);
    return {
      ok: false,
      code: "PROVIDER_REJECTED",
      message: "ElevenLabs' answer was cut off.",
      uncertain: false,
    };
  }
  if (!response.ok) return elevenFailure(response.status, body);
  try {
    return { ok: true, data: JSON.parse(body) as T };
  } catch {
    return unreadable("ElevenLabs", mutating);
  }
}

/** An accepted answer that can't be used: uncertain when the request made something. */
function unreadable(
  provider: string,
  mutating: boolean,
  what = "an unreadable answer",
): ProviderFailure {
  return mutating
    ? {
        ok: false,
        code: "SUBMISSION_UNCERTAIN",
        message: `${provider} accepted the request but sent ${what}. It may still have been carried out (and billed), so it was not retried automatically.`,
        uncertain: true,
      }
    : {
        ok: false,
        code: "PROVIDER_REJECTED",
        message: `${provider} sent ${what}.`,
        uncertain: false,
      };
}

export async function elevenLabsSpeech(input: {
  voiceId: string;
  model: string;
  text: string;
  settings: ElevenLabsVoiceSettings;
  languageCode?: string | null | undefined;
}): Promise<SpeechResult> {
  // v4 takes only stability and similarity; the others take the full set.
  const voiceSettings: Record<string, unknown> = {
    stability: input.settings.stability,
    similarity_boost: input.settings.similarity_boost,
  };
  if (elevenLabsFullSettings(input.model)) {
    voiceSettings["style"] = input.settings.style;
    voiceSettings["use_speaker_boost"] = input.settings.use_speaker_boost;
    voiceSettings["speed"] = input.settings.speed;
  }
  const body: Record<string, unknown> = {
    text: input.text,
    model_id: input.model,
    voice_settings: voiceSettings,
  };
  if (input.settings.seed !== null) body["seed"] = input.settings.seed;
  if (input.languageCode && input.model !== "eleven_multilingual_v2")
    body["language_code"] = input.languageCode.slice(0, 2);

  const result = await elevenJson<{
    audio_base64?: string;
    alignment?: {
      characters?: string[];
      character_start_times_seconds?: number[];
      character_end_times_seconds?: number[];
    } | null;
  }>(
    `/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    SPEECH_TIMEOUT_MS,
  );
  if (!result.ok) return result;
  if (!result.data.audio_base64) return unreadable("ElevenLabs", true, "no audio");
  const alignment = result.data.alignment;
  const words =
    alignment?.characters &&
    alignment.character_start_times_seconds &&
    alignment.character_end_times_seconds
      ? wordsFromCharacters(
          alignment.characters,
          alignment.character_start_times_seconds,
          alignment.character_end_times_seconds,
        )
      : null;
  return {
    ok: true,
    audio: base64ToBytes(result.data.audio_base64),
    mime: "audio/mpeg",
    words,
    requestId: null,
    characters: input.text.length,
  };
}

export interface ElevenVoice {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
}

export async function elevenLabsAccountVoices(
  search: string,
): Promise<{ ok: true; voices: ElevenVoice[] } | ProviderFailure> {
  const params = new URLSearchParams({ page_size: "100" });
  if (search.trim()) params.set("search", search.trim());
  const result = await elevenJson<{
    voices?: {
      voice_id: string;
      name: string;
      category?: string;
      description?: string;
      preview_url?: string;
      labels?: Record<string, string>;
    }[];
  }>(`/v2/voices?${params}`);
  if (!result.ok) return result;
  return {
    ok: true,
    voices: (result.data.voices ?? []).map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category ?? null,
      description: voice.description ?? null,
      previewUrl: voice.preview_url ?? null,
      labels: voice.labels ?? {},
    })),
  };
}

export interface LibraryVoice extends ElevenVoice {
  publicOwnerId: string;
  gender: string | null;
  age: string | null;
  accent: string | null;
  language: string | null;
  useCase: string | null;
}

export async function elevenLabsLibrary(filters: {
  search?: string | undefined;
  gender?: string | undefined;
  age?: string | undefined;
  accent?: string | undefined;
  language?: string | undefined;
  useCase?: string | undefined;
  page?: number | undefined;
}): Promise<{ ok: true; voices: LibraryVoice[]; hasMore: boolean } | ProviderFailure> {
  const params = new URLSearchParams({ page_size: "30", page: String(filters.page ?? 0) });
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.age) params.set("age", filters.age);
  if (filters.accent) params.set("accent", filters.accent);
  if (filters.language) params.set("language", filters.language);
  if (filters.useCase) params.append("use_cases", filters.useCase);
  const result = await elevenJson<{
    voices?: {
      public_owner_id: string;
      voice_id: string;
      name: string;
      gender?: string;
      age?: string;
      accent?: string;
      language?: string;
      use_case?: string;
      category?: string;
      description?: string;
      preview_url?: string;
    }[];
    has_more?: boolean;
  }>(`/v1/shared-voices?${params}`);
  if (!result.ok) return result;
  return {
    ok: true,
    hasMore: !!result.data.has_more,
    voices: (result.data.voices ?? []).map((voice) => ({
      voiceId: voice.voice_id,
      publicOwnerId: voice.public_owner_id,
      name: voice.name,
      category: voice.category ?? null,
      description: voice.description ?? null,
      previewUrl: voice.preview_url ?? null,
      labels: {},
      gender: voice.gender ?? null,
      age: voice.age ?? null,
      accent: voice.accent ?? null,
      language: voice.language ?? null,
      useCase: voice.use_case ?? null,
    })),
  };
}

export async function elevenLabsAddLibraryVoice(
  publicOwnerId: string,
  voiceId: string,
  name: string,
): Promise<{ ok: true; voiceId: string } | ProviderFailure> {
  const result = await elevenJson<{ voice_id?: string }>(
    `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: name.slice(0, 100) }),
    },
  );
  if (!result.ok) return result;
  return result.data.voice_id
    ? { ok: true, voiceId: result.data.voice_id }
    : unreadable("ElevenLabs", true, "no id for the new voice");
}

export interface DesignPreview {
  generatedVoiceId: string;
  audioBase64: string;
  mime: string;
  durationSeconds: number | null;
}

export async function elevenLabsDesign(input: {
  description: string;
  text?: string | undefined;
}): Promise<{ ok: true; previews: DesignPreview[]; text: string | null } | ProviderFailure> {
  const body: Record<string, unknown> = {
    voice_description: input.description,
    model_id: "eleven_multilingual_ttv_v2",
  };
  if (input.text && input.text.trim().length >= 100)
    body["text"] = input.text.trim().slice(0, 1000);
  else body["auto_generate_text"] = true;
  const result = await elevenJson<{
    previews?: {
      audio_base_64: string;
      generated_voice_id: string;
      media_type?: string;
      duration_secs?: number;
    }[];
    text?: string;
  }>(
    "/v1/text-to-voice/design",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    120_000,
  );
  if (!result.ok) return result;
  // Designing is billed when accepted: an answer without a usable option is
  // uncertain, never a reason to design again by itself.
  const previews = (Array.isArray(result.data.previews) ? result.data.previews : [])
    .filter(
      (preview) =>
        typeof preview?.generated_voice_id === "string" &&
        preview.generated_voice_id.length > 0 &&
        typeof preview.audio_base_64 === "string" &&
        preview.audio_base_64.length > 0,
    )
    .map((preview) => ({
      generatedVoiceId: preview.generated_voice_id,
      audioBase64: preview.audio_base_64,
      mime: preview.media_type ?? "audio/mpeg",
      durationSeconds: preview.duration_secs ?? null,
    }));
  if (!previews.length) return unreadable("ElevenLabs", true, "no usable voice options");
  return { ok: true, text: result.data.text ?? null, previews };
}

export async function elevenLabsSaveDesign(input: {
  name: string;
  description: string;
  generatedVoiceId: string;
}): Promise<{ ok: true; voiceId: string } | ProviderFailure> {
  const result = await elevenJson<{ voice_id?: string }>("/v1/text-to-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_name: input.name.slice(0, 100),
      voice_description: input.description.slice(0, 1000),
      generated_voice_id: input.generatedVoiceId,
    }),
  });
  if (!result.ok) return result;
  return result.data.voice_id
    ? { ok: true, voiceId: result.data.voice_id }
    : unreadable("ElevenLabs", true, "no id for the new voice");
}

export async function elevenLabsClone(input: {
  name: string;
  description: string;
  files: { name: string; type: string; bytes: Uint8Array }[];
  removeBackgroundNoise: boolean;
}): Promise<{ ok: true; voiceId: string } | ProviderFailure> {
  const form = new FormData();
  form.append("name", input.name.slice(0, 100));
  if (input.description) form.append("description", input.description.slice(0, 500));
  form.append("remove_background_noise", String(input.removeBackgroundNoise));
  for (const file of input.files)
    form.append("files", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const result = await elevenJson<{ voice_id?: string }>(
    "/v1/voices/add",
    { method: "POST", body: form },
    120_000,
  );
  if (!result.ok) return result;
  return result.data.voice_id
    ? { ok: true, voiceId: result.data.voice_id }
    : unreadable("ElevenLabs", true, "no id for the new voice");
}
