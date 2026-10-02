/**
 * Avatar Studio job service (server-only). Owns the avatar_jobs lifecycle:
 * create → atomic submission claim → provider acceptance / uncertainty →
 * webhook or reconcile → ingestion into avatar-generated storage → assets.
 * Nothing here touches Creative Studio tables except the explicit bridge.
 */
import { HeyGenProvider, type HeyGenResult, type HGLook, type HGGroup, type AssetRef } from "./heygen.server";
import { AvatarError, type AvatarErrorCode } from "../lib/errors";

export const TERMINAL = ["completed", "failed", "canceled", "blocked"] as const;
export const POLLABLE = ["provider_pending", "provider_processing", "awaiting_consent", "ingest_failed"] as const;
const OUTPUT_BUCKET = "avatar-generated";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type JobRow = {
  id: string;
  job_type: string;
  status: string;
  project_id: string | null;
  created_by: string | null;
  provider_request_id: string | null;
  provider_resource_type: string | null;
  idempotency_key: string | null;
  input_payload: Record<string, unknown>;
  normalized_input: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  poll_attempts: number;
};

export async function logJobEvent(jobId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("avatar_job_events").insert({ job_id: jobId, event_type: eventType, payload: payload as never });
}

export async function audit(actorId: string | null, action: string, subjectType: string | null, subjectId: string | null, details: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("avatar_identity_audit").insert({ actor_id: actorId, action, subject_type: subjectType, subject_id: subjectId, details: details as never });
}

export async function recordProviderHealth(ok: boolean, message?: string) {
  const db = await admin();
  const now = new Date().toISOString();
  if (ok) await db.from("avatar_settings").upsert({ key: "provider_last_success_at", value: now as never, updated_at: now });
  else await db.from("avatar_settings").upsert({ key: "provider_last_error", value: { at: now, message: message ?? "unknown" } as never, updated_at: now });
}

export async function getAvatarSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await admin();
  const { data } = await db.from("avatar_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function flagEnabled(key: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  return !!data?.enabled;
}

export async function requireFlags(...keys: string[]) {
  for (const k of ["avatar_studio_enabled", ...keys]) {
    if (!(await flagEnabled(k))) throw new AvatarError("FEATURE_DISABLED");
  }
}

export async function requireActiveMember(userId: string) {
  const db = await admin();
  const { data } = await db.from("profiles").select("id,is_active,role").eq("id", userId).maybeSingle();
  if (!data?.is_active) throw new AvatarError("NOT_AUTHORIZED", "Your account is not an active team member");
  return data as { id: string; is_active: boolean; role: "admin" | "member" };
}

/** Short-lived signed URL for an internal asset so HeyGen can fetch it. Training media is never made public. */
export async function providerUrlForAsset(assetId: string, ttlSeconds = 2 * 60 * 60): Promise<{ ref: AssetRef; asset: Record<string, unknown> }> {
  const db = await admin();
  const { data: asset } = await db.from("avatar_assets").select("*").eq("id", assetId).is("deleted_at", null).maybeSingle();
  if (!asset) throw new AvatarError("INVALID_PARAMETERS", "A selected file no longer exists");
  const { data, error } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, ttlSeconds);
  if (error || !data?.signedUrl) throw new AvatarError("INVALID_PARAMETERS", "A selected file could not be prepared for HeyGen");
  return { ref: { type: "url", url: data.signedUrl }, asset };
}

export async function createJob(input: {
  jobType: string;
  userId: string;
  projectId?: string | null;
  inputPayload: Record<string, unknown>;
  normalizedInput?: Record<string, unknown>;
  clientRequestId?: string | null;
  providerResourceType?: string;
  parentJobId?: string | null;
}): Promise<{ job: JobRow; existing: boolean }> {
  const db = await admin();
  if (input.clientRequestId) {
    const { data: prior } = await db.from("avatar_jobs").select("*").eq("client_request_id", input.clientRequestId).maybeSingle();
    if (prior) return { job: prior as unknown as JobRow, existing: true };
  }
  const { data, error } = await db
    .from("avatar_jobs")
    .insert({
      job_type: input.jobType,
      created_by: input.userId,
      project_id: input.projectId ?? null,
      input_payload: input.inputPayload as never,
      normalized_input: (input.normalizedInput ?? {}) as never,
      client_request_id: input.clientRequestId ?? null,
      idempotency_key: crypto.randomUUID(),
      provider_resource_type: input.providerResourceType ?? null,
      parent_job_id: input.parentJobId ?? null,
      status: "local_queued",
      queued_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505" && input.clientRequestId) {
      const { data: raced } = await db.from("avatar_jobs").select("*").eq("client_request_id", input.clientRequestId).maybeSingle();
      if (raced) return { job: raced as unknown as JobRow, existing: true };
    }
    throw new AvatarError("UNKNOWN", "Could not record the job");
  }
  await logJobEvent(data.id, "created", { job_type: input.jobType });
  return { job: data as unknown as JobRow, existing: false };
}

