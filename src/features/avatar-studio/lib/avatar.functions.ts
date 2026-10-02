import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AvatarError } from "./errors";

/**
 * Avatar Studio server functions. Every HeyGen / LiveAvatar call happens here or
 * in ../server/*.server.ts — never in the browser. All handlers verify an active
 * member; admin-only operations verify the admin role.
 */

const ATTESTATION_TEXT =
  "I confirm that we have the necessary permission and rights to use this person's image/voice for AI cloning and generation.";

async function svc() {
  const jobs = await import("../server/jobs.server");
  const { HeyGenProvider, heygenConfigured } = await import("../server/heygen.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { ...jobs, HeyGenProvider, heygenConfigured, db: supabaseAdmin };
}

async function requireHeyGen() {
  const { heygenConfigured } = await import("../server/heygen.server");
  if (!heygenConfigured()) throw new AvatarError("HEYGEN_NOT_CONFIGURED");
}

async function requireAdmin(userId: string) {
  const s = await svc();
  const p = await s.requireActiveMember(userId);
  if (p.role !== "admin") throw new AvatarError("NOT_AUTHORIZED", "Only Avatar Studio admins can do this");
  return p;
}

function toError(e: unknown): never {
  if (e instanceof AvatarError) throw new Error(e.message);
  throw e;
}

// ---------------------------------------------------------------- status
export const getAvatarProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await svc();
    await s.requireActiveMember(context.userId);
    const { liveAvatarConfigured } = await import("../server/liveavatar.server");
    const heygen = s.heygenConfigured();
    let account: null | { email: string; billing: string | null; balanceLabel: string | null; plan: string | null } = null;
    let state: "not_configured" | "connected" | "degraded" = heygen ? "degraded" : "not_configured";
    let message: string | null = null;
    if (heygen) {
      const me = await s.HeyGenProvider.getCurrentUser();
      if (me.ok && me.data) {
        state = "connected";
        const u = me.data;
        let balanceLabel: string | null = null;
        let numeric: number | null = null;
        if (u.wallet?.remaining_balance != null) {
          numeric = u.wallet.remaining_balance;
          balanceLabel = u.wallet.currency === "usd" ? `$${u.wallet.remaining_balance.toFixed(2)}` : `${u.wallet.remaining_balance} credits`;
        } else if (u.subscription) {
          numeric = (u.subscription.credits.premium_credits?.remaining ?? 0) + (u.subscription.credits.add_on_credits?.remaining ?? 0);
          balanceLabel = `${numeric} credits`;
        } else if (u.usage_based) {
          numeric = u.usage_based.remaining_credits ?? null;
          balanceLabel = u.usage_based.spending_cap_usd != null ? `$${(u.usage_based.spending_current_usd ?? 0).toFixed(2)} of $${u.usage_based.spending_cap_usd.toFixed(2)} cap` : null;
        }
        account = { email: u.email, billing: u.billing_type ?? null, balanceLabel, plan: u.subscription?.plan ?? null };
        await s.recordProviderHealth(true);
        await s.db.from("avatar_settings").upsert({ key: "balance_snapshot", value: { at: new Date().toISOString(), label: balanceLabel, value: numeric } as never, updated_at: new Date().toISOString() });
      } else {
        message = me.errorMessage ?? "HeyGen did not respond";
        if (me.errorCode === "HEYGEN_NOT_CONFIGURED") message = "HeyGen rejected the API key. Check HEYGEN_API_KEY.";
        await s.recordProviderHealth(false, message);
      }
    }
    const { data: settings } = await s.db.from("avatar_settings").select("key,value");
    const map = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
    const webhook = map["webhook_endpoint"] as { endpoint_id?: string; url?: string; registered_at?: string } | null;
    return {
      heygen: { configured: heygen, state, message, account },
      liveavatar: { configured: liveAvatarConfigured() },
      openai: { configured: !!process.env["OPENAI_API_KEY"] },
      webhook: webhook?.endpoint_id ? { registered: true, url: webhook.url ?? null, registeredAt: webhook.registered_at ?? null } : { registered: false, url: null, registeredAt: null },
      lastSuccessAt: (map["provider_last_success_at"] as string | null) ?? null,
      lastError: (map["provider_last_error"] as { at: string; message: string } | null) ?? null,
    };
  });

// ---------------------------------------------------------------- sync
export const syncAvatarResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ includePublic: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    try {
      await requireAdmin(context.userId);
      await requireHeyGen();
      const s = await svc();
      return await s.syncResources(context.userId, data.includePublic);
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- assets
const ROLE_RULES: Record<string, { bucket: string; sensitivity: string }> = {
  training_video: { bucket: "avatar-training-media", sensitivity: "avatar_training" },
  training_audio: { bucket: "avatar-training-media", sensitivity: "voice_training" },
  identity_reference: { bucket: "avatar-training-media", sensitivity: "identity" },
  avatar_reference: { bucket: "avatar-media", sensitivity: "normal" },
  look_reference: { bucket: "avatar-media", sensitivity: "normal" },
  source_video: { bucket: "avatar-media", sensitivity: "normal" },
  source_audio: { bucket: "avatar-media", sensitivity: "normal" },
  source_image: { bucket: "avatar-media", sensitivity: "normal" },
};
const MIME_OK: Record<string, string[]> = {
  image: ["image/png", "image/jpeg"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a"],
};

export const registerAvatarAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.enum(Object.keys(ROLE_RULES) as [string, ...string[]]),
        storagePath: z.string().min(5).max(400),
        title: z.string().max(200).optional(),
        mimeType: z.string().max(100),
        fileSize: z.number().int().positive().max(2_147_483_648),
        durationSeconds: z.number().positive().max(36_000).nullable().optional(),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
        projectId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      const rule = ROLE_RULES[data.role]!;
      if (!data.storagePath.startsWith(`${context.userId}/`) || data.storagePath.includes("..")) throw new AvatarError("NOT_AUTHORIZED", "Invalid upload location");
      const kind = data.mimeType.split("/")[0]!;
      if (!MIME_OK[kind]?.includes(data.mimeType)) throw new AvatarError("INVALID_PARAMETERS", `${data.mimeType} files are not supported here`);
      const { data: obj } = await s.db.storage.from(rule.bucket).list(data.storagePath.split("/").slice(0, -1).join("/"), { search: data.storagePath.split("/").pop()! });
      if (!obj?.length) throw new AvatarError("INVALID_PARAMETERS", "Upload not found — please try again");
      const { data: row, error } = await s.db
        .from("avatar_assets")
        .insert({
          project_id: data.projectId ?? null,
          uploaded_by: context.userId,
          asset_type: kind as "image" | "video" | "audio",
          asset_role: data.role,
          source_type: "uploaded",
          sensitivity: rule.sensitivity,
          title: data.title ?? null,
          storage_bucket: rule.bucket,
          storage_path: data.storagePath,
          mime_type: data.mimeType,
          file_size: data.fileSize,
          duration_seconds: data.durationSeconds ?? null,
          width: data.width ?? null,
          height: data.height ?? null,
          consent_required: rule.sensitivity !== "normal",
        })
        .select("id")
        .single();
      if (error) throw new AvatarError("UNKNOWN", "Could not save the upload");
      return { assetId: row.id as string };
    } catch (e) {
      toError(e);
    }
  });

