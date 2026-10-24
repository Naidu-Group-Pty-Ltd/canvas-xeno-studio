/**
 * Music sources for the Creative Studio library. Server-only: keys stay on
 * the server, and these modules are loaded only inside server functions.
 *
 * - Openverse: Creative Commons music and sound effects, searched with only
 *   the licences that allow commercial use and edits (CC0, public domain,
 *   CC BY).
 * - Eleven Music: AI music made to a brief, and stem separation for
 *   instrumentals.
 *
 * Billable calls report whether a failure is certain; an uncertain one is
 * recorded as such upstream and never retried automatically.
 */
import { unzipSync } from "fflate";
import { fetchPublic } from "../net/public-url.server";
import { SAFE_OPENVERSE_LICENSES, isSafeOpenverseLicense } from "./catalog";
import { planBody, type MusicPlan } from "./plan";
import { PROBED_MIME, probeBytes } from "./probe";
import {
  eleven,
  elevenFailure,
  elevenLabsConfigured,
  timed,
  transportFailure,
  type ProviderFailure,
} from "../voice/providers.server";

/* ------------------------------------------------------------------ */
/* Openverse                                                           */
/* ------------------------------------------------------------------ */

const OPENVERSE = "https://api.openverse.org/v1";

export interface OpenverseTrack {
  id: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  landingUrl: string | null;
  audioUrl: string | null;
  provider: string | null;
  category: string | null;
  genres: string[];
  tags: string[];
  durationSeconds: number | null;
  filetype: string | null;
  attribution: string | null;
  waveformUrl: string | null;
}

interface RawOpenverseAudio {
  id?: string;
  title?: string | null;
  creator?: string | null;
  creator_url?: string | null;
  license?: string;
  license_version?: string | null;
  license_url?: string | null;
  foreign_landing_url?: string | null;
  url?: string | null;
  provider?: string | null;
  source?: string | null;
  category?: string | null;
  genres?: string[] | null;
  tags?: { name?: string }[] | null;
  duration?: number | null;
  filetype?: string | null;
  attribution?: string | null;
  waveform?: string | null;
  mature?: boolean;
}

function toTrack(raw: RawOpenverseAudio): OpenverseTrack | null {
  if (!raw.id || !raw.license || raw.mature) return null;
  return {
    id: raw.id,
    title: (raw.title ?? "").trim() || "Untitled",
    creator: raw.creator?.trim() || null,
    creatorUrl: raw.creator_url ?? null,
    license: raw.license.toLowerCase(),
    licenseVersion: raw.license_version ?? null,
    licenseUrl: raw.license_url ?? null,
    landingUrl: raw.foreign_landing_url ?? null,
    audioUrl: raw.url ?? null,
    provider: raw.source ?? raw.provider ?? null,
    category: raw.category ?? null,
    genres: (raw.genres ?? [])
      .filter((genre): genre is string => typeof genre === "string")
      .slice(0, 8),
    tags: (raw.tags ?? [])
      .map((tag) => tag.name ?? "")
      .filter(Boolean)
      .slice(0, 12),
    durationSeconds: typeof raw.duration === "number" ? Math.round(raw.duration / 100) / 10 : null,
    filetype: raw.filetype ?? null,
    attribution: raw.attribution?.trim() || null,
    waveformUrl: raw.waveform ?? null,
  };
}

let openverseToken: { value: string; expires: number } | null = null;
/** After a failed token request, anonymous access is used for a while before asking again. */
let openverseTokenRetryAt = 0;

/** Registered apps get higher rate limits; anonymous use works without one. */
export function openverseAuthenticated(): boolean {
  return !!(
    process.env["OPENVERSE_CLIENT_ID"]?.trim() && process.env["OPENVERSE_CLIENT_SECRET"]?.trim()
  );
}