/**
 * Submit exactly once. The job is atomically claimed (local_queued → submitting); a
 * second caller gets zero rows and stops. Ambiguous outcomes become
 * submission_uncertain and are never retried automatically.
 */
export async function submitOnce<T>(
  job: JobRow,
  call: (idempotencyKey: string) => Promise<HeyGenResult<T>>,
  onAccepted: (data: T) => Promise<{ providerRequestId?: string | null; status?: string; output?: Record<string, unknown> }>,
): Promise<{ ok: boolean; status: string; errorCode?: AvatarErrorCode; errorMessage?: string }> {
  const db = await admin();
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("avatar_jobs")
    .update({ status: "submitting", submission_state: "submitting", submission_started_at: now, attempt: 1 })
    .eq("id", job.id)
    .in("status", ["local_queued", "draft", "preparing"])
    .select("id");
  if (!claimed?.length) return { ok: false, status: "already_submitted", errorMessage: "This job was already submitted." };
  await logJobEvent(job.id, "submitted", { idempotency_key_present: true });

  const res = await call(job.idempotency_key!);
  if (res.ok && res.data !== undefined) {
    await recordProviderHealth(true);
    const accepted = await onAccepted(res.data);
    const status = accepted.status ?? "provider_processing";
    await db
      .from("avatar_jobs")
      .update({
        status,
        submission_state: "accepted",
        submitted_at: new Date().toISOString(),
        provider_request_id: accepted.providerRequestId ?? null,
        provider_payload: res.data as never,
        output_payload: (accepted.output ?? null) as never,
      })
      .eq("id", job.id);
    await logJobEvent(job.id, "provider_accepted", { provider_request_id: accepted.providerRequestId ?? null, status });
    return { ok: true, status };
  }

  await recordProviderHealth(false, res.errorMessage);
  if (res.uncertain) {
    await db
      .from("avatar_jobs")
      .update({ status: "submission_uncertain", submission_state: "uncertain", error_code: "SUBMISSION_UNCERTAIN", error_message: res.errorMessage ?? null })
      .eq("id", job.id);
    await logJobEvent(job.id, "submission_uncertain", { http_status: res.status, message: res.errorMessage ?? null });
    return { ok: false, status: "submission_uncertain", errorCode: "SUBMISSION_UNCERTAIN", errorMessage: res.errorMessage ?? "" };
  }
  const blocked = res.errorCode === "INSUFFICIENT_CREDIT" || res.errorCode === "VOICE_SLOT_UNAVAILABLE" || res.errorCode === "HEYGEN_NOT_CONFIGURED";
  const status = blocked ? "blocked" : "failed";
  await db
    .from("avatar_jobs")
    .update({
      status,
      submission_state: "rejected",
      error_code: res.errorCode ?? "PROVIDER_REJECTED",
      error_message: [res.errorMessage, res.param ? `(field: ${res.param})` : ""].filter(Boolean).join(" ") || null,
      failed_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  await logJobEvent(job.id, "failed", { http_status: res.status, provider_code: res.providerCode ?? null, message: res.errorMessage ?? null, param: res.param ?? null });
  return { ok: false, status, errorCode: res.errorCode ?? "PROVIDER_REJECTED", errorMessage: res.errorMessage ?? "" };
}

async function finishJob(jobId: string, status: "completed" | "failed" | "ingest_failed" | "awaiting_consent" | "provider_processing", patch: Record<string, unknown> = {}) {
  const db = await admin();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status, ...patch };
  if (status === "completed") update["completed_at"] = now;
  if (status === "failed") update["failed_at"] = now;
  // never move a terminal job backwards
  await db.from("avatar_jobs").update(update as never).eq("id", jobId).not("status", "in", "(completed,failed,canceled,blocked)");
}

// ---------------- avatars / looks ----------------
const LOOK_TYPE_MAP: Record<string, string> = { digital_twin: "digital_twin", photo_avatar: "photo", studio_avatar: "studio" };

export async function upsertGroup(group: HGGroup, opts: { ownership: "owned" | "provider_public"; avatarType?: string; userId?: string | null; projectId?: string | null }) {
  const db = await admin();
  const { data: existing } = await db.from("avatar_characters").select("id,avatar_type").eq("provider", "heygen").eq("provider_group_id", group.id).maybeSingle();
  const patch = {
    display_name: group.name,
    preview_url: group.preview_image_url ?? null,
    provider_training_status: group.status ?? null,
    provider_consent_status: group.consent_status ?? group.status ?? null,
    provider_payload: group as never,
    ownership_type: opts.ownership,
  };
  if (existing) {
    // keep local metadata (description, project, type) — never wipe on sync
    await db.from("avatar_characters").update(patch).eq("id", existing.id);
    return existing.id as string;
  }
  const { data } = await db
    .from("avatar_characters")
    .insert({
      ...patch,
      provider: "heygen",
      provider_group_id: group.id,
      avatar_type: opts.avatarType ?? (opts.ownership === "provider_public" ? "public" : "other"),
      created_by: opts.userId ?? null,
      project_id: opts.projectId ?? null,
    })
    .select("id")
    .single();
  return data!.id as string;
}

export async function upsertLook(look: HGLook, characterId: string) {
  const db = await admin();
  const row = {
    character_id: characterId,
    provider_look_id: look.id,
    display_name: look.name,
    avatar_type: look.avatar_type,
    preview_url: look.preview_image_url ?? null,
    preview_video_url: look.preview_video_url ?? null,
    orientation: look.preferred_orientation ?? null,
    training_status: look.status ?? null,
    supported_engines: (look.supported_api_engines ?? []) as never,
    default_provider_voice_id: look.default_voice_id ?? null,
    provider_payload: look as never,
    deleted_at: null,
  };
  const { data } = await db.from("avatar_looks").upsert(row, { onConflict: "provider_look_id" }).select("id").single();
  if (look.default_voice_id) await syncDigitalTwinVoice(look, characterId);
  return data?.id as string | undefined;
}

/** A Digital Twin's auto voice is recorded once, keyed by provider voice id. */
async function syncDigitalTwinVoice(look: HGLook, characterId: string) {
  if (look.avatar_type !== "digital_twin" || !look.default_voice_id) return;
  const db = await admin();
  const { data: existing } = await db.from("avatar_voices").select("id").eq("provider", "heygen").eq("provider_voice_id", look.default_voice_id).maybeSingle();
  let voiceId = existing?.id as string | undefined;
  if (!voiceId) {
    const { data } = await db
      .from("avatar_voices")
      .insert({
        provider: "heygen",
        provider_voice_id: look.default_voice_id,
        display_name: `${look.name} (twin voice)`,
        voice_type: "digital_twin_auto",
        character_id: characterId,
        is_owned: true,
        is_default_for_character: true,
        status: "ready",
      })
      .select("id")
      .single();
    voiceId = data?.id;
  }
  if (voiceId) await db.from("avatar_characters").update({ default_voice_id: voiceId }).eq("id", characterId).is("default_voice_id", null);
}

export async function refreshCharacterFromProvider(characterId: string) {
  const db = await admin();
  const { data: ch } = await db.from("avatar_characters").select("*").eq("id", characterId).maybeSingle();
  if (!ch?.provider_group_id) return;
  const g = await HeyGenProvider.getAvatarGroup(ch.provider_group_id);
  if (g.ok && g.data) await upsertGroup(g.data, { ownership: ch.ownership_type as "owned" });
  const looks = await HeyGenProvider.listAvatarLooks({ group_id: ch.provider_group_id }, 200);
  for (const l of looks.data ?? []) await upsertLook(l, characterId);
}

// ---------------- resource sync ----------------
export async function syncResources(userId: string | null, includePublic: boolean) {
  const db = await admin();
  const { data: run } = await db.from("avatar_resource_sync").insert({ resource_type: includePublic ? "all" : "owned", started_by: userId }).select("id").single();
  const counts = { groups: 0, looks: 0, voices: 0, public_looks: 0 };
  try {
    const groups = await HeyGenProvider.listAvatarGroups("private", 500);
    if (!groups.ok) throw new AvatarError(groups.errorCode ?? "PROVIDER_UNAVAILABLE", groups.errorMessage);
    const groupMap = new Map<string, string>();
    for (const g of groups.data ?? []) {
      groupMap.set(g.id, await upsertGroup(g, { ownership: "owned" }));
      counts.groups++;
    }
    const looks = await HeyGenProvider.listAvatarLooks({ ownership: "private" }, 2000);
    for (const l of looks.data ?? []) {
      let cid = l.group_id ? groupMap.get(l.group_id) : undefined;
      if (!cid && l.group_id) cid = await upsertGroup({ id: l.group_id, name: l.name, looks_count: 1 } as HGGroup, { ownership: "owned" });
      if (!cid) continue;
      await upsertLook(l, cid);
      const mapped = LOOK_TYPE_MAP[l.avatar_type];
      if (mapped) await db.from("avatar_characters").update({ avatar_type: mapped }).eq("id", cid).eq("avatar_type", "other");
      counts.looks++;
    }
    const voices = await HeyGenProvider.listVoices("private", 500);
    for (const v of voices.data ?? []) {
      await db.from("avatar_voices").upsert(
        {
          provider: "heygen",
          provider_voice_id: v.voice_id,
          display_name: v.name,
          voice_type: "instant_clone",
          language: v.language,
          gender_metadata: v.gender,
          preview_url: v.preview_audio_url ?? null,
          supports_pause: v.support_pause,
          engine: v.default_engine ?? null,
          is_owned: true,
          status: "ready",
          provider_payload: v as never,
        },
        { onConflict: "provider,provider_voice_id", ignoreDuplicates: true },
      );
      counts.voices++;
    }
    const pub = await HeyGenProvider.listVoices("public", 400);
    for (const v of pub.data ?? []) {
      await db.from("avatar_voices").upsert(
        {
          provider: "heygen",
          provider_voice_id: v.voice_id,
          display_name: v.name,
          voice_type: "stock",
          language: v.language,
          gender_metadata: v.gender,
          preview_url: v.preview_audio_url ?? null,
          supports_pause: v.support_pause,
          engine: v.default_engine ?? null,
          is_owned: false,
          status: "ready",
          provider_payload: v as never,
        },
        { onConflict: "provider,provider_voice_id" },
      );
      counts.voices++;
    }
    if (includePublic) {
      const pubLooks = await HeyGenProvider.listAvatarLooks({ ownership: "public" }, 400);
      for (const l of pubLooks.data ?? []) {
        if (!l.group_id) continue;
        const cid = await upsertGroup({ id: l.group_id, name: l.name, looks_count: 1, preview_image_url: l.preview_image_url } as HGGroup, {
          ownership: "provider_public",
          avatarType: "public",
        });
        await upsertLook(l, cid);
        counts.public_looks++;
      }
    }
    await recordProviderHealth(true);
    await db.from("avatar_resource_sync").update({ status: "completed", counts: counts as never, completed_at: new Date().toISOString() }).eq("id", run!.id);
    return counts;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await recordProviderHealth(false, message);
    await db.from("avatar_resource_sync").update({ status: "failed", error_message: message, counts: counts as never, completed_at: new Date().toISOString() }).eq("id", run!.id);
    throw e;
  }
}

// ---------------- ingestion ----------------
async function storeRemote(url: string, path: string, fallbackMime: string): Promise<{ path: string; size: number; mime: string }> {
  const { assertProviderMediaUrl } = await import("./url-safety.server");
  assertProviderMediaUrl(url);
  const db = await admin();
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0] || fallbackMime;
  const buf = new Uint8Array(await res.arrayBuffer());
  const up = await db.storage.from(OUTPUT_BUCKET).upload(path, buf, { contentType: mime, upsert: true });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);
  return { path, size: buf.byteLength, mime };
}