/** Persist the internal rights attestation (not just a browser checkbox). */
async function attest(userId: string, category: string, workflow: string, assetIds: string[], permission?: string) {
  const s = await svc();
  const { data, error } = await s.db
    .from("avatar_consents")
    .insert({
      subject_type: "asset",
      asset_id: assetIds[0] ?? null,
      consent_category: category,
      internal_attestation: ATTESTATION_TEXT,
      attested_by: userId,
      attested_at: new Date().toISOString(),
      permission_description: permission ?? null,
      consent_method: "internal_attestation",
      workflow,
      provider_payload: { asset_ids: assetIds } as never,
    })
    .select("id")
    .single();
  if (error) throw new AvatarError("UNKNOWN", "Could not record the permission confirmation");
  await s.audit(userId, "rights_attested", "asset", assetIds[0] ?? null, { workflow, category, asset_ids: assetIds });
  return data.id as string;
}

const attestationSchema = z.object({ confirmed: z.literal(true), permissionNote: z.string().max(500).optional() });

// ---------------------------------------------------------------- avatars
export const createAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("digital_twin"), name: z.string().min(1).max(100), assetId: z.string().uuid(), attestation: attestationSchema }),
        z.object({ type: z.literal("photo"), name: z.string().min(1).max(100), assetId: z.string().uuid(), attestation: attestationSchema }),
        z.object({
          type: z.literal("prompt"),
          name: z.string().min(1).max(100),
          prompt: z.string().min(3).max(1000),
          referenceAssetIds: z.array(z.string().uuid()).max(3).default([]),
          aspectRatio: z.enum(["auto", "16:9", "9:16", "1:1", "4:5", "5:4"]).optional(),
          restyleLookId: z.string().uuid().nullable().optional(),
          attestation: attestationSchema.optional(),
        }),
      ])
      .and(z.object({ projectId: z.string().uuid().nullable().optional(), clientRequestId: z.string().min(8).max(64) }))
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      const flag = data.type === "digital_twin" ? "avatar_digital_twins_enabled" : data.type === "photo" ? "avatar_photo_avatars_enabled" : "avatar_prompt_avatars_enabled";
      await s.requireFlags(flag);
      await requireHeyGen();

      let consentId: string | null = null;
      const body: Record<string, unknown> = { type: data.type, name: data.name };
      const jobType = data.type === "digital_twin" ? "avatar_create_digital_twin" : data.type === "photo" ? "avatar_create_photo" : "avatar_create_prompt";
      let sourceAssetIds: string[] = [];

      if (data.type === "digital_twin" || data.type === "photo") {
        consentId = await attest(context.userId, data.type === "digital_twin" ? "avatar_training" : "photo_identity", jobType, [data.assetId], data.attestation.permissionNote);
        const { ref, asset } = await s.providerUrlForAsset(data.assetId);
        if (data.type === "digital_twin") {
          if (asset["asset_type"] !== "video") throw new AvatarError("INVALID_PARAMETERS", "A Digital Twin needs a training video");
          const dur = Number(asset["duration_seconds"] ?? 0);
          if (dur && (dur < 15 || dur > 600)) throw new AvatarError("INVALID_PARAMETERS", "Training footage must be between 15 seconds and 10 minutes");
        } else if (asset["asset_type"] !== "image") throw new AvatarError("INVALID_PARAMETERS", "A Photo Avatar needs an image");
        body["file"] = ref;
        sourceAssetIds = [data.assetId];
      } else {
        const refs = [];
        for (const id of data.referenceAssetIds) refs.push((await s.providerUrlForAsset(id)).ref);
        if (refs.length) {
          if (!data.attestation) throw new AvatarError("ATTESTATION_REQUIRED");
          consentId = await attest(context.userId, "photo_identity", jobType, data.referenceAssetIds, data.attestation.permissionNote);
          body["reference_images"] = refs;
        }
        body["prompt"] = data.prompt;
        if (data.aspectRatio) body["aspect_ratio"] = data.aspectRatio;
        if (data.restyleLookId) {
          const { data: look } = await s.db.from("avatar_looks").select("provider_look_id, avatar_characters(ownership_type)").eq("id", data.restyleLookId).maybeSingle();
          if (!look) throw new AvatarError("INVALID_PARAMETERS", "Selected look not found");
          // avatar_id = identity/continuity reference (HeyGen semantics); new identity unless group set
          body["avatar_id"] = look.provider_look_id;
        }
        sourceAssetIds = data.referenceAssetIds;
      }

      const { job, existing } = await s.createJob({
        jobType,
        userId: context.userId,
        projectId: data.projectId ?? null,
        inputPayload: { name: data.name, type: data.type, source_asset_ids: sourceAssetIds, consent_id: consentId },
        normalizedInput: { ...body, file: body["file"] ? "[signed url]" : undefined, reference_images: body["reference_images"] ? "[signed urls]" : undefined },
        clientRequestId: data.clientRequestId,
        providerResourceType: "avatar_look",
      });
      if (existing) return { jobId: job.id, status: job.status, existing: true };

      const result = await s.submitOnce(job, (key) => s.HeyGenProvider.createAvatar(body, key), async (res) => {
        let characterId: string | undefined;
        if (res.avatar_group) {
          characterId = await s.upsertGroup(res.avatar_group, {
            ownership: "owned",
            avatarType: data.type === "digital_twin" ? "digital_twin" : data.type === "photo" ? "photo" : "prompt",
            userId: context.userId,
            projectId: data.projectId ?? null,
          });
          await s.db.from("avatar_characters").update({ local_consent_status: consentId ? "attested" : "not_required" }).eq("id", characterId);
          if (consentId) await s.db.from("avatar_consents").update({ character_id: characterId, subject_type: "character" }).eq("id", consentId);
        }
        if (res.avatar_item && characterId) await s.upsertLook(res.avatar_item, characterId);
        await s.audit(context.userId, "avatar_created", "character", characterId ?? null, { type: data.type });
        return {
          providerRequestId: res.avatar_item?.id ?? res.avatar_group?.id ?? null,
          status: res.avatar_item?.status === "pending_consent" ? "awaiting_consent" : res.avatar_item?.status === "completed" ? "completed" : "provider_processing",
          output: { look_ids: res.avatar_item ? [res.avatar_item.id] : [], character_id: characterId ?? null },
        };
      });
      return { jobId: job.id, ...result };
    } catch (e) {
      toError(e);
    }
  });