async function openverseHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!openverseAuthenticated()) return headers;
  // An expired (or nearly expired) token is never sent: without a fresh one, access is anonymous.
  if (openverseToken && openverseToken.expires < Date.now() + 60_000) openverseToken = null;
  if (!openverseToken && Date.now() >= openverseTokenRetryAt) {
    openverseTokenRetryAt = Date.now() + 5 * 60_000;
    try {
      const response = await timed(
        `${OPENVERSE}/auth_tokens/token/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env["OPENVERSE_CLIENT_ID"]!.trim(),
            client_secret: process.env["OPENVERSE_CLIENT_SECRET"]!.trim(),
          }),
        },
        15_000,
      );
      if (response.ok) {
        const data = (await response.json()) as { access_token?: string; expires_in?: number };
        if (data.access_token) {
          openverseToken = {
            value: data.access_token,
            expires: Date.now() + (data.expires_in ?? 3600) * 1000,
          };
          openverseTokenRetryAt = 0;
        }
      }
    } catch {
      // Fall back to anonymous access.
    }
  }
  if (openverseToken) headers["Authorization"] = `Bearer ${openverseToken.value}`;
  return headers;
}

/** An Openverse GET; a token it refuses is dropped and the request repeated anonymously. */
async function openverseGet(url: string): Promise<Response> {
  const headers = await openverseHeaders();
  const response = await timed(url, { headers }, 20_000);
  if (response.status !== 401 || !headers["Authorization"]) return response;
  openverseToken = null;
  openverseTokenRetryAt = Date.now() + 5 * 60_000;
  return timed(url, { headers: { Accept: "application/json" } }, 20_000);
}

function openverseFailure(status: number): ProviderFailure {
  return {
    ok: false,
    code: status === 429 ? "RATE_LIMITED" : "PROVIDER_REJECTED",
    message:
      status === 429
        ? "Openverse is limiting searches right now. Wait a minute, or add Openverse app credentials for higher limits."
        : `Openverse could not answer (HTTP ${status}).`,
    uncertain: false,
  };
}

export const OPENVERSE_LENGTHS = ["shortest", "short", "medium", "long"] as const;

export async function searchOpenverse(input: {
  query: string;
  kind: "music" | "sound_effect";
  length?: (typeof OPENVERSE_LENGTHS)[number] | undefined;
  page: number;
}): Promise<
  { ok: true; tracks: OpenverseTrack[]; total: number; pages: number } | ProviderFailure
> {
  const params = new URLSearchParams({
    license: SAFE_OPENVERSE_LICENSES.join(","),
    category: input.kind,
    page_size: "20",
    page: String(Math.max(1, input.page)),
    mature: "false",
  });
  if (input.query.trim()) params.set("q", input.query.trim().slice(0, 200));
  if (input.length) params.set("length", input.length);
  let response: Response;
  try {
    response = await openverseGet(`${OPENVERSE}/audio/?${params}`);
  } catch {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "Openverse didn't answer. Try again.",
      uncertain: false,
    };
  }
  if (!response.ok) return openverseFailure(response.status);
  const data = (await response.json()) as {
    result_count?: number;
    page_count?: number;
    results?: RawOpenverseAudio[];
  };
  // Only tracks that can be added: a safe licence, and a file of a type the
  // studio imports on a host it downloads from (catalogueHosts).
  const tracks = (data.results ?? [])
    .map(toTrack)
    .filter(
      (track): track is OpenverseTrack =>
        !!track &&
        isSafeOpenverseLicense(track.license) &&
        importableType(track.filetype) &&
        onCatalogueHost(track.audioUrl),
    );
  return {
    ok: true,
    tracks,
    total: data.result_count ?? tracks.length,
    pages: data.page_count ?? 1,
  };
}

/** The authoritative record for one track (never trust a licence sent by the browser). */
export async function openverseTrack(
  id: string,
): Promise<{ ok: true; track: OpenverseTrack } | ProviderFailure> {
  let response: Response;
  try {
    response = await openverseGet(`${OPENVERSE}/audio/${encodeURIComponent(id)}/`);
  } catch {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "Openverse didn't answer. Try again.",
      uncertain: false,
    };
  }
  if (response.status === 404)
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "That track is no longer on Openverse.",
      uncertain: false,
    };
  if (!response.ok) return openverseFailure(response.status);
  const track = toTrack((await response.json()) as RawOpenverseAudio);
  if (!track)
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "That track can't be used.",
      uncertain: false,
    };
  return { ok: true, track };
}

/**
 * The catalogue's file types the studio imports, by Openverse's `filetype`:
 * those whose audio it checks and keeps (see probe.ts). Others (MIDI, WebM,
 * raw AAC…) aren't offered.
 */
const AUDIO_TYPES = new Map<string, string>([
  ["mp3", "audio/mpeg"],
  ["mp32", "audio/mpeg"],
  ["mpeg", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["ogg", "audio/ogg"],
  ["oga", "audio/ogg"],
  ["ogx", "audio/ogg"],
  ["opus", "audio/ogg"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
]);

/** Whether a catalogue file is of a type the studio imports (one whose type isn't stated is checked on import). */
function importableType(filetype: string | null): boolean {
  return !filetype || AUDIO_TYPES.has(filetype.toLowerCase());
}

export function audioExtension(mime: string): string {
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mp4")) return "m4a";
  return "bin";
}

/**
 * Where catalogue audio is downloaded from: the file hosts of the sources
 * Openverse lists (Jamendo, Freesound, Wikimedia Commons). More can be added
 * with MUSIC_DOWNLOAD_HOSTS (comma-separated domains).
 */
/** Whether a catalogue file is on one of the hosts audio is downloaded from. */
function onCatalogueHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return catalogueHosts().some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function catalogueHosts(): string[] {
  const extra = (process.env["MUSIC_DOWNLOAD_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return ["jamendo.com", "freesound.org", "wikimedia.org", ...extra];
}

/**
 * Downloads an audio file named by a catalogue. Every hop (redirects
 * included) must be https on one of the catalogue's file hosts and resolve to
 * public addresses, and only real audio within the size limit is kept.
 */
export async function downloadAudio(
  url: string,
  hint: string | null,
  maxBytes = 40 * 1024 * 1024,
): Promise<{ ok: true; bytes: Uint8Array; mime: string } | ProviderFailure> {
  let fetched: Awaited<ReturnType<typeof fetchPublic>>;
  try {
    fetched = await fetchPublic(url, {
      signal: AbortSignal.timeout(90_000),
      hosts: catalogueHosts(),
    });
  } catch {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "The track's file couldn't be downloaded. Try again.",
      uncertain: false,
    };
  }
  if (!fetched.ok)
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: `The track's file can't be downloaded safely (${fetched.reason}).`,
      uncertain: false,
    };
  const response = fetched.response;
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: `The track's file couldn't be downloaded (HTTP ${response.status}).`,
      uncertain: false,
    };
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body.cancel().catch(() => undefined);
    return {
      ok: false,
      code: "INVALID_PARAMETERS",
      message: "The track's file is too large to import.",
      uncertain: false,
    };
  }
  const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const mime = type.startsWith("audio/")
    ? type === "audio/mp3"
      ? "audio/mpeg"
      : type
    : type === "application/ogg"
      ? "audio/ogg"
      : (AUDIO_TYPES.get((hint ?? "").toLowerCase()) ?? null);
  const notAudio = {
    ok: false as const,
    code: "INVALID_PARAMETERS",
    message: "The track's file isn't audio.",
    uncertain: false,
  };
  if (!mime) {
    await response.body.cancel().catch(() => undefined);
    return notAudio;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          code: "INVALID_PARAMETERS",
          message: "The track's file is too large to import.",
          uncertain: false,
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "The track's file couldn't be downloaded. Try again.",
      uncertain: false,
    };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Audio by what it holds (its structure), not its first bytes or its label;
  // the type it really is is the one kept.
  const kind = await probeBytes(bytes);
  if (!kind) return notAudio;
  return { ok: true, bytes, mime: PROBED_MIME[kind] };
}

/* ------------------------------------------------------------------ */
/* Eleven Music                                                        */
/* ------------------------------------------------------------------ */

export { elevenLabsConfigured as elevenMusicConfigured };

const MUSIC_TIMEOUT_MS = 300_000;

/**
 * One billable generation: a finished track in MP3, from a prompt or from a
 * composition plan (./plan). A prompt goes with its length and whether it
 * must be instrumental; a plan carries its own lengths, takes neither, and
 * may take a seed, which the API refuses alongside a prompt.
 */
export async function composeMusic(input: {
  prompt: string;
  seconds: number;
  model: string;
  instrumental: boolean;
  plan?: MusicPlan | null;
  seed?: number | null;
}): Promise<
  { ok: true; audio: Uint8Array; mime: string; songId: string | null } | ProviderFailure
> {
  if (!elevenLabsConfigured())
    return {
      ok: false,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "ElevenLabs is not connected. Add ELEVENLABS_API_KEY to the backend secrets.",
      uncertain: false,
    };
  const body: Record<string, unknown> = input.plan
    ? {
        composition_plan: planBody(input.plan),
        model_id: input.model,
        ...(input.seed === null || input.seed === undefined ? {} : { seed: input.seed }),
      }
    : {
        prompt: input.prompt,
        music_length_ms: Math.round(input.seconds * 1000),
        model_id: input.model,
        force_instrumental: input.instrumental,
      };
  let response: Response;
  try {
    response = await eleven(
      "/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      MUSIC_TIMEOUT_MS,
    );
  } catch (error) {
    return transportFailure("ElevenLabs", error);
  }
  // A server error may hide a track that was made (and billed): uncertain.
  if (!response.ok)
    return elevenFailure(response.status, await response.text().catch(() => ""), true);
  let audio: Uint8Array | null;
  try {
    audio = await readUpTo(response, MAX_ANSWER_BYTES);
  } catch (error) {
    // The track was made (and billed) but didn't arrive in full.
    return transportFailure("ElevenLabs", error);
  }
  if (audio === null) return acceptedButUnusable("more audio than the studio keeps");
  if (!audio.length) return acceptedButUnusable("no audio");
  if ((await probeBytes(audio, ["mp3"])) !== "mp3")
    return acceptedButUnusable("something other than audio");
  return { ok: true, audio, mime: "audio/mpeg", songId: response.headers.get("song-id") };
}

/** Splits a track into vocals and the instrumental (one billable call). */
export async function separateInstrumental(input: {
  /** The original as stored (sent as it is, not copied). */
  audio: Blob;
  mime: string;
  filename: string;
}): Promise<{ ok: true; instrumental: Uint8Array; mime: string } | ProviderFailure> {
  if (!elevenLabsConfigured())
    return {
      ok: false,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "ElevenLabs is not connected. Add ELEVENLABS_API_KEY to the backend secrets.",
      uncertain: false,
    };
  const form = new FormData();
  form.append("file", input.audio, input.filename);
  form.append("stem_variation_id", "two_stems_v1");
  let response: Response;
  try {
    response = await eleven(
      "/v1/music/stem-separation?output_format=mp3_44100_128",
      { method: "POST", body: form },
      MUSIC_TIMEOUT_MS,
    );
  } catch (error) {
    return transportFailure("ElevenLabs", error);
  }
  // A server error may hide a split that was made (and billed): uncertain.
  if (!response.ok)
    return elevenFailure(response.status, await response.text().catch(() => ""), true);
  // The stems' archive is read up to a size, and only the instrumental is
  // taken out of it, if it is of a size the studio keeps, so a long original
  // can't fill the server's memory with stems.
  let archive: Uint8Array | null;
  try {
    archive = await readUpTo(response, MAX_ANSWER_BYTES);
  } catch (error) {
    return transportFailure("ElevenLabs", error);
  }
  if (archive === null) return acceptedButUnusable("stems larger than the studio keeps");
  const stems: { name: string; size: number }[] = [];
  let instrumental: Uint8Array | undefined;
  try {
    // Listed first, with nothing inflated.
    unzipSync(archive, {
      filter: (file) => {
        if (!file.name.endsWith("/") && file.originalSize > 0)
          stems.push({ name: file.name, size: file.originalSize });
        return false;
      },
    });
    const names = stems.map((stem) => stem.name);
    const chosen =
      names.find((name) => /instrumental|accompaniment|no[_ -]?vocals|music/i.test(name)) ??
      (names.length === 2 ? names.find((name) => !/vocal/i.test(name)) : undefined);
    if (!chosen) return acceptedButUnusable("no instrumental stem");
    if ((stems.find((stem) => stem.name === chosen)?.size ?? 0) > MAX_STEM_BYTES)
      return acceptedButUnusable("an instrumental stem larger than the studio keeps");
    instrumental = unzipSync(archive, { filter: (file) => file.name === chosen })[chosen];
  } catch (error) {
    return transportFailure("ElevenLabs", error);
  }
  if (!instrumental || (await probeBytes(instrumental, ["mp3"])) !== "mp3")
    return acceptedButUnusable("an instrumental stem that isn't audio");
  return { ok: true, instrumental, mime: "audio/mpeg" };
}

/**
 * The most read of an answer from Eleven Music: ten minutes of music (the
 * longest the studio makes or splits), or its two stems, at 128 kbps come to
 * under 20 MB.
 */
const MAX_ANSWER_BYTES = 32 * 1024 * 1024;
/** The largest instrumental stem taken out of the stems' archive. */
const MAX_STEM_BYTES = 16 * 1024 * 1024;

/** An answer's body, read up to `limit` bytes; null when it is larger (the rest isn't read). */
async function readUpTo(response: Response, limit: number): Promise<Uint8Array | null> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Music made (and billed) whose answer can't be used is uncertain, never a
 * plain failure, so nothing is made again without the person deciding to.
 */
function acceptedButUnusable(what: string): ProviderFailure {
  return {
    ok: false,
    code: "SUBMISSION_UNCERTAIN",
    message: `ElevenLabs accepted the request but sent ${what}. It may still have been billed, so it was not retried automatically.`,
    uncertain: true,
  };
}
