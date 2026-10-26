/**
 * A recording transcribed, word by word, in the brand's spellings (see
 * ./transcript): an audio file or a video in the library. As One began with
 * its reference's script read word for word, by two recognisers installed in
 * the session for it; this is that step in the studio.
 *
 * The media service first takes a copy for speech (extract_audio, mono at 16
 * kHz as an MP3, kept out of the library), so a video or a long recording
 * fits the transcription service's 25 MB (an hour). OpenAI then hears it,
 * prompted with the brand's names, and the names are put right. The
 * transcript is kept with the media task, so asking again with the same key
 * reads it and pays nothing more. One call hears it: the first to claim it,
 * and a call that overlaps it follows it rather than paying again.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError, type AppErrorCode } from "../higgsfield/errors";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import { requireActiveMember } from "../media/members.server";
import { requireWorkerFeature } from "../media/worker-feature.server";
import type { TimedWord } from "./catalog";
import { openAITranscript, openAIVoiceConfigured } from "./providers.server";
import { spellTranscript, termsPrompt, type SpellingCorrection } from "./transcript";

export interface TranscriptionState {
  taskId: string;
  /** extracting: the speech copy is being made; transcribing: another call with the same key is hearing it. */
  status: "extracting" | "transcribing" | "completed" | "failed";
  /** The transcript, punctuated, in the brand's spellings. */
  text: string | null;
  words: TimedWord[];
  durationSeconds: number | null;
  language: string | null;
  /** The brand's names put right, each with what was heard and when. */
  corrections: SpellingCorrection[];
  /** The names it listened for and spelt. */
  terms: string[];
  message: string | null;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

interface TaskRow {
  id: string;
  status: string;
  output_payload: unknown;
  input_payload: unknown;
  error_message: string | null;
  /** Set by the database on every change: a claim is written only on the row as it was read. */
  updated_at: string;
}

const TASK_COLUMNS = "id,status,output_payload,input_payload,error_message,updated_at";
/** How long a call waits for the speech copy before answering "extracting". */
export const TRANSCRIBE_WAIT_MS = 40_000;
const POLL_MS = 1_000;
const MAX_TERMS = 60;
/**
 * How long a transcription stays with the call that claimed it before another
 * may take it up: past OpenAI's own two minutes and the copy's download, so
 * only a call that died leaves its claim to run out.
 */
export const HEARING_MS = 4 * 60_000;