export const requestAvatarConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ characterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const { data: ch } = await s.db.from("avatar_characters").select("*").eq("id", data.characterId).maybeSingle();
      if (!ch?.provider_group_id || ch.ownership_type !== "owned") throw new AvatarError("INVALID_PARAMETERS", "Consent applies to your own Digital Twins only");
      const res = await s.HeyGenProvider.createConsent(ch.provider_group_id, crypto.randomUUID());
      if (!res.ok || !res.data) throw new AvatarError(res.errorCode ?? "PROVIDER_REJECTED", res.errorMessage);
      const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
      await s.db.from("avatar_consents").insert({
        subject_type: "character",
        character_id: ch.id,
        consent_category: "avatar_training",
        provider_required: true,
        provider_consent_url: res.data.url ?? null,
        provider_consent_expires_at: expires,
        provider_status: res.data.avatar_group?.consent_status ?? "pending",
        consent_method: "provider_link",
        attested_by: context.userId,
        provider_payload: { group_status: res.data.avatar_group?.status ?? null } as never,
      });
      await s.upsertGroup(res.data.avatar_group, { ownership: "owned" });
      await s.audit(context.userId, "provider_consent_requested", "character", ch.id, {});
      return { url: res.data.url ?? null, expiresAt: expires };
    } catch (e) {
      toError(e);
    }
  });

export const refreshCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ characterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      await s.refreshCharacterFromProvider(data.characterId);
      return { ok: true };
    } catch (e) {
      toError(e);
    }
  });

export const listLookTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const r = await s.HeyGenProvider.listLookTemplates();
      if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_UNAVAILABLE", r.errorMessage);
      return r.data ?? [];
    } catch (e) {
      toError(e);
    }
  });

export const createLooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        lookId: z.string().uuid(),
        templateId: z.string().min(1).max(128),
        templateType: z.enum(["look_pack", "template"]),
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
        clientRequestId: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const { data: look } = await s.db.from("avatar_looks").select("provider_look_id, character_id, avatar_characters(ownership_type)").eq("id", data.lookId).maybeSingle();
      if (!look) throw new AvatarError("INVALID_PARAMETERS", "Look not found");
      const body: { type: "look_pack" | "template"; reference_look_id: string; template_id: string; aspect_ratio?: string } = {
        type: data.templateType,
        reference_look_id: look.provider_look_id,
        template_id: data.templateId,
      };
      if (data.templateType === "look_pack" && data.aspectRatio) body.aspect_ratio = data.aspectRatio;
      const { job, existing } = await s.createJob({
        jobType: "avatar_create_look",
        userId: context.userId,
        inputPayload: { look_id: data.lookId, template_id: data.templateId, type: data.templateType },
        normalizedInput: body,
        clientRequestId: data.clientRequestId,
        providerResourceType: "avatar_look",
      });
      if (existing) return { jobId: job.id, status: job.status };
      const r = await s.submitOnce(job, (key) => s.HeyGenProvider.createAvatarLooks(body, key), async (res) => ({
        providerRequestId: res.looks[0]?.id ?? null,
        output: { look_ids: res.looks.map((l) => l.id), character_id: look.character_id },
      }));
      return { jobId: job.id, ...r };
    } catch (e) {
      toError(e);
    }
  });

export const manageLook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lookId: z.string().uuid(), action: z.enum(["rename", "delete"]), name: z.string().min(1).max(255).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      const p = await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const { data: look } = await s.db.from("avatar_looks").select("*, avatar_characters(ownership_type, created_by)").eq("id", data.lookId).maybeSingle();
      if (!look) throw new AvatarError("NOT_FOUND");
      const owner = look.avatar_characters as unknown as { ownership_type: string; created_by: string | null } | null;
      if (owner?.ownership_type !== "owned") throw new AvatarError("INVALID_PARAMETERS", "Public provider looks can't be changed");
      if (data.action === "rename") {
        const r = await s.HeyGenProvider.renameAvatarLook(look.provider_look_id, data.name!);
        if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage);
        await s.db.from("avatar_looks").update({ display_name: data.name! }).eq("id", look.id);
      } else {
        if (p.role !== "admin" && owner.created_by !== context.userId) throw new AvatarError("NOT_AUTHORIZED", "Only the creator or an admin can delete a look");
        const r = await s.HeyGenProvider.deleteAvatarLook(look.provider_look_id);
        if (!r.ok && r.status !== 404) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage);
        await s.db.from("avatar_looks").update({ deleted_at: new Date().toISOString() }).eq("id", look.id);
        await s.audit(context.userId, "look_deleted", "look", look.id, {});
      }
      return { ok: true };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- voices
export const cloneVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["instant", "professional", "professional_retrain"]),
        name: z.string().min(1).max(100),
        language: z.string().min(2).max(32).optional(),
        assetIds: z.array(z.string().uuid()).min(1).max(10),
        removeBackgroundNoise: z.boolean().default(true),
        retrainVoiceId: z.string().uuid().optional(),
        attestation: attestationSchema,
        clientRequestId: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags(data.mode === "instant" ? "avatar_voice_clone_enabled" : "avatar_professional_voice_enabled");
      await requireHeyGen();
      if (data.mode === "instant" && data.assetIds.length !== 1) throw new AvatarError("INVALID_PARAMETERS", "Instant clone uses exactly one recording");
      const refs: import("../server/heygen.server").AssetRef[] = [];
      let total = 0;
      for (const id of data.assetIds) {
        const { ref, asset } = await s.providerUrlForAsset(id);
        if (asset["asset_type"] !== "audio" && asset["asset_type"] !== "video") throw new AvatarError("INVALID_PARAMETERS", "Voice samples must be audio recordings");
        total += Number(asset["duration_seconds"] ?? 0);
        refs.push(ref);
      }
      if (data.mode !== "instant" && total > 0 && total < 20 * 60) throw new AvatarError("INVALID_PARAMETERS", `Professional voices need at least 20 minutes of audio (you have ${Math.round(total / 60)} min)`);
      let retrainProviderId: string | undefined;
      if (data.mode === "professional_retrain") {
        const { data: v } = await s.db.from("avatar_voices").select("provider_voice_id, voice_type").eq("id", data.retrainVoiceId ?? "").maybeSingle();
        if (!v || v.voice_type !== "professional_clone") throw new AvatarError("INVALID_PARAMETERS", "Only professional voices can be retrained");
        retrainProviderId = v.provider_voice_id;
      }
      const consentId = await attest(context.userId, data.mode === "instant" ? "voice_clone" : "professional_voice", `voice_${data.mode}`, data.assetIds, data.attestation.permissionNote);
      const jobType = data.mode === "instant" ? "voice_clone_instant" : data.mode === "professional" ? "voice_train_professional" : "voice_retrain_professional";
      const { job, existing } = await s.createJob({
        jobType,
        userId: context.userId,
        inputPayload: { name: data.name, language: data.language ?? null, asset_ids: data.assetIds, consent_id: consentId, total_seconds: total },
        clientRequestId: data.clientRequestId,
        providerResourceType: data.mode === "instant" ? "voice_clone" : "professional_voice",
      });
      if (existing) return { jobId: job.id, status: job.status };
      const { data: training } = await s.db
        .from("avatar_voice_trainings")
        .insert({
          job_id: job.id,
          mode: data.mode,
          status: "pending",
          requested_language: data.language ?? null,
          voice_name: data.name,
          sample_count: data.assetIds.length,
          total_duration_seconds: total || null,
          idempotency_key: job.idempotency_key,
          created_by: context.userId,
        })
        .select("id")
        .single();
      for (const [i, id] of data.assetIds.entries())
        await s.db.from("avatar_voice_samples").insert({ training_id: training!.id, asset_id: id, sample_role: data.mode === "professional_retrain" ? "retraining" : "training", sort_order: i });

      const result = await s.submitOnce(
        job,
        async (key) => {
          if (data.mode === "instant") {
            const body: { audio: (typeof refs)[number]; voice_name: string; language?: string; remove_background_noise: boolean } = {
              audio: refs[0]!,
              voice_name: data.name,
              remove_background_noise: data.removeBackgroundNoise,
            };
            if (data.language) body.language = data.language;
            const r = await s.HeyGenProvider.cloneInstantVoice(body);
            return r.ok ? { ...r, data: { voice_id: r.data!.voice_clone_id } } : (r as never);
          }
          const body: { mode?: "professional"; voice_id?: string; name?: string; language?: string; audio: typeof refs } = { audio: refs };
          if (retrainProviderId) body.voice_id = retrainProviderId;
          else {
            body.mode = "professional";
            body.name = data.name;
            if (data.language) body.language = data.language;
          }
          return s.HeyGenProvider.trainProfessionalVoice(body, key);
        },
        async (res: { voice_id: string }) => {
          let voiceRowId: string | undefined;
          if (data.mode === "professional_retrain") voiceRowId = data.retrainVoiceId;
          else {
            const { data: v } = await s.db
              .from("avatar_voices")
              .upsert(
                {
                  provider: "heygen",
                  provider_voice_id: res.voice_id,
                  display_name: data.name,
                  voice_type: data.mode === "instant" ? "instant_clone" : "professional_clone",
                  language: data.language ?? null,
                  status: "training",
                  is_owned: true,
                  created_by: context.userId,
                },
                { onConflict: "provider,provider_voice_id" },
              )
              .select("id")
              .single();
            voiceRowId = v?.id;
          }
          await s.db.from("avatar_voice_trainings").update({ voice_id: voiceRowId ?? null, provider_training_id: res.voice_id, status: "processing", submitted_at: new Date().toISOString() }).eq("id", training!.id);
          if (voiceRowId) await s.db.from("avatar_consents").update({ voice_id: voiceRowId, subject_type: "voice" }).eq("id", consentId);
          await s.audit(context.userId, `voice_${data.mode}_submitted`, "voice", voiceRowId ?? null, {});
          return { providerRequestId: res.voice_id, status: "provider_processing" };
        },
      );
      if (!result.ok) await s.db.from("avatar_voice_trainings").update({ status: result.status, error_code: result.errorCode ?? null, error_message: result.errorMessage ?? null }).eq("id", training!.id);
      return { jobId: job.id, ...result };
    } catch (e) {
      toError(e);
    }
  });

