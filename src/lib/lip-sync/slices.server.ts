/**
 * A clip's piece of a prepared voiceover: the canonical WAV's own samples from
 * where its piece starts to where it ends, behind a header of its own (see
 * ./wav). It is cut with two ranged reads of storage, the header and then the
 * piece, so it is exact to the sample and nothing is decoded. The piece is
 * what its clip is sent as driving audio, and what the clip's sound is later
 * measured against.
 *
 * Before it is sent, a quiet voiceover is raised (by one gain for the whole of
 * it, so its pieces stay as loud as each other) and a piece shorter than the
 * shortest driving audio a model takes is followed by silence. Neither moves
 * a word: the piece's first sample is still the first sample of its window.
 *
 * Pieces are a run's working files, like a clip's handoff frame, so they are
 * kept out of the library: each has an asset row (a generation is sent assets)
 * marked deleted, which no library view lists. Asked again, the same piece.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { LIP_SYNC } from "./models";
import { preparationById } from "./prepare.server";
import {
  byteRange,
  gainPcm16,
  parseWavHeader,
  sampleAt,
  speechGainDb,
  wavFile,
  withSilenceAfter,
} from "./wav";

const BUCKET = "generated-assets";
/** Enough of the canonical file to hold its header, whatever chunks come first. */
const HEADER_BYTES = 4096;
const READ_URL_TTL = 10 * 60;

export interface VoiceoverPiece {
  assetId: string;
  /** The preparation it was cut from. */
  preparationId: string;
  bucket: string;
  path: string;
  /** The canonical file's samples it holds: from (inclusive) to (exclusive). */
  fromSample: number;
  toSample: number;
  sampleRate: number;
  /** Seconds of the voiceover in it (silence after it not counted). */
  seconds: number;
  /** Seconds of silence after it, to the shortest driving audio a model takes. */
  silenceSeconds: number;
  gainDb: number;
}

type Json$ = Record<string, unknown>;
const asRecord = (value: unknown): Json$ =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json$) : {};

const storageFailed = () =>
  new AppError(
    "STORAGE_FAILED",
    "The voiceover couldn't be read from storage. Try again in a moment.",
  );

function contentRange(header: string | null): { first: number; total: number | null } | null {
  const match = header?.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
  if (!match) return null;
  return { first: Number(match[1]), total: match[3] === "*" ? null : Number(match[3]) };
}

/**
 * Bytes `start` to `end` (inclusive) of a file at a URL, and the file's size
 * where the answer says. A server that ignores the range sends the whole file:
 * it is read through to the range and the rest left unread.
 */
