/**
 * HeyGen provider (server-only). Every request shape here follows HeyGen's
 * published v3 OpenAPI contract (developers.heygen.com/openapi/external-api.json).
 * HEYGEN_API_KEY is read per call and never leaves this module.
 */
import type { AvatarErrorCode } from "../lib/errors";

const HEYGEN_BASE = "https://api.heygen.com";
const DEFAULT_TIMEOUT_MS = 45_000;

export type AssetRef = { type: "url"; url: string } | { type: "asset_id"; asset_id: string };

export interface HeyGenResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorCode?: AvatarErrorCode;
  errorMessage?: string;
  providerCode?: string;
  param?: string;
  /** True when a mutating request may have reached HeyGen but we never saw the answer. */
  uncertain?: boolean;
}

export function heygenConfigured(): boolean {
  return !!process.env["HEYGEN_API_KEY"];
}

function classify(status: number, providerCode?: string): AvatarErrorCode {
  const code = (providerCode ?? "").toLowerCase();
  if (code.includes("insufficient_credit") || code.includes("insufficient")) return "INSUFFICIENT_CREDIT";
  if (code.includes("resource_limit") || code.includes("voice_capacity")) return "VOICE_SLOT_UNAVAILABLE";
  if (code.includes("moderation") || code.includes("avatar_unavailable")) return "MODERATION_BLOCKED";
  if (status === 401 || status === 403) return code.includes("credit") ? "INSUFFICIENT_CREDIT" : "HEYGEN_NOT_CONFIGURED";
  if (status === 402) return "INSUFFICIENT_CREDIT";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  if (status === 400 || status === 422) return "INVALID_PARAMETERS";
  return "PROVIDER_REJECTED";
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; query?: Record<string, string | number | undefined>; timeoutMs?: number } = {},
): Promise<HeyGenResult<T>> {
  const key = process.env["HEYGEN_API_KEY"];
  if (!key) return { ok: false, status: 0, errorCode: "HEYGEN_NOT_CONFIGURED" };
  const url = new URL(HEYGEN_BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  const headers: Record<string, string> = { "X-Api-Key": key, Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const mutating = method !== "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      errorCode: mutating ? "SUBMISSION_UNCERTAIN" : "PROVIDER_UNAVAILABLE",
      errorMessage: e instanceof Error && e.name === "AbortError" ? "HeyGen did not respond in time" : "Network error reaching HeyGen",
      uncertain: mutating,
    };
  }
  clearTimeout(timer);

  let json: unknown = null;
  const text = await res.text().catch(() => "");
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const obj = (json ?? {}) as { data?: T; error?: { code?: string; message?: string; param?: string } | string; message?: string };

  if (res.ok) return { ok: true, status: res.status, data: (obj.data ?? (json as T)) as T };

  const err: { code?: string; message?: string; param?: string } = typeof obj.error === "object" && obj.error ? obj.error : { message: typeof obj.error === "string" ? obj.error : obj.message };
  const result: HeyGenResult<T> = {
    ok: false,
    status: res.status,
    errorCode: classify(res.status, err.code),
    errorMessage: (err.message ?? `HeyGen returned ${res.status}`).slice(0, 500),
  };
  if (err.code) result.providerCode = err.code;
  if (err.param) result.param = err.param;
  // A 5xx on a mutating call is ambiguous: the provider may have accepted the work.
  if (mutating && res.status >= 500) {
    result.uncertain = true;
    result.errorCode = "SUBMISSION_UNCERTAIN";
  }
  return result;
}

// ---------- typed resources (subset of fields we persist) ----------
export interface HGUser {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  billing_type?: "wallet" | "subscription" | "usage_based" | null;
  wallet?: { currency: "usd" | "credits"; remaining_balance?: number | null } | null;
  subscription?: { plan: string; credits: { premium_credits?: { remaining?: number | null } | null; add_on_credits?: { remaining?: number | null } | null } } | null;
  usage_based?: { spending_current_usd?: number | null; spending_cap_usd?: number | null; remaining_credits?: number | null } | null;
}
export interface HGGroup {
  id: string;
  name: string;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  looks_count: number;
  default_voice_id?: string | null;
  consent_status?: string | null;
  status?: "processing" | "pending_consent" | "failed" | "completed" | null;
  error?: { code: string; message: string } | null;
  created_at?: number;
}
export interface HGLook {
  id: string;
  name: string;
  avatar_type: "studio_avatar" | "digital_twin" | "photo_avatar";
  group_id?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  default_voice_id?: string | null;
  supported_api_engines?: string[];
  preferred_orientation?: string | null;
  status?: "processing" | "pending_consent" | "failed" | "completed" | null;
  error?: { code: string; message: string } | null;
}
export interface HGVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio_url?: string | null;
  support_pause: boolean;
  type: "public" | "private";
  default_engine?: string | null;
}
export interface HGVideo {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url?: string | null;
  thumbnail_url?: string | null;
  captioned_video_url?: string | null;
  subtitle_url?: string | null;
  duration?: number | null;
  failure_code?: string | null;
  failure_message?: string | null;
}
export interface HGLocalization {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  video_url?: string | null;
  audio_url?: string | null;
  srt_caption_url?: string | null;
  caption_url?: string | null;
  output_language?: string | null;
  duration?: number | null;
  failure_message?: string | null;
}
interface Page<T> {
  data: T[];
  has_more?: boolean;
  next_token?: string | null;
}