export const designVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prompt: z.string().min(3).max(1000), gender: z.enum(["male", "female"]).optional(), locale: z.string().max(16).optional(), seed: z.number().int().min(0).max(50).default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const body: { prompt: string; gender?: string; locale?: string; seed: number } = { prompt: data.prompt, seed: data.seed };
      if (data.gender) body.gender = data.gender;
      if (data.locale) body.locale = data.locale;
      const r = await s.HeyGenProvider.designVoice(body);
      if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage);
      return r.data!;
    } catch (e) {
      toError(e);
    }
  });

export const saveDesignedVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ providerVoiceId: z.string().min(1).max(128), name: z.string().min(1).max(100), language: z.string().max(64).optional(), previewUrl: z.string().url().optional(), prompt: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.db.from("avatar_voices").upsert(
        {
          provider: "heygen",
          provider_voice_id: data.providerVoiceId,
          display_name: data.name,
          voice_type: "designed",
          language: data.language ?? null,
          preview_url: data.previewUrl ?? null,
          status: "ready",
          is_owned: true,
          created_by: context.userId,
          provider_payload: { design_prompt: data.prompt ?? null } as never,
        },
        { onConflict: "provider,provider_voice_id" },
      );
      return { ok: true };
    } catch (e) {
      toError(e);
    }
  });

export const renameVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voiceId: z.string().uuid(), name: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    await s.requireActiveMember(context.userId);
    await s.db.from("avatar_voices").update({ display_name: data.name }).eq("id", data.voiceId);
    return { ok: true };
  });

export const previewSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ voiceId: z.string().uuid(), text: z.string().min(1).max(5000), speed: z.number().min(0.5).max(2).optional(), language: z.string().max(16).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const { data: v } = await s.db.from("avatar_voices").select("provider_voice_id, voice_type, language, status").eq("id", data.voiceId).maybeSingle();
      if (!v) throw new AvatarError("NOT_FOUND");
      if (v.status !== "ready") throw new AvatarError("INVALID_PARAMETERS", "This voice is not ready yet");
      // Professional clones use the HeyGen Voice model endpoint; catalogue/designed/instant use speech.
      if (v.voice_type === "professional_clone") {
        const lang = data.language ?? v.language ?? "en";
        const body: { voice_id: string; text: string; language: string; speed?: number } = { voice_id: v.provider_voice_id, text: data.text, language: lang };
        if (data.speed) body.speed = Math.min(1.25, Math.max(0.75, data.speed));
        const r = await s.HeyGenProvider.generateProfessionalSpeech(body);
        if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage);
        return { audioUrl: r.data!.audio_url, duration: r.data!.duration };
      }
      const body: { text: string; voice_id: string; speed?: number; language?: string } = { text: data.text, voice_id: v.provider_voice_id };
      if (data.speed) body.speed = data.speed;
      if (data.language) body.language = data.language;
      const r = await s.HeyGenProvider.generateSpeech(body);
      if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage);
      return { audioUrl: r.data!.audio_url, duration: r.data!.duration };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- videos