async function taskByKey(dedupeKey: string): Promise<TaskRow | null> {
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select(TASK_COLUMNS)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

const finished = (task: TaskRow) =>
  task.status === "completed" || ["failed", "cancelled", "stalled"].includes(task.status);

async function waitFor(dedupeKey: string, waitMs: number): Promise<TaskRow | null> {
  const until = Date.now() + waitMs;
  for (;;) {
    const task = await taskByKey(dedupeKey);
    if (!task || finished(task) || Date.now() + POLL_MS > until) return task;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function state(task: TaskRow, partial: Partial<TranscriptionState>): TranscriptionState {
  return {
    taskId: task.id,
    status: "extracting",
    text: null,
    words: [],
    durationSeconds: null,
    language: null,
    corrections: [],
    terms: [],
    message: null,
    ...partial,
  };
}

/** The brand's names: the kit named, else the studio's default kit; with any given. */
async function brandTerms(
  brandKitId: string | null | undefined,
  given: string[],
): Promise<string[]> {
  let query = supabaseAdmin.from("brand_kits").select("terms").eq("is_archived", false);
  query = brandKitId ? query.eq("id", brandKitId) : query.eq("is_default", true);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new AppError("UNKNOWN", "The brand kit couldn't be read. Try again.");
  if (brandKitId && !data) throw new AppError("INVALID_PARAMETERS", "That brand kit doesn't exist");
  const kit = Array.isArray(data?.terms) ? (data.terms as unknown[]) : [];
  const all = [...given, ...kit].filter((term): term is string => typeof term === "string");
  return [...new Set(all.map((term) => term.trim()).filter(Boolean))].slice(0, MAX_TERMS);
}

/** A finished transcript kept with its task, read back. */
function kept(task: TaskRow): TranscriptionState | null {
  const transcript = asRecord(asRecord(task.output_payload)["transcript"]);
  if (typeof transcript["text"] !== "string") return null;
  return state(task, {
    status: "completed",
    text: transcript["text"],
    words: Array.isArray(transcript["words"]) ? (transcript["words"] as TimedWord[]) : [],
    durationSeconds:
      typeof transcript["duration_seconds"] === "number" ? transcript["duration_seconds"] : null,
    language: typeof transcript["language"] === "string" ? transcript["language"] : null,
    corrections: Array.isArray(transcript["corrections"])
      ? (transcript["corrections"] as SpellingCorrection[])
      : [],
    terms: Array.isArray(transcript["terms"]) ? (transcript["terms"] as string[]) : [],
  });
}

/** The task's payload with these changes, and without these keys. */
function payloadWith(task: TaskRow, changes: Json, without: string[] = []): Json {
  const payload: Json = { ...asRecord(task.output_payload), ...changes };
  for (const key of without) delete payload[key];
  return payload;
}

/** Whether another call is hearing it now: its claim, written less than HEARING_MS ago. */
function beingHeard(task: TaskRow): boolean {
  const at = asRecord(asRecord(task.output_payload)["hearing"])["at"];
  return typeof at === "string" && Date.now() - Date.parse(at) < HEARING_MS;
}

/**
 * Claims the transcription for this call, on the row only as it was read (its
 * updated_at, which every change moves on): of two calls that read it at
 * once, one claims it and the other follows. Null when another got there first.
 */
async function claim(task: TaskRow): Promise<TaskRow | null> {
  const hearing = { token: crypto.randomUUID(), at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from("media_tasks")
    .update({ output_payload: payloadWith(task, { hearing }) as never })
    .eq("id", task.id)
    .eq("updated_at", task.updated_at)
    .select(TASK_COLUMNS);
  if (error) throw new AppError("UNKNOWN", "The transcription couldn't be started. Try again.");
  return ((data as TaskRow[] | null) ?? [])[0] ?? null;
}

/** Lets a claim go, if nothing has changed since it was written, so the next call can hear it. */
async function release(claimed: TaskRow): Promise<void> {
  await supabaseAdmin
    .from("media_tasks")
    .update({ output_payload: payloadWith(claimed, {}, ["hearing"]) as never })
    .eq("id", claimed.id)
    .eq("updated_at", claimed.updated_at);
}

/** What a failed transcription says, as the studio's own codes. */
const HEARD_CODES = new Set<string>([
  "PROVIDER_NOT_CONFIGURED",
  "INVALID_PARAMETERS",
  "PROVIDER_TIMEOUT",
  "RATE_LIMITED",
  "PROVIDER_REJECTED",
]);

/**
 * Hears the speech copy for the call that claimed it, spells it as the brand
 * does, and keeps the transcript with its task; on a failure, lets the claim go.
 */
async function hear(
  task: TaskRow,
  terms: string[],
  language: string | null,
): Promise<TranscriptionState> {
  try {
    return await heard(task, terms, language);
  } catch (error) {
    await release(task).catch(() => undefined);
    throw error;
  }
}

async function heard(
  task: TaskRow,
  terms: string[],
  language: string | null,
): Promise<TranscriptionState> {
  const files = asRecord(task.output_payload)["files"];
  const file = Array.isArray(files) ? asRecord(files[0]) : {};
  if (typeof file["bucket"] !== "string" || typeof file["path"] !== "string")
    throw new AppError(
      "UNKNOWN",
      "The speech copy wasn't kept. Ask again with a new clientRequestId.",
    );
  const { data: blob, error } = await supabaseAdmin.storage
    .from(file["bucket"])
    .download(file["path"]);
  if (error || !blob) throw new AppError("UNKNOWN", "The speech copy couldn't be read. Try again.");
  const audio = new Uint8Array(await blob.arrayBuffer());
  const heard = await openAITranscript(
    audio,
    { mime: "audio/mpeg", name: "speech.mp3" },
    { prompt: termsPrompt(terms), language },
  );
  if (!heard.ok)
    throw new AppError(
      HEARD_CODES.has(heard.code) ? (heard.code as AppErrorCode) : "PROVIDER_REJECTED",
      heard.message,
    );
  const spelt = spellTranscript(heard.words, heard.text, terms);
  const transcript = {
    text: spelt.text,
    words: spelt.words,
    duration_seconds: heard.duration,
    language: heard.language,
    corrections: spelt.corrections,
    terms,
  };
  const { error: keepError } = await supabaseAdmin
    .from("media_tasks")
    .update({ output_payload: payloadWith(task, { transcript }, ["hearing"]) as never })
    .eq("id", task.id);
  // The speech copy was taken only to be heard: once its transcript is kept, it goes.
  if (!keepError)
    await supabaseAdmin.storage
      .from(file["bucket"])
      .remove([file["path"]])
      .catch(() => undefined);
  return state(task, {
    status: "completed",
    text: spelt.text,
    words: spelt.words,
    durationSeconds: heard.duration,
    language: heard.language,
    corrections: spelt.corrections,
    terms,
  });
}

export interface TranscribeRequest {
  userId: string;
  /** An audio file or a video in the library. */
  assetId: string;
  /** Its language (ISO 639-1, "en"), when known. */
  language?: string | null | undefined;
  /** Names to spell as given, beside the brand kit's own. */
  terms?: string[] | undefined;
  /** The brand kit whose names it spells; the studio's default kit unless given. */
  brandKitId?: string | null | undefined;
  /** One transcription per key: asking again reads the one made. */
  dedupeKey: string;
  waitMs?: number;
}

const SOUNDING = new Set(["audio", "video"]);

/** Transcribes a library file (see the top of this file), or reads the transcription made under the same key. */
export async function transcribeAudio(input: TranscribeRequest): Promise<TranscriptionState> {
  await requireActiveMember(input.userId);
  const waitMs = input.waitMs ?? TRANSCRIBE_WAIT_MS;
  const language = input.language?.trim().toLowerCase() || null;
  if (language && !/^[a-z]{2}$/.test(language))
    throw new AppError("INVALID_PARAMETERS", 'language: two letters, as ISO 639-1 has them ("en")');

  let task = await taskByKey(input.dedupeKey);
  if (task) {
    const done = kept(task);
    if (done) return done;
  }
  // The names before anything is started, so a brand kit that isn't there is said at once.
  const terms = await brandTerms(input.brandKitId, input.terms ?? []);
  if (!openAIVoiceConfigured())
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Transcription needs OpenAI, and the studio's OPENAI_API_KEY isn't set. An admin needs to add it.",
    );
  if (!task) {
    const { data: asset, error } = await supabaseAdmin
      .from("assets")
      .select("id,asset_type,storage_bucket,storage_path,mime_type,project_id")
      .eq("id", input.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new AppError("UNKNOWN", "The file couldn't be read. Try again.");
    if (!asset) throw new AppError("INVALID_PARAMETERS", "That file is no longer in the library");
    if (!SOUNDING.has(asset.asset_type))
      throw new AppError(
        "INVALID_PARAMETERS",
        "Speech is transcribed from an audio file or a video",
      );
    // An older media service would make a full-size copy, too big to be heard past a few minutes.
    await requireWorkerFeature("speech_audio", "Transcribing a recording");
    const queued = await enqueueInternalMediaTask({
      createdBy: input.userId,
      projectId: asset.project_id ?? null,
      taskType: "extract_audio",
      source: {
        assetId: asset.id,
        assetType: asset.asset_type as "audio" | "video",
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
      },
      params: { format: "mp3", speech: true },
      dedupeKey: input.dedupeKey,
      output: { count: 1, ext: "mp3", mime: "audio/mpeg", kind: "audio" },
      // The speech copy stays out of the library: only the transcript is wanted.
      context: { register_outputs: false, transcribe: true },
      notConfiguredMessage:
        "The media service is not configured, so the recording's speech can't be taken out. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    });
    if (!queued.ok)
      throw new AppError(
        queued.retryable ? "PROVIDER_TIMEOUT" : "UNKNOWN",
        queued.retryable
          ? `${queued.message}. Try again in a moment, with a new clientRequestId.`
          : queued.message,
      );
  }
  task = await waitFor(input.dedupeKey, waitMs);
  if (!task) throw new AppError("UNKNOWN", "The transcription couldn't be followed. Try again.");
  const done = kept(task);
  if (done) return done;
  if (["failed", "cancelled", "stalled"].includes(task.status))
    return state(task, {
      status: "failed",
      message: `${(task.error_message ?? "Its speech couldn't be taken out").replace(/[.\s]+$/, "")}. Ask again with a new clientRequestId.`,
    });
  if (task.status !== "completed") return state(task, {});
  // One call hears it, the first to claim it; one that overlaps it waits for its transcript.
  const until = Date.now() + waitMs;
  for (;;) {
    const done = kept(task);
    if (done) return done;
    if (!beingHeard(task)) {
      const claimed = await claim(task);
      if (claimed) return hear(claimed, terms, language);
    }
    if (Date.now() + POLL_MS > until) return state(task, { status: "transcribing" });
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    task = (await taskByKey(input.dedupeKey)) ?? task;
  }
}