async function ensureAsset(row: {
  path: string;
  size: number;
  mime: string;
  asset_type: "video" | "audio" | "image" | "document";
  asset_role: string;
  title: string;
  project_id: string | null;
  uploaded_by: string | null;
  duration?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const db = await admin();
  const { data: existing } = await db.from("avatar_assets").select("id").eq("storage_bucket", OUTPUT_BUCKET).eq("storage_path", row.path).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("avatar_assets")
    .insert({
      storage_bucket: OUTPUT_BUCKET,
      storage_path: row.path,
      file_size: row.size,
      mime_type: row.mime,
      asset_type: row.asset_type,
      asset_role: row.asset_role,
      source_type: "heygen",
      title: row.title,
      project_id: row.project_id,
      uploaded_by: row.uploaded_by,
      duration_seconds: row.duration ?? null,
      metadata: (row.metadata ?? {}) as never,
    })
    .select("id")
    .single();
  if (error) {
    const { data: raced } = await db.from("avatar_assets").select("id").eq("storage_bucket", OUTPUT_BUCKET).eq("storage_path", row.path).maybeSingle();
    if (raced) return raced.id as string;
    throw new Error(error.message);
  }
  return data.id as string;
}

async function link(source: string | null | undefined, target: string, relationship: string) {
  if (!source) return;
  const db = await admin();
  await db.from("avatar_asset_relationships").upsert({ source_asset_id: source, target_asset_id: target, relationship }, { onConflict: "source_asset_id,target_asset_id,relationship", ignoreDuplicates: true });
}

export async function ingestVideoJob(jobId: string) {
  const db = await admin();
  const { data: job } = await db.from("avatar_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job?.provider_request_id || job.status === "completed") return;
  const { data: claim } = await db.from("avatar_jobs").update({ status: "ingesting" }).eq("id", jobId).in("status", ["provider_processing", "provider_pending", "ingest_failed"]).select("id");
  if (!claim?.length) return; // another worker is ingesting / done
  await logJobEvent(jobId, "output_ingesting");
  try {
    const v = await HeyGenProvider.getVideo(job.provider_request_id);
    if (!v.ok || !v.data?.video_url) throw new Error(v.errorMessage ?? "Video URL not available yet");
    const scope = job.project_id ? `projects/${job.project_id}` : `unassigned/${job.created_by}`;
    const input = job.input_payload as Record<string, unknown>;
    const transparent = job.job_type === "transparent_avatar_video" || (job.normalized_input as Record<string, unknown>)["output_format"] === "webm";
    const ext = transparent ? "webm" : "mp4";
    const stored = await storeRemote(v.data.video_url, `${scope}/videos/${jobId}/video.${ext}`, transparent ? "video/webm" : "video/mp4");
    const assetId = await ensureAsset({
      ...stored,
      asset_type: "video",
      asset_role: "generated_video",
      title: (input["title"] as string) || "Avatar video",
      project_id: job.project_id,
      uploaded_by: job.created_by,
      duration: v.data.duration ?? null,
      metadata: { job_id: jobId, provider_video_id: job.provider_request_id, transparent },
    });
    let thumbId: string | null = null;
    if (v.data.thumbnail_url) {
      try {
        const t = await storeRemote(v.data.thumbnail_url, `${scope}/videos/${jobId}/thumbnail.jpg`, "image/jpeg");
        thumbId = await ensureAsset({ ...t, asset_type: "image", asset_role: "thumbnail", title: "Thumbnail", project_id: job.project_id, uploaded_by: job.created_by });
        await link(assetId, thumbId, "thumbnail_of");
      } catch {
        /* thumbnail is optional */
      }
    }
    if (v.data.subtitle_url) {
      try {
        const s = await storeRemote(v.data.subtitle_url, `${scope}/videos/${jobId}/captions.srt`, "application/x-subrip");
        await ensureAsset({ ...s, asset_type: "document", asset_role: "caption", title: "Captions (SRT)", project_id: job.project_id, uploaded_by: job.created_by });
      } catch {
        /* captions optional */
      }
    }
    for (const src of [input["image_asset_id"], input["audio_asset_id"]]) if (typeof src === "string") await link(src, assetId, "generated_from");
    await db
      .from("avatar_videos")
      .update({ generated_asset_id: assetId, thumbnail_asset_id: thumbId, duration_seconds: v.data.duration ?? null, provider_status: "completed", completed_at: new Date().toISOString() })
      .eq("job_id", jobId);
    await db.from("avatar_usage_ledger").upsert(
      { job_id: jobId, user_id: job.created_by, usage_type: "video_seconds", quantity: v.data.duration ?? null, unit: "seconds", source: "internal_metric", metadata: { job_type: job.job_type } as never },
      { onConflict: "job_id,usage_type", ignoreDuplicates: true },
    );
    await finishJob(jobId, "completed", { output_payload: { asset_id: assetId, thumbnail_asset_id: thumbId, duration: v.data.duration ?? null } as never, error_code: null, error_message: null });
    await db.from("avatar_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId).eq("status", "ingesting");
    await logJobEvent(jobId, "output_stored", { asset_id: assetId });
    await logJobEvent(jobId, "completed");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingestion failed";
    await db.from("avatar_jobs").update({ status: "ingest_failed", error_code: "INGEST_FAILED", error_message: message }).eq("id", jobId);
    await logJobEvent(jobId, "failed", { stage: "ingest", message });
  }
}

export async function ingestLocalization(locId: string) {
  const db = await admin();
  const { data: loc } = await db.from("avatar_localizations").select("*").eq("id", locId).maybeSingle();
  if (!loc?.provider_resource_id || loc.output_asset_id) return;
  const r = loc.kind === "translation" ? await HeyGenProvider.getTranslation(loc.provider_resource_id) : await HeyGenProvider.getLipsync(loc.provider_resource_id);
  if (!r.ok || !r.data) return;
  const d = r.data;
  if (d.status === "failed") {
    await db.from("avatar_localizations").update({ status: "failed", error_message: d.failure_message ?? "Failed at HeyGen" }).eq("id", locId);
    return;
  }
  if (d.status !== "completed" || !d.video_url) {
    await db.from("avatar_localizations").update({ status: d.status }).eq("id", locId);
    return;
  }
  const scope = loc.project_id ? `projects/${loc.project_id}` : `unassigned/${loc.created_by}`;
  try {
    const stored = await storeRemote(d.video_url, `${scope}/localization/${locId}/video.mp4`, "video/mp4");
    const role = loc.kind === "translation" ? "translated_video" : "lipsynced_video";
    const assetId = await ensureAsset({
      ...stored,
      asset_type: "video",
      asset_role: role,
      title: loc.kind === "translation" ? `Translation · ${loc.target_language ?? d.output_language ?? ""}` : "Lipsync",
      project_id: loc.project_id,
      uploaded_by: loc.created_by,
      duration: d.duration ?? null,
      metadata: { localization_id: locId },
    });
    await link(loc.source_asset_id, assetId, loc.kind === "translation" ? "translated_from" : "lipsynced_from");
    let captionId: string | null = null;
    const cap = d.srt_caption_url ?? d.caption_url;
    if (cap) {
      try {
        const c = await storeRemote(cap, `${scope}/localization/${locId}/captions.srt`, "application/x-subrip");
        captionId = await ensureAsset({ ...c, asset_type: "document", asset_role: "caption", title: "Captions (SRT)", project_id: loc.project_id, uploaded_by: loc.created_by });
      } catch {
        /* optional */
      }
    }
    await db
      .from("avatar_localizations")
      .update({ status: "completed", output_asset_id: assetId, caption_asset_id: captionId, completed_at: new Date().toISOString(), provider_payload: d as never })
      .eq("id", locId);
  } catch (e) {
    await db.from("avatar_localizations").update({ status: "ingest_failed", error_message: e instanceof Error ? e.message : "Save failed" }).eq("id", locId);
  }
}

async function settleLocalizationJob(jobId: string) {
  const db = await admin();
  const { data: rows } = await db.from("avatar_localizations").select("status").eq("job_id", jobId);
  if (!rows?.length) return;
  const statuses = rows.map((r) => r.status);
  if (statuses.every((s) => s === "completed")) await finishJob(jobId, "completed");
  else if (statuses.every((s) => s === "completed" || s === "failed" || s === "ingest_failed")) {
    const anyOk = statuses.includes("completed");
    if (statuses.includes("ingest_failed")) await finishJob(jobId, "ingest_failed", { error_code: "INGEST_FAILED", error_message: "Some outputs could not be saved" });
    else await finishJob(jobId, anyOk ? "completed" : "failed", anyOk ? { error_message: "Some languages failed" } : { error_code: "PROVIDER_REJECTED", error_message: "HeyGen reported failure" });
  }
}

// ---------------- per-type status application ----------------
export async function pollJob(job: JobRow): Promise<void> {
  const db = await admin();
  await db.from("avatar_jobs").update({ last_polled_at: new Date().toISOString(), poll_attempts: (job.poll_attempts ?? 0) + 1 }).eq("id", job.id);
  const rid = job.provider_request_id;
  const t = job.job_type;

  if (["avatar_video", "image_avatar_video", "audio_avatar_video", "cinematic_avatar_video", "transparent_avatar_video", "batch_video"].includes(t)) {
    if (job.status === "ingest_failed") return ingestVideoJob(job.id);
    if (!rid) return;
    const v = await HeyGenProvider.getVideo(rid);
    if (!v.ok) {
      if (v.status === 404) await finishJob(job.id, "failed", { error_code: "NOT_FOUND", error_message: "HeyGen no longer recognises this video" });
      return;
    }
    await db.from("avatar_videos").update({ provider_status: v.data!.status }).eq("job_id", job.id);
    if (v.data!.status === "completed") return ingestVideoJob(job.id);
    if (v.data!.status === "failed") {
      const code = (v.data!.failure_code ?? "").toLowerCase().includes("moderation") ? "MODERATION_BLOCKED" : "PROVIDER_REJECTED";
      await finishJob(job.id, "failed", { error_code: code, error_message: v.data!.failure_message ?? "HeyGen reported failure" });
      await logJobEvent(job.id, "failed", { failure_code: v.data!.failure_code ?? null });
    } else if (job.status !== "provider_processing") {
      await finishJob(job.id, "provider_processing");
      await logJobEvent(job.id, "provider_processing");
    }
    return;
  }

  if (t === "translation" || t === "lipsync") {
    const { data: locs } = await db.from("avatar_localizations").select("id,status").eq("job_id", job.id);
    for (const l of locs ?? []) if (!["completed", "failed"].includes(l.status)) await ingestLocalization(l.id);
    return settleLocalizationJob(job.id);
  }

  if (t === "avatar_create_digital_twin" || t === "avatar_create_photo" || t === "avatar_create_prompt" || t === "avatar_create_look") {
    const out = (job.output_payload ?? {}) as { look_ids?: string[]; character_id?: string };
    const lookIds = out.look_ids ?? (rid ? [rid] : []);
    let allDone = true;
    let anyConsent = false;
    let failure: string | null = null;
    for (const id of lookIds) {
      const l = await HeyGenProvider.getAvatarLook(id);
      if (!l.ok || !l.data) {
        allDone = false;
        continue;
      }
      const cid = out.character_id ?? (l.data.group_id ? await upsertGroup({ id: l.data.group_id, name: l.data.name, looks_count: 1 } as HGGroup, { ownership: "owned" }) : null);
      if (cid) await upsertLook(l.data, cid);
      if (l.data.status === "failed") failure = l.data.error?.message ?? "Avatar creation failed";
      else if (l.data.status === "pending_consent") anyConsent = true;
      else if (l.data.status !== "completed") allDone = false;
    }
    if (out.character_id) await refreshCharacterFromProvider(out.character_id);
    if (failure) await finishJob(job.id, "failed", { error_code: failure.toLowerCase().includes("moderation") ? "MODERATION_BLOCKED" : "PROVIDER_REJECTED", error_message: failure });
    else if (anyConsent) {
      if (job.status !== "awaiting_consent") {
        await finishJob(job.id, "awaiting_consent");
        await logJobEvent(job.id, "consent_requested");
      }
    } else if (allDone && lookIds.length) {
      if (job.status === "awaiting_consent") await logJobEvent(job.id, "consent_approved");
      await finishJob(job.id, "completed");
      await logJobEvent(job.id, "completed");
    }
    return;
  }

  if (t === "voice_clone_instant" && rid) {
    const v = await HeyGenProvider.getVoice(rid);
    if (!v.ok || !v.data) return;
    if (v.data.status === "complete") {
      await db.from("avatar_voices").update({ status: "ready", preview_url: v.data.preview_audio_url ?? null, supports_pause: v.data.support_pause, language: v.data.language ?? null }).eq("provider_voice_id", rid);
      await db.from("avatar_voice_trainings").update({ status: "complete", completed_at: new Date().toISOString() }).eq("job_id", job.id);
      await finishJob(job.id, "completed");
      await logJobEvent(job.id, "completed");
    } else if (v.data.status === "failed") {
      await db.from("avatar_voices").update({ status: "failed" }).eq("provider_voice_id", rid);
      await db.from("avatar_voice_trainings").update({ status: "failed", error_message: v.data.failure_message ?? null }).eq("job_id", job.id);
      await finishJob(job.id, "failed", { error_code: "PROVIDER_REJECTED", error_message: v.data.failure_message ?? "Voice clone failed" });
    }
    return;
  }

  if ((t === "voice_train_professional" || t === "voice_retrain_professional") && rid) {
    const v = await HeyGenProvider.getProfessionalVoice(rid);
    if (!v.ok || !v.data) return;
    if (v.data.status === "ACTIVE") {
      await db.from("avatar_voices").update({ status: "ready", provider_slot_status: "active" }).eq("provider_voice_id", rid);
      await db.from("avatar_voice_trainings").update({ status: "ACTIVE", completed_at: new Date().toISOString() }).eq("job_id", job.id);
      await finishJob(job.id, "completed");
      await logJobEvent(job.id, "completed");
    } else if (v.data.status === "FAILED") {
      // a failed retrain leaves the previously active voice usable
      if (t === "voice_train_professional") await db.from("avatar_voices").update({ status: "failed" }).eq("provider_voice_id", rid);
      await db.from("avatar_voice_trainings").update({ status: "FAILED", error_message: v.data.failure_reason ?? null }).eq("job_id", job.id);
      await finishJob(job.id, "failed", { error_code: "PROVIDER_REJECTED", error_message: `Training failed: ${v.data.failure_reason ?? "unknown reason"}` });
    }
  }
}

/** Recovery pass: webhooks are primary; this catches anything missed. */
export async function reconcile() {
  const db = await admin();
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  const { data: jobs } = await db
    .from("avatar_jobs")
    .select("*")
    .in("status", POLLABLE as unknown as string[])
    .or(`last_polled_at.is.null,last_polled_at.lt.${staleBefore}`)
    .order("updated_at", { ascending: true })
    .limit(40);
  let polled = 0;
  for (const j of jobs ?? []) {
    const job = j as unknown as JobRow;
    // give up politely on jobs that never resolve (~2 days of 3-5 minute checks)
    if ((job.poll_attempts ?? 0) > 600 && job.status !== "awaiting_consent") {
      await finishJob(job.id, "failed", { error_code: "PROVIDER_UNAVAILABLE", error_message: "HeyGen never reported a final result" });
      continue;
    }
    try {
      await pollJob(job);
      polled++;
    } catch {
      /* keep going */
    }
  }
  // stuck mid-submission → uncertain, never resubmitted
  const { data: stuck } = await db
    .from("avatar_jobs")
    .update({ status: "submission_uncertain", submission_state: "uncertain", error_code: "SUBMISSION_UNCERTAIN", error_message: "Submission never confirmed" })
    .eq("status", "submitting")
    .lt("submission_started_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .select("id");
  for (const s of stuck ?? []) await logJobEvent(s.id, "submission_uncertain", { reason: "stuck_submitting" });

  const realtime = await (await import("./realtime.server")).watchdog();
  return { polled, stuck: stuck?.length ?? 0, realtime };
}

// ---------------- webhooks ----------------
export async function processWebhook(payload: { event_type?: string; event_id?: string; event_data?: Record<string, unknown> }, hash: string) {
  const db = await admin();
  const data = payload.event_data ?? {};
  const resourceId = (data["video_id"] as string) || (data["video_translation_id"] as string) || (data["id"] as string) || null;
  const { error: dup } = await db.from("avatar_provider_webhook_events").insert({
    provider: "heygen",
    provider_event_id: payload.event_id ?? null,
    event_type: payload.event_type ?? null,
    resource_id: resourceId,
    payload_hash: hash,
    payload: payload as never,
  });
  if (dup) return "duplicate";
  let result = "ignored";
  const type = payload.event_type ?? "";
  if (resourceId) {
    // Treat the webhook as a signal; authoritative state is re-read from HeyGen.
    if (type.startsWith("avatar_video")) {
      const { data: job } = await db.from("avatar_jobs").select("*").eq("provider_request_id", resourceId).maybeSingle();
      if (job) {
        await logJobEvent(job.id, "webhook_received", { event_type: type });
        await pollJob(job as unknown as JobRow);
        result = "processed";
      }
    } else if (type.startsWith("video_translate")) {
      const { data: loc } = await db.from("avatar_localizations").select("id,job_id").eq("provider_resource_id", resourceId).maybeSingle();
      if (loc) {
        await ingestLocalization(loc.id);
        if (loc.job_id) await settleLocalizationJob(loc.job_id);
        result = "processed";
      }
    }
  }
  if (type.startsWith("photo_avatar") || type.startsWith("instant_avatar")) {
    const { data: jobs } = await db.from("avatar_jobs").select("*").in("status", ["provider_processing", "awaiting_consent"]).like("job_type", "avatar_create%").limit(20);
    for (const j of jobs ?? []) await pollJob(j as unknown as JobRow);
    result = "processed";
  }
  await db.from("avatar_provider_webhook_events").update({ processed_at: new Date().toISOString(), processing_result: result }).eq("provider", "heygen").eq("payload_hash", hash);
  return result;
}