const voiceSettings = z.object({ speed: z.number().min(0.5).max(1.5).optional(), pitch: z.number().min(-50).max(50).optional(), volume: z.number().min(0).max(1).optional(), locale: z.string().max(16).optional() }).optional();
const videoInput = z.object({
  mode: z.enum(["avatar", "image", "audio", "cinematic", "transparent"]),
  title: z.string().max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
  lookId: z.string().uuid().optional(),
  extraLookIds: z.array(z.string().uuid()).max(2).optional(),
  imageAssetId: z.string().uuid().optional(),
  engine: z.enum(["avatar_iv", "avatar_v", "avatar_iii"]).optional(),
  referenceLookId: z.string().uuid().optional(),
  voiceId: z.string().uuid().optional(),
  script: z.string().max(10000).optional(),
  audioAssetId: z.string().uuid().optional(),
  motionPrompt: z.string().max(1000).optional(),
  expressiveness: z.enum(["low", "medium", "high"]).optional(),
  voiceSettings,
  aspectRatio: z.enum(["auto", "16:9", "9:16", "4:5", "5:4", "1:1"]).default("16:9"),
  resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  captions: z.boolean().default(false),
  background: z.object({ type: z.literal("color"), value: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
  removeBackground: z.boolean().optional(),
  cinematicPrompt: z.string().max(10000).optional(),
  cinematicReferenceAssetIds: z.array(z.string().uuid()).max(6).optional(),
  duration: z.number().int().min(4).max(15).optional(),
  autoDuration: z.boolean().optional(),
  enhancePrompt: z.boolean().optional(),
  attestation: attestationSchema.optional(),
  clientRequestId: z.string().min(8).max(64),
  batchParentId: z.string().uuid().nullable().optional(),
});
type VideoInput = z.infer<typeof videoInput>;

async function buildAndSubmitVideo(data: VideoInput, userId: string) {
  const s = await svc();
  const body: Record<string, unknown> = { title: data.title || "Xeno avatar video" };
  let look: { id: string; provider_look_id: string; supported_engines: unknown; avatar_type: string | null; training_status: string | null; character_id: string; default_provider_voice_id: string | null } | null = null;
  let voice: { id: string; provider_voice_id: string; status: string } | null = null;

  if (data.lookId) {
    const { data: l } = await s.db.from("avatar_looks").select("id,provider_look_id,supported_engines,avatar_type,training_status,character_id,default_provider_voice_id").eq("id", data.lookId).is("deleted_at", null).maybeSingle();
    if (!l) throw new AvatarError("INVALID_PARAMETERS", "Selected look not found");
    look = l;
    if (l.training_status === "pending_consent") throw new AvatarError("CONSENT_REQUIRED");
    if (l.training_status && !["completed"].includes(l.training_status)) throw new AvatarError("INVALID_PARAMETERS", "This look is still being prepared at HeyGen");
  }
  if (data.voiceId) {
    const { data: v } = await s.db.from("avatar_voices").select("id,provider_voice_id,status").eq("id", data.voiceId).maybeSingle();
    if (!v || v.status !== "ready") throw new AvatarError("INVALID_PARAMETERS", "Selected voice is not ready");
    voice = v;
  }

  const speechFields = async () => {
    if (data.audioAssetId) {
      body["audio_url"] = (await s.providerUrlForAsset(data.audioAssetId)).ref.type === "url" ? ((await s.providerUrlForAsset(data.audioAssetId)).ref as { url: string }).url : undefined;
    } else {
      if (!data.script?.trim()) throw new AvatarError("INVALID_PARAMETERS", "Write a script or choose an audio file");
      body["script"] = data.script;
      if (voice) body["voice_id"] = voice.provider_voice_id;
      else if (!look?.default_provider_voice_id && data.mode !== "avatar") throw new AvatarError("INVALID_PARAMETERS", "Choose a voice");
      if (data.voiceSettings && Object.keys(data.voiceSettings).length) body["voice_settings"] = data.voiceSettings;
    }
  };

  let jobType = "avatar_video";
  if (data.mode === "cinematic") {
    jobType = "cinematic_avatar_video";
    if (!look) throw new AvatarError("INVALID_PARAMETERS", "Choose a look for the cinematic avatar");
    if (!data.cinematicPrompt?.trim()) throw new AvatarError("INVALID_PARAMETERS", "Describe the scene");
    const ids = [look.provider_look_id];
    for (const extra of data.extraLookIds ?? []) {
      const { data: l } = await s.db.from("avatar_looks").select("provider_look_id").eq("id", extra).maybeSingle();
      if (l) ids.push(l.provider_look_id);
    }
    body["type"] = "cinematic_avatar";
    body["prompt"] = data.cinematicPrompt;
    body["avatar_id"] = ids.slice(0, 3);
    body["aspect_ratio"] = ["16:9", "9:16", "1:1"].includes(data.aspectRatio) ? data.aspectRatio : "16:9";
    body["resolution"] = data.resolution === "720p" ? "720p" : "1080p";
    if (data.autoDuration) body["auto_duration"] = true;
    else if (data.duration) body["duration"] = data.duration;
    if (data.enhancePrompt) body["enhance_prompt"] = true;
    if (data.cinematicReferenceAssetIds?.length) {
      const refs = [];
      for (const id of data.cinematicReferenceAssetIds) refs.push((await s.providerUrlForAsset(id)).ref);
      body["references"] = refs;
    }
  } else if (data.mode === "image") {
    jobType = "image_avatar_video";
    if (!data.imageAssetId) throw new AvatarError("INVALID_PARAMETERS", "Choose an image");
    if (!data.attestation) throw new AvatarError("ATTESTATION_REQUIRED");
    await attest(userId, "photo_identity", "image_avatar_video", [data.imageAssetId], data.attestation.permissionNote);
    body["type"] = "image";
    body["image"] = (await s.providerUrlForAsset(data.imageAssetId)).ref;
    await speechFields();
    if (data.motionPrompt) body["motion_prompt"] = data.motionPrompt;
    if (data.expressiveness) body["expressiveness"] = data.expressiveness;
    body["aspect_ratio"] = data.aspectRatio;
    body["resolution"] = data.resolution;
  } else {
    // avatar / audio / transparent: all render a registered look
    if (!look) throw new AvatarError("INVALID_PARAMETERS", "Choose a character and look");
    jobType = data.mode === "audio" ? "audio_avatar_video" : data.mode === "transparent" ? "transparent_avatar_video" : "avatar_video";
    if (data.mode === "audio" && !data.audioAssetId) throw new AvatarError("INVALID_PARAMETERS", "Choose the audio to lip-sync");
    body["type"] = "avatar";
    body["avatar_id"] = look.provider_look_id;
    await speechFields();
    const engines = (Array.isArray(look.supported_engines) ? look.supported_engines : []) as string[];
    const engine = data.engine ?? (engines.includes("avatar_iv") ? "avatar_iv" : engines[0]);
    if (engine && engines.length && !engines.includes(engine)) throw new AvatarError("INVALID_PARAMETERS", `This look does not support ${engine.replace("avatar_", "Avatar ").toUpperCase()}`);
    if (engine === "avatar_v") {
      const cfg: Record<string, unknown> = { type: "avatar_v" };
      if (data.referenceLookId) {
        const { data: ref } = await s.db.from("avatar_looks").select("provider_look_id, character_id").eq("id", data.referenceLookId).maybeSingle();
        if (!ref || ref.character_id !== look.character_id) throw new AvatarError("INVALID_PARAMETERS", "The reference look must belong to the same avatar");
        cfg["reference_look_id"] = ref.provider_look_id;
      }
      body["engine"] = cfg;
      if (data.motionPrompt) body["motion_prompt"] = data.motionPrompt;
      // expressiveness is Avatar IV-only and rejected by Avatar V
    } else if (engine) {
      body["engine"] = { type: engine };
      if (data.motionPrompt) body["motion_prompt"] = data.motionPrompt;
      if (engine === "avatar_iv" && data.expressiveness && look.avatar_type === "photo_avatar") body["expressiveness"] = data.expressiveness;
    }
    body["aspect_ratio"] = data.aspectRatio;
    body["resolution"] = data.resolution;
    if (data.mode === "transparent") {
      body["output_format"] = "webm";
      body["remove_background"] = true;
    } else {
      if (data.removeBackground) body["remove_background"] = true;
      if (data.background) body["background"] = data.background;
    }
  }
  if (data.captions && data.mode !== "cinematic") body["caption"] = { file_format: "srt" };

  const { job, existing } = await s.createJob({
    jobType: data.batchParentId ? "batch_video" : jobType,
    userId,
    projectId: data.projectId ?? null,
    inputPayload: {
      title: data.title ?? null,
      mode: data.mode,
      look_id: data.lookId ?? null,
      voice_id: data.voiceId ?? null,
      image_asset_id: data.imageAssetId ?? null,
      audio_asset_id: data.audioAssetId ?? null,
      script: data.script ?? null,
    },
    normalizedInput: { ...body, image: body["image"] ? "[signed url]" : undefined, audio_url: body["audio_url"] ? "[signed url]" : undefined, references: body["references"] ? "[signed urls]" : undefined },
    clientRequestId: data.clientRequestId,
    providerResourceType: "video",
    parentJobId: data.batchParentId ?? null,
  });
  if (existing) return { jobId: job.id, status: job.status, existing: true };

  await s.db.from("avatar_videos").insert({
    job_id: job.id,
    project_id: data.projectId ?? null,
    character_id: look?.character_id ?? null,
    look_id: look?.id ?? null,
    voice_id: voice?.id ?? null,
    video_type: data.mode,
    engine: ((body["engine"] as { type?: string } | undefined)?.type ?? (data.mode === "cinematic" ? "cinematic" : null)) as string | null,
    script: data.script ?? null,
    audio_asset_id: data.audioAssetId ?? null,
    motion_prompt: data.motionPrompt ?? null,
    aspect_ratio: (body["aspect_ratio"] as string) ?? null,
    resolution: (body["resolution"] as string) ?? null,
    output_format: (body["output_format"] as string) ?? "mp4",
    created_by: userId,
  });
  const result = await s.submitOnce(job, (key) => s.HeyGenProvider.createVideo(body, key), async (res) => {
    await s.db.from("avatar_videos").update({ provider_video_id: res.video_id, provider_status: res.status ?? "pending" }).eq("job_id", job.id);
    return { providerRequestId: res.video_id, status: "provider_processing" };
  });
  return { jobId: job.id, ...result };
}

export const submitAvatarVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => videoInput.parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags();
      await requireHeyGen();
      return await buildAndSubmitVideo(data, context.userId);
    } catch (e) {
      toError(e);
    }
  });