async function paged<T>(path: string, query: Record<string, string | number | undefined>, max: number): Promise<HeyGenResult<T[]>> {
  const out: T[] = [];
  let token: string | undefined;
  for (let i = 0; i < 50 && out.length < max; i++) {
    const r = await rawGet<Page<T>>(path, { ...query, limit: 100, token });
    if (!r.ok) return { ...r, data: out } as HeyGenResult<T[]>;
    const page = r.data!;
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.next_token) break;
    token = page.next_token;
  }
  return { ok: true, status: 200, data: out.slice(0, max) };
}

/** List endpoints return {data, has_more, next_token} at top level, so keep the envelope. */
async function rawGet<T>(path: string, query: Record<string, string | number | undefined>): Promise<HeyGenResult<T>> {
  const key = process.env["HEYGEN_API_KEY"];
  if (!key) return { ok: false, status: 0, errorCode: "HEYGEN_NOT_CONFIGURED" };
  const url = new URL(HEYGEN_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
    if (!res.ok) return { ok: false, status: res.status, errorCode: classify(res.status, json.error?.code), errorMessage: json.error?.message ?? `HeyGen returned ${res.status}` };
    return { ok: true, status: res.status, data: json };
  } catch {
    return { ok: false, status: 0, errorCode: "PROVIDER_UNAVAILABLE", errorMessage: "Network error reaching HeyGen" };
  }
}