async function readRange(
  url: string,
  start: number,
  end: number,
): Promise<{ bytes: Uint8Array; total: number | null }> {
  const want = Math.max(0, end - start + 1);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  } catch {
    throw storageFailed();
  }
  if (response.status === 416) {
    await response.body?.cancel().catch(() => undefined);
    return {
      bytes: new Uint8Array(),
      total: contentRange(response.headers.get("content-range"))?.total ?? null,
    };
  }
  if (!response.ok || !response.body) throw storageFailed();

  if (response.status === 206) {
    const range = contentRange(response.headers.get("content-range"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const skip = range ? start - range.first : 0;
    if (skip < 0) throw storageFailed();
    return { bytes: bytes.subarray(skip, skip + want), total: range?.total ?? null };
  }

  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const reader = response.body.getReader();
  const out = new Uint8Array(want);
  let filled = 0;
  let position = 0;
  try {
    while (filled < want) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const chunkStart = position;
      position += value.length;
      if (position <= start) continue;
      const from = Math.max(0, start - chunkStart);
      const take = Math.min(value.length - from, want - filled);
      out.set(value.subarray(from, from + take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return { bytes: out.subarray(0, filled), total };
}

/** A stored piece, read from its asset row (null for any other file). */
export function pieceOf(row: {
  id: string;
  storage_bucket: string;
  storage_path: string;
  metadata: unknown;
}): VoiceoverPiece | null {
  const piece = asRecord(asRecord(row.metadata)["lip_sync_piece"]);
  const number = (key: string) => (typeof piece[key] === "number" ? (piece[key] as number) : null);
  const from = number("from_sample");
  const to = number("to_sample");
  const rate = number("sample_rate");
  const preparationId =
    typeof piece["preparation_id"] === "string" ? piece["preparation_id"] : null;
  if (from === null || to === null || !rate || !preparationId) return null;
  return {
    assetId: row.id,
    preparationId,
    bucket: row.storage_bucket,
    path: row.storage_path,
    fromSample: from,
    toSample: to,
    sampleRate: rate,
    seconds: (to - from) / rate,
    silenceSeconds: number("silence_seconds") ?? 0,
    gainDb: number("gain_db") ?? 0,
  };
}

/** "1:02.40": a time in a piece's title. */
function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(
    Math.round((seconds - whole) * 100),
  ).padStart(2, "0")}`;
}

/**
 * The piece of a prepared voiceover from `startSeconds` to `endSeconds` (on
 * the voiceover's own clock), cut and stored once. `label` says what it is
 * for, in its title.
 */
export async function voiceoverPiece(input: {
  preparationId: string;
  startSeconds: number;
  endSeconds: number;
  createdBy: string | null;
  projectId: string | null;
  label: string;
}): Promise<VoiceoverPiece> {
  const preparation = await preparationById(input.preparationId);
  if (
    !preparation ||
    preparation.status !== "ready" ||
    !preparation.prepared_asset_id ||
    !preparation.sample_rate ||
    !preparation.samples
  )
    throw new AppError("INVALID_PARAMETERS", "The voiceover isn't prepared yet.");
  if (!(input.endSeconds > input.startSeconds) || input.startSeconds < 0)
    throw new AppError("INVALID_PARAMETERS", "That piece of the voiceover has no length.");

  const { data: prepared, error: preparedError } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path")
    .eq("id", preparation.prepared_asset_id)
    .maybeSingle();
  if (preparedError) throw storageFailed();
  if (!prepared)
    throw new AppError("INVALID_PARAMETERS", "The prepared voiceover is no longer stored.");

  const rate = preparation.sample_rate;
  const samples = Number(preparation.samples);
  const fromSample = sampleAt({ rate, samples }, input.startSeconds);
  const toSample = sampleAt({ rate, samples }, input.endSeconds);
  if (!(toSample > fromSample))
    throw new AppError("INVALID_PARAMETERS", "That piece of the voiceover has no length.");

  const scope = preparation.project_id
    ? `projects/${preparation.project_id}`
    : `unassigned/${preparation.created_by ?? "studio"}`;
  const path = `${scope}/lip-sync/${preparation.id}/${fromSample}-${toSample}.wav`;
  const findPiece = () =>
    supabaseAdmin
      .from("assets")
      .select("id,storage_bucket,storage_path,metadata")
      .eq("storage_bucket", BUCKET)
      .eq("storage_path", path)
      .maybeSingle();
  const { data: existing, error: existingError } = await findPiece();
  if (existingError) throw storageFailed();
  const kept = existing ? pieceOf(existing) : null;
  if (kept) return kept;

  // The canonical file's own header says where its sound starts.
  const { data: signed } = await supabaseAdmin.storage
    .from(prepared.storage_bucket)
    .createSignedUrl(prepared.storage_path, READ_URL_TTL);
  if (!signed?.signedUrl) throw storageFailed();
  const head = await readRange(signed.signedUrl, 0, HEADER_BYTES - 1);
  const layout = parseWavHeader(head.bytes, head.total ?? head.bytes.length);
  if (!layout || layout.bits !== 16 || layout.rate !== rate || layout.samples < toSample)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The prepared voiceover isn't the file its preparation describes. Prepare it again.",
    );

  const range = byteRange(layout, fromSample, toSample);
  const sound = await readRange(signed.signedUrl, range.start, range.end);
  if (sound.bytes.length !== (toSample - fromSample) * layout.blockAlign) throw storageFailed();

  const analysis = asRecord(preparation.analysis);
  const speechDb = asRecord(analysis["levels"])["speech_db"];
  const raised = gainPcm16(
    sound.bytes,
    speechGainDb(typeof speechDb === "number" ? speechDb : null),
  );
  const minFrames = Math.ceil(LIP_SYNC.minDrivingSeconds * rate);
  const padded = withSilenceAfter(
    raised.sound,
    Math.max(minFrames, toSample - fromSample),
    layout.blockAlign,
  );
  const file = wavFile(layout, padded);
  const silenceSeconds = Number(
    (Math.max(0, minFrames - (toSample - fromSample)) / rate).toFixed(6),
  );

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: "audio/wav", upsert: true });
  if (uploadError) throw storageFailed();

  const seconds = (toSample - fromSample) / rate;
  const now = new Date().toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("assets")
    .insert({
      uploaded_by: input.createdBy,
      project_id: input.projectId,
      asset_type: "audio",
      source_type: "generated",
      storage_bucket: BUCKET,
      storage_path: path,
      mime_type: "audio/wav",
      file_size: file.byteLength,
      duration_seconds: Number(((toSample - fromSample) / rate + silenceSeconds).toFixed(3)),
      title:
        `${input.label} · voiceover ${clock(fromSample / rate)}–${clock(toSample / rate)}`.slice(
          0,
          200,
        ),
      // A run's working file: kept out of the library.
      deleted_at: now,
      metadata: {
        derived: true,
        derived_from_asset_id: prepared.id,
        lip_sync_piece: {
          preparation_id: preparation.id,
          from_sample: fromSample,
          to_sample: toSample,
          sample_rate: rate,
          start_seconds: Number((fromSample / rate).toFixed(6)),
          end_seconds: Number((toSample / rate).toFixed(6)),
          silence_seconds: silenceSeconds,
          gain_db: raised.gainDb,
        },
      } as never,
    } as never)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") {
    const { data: raced } = await findPiece();
    const piece = raced ? pieceOf(raced) : null;
    if (piece) return piece;
  }
  if (error || !inserted)
    throw new AppError("UNKNOWN", "The voiceover's piece couldn't be recorded. Try again.");
  return {
    assetId: inserted.id,
    preparationId: preparation.id,
    bucket: BUCKET,
    path,
    fromSample,
    toSample,
    sampleRate: rate,
    seconds,
    silenceSeconds,
    gainDb: raised.gainDb,
  };
}