/** Batch: each row is its own job with its own idempotency key, so one failure never affects siblings. */
export const submitAvatarBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable().optional(),
        clientRequestId: z.string().min(8).max(64),
        rows: z
          .array(z.object({ lookId: z.string().uuid(), voiceId: z.string().uuid().optional(), script: z.string().min(1).max(5000), title: z.string().max(200).optional(), aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5", "5:4", "auto"]).default("16:9"), resolution: z.enum(["720p", "1080p"]).default("1080p") }))
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags("avatar_batch_enabled");
      await requireHeyGen();
      const { job: parent, existing } = await s.createJob({
        jobType: "batch_video",
        userId: context.userId,
        projectId: data.projectId ?? null,
        inputPayload: { rows: data.rows.length },
        clientRequestId: data.clientRequestId,
        providerResourceType: "batch",
      });
      if (existing) return { batchJobId: parent.id, results: [] };
      await s.db.from("avatar_jobs").update({ status: "provider_processing", submission_state: "accepted" }).eq("id", parent.id);
      const results = [];
      for (const [i, row] of data.rows.entries()) {
        try {
          const r = await buildAndSubmitVideo(
            { mode: "avatar", lookId: row.lookId, voiceId: row.voiceId, script: row.script, title: row.title ?? `Batch row ${i + 1}`, aspectRatio: row.aspectRatio, resolution: row.resolution, captions: false, projectId: data.projectId ?? null, clientRequestId: `${data.clientRequestId}:${i}`, batchParentId: parent.id },
            context.userId,
          );
          results.push({ row: i, ...r });
        } catch (e) {
          results.push({ row: i, ok: false, status: "failed", errorMessage: e instanceof Error ? e.message : "Failed" });
        }
      }
      const okCount = results.filter((r) => "ok" in r && r.ok).length;
      await s.db.from("avatar_jobs").update({ status: okCount ? "completed" : "failed", output_payload: { submitted: okCount, total: data.rows.length } as never, completed_at: new Date().toISOString() }).eq("id", parent.id);
      return { batchJobId: parent.id, results };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- job control
export const refreshAvatarJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const { data: job } = await s.db.from("avatar_jobs").select("*").eq("id", data.jobId).maybeSingle();
      if (!job) throw new AvatarError("NOT_FOUND");
      await s.pollJob(job as never);
      return { ok: true };
    } catch (e) {
      toError(e);
    }
  });

/** Explicit human decision after an uncertain submission: creates a NEW linked job. */
export const resubmitUncertainJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), confirm: z.literal(true), clientRequestId: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      const { data: job } = await s.db.from("avatar_jobs").select("*").eq("id", data.jobId).maybeSingle();
      if (!job || !["submission_uncertain", "failed"].includes(job.status)) throw new AvatarError("INVALID_PARAMETERS", "Only uncertain or failed jobs can be resubmitted");
      const video = ["avatar_video", "image_avatar_video", "audio_avatar_video", "cinematic_avatar_video", "transparent_avatar_video"].includes(job.job_type);
      if (!video) throw new AvatarError("INVALID_PARAMETERS", "Start this again from its page (training and cloning are never resubmitted automatically)");
      const normalized = job.normalized_input as Record<string, unknown>;
      if (Object.values(normalized).some((v) => typeof v === "string" && v.startsWith("[signed"))) {
        throw new AvatarError("INVALID_PARAMETERS", "This job used uploaded media — use Recreate in Generate to resubmit it");
      }
      const { job: next } = await s.createJob({
        jobType: job.job_type,
        userId: context.userId,
        projectId: job.project_id,
        inputPayload: job.input_payload as Record<string, unknown>,
        normalizedInput: normalized,
        clientRequestId: data.clientRequestId,
        providerResourceType: "video",
        parentJobId: job.id,
      });
      await s.logJobEvent(job.id, "retry_requested", { new_job_id: next.id, by: context.userId });
      const { data: oldVideo } = await s.db.from("avatar_videos").select("*").eq("job_id", job.id).maybeSingle();
      if (oldVideo) {
        const { id: _id, provider_video_id: _p, generated_asset_id: _g, thumbnail_asset_id: _t, completed_at: _c, created_at: _ca, ...rest } = oldVideo;
        await s.db.from("avatar_videos").insert({ ...rest, job_id: next.id, provider_status: null, created_by: context.userId });
      }
      const r = await s.submitOnce(next, (key) => s.HeyGenProvider.createVideo(normalized, key), async (res) => {
        await s.db.from("avatar_videos").update({ provider_video_id: res.video_id }).eq("job_id", next.id);
        return { providerRequestId: res.video_id };
      });
      return { jobId: next.id, ...r };
    } catch (e) {
      toError(e);
    }
  });