/** AvatarProvider implementation for HeyGen. */
export const HeyGenProvider = {
  getCurrentUser: () => request<HGUser>("GET", "/v3/users/me", { timeoutMs: 15_000 }),

  // avatars
  createAvatar: (body: Record<string, unknown>, idempotencyKey: string) =>
    request<{ avatar_item?: HGLook | null; avatar_group?: HGGroup | null }>("POST", "/v3/avatars", { body, idempotencyKey }),
  listAvatarGroups: (ownership: "public" | "private", max = 500) => paged<HGGroup>("/v3/avatars", { ownership }, max),
  getAvatarGroup: (groupId: string) => request<HGGroup>("GET", `/v3/avatars/${encodeURIComponent(groupId)}`),
  deleteAvatarGroup: (groupId: string) => request<unknown>("DELETE", `/v3/avatars/${encodeURIComponent(groupId)}`),
  listAvatarLooks: (q: { group_id?: string; ownership?: "public" | "private" }, max = 1000) => paged<HGLook>("/v3/avatars/looks", q, max),
  getAvatarLook: (lookId: string) => request<HGLook>("GET", `/v3/avatars/looks/${encodeURIComponent(lookId)}`),
  renameAvatarLook: (lookId: string, name: string) => request<HGLook>("PATCH", `/v3/avatars/looks/${encodeURIComponent(lookId)}`, { body: { name } }),
  deleteAvatarLook: (lookId: string) => request<unknown>("DELETE", `/v3/avatars/looks/${encodeURIComponent(lookId)}`),
  createAvatarLooks: (body: { type: "look_pack" | "template"; reference_look_id: string; template_id: string; aspect_ratio?: string }, idempotencyKey: string) =>
    request<{ group_id: string; looks: { id: string }[] }>("POST", "/v3/avatars/looks", { body, idempotencyKey }),
  listLookTemplates: (type?: "look_pack" | "template") =>
    paged<{ id: string; type: "look_pack" | "template"; name?: string | null; preview_image_url?: string | null; looks_count: number }>(
      "/v3/avatars/look-templates",
      { type },
      200,
    ),
  createConsent: (groupId: string, idempotencyKey: string, rerouteUrl?: string) =>
    request<{ avatar_group: HGGroup; url?: string | null }>("POST", `/v3/avatars/${encodeURIComponent(groupId)}/consent`, {
      body: rerouteUrl ? { reroute_url: rerouteUrl } : {},
      idempotencyKey,
    }),

  // voices
  listVoices: (type: "public" | "private", max = 500, language?: string) => paged<HGVoice>("/v3/voices", { type, language }, max),
  getVoice: (voiceId: string) =>
    request<{ voice_id: string; name?: string; language?: string; gender?: string; preview_audio_url?: string | null; status?: "processing" | "complete" | "failed"; failure_message?: string | null; support_pause: boolean }>(
      "GET",
      `/v3/voices/${encodeURIComponent(voiceId)}`,
    ),
  designVoice: (body: { prompt: string; gender?: string; locale?: string; seed?: number }) =>
    request<{ voices: HGVoice[]; seed: number }>("POST", "/v3/voices", { body }),
  cloneInstantVoice: (body: { audio: AssetRef; voice_name: string; language?: string; remove_background_noise?: boolean }) =>
    request<{ voice_clone_id: string }>("POST", "/v3/voices/clone", { body, timeoutMs: 120_000 }),
  trainProfessionalVoice: (body: { mode?: "professional"; voice_id?: string; name?: string; language?: string; audio: AssetRef[] }, idempotencyKey: string) =>
    request<{ voice_id: string; status?: string }>("POST", "/v3/models/audio/voices", { body, idempotencyKey, timeoutMs: 120_000 }),
  getProfessionalVoice: (voiceId: string) =>
    request<{ voice_id: string; name: string; language: string; status: "PENDING" | "ACTIVE" | "FAILED"; failure_reason?: string | null }>(
      "GET",
      `/v3/models/audio/voices/${encodeURIComponent(voiceId)}`,
    ),
  generateSpeech: (body: { text: string; voice_id: string; input_type?: "text" | "ssml"; speed?: number; language?: string; locale?: string }) =>
    request<{ audio_url: string; duration: number; request_id?: string | null }>("POST", "/v3/voices/speech", { body, timeoutMs: 90_000 }),
  generateProfessionalSpeech: (body: { voice_id: string; text: string; language: string; speed?: number; pitch_shift?: number }) =>
    request<{ audio_url: string; duration: number }>("POST", "/v3/models/audio/tts", { body, timeoutMs: 90_000 }),
  /** Raw streaming response for the authenticated proxy route. */
  streamProfessionalSpeech: async (body: { voice_id: string; text: string; language: string; speed?: number }, signal: AbortSignal) => {
    const key = process.env["HEYGEN_API_KEY"];
    if (!key) return null;
    return fetch(`${HEYGEN_BASE}/v3/models/audio/tts/stream`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  },

  // videos
  createVideo: (body: Record<string, unknown>, idempotencyKey: string) =>
    request<{ video_id: string; status?: string }>("POST", "/v3/videos", { body, idempotencyKey }),
  getVideo: (videoId: string) => request<HGVideo>("GET", `/v3/videos/${encodeURIComponent(videoId)}`),
  getVideoStatuses: (videoIds: string[]) =>
    rawGet<{ data: { video_id?: string | null; status: string; error?: { code?: string; message?: string } | null }[] }>("/v3/videos/statuses", {
      video_ids: videoIds.join(","),
    }),
  deleteVideo: (videoId: string) => request<unknown>("DELETE", `/v3/videos/${encodeURIComponent(videoId)}`),

  // localization
  listTranslationLanguages: () => request<{ languages: string[] }>("GET", "/v3/video-translations/languages"),
  createTranslation: (body: Record<string, unknown>, idempotencyKey: string) =>
    request<{ video_translation_ids: string[] }>("POST", "/v3/video-translations", { body, idempotencyKey }),
  getTranslation: (id: string) => request<HGLocalization>("GET", `/v3/video-translations/${encodeURIComponent(id)}`),
  createLipsync: (body: Record<string, unknown>, idempotencyKey: string) =>
    request<{ lipsync_id: string }>("POST", "/v3/lipsyncs", { body, idempotencyKey }),
  getLipsync: (id: string) => request<HGLocalization>("GET", `/v3/lipsyncs/${encodeURIComponent(id)}`),

  // webhooks
  registerWebhook: (url: string, events: string[]) =>
    request<{ endpoint_id: string; url: string; status: string; secret?: string | null }>("POST", "/v3/webhooks/endpoints", { body: { url, events } }),
  deleteWebhook: (endpointId: string) => request<unknown>("DELETE", `/v3/webhooks/endpoints/${encodeURIComponent(endpointId)}`),
};

export const WEBHOOK_EVENTS = [
  "avatar_video.success",
  "avatar_video.fail",
  "video_translate.success",
  "video_translate.fail",
  "instant_avatar.success",
  "instant_avatar.fail",
  "photo_avatar_generation.success",
  "photo_avatar_generation.fail",
  "photo_avatar_train.success",
  "photo_avatar_train.fail",
];

/** HeyGen signs the raw body with HMAC-SHA256 (hex) in the `signature` header. */
export async function verifyHeyGenSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