export const retryIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      const { data: job } = await s.db.from("avatar_jobs").select("*").eq("id", data.jobId).maybeSingle();
      if (!job) throw new AvatarError("NOT_FOUND");
      if (job.job_type === "translation" || job.job_type === "lipsync") {
        await s.db.from("avatar_localizations").update({ status: "pending" }).eq("job_id", job.id).eq("status", "ingest_failed");
        await s.db.from("avatar_jobs").update({ status: "provider_processing" }).eq("id", job.id);
        await s.pollJob({ ...(job as Record<string, unknown>), status: "provider_processing" } as never);
      } else await s.ingestVideoJob(job.id);
      return { ok: true };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- localization
export const listTranslationLanguages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await requireHeyGen();
      const r = await s.HeyGenProvider.listTranslationLanguages();
      if (!r.ok) throw new AvatarError(r.errorCode ?? "PROVIDER_UNAVAILABLE", r.errorMessage);
      return r.data?.languages ?? [];
    } catch (e) {
      toError(e);
    }
  });

export const submitLocalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["translation", "lipsync"]),
        sourceAssetId: z.string().uuid(),
        audioAssetId: z.string().uuid().optional(),
        languages: z.array(z.string().min(2).max(80)).max(20).default([]),
        mode: z.enum(["speed", "precision"]).default("speed"),
        speakerCount: z.number().int().min(1).max(10).optional(),
        translateAudioOnly: z.boolean().optional(),
        speechEnhancement: z.boolean().optional(),
        projectId: z.string().uuid().nullable().optional(),
        clientRequestId: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags("avatar_localization_enabled");
      await requireHeyGen();
      const { ref: video, asset } = await s.providerUrlForAsset(data.sourceAssetId);
      if (asset["asset_type"] !== "video") throw new AvatarError("INVALID_PARAMETERS", "Choose a video");
      if (asset["sensitivity"] !== "normal") throw new AvatarError("INVALID_PARAMETERS", "Private training media can't be localized");
      const body: Record<string, unknown> = { video, mode: data.mode, title: (asset["title"] as string) || "Xeno localization" };
      if (data.kind === "translation") {
        if (!data.languages.length) throw new AvatarError("INVALID_PARAMETERS", "Choose at least one language");
        body["output_languages"] = data.languages;
        if (data.speakerCount) body["speaker_num"] = data.speakerCount;
        if (data.translateAudioOnly) body["translate_audio_only"] = true;
        if (data.speechEnhancement) body["enable_speech_enhancement"] = true;
      } else {
        if (!data.audioAssetId) throw new AvatarError("INVALID_PARAMETERS", "Choose the replacement audio");
        body["audio"] = (await s.providerUrlForAsset(data.audioAssetId)).ref;
      }
      const { job, existing } = await s.createJob({
        jobType: data.kind,
        userId: context.userId,
        projectId: data.projectId ?? null,
        inputPayload: { source_asset_id: data.sourceAssetId, audio_asset_id: data.audioAssetId ?? null, languages: data.languages, mode: data.mode },
        normalizedInput: { ...body, video: "[signed url]", audio: body["audio"] ? "[signed url]" : undefined },
        clientRequestId: data.clientRequestId,
        providerResourceType: data.kind,
      });
      if (existing) return { jobId: job.id, status: job.status };
      const r = await s.submitOnce(
        job,
        async (key) => {
          if (data.kind === "translation") {
            const res = await s.HeyGenProvider.createTranslation(body, key);
            return res.ok ? { ...res, data: { ids: res.data!.video_translation_ids } } : (res as never);
          }
          const res = await s.HeyGenProvider.createLipsync(body, key);
          return res.ok ? { ...res, data: { ids: [res.data!.lipsync_id] } } : (res as never);
        },
        async (res: { ids: string[] }) => {
          for (const [i, id] of res.ids.entries()) {
            await s.db.from("avatar_localizations").insert({
              job_id: job.id,
              project_id: data.projectId ?? null,
              kind: data.kind,
              source_asset_id: data.sourceAssetId,
              audio_asset_id: data.audioAssetId ?? null,
              provider_resource_id: id,
              target_language: data.kind === "translation" ? (data.languages[i] ?? null) : null,
              mode: data.mode,
              status: "pending",
              created_by: context.userId,
            });
          }
          return { providerRequestId: res.ids[0] ?? null, output: { provider_ids: res.ids } };
        },
      );
      return { jobId: job.id, ...r };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- webhook registration (admin)
export const registerAvatarWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target: z.enum(["preview", "live"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await requireAdmin(context.userId);
      await requireHeyGen();
      const { WEBHOOK_EVENTS } = await import("../server/heygen.server");
      const base =
        data.target === "live"
          ? process.env["PUBLIC_APP_URL"] || "https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e.lovable.app"
          : "https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e-dev.lovable.app";
      const url = `${base.replace(/\/+$/, "")}/api/public/avatar-heygen-webhook`;
      const { data: current } = await s.db.from("avatar_settings").select("value").eq("key", "webhook_endpoint").maybeSingle();
      const prev = current?.value as { endpoint_id?: string } | null;
      const r = await s.HeyGenProvider.registerWebhook(url, WEBHOOK_EVENTS);
      if (!r.ok || !r.data?.secret) throw new AvatarError(r.errorCode ?? "PROVIDER_REJECTED", r.errorMessage ?? "HeyGen did not return a signing secret");
      const { error } = await s.db.rpc("avatar_set_provider_secret", { _name: "HEYGEN_WEBHOOK_SECRET", _value: r.data.secret, _meta: { endpoint_id: r.data.endpoint_id } as never });
      if (error) throw new AvatarError("UNKNOWN", "Could not store the signing secret");
      if (prev?.endpoint_id && prev.endpoint_id !== r.data.endpoint_id) await s.HeyGenProvider.deleteWebhook(prev.endpoint_id);
      await s.db.from("avatar_settings").upsert({ key: "webhook_endpoint", value: { endpoint_id: r.data.endpoint_id, url, registered_at: new Date().toISOString() } as never, updated_by: context.userId, updated_at: new Date().toISOString() });
      await s.audit(context.userId, "webhook_registered", null, null, { url });
      return { url };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- creative bridge
export const sendToCreativeStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetId: z.string().uuid(), creativeProjectId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags("avatar_creative_bridge_enabled");
      const { data: asset } = await s.db.from("avatar_assets").select("*").eq("id", data.assetId).is("deleted_at", null).maybeSingle();
      if (!asset) throw new AvatarError("NOT_FOUND");
      const finalRoles = ["generated_video", "generated_audio", "translated_video", "lipsynced_video", "thumbnail"];
      if (asset.sensitivity !== "normal" || !finalRoles.includes(asset.asset_role)) throw new AvatarError("INVALID_PARAMETERS", "Only finished production media can be sent to Creative Studio");
      const { data: prior } = await s.db.from("avatar_creative_bridges").select("creative_asset_id").eq("avatar_asset_id", asset.id).maybeSingle();
      if (prior?.creative_asset_id) return { creativeAssetId: prior.creative_asset_id, existing: true };
      const dl = await s.db.storage.from(asset.storage_bucket).download(asset.storage_path);
      if (dl.error || !dl.data) throw new AvatarError("UNKNOWN", "Could not read the file");
      const ext = asset.storage_path.split(".").pop() ?? "mp4";
      const scope = data.creativeProjectId ? `projects/${data.creativeProjectId}` : `unassigned/${context.userId}`;
      const path = `${scope}/avatar-bridge/${asset.id}.${ext}`;
      const up = await s.db.storage.from("generated-assets").upload(path, dl.data, { ...(asset.mime_type ? { contentType: asset.mime_type } : {}), upsert: true });
      if (up.error) throw new AvatarError("UNKNOWN", "Could not copy into Creative Studio");
      const { data: creative, error } = await s.db
        .from("assets")
        .insert({
          project_id: data.creativeProjectId ?? null,
          uploaded_by: context.userId,
          asset_type: asset.asset_type === "document" ? "image" : (asset.asset_type as "image" | "video" | "audio"),
          source_type: "uploaded",
          title: `${asset.title ?? "Avatar Studio output"} (from Avatar Studio)`,
          storage_bucket: "generated-assets",
          storage_path: path,
          mime_type: asset.mime_type,
          file_size: asset.file_size,
          duration_seconds: asset.duration_seconds,
          metadata: { origin: "avatar_studio", avatar_asset_id: asset.id } as never,
        })
        .select("id")
        .single();
      if (error) throw new AvatarError("UNKNOWN", "Could not register in Creative Studio");
      await s.db.from("avatar_creative_bridges").insert({ avatar_asset_id: asset.id, creative_asset_id: creative.id, bridged_by: context.userId });
      return { creativeAssetId: creative.id as string, existing: false };
    } catch (e) {
      toError(e);
    }
  });

// ---------------------------------------------------------------- realtime
export const startRealtimeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ personaId: z.string().uuid().nullable(), sandbox: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    try {
      await s.requireActiveMember(context.userId);
      await s.requireFlags("avatar_realtime_enabled");
      const { HeyGenLiveAvatarProvider, liveAvatarConfigured, SANDBOX_AVATAR_ID } = await import("../server/liveavatar.server");
      if (!liveAvatarConfigured()) throw new AvatarError("LIVEAVATAR_NOT_CONFIGURED");
      let persona: { id: string; liveavatar_avatar_id: string | null; liveavatar_voice_id: string | null; liveavatar_context_id: string | null; language: string; max_session_seconds: number; mode: string } | null = null;
      if (data.personaId) {
        const { data: p } = await s.db.from("avatar_realtime_personas").select("*").eq("id", data.personaId).eq("is_active", true).maybeSingle();
        if (!p) throw new AvatarError("NOT_FOUND", "Persona not found");
        if (p.mode !== "managed") throw new AvatarError("INVALID_PARAMETERS", "Custom GPT-Live personas need the realtime orchestrator service, which is not deployed yet");
        persona = p;
      }
      if (!data.sandbox && !persona?.liveavatar_avatar_id) throw new AvatarError("INVALID_PARAMETERS", "This persona has no LiveAvatar avatar set");
      const { data: session } = await s.db
        .from("avatar_realtime_sessions")
        .insert({ persona_id: persona?.id ?? null, created_by: context.userId, mode: "managed", is_sandbox: data.sandbox, status: "requested", last_heartbeat_at: new Date().toISOString() })
        .select("id")
        .single();
      const sid = session!.id as string;
      const tokenBody: Parameters<typeof HeyGenLiveAvatarProvider.createSessionToken>[0] = {
        mode: "FULL",
        avatar_id: data.sandbox ? SANDBOX_AVATAR_ID : persona!.liveavatar_avatar_id!,
        is_sandbox: data.sandbox,
        max_session_duration: persona?.max_session_seconds ?? 600,
      };
      const personaCfg: { voice_id?: string; context_id?: string; language?: string } = { language: persona?.language ?? "en" };
      if (persona?.liveavatar_voice_id) personaCfg.voice_id = persona.liveavatar_voice_id;
      if (persona?.liveavatar_context_id) personaCfg.context_id = persona.liveavatar_context_id;
      tokenBody.avatar_persona = personaCfg;
      const tok = await HeyGenLiveAvatarProvider.createSessionToken(tokenBody);
      const fail = async (msg: string) => {
        await s.db.from("avatar_realtime_sessions").update({ status: "failed", error_message: msg, ended_at: new Date().toISOString() }).eq("id", sid);
        await s.db.from("avatar_settings").upsert({ key: "liveavatar_last_error", value: { at: new Date().toISOString(), message: msg } as never });
        throw new AvatarError("PROVIDER_REJECTED", `LiveAvatar: ${msg}`);
      };
      if (!tok.ok || !tok.data) await fail(tok.errorMessage ?? "token request failed");
      await s.db.from("avatar_realtime_session_secrets").insert({ session_id: sid, session_token: tok.data!.session_token });
      await s.db.from("avatar_realtime_sessions").update({ status: "token_issued", provider_session_id: tok.data!.session_id }).eq("id", sid);
      const started = await HeyGenLiveAvatarProvider.startSession(tok.data!.session_token);
      if (!started.ok || !started.data) {
        await (await import("../server/realtime.server")).stopRealtimeSession(sid, "USER_DISCONNECTED");
        await fail(started.errorMessage ?? "session start failed");
      }
      await s.db.from("avatar_realtime_sessions").update({ status: "active", started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() }).eq("id", sid);
      await s.db.from("avatar_settings").upsert({ key: "liveavatar_last_success_at", value: new Date().toISOString() as never });
      return { sessionId: sid, livekitUrl: started.data!.livekit_url, livekitToken: started.data!.livekit_client_token, maxSeconds: started.data!.max_session_duration ?? tokenBody.max_session_duration ?? 600 };
    } catch (e) {
      toError(e);
    }
  });

export const realtimeHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    const { data: row } = await s.db.from("avatar_realtime_sessions").select("id,status,created_by,provider_session_id").eq("id", data.sessionId).maybeSingle();
    if (!row || row.created_by !== context.userId || row.status !== "active") return { active: false };
    await s.db.from("avatar_realtime_sessions").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", row.id);
    const { data: secret } = await s.db.from("avatar_realtime_session_secrets").select("session_token").eq("session_id", row.id).maybeSingle();
    if (secret && row.provider_session_id) {
      const { HeyGenLiveAvatarProvider } = await import("../server/liveavatar.server");
      await HeyGenLiveAvatarProvider.keepAlive(secret.session_token, row.provider_session_id);
    }
    return { active: true };
  });

export const stopRealtime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await svc();
    const p = await s.requireActiveMember(context.userId);
    const { data: row } = await s.db.from("avatar_realtime_sessions").select("created_by").eq("id", data.sessionId).maybeSingle();
    if (!row) return { ok: true };
    if (row.created_by !== context.userId && p.role !== "admin") throw new Error("Only the session owner or an admin can stop it");
    await (await import("../server/realtime.server")).stopRealtimeSession(data.sessionId, "USER_CLOSED");
    return { ok: true };
  });
