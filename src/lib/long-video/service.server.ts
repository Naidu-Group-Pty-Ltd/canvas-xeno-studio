/**
 * Running long videos.
 *
 * A run is a chain of clips. Clip 1 is generated as set up; when its video is
 * in the library, the media service measures it and takes its last frame;
 * clip 2 is generated from that frame, and so on until the last clip. (Clips
 * made by a video extend workflow are given the clip before itself instead;
 * one that comes back joined to it has its own footage separated out.)
 *
 * Everything here moves a run one safe step at a time and can be called from
 * anywhere, as often as you like: the Higgsfield webhook (a clip finished
 * saving), the media-service callback (a measurement or frame came back), the
 * reconcile job (anything missed) and people (start, retry, continue). Each
 * step is a conditional update, so two callers can never both take it: a clip
 * is generated once per attempt, and its handoff frame taken once per try.
 *
 * Paid work is never repeated on its own: a clip that fails (or whose
 * submission is uncertain) stops the run until a person retries it.
 *
 * Characters: a run made with characters keeps a copy of them (their names,
 * looks and reference sheets) and, with its identity check on, has the
 * studio's AI compare frames of every clip with their images before the next
 * clip is started; a character who changed stops the run for a person
 * (CHARACTER_CHECK). Keyframes: a keyframed run paints the frame the video
 * opens on and the frame each clip ends on first (its storyboard), then each
 * clip moves from where the last one really ended into its keyframe. A
 * storyboard to review stops the run for a person too (STORYBOARD_READY).
 * Slow steps (the AI's check) run under a lease, so a step cut short is taken
 * up again and only one answer is ever written.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { assertGenerationAllowed, createAndSubmitGeneration } from "../generation-create.server";
import { mediaWorkerConfigured } from "../media/worker.server";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import {
  compileFromLongVideo,
  compileFromVoiceoverLongVideo,
  type LongVideoEndCard,
  type LongVideoSeam,
  type VoiceoverTrack,
} from "../edit/compile";
import { compilePresenterEdit, type PresenterTitle } from "../edit/presenter";
import { applyBrandKit, brandKitOf, kitForProject, type BrandKit } from "../edit/brand";
import { soulStillValues } from "../characters/views";
import { isMissingTableError } from "../edit/errors";
import type { ModelRegistryEntry } from "../model-schema";
import { storedFinale, storeFinale } from "./finisher";
import {
  cameraMotionOf,
  countedLength,
  extensionLead,
  frameTrimStart,
  handoffFrameOf,
  inclusiveCut,
  indexedFrameOf,
  withCameraLine,
} from "./handoff";
import {
  castOf,
  clipEnd,
  clipKeyframes,
  clipStart,
  durationChoices,
  extendsVideo,
  finaleHolds,
  finaleReveals,
  HANDOFF_MARGINS_SECONDS,
  LONG_VIDEO_LIMITS,
  planClips,
  planIssues,
  promptBudget,
  startFrameSlot,
  totalSeconds,
  type ClipDraft,
  type PlannedClip,
  type RunFinale,
  type RunReference,
} from "./plan";
import {
  clipQuote,
  keyframeBeat,
  keyframeInputs,
  keyframePainters,
  keyframeQuote,
  keyframePrompt,
  KEYFRAME_PROMPT_MAX,
  movesBetweenFrames,
  paintsWithSoul,
  planKeyframes,
  painterValues,
  storedKeyframeSettings,
  type KeyframeSettings,
  type KeyframesPlan,
} from "./keyframes";
import { SOUL_MODEL_PATHS, type RunCharacter, type SoulVersion } from "../characters/model";
import type { IdentityResult } from "../characters/identity.server";
import type { ProviderCall } from "../higgsfield/provider.server";
import { drivingAudioSlot, LIP_SYNC, lipSyncValues } from "../lip-sync/models";
import { cutFrameIndex } from "../lip-sync/placement";
import { normaliseCutaways, type Cutaway } from "../lip-sync/sections";
import {
  bestTake,
  DEFAULT_QC,
  lipLeadOf,
  lipReading,
  storedQc,
  storeQc,
  type QcSettings,
} from "../lip-sync/lip-check";
import { syncOffsetOf, syncReading } from "../lip-sync/sync";
import { readWords } from "../lip-sync/analysis";
import {
  lastClipPlaysOut,
  storedVoiceover,
  storeVoiceover,
  voiceoverModelProblem,
  voiceoverPlanProblems,
  type PlannedPiece,
  type RunVoiceover,
} from "./voiceover";

type RunRow = Database["public"]["Tables"]["long_videos"]["Row"];
type ClipRow = Database["public"]["Tables"]["long_video_clips"]["Row"];
type KeyframeRow = Database["public"]["Tables"]["long_video_keyframes"]["Row"];
type Json = Record<string, unknown>;

/** A clip being started for longer than this was interrupted and is looked at again. */
const CLAIM_STALE_MS = 2 * 60_000;
/** A measurement or frame with no answer after this long is taken as lost and tried again. */
const HANDOFF_TASK_STALE_MS = 10 * 60_000;
/** Failed tries at a handoff (measuring or taking the frame) before a person is asked. */
const MAX_HANDOFF_FAILURES = 5;
/** Steps one call takes at most; the rest is picked up by the next event. */
const MAX_STEPS = 10;
/**
 * A check by the studio's AI is run under a lease this long, longer than the
 * AI is given to answer, so a check cut short (a step whose time ran out) is
 * taken up again once it lapses and only the worker holding it writes.
 */
const CHECK_LEASE_MS = 3 * 60_000;
/** Checks that failed (the AI or the frames weren't there) before a clip is let through unchecked. */
const MAX_CHECK_FAILURES = 3;
/** Leases taken for one check (each cut-short step takes one) before it's given up as unavailable. */
const MAX_CHECK_CLAIMS = 8;
/** Tries at cutting a keyframe to the frame size before its painting is used as it is. */
const MAX_SIZE_ATTEMPTS = 3;

const db = supabaseAdmin;
const now = () => new Date().toISOString();
const clipLabel = (clip: Pick<ClipRow, "position">) => `Clip ${clip.position + 1}`;

/** The generation request key of a clip's attempt: one generation per attempt, ever. */
export function clipRequestKey(clip: Pick<ClipRow, "id" | "attempt">): string {
  return `lvc:${clip.id}:${clip.attempt}`;
}

/** The Soul model a Soul ID of `version` works with, when it is on. */
async function soulModelFor(version: SoulVersion): Promise<ModelRegistryEntry | null> {
  const { data } = await db
    .from("model_registry")
    .select("*")
    .eq("model_path", SOUL_MODEL_PATHS[version])
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as ModelRegistryEntry | null) ?? null;
}

async function loadModel(id: string): Promise<ModelRegistryEntry | null> {
  const { data } = await db.from("model_registry").select("*").eq("id", id).maybeSingle();
  return (data as unknown as ModelRegistryEntry | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Starting a run                                                      */
/* ------------------------------------------------------------------ */

export interface StartLongVideoRequest {
  userId: string;
  title: string;
  firstModelId: string;
  continuationModelId: string;
  story: string;
  continuity: string;
  values: Record<string, unknown>;
  references: { assetId: string; role: string }[];
  clips: ClipDraft[];
  /** The brand's logo or end card the video ends on; never sent with the clips as a reference. */
  finale: RunFinale | null;
  projectId: string | null;
  campaignId: string | null;
  clientRequestId: string | null;
  /** Characters who must look the same throughout (the run keeps its own copy of them). */
  characterIds?: string[];
  /** Check every clip against the characters' images before the next one is made. */
  identityCheck?: boolean;
  /** Paint the keyframes first with this image model, and whether a person reviews them (null: none). */
  keyframes?: {
    painterModelId: string;
    review: boolean;
    /** Paint the opening keyframe from the character's Soul ID (when it shows one character with one). */
    soulOpening?: boolean | undefined;
  } | null;
  /**
   * Made to a voiceover (see ./voiceover): its preparation, and the piece of it
   * each clip is made from, in order (each clip asked for its piece's length).
   */
  voiceover?: {
    preparationId: string;
    pieces: PlannedPiece[];
    keepClipSound?: boolean;
    /** Stretches covered by B-roll (see ../lip-sync/sections): no clip is made for them. */
    cutaways?: Cutaway[];
  } | null;
  /**
   * Where clips start: each from the frame the one before is cut on (chain),
   * or every one from clip 1's start image (anchor), so a likeness never
   * drifts and clips are made side by side.
   */
  startFrom?: "chain" | "anchor";
  /** Lips scored from each clip's picture, and takes to reach a good score. */
  qc?: Partial<QcSettings> | null;
  /**
   * What the whole run is expected to cost (the browser's quote of clip 1,
   * by the second): checked against spending limits before anything starts.
   */
  estimatedCostUsd?: number | null;
}

const TABLES_MISSING =
  "Long videos need a database update (migration 0010_long_videos). Ask an admin to apply it.";
const CHARACTER_TABLES_MISSING =
  "Characters and keyframes need a database update (migration 0011_characters_and_keyframes). Ask an admin to apply it.";
const VOICEOVER_TABLES_MISSING =
  "Videos made to a voiceover need a database update (migration 0014_voiceover_lip_sync). Ask an admin to apply it.";
const PRESENTER_TABLES_MISSING =
  "Starting clips from one frame, B-roll cutaways and lip scores need a database update (migration 0017_presenter_runs). Ask an admin to apply it.";

/**
 * A run's voiceover, checked: ready and usable, on models that move lips to
 * it, and cut as the plan the browser showed says (checked again here).
 */
async function voiceoverForRun(
  request: StartLongVideoRequest,
  first: ModelRegistryEntry,
  continuation: ModelRegistryEntry,
): Promise<{
  preparationId: string;
  /** The voiceover's own files (as given, and prepared): the voiceover, not references. */
  files: Set<string>;
  pieces: PlannedPiece[];
  stored: RunVoiceover;
}> {
  const asked = request.voiceover!;
  const problem = voiceoverModelProblem(first, continuation);
  if (problem) throw new AppError("INVALID_PARAMETERS", problem);
  const { usableVoiceover } = await import("../lip-sync/prepare.server");
  const { row, view, title } = await usableVoiceover(asked.preparationId);
  const durationSeconds = Number(row.samples) / Number(row.sample_rate);
  // Cutaways as the browser planned around them: checked as given (a plan
  // made around other cutaways is refused), kept as a plan keeps them.
  const cutaways = asked.cutaways?.length
    ? normaliseCutaways(asked.cutaways, durationSeconds, LIP_SYNC.gridFps)
    : [];
  const problems = voiceoverPlanProblems({
    pieces: asked.pieces,
    clipSeconds: request.clips.map((clip) => clip.durationSeconds),
    durationSeconds,
    first,
    continuation,
    cutaways: asked.cutaways?.length ? asked.cutaways : null,
  });
  if (problems.length) throw new AppError("INVALID_PARAMETERS", problems.join(" "));
  return {
    preparationId: row.id,
    files: new Set([row.source_asset_id, view.preparedAssetId!]),
    pieces: asked.pieces,
    stored: {
      preparedAssetId: view.preparedAssetId!,
      durationSeconds: Number(durationSeconds.toFixed(6)),
      sampleRate: Number(row.sample_rate),
      samples: Number(row.samples),
      fps: LIP_SYNC.gridFps,
      headroomSeconds: LIP_SYNC.headroomSeconds,
      title,
      keepClipSound: asked.keepClipSound === true,
      cutaways,
    },
  };
}

/** A run's characters as it keeps them (long_videos.characters). */
function storedCharacters(value: unknown): RunCharacter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const id = typeof record["id"] === "string" ? record["id"] : null;
    if (!id) return [];
    const images = Array.isArray(record["images"])
      ? (record["images"] as Record<string, unknown>[])
      : [];
    const soul = (record["soul"] ?? null) as Record<string, unknown> | null;
    const version = soul?.["version"];
    return [
      {
        id,
        name: typeof record["name"] === "string" ? record["name"] : "Character",
        description: typeof record["description"] === "string" ? record["description"] : "",
        images: images.flatMap((image) =>
          typeof image["asset_id"] === "string"
            ? [
                {
                  assetId: image["asset_id"],
                  view: (image["view"] as RunCharacter["images"][number]["view"]) ?? "other",
                },
              ]
            : [],
        ),
        ...(soul &&
        typeof soul["reference_id"] === "string" &&
        (version === "v1" || version === "v2" || version === "cinema")
          ? { soul: { version, referenceId: soul["reference_id"] } }
          : {}),
      },
    ];
  });
}

/** A run's characters as stored on it (with the Soul ID each had, if any). */
function characterSnapshot(characters: RunCharacter[]) {
  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
    images: character.images.map((image) => ({ asset_id: image.assetId, view: image.view })),
    ...(character.soul
      ? { soul: { version: character.soul.version, reference_id: character.soul.referenceId } }
      : {}),
  }));
}

/** Whether a run checks its clips against its characters. */
function checksCharacters(run: Pick<RunRow, "identity_check" | "characters">): boolean {
  return run.identity_check === true && storedCharacters(run.characters).length > 0;
}

/**
 * Whether a whole run fits its spending limits before it starts: a project's
 * or campaign's hard limit, or (with neither) its owner's monthly cap. A run
 * that wouldn't is refused up front, rather than stopping half made. Also
 * says, as a warning, when the Higgsfield balance an admin recorded looks
 * short of it (the figure can be stale, so that never refuses it).
 */
async function runAllowance(request: StartLongVideoRequest): Promise<string[]> {
  const estimate = Number(request.estimatedCostUsd);
  if (!(estimate > 0) || estimate > 100_000) return [];
  const warnings: string[] = [];
  const about = `about $${estimate.toFixed(2)}`;
  if (request.projectId || request.campaignId) {
    const { data } = await db.rpc("check_spend_allowance", {
      _project_id: (request.projectId ?? null) as string,
      _campaign_id: (request.campaignId ?? null) as string,
      _amount: estimate,
    });
    const verdict = (data ?? {}) as {
      allowed?: boolean;
      message?: string;
      warning?: string | null;
    };
    if (verdict.allowed === false)
      throw new AppError(
        "BUDGET_EXCEEDED",
        `This video would cost ${about}. ${verdict.message ?? "That goes over the spending limit."}`,
      );
    if (verdict.warning) warnings.push(verdict.warning);
  } else {
    const { memberAllowance } = await import("../generation-create.server");
    const verdict = await memberAllowance(request.userId, estimate);
    if (!verdict.allowed)
      throw new AppError("BUDGET_EXCEEDED", `This video would cost ${about}. ${verdict.message}`);
    if (verdict.warning) warnings.push(verdict.warning);
  }
  // The balance an admin recorded, less what was spent since.
  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "higgsfield_api_balance")
    .maybeSingle();
  const { readRecordedBalance } = await import("../usage-balance");
  const recorded = readRecordedBalance(setting?.value ?? null);
  if (recorded) {
    const { data: spend } = await db.rpc("higgsfield_api_spend_since", { p_since: recorded.at });
    const spent = spend as { spent_usd?: number; in_flight_usd?: number } | null;
    const left = recorded.usd - Number(spent?.spent_usd ?? 0) - Number(spent?.in_flight_usd ?? 0);
    if (Number.isFinite(left) && left < estimate)
      warnings.push(
        `This video would cost ${about}, and the Higgsfield API balance looks like about $${Math.max(0, left).toFixed(2)}: top it up in the Higgsfield Console, or it will stop part way (Continue picks it up once topped up).`,
      );
  }
  return warnings;
}

export async function startLongVideo(
  request: StartLongVideoRequest,
): Promise<{ longVideoId: string; status: string; duplicate: boolean; warnings?: string[] }> {
  if (request.clientRequestId) {
    const { data: existing, error } = await db
      .from("long_videos")
      .select("id,status")
      .eq("client_request_id", request.clientRequestId)
      .maybeSingle();
    if (isMissingTableError(error)) throw new AppError("UNKNOWN", TABLES_MISSING);
    if (existing) return { longVideoId: existing.id, status: existing.status, duplicate: true };
  }

  const [first, continuation] = await Promise.all([
    loadModel(request.firstModelId),
    loadModel(request.continuationModelId),
  ]);
  if (!first?.is_active || !continuation?.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  if (!mediaWorkerConfigured())
    throw new AppError(
      "INVALID_PARAMETERS",
      "Long videos need the media service, which takes each clip's last frame. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );
  await assertGenerationAllowed(request.userId);
  const warnings = await runAllowance(request);
  const voiced = request.voiceover ? await voiceoverForRun(request, first, continuation) : null;

  // References are checked against the library, never taken from the browser's word.
  const finale = request.finale;
  const ids = [
    ...new Set([
      ...request.references.map((item) => item.assetId),
      ...(finale
        ? [finale.assetId, finale.frameAssetId, finale.sourceAssetId].filter(
            (id): id is string => !!id,
          )
        : []),
    ]),
  ];
  const { data: assets } = ids.length
    ? await db
        .from("assets")
        .select("id,asset_type,width,height")
        .in("id", ids)
        .is("deleted_at", null)
    : {
        data: [] as {
          id: string;
          asset_type: string;
          width: number | null;
          height: number | null;
        }[],
      };
  const references: RunReference[] = [];
  for (const item of request.references) {
    // The voiceover attached as the driving audio is the run's voiceover, not a reference.
    if (voiced?.files.has(item.assetId)) continue;
    const asset = (assets ?? []).find((entry) => entry.id === item.assetId);
    if (!asset)
      throw new AppError("INVALID_PARAMETERS", "A reference file is no longer in the library");
    references.push({
      assetId: asset.id,
      role: item.role,
      assetType: asset.asset_type as RunReference["assetType"],
    });
  }
  if (finale) {
    for (const id of [finale.assetId, finale.frameAssetId, finale.sourceAssetId]) {
      if (!id) continue;
      const asset = (assets ?? []).find((entry) => entry.id === id);
      if (!asset)
        throw new AppError("INVALID_PARAMETERS", "The finisher is no longer in the library");
      if (asset.asset_type !== "image")
        throw new AppError("INVALID_PARAMETERS", "The finisher must be an image");
    }
  }
  if (voiced && references.some((item) => item.assetType === "audio"))
    throw new AppError(
      "INVALID_PARAMETERS",
      "A video made to a voiceover takes its sound from the voiceover alone: remove the other audio.",
    );
  // The finisher ends the video; it isn't one of the clips' references.
  const finisher = new Set(
    [finale?.assetId, finale?.frameAssetId, finale?.sourceAssetId].filter(Boolean),
  );
  const clipReferences = references.filter((item) => !finisher.has(item.assetId));

  const firstChoices = durationChoices(first);
  const laterChoices = durationChoices(continuation);
  for (const [position, clip] of request.clips.entries()) {
    const allowed = position === 0 ? firstChoices : laterChoices;
    if (!allowed.includes(clip.durationSeconds))
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${position + 1} can't be ${clip.durationSeconds}s long with ${(position === 0 ? first : continuation).display_name}`,
      );
  }

  // The characters as they are now: the run keeps its own copy, so changing
  // a character later never changes a video already being made.
  const { charactersForRun } = await import("../characters/service.server");
  const characters = request.characterIds?.length
    ? await charactersForRun(request.characterIds)
    : [];

  // Keyframes: every clip by one workflow that moves from a frame to a frame,
  // painted by an image model that takes reference images, planned exactly as
  // Create plans them (the person's own frames, the shape, the painter).
  let painter: ModelRegistryEntry | null = null;
  let keyframeSettings: KeyframeSettings | null = null;
  let storyboard: KeyframesPlan | null = null;
  const keyframed = !!request.keyframes;
  if (request.keyframes) {
    if (first.id !== continuation.id || !movesBetweenFrames(first))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${first.display_name} can't move from one keyframe to the next. Turn keyframes off or choose another model.`,
      );
    painter = await loadModel(request.keyframes.painterModelId);
    if (!painter?.is_active || !keyframePainters([painter]).length)
      throw new AppError("INVALID_PARAMETERS", "That keyframe model is unavailable");
    const startRole = startFrameSlot(first)?.role ?? null;
    const opening = startRole
      ? clipReferences.find((item) => item.assetType === "image" && item.role === startRole)
      : undefined;
    const openingSize = opening
      ? ((assets ?? []).find((entry) => entry.id === opening.assetId) ?? null)
      : null;
    storyboard = planKeyframes({
      models: [painter],
      painterModelId: painter.id,
      workflow: first,
      values: request.values,
      clips: request.clips.length,
      finale,
      references: clipReferences,
      characters,
      openingSize,
    });
    if (storyboard.issues.length)
      throw new AppError("INVALID_PARAMETERS", storyboard.issues.join("; "));
    keyframeSettings = {
      values: painterValues(painter, storyboard.size.width / storyboard.size.height),
      aspect: storyboard.aspect.label,
      ...storyboard.size,
      unitUsd: null,
    };
    // The opening keyframe from a Soul ID: the character the first beat shows,
    // when it is exactly one and they have one (on a Soul model that's on).
    if (request.keyframes.soulOpening) {
      const opening = castOf(request.clips[0]?.beat ?? "", characters);
      const soul = opening.length === 1 ? opening[0]!.soul : null;
      const soulModel = soul ? await soulModelFor(soul.version) : null;
      if (soul && soulModel)
        keyframeSettings.soulOpening = {
          modelId: soulModel.id,
          characterId: opening[0]!.id,
          version: soul.version,
          referenceId: soul.referenceId,
        };
    }
  }

  // Where clips start: from one frame (the anchor), and in any case after a cutaway.
  const cutawayRun = !!voiced?.stored.cutaways.length;
  const anchored = request.startFrom === "anchor";
  if ((anchored || cutawayRun) && keyframed)
    throw new AppError(
      "INVALID_PARAMETERS",
      anchored
        ? "Keyframes chain every clip from the one before, so they can't be used with every clip starting from one frame. Turn one of them off."
        : "Keyframes can't be used with B-roll cutaways: turn keyframes off.",
    );
  const anchorRole = startFrameSlot(first)?.role ?? null;
  const anchorFrame = anchorRole
    ? (clipReferences.find((item) => item.assetType === "image" && item.role === anchorRole)
        ?.assetId ?? null)
    : null;
  if (anchored) {
    if (clipStart(continuation)?.kind !== "frame")
      throw new AppError(
        "INVALID_PARAMETERS",
        `${continuation.display_name} can't start a clip from a given frame, so its clips can't all start from one. Start each from the one before instead.`,
      );
    if (!anchorFrame)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Every clip starts from clip 1's start image: attach the image the presenter should look like, or start each clip from the one before.",
      );
  }
  // Lips scored from each clip's picture (made to a voiceover only).
  const qc: QcSettings | null =
    voiced && request.qc ? storedQc(storeQc({ ...DEFAULT_QC, ...request.qc })) : null;
  const usesQc = !!qc && (qc.lipCheck || qc.takes > 1);

  const planned = planClips({
    first,
    continuation,
    values: request.values,
    // All of them, the finisher too: a prompt names images by their place
    // among them (<<<image_n>>>). The plan keeps the finisher out of what
    // each clip is sent.
    references,
    clips: request.clips,
    finale,
    characters,
    keyframes: keyframed,
    voiceover: !!voiced,
  });
  // Made to a voiceover, the video is as long as the voiceover.
  const target = voiced
    ? voiced.stored.durationSeconds
    : totalSeconds(request.clips.map((clip) => clip.durationSeconds));
  const issues = planIssues({
    first,
    continuation,
    clips: planned,
    targetSeconds: target,
    finale,
    keyframes: keyframed,
    voiceover: !!voiced,
  });
  if (issues.length)
    throw new AppError("INVALID_PARAMETERS", issues.map((issue) => issue.message).join("; "));

  // Something new is asked of the models (characters' images, keyframes): each
  // kind of request is priced first (free), so one Higgsfield won't take stops
  // the run before anything is paid for.
  let keptClipQuotes: KeptClipQuote[] = [];
  if (characters.length || keyframed) {
    const checked = await preflight({
      planned,
      painter,
      keyframeSettings,
      characters,
      references: clipReferences,
      drivingAudio: voiced
        ? (clip) =>
            pieceInput(clip, {
              preparationId: voiced.preparationId,
              piece: voiced.pieces[clip.position],
              createdBy: request.userId,
              projectId: request.projectId,
              label: `${request.title.trim().slice(0, LONG_VIDEO_LIMITS.titleChars) || "Long video"} · clip ${clip.position + 1}`,
            })
        : null,
      standIn:
        storyboard?.standIn ??
        characters[0]?.images[0]?.assetId ??
        clipReferences.find((item) => item.assetType === "image")?.assetId ??
        null,
    });
    if (checked.problem) throw new AppError("INVALID_PARAMETERS", checked.problem);
    if (keyframeSettings) keyframeSettings.unitUsd = checked.keyframeUsd;
    keptClipQuotes = checked.kept;
  }

  const { data: run, error } = await db
    .from("long_videos")
    .insert({
      title: request.title.trim().slice(0, LONG_VIDEO_LIMITS.titleChars) || "Long video",
      status: "running",
      project_id: request.projectId,
      campaign_id: request.campaignId,
      first_model_id: first.id,
      continuation_model_id: continuation.id,
      story: request.story.slice(0, LONG_VIDEO_LIMITS.storyChars),
      continuity: request.continuity.slice(0, LONG_VIDEO_LIMITS.continuityChars),
      target_seconds: target,
      clip_count: planned.length,
      settings: (voiced
        ? lipSyncValues(request.values, [first, continuation])
        : request.values) as never,
      // The finisher is kept with them, for the Editor's end card.
      references_used: [
        ...clipReferences.map((item) => ({ asset_id: item.assetId, role: item.role })),
        ...(finale ? [storeFinale(finale)] : []),
      ] as never,
      client_request_id: request.clientRequestId,
      created_by: request.userId,
      // Only when used, so a plain long video starts before the database has these.
      ...(characters.length
        ? {
            characters: characterSnapshot(characters),
            identity_check: request.identityCheck !== false,
          }
        : {}),
      ...(painter && keyframeSettings
        ? {
            keyframe_model_id: painter.id,
            // With the clip requests kept to try once the opening keyframe is painted, if any.
            keyframe_settings: keptClipQuotes.length
              ? { ...keyframeSettings, clipQuotes: keptClipQuotes }
              : keyframeSettings,
            storyboard_review: request.keyframes?.review !== false,
          }
        : {}),
      ...(voiced
        ? {
            voiceover_preparation_id: voiced.preparationId,
            voiceover: storeVoiceover(voiced.stored),
          }
        : {}),
      // Only when used, so a run that doesn't starts before the database has these.
      ...(anchored ? { start_from: "anchor" } : {}),
      ...((anchored || cutawayRun) && anchorFrame ? { anchor_frame_asset_id: anchorFrame } : {}),
      ...(usesQc && qc ? { qc_settings: storeQc(qc) } : {}),
    } as never)
    .select("id")
    .single();
  if (error || !run) {
    if (error?.code === "23505" && request.clientRequestId) {
      const { data: raced } = await db
        .from("long_videos")
        .select("id,status")
        .eq("client_request_id", request.clientRequestId)
        .maybeSingle();
      if (raced) return { longVideoId: raced.id, status: raced.status, duplicate: true };
    }
    if (isMissingTableError(error)) throw new AppError("UNKNOWN", TABLES_MISSING);
    if ((anchored || cutawayRun || usesQc) && /column|schema cache/i.test(error?.message ?? ""))
      throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
    if (planned.length < 2 && /clip_count/i.test(error?.message ?? ""))
      throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
    if (voiced && /column|schema cache/i.test(error?.message ?? ""))
      throw new AppError("UNKNOWN", VOICEOVER_TABLES_MISSING);
    if ((characters.length || painter) && /column|schema cache/i.test(error?.message ?? ""))
      throw new AppError("UNKNOWN", CHARACTER_TABLES_MISSING);
    throw new AppError("UNKNOWN", error?.message ?? "The long video could not be recorded");
  }

  const { error: clipsError } = await db.from("long_video_clips").insert(
    planned.map((clip) => ({
      long_video_id: run.id,
      position: clip.position,
      model_registry_id: clip.model.id,
      beat: clip.beat,
      prompt: clip.prompt,
      duration_seconds: clip.durationSeconds,
      parameters: clip.values as never,
      inputs: clip.inputs.map((item) => ({ asset_id: item.assetId, role: item.role })) as never,
      // Its piece of the voiceover (cut, and sent as its driving audio, when it starts).
      ...(voiced
        ? {
            audio_start_seconds: voiced.pieces[clip.position]!.start,
            audio_end_seconds: voiced.pieces[clip.position]!.end,
          }
        : {}),
    })),
  );
  if (clipsError) {
    await db.from("long_videos").delete().eq("id", run.id);
    throw new AppError("UNKNOWN", "The long video's clips could not be recorded");
  }

  if (painter && storyboard) {
    // Its storyboard: the opening frame and the frame each clip ends on, the
    // person's own start and end frames standing in for the first and last.
    const { count, opening, closing } = storyboard;
    const { error: keyframesError } = await db.from("long_video_keyframes").insert(
      Array.from({ length: count }, (_, position) => {
        const own =
          position === 0 && opening
            ? opening.assetId
            : position === count - 1 && closing
              ? closing.assetId
              : null;
        return own
          ? {
              long_video_id: run.id,
              position,
              status: "completed",
              asset_id: own,
              provided: true,
              check_status: "skipped",
              completed_at: now(),
            }
          : { long_video_id: run.id, position };
      }),
    );
    if (keyframesError) {
      await db.from("long_videos").delete().eq("id", run.id);
      throw new AppError(
        "UNKNOWN",
        isMissingTableError(keyframesError)
          ? CHARACTER_TABLES_MISSING
          : "The long video's keyframes could not be recorded",
      );
    }
  }

  // The whole run's estimate, kept with it (only where the database has it).
  const estimate = Number(request.estimatedCostUsd);
  if (estimate > 0 && estimate <= 100_000)
    await db
      .from("long_videos")
      .update({ estimated_cost_usd: Number(estimate.toFixed(4)) } as never)
      .eq("id", run.id);

  await advanceAfter(run.id);
  const { data: latest } = await db.from("long_videos").select("status").eq("id", run.id).single();
  return {
    longVideoId: run.id,
    status: latest?.status ?? "running",
    duplicate: false,
    ...(warnings.length ? { warnings } : {}),
  };
}

/**
 * Asks Higgsfield to price requests as they would be sent (free), each image
 * uploaded once. A request whose images can't be read isn't asked (null).
 */
async function quoteAsker() {
  const { providerMediaUrl } = await import("../generation-pipeline.server");
  const { higgsfieldProvider } = await import("../higgsfield/provider.server");
  const { providerPayload } = await import("../model-schema");

  const urls = new Map<string, string>();
  async function urlOf(assetId: string): Promise<string | null> {
    if (urls.has(assetId)) return urls.get(assetId)!;
    const { data: asset } = await db
      .from("assets")
      .select("id,storage_bucket,storage_path,mime_type")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset) return null;
    try {
      const url = await providerMediaUrl({
        assetId: asset.id,
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
      });
      urls.set(assetId, url);
      return url;
    } catch {
      return null;
    }
  }
  /** Higgsfield's answer to a request priced as it would be sent (null: couldn't be asked). */
  return async function ask(
    model: ModelRegistryEntry,
    parameters: Record<string, unknown>,
    inputs: { assetId: string; role: string }[],
  ): Promise<ProviderCall<unknown> | null> {
    const media: { role: string; url: string }[] = [];
    for (const item of inputs) {
      const url = await urlOf(item.assetId);
      if (!url) return null;
      media.push({ role: item.role, url });
    }
    return higgsfieldProvider.estimate(model.model_path, providerPayload(model, parameters, media));
  };
}

/** Higgsfield refused the request as set up (not just couldn't price it). */
function refusedQuote(call: ProviderCall<unknown> | null): boolean {
  return !!call && !call.ok && call.errorCode === "INVALID_PARAMETERS";
}

/**
 * Where a frame goes in a clip request kept to be tried later: the opening
 * keyframe takes its place once it is painted (see tryKeptClips).
 */
const STAND_IN = "stand-in";

/** A clip request kept (long_videos.keyframe_settings.clipQuotes) to be tried once a frame exists. */
type KeptClipQuote = {
  position: number;
  modelId: string;
  values: Record<string, unknown>;
  inputs: { assetId: string; role: string }[];
};

/** A clip's driving audio as it will be sent (made to a voiceover), or null when it has none. */
type DrivingAudio = (clip: PlannedClip) => Promise<{ assetId: string; role: string } | null>;

/**
 * The first clip, a later one and the last, as each will be sent with
 * `standIn` where a frame goes and, made to a voiceover, its own piece of it.
 */
async function clipQuotes(
  planned: PlannedClip[],
  standIn: string,
  drivingAudio: DrivingAudio | null,
) {
  const positions = [...new Set([0, 1, planned.length - 1])].filter(
    (position) => position >= 0 && position < planned.length,
  );
  const quotes = [];
  for (const position of positions) {
    // A clip given the clip before itself can't be tried with a stand-in.
    const request = clipQuote(planned[position]!, standIn);
    if (!request) continue;
    const audio = drivingAudio ? await drivingAudio(planned[position]!) : null;
    quotes.push({
      position,
      ...request,
      inputs: audio ? [...request.inputs, audio] : request.inputs,
    });
  }
  return quotes;
}

/**
 * A planned clip's piece of the voiceover in its driving-audio input, cut
 * now: the same piece (cut once, see ../lip-sync/slices.server) its clip is
 * sent when it starts. Null when it can't be cut now; the clip's own start
 * says why, if it still can't.
 */
async function pieceInput(
  clip: PlannedClip,
  input: {
    preparationId: string;
    piece: PlannedPiece | undefined;
    createdBy: string;
    projectId: string | null;
    label: string;
  },
): Promise<{ assetId: string; role: string } | null> {
  const slot = drivingAudioSlot(clip.model);
  if (!slot || !input.piece) return null;
  const { voiceoverPiece } = await import("../lip-sync/slices.server");
  try {
    const piece = await voiceoverPiece({
      preparationId: input.preparationId,
      startSeconds: input.piece.start,
      endSeconds: input.piece.end,
      createdBy: input.createdBy,
      projectId: input.projectId,
      label: input.label,
    });
    return { assetId: piece.assetId, role: slot.role };
  } catch {
    return null;
  }
}

/**
 * Prices (free) one of each kind of request a run with characters or
 * keyframes will send: a keyframe, the first clip, a later clip and the last
 * one, a stand-in image where a frame will go (and, made to a voiceover, each
 * with its own piece of it, so a model that won't take an end frame with its
 * driving audio says so before a keyframe is painted). One Higgsfield refuses
 * as set up stops the run before anything is paid for; one it just couldn't
 * price doesn't. Gives one keyframe's price too. With no image to stand in at
 * all, a keyframed run's clip requests are kept (`kept`) and tried once its
 * opening keyframe is painted, before the rest are.
 */
async function preflight(input: {
  planned: PlannedClip[];
  painter: ModelRegistryEntry | null;
  keyframeSettings: KeyframeSettings | null;
  characters: RunCharacter[];
  references: RunReference[];
  drivingAudio: DrivingAudio | null;
  standIn: string | null;
}): Promise<{ problem: string | null; keyframeUsd: number | null; kept: KeptClipQuote[] }> {
  const { standIn, planned, painter, keyframeSettings } = input;
  const { extractCost } = await import("../higgsfield/provider.server");
  const ask = await quoteAsker();

  let keyframeUsd: number | null = null;
  if (painter && keyframeSettings) {
    const sample = keyframeQuote({
      painter,
      values: keyframeSettings.values,
      standIn,
      characters: input.characters,
      references: input.references,
    });
    const call = await ask(sample.model, sample.values, sample.inputs);
    if (refusedQuote(call))
      return {
        problem: `Keyframes: ${painter.display_name} won't take them as set up (${call!.errorMessage})`,
        keyframeUsd: null,
        kept: [],
      };
    keyframeUsd = call?.ok ? extractCost(call.data) : null;
  }

  // The clips need an image where their frames go. With none at all, a
  // keyframed run keeps them to try with its opening keyframe; otherwise each
  // is priced just before it is made.
  if (!standIn)
    return {
      problem: null,
      keyframeUsd,
      kept: painter
        ? (await clipQuotes(planned, STAND_IN, input.drivingAudio)).map(
            ({ position, model, values, inputs }) => ({
              position,
              modelId: model.id,
              values,
              inputs,
            }),
          )
        : [],
    };

  for (const request of await clipQuotes(planned, standIn, input.drivingAudio)) {
    const call = await ask(request.model, request.values, request.inputs);
    if (refusedQuote(call))
      return {
        problem: `Clip ${request.position + 1}: ${request.model.display_name} won't take it as set up (${call!.errorMessage})`,
        keyframeUsd,
        kept: [],
      };
  }
  return { problem: null, keyframeUsd, kept: [] };
}

/**
 * Tries (free) the clip requests a keyframed run kept at its start because no
 * image could stand in for their frames, with its opening keyframe in their
 * place: one Higgsfield refuses as set up stops the run before more
 * keyframes are painted (and paid for) for clips that couldn't be made. Done
 * once, whatever comes of it, and recorded as done before any more keyframes
 * are painted (`recorded`: not yet, so a later step tries them again first).
 * A refusal stops the run and keeps the requests, so neither a step running
 * alongside nor a run reopened later (a keyframe redone) paints on past it:
 * they're tried again first, with the opening keyframe as it is then. Recorded
 * under the run's lock (record_long_video_clip_try) only while the run is
 * going and the opening keyframe is the one they were tried with.
 */
async function tryKeptClips(
  run: RunRow,
  keyframes: KeyframeRow[],
): Promise<{ refused: boolean; recorded: boolean }> {
  const settings = (run.keyframe_settings ?? {}) as Json;
  const kept = Array.isArray(settings["clipQuotes"])
    ? (settings["clipQuotes"] as KeptClipQuote[])
    : [];
  const opening = keyframes.find((keyframe) => keyframe.position === 0);
  if (!kept.length || opening?.status !== "completed" || !opening.asset_id)
    return { refused: false, recorded: true };
  const frame = opening.asset_id;
  const ask = await quoteAsker();
  let problem: string | null = null;
  for (const quote of kept) {
    const model = await loadModel(quote.modelId);
    if (!model) continue;
    const inputs = quote.inputs.map((item) =>
      item.assetId === STAND_IN ? { ...item, assetId: frame } : item,
    );
    const call = await ask(model, quote.values, inputs);
    if (refusedQuote(call)) {
      problem = `Clip ${quote.position + 1}: ${model.display_name} won't take it as set up (${call!.errorMessage})`;
      break;
    }
  }
  // Refused: stopped, the requests kept (written back, in case a step
  // alongside got no refusal and cleared them first). Otherwise tried, so a
  // later step doesn't ask again. A run stopped meanwhile, or an opening
  // keyframe redone meanwhile, is left as it is.
  const { data, error } = await db.rpc("record_long_video_clip_try", {
    p_run_id: run.id,
    p_opening_attempt: opening.attempt,
    p_quotes: kept as never,
    p_refusal: problem
      ? `${problem}. Nothing more is painted for it: stop this video and start it again set up another way.`
      : null,
  });
  if (error) throw new Error(`The clip requests' try couldn't be recorded: ${error.message}`);
  return {
    refused: !!problem,
    recorded: (data as { outcome?: string } | null)?.outcome === "recorded",
  };
}

/* ------------------------------------------------------------------ */
/* Moving a run on                                                     */
/* ------------------------------------------------------------------ */

/**
 * Moves a run on as far as it can go right now. Safe to call at any time, from
 * anywhere. With a deadline it takes no new step after it (a sweep sharing
 * its time with other work).
 */
export async function advanceLongVideo(
  longVideoId: string,
  options: { deadline?: number } = {},
): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (options.deadline && Date.now() > options.deadline) return;
    if (!(await stepRun(longVideoId, options.deadline ?? null))) return;
  }
}

/** Moves a run on after a person's action, which has already been recorded: a failure here is only logged. */
async function advanceAfter(longVideoId: string): Promise<void> {
  await advanceLongVideo(longVideoId).catch((error: unknown) => {
    console.error("long video step failed", {
      longVideoId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

/** A run's keyframes in order (none when it has none, or before the database has them). */
async function keyframesOf(run: Pick<RunRow, "id" | "keyframe_model_id">): Promise<KeyframeRow[]> {
  if (!run.keyframe_model_id) return [];
  const { data, error } = await db
    .from("long_video_keyframes")
    .select("*")
    .eq("long_video_id", run.id)
    .order("position");
  // A read that failed is never taken for "no keyframes": the step stops, nothing changes.
  if (error) throw new Error(`The keyframes couldn't be read: ${error.message}`);
  return data ?? [];
}

/** Two moments of the voiceover this close are the same one. */
const SAME_MOMENT = 1e-3;

/**
 * Whether a clip starts from the run's anchor frame (the approved still)
 * rather than from the frame the clip before it is cut on: every later clip
 * of an anchored run, and in a chain, a clip after a cutaway (its piece of the
 * voiceover doesn't carry on from the one before, so neither does its shot).
 */
function startsFromAnchor(
  run: Pick<RunRow, "start_from" | "anchor_frame_asset_id" | "voiceover_preparation_id">,
  clip: ClipRow,
  previous: ClipRow | null,
): boolean {
  if (clip.position === 0 || !run.anchor_frame_asset_id) return false;
  if (run.start_from === "anchor") return true;
  return (
    !!previous &&
    drivenByVoiceover(run, clip) &&
    drivenByVoiceover(run, previous) &&
    Math.abs(Number(previous.audio_end_seconds) - Number(clip.audio_start_seconds)) > SAME_MOMENT
  );
}

/** Whether a clip starts from a frame of the clip before it, and so waits for that clip. */
function startsFromPrevious(
  run: Pick<RunRow, "start_from" | "anchor_frame_asset_id" | "voiceover_preparation_id">,
  clip: ClipRow,
  previous: ClipRow | null,
): boolean {
  return (
    clip.position > 0 &&
    !clip.start_frame_override_asset_id &&
    !startsFromAnchor(run, clip, previous)
  );
}

/**
 * A clip's video is in and measured and, where the clip after it starts from
 * it, that clip's start frame taken. (The last clip's final frame is taken
 * too, for the end card, but it is done without one.)
 */
function handoffDone(run: RunRow, clip: ClipRow, next: ClipRow | null): boolean {
  if (clip.status !== "completed") return false;
  if (clip.handoff_status === "ready") return true;
  return clip.handoff_status === "not_needed" && (!next || !startsFromPrevious(run, next, clip));
}

/** Checks that let a clip (or keyframe) through: passed, kept by a person, couldn't be checked, or not needed. */
const SETTLED_CHECKS = new Set(["passed", "accepted", "unavailable", "skipped"]);

/** A clip is done once its handoff is and, in a run that checks its characters, its check is settled. */
function clipDone(run: RunRow, clip: ClipRow, next: ClipRow | null): boolean {
  return (
    handoffDone(run, clip, next) &&
    (!checksCharacters(run) || SETTLED_CHECKS.has(clip.check_status))
  );
}

/**
 * A run whose clips don't all wait for the clip before: they start from its
 * anchor frame, or it has cutaways (a clip after one starts afresh). Its
 * clips are made side by side (see stepScheduled).
 */
function scheduledRun(run: RunRow): boolean {
  return run.start_from === "anchor" || (storedVoiceover(run.voiceover)?.cutaways.length ?? 0) > 0;
}

/** Clips being made at once, at most, in a run whose clips don't wait for each other. */
const PARALLEL_CLIPS = 3;

/**
 * One step. True when something moved, so another look may move it further.
 * With a deadline, a slow step (an AI check) is only taken with time to finish.
 */
async function stepRun(longVideoId: string, deadline: number | null = null): Promise<boolean> {
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", longVideoId)
    .maybeSingle();
  if (!run) return false;
  const { data: clips } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", longVideoId)
    .order("position");
  if (!clips?.length) return false;
  const lastPosition = clips.length - 1;
  const keyframes = await keyframesOf(run);

  if (run.status !== "running") {
    // A stopped run starts nothing new, but clips (or a keyframe) already
    // being made still finish: they are recorded, so they aren't lost.
    for (const clip of clips) if (clip.status === "generating") await followGeneration(run, clip);
    const painting = keyframes.find((keyframe) => keyframe.status === "generating");
    if (painting) await followKeyframeGeneration(run, painting);
    return false;
  }

  // A keyframed run paints its storyboard before any clip is made.
  if (run.keyframe_model_id && !run.storyboard_approved_at)
    return stepStoryboard(run, clips, keyframes, deadline);

  if (scheduledRun(run)) return stepScheduled(run, clips, deadline);

  const nextOf = (clip: ClipRow) => clips[clip.position + 1] ?? null;
  const current = clips.find((clip) => !clipDone(run, clip, nextOf(clip)));
  if (!current) {
    await db
      .from("long_videos")
      .update({ status: "completed", completed_at: now(), error_code: null, error_message: null })
      .eq("id", run.id)
      .eq("status", "running");
    return false;
  }
  const previous = current.position > 0 ? (clips[current.position - 1] ?? null) : null;

  switch (current.status) {
    case "waiting":
      if (current.held) {
        await pause(run, "CLIP_HELD", `${clipLabel(current)} is held: release it to carry on.`);
        return false;
      }
      return startClip(run, current, previous);
    case "submitting":
      return recoverClaim(current);
    case "generating":
      return followGeneration(run, current);
    case "completed":
      // Its handoff first, then (a run with characters) its check.
      return handoffDone(run, current, nextOf(current))
        ? followCheck(run, current, deadline)
        : followHandoff(run, current, current.position === lastPosition);
    default:
      await pause(
        run,
        current.error_code ?? "CLIP_FAILED",
        current.error_message ?? `${clipLabel(current)} didn't finish`,
      );
      return false;
  }
}

/**
 * One step of a run whose clips don't all wait for the one before (see
 * scheduledRun). First anything a clip already started is waiting on is
 * followed (its generation, its measuring, its check), every clip in order;
 * then, unless something stopped the run for a person, the next clip that can
 * start does, while fewer than PARALLEL_CLIPS are being made. A clip that
 * starts from the one before still waits for it to be done; a held clip
 * waits for a person, and stops the run once nothing else is left to do.
 */
async function stepScheduled(
  run: RunRow,
  clips: ClipRow[],
  deadline: number | null,
): Promise<boolean> {
  const nextOf = (clip: ClipRow) => clips[clip.position + 1] ?? null;
  const lastPosition = clips.length - 1;
  let pending = 0;
  for (const clip of clips) {
    if (clipDone(run, clip, nextOf(clip))) continue;
    pending += 1;
    let moved = false;
    switch (clip.status) {
      case "submitting":
        moved = await recoverClaim(clip);
        break;
      case "generating":
        moved = await followGeneration(run, clip);
        break;
      case "completed":
        moved = handoffDone(run, clip, nextOf(clip))
          ? await followCheck(run, clip, deadline)
          : await followHandoff(run, clip, clip.position === lastPosition);
        break;
      default:
        break;
    }
    if (moved) return true;
  }
  if (!pending) {
    await db
      .from("long_videos")
      .update({ status: "completed", completed_at: now(), error_code: null, error_message: null })
      .eq("id", run.id)
      .eq("status", "running");
    return false;
  }

  // A clip that failed stops the run before anything new is paid for.
  const failed = clips.find((clip) => clip.status === "failed" || clip.status === "canceled");
  if (failed) {
    await pause(
      run,
      failed.error_code ?? "CLIP_FAILED",
      failed.error_message
        ? `${clipLabel(failed)}: ${failed.error_message}`
        : `${clipLabel(failed)} didn't finish`,
    );
    return false;
  }
  const inFlight = clips.filter(
    (clip) => clip.status === "submitting" || clip.status === "generating",
  ).length;
  const waiting = clips.filter((clip) => clip.status === "waiting");
  const ready = waiting.find((clip) => {
    if (clip.held) return false;
    const previous = clips[clip.position - 1] ?? null;
    return (
      !startsFromPrevious(run, clip, previous) || (!!previous && clipDone(run, previous, clip))
    );
  });
  if (ready && inFlight < PARALLEL_CLIPS) {
    // Anything followed above may have stopped the run (a check that flagged
    // a clip, a frame that couldn't be taken): nothing new starts then.
    const { data: latest } = await db
      .from("long_videos")
      .select("status")
      .eq("id", run.id)
      .maybeSingle();
    if (latest?.status !== "running") return false;
    return startClip(run, ready, clips[ready.position - 1] ?? null);
  }
  // Nothing being made or measured, and nothing can start but held clips (and
  // clips waiting on them): the run waits for a person.
  const busy = clips.some(
    (clip) => clip.status !== "waiting" && !clipDone(run, clip, nextOf(clip)),
  );
  const held = waiting.find((clip) => clip.held);
  if (held && !busy && !ready)
    await pause(run, "CLIP_HELD", `${clipLabel(held)} is held: release it to carry on.`);
  return false;
}

/**
 * Stops a running run for a person to look at. A "keyframes ready" pause only
 * while the storyboard still waits for approval (a person may have approved
 * it a moment ago).
 */
async function pause(run: Pick<RunRow, "id">, code: string, message: string): Promise<void> {
  const update = db
    .from("long_videos")
    .update({ status: "needs_attention", error_code: code, error_message: message })
    .eq("id", run.id)
    .eq("status", "running");
  await (code === "STORYBOARD_READY" ? update.is("storyboard_approved_at", null) : update);
}

/**
 * Fails a clip that is still where this step found it (its state and
 * attempt), then stops the run for a person. A step that lost a race (the
 * clip was retried meanwhile) changes nothing.
 */
async function failClip(
  run: Pick<RunRow, "id">,
  clip: ClipRow,
  from: ClipRow["status"],
  code: string,
  message: string,
): Promise<false> {
  const { data } = await db
    .from("long_video_clips")
    .update({ status: "failed", error_code: code, error_message: message })
    .eq("id", clip.id)
    .eq("status", from)
    .eq("attempt", clip.attempt)
    .select("id");
  if (data?.length) await pause(run, code, `${clipLabel(clip)}: ${message}`);
  return false;
}

/**
 * The generation recorded under a request key, if any. A read that failed
 * throws: "none" would have a paid generation started again.
 */
async function generationForKey(key: string): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("generations")
    .select("id")
    .eq("client_request_id", key)
    .maybeSingle();
  if (error) throw new Error(`Its generation couldn't be looked up: ${error.message}`);
  return data ?? null;
}

async function attachGeneration(clip: ClipRow, generationId: string): Promise<void> {
  await db
    .from("long_video_clips")
    .update({ status: "generating", generation_id: generationId, started_at: now() })
    .eq("id", clip.id)
    .eq("status", "submitting")
    .eq("attempt", clip.attempt);
}

/** A claimed clip handed back untouched (nothing was sent), for a later step. */
async function releaseClip(clip: ClipRow): Promise<false> {
  const update = db
    .from("long_video_clips")
    .update({ status: "waiting", claimed_at: null })
    .eq("id", clip.id)
    .eq("status", "submitting");
  await (clip.claimed_at ? update.eq("claimed_at", clip.claimed_at) : update);
  return false;
}

/**
 * A keyframe's image, when it is painted (or given) and still in the library:
 * its id, or null when it isn't; undefined when that couldn't be read.
 */
async function keyframeAsset(
  keyframes: KeyframeRow[],
  position: number,
): Promise<string | null | undefined> {
  const keyframe = keyframes.find((entry) => entry.position === position);
  if (!keyframe || keyframe.status !== "completed" || !keyframe.asset_id) return null;
  const { data, error } = await db
    .from("assets")
    .select("id")
    .eq("id", keyframe.asset_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return undefined;
  return data?.id ?? null;
}

/**
 * Claims a waiting clip for its next send. A keyframed run's clip is claimed
 * in the same lock its storyboard is approved and redone under, so it never
 * starts on a keyframe being painted again. Null when there's nothing to do.
 */
async function claimClip(run: RunRow, clip: ClipRow): Promise<ClipRow | null> {
  const claimedAt = now();
  if (run.keyframe_model_id) {
    const { data, error } = await db.rpc("claim_long_video_clip", {
      p_clip_id: clip.id,
      p_claimed_at: claimedAt,
    });
    if (error) throw new Error(`The clip couldn't be claimed: ${error.message}`);
    const result = (data ?? {}) as { outcome?: string; attempt?: number };
    if (result.outcome !== "claimed" || typeof result.attempt !== "number") return null;
    return { ...clip, status: "submitting", claimed_at: claimedAt, attempt: result.attempt };
  }
  const { data: claimed } = await db
    .from("long_video_clips")
    .update({ status: "submitting", claimed_at: claimedAt, error_code: null, error_message: null })
    .eq("id", clip.id)
    .eq("status", "waiting")
    .eq("attempt", clip.attempt)
    .select("*");
  return claimed?.[0] ?? null;
}

async function startClip(
  run: RunRow,
  waiting: ClipRow,
  previous: ClipRow | null,
): Promise<boolean> {
  const clip = await claimClip(run, waiting);
  if (!clip) return true;

  const model = await loadModel(clip.model_registry_id);
  if (!model?.is_active)
    return failClip(
      run,
      clip,
      "submitting",
      "MODEL_UNAVAILABLE",
      "Its model is no longer available",
    );

  const inputs: { assetId: string; role: string; position: number }[] = [];
  const start = clipStart(model);
  // A frame a person chose for it (a frame start only), or the run's anchor.
  const override = start?.kind === "frame" ? (clip.start_frame_override_asset_id ?? null) : null;
  const anchored = startsFromAnchor(run, clip, previous);
  // A keyframed run: clip 1 starts on the opening keyframe, every clip ends on its own.
  const frames = run.keyframe_model_id
    ? clipKeyframes(clip.position, run.clip_count, storedFinale(run.references_used)?.mode ?? null)
    : null;
  // Read now, after the claim: a keyframe painted again before it is seen
  // here, and none can be painted again after it (see claim_long_video_clip).
  let keyframes: KeyframeRow[] = [];
  if (frames) {
    try {
      keyframes = await keyframesOf(run);
    } catch {
      return releaseClip(clip);
    }
  }
  const missingKeyframe = (position: number) =>
    failClip(
      run,
      clip,
      "submitting",
      "KEYFRAME_MISSING",
      keyframes.find((keyframe) => keyframe.position === position)?.provided
        ? `Your own ${position === 0 ? "opening" : "closing"} frame was deleted from the library, so nothing was started and this video can't go on. Start it again with another frame.`
        : `${keyframeLabel({ position })} isn't in the library any more, so nothing was started. Redo that keyframe, then this clip carries on.`,
    );
  if (clip.position === 0 && frames?.start === 0) {
    const frame = await keyframeAsset(keyframes, 0);
    if (frame === undefined) return releaseClip(clip);
    if (!frame || !start?.role) return missingKeyframe(0);
    inputs.push({ assetId: frame, role: start.role, position: 0 });
    await db.from("long_video_clips").update({ start_frame_asset_id: frame }).eq("id", clip.id);
  } else if (clip.position > 0 && start?.kind === "video") {
    // It extends the clip before: given that clip's own video, whose motion,
    // light and sound it carries on (the frame it ends on is noted too).
    const video = previous?.output_asset_id;
    if (!video)
      return failClip(
        run,
        clip,
        "submitting",
        "HANDOFF_FAILED",
        "The clip it extends isn't available",
      );
    inputs.push({ assetId: video, role: start.role, position: 0 });
    if (previous?.handoff_asset_id)
      await db
        .from("long_video_clips")
        .update({ start_frame_asset_id: previous.handoff_asset_id })
        .eq("id", clip.id);
  } else if (clip.position > 0 || override) {
    // Its start frame, or (Cinema Studio) its first reference image, which its
    // prompt names: one a person chose for it, else the run's anchor frame,
    // else the frame the clip before is cut on.
    const role = start?.role;
    const frame = override ?? (anchored ? run.anchor_frame_asset_id : previous?.handoff_asset_id);
    if (!role || !frame)
      return failClip(
        run,
        clip,
        "submitting",
        "HANDOFF_FAILED",
        "The frame it starts from isn't available",
      );
    if (override || anchored) {
      // A still a person chose can since have been deleted from the library.
      const { data: still, error: stillError } = await db
        .from("assets")
        .select("id")
        .eq("id", frame)
        .is("deleted_at", null)
        .maybeSingle();
      if (stillError) return releaseClip(clip);
      if (!still)
        return failClip(
          run,
          clip,
          "submitting",
          "START_FRAME_MISSING",
          override
            ? "The frame chosen for it to start from is no longer in the library, so nothing was started. Choose another, then retry it."
            : "The image every clip starts from is no longer in the library, so nothing was started. Choose a start frame for it, then retry it.",
        );
    }
    inputs.push({ assetId: frame, role, position: 0 });
    await db.from("long_video_clips").update({ start_frame_asset_id: frame }).eq("id", clip.id);
  }
  for (const item of (clip.inputs ?? []) as { asset_id?: string; role?: string }[]) {
    // Clip 1 started from a chosen frame: its own start image gives way to it.
    if (clip.position === 0 && override && item.role === start?.role) continue;
    if (typeof item.asset_id === "string" && typeof item.role === "string")
      inputs.push({ assetId: item.asset_id, role: item.role, position: inputs.length });
  }
  // Made to a voiceover: its own piece of it, cut now, as its driving audio.
  if (drivenByVoiceover(run, clip)) {
    const slot = drivingAudioSlot(model);
    if (!slot)
      return failClip(
        run,
        clip,
        "submitting",
        "MODEL_UNAVAILABLE",
        "Its model can no longer move a speaker's lips to a voiceover",
      );
    const piece = await pieceFor(run, clip);
    if ("problem" in piece)
      return failClip(
        run,
        clip,
        "submitting",
        piece.code,
        `Its piece of the voiceover couldn't be cut, so nothing was started: ${piece.problem}`,
      );
    inputs.push({ assetId: piece.assetId, role: slot.role, position: inputs.length });
    await db
      .from("long_video_clips")
      .update({ audio_asset_id: piece.assetId } as never)
      .eq("id", clip.id);
  }
  // The keyframe it ends on comes last (a prompt naming it counts it there).
  if (frames && frames.end !== null) {
    const end = clipEnd(model);
    const frame = await keyframeAsset(keyframes, frames.end);
    if (frame === undefined) return releaseClip(clip);
    if (!frame || !end) return missingKeyframe(frames.end);
    inputs.push({ assetId: frame, role: end.role, position: inputs.length });
    await db.from("long_video_clips").update({ end_frame_asset_id: frame }).eq("id", clip.id);
  }

  // A later clip is told how the camera was moving as the one before ended,
  // so it carries the move on instead of starting from rest. (One that
  // extends the clip before sees the move for itself.) Only where it fits
  // what the model reads, and never for a clip that doesn't carry on from
  // the one before, nor one made to a voiceover: a moving camera is what most
  // weakens lip sync (see ../lip-sync/presenter).
  const parameters = { ...((clip.parameters ?? {}) as Json) };
  if (clip.position > 0 && start?.kind !== "video" && typeof parameters["prompt"] === "string") {
    const carriesOn = !override && !anchored && !drivenByVoiceover(run, clip);
    const motion = carriesOn ? await handoffMotion(previous) : null;
    parameters["prompt"] = withCameraLine(parameters["prompt"], motion, promptBudget(model));
  }
  // Another take of a clip set to a fixed seed would come back the same: each
  // attempt takes the next seed along.
  const seedField = (model.parameter_schema?.fields ?? []).find((field) => field.key === "seed");
  if (clip.attempt > 1 && seedField && typeof parameters["seed"] === "number") {
    const most = typeof seedField.max === "number" ? seedField.max : 2_147_483_646;
    parameters["seed"] = (Math.round(parameters["seed"]) + (clip.attempt - 1) * 7919) % (most + 1);
  }

  const key = clipRequestKey(clip);
  try {
    if (!run.created_by)
      throw new AppError(
        "NOT_AUTHORIZED",
        "The person who started this run is no longer on the team",
      );
    await assertGenerationAllowed(run.created_by);
    const started = await createAndSubmitGeneration({
      userId: run.created_by,
      model,
      parameters,
      inputs,
      projectId: run.project_id,
      campaignId: run.campaign_id,
      parentGenerationId: previous?.generation_id ?? null,
      generationGroupId: run.id,
      clientRequestId: key,
    });
    await attachGeneration(clip, started.generationId);
    return true;
  } catch (error) {
    // A generation recorded before the failure is followed, never started again.
    const existing = await generationForKey(key);
    if (existing) {
      await attachGeneration(clip, existing.id);
      return true;
    }
    const code = error instanceof AppError ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : "It couldn't be started";
    return failClip(
      run,
      clip,
      "submitting",
      code,
      code === "BUDGET_EXCEEDED"
        ? `${message} Nothing was started; press Continue once the limit allows.`
        : (freeFailureMessage(code) ?? message),
    );
  }
}

/** How the camera was moving as a clip ended, as its handoff frame's task read it (null if unknown). */
async function handoffMotion(clip: ClipRow | null) {
  if (!clip?.handoff_task_id) return null;
  const { data: task } = await db
    .from("media_tasks")
    .select("output_payload")
    .eq("id", clip.handoff_task_id)
    .maybeSingle();
  return cameraMotionOf(((task?.output_payload ?? {}) as Json)["metadata"]);
}

/** A clip left "submitting" by an interrupted start: follow its generation if it got one, else start it again. */
async function recoverClaim(clip: ClipRow): Promise<boolean> {
  if (!clip.claimed_at || Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
    return false;
  const existing = await generationForKey(clipRequestKey(clip));
  if (existing) {
    await attachGeneration(clip, existing.id);
    return true;
  }
  const { data } = await db
    .from("long_video_clips")
    .update({ status: "waiting", claimed_at: null })
    .eq("id", clip.id)
    .eq("status", "submitting")
    .eq("attempt", clip.attempt)
    .eq("claimed_at", clip.claimed_at)
    .select("id");
  return !!data?.length;
}

/**
 * Failures that cost nothing and clear once a person has acted (topped up the
 * balance, raised a limit, or waited out a rate limit): Continue makes such a
 * clip again rather than waiting for its own Retry.
 */
const FREE_FAILURES = new Set([
  "INSUFFICIENT_PROVIDER_BALANCE",
  "BUDGET_EXCEEDED",
  "RATE_LIMITED",
  "NOT_SUBMITTED",
]);

/** How a failure that cost nothing reads, with what to do about it. */
function freeFailureMessage(code: string): string | null {
  switch (code) {
    case "INSUFFICIENT_PROVIDER_BALANCE":
      return "Higgsfield's API balance ran out, so it wasn't made and nothing was charged. Top it up in the Higgsfield Console, then press Continue: it is made again and the video carries on.";
    case "RATE_LIMITED":
      return "Higgsfield is limiting how many requests it takes right now, so it wasn't made and nothing was charged. Press Continue in a few minutes.";
    default:
      return null;
  }
}

const FAILED_GENERATION: Record<string, string> = {
  failed: "Higgsfield couldn't generate it",
  nsfw: "Higgsfield's moderation blocked it",
  canceled: "Its generation was canceled",
};

/** A generation recorded but never sent (an interrupted start) is given up on after this long. */
const NEVER_SENT_MS = 10 * 60_000;

/** Where a clip's or keyframe's generation has got to. */
type GenerationOutcome =
  | { kind: "waiting" }
  | {
      kind: "done";
      asset: {
        id: string;
        duration_seconds: number | null;
        width: number | null;
        height: number | null;
      };
    }
  /** Made, but its saving to the library gave up: a person retries the save in Activity. */
  | { kind: "save_failed" }
  | { kind: "failed"; code: string; message: string };

/**
 * Where a generation has got to, the same for clips and keyframes: its file
 * once it's in the library; a failure (the provider's, an unclear submission,
 * one never sent) as a reason a person can act on.
 */
async function generationOutcome(
  generationId: string | null,
  assetType: "video" | "image",
): Promise<GenerationOutcome> {
  const missing = {
    kind: "failed",
    code: "GENERATION_MISSING",
    message: "Its generation is missing",
  } as const;
  if (!generationId) return missing;
  const { data: generation, error } = await db
    .from("generations")
    .select("id,status,ingest_status,error_code,error_message,created_at")
    .eq("id", generationId)
    .maybeSingle();
  // A read that failed is a wait, never a failure (a failure invites a paid retry).
  if (error) return { kind: "waiting" };
  if (!generation) return missing;

  if (generation.status === "completed") {
    if (generation.ingest_status === "completed") {
      const { data: asset, error: assetError } = await db
        .from("assets")
        .select("id,duration_seconds,width,height")
        .eq("generation_id", generation.id)
        .eq("asset_type", assetType)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (assetError) return { kind: "waiting" };
      if (!asset)
        return assetType === "video"
          ? { kind: "failed", code: "NO_VIDEO", message: "It finished without a video" }
          : { kind: "failed", code: "NO_IMAGE", message: "It finished without an image" };
      return {
        kind: "done",
        asset: {
          id: asset.id,
          duration_seconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
          width: asset.width,
          height: asset.height,
        },
      };
    }
    if (
      generation.ingest_status === "failed" &&
      generation.error_code === "INGEST_RETRIES_EXHAUSTED"
    )
      return { kind: "save_failed" };
    return { kind: "waiting" };
  }
  if (generation.status === "submission_uncertain")
    return {
      kind: "failed",
      code: "SUBMISSION_UNCERTAIN",
      message:
        "Higgsfield's answer was unclear, so it may or may not be running. Check Activity before retrying, or you could be charged twice.",
    };
  const reason = FAILED_GENERATION[generation.status];
  if (reason)
    return {
      kind: "failed",
      code: generation.error_code ?? "PROVIDER_REJECTED",
      message: generation.error_message ? `${reason}: ${generation.error_message}` : reason,
    };
  // Still waiting to be sent long after it was recorded: its start was cut
  // short before it reached Higgsfield, so nothing is running or charging.
  if (
    ["ready", "draft", "estimating"].includes(generation.status) &&
    Date.now() - new Date(generation.created_at).getTime() > NEVER_SENT_MS
  )
    return {
      kind: "failed",
      code: "NOT_SUBMITTED",
      message:
        "It was never sent to Higgsfield (its start was interrupted), so nothing was charged",
    };
  return { kind: "waiting" };
}

async function followGeneration(run: RunRow, clip: ClipRow): Promise<boolean> {
  const outcome = await generationOutcome(clip.generation_id, "video");
  switch (outcome.kind) {
    case "waiting":
      return false;
    case "save_failed":
      await pause(
        run,
        "SAVE_FAILED",
        `${clipLabel(clip)} was made but couldn't be saved to the library. Retry the save in Activity, then press Continue.`,
      );
      return false;
    case "failed":
      return failClip(
        run,
        clip,
        "generating",
        outcome.code,
        freeFailureMessage(outcome.code) ?? outcome.message,
      );
    case "done": {
      const video = outcome.asset;
      const { data: done } = await db
        .from("long_video_clips")
        .update({
          status: "completed",
          output_asset_id: video.id,
          output_duration_seconds: video.duration_seconds,
          output_width: video.width,
          output_height: video.height,
          completed_at: now(),
          handoff_status: "none",
        })
        .eq("id", clip.id)
        .eq("status", "generating")
        .eq("attempt", clip.attempt)
        .select("id");
      if (done?.length)
        await db
          .from("assets")
          .update({ title: `${run.title} · clip ${clip.position + 1}`.slice(0, 120) })
          .eq("id", video.id);
      return true;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Measuring clips and taking handoff frames                           */
/* ------------------------------------------------------------------ */

type HandoffKind = "probe" | "frame";

/**
 * The handoff frame is the clip's true last frame: the media service decodes
 * and counts the clip's frames and takes the last (see ./handoff). A media
 * service from before it could count frames takes one by time instead, so it
 * is sent this too: just before the clip's end, a little earlier on each
 * retry. With the frame rate known, that cut falls exactly on a frame: the
 * Editor ends the clip at `cut` (frames 0 … k-1) and the frame taken is frame
 * k itself, asked for half a frame early so the media service (which returns
 * the first frame at or after a time) can only return frame k. The next clip
 * starts from it, so no frame is shown twice or skipped.
 */
function handoffPoint(clip: ClipRow): { cut: number; at: number } {
  const length = Number(clip.output_duration_seconds ?? clip.duration_seconds);
  const tries = clip.handoff_attempts % MAX_HANDOFF_FAILURES;
  const margin = HANDOFF_MARGINS_SECONDS[Math.min(tries, HANDOFF_MARGINS_SECONDS.length - 1)]!;
  const fps = Number(clip.output_fps) || 0;
  if (fps > 0) {
    const frame = Math.max(1, Math.floor((length - margin) * fps + 1e-6));
    return { cut: Number((frame / fps).toFixed(6)), at: Number(((frame - 0.5) / fps).toFixed(4)) };
  }
  const cut = Math.max(0, Number((length - margin).toFixed(3)));
  return { cut, at: cut };
}

/** The frame at the clip's own width (even, as encoders need), within what the media service takes. */
function frameWidth(clip: ClipRow): number {
  const width = Number(clip.output_width ?? 0);
  if (!(width > 0)) return 1280;
  return Math.max(64, Math.min(3840, Math.floor(width / 2) * 2));
}

/** Frames larger than this (past 1440p) go as best-quality JPEG: as PNG they can pass what a provider takes. */
const PNG_MAX_PIXELS = 2_600_000;

/** The handoff frame's file: lossless PNG, so the next clip starts from exactly the picture shown. */
function handoffFile(clip: ClipRow): { ext: "png" | "jpg"; mime: string } {
  const pixels = Number(clip.output_width ?? 0) * Number(clip.output_height ?? 0);
  return pixels > PNG_MAX_PIXELS
    ? { ext: "jpg", mime: "image/jpeg" }
    : { ext: "png", mime: "image/png" };
}

/**
 * After a clip's video is in: measure it, then take its true last frame:
 * the next clip's start frame or, from the last clip, the final frame the
 * end card can sit over. Every clip, so the Editor knows its exact length.
 */
async function followHandoff(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  switch (clip.handoff_status) {
    case "none": {
      const { data: claimed } = await db
        .from("long_video_clips")
        .update({ handoff_status: "probing", handoff_task_id: null, claimed_at: now() })
        .eq("id", clip.id)
        .eq("handoff_status", "none")
        .select("*");
      const next = claimed?.[0];
      return next ? enqueueHandoff(run, next, "probe", isLast) : true;
    }
    case "probing":
      return followTask(run, clip, "probe", isLast);
    case "extracting":
      // Made to a voiceover: its sync is measured first, as its frame is
      // taken where it is cut, which the sync moves; then its lips scored.
      if (syncPending(run, clip)) return followSync(run, clip, isLast);
      if (lipPending(run, clip)) return followLip(run, clip, isLast);
      return followTask(run, clip, "frame", isLast);
    case "failed":
      await pause(
        run,
        "HANDOFF_FAILED",
        clip.error_message ??
          `The next clip's start frame couldn't be taken from ${clipLabel(clip).toLowerCase()}`,
      );
      return false;
    default:
      // "not_needed" on a clip that now has one after it: take its frame after all.
      await db
        .from("long_video_clips")
        .update({ handoff_status: "none" })
        .eq("id", clip.id)
        .eq("handoff_status", clip.handoff_status);
      return true;
  }
}

async function enqueueHandoff(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
): Promise<boolean> {
  const status = kind === "probe" ? "probing" : "extracting";
  const { data: asset } = clip.output_asset_id
    ? await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,mime_type")
        .eq("id", clip.output_asset_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (!asset)
    return handoffFailed(run, clip, kind, isLast, {
      code: "VIDEO_MISSING",
      message: "Its video is no longer in the library",
      retryable: false,
    });

  // A clip made to a voiceover hands off from where it is cut, not its last
  // frame (unless it is the last and plays out to its own end).
  const voiced = kind === "frame" && drivenByVoiceover(run, clip) && !playsOut(run, clip, isLast);
  const cut = voiced ? voiceoverCut(clip) : null;
  const point = kind === "frame" ? (cut ?? handoffPoint(clip)) : null;
  const file = handoffFile(clip);
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: kind === "probe" ? "probe" : "extract_frames",
    source: {
      assetId: asset.id,
      assetType: asset.asset_type as "video",
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      mimeType: asset.mime_type,
    },
    // The true last frame (or, made to a voiceover, the frame where it is
    // cut); the time is for a media service that can't count frames.
    params: point
      ? {
          ...(cut
            ? cut.index !== null
              ? { frame: "index", index: cut.index }
              : {}
            : { frame: "last" }),
          format: file.ext,
          times_seconds: [point.at],
          width: frameWidth(clip),
        }
      : {},
    dedupeKey: `lvh:${clip.id}:${clip.attempt}:${kind}:${clip.handoff_attempts}`,
    output:
      kind === "probe"
        ? { count: 0, ext: "json", mime: "application/json", kind: "image" }
        : { count: 1, ext: file.ext, mime: file.mime, kind: "image" },
    context: { long_video_clip_id: clip.id },
  });
  if (!result.ok)
    return handoffFailed(run, clip, kind, isLast, {
      code: result.code,
      message: result.message,
      retryable: result.retryable,
    });

  await db
    .from("long_video_clips")
    .update({
      handoff_task_id: result.taskId,
      ...(point ? { handoff_time_seconds: point.cut } : {}),
    })
    .eq("id", clip.id)
    .eq("handoff_status", status)
    .eq("handoff_attempts", clip.handoff_attempts);
  return true;
}

/**
 * What follows a clip's measuring, in order: its sync (made to a voiceover),
 * its lips scored (where the run scores them), then its frame, taken where
 * the clip after it starts from it (and from the last clip, for the end
 * card); otherwise there is nothing more to take.
 */
async function afterMeasured(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  if (syncPending(run, clip)) return followSync(run, clip, isLast);
  if (lipPending(run, clip)) return followLip(run, clip, isLast);
  if (isLast || (await frameWanted(run, clip))) return enqueueHandoff(run, clip, "frame", isLast);
  const { data } = await db
    .from("long_video_clips")
    .update({
      handoff_status: "not_needed",
      handoff_task_id: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", clip.id)
    .eq("handoff_status", "extracting")
    .eq("handoff_attempts", clip.handoff_attempts)
    .select("id");
  return !!data?.length;
}

/** Whether the clip after this one starts from its frame (taken as so when that can't be read). */
async function frameWanted(run: RunRow, clip: ClipRow): Promise<boolean> {
  const { data: next, error } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", clip.long_video_id)
    .eq("position", clip.position + 1)
    .maybeSingle();
  if (error || !next) return true;
  return startsFromPrevious(run, next, clip);
}

async function followTask(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
): Promise<boolean> {
  if (!clip.handoff_task_id) {
    // Claimed, but its task was never recorded (an interrupted step, or a
    // media service that was busy): ask again once the claim has gone stale.
    if (clip.claimed_at && Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
      return false;
    const { data: reclaimed } = await db
      .from("long_video_clips")
      .update({ claimed_at: now() })
      .eq("id", clip.id)
      .eq("handoff_status", clip.handoff_status)
      .eq("handoff_attempts", clip.handoff_attempts)
      .is("handoff_task_id", null)
      .select("*");
    const next = reclaimed?.[0];
    if (!next) return true;
    return kind === "frame"
      ? afterMeasured(run, next, isLast)
      : enqueueHandoff(run, next, kind, isLast);
  }

  const { data: task } = await db
    .from("media_tasks")
    .select(
      "id,status,task_type,error_code,error_message,result_asset_id,output_payload,created_at,updated_at",
    )
    .eq("id", clip.handoff_task_id)
    .maybeSingle();
  // An extension's own footage, being separated from the clip it extended (see enqueueSeparation).
  const separating = kind === "probe" && task?.task_type === SEPARATE_TASK;
  if (!task)
    return handoffFailed(run, clip, kind, isLast, {
      code: "TASK_MISSING",
      message: "The media task went missing",
      retryable: true,
    });

  if (task.status === "completed") {
    if (separating) return separated(run, clip, task, isLast);
    if (kind === "probe") {
      const measured = measuredFrom(task.output_payload, clip);
      if (!measured)
        return handoffFailed(run, clip, kind, isLast, {
          code: "PROBE_FAILED",
          message: "Its length couldn't be read",
          retryable: true,
        });
      // An extension that came back after the clip it extended, as one video:
      // its own footage is separated out before anything else.
      const lead = await extensionLeadOf(clip, measured.output_duration_seconds);
      if (lead !== null) {
        const { data: kept } = await db
          .from("long_video_clips")
          .update({ ...measured, handoff_task_id: null, claimed_at: now() })
          .eq("id", clip.id)
          .eq("handoff_status", "probing")
          .eq("handoff_task_id", task.id)
          .select("*");
        const next = kept?.[0];
        return next ? enqueueSeparation(run, next, lead) : true;
      }
      // Measured. Then its last frame: the next clip's start, or the last clip's final frame.
      const { data: moved } = await db
        .from("long_video_clips")
        .update({
          ...measured,
          handoff_status: "extracting",
          handoff_task_id: null,
          claimed_at: now(),
        })
        .eq("id", clip.id)
        .eq("handoff_status", "probing")
        .eq("handoff_task_id", task.id)
        .select("*");
      const next = moved?.[0];
      if (!next) return true;
      if (clip.output_asset_id)
        await db
          .from("assets")
          .update({
            duration_seconds: measured.output_duration_seconds,
            width: measured.output_width,
            height: measured.output_height,
          })
          .eq("id", clip.output_asset_id)
          .is("duration_seconds", null);
      // Made to a voiceover: its sync is measured (and its lips scored) before its frame is taken.
      return afterMeasured(run, next, isLast);
    }
    if (!task.result_asset_id)
      return handoffFailed(run, clip, kind, isLast, {
        code: "FRAME_MISSING",
        message: "No frame came back",
        retryable: true,
      });
    // A frame found by counting the clip's frames: the clip plays through it
    // (the next clip skips its own copy of it), and its exact length is known.
    const counted = handoffFrameOf(((task.output_payload ?? {}) as Json)["metadata"]);
    // A frame taken by its number (made to a voiceover): the clip is cut just before it.
    const indexed = counted
      ? null
      : indexedFrameOf(((task.output_payload ?? {}) as Json)["metadata"]);
    const { data: ready } = await db
      .from("long_video_clips")
      .update({
        handoff_status: "ready",
        handoff_asset_id: task.result_asset_id,
        ...(counted
          ? {
              handoff_time_seconds: inclusiveCut(counted),
              output_duration_seconds: countedLength(counted),
              output_fps: counted.fps,
            }
          : {}),
        ...(indexed
          ? {
              handoff_time_seconds: Number((indexed.index / indexed.fps).toFixed(6)),
              output_duration_seconds: countedLength(indexed),
              output_fps: indexed.fps,
            }
          : {}),
        error_code: null,
        error_message: null,
      })
      .eq("id", clip.id)
      .eq("handoff_status", "extracting")
      .eq("handoff_task_id", task.id)
      .select("id");
    if (ready?.length)
      await db
        .from("assets")
        .update({
          title: (isLast
            ? `${run.title} · final frame`
            : `${run.title} · clip ${clip.position + 2} start frame`
          ).slice(0, 120),
        })
        .eq("id", task.result_asset_id);
    return true;
  }

  if (task.status === "failed")
    return handoffFailed(run, clip, kind, isLast, {
      code: task.error_code ?? "RENDER_FAILED",
      message: task.error_message ?? "The media service couldn't do it",
      retryable: true,
      again: true,
      separating,
    });
  const since = new Date(task.updated_at ?? task.created_at).getTime();
  if (Date.now() - since > HANDOFF_TASK_STALE_MS) {
    // Taken as lost: a late result is still recorded, but no longer used.
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    return handoffFailed(run, clip, kind, isLast, {
      code: "STALLED",
      message: "The media service didn't answer",
      retryable: true,
      again: true,
      separating,
    });
  }
  return false;
}

/** What a probe (or a separation, which reports its own) measured of a clip's video; null if unread. */
function measuredFrom(payload: unknown, clip: ClipRow) {
  const probe = (((payload ?? {}) as Json)["metadata"] ?? {}) as Json;
  // The picture's own length where the media service reports it: the
  // container's can run on with the sound.
  const length =
    Number(probe["video_duration_seconds"]) > 0
      ? Number(probe["video_duration_seconds"])
      : Number(probe["duration_seconds"]);
  if (!(length > 0)) return null;
  return {
    output_duration_seconds: length,
    output_fps: Number(probe["fps"]) > 0 ? Number(probe["fps"]) : null,
    output_width: Number(probe["width"]) > 0 ? Number(probe["width"]) : clip.output_width,
    output_height: Number(probe["height"]) > 0 ? Number(probe["height"]) : clip.output_height,
  };
}

/* ------------------------------------------------------------------ */
/* Clips made to a voiceover                                           */
/* ------------------------------------------------------------------ */

/** Tries at measuring a clip's sync before it is taken as in step. */
const MAX_SYNC_FAILURES = 3;

/** A clip made from a piece of its run's voiceover (see ./voiceover). */
function drivenByVoiceover(
  run: Pick<RunRow, "voiceover_preparation_id">,
  clip: Pick<ClipRow, "audio_start_seconds" | "audio_end_seconds">,
): boolean {
  return (
    !!run.voiceover_preparation_id &&
    clip.audio_start_seconds !== null &&
    clip.audio_start_seconds !== undefined &&
    clip.audio_end_seconds !== null &&
    clip.audio_end_seconds !== undefined
  );
}

/** The last clip of a run made to a voiceover, playing out to the frame it was made to end on (see ./voiceover). */
function playsOut(
  run: Pick<
    RunRow,
    "voiceover_preparation_id" | "references_used" | "keyframe_model_id" | "clip_count"
  >,
  clip: Pick<
    ClipRow,
    "position" | "audio_start_seconds" | "audio_end_seconds" | "end_frame_asset_id" | "inputs"
  >,
  isLast: boolean,
): boolean {
  return (
    isLast &&
    drivenByVoiceover(run, clip) &&
    lastClipPlaysOut({
      position: clip.position,
      clipCount: run.clip_count,
      keyframed: !!run.keyframe_model_id,
      finale: storedFinale(run.references_used),
      endFrameAssetId: clip.end_frame_asset_id,
      inputAssetIds: ((clip.inputs ?? []) as { asset_id?: unknown }[]).flatMap((item) =>
        typeof item.asset_id === "string" ? [item.asset_id] : [],
      ),
    })
  );
}

/** Made to a voiceover, and its sync not yet settled (measured, or taken as in step). */
function syncPending(run: Pick<RunRow, "voiceover_preparation_id">, clip: ClipRow): boolean {
  return (
    drivenByVoiceover(run, clip) &&
    (clip.sync_status === "none" || clip.sync_status === "measuring")
  );
}

/**
 * Where a clip made to a voiceover is cut: where its piece of the voiceover
 * ends, moved by where its sound was measured to have the speech (see
 * ../lip-sync/placement). The next clip starts from the frame just after the
 * last one shown, which the media service takes by its number; a media
 * service that can't is asked for it by time, half a frame early, as it
 * returns the first frame at or after a time. With no frame rate known, by
 * time alone.
 */
function voiceoverCut(clip: ClipRow): { index: number | null; cut: number; at: number } {
  const piece = {
    start: Number(clip.audio_start_seconds),
    end: Number(clip.audio_end_seconds),
    offsetSeconds: syncOffsetOf(clip),
  };
  const fps = Number(clip.output_fps) || 0;
  if (fps > 0) {
    const index = cutFrameIndex(piece, fps);
    return {
      index,
      cut: Number((index / fps).toFixed(6)),
      at: Number(Math.max(0, (index - 0.5) / fps).toFixed(4)),
    };
  }
  const cut = Math.max(
    0,
    Number((piece.end - piece.start + (piece.offsetSeconds ?? 0)).toFixed(3)),
  );
  return { index: null, cut, at: cut };
}

/**
 * A clip's piece of the voiceover, cut (once) from the canonical file. A
 * storage read that failed is tried once more at once; anything else is a
 * reason the clip can't start, for a person.
 */
async function pieceFor(
  run: RunRow,
  clip: ClipRow,
): Promise<{ assetId: string } | { code: string; problem: string }> {
  const { voiceoverPiece } = await import("../lip-sync/slices.server");
  let failure: unknown = null;
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      const piece = await voiceoverPiece({
        preparationId: run.voiceover_preparation_id!,
        startSeconds: Number(clip.audio_start_seconds),
        endSeconds: Number(clip.audio_end_seconds),
        createdBy: run.created_by,
        projectId: run.project_id,
        label: `${run.title} · clip ${clip.position + 1}`,
      });
      return { assetId: piece.assetId };
    } catch (error) {
      failure = error;
      if (!(error instanceof AppError && error.code === "STORAGE_FAILED")) break;
    }
  }
  return {
    code: failure instanceof AppError ? failure.code : "UNKNOWN",
    problem: failure instanceof Error ? failure.message : "it couldn't be read",
  };
}

/**
 * After a clip made to a voiceover is measured: where its sound has the
 * speech against its piece, measured by the media service (measure_sync),
 * then its frame taken where it is cut. Measuring refines the cut and never
 * holds the run up for long: a clip that can't be measured is taken as in
 * step (its lips are where its piece put them) and the run goes on.
 */
async function followSync(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  if (clip.sync_status === "none") {
    const { data: claimed } = await db
      .from("long_video_clips")
      .update({ sync_status: "measuring", sync_task_id: null, claimed_at: now() } as never)
      .eq("id", clip.id)
      .eq("sync_status", "none")
      .eq("attempt", clip.attempt)
      .select("*");
    const next = claimed?.[0];
    return next ? enqueueSync(run, next, isLast) : true;
  }
  if (!clip.sync_task_id) {
    // Claimed, but its task was never recorded: asked again once the claim is stale.
    if (clip.claimed_at && Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
      return false;
    const { data: reclaimed } = await db
      .from("long_video_clips")
      .update({ claimed_at: now() })
      .eq("id", clip.id)
      .eq("sync_status", "measuring")
      .eq("sync_attempts", clip.sync_attempts)
      .is("sync_task_id", null)
      .select("*");
    const next = reclaimed?.[0];
    return next ? enqueueSync(run, next, isLast) : true;
  }

  const { data: task } = await db
    .from("media_tasks")
    .select("id,status,error_code,error_message,output_payload,created_at,updated_at")
    .eq("id", clip.sync_task_id)
    .maybeSingle();
  if (!task)
    return syncFailed(run, clip, isLast, {
      code: "TASK_MISSING",
      message: "The media task went missing",
      retryable: true,
      again: true,
    });
  if (task.status === "completed") {
    const reading = syncReading(((task.output_payload ?? {}) as Json)["metadata"]);
    const { data: settled } = await db
      .from("long_video_clips")
      .update({
        sync_status: reading.status,
        sync_offset_seconds: reading.offsetSeconds,
        sync_result: { ...reading.result, ...(reading.reason ? { reason: reading.reason } : {}) },
        synced_at: now(),
        claimed_at: now(),
      } as never)
      .eq("id", clip.id)
      .eq("sync_status", "measuring")
      .eq("sync_task_id", task.id)
      .select("*");
    const next = settled?.[0];
    return next ? afterMeasured(run, next, isLast) : true;
  }
  if (task.status === "failed")
    return syncFailed(run, clip, isLast, {
      code: task.error_code ?? "SYNC_FAILED",
      message: task.error_message ?? "The media service couldn't measure it",
      retryable: true,
      again: true,
    });
  const since = new Date(task.updated_at ?? task.created_at).getTime();
  if (Date.now() - since > HANDOFF_TASK_STALE_MS) {
    // Taken as lost: a late result is still recorded, but no longer used.
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    return syncFailed(run, clip, isLast, {
      code: "STALLED",
      message: "The media service didn't answer",
      retryable: true,
      again: true,
    });
  }
  return false;
}

async function enqueueSync(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  const ids = [clip.output_asset_id, clip.audio_asset_id].filter((id): id is string => !!id);
  const { data: rows } =
    ids.length === 2
      ? await db
          .from("assets")
          .select("id,asset_type,storage_bucket,storage_path,mime_type")
          .in("id", ids)
      : { data: [] };
  const video = (rows ?? []).find((row) => row.id === clip.output_asset_id);
  // Its piece is a working file, kept out of the library, so it is read as it is.
  const piece = (rows ?? []).find((row) => row.id === clip.audio_asset_id);
  if (!video || !piece)
    return syncFailed(run, clip, isLast, {
      code: "SOURCE_MISSING",
      message: "The clip or its piece of the voiceover is no longer stored",
      retryable: false,
    });
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: "measure_sync",
    source: {
      assetId: video.id,
      assetType: "video",
      bucket: video.storage_bucket,
      path: video.storage_path,
      mimeType: video.mime_type,
    },
    extraSources: [
      {
        assetId: piece.id,
        assetType: "audio",
        bucket: piece.storage_bucket,
        path: piece.storage_path,
        mimeType: piece.mime_type,
        role: "audio",
      },
    ],
    params: { max_lag_seconds: 1 },
    dedupeKey: `lvs:${clip.id}:${clip.attempt}:${clip.sync_attempts}`,
    output: { count: 0, ext: "json", mime: "application/json", kind: "audio" },
    context: { long_video_clip_id: clip.id },
  });
  if (!result.ok)
    return syncFailed(run, clip, isLast, {
      code: result.code,
      message: result.message,
      // A media service from before it could measure sync says so at once: not asked again.
      retryable: result.retryable && !/unknown task/i.test(result.message),
    });
  await db
    .from("long_video_clips")
    .update({ sync_task_id: result.taskId } as never)
    .eq("id", clip.id)
    .eq("sync_status", "measuring")
    .eq("sync_attempts", clip.sync_attempts);
  return true;
}

/**
 * A measuring try that didn't work: tried again a few times (at once when the
 * media service ran it and failed, on a later pass when it couldn't take it),
 * then the clip is taken as in step and its frame taken, so the run goes on.
 */
async function syncFailed(
  run: RunRow,
  clip: ClipRow,
  isLast: boolean,
  problem: { code: string; message: string; retryable: boolean; again?: boolean },
): Promise<boolean> {
  const attempts = clip.sync_attempts + 1;
  if (!problem.retryable || attempts >= MAX_SYNC_FAILURES) {
    const { data: settled } = await db
      .from("long_video_clips")
      .update({
        sync_status: "failed",
        sync_attempts: attempts,
        sync_task_id: null,
        sync_offset_seconds: null,
        sync_result: { error_code: problem.code, error_message: problem.message },
        synced_at: now(),
        claimed_at: now(),
      } as never)
      .eq("id", clip.id)
      .eq("sync_status", "measuring")
      .eq("sync_attempts", clip.sync_attempts)
      .select("*");
    const next = settled?.[0];
    return next ? afterMeasured(run, next, isLast) : true;
  }
  const { data: moved } = await db
    .from("long_video_clips")
    .update({
      sync_attempts: attempts,
      sync_task_id: null,
      claimed_at: problem.again ? now() : new Date(Date.now() - CLAIM_STALE_MS).toISOString(),
    } as never)
    .eq("id", clip.id)
    .eq("sync_status", "measuring")
    .eq("sync_attempts", clip.sync_attempts)
    .select("*");
  const next = moved?.[0];
  if (!next) return true;
  return problem.again ? enqueueSync(run, next, isLast) : false;
}

/* ------------------------------------------------------------------ */
/* Lips scored from the picture, and takes                             */
/* ------------------------------------------------------------------ */

/** Tries at scoring a clip's lips before it is let through unscored. */
const MAX_LIP_FAILURES = 3;
/** How long what the media service said it can do is believed. */
const WORKER_MEMORY_MS = 12 * 60 * 60_000;

/** A run that scores its clips' lips, and a clip of it made to its voiceover not scored yet. */
function lipPending(run: RunRow, clip: ClipRow): boolean {
  return (
    storedQc(run.qc_settings).lipCheck &&
    drivenByVoiceover(run, clip) &&
    (clip.lip_status === "none" || clip.lip_status === "checking")
  );
}

/**
 * After a clip made to a voiceover has its sync settled: its lips scored by
 * the media service (lip_check, see ../lip-sync/lip-check), then whatever
 * the score calls for (see afterLipScored). Scoring never holds a run up for
 * long: a clip that can't be scored goes on unscored.
 */
async function followLip(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  if (clip.lip_status === "none") {
    const { data: claimed } = await db
      .from("long_video_clips")
      .update({ lip_status: "checking", lip_task_id: null, claimed_at: now() })
      .eq("id", clip.id)
      .eq("lip_status", "none")
      .eq("attempt", clip.attempt)
      .select("*");
    const next = claimed?.[0];
    return next ? enqueueLip(run, next, isLast) : true;
  }
  if (!clip.lip_task_id) {
    // Claimed, but its task was never recorded: asked again once the claim is stale.
    if (clip.claimed_at && Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
      return false;
    const { data: reclaimed } = await db
      .from("long_video_clips")
      .update({ claimed_at: now() })
      .eq("id", clip.id)
      .eq("lip_status", "checking")
      .eq("lip_attempts", clip.lip_attempts)
      .is("lip_task_id", null)
      .select("*");
    const next = reclaimed?.[0];
    return next ? enqueueLip(run, next, isLast) : true;
  }

  const { data: task } = await db
    .from("media_tasks")
    .select("id,status,error_code,error_message,output_payload,created_at,updated_at")
    .eq("id", clip.lip_task_id)
    .maybeSingle();
  if (!task)
    return lipFailed(run, clip, isLast, {
      code: "TASK_MISSING",
      message: "The media task went missing",
      retryable: true,
      again: true,
    });
  if (task.status === "completed") {
    const reading = lipReading(((task.output_payload ?? {}) as Json)["metadata"]);
    const { data: settled } = await db
      .from("long_video_clips")
      .update({
        lip_status: reading.status,
        lip_score: reading.score,
        lip_score_at_zero: reading.scoreAtZero,
        lip_offset_frames: reading.offsetFrames,
        lip_result: { ...reading.result, ...(reading.reason ? { reason: reading.reason } : {}) },
        lip_checked_at: now(),
        claimed_at: now(),
      })
      .eq("id", clip.id)
      .eq("lip_status", "checking")
      .eq("lip_task_id", task.id)
      .select("*");
    const next = settled?.[0];
    return next ? afterLipScored(run, next, isLast) : true;
  }
  if (task.status === "failed")
    return lipFailed(run, clip, isLast, {
      code: task.error_code ?? "LIP_CHECK_FAILED",
      message: task.error_message ?? "The media service couldn't score its lips",
      // A media service that can't score lips says so at once: not asked again.
      retryable: !/unknown task|not supported|unavailable/i.test(task.error_message ?? ""),
      again: true,
    });
  const since = new Date(task.updated_at ?? task.created_at).getTime();
  if (Date.now() - since > HANDOFF_TASK_STALE_MS) {
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    return lipFailed(run, clip, isLast, {
      code: "STALLED",
      message: "The media service didn't answer",
      retryable: true,
      again: true,
    });
  }
  return false;
}

async function enqueueLip(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  // A media service known not to score lips isn't asked.
  const { rememberedWorker } = await import("../media/worker.server");
  const known = await rememberedWorker(WORKER_MEMORY_MS).catch(() => null);
  if (known && !known.features.includes("lip_check"))
    return lipFailed(run, clip, isLast, {
      code: "LIP_CHECK_UNAVAILABLE",
      message: "The media service can't score lips",
      retryable: false,
      skipped: true,
    });
  const ids = [clip.output_asset_id, clip.audio_asset_id].filter((id): id is string => !!id);
  const { data: rows } =
    ids.length === 2
      ? await db
          .from("assets")
          .select("id,asset_type,storage_bucket,storage_path,mime_type")
          .in("id", ids)
      : { data: [] };
  const video = (rows ?? []).find((row) => row.id === clip.output_asset_id);
  const piece = (rows ?? []).find((row) => row.id === clip.audio_asset_id);
  if (!video || !piece)
    return lipFailed(run, clip, isLast, {
      code: "SOURCE_MISSING",
      message: "The clip or its piece of the voiceover is no longer stored",
      retryable: false,
    });
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: "lip_check",
    source: {
      assetId: video.id,
      assetType: "video",
      bucket: video.storage_bucket,
      path: video.storage_path,
      mimeType: video.mime_type,
    },
    extraSources: [
      {
        assetId: piece.id,
        assetType: "audio",
        bucket: piece.storage_bucket,
        path: piece.storage_path,
        mimeType: piece.mime_type,
        role: "audio",
      },
    ],
    // Scored over the piece's own length (the clip runs a moment longer), and in three-second windows.
    params: {
      duration_seconds: Number(
        (Number(clip.audio_end_seconds) - Number(clip.audio_start_seconds)).toFixed(3),
      ),
      window_seconds: 3,
    },
    dedupeKey: `lvl:${clip.id}:${clip.attempt}:${clip.lip_attempts}`,
    output: { count: 0, ext: "json", mime: "application/json", kind: "video" },
    context: { long_video_clip_id: clip.id },
  });
  if (!result.ok)
    return lipFailed(run, clip, isLast, {
      code: result.code,
      message: result.message,
      retryable: result.retryable && !/unknown task/i.test(result.message),
      skipped: /unknown task/i.test(result.message),
    });
  await db
    .from("long_video_clips")
    .update({ lip_task_id: result.taskId })
    .eq("id", clip.id)
    .eq("lip_status", "checking")
    .eq("lip_attempts", clip.lip_attempts);
  return true;
}

/**
 * A scoring try that didn't work: tried again a few times, then the clip
 * goes on unscored ("failed", or "skipped" where the media service can't
 * score lips at all), so the run goes on.
 */
async function lipFailed(
  run: RunRow,
  clip: ClipRow,
  isLast: boolean,
  problem: {
    code: string;
    message: string;
    retryable: boolean;
    again?: boolean;
    skipped?: boolean;
  },
): Promise<boolean> {
  const attempts = clip.lip_attempts + 1;
  if (!problem.retryable || attempts >= MAX_LIP_FAILURES) {
    const { data: settled } = await db
      .from("long_video_clips")
      .update({
        lip_status: problem.skipped ? "skipped" : "failed",
        lip_attempts: attempts,
        lip_task_id: null,
        lip_result: { error_code: problem.code, error_message: problem.message },
        lip_checked_at: now(),
        claimed_at: now(),
      })
      .eq("id", clip.id)
      .eq("lip_status", "checking")
      .eq("lip_attempts", clip.lip_attempts)
      .select("*");
    const next = settled?.[0];
    return next ? afterMeasured(run, next, isLast) : true;
  }
  const { data: moved } = await db
    .from("long_video_clips")
    .update({
      lip_attempts: attempts,
      lip_task_id: null,
      claimed_at: problem.again ? now() : new Date(Date.now() - CLAIM_STALE_MS).toISOString(),
    })
    .eq("id", clip.id)
    .eq("lip_status", "checking")
    .eq("lip_attempts", clip.lip_attempts)
    .select("*");
  const next = moved?.[0];
  if (!next) return true;
  return problem.again ? enqueueLip(run, next, isLast) : false;
}

/**
 * A clip's lips were scored. Under the run's "make again" score, it gets
 * another take while the run allows more (the same request, a new attempt);
 * once they are spent the best take is used, and if even that is poor the run
 * stops for a person (Continue keeps it; Another take tries again). Anything
 * else goes on to its frame.
 */
async function afterLipScored(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  const qc = storedQc(run.qc_settings);
  const score =
    clip.lip_status === "scored" && clip.lip_score !== null ? Number(clip.lip_score) : null;
  if (score === null || score >= qc.redoBelow) return afterMeasured(run, clip, isLast);
  const takes = await takesOf(clip.id);
  if (takes.length + 1 < qc.takes) return makeAnotherTake(run, clip, "best_of");
  const candidates = [
    ...takes.map((take) => ({
      lipScore: take.lip_score === null ? null : Number(take.lip_score),
      attempt: take.attempt,
      take,
    })),
    { lipScore: score, attempt: clip.attempt, take: null },
  ];
  const best = bestTake(candidates);
  if (best?.take && (best.lipScore ?? -Infinity) > score) {
    await restoreTake(run, clip, best.take);
    return true;
  }
  if (score < qc.redoBelow) {
    // Continue keeps it: its frame is taken at once, not after a claim lapses.
    await db
      .from("long_video_clips")
      .update({ claimed_at: null })
      .eq("id", clip.id)
      .eq("attempt", clip.attempt)
      .eq("handoff_status", "extracting");
    await pause(
      run,
      "LIP_CHECK",
      `${clipLabel(clip)}'s lips barely follow the voice (SyncNet ${score.toFixed(1)}${takes.length ? ` after ${takes.length + 1} takes` : ""}). Make another take, or press Continue to keep it.`,
    );
    return false;
  }
  return afterMeasured(run, clip, isLast);
}

/** A clip's fields that belong to one take of it, kept with the take and restored with it. */
const TAKE_FIELDS = [
  "generation_id",
  "output_asset_id",
  "output_duration_seconds",
  "output_fps",
  "output_width",
  "output_height",
  "start_frame_asset_id",
  "end_frame_asset_id",
  "audio_asset_id",
  "started_at",
  "completed_at",
  "sync_status",
  "sync_offset_seconds",
  "sync_result",
  "synced_at",
  "lip_status",
  "lip_score",
  "lip_score_at_zero",
  "lip_offset_frames",
  "lip_result",
  "lip_checked_at",
] as const;

type TakeRow = Database["public"]["Tables"]["long_video_clip_takes"]["Row"];

/** A clip's kept takes, oldest first (none before the database has them). */
async function takesOf(clipId: string): Promise<TakeRow[]> {
  const { data, error } = await db
    .from("long_video_clip_takes")
    .select("*")
    .eq("clip_id", clipId)
    .order("attempt");
  if (error) return [];
  return data ?? [];
}

/** The attempt a clip's video came from (its generation's request key says), else its own. */
async function takeAttemptOf(clip: ClipRow): Promise<number> {
  if (!clip.generation_id) return clip.attempt;
  const { data } = await db
    .from("generations")
    .select("client_request_id")
    .eq("id", clip.generation_id)
    .maybeSingle();
  const match = /^lvc:[^:]+:(\d+)$/.exec(data?.client_request_id ?? "");
  return match ? Number(match[1]) : clip.attempt;
}

/** Keeps the take a clip has now (once), so it can be swapped back in. A database without takes keeps none. */
async function keepTake(clip: ClipRow, reason: "take" | "redo" | "best_of"): Promise<void> {
  if (clip.status !== "completed" || !clip.output_asset_id) return;
  const snapshot: Json = {};
  for (const field of TAKE_FIELDS) snapshot[field] = (clip as unknown as Json)[field] ?? null;
  const { error } = await db.from("long_video_clip_takes").upsert(
    {
      long_video_id: clip.long_video_id,
      clip_id: clip.id,
      attempt: await takeAttemptOf(clip),
      generation_id: clip.generation_id,
      output_asset_id: clip.output_asset_id,
      start_frame_asset_id: clip.start_frame_asset_id,
      snapshot: snapshot as never,
      lip_score: clip.lip_status === "scored" ? clip.lip_score : null,
      reason,
    },
    { onConflict: "clip_id,attempt", ignoreDuplicates: true },
  );
  if (error && !isMissingTableError(error))
    console.error("take not kept", { clipId: clip.id, message: error.message });
}

/**
 * Makes a finished clip again as a new attempt (a new, billed generation from
 * the same request), keeping the take it has as one to swap back. The edit
 * made from the run (if any) is let go, so opening it again shows the new one.
 */
async function makeAnotherTake(
  run: Pick<RunRow, "id">,
  clip: ClipRow,
  reason: "redo" | "best_of",
  options: { startFrame?: string | null } = {},
): Promise<boolean> {
  await keepTake(clip, reason);
  const { data: reset } = await db
    .from("long_video_clips")
    .update({
      ...CLEARED_TAKE,
      ...CLEARED_CHECK,
      ...("sync_status" in clip ? CLEARED_SYNC : {}),
      ...("lip_status" in clip ? CLEARED_LIP : {}),
      ...(options.startFrame !== undefined
        ? { start_frame_override_asset_id: options.startFrame }
        : {}),
      status: "waiting",
      attempt: clip.attempt + 1,
    })
    .eq("id", clip.id)
    .eq("status", "completed")
    .eq("attempt", clip.attempt)
    .select("id");
  if (!reset?.length) return false;
  await db.from("long_videos").update({ sequence_id: null }).eq("id", run.id);
  return true;
}

/**
 * Puts a kept take back in place of the one a clip has (which is kept in
 * turn): its video and what was measured of it. Its frame and its identity
 * check are taken again for it, so the run goes on from this take.
 */
async function restoreTake(
  run: Pick<RunRow, "id">,
  clip: ClipRow,
  take: TakeRow,
): Promise<boolean> {
  await keepTake(clip, "take");
  const snapshot = (take.snapshot ?? {}) as Json;
  const restored: Json = {};
  for (const field of TAKE_FIELDS) if (field in snapshot) restored[field] = snapshot[field];
  const nextRound =
    Math.ceil((clip.handoff_attempts + 1) / MAX_HANDOFF_FAILURES) * MAX_HANDOFF_FAILURES;
  const { data: swapped } = await db
    .from("long_video_clips")
    .update({
      ...CLEARED_CHECK,
      ...restored,
      status: "completed",
      handoff_status: "extracting",
      handoff_task_id: null,
      handoff_asset_id: null,
      handoff_time_seconds: null,
      handoff_attempts: nextRound,
      sync_task_id: null,
      lip_task_id: null,
      claimed_at: null,
      error_code: null,
      error_message: null,
    } as never)
    .eq("id", clip.id)
    .eq("attempt", clip.attempt)
    .eq("status", "completed")
    .select("id");
  if (!swapped?.length) return false;
  await db.from("long_video_clip_takes").delete().eq("id", take.id);
  await db.from("long_videos").update({ sequence_id: null }).eq("id", run.id);
  return true;
}

/* ------------------------------------------------------------------ */
/* Clips that extend the clip before                                   */
/* ------------------------------------------------------------------ */

/** The media task that separates an extension's own footage from the clip it was given. */
const SEPARATE_TASK = "trim_video";

/** A clip made by extending the clip before (given its video), rather than from a frame of it. */
async function extendsClipBefore(clip: Pick<ClipRow, "position" | "model_registry_id">) {
  return clip.position > 0 && clipStart(await loadModel(clip.model_registry_id))?.kind === "video";
}

/**
 * Where a clip's own footage starts in its video, for a clip that extended
 * the clip before and came back as one video, that clip then its own part
 * (see extensionLead); null otherwise.
 */
async function extensionLeadOf(clip: ClipRow, outputSeconds: number): Promise<number | null> {
  if (!(await extendsClipBefore(clip))) return null;
  const { data: given } = await db
    .from("long_video_clips")
    .select("output_duration_seconds")
    .eq("long_video_id", clip.long_video_id)
    .eq("position", clip.position - 1)
    .maybeSingle();
  return extensionLead({
    outputSeconds,
    requestedSeconds: Number(clip.duration_seconds),
    sourceSeconds: Number(given?.output_duration_seconds ?? 0),
  });
}

/**
 * Keeps an extension's own footage: its video from where the clip it was
 * given ends. The clip's video becomes that footage alone (the video as it
 * came back stays in the library), so the Editor shows every moment once,
 * and the next clip is given just this one to extend: its input, and what it
 * is billed for, stays one clip long rather than growing with every clip.
 */
async function enqueueSeparation(run: RunRow, clip: ClipRow, lead: number): Promise<boolean> {
  const { data: asset } = clip.output_asset_id
    ? await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,mime_type")
        .eq("id", clip.output_asset_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (!asset)
    return handoffFailed(run, clip, "probe", false, {
      code: "VIDEO_MISSING",
      message: "Its video is no longer in the library",
      retryable: false,
      separating: true,
    });
  const length = Number(clip.output_duration_seconds) || lead + 30;
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: SEPARATE_TASK,
    source: {
      assetId: asset.id,
      assetType: "video",
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      mimeType: asset.mime_type,
    },
    params: {
      start_seconds: frameTrimStart(lead, Number(clip.output_fps) || null),
      // Past its end, so nothing of it is cut.
      end_seconds: Number((length + 1).toFixed(3)),
      crf: 16,
    },
    dedupeKey: `lvh:${clip.id}:${clip.attempt}:separate:${clip.handoff_attempts}`,
    output: { count: 1, ext: "mp4", mime: "video/mp4", kind: "video" },
    context: {
      long_video_clip_id: clip.id,
      extension_lead_seconds: lead,
      output_title: `${run.title} · clip ${clip.position + 1}`.slice(0, 120),
    },
  });
  if (!result.ok)
    return handoffFailed(run, clip, "probe", false, {
      code: result.code,
      message: result.message,
      retryable: result.retryable,
      separating: true,
    });
  await db
    .from("long_video_clips")
    .update({ handoff_task_id: result.taskId })
    .eq("id", clip.id)
    .eq("handoff_status", "probing")
    .eq("handoff_attempts", clip.handoff_attempts);
  return true;
}

/** An extension's own footage is in: it becomes the clip's video, and its last frame is taken. */
async function separated(
  run: RunRow,
  clip: ClipRow,
  task: { id: string; result_asset_id: string | null; output_payload: unknown },
  isLast: boolean,
): Promise<boolean> {
  const measured = task.result_asset_id ? measuredFrom(task.output_payload, clip) : null;
  if (!task.result_asset_id || !measured)
    return handoffFailed(run, clip, "probe", false, {
      code: "SEPARATION_FAILED",
      message: "Its own footage didn't come back",
      retryable: true,
      separating: true,
    });
  const asReturned = clip.output_asset_id;
  const { data: moved } = await db
    .from("long_video_clips")
    .update({
      ...measured,
      output_asset_id: task.result_asset_id,
      handoff_status: "extracting",
      handoff_task_id: null,
      claimed_at: now(),
    })
    .eq("id", clip.id)
    .eq("handoff_status", "probing")
    .eq("handoff_task_id", task.id)
    .select("*");
  const next = moved?.[0];
  if (!next) return true;
  if (asReturned)
    await db
      .from("assets")
      .update({
        title: `${run.title} · clip ${clip.position + 1}, with clip ${clip.position}`.slice(0, 120),
      })
      .eq("id", asReturned);
  return afterMeasured(run, next, isLast);
}

/**
 * A measuring or frame try that didn't work. It is tried again (a frame a
 * little earlier in the clip) up to a few times; then, or straight away when
 * trying again can't help, the run waits for a person, except for the last
 * clip, which is only measured and so is done without it. A task the media
 * service ran and failed is tried again at once; one it couldn't take (busy,
 * unreachable) is left for a later pass, so a busy service isn't asked again
 * immediately.
 *
 * A clip that extended the clip before is never done without being measured
 * and its own footage separated (`separating`): its video may hold that clip
 * too, which the Editor would then show twice.
 */
async function handoffFailed(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
  problem: {
    code: string;
    message: string;
    retryable: boolean;
    again?: boolean;
    separating?: boolean;
  },
): Promise<boolean> {
  const failures = clip.handoff_attempts + 1;
  const status = kind === "probe" ? "probing" : "extracting";
  // Tries in this round (see resetHandoff): each round has the full number.
  const thisRound = (clip.handoff_attempts % MAX_HANDOFF_FAILURES) + 1;
  if (!problem.retryable || thisRound >= MAX_HANDOFF_FAILURES) {
    const doneWithout =
      isLast && !problem.separating && !(kind === "probe" && (await extendsClipBefore(clip)));
    if (doneWithout) {
      // The last clip is done without it: without a measurement the Editor
      // uses the length the clip was asked for, and without its final frame
      // the end card is laid out on its own.
      const { data } = await db
        .from("long_video_clips")
        .update({
          handoff_status: "not_needed",
          handoff_attempts: failures,
          handoff_task_id: null,
          error_code: problem.code,
          error_message:
            kind === "probe"
              ? `It couldn't be measured: ${problem.message}`
              : `Its final frame couldn't be taken: ${problem.message}`,
        })
        .eq("id", clip.id)
        .eq("handoff_status", status)
        .eq("handoff_attempts", clip.handoff_attempts)
        .select("id");
      return !!data?.length;
    }
    const text = problem.separating
      ? `${clipLabel(clip)} came back joined to clip ${clip.position}, which it extends, and its own footage couldn't be separated: ${problem.message}`
      : isLast
        ? `${clipLabel(clip)} couldn't be measured: ${problem.message}`
        : `The start frame for clip ${clip.position + 2} couldn't be taken from clip ${clip.position + 1}: ${problem.message}`;
    const { data } = await db
      .from("long_video_clips")
      .update({
        handoff_status: "failed",
        handoff_attempts: failures,
        error_code: problem.code,
        error_message: text,
      })
      .eq("id", clip.id)
      .eq("handoff_status", status)
      .eq("handoff_attempts", clip.handoff_attempts)
      .select("id");
    if (data?.length) await pause(run, "HANDOFF_FAILED", text);
    return false;
  }
  const { data: moved } = await db
    .from("long_video_clips")
    .update({
      handoff_status: kind === "probe" ? "none" : "extracting",
      handoff_attempts: failures,
      handoff_task_id: null,
      claimed_at: problem.again ? now() : new Date(Date.now() - CLAIM_STALE_MS).toISOString(),
      error_code: problem.code,
      error_message: problem.message,
    })
    .eq("id", clip.id)
    .eq("handoff_status", status)
    .eq("handoff_attempts", clip.handoff_attempts)
    .select("*");
  const next = moved?.[0];
  if (!next) return true;
  if (!problem.again) return false;
  return kind === "probe" ? true : enqueueHandoff(run, next, "frame", isLast);
}

/* ------------------------------------------------------------------ */
/* Identity checks: is everyone still who they were?                   */
/* ------------------------------------------------------------------ */

/** Where in a clip its check looks besides its last frame, as shares of its length. */
const SAMPLE_POINTS = [0.2, 0.5, 0.8] as const;

/** The characters in a clip (or keyframe): those its beat names, or all when it names none. */
function castFor(run: RunRow, beat: string): RunCharacter[] {
  return castOf(beat, storedCharacters(run.characters));
}

/** A lease that has lapsed (or was never taken). */
function leaseFree(claimedAt: string | null): boolean {
  return !claimedAt || Date.now() - new Date(claimedAt).getTime() > CHECK_LEASE_MS;
}

/**
 * The longest an AI check is given, and the least worth starting one with
 * (more than a step set off by an event has: those leave checks to the
 * reconcile pass, or to a page that's open).
 */
const CHECK_TIME_MS = 60_000;
const CHECK_MIN_MS = 30_000;

/**
 * How long a check started now may take: a full minute, or what is left
 * before the deadline (null: too little to start one; a later pass will).
 */
function checkTime(deadline: number | null): number | null {
  if (!deadline) return CHECK_TIME_MS;
  const left = deadline - Date.now() - 3_000;
  return left >= CHECK_MIN_MS ? Math.min(CHECK_TIME_MS, left) : null;
}

/**
 * After a clip's handoff: a few frames from inside it are taken (small, kept
 * out of the library), then the studio's AI compares them and its last frame
 * with its characters' reference images. A character who changed stops the
 * run before the next clip is paid for.
 */
async function followCheck(run: RunRow, clip: ClipRow, deadline: number | null): Promise<boolean> {
  switch (clip.check_status) {
    case "none":
      return startSampling(run, clip);
    case "sampling":
      return followSampling(run, clip);
    case "checking":
      return runClipCheck(run, clip, deadline);
    case "flagged": {
      const result = (clip.check_result ?? {}) as Partial<IdentityResult>;
      await pause(
        run,
        "CHARACTER_CHECK",
        `${clipLabel(clip)}: ${result.summary ?? "a character looks different"}. Redo the clip, or keep it and carry on.`,
      );
      return false;
    }
    default:
      return false;
  }
}

/** Starts taking the frames a clip is checked on. */
async function startSampling(run: RunRow, clip: ClipRow): Promise<boolean> {
  const claim = now();
  const { data: claimed } = await db
    .from("long_video_clips")
    .update({ check_status: "sampling", check_task_id: null, check_claimed_at: claim })
    .eq("id", clip.id)
    .eq("check_status", clip.check_status)
    .eq("check_attempts", clip.check_attempts)
    .select("*");
  const next = claimed?.[0];
  if (!next) return true;
  return enqueueSampling(run, next, claim);
}

async function enqueueSampling(run: RunRow, clip: ClipRow, claim: string): Promise<boolean> {
  const { data: video, error: videoError } = clip.output_asset_id
    ? await db
        .from("assets")
        .select("id,storage_bucket,storage_path,mime_type")
        .eq("id", clip.output_asset_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };
  // Not read just now: this claim lapses and the frames are asked for again
  // (followSampling), rather than the clip being checked without them.
  if (videoError) return false;
  const length = Number(clip.output_duration_seconds ?? clip.duration_seconds);
  // Without its video (or its length), the check looks at its last frame alone.
  if (!video || !(length > 0.5)) return checkWithoutSamples(clip, claim);
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: "extract_frames",
    source: {
      assetId: video.id,
      assetType: "video",
      bucket: video.storage_bucket,
      path: video.storage_path,
      mimeType: video.mime_type,
    },
    params: {
      times_seconds: SAMPLE_POINTS.map((share) =>
        Number(Math.min(length - 0.05, Math.max(0, length * share)).toFixed(3)),
      ),
      format: "jpg",
      width: 768,
    },
    // A new key for every attempt (and every retry of the clip), never an old video's frames.
    dedupeKey: `lvc-check:${clip.id}:${clip.attempt}:${clip.check_attempts}`,
    output: { count: SAMPLE_POINTS.length, ext: "jpg", mime: "image/jpeg", kind: "image" },
    context: { long_video_clip_id: clip.id, register_outputs: false },
  });
  if (!result.ok) {
    // A busy media service is asked again once this claim lapses (followSampling);
    // one that can't do it at all is done without.
    if (result.retryable && clip.check_attempts + 1 < MAX_CHECK_FAILURES) {
      await db
        .from("long_video_clips")
        .update({ check_attempts: clip.check_attempts + 1 })
        .eq("id", clip.id)
        .eq("check_status", "sampling")
        .eq("check_claimed_at", claim);
      return false;
    }
    return checkWithoutSamples(clip, claim);
  }
  await db
    .from("long_video_clips")
    .update({ check_task_id: result.taskId })
    .eq("id", clip.id)
    .eq("check_status", "sampling")
    .eq("check_claimed_at", claim);
  return true;
}

/** Moves a clip on to its check with its last frame only. */
async function checkWithoutSamples(clip: ClipRow, claim: string): Promise<boolean> {
  const { data } = await db
    .from("long_video_clips")
    .update({ check_status: "checking", check_task_id: null, check_claimed_at: null })
    .eq("id", clip.id)
    .eq("check_status", "sampling")
    .eq("check_claimed_at", claim)
    .select("id");
  return !!data?.length;
}

async function followSampling(run: RunRow, clip: ClipRow): Promise<boolean> {
  if (!clip.check_task_id) {
    // Claimed, but its task never recorded (a step cut short): asked again once stale.
    if (
      clip.check_claimed_at &&
      Date.now() - new Date(clip.check_claimed_at).getTime() < CLAIM_STALE_MS
    )
      return false;
    const claim = now();
    const { data: reclaimed } = await db
      .from("long_video_clips")
      .update({ check_claimed_at: claim })
      .eq("id", clip.id)
      .eq("check_status", "sampling")
      .is("check_task_id", null)
      .eq("check_attempts", clip.check_attempts)
      .select("*");
    const next = reclaimed?.[0];
    return next ? enqueueSampling(run, next, claim) : true;
  }
  const { data: task, error: taskError } = await db
    .from("media_tasks")
    .select("id,status,created_at,updated_at")
    .eq("id", clip.check_task_id)
    .maybeSingle();
  // Not read just now: asked again on a later step, not taken for frames that didn't come.
  if (taskError) return false;
  if (task?.status === "completed") {
    const { data } = await db
      .from("long_video_clips")
      .update({ check_status: "checking", check_claimed_at: null })
      .eq("id", clip.id)
      .eq("check_status", "sampling")
      .eq("check_task_id", task.id)
      .select("id");
    return !!data?.length;
  }
  const stale =
    !!task &&
    task.status !== "failed" &&
    Date.now() - new Date(task.updated_at ?? task.created_at).getTime() > HANDOFF_TASK_STALE_MS;
  if (task && task.status !== "failed" && !stale) return false;
  if (task && stale)
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
  // The frames didn't come: tried again a few times, then the last frame alone is checked.
  const attempts = clip.check_attempts + 1;
  const { data } = await db
    .from("long_video_clips")
    .update(
      attempts < MAX_CHECK_FAILURES
        ? {
            check_status: "none",
            check_task_id: null,
            check_attempts: attempts,
            check_claimed_at: null,
          }
        : {
            check_status: "checking",
            check_task_id: null,
            check_attempts: attempts,
            check_claimed_at: null,
          },
    )
    .eq("id", clip.id)
    .eq("check_status", "sampling")
    .eq("check_task_id", clip.check_task_id)
    .select("id");
  return !!data?.length;
}

/**
 * The frames a clip is checked on: those taken from inside it, then its last
 * frame. Null when they couldn't be read just now (the database, not the
 * clip), so the check is tried again rather than done without them.
 */
async function checkFrames(
  clip: ClipRow,
): Promise<{ bucket: string; path: string; label: string }[] | null> {
  const frames: { bucket: string; path: string; label: string }[] = [];
  if (clip.check_task_id) {
    const { data: task, error } = await db
      .from("media_tasks")
      .select("status,output_payload")
      .eq("id", clip.check_task_id)
      .maybeSingle();
    if (error) return null;
    const files = ((task?.output_payload ?? {}) as Json)["files"];
    if (task?.status === "completed" && Array.isArray(files))
      for (const [index, file] of (files as Record<string, unknown>[]).entries())
        if (typeof file["bucket"] === "string" && typeof file["path"] === "string")
          frames.push({
            bucket: file["bucket"],
            path: file["path"],
            label: `${Math.round((SAMPLE_POINTS[index] ?? 0.5) * 100)}% of the way through`,
          });
  }
  if (clip.handoff_asset_id) {
    const { data: last, error } = await db
      .from("assets")
      .select("storage_bucket,storage_path")
      .eq("id", clip.handoff_asset_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return null;
    if (last)
      frames.push({
        bucket: last.storage_bucket,
        path: last.storage_path,
        label: "its last frame",
      });
  }
  return frames;
}

/**
 * Deletes the frames taken from inside a clip for its check, once the check
 * has its verdict: they were kept out of the library and only the check read
 * them. Its last frame (the next clip's start, a library image) is never one
 * of them. One that can't be deleted now is only logged.
 */
async function dropCheckFrames(clip: Pick<ClipRow, "id" | "check_task_id">): Promise<void> {
  if (!clip.check_task_id) return;
  const { data: task, error } = await db
    .from("media_tasks")
    .select("output_payload")
    .eq("id", clip.check_task_id)
    .maybeSingle();
  const files = ((task?.output_payload ?? {}) as Json)["files"];
  if (error || !Array.isArray(files)) return;
  const byBucket = new Map<string, string[]>();
  for (const file of files as Record<string, unknown>[])
    if (typeof file["bucket"] === "string" && typeof file["path"] === "string")
      byBucket.set(file["bucket"], [...(byBucket.get(file["bucket"]) ?? []), file["path"]]);
  for (const [bucket, paths] of byBucket) {
    const { error: removeError } = await db.storage.from(bucket).remove(paths);
    if (removeError)
      console.error("check frames not deleted", {
        clipId: clip.id,
        bucket,
        message: removeError.message,
      });
  }
}

/**
 * The check itself, under a lease: only one worker runs it at a time, a run
 * cut short is taken up again once its lease lapses (that isn't a failure),
 * and only the worker holding the lease writes the answer.
 */
async function runClipCheck(run: RunRow, clip: ClipRow, deadline: number | null): Promise<boolean> {
  if (!leaseFree(clip.check_claimed_at)) return false;
  const time = checkTime(deadline);
  if (time === null) return false;
  if (clip.check_claims >= MAX_CHECK_CLAIMS) {
    const ended = await settleCheck("long_video_clips", clip, clip.check_claimed_at, {
      check_status: "unavailable",
      check_result: { error: "The check kept being cut short" },
    });
    if (ended) await dropCheckFrames(clip);
    return ended;
  }
  const claim = now();
  const leased = db
    .from("long_video_clips")
    .update({ check_claimed_at: claim, check_claims: clip.check_claims + 1 })
    .eq("id", clip.id)
    .eq("check_status", "checking")
    .eq("check_claims", clip.check_claims);
  const { data: held } = await (
    clip.check_claimed_at
      ? leased.eq("check_claimed_at", clip.check_claimed_at)
      : leased.is("check_claimed_at", null)
  ).select("id");
  if (!held?.length) return true;

  const frames = await checkFrames(clip);
  const { checkIdentity } = await import("../characters/identity.server");
  const outcome = !frames
    ? FRAMES_UNREAD
    : frames.length
      ? await checkIdentity({
          characters: castFor(run, clip.beat),
          frames,
          what: clipLabel(clip).toLowerCase(),
          beat: clip.beat,
          timeoutMs: time,
        })
      : ({
          ok: false,
          code: "NO_FRAMES",
          message: "No frames of it could be read",
          retryable: false,
        } as const);
  const patch = checkPatch(outcome, clip.check_attempts, time);
  // Only a verdict that was written stops the run (the lease may have lapsed).
  const settled = await settleCheck("long_video_clips", clip, claim, patch);
  if (!settled) return false;
  if (patch.check_status !== "checking") await dropCheckFrames(clip);
  if (patch.check_status === "flagged") {
    const result = patch.check_result as unknown as IdentityResult;
    await pause(
      run,
      "CHARACTER_CHECK",
      `${clipLabel(clip)}: ${result.summary ?? "a character looks different"}. Redo the clip, or keep it and carry on.`,
    );
    return false;
  }
  // A check that failed and will be tried again waits for a later step.
  return patch.check_status !== "checking";
}

type CheckPatch = {
  check_status: string;
  check_result: Json;
  check_attempts?: number;
  check_claimed_at?: string | null;
  checked_at?: string;
};

/**
 * A check whose frames couldn't be read just now (a database error): never
 * taken for a clip or keyframe with nothing to check, which would let the
 * next paid clip go ahead unchecked.
 */
const FRAMES_UNREAD = {
  ok: false,
  code: "FRAMES_UNREAD",
  message: "Its frames couldn't be read just now",
  retryable: true,
} as const;

/** What a check's outcome writes: its verdict, or a try again in a little while, or "unavailable". */
function checkPatch(
  outcome: Awaited<ReturnType<typeof import("../characters/identity.server").checkIdentity>>,
  attempts: number,
  time: number,
): CheckPatch {
  // Cut short only by the time this pass had left, or its frames not read
  // just now: not the AI failing, so tried again by the next pass at once;
  // the lease it took still counts, so a check that never gets through ends
  // as "unavailable" (MAX_CHECK_CLAIMS) and the run goes on.
  if (
    !outcome.ok &&
    ((outcome.code === "REASONING_TIMEOUT" && time < CHECK_TIME_MS) ||
      outcome.code === FRAMES_UNREAD.code)
  )
    return {
      check_status: "checking",
      check_result: { error: outcome.message, code: outcome.code },
      check_claimed_at: new Date(Date.now() - CHECK_LEASE_MS).toISOString(),
    };
  if (outcome.ok)
    return {
      check_status: outcome.result.flagged ? "flagged" : "passed",
      check_result: outcome.result as unknown as Json,
      checked_at: now(),
    };
  if (outcome.retryable && attempts + 1 < MAX_CHECK_FAILURES)
    return {
      check_status: "checking",
      check_attempts: attempts + 1,
      check_result: { error: outcome.message, code: outcome.code },
      // Free again in half a minute, not at once: a busy AI isn't asked straight back.
      check_claimed_at: new Date(Date.now() - CHECK_LEASE_MS + 30_000).toISOString(),
    };
  return {
    check_status: "unavailable",
    check_attempts: attempts + 1,
    check_result: { error: outcome.message, code: outcome.code },
    checked_at: now(),
  };
}

/** Writes a check's outcome, only while the lease `claim` is still this worker's. */
async function settleCheck(
  table: "long_video_clips" | "long_video_keyframes",
  row: { id: string },
  claim: string | null,
  patch: CheckPatch,
): Promise<boolean> {
  const update = db
    .from(table)
    .update(patch as never)
    .eq("id", row.id)
    .eq("check_status", "checking");
  const { data } = await (
    claim ? update.eq("check_claimed_at", claim) : update.is("check_claimed_at", null)
  ).select("id");
  return !!data?.length;
}

/* ------------------------------------------------------------------ */
/* The storyboard: keyframes painted before the clips                  */
/* ------------------------------------------------------------------ */

/** A keyframe as the storyboard names it: the opening one, or the end of clip i. */
const keyframeLabel = (keyframe: Pick<KeyframeRow, "position">) =>
  keyframe.position === 0
    ? "The opening keyframe"
    : `The keyframe at the end of clip ${keyframe.position}`;

/** A keyframe is settled once it's painted (or given) and, where characters are checked, looked at. */
function keyframeSettled(run: RunRow, keyframe: KeyframeRow): boolean {
  if (keyframe.status !== "completed") return false;
  if (keyframe.provided || !checksCharacters(run)) return true;
  return SETTLED_CHECKS.has(keyframe.check_status) || keyframe.check_status === "flagged";
}

/**
 * The storyboard, one keyframe after another (each is painted from the one
 * before): painted, cut to the frame size, then checked against the
 * characters. Once all are in, a person reviews them (or, with review off,
 * they're approved unless one was flagged), and the clips start.
 */
async function stepStoryboard(
  run: RunRow,
  clips: ClipRow[],
  keyframes: KeyframeRow[],
  deadline: number | null,
): Promise<boolean> {
  if (!keyframes.length) {
    // A run a moment old may still be recording them.
    if (Date.now() - new Date(run.created_at).getTime() < CLAIM_STALE_MS) return false;
    await pause(
      run,
      "KEYFRAME_MISSING",
      "This video's keyframes weren't recorded when it started, so it can't go on. Start it again.",
    );
    return false;
  }
  const current = keyframes.find((keyframe) => !keyframeSettled(run, keyframe));
  if (!current) {
    const flagged = keyframes.filter((keyframe) => keyframe.check_status === "flagged");
    if (run.storyboard_review || flagged.length) {
      const summaries = flagged.map((keyframe) => {
        const result = (keyframe.check_result ?? {}) as Partial<IdentityResult>;
        return `${keyframeLabel(keyframe)}: ${result.summary ?? "a character looks different"}`;
      });
      await pause(
        run,
        "STORYBOARD_READY",
        summaries.length
          ? `The keyframes are ready, but ${summaries.length === 1 ? "one doesn't" : `${summaries.length} don't`} match the characters (${summaries.join("; ")}). Redo or keep ${summaries.length === 1 ? "it" : "them"}, then make the video.`
          : "The keyframes are ready. Look them over (redo any you don't like), then make the video.",
      );
      return false;
    }
    // With review off, approved as the run's own (under the same lock as a redo).
    const { data, error } = await db.rpc("approve_long_video_storyboard", {
      p_run_id: run.id,
      p_by_person: false,
    });
    if (error) throw new Error(`The keyframes couldn't be approved: ${error.message}`);
    return (data as { outcome?: string } | null)?.outcome === "approved";
  }
  // Each keyframe is painted from the one before: one the check flagged is
  // looked at (redone, or kept) before any more are painted, and paid for,
  // from it. One already being painted still finishes.
  const flagged = keyframes.find(
    (keyframe) => keyframe.position < current.position && keyframe.check_status === "flagged",
  );
  if (flagged && current.status === "waiting") {
    const result = (flagged.check_result ?? {}) as Partial<IdentityResult>;
    await pause(
      run,
      "KEYFRAME_CHECK",
      `${keyframeLabel(flagged)}: ${result.summary ?? "a character looks different"}. Redo it, or keep it, before the rest are painted from it.`,
    );
    // Kept (or redone) after these keyframes were read, so before the pause
    // landed: Keep found the run still going and had nothing to lift, so the
    // pause is lifted here and the storyboard goes on.
    const { data: still } = await db
      .from("long_video_keyframes")
      .select("check_status")
      .eq("id", flagged.id)
      .maybeSingle();
    if (!still || still.check_status === "flagged") return false;
    const { data: lifted } = await db
      .from("long_videos")
      .update({ status: "running", error_code: null, error_message: null })
      .eq("id", run.id)
      .eq("status", "needs_attention")
      .eq("error_code", "KEYFRAME_CHECK")
      .select("id");
    return !!lifted?.length;
  }
  // Clips that couldn't be tried when the video started (no image could stand
  // in for their frames) are tried with the opening keyframe before the next
  // one is painted.
  if (current.status === "waiting" && current.position > 0) {
    // Refused (the run is stopped with it), or not recorded as tried: a later
    // step tries them again before any more are painted.
    const tried = await tryKeptClips(run, keyframes);
    if (tried.refused || !tried.recorded) return false;
  }
  const previous = keyframes.find((keyframe) => keyframe.position === current.position - 1) ?? null;
  switch (current.status) {
    case "waiting":
      return startKeyframe(run, current, previous, clips);
    case "submitting":
      return recoverKeyframeClaim(current);
    case "generating":
      return followKeyframeGeneration(run, current);
    case "sizing":
      return followKeyframeSizing(run, current);
    case "completed":
      return checkKeyframe(run, current, clips, deadline);
    default:
      await pause(
        run,
        "KEYFRAME_FAILED",
        `${keyframeLabel(current)}: ${current.error_message ?? "it couldn't be painted"}. Redo it to carry on.`,
      );
      return false;
  }
}

/** The request key of a keyframe's attempt: one generation per attempt, ever. */
export function keyframeRequestKey(keyframe: Pick<KeyframeRow, "id" | "attempt">): string {
  return `lvk:${keyframe.id}:${keyframe.attempt}`;
}

/**
 * Fails a keyframe that is still where this step found it (its state and
 * attempt), keeping the reason (an unclear submission needs confirming before
 * it is painted again), and stops the run for a person to redo it.
 */
async function failKeyframe(
  run: Pick<RunRow, "id">,
  keyframe: KeyframeRow,
  from: KeyframeRow["status"],
  code: string,
  message: string,
): Promise<false> {
  const { data } = await db
    .from("long_video_keyframes")
    .update({ status: "failed", error_code: code, error_message: message })
    .eq("id", keyframe.id)
    .eq("status", from)
    .eq("attempt", keyframe.attempt)
    .select("id");
  if (data?.length)
    await pause(
      run,
      "KEYFRAME_FAILED",
      `${keyframeLabel(keyframe)}: ${message}. Redo it to carry on.`,
    );
  return false;
}

/** The person's own images the keyframes are painted with (product, setting): not frames, not the finisher. */
async function paintingReferences(run: RunRow): Promise<string[]> {
  const entries = (Array.isArray(run.references_used) ? run.references_used : []) as Record<
    string,
    unknown
  >[];
  const ids = entries
    .filter((entry) => entry["role"] === "reference" || entry["role"] === "unused")
    .map((entry) => entry["asset_id"])
    .filter((id): id is string => typeof id === "string");
  if (!ids.length) return [];
  const { data } = await db
    .from("assets")
    .select("id,asset_type")
    .in("id", ids)
    .is("deleted_at", null);
  return ids.filter((id) =>
    (data ?? []).some((asset) => asset.id === id && asset.asset_type === "image"),
  );
}

async function startKeyframe(
  run: RunRow,
  keyframe: KeyframeRow,
  previous: KeyframeRow | null,
  clips: ClipRow[],
): Promise<boolean> {
  // Claimed as read (its attempt too): the request key below is this
  // attempt's. Under the run's lock, and only while the keyframe it is painted
  // from is still the one read (a redo meanwhile replaces it) and no kept
  // clip requests wait to be tried (claim_long_video_keyframe).
  const { data: claim, error: claimError } = await db.rpc("claim_long_video_keyframe", {
    p_keyframe_id: keyframe.id,
    p_attempt: keyframe.attempt,
    p_previous_id: previous?.asset_id ? previous.id : null,
    p_previous_attempt: previous?.asset_id ? previous.attempt : null,
    p_previous_asset_id: previous?.asset_id ?? null,
  });
  if (claimError) throw new Error(`The keyframe couldn't be claimed: ${claimError.message}`);
  const outcome = (claim as { outcome?: string } | null)?.outcome;
  // Taken, or the one before changed: read again. Kept clip requests first,
  // or the run stopped: nothing more now.
  if (outcome !== "claimed") return outcome === "taken" || outcome === "stale";

  const painter = run.keyframe_model_id ? await loadModel(run.keyframe_model_id) : null;
  const settings = storedKeyframeSettings(run.keyframe_settings);
  if (!painter?.is_active || !settings)
    return failKeyframe(
      run,
      keyframe,
      "submitting",
      "MODEL_UNAVAILABLE",
      "Its image model is no longer available",
    );
  const before = keyframe.position > 0 ? (previous?.asset_id ?? null) : null;
  if (keyframe.position > 0 && !before)
    return failKeyframe(
      run,
      keyframe,
      "submitting",
      "KEYFRAME_MISSING",
      "The keyframe before it is missing",
    );

  const beats = clips.map((clip) => clip.beat);
  const cast = castFor(run, keyframeBeat(keyframe.position, beats));
  // The opening keyframe from the character's Soul ID, when the run was set
  // to (its Soul model takes no images: the likeness is the Soul ID's, the
  // scene the prompt's).
  const soul = paintsWithSoul(settings, keyframe.position, cast);
  const soulPainter = soul ? await loadModel(soul.modelId) : null;
  const withSoul = !!soul && !!soulPainter?.is_active;
  const model = withSoul ? soulPainter! : painter;
  const chosen = withSoul
    ? { inputs: [], characterImages: new Map<string, string>(), references: 0 }
    : keyframeInputs({
        painter,
        previous: before,
        characters: cast,
        references: await paintingReferences(run),
      });
  const prompt = keyframePrompt({
    position: keyframe.position,
    final: keyframe.position === clips.length,
    budget: Math.min(promptBudget(model) ?? KEYFRAME_PROMPT_MAX, KEYFRAME_PROMPT_MAX),
    story: run.story,
    beats,
    durations: clips.map((clip) => Number(clip.duration_seconds)),
    continuity: run.continuity,
    characters: cast,
    characterImages: chosen.characterImages,
    previous: !!before,
    references: chosen.references,
    aspect: settings.aspect,
    note: keyframe.note,
  });
  const values = withSoul
    ? soulStillValues(model, settings.width / settings.height, soul!.referenceId)
    : settings.values;

  const key = keyframeRequestKey(keyframe);
  const attach = async (generationId: string) => {
    const { error } = await db
      .from("long_video_keyframes")
      .update({ status: "generating", generation_id: generationId, prompt, started_at: now() })
      .eq("id", keyframe.id)
      .eq("status", "submitting")
      .eq("attempt", keyframe.attempt);
    // Found again by its key once the claim lapses (recoverKeyframeClaim): never painted twice.
    if (error)
      console.error("keyframe generation not linked", {
        keyframeId: keyframe.id,
        generationId,
        message: error.message,
      });
  };
  try {
    if (!run.created_by)
      throw new AppError(
        "NOT_AUTHORIZED",
        "The person who started this run is no longer on the team",
      );
    await assertGenerationAllowed(run.created_by);
    const started = await createAndSubmitGeneration({
      userId: run.created_by,
      model,
      parameters: { ...values, prompt },
      inputs: chosen.inputs.map((item, position) => ({ ...item, position })),
      projectId: run.project_id,
      campaignId: run.campaign_id,
      generationGroupId: run.id,
      estimatedCostUsd: settings.unitUsd,
      clientRequestId: key,
    });
    await attach(started.generationId);
    return true;
  } catch (error) {
    // A generation recorded before the failure is followed, never started again.
    const existing = await generationForKey(key);
    if (existing) {
      await attach(existing.id);
      return true;
    }
    const code = error instanceof AppError ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : "It couldn't be started";
    return failKeyframe(run, keyframe, "submitting", code, message);
  }
}

/** A keyframe left "submitting" by an interrupted start: follow its generation if it got one, else start it again. */
async function recoverKeyframeClaim(keyframe: KeyframeRow): Promise<boolean> {
  if (!keyframe.claimed_at || Date.now() - new Date(keyframe.claimed_at).getTime() < CLAIM_STALE_MS)
    return false;
  const existing = await generationForKey(keyframeRequestKey(keyframe));
  if (existing) {
    const { data } = await db
      .from("long_video_keyframes")
      .update({ status: "generating", generation_id: existing.id, started_at: now() })
      .eq("id", keyframe.id)
      .eq("status", "submitting")
      .eq("attempt", keyframe.attempt)
      .select("id");
    return !!data?.length;
  }
  const { data } = await db
    .from("long_video_keyframes")
    .update({ status: "waiting", claimed_at: null })
    .eq("id", keyframe.id)
    .eq("status", "submitting")
    .eq("attempt", keyframe.attempt)
    .eq("claimed_at", keyframe.claimed_at)
    .select("id");
  return !!data?.length;
}

async function followKeyframeGeneration(run: RunRow, keyframe: KeyframeRow): Promise<boolean> {
  const outcome = await generationOutcome(keyframe.generation_id, "image");
  switch (outcome.kind) {
    case "waiting":
      return false;
    case "save_failed":
      await pause(
        run,
        "SAVE_FAILED",
        `${keyframeLabel(keyframe)} was painted but couldn't be saved to the library. Retry the save in Activity, then press Continue.`,
      );
      return false;
    case "failed":
      return failKeyframe(run, keyframe, "generating", outcome.code, outcome.message);
    case "done": {
      const { data: moved } = await db
        .from("long_video_keyframes")
        .update({
          status: "sizing",
          raw_asset_id: outcome.asset.id,
          size_task_id: null,
          claimed_at: null,
        })
        .eq("id", keyframe.id)
        .eq("status", "generating")
        .eq("attempt", keyframe.attempt)
        .select("id");
      if (moved?.length)
        await db
          .from("assets")
          .update({
            title: `${run.title} · keyframe ${keyframe.position + 1} (as painted)`.slice(0, 120),
          })
          .eq("id", outcome.asset.id);
      return !!moved?.length;
    }
  }
}

/**
 * Cuts a painted keyframe to the exact frame size every keyframe shares (the
 * clips take their shape from them). If the media service can't, the painting
 * is used as it is: a slightly different shape, never a stopped run.
 */
async function followKeyframeSizing(run: RunRow, keyframe: KeyframeRow): Promise<boolean> {
  const settings = storedKeyframeSettings(run.keyframe_settings);
  const finish = async (assetId: string | null, note: string | null) => {
    const { data } = await db
      .from("long_video_keyframes")
      .update({
        status: "completed",
        asset_id: assetId,
        completed_at: now(),
        error_code: null,
        error_message: note,
      })
      .eq("id", keyframe.id)
      .eq("status", "sizing")
      .eq("attempt", keyframe.attempt)
      .select("id");
    return !!data?.length;
  };
  if (!settings || !keyframe.raw_asset_id) return finish(keyframe.raw_asset_id, null);

  if (!keyframe.size_task_id) {
    if (
      keyframe.claimed_at &&
      Date.now() - new Date(keyframe.claimed_at).getTime() < CLAIM_STALE_MS
    )
      return false;
    const { data: raw, error: rawError } = await db
      .from("assets")
      .select("id,storage_bucket,storage_path,mime_type,width,height")
      .eq("id", keyframe.raw_asset_id)
      .is("deleted_at", null)
      .maybeSingle();
    // A read that failed waits for a later step; only a painting really gone fails it.
    if (rawError) return false;
    if (!raw) return failKeyframeSizing(keyframe, "Its painting is no longer in the library");
    const claim = now();
    const { data: claimed } = await db
      .from("long_video_keyframes")
      .update({ claimed_at: claim })
      .eq("id", keyframe.id)
      .eq("status", "sizing")
      .is("size_task_id", null)
      .eq("size_attempts", keyframe.size_attempts)
      .select("id");
    if (!claimed?.length) return true;
    const result = await enqueueInternalMediaTask({
      createdBy: run.created_by,
      projectId: run.project_id,
      taskType: "resize_image",
      source: {
        assetId: raw.id,
        assetType: "image",
        bucket: raw.storage_bucket,
        path: raw.storage_path,
        mimeType: raw.mime_type,
      },
      params: {
        width: settings.width,
        height: settings.height,
        mode: "cover",
        format: settings.format,
      },
      dedupeKey: `lvk:${keyframe.id}:${keyframe.attempt}:size:${keyframe.size_attempts}`,
      output: {
        count: 1,
        ext: settings.format,
        mime: settings.format === "png" ? "image/png" : "image/jpeg",
        kind: "image",
      },
      context: {
        long_video_keyframe_id: keyframe.id,
        output_title: `${run.title} · keyframe ${keyframe.position + 1}`.slice(0, 120),
      },
    });
    if (!result.ok) {
      if (result.retryable && keyframe.size_attempts + 1 < MAX_SIZE_ATTEMPTS) {
        // Asked again once the claim lapses (a busy media service).
        await db
          .from("long_video_keyframes")
          .update({ size_attempts: keyframe.size_attempts + 1 })
          .eq("id", keyframe.id)
          .eq("status", "sizing")
          .eq("claimed_at", claim);
        return false;
      }
      return finish(
        keyframe.raw_asset_id,
        `Used as painted: it couldn't be cut to the frame size (${result.message})`,
      );
    }
    await db
      .from("long_video_keyframes")
      .update({ size_task_id: result.taskId })
      .eq("id", keyframe.id)
      .eq("status", "sizing")
      .eq("claimed_at", claim);
    return true;
  }

  const { data: task, error: taskError } = await db
    .from("media_tasks")
    .select("id,status,result_asset_id,error_message,created_at,updated_at")
    .eq("id", keyframe.size_task_id)
    .maybeSingle();
  if (taskError) return false;
  if (task?.status === "completed" && task.result_asset_id)
    return finish(task.result_asset_id, null);
  const stale =
    !!task &&
    task.status !== "failed" &&
    task.status !== "completed" &&
    Date.now() - new Date(task.updated_at ?? task.created_at).getTime() > HANDOFF_TASK_STALE_MS;
  if (task && task.status !== "failed" && task.status !== "completed" && !stale) return false;
  if (task && stale)
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
  const attempts = keyframe.size_attempts + 1;
  if (attempts >= MAX_SIZE_ATTEMPTS)
    return finish(
      keyframe.raw_asset_id,
      `Used as painted: it couldn't be cut to the frame size (${task?.error_message ?? "the media service didn't answer"})`,
    );
  const { data } = await db
    .from("long_video_keyframes")
    .update({ size_task_id: null, size_attempts: attempts, claimed_at: null })
    .eq("id", keyframe.id)
    .eq("status", "sizing")
    .eq("size_task_id", keyframe.size_task_id)
    .select("id");
  return !!data?.length;
}

async function failKeyframeSizing(keyframe: KeyframeRow, message: string): Promise<boolean> {
  const { data } = await db
    .from("long_video_keyframes")
    .update({ status: "failed", error_code: "KEYFRAME_MISSING", error_message: message })
    .eq("id", keyframe.id)
    .eq("status", "sizing")
    .eq("attempt", keyframe.attempt)
    .select("id");
  return !!data?.length;
}

/** A painted keyframe is checked against its characters (under a lease, like a clip's check). */
async function checkKeyframe(
  run: RunRow,
  keyframe: KeyframeRow,
  clips: ClipRow[],
  deadline: number | null,
): Promise<boolean> {
  if (!checksCharacters(run) || keyframe.provided || !keyframe.asset_id) {
    const { data } = await db
      .from("long_video_keyframes")
      .update({ check_status: "skipped" })
      .eq("id", keyframe.id)
      .eq("check_status", keyframe.check_status)
      .select("id");
    return !!data?.length;
  }
  if (keyframe.check_status === "none") {
    const { data } = await db
      .from("long_video_keyframes")
      .update({ check_status: "checking", check_claimed_at: null })
      .eq("id", keyframe.id)
      .eq("check_status", "none")
      .select("id");
    return !!data?.length;
  }
  if (keyframe.check_status !== "checking" || !leaseFree(keyframe.check_claimed_at)) return false;
  const time = checkTime(deadline);
  if (time === null) return false;
  if (keyframe.check_claims >= MAX_CHECK_CLAIMS)
    return settleCheck("long_video_keyframes", keyframe, keyframe.check_claimed_at, {
      check_status: "unavailable",
      check_result: { error: "The check kept being cut short" },
    });
  const claim = now();
  const leased = db
    .from("long_video_keyframes")
    .update({ check_claimed_at: claim, check_claims: keyframe.check_claims + 1 })
    .eq("id", keyframe.id)
    .eq("check_status", "checking")
    .eq("check_claims", keyframe.check_claims);
  const { data: held } = await (
    keyframe.check_claimed_at
      ? leased.eq("check_claimed_at", keyframe.check_claimed_at)
      : leased.is("check_claimed_at", null)
  ).select("id");
  if (!held?.length) return true;

  const { data: image, error: imageError } = await db
    .from("assets")
    .select("storage_bucket,storage_path")
    .eq("id", keyframe.asset_id)
    .maybeSingle();
  const beat = keyframeBeat(
    keyframe.position,
    clips.map((clip) => clip.beat),
  );
  const { checkIdentity } = await import("../characters/identity.server");
  const outcome = imageError
    ? FRAMES_UNREAD
    : image
      ? await checkIdentity({
          characters: castFor(run, beat),
          frames: [
            { bucket: image.storage_bucket, path: image.storage_path, label: "the keyframe" },
          ],
          what: keyframeLabel(keyframe).toLowerCase(),
          beat,
          timeoutMs: time,
        })
      : ({
          ok: false,
          code: "NO_FRAMES",
          message: "The keyframe couldn't be read",
          retryable: false,
        } as const);
  const patch = checkPatch(outcome, keyframe.check_attempts, time);
  const settled = await settleCheck("long_video_keyframes", keyframe, claim, patch);
  return settled && patch.check_status !== "checking";
}

/* ------------------------------------------------------------------ */
/* Events and the recovery pass                                        */
/* ------------------------------------------------------------------ */

/**
 * How long a step set off by an event (a webhook, a media-service callback)
 * may run: it runs after the response, where about 30 s are allowed. A slow
 * step (an AI check) that doesn't fit is left to the reconcile pass or a page
 * that's open.
 */
const EVENT_BUDGET_MS = 25_000;

/** A generation reached an end (saved, failed, canceled): move on the run it belongs to, if any. */
export async function advanceForGeneration(generationId: string): Promise<void> {
  const deadline = Date.now() + EVENT_BUDGET_MS;
  const { data } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (data) return advanceLongVideo(data.long_video_id, { deadline });
  // A keyframe's painting (none before the database has keyframes).
  const { data: keyframe } = await db
    .from("long_video_keyframes")
    .select("long_video_id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (keyframe) await advanceLongVideo(keyframe.long_video_id, { deadline });
}

/** A media task reported back (a handoff, a check's frames, a keyframe's sizing): move its run on. */
export async function advanceForMediaTask(taskId: string): Promise<void> {
  const deadline = Date.now() + EVENT_BUDGET_MS;
  const { data } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("handoff_task_id", taskId)
    .maybeSingle();
  if (data) return advanceLongVideo(data.long_video_id, { deadline });
  // Asked apart, so a database without these columns yet still routes handoffs.
  const { data: checking } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("check_task_id", taskId)
    .maybeSingle();
  if (checking) return advanceLongVideo(checking.long_video_id, { deadline });
  const { data: syncing } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("sync_task_id", taskId)
    .maybeSingle();
  if (syncing) return advanceLongVideo(syncing.long_video_id, { deadline });
  // A lip score (none before the database has them).
  const { data: scoring } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("lip_task_id", taskId)
    .maybeSingle();
  if (scoring) return advanceLongVideo(scoring.long_video_id, { deadline });
  const { data: sizing } = await db
    .from("long_video_keyframes")
    .select("long_video_id")
    .eq("size_task_id", taskId)
    .maybeSingle();
  if (sizing) await advanceLongVideo(sizing.long_video_id, { deadline });
}

/**
 * How long the reconcile job's pass spends on long videos (it runs last, after
 * the quick passes), and never past the job's own deadline: the passes before
 * it may have used much of the two minutes the scheduler waits. A check gets
 * what is left, at most a minute, and is only started with half a minute or
 * more, so it isn't cut off with the call.
 */
const SWEEP_BUDGET_MS = 70_000;

/**
 * The reconcile job's pass: moves on every running run, and records clips that
 * finished in stopped runs, picking up anything an event missed. It takes no
 * new step past its time budget (or `jobDeadline`, when the job set one);
 * what's left waits for the next pass.
 */
export async function sweepLongVideos(
  limit = 25,
  jobDeadline: number | null = null,
): Promise<number> {
  const deadline = Math.min(Date.now() + SWEEP_BUDGET_MS, jobDeadline ?? Number.POSITIVE_INFINITY);
  const [{ data: running }, { data: generating }] = await Promise.all([
    db
      .from("long_videos")
      .select("id")
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(limit),
    db.from("long_video_clips").select("long_video_id").eq("status", "generating").limit(limit),
  ]);
  const ids = [
    ...new Set([
      ...(running ?? []).map((run) => run.id),
      ...(generating ?? []).map((clip) => clip.long_video_id),
    ]),
  ];
  for (const id of ids) {
    if (Date.now() > deadline) break;
    try {
      await advanceLongVideo(id, { deadline });
    } catch (error) {
      console.error("long video sweep step failed", {
        longVideoId: id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return ids.length;
}

/* ------------------------------------------------------------------ */
/* People: retry, continue, stop                                       */
/* ------------------------------------------------------------------ */

async function reopen(runId: string): Promise<void> {
  await db
    .from("long_videos")
    .update({ status: "running", error_code: null, error_message: null, completed_at: null })
    .eq("id", runId)
    .in("status", ["needs_attention", "canceled"]);
}

/**
 * Tries a failed clip again as a new generation (a new attempt, billed like
 * any generation). A clip whose submission was uncertain may already be
 * running at the provider, so it is only retried once a person confirms it.
 */
export async function retryLongVideoClip(input: {
  clipId: string;
  confirmUncertain: boolean;
  /** Move the run on afterwards (a caller doing that itself says no). */
  advance?: boolean;
}): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("*")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");

  if (clip.status === "failed") {
    if (clip.error_code === "SUBMISSION_UNCERTAIN" && !input.confirmUncertain)
      throw new AppError(
        "SUBMISSION_UNCERTAIN",
        "This clip may already be running at Higgsfield. Check Activity, then confirm the retry.",
      );
    const { data: reset } = await db
      .from("long_video_clips")
      .update({
        status: "waiting",
        attempt: clip.attempt + 1,
        generation_id: null,
        claimed_at: null,
        started_at: null,
        completed_at: null,
        output_asset_id: null,
        output_duration_seconds: null,
        output_fps: null,
        output_width: null,
        output_height: null,
        handoff_status: "none",
        handoff_task_id: null,
        handoff_attempts: 0,
        handoff_time_seconds: null,
        handoff_asset_id: null,
        // Only where the database has them (a plain run works before it does).
        ...("check_status" in clip ? CLEARED_CHECK : {}),
        ...("sync_status" in clip ? CLEARED_SYNC : {}),
        ...("lip_status" in clip ? CLEARED_LIP : {}),
        error_code: null,
        error_message: null,
      })
      .eq("id", clip.id)
      .eq("status", "failed")
      .eq("attempt", clip.attempt)
      .select("id");
    if (!reset?.length)
      throw new AppError("INVALID_PARAMETERS", "That clip has already been retried");
  } else if (clip.status === "completed" && clip.handoff_status === "failed") {
    await resetHandoff(clip);
  } else {
    throw new AppError("INVALID_PARAMETERS", "That clip hasn't failed");
  }
  if (input.advance === false) return;
  await reopen(clip.long_video_id);
  await advanceAfter(clip.long_video_id);
}

/**
 * A failed handoff tried afresh, with a full round of tries. Tries keep
 * counting from round to round (each round starts at the next multiple of
 * MAX_HANDOFF_FAILURES), so a fresh round asks the media service for new
 * tasks rather than finding the ones that already failed under the same keys.
 */
async function resetHandoff(clip: Pick<ClipRow, "id" | "handoff_attempts">): Promise<void> {
  const nextRound =
    Math.ceil(Math.max(1, clip.handoff_attempts) / MAX_HANDOFF_FAILURES) * MAX_HANDOFF_FAILURES;
  await db
    .from("long_video_clips")
    .update({
      handoff_status: "none",
      handoff_attempts: nextRound,
      handoff_task_id: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", clip.id)
    .eq("handoff_status", "failed")
    .eq("handoff_attempts", clip.handoff_attempts);
}

/**
 * Picks a stopped run up again: failed handoffs are tried afresh and the chain
 * goes on from where it stopped. A clip whose generation failed still needs
 * its own retry (it is billed), so the run stops at it again until then.
 */
export async function continueLongVideo(longVideoId: string): Promise<void> {
  const { data: failed } = await db
    .from("long_video_clips")
    .select("id,handoff_attempts")
    .eq("long_video_id", longVideoId)
    .eq("handoff_status", "failed");
  for (const clip of failed ?? []) await resetHandoff(clip);
  // Clips that failed without costing anything (no balance, a limit, a rate
  // limit) are made again: that is what the person pressed Continue for.
  const { data: free } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", longVideoId)
    .eq("status", "failed")
    .in("error_code", [...FREE_FAILURES]);
  for (const clip of free ?? [])
    await retryLongVideoClip({ clipId: clip.id, confirmUncertain: false, advance: false }).catch(
      () => undefined,
    );
  await reopen(longVideoId);
  await advanceAfter(longVideoId);
}

/** Stops a run: no further clips are started. A clip already generating still finishes and is saved. */
export async function stopLongVideo(longVideoId: string): Promise<void> {
  await db
    .from("long_videos")
    .update({ status: "canceled" })
    .eq("id", longVideoId)
    .in("status", ["running", "needs_attention"]);
}

/** A clip's sync as if never measured (a new attempt is measured afresh, and its piece cut again). */
const CLEARED_SYNC = {
  sync_status: "none",
  sync_task_id: null,
  sync_attempts: 0,
  sync_offset_seconds: null,
  sync_result: null,
  synced_at: null,
  audio_asset_id: null,
} as const;

/** A clip's lip score as if never taken (a new attempt is scored afresh). */
const CLEARED_LIP = {
  lip_status: "none",
  lip_task_id: null,
  lip_attempts: 0,
  lip_score: null,
  lip_score_at_zero: null,
  lip_offset_frames: null,
  lip_result: null,
  lip_checked_at: null,
} as const;

/** A clip's take as if never made: no generation, video or handoff (a new attempt starts afresh). */
const CLEARED_TAKE = {
  generation_id: null,
  claimed_at: null,
  started_at: null,
  completed_at: null,
  output_asset_id: null,
  output_duration_seconds: null,
  output_fps: null,
  output_width: null,
  output_height: null,
  handoff_status: "none",
  handoff_task_id: null,
  handoff_attempts: 0,
  handoff_time_seconds: null,
  handoff_asset_id: null,
  error_code: null,
  error_message: null,
} as const;

/** A clip's identity check as if never run (a new attempt is checked afresh). */
const CLEARED_CHECK = {
  check_status: "none",
  check_task_id: null,
  check_attempts: 0,
  check_claims: 0,
  check_result: null,
  check_claimed_at: null,
  checked_at: null,
  end_frame_asset_id: null,
} as const;

/**
 * Makes a finished clip again as a new attempt (billed like any generation):
 * one whose check found a character changed, or any take a person wants
 * another of (its lips, say). The take it has is kept, to swap back in. Only
 * while no clip that starts from this one's frame has started. It can be told
 * to start from another frame this time: the run's anchor (the approved
 * still), or an image a person chose; null goes back to its usual start. The
 * edit made from the run (if any) is let go, so opening it again shows the
 * new clip.
 */
export async function redoLongVideoClip(input: {
  clipId: string;
  /** Start from this frame instead ("anchor": the run's own still). Undefined: as before. */
  startFrame?: string | "anchor" | null | undefined;
}): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("*")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", clip.long_video_id)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");
  if (clip.status !== "completed")
    throw new AppError("INVALID_PARAMETERS", "Only a finished clip can be made again");
  await assertNothingStartedFrom(run, clip);
  const startFrame =
    input.startFrame === "anchor" ? await anchorOf(run) : await startFrameChoice(input.startFrame);
  // A take made again in a chain is let go only while it was flagged, or once a person asks.
  const made = await makeAnotherTake(run, clip, "redo", {
    ...(input.startFrame !== undefined ? { startFrame } : {}),
  });
  if (!made) throw new AppError("INVALID_PARAMETERS", "That clip has just been kept or changed");
  await db
    .from("long_videos")
    .update({ status: "running", error_code: null, error_message: null, completed_at: null })
    .eq("id", clip.long_video_id)
    .in("status", ["running", "needs_attention", "canceled", "completed"]);
  await advanceAfter(clip.long_video_id);
}

/**
 * Refuses a change to a clip a started clip depends on (it started from this
 * one's frame), or one the next clip may be starting from right now (a run
 * going, unless the check flagged this clip, which holds the next one back).
 */
async function assertNothingStartedFrom(run: RunRow, clip: ClipRow): Promise<void> {
  const { data: later } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", clip.long_video_id)
    .gt("position", clip.position)
    .order("position");
  // Only the chain of clips that start, each from the one before, from this one.
  let previous: ClipRow = clip;
  for (const [index, entry] of (later ?? []).entries()) {
    if (!startsFromPrevious(run, entry, previous)) break;
    if (entry.status !== "waiting")
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${entry.position + 1} has started from this clip's last frame, so this one can't be changed on its own`,
      );
    if (index === 0 && run.status === "running" && clip.check_status !== "flagged")
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${entry.position + 1} is about to start from this clip's last frame: stop the video first, then change this clip`,
      );
    previous = entry;
  }
}

/** The run's anchor frame, while it is still in the library. */
async function anchorOf(run: RunRow): Promise<string> {
  if (!run.anchor_frame_asset_id)
    throw new AppError(
      "INVALID_PARAMETERS",
      "This video has no frame every clip starts from: choose an image for the clip instead",
    );
  return (await startFrameChoice(run.anchor_frame_asset_id))!;
}

/** An image a person chose for a clip to start from: one still in the library (null: none). */
async function startFrameChoice(assetId: string | null | undefined): Promise<string | null> {
  if (!assetId) return null;
  const { data: image } = await db
    .from("assets")
    .select("id,asset_type")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!image || image.asset_type !== "image")
    throw new AppError("INVALID_PARAMETERS", "A clip starts from an image in the library");
  return image.id;
}

/**
 * Puts one of a clip's kept takes back in use (the one it has is kept in
 * turn): its frame and identity check are taken again for it and the run
 * goes on from it. Only while no clip that starts from this one's frame has
 * started.
 */
export async function chooseLongVideoTake(input: { takeId: string }): Promise<void> {
  const { data: take, error } = await db
    .from("long_video_clip_takes")
    .select("*")
    .eq("id", input.takeId)
    .maybeSingle();
  if (error && isMissingTableError(error)) throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
  if (!take) throw new AppError("INVALID_PARAMETERS", "That take no longer exists");
  const { data: clip } = await db
    .from("long_video_clips")
    .select("*")
    .eq("id", take.clip_id)
    .maybeSingle();
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", take.long_video_id)
    .maybeSingle();
  if (!clip || !run) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  if (clip.status !== "completed")
    throw new AppError("INVALID_PARAMETERS", "Wait for the clip's current take to finish first");
  if (!take.output_asset_id)
    throw new AppError("INVALID_PARAMETERS", "That take's video is no longer in the library");
  await assertNothingStartedFrom(run, clip);
  if (!(await restoreTake(run, clip, take)))
    throw new AppError("INVALID_PARAMETERS", "That clip has just changed: look again");
  await reopen(run.id);
  await db
    .from("long_videos")
    .update({ status: "running", error_code: null, error_message: null, completed_at: null })
    .eq("id", run.id)
    .eq("status", "completed");
  await advanceAfter(run.id);
}

/**
 * Holds a clip that hasn't started (the run waits at it, making the rest
 * where it can), or releases it. A run stopped at a held clip carries on once
 * it is released.
 */
export async function holdLongVideoClip(input: { clipId: string; held: boolean }): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("id,long_video_id,status,held")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  if (!("held" in clip)) throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
  if (input.held && clip.status !== "waiting")
    throw new AppError("INVALID_PARAMETERS", "Only a clip that hasn't started can be held");
  const { data: changed } = await db
    .from("long_video_clips")
    .update({ held: input.held })
    .eq("id", clip.id)
    .eq("status", input.held ? "waiting" : clip.status)
    .select("id");
  if (!changed?.length) throw new AppError("INVALID_PARAMETERS", "That clip has just started");
  if (!input.held) {
    await db
      .from("long_videos")
      .update({ status: "running", error_code: null, error_message: null })
      .eq("id", clip.long_video_id)
      .eq("status", "needs_attention")
      .eq("error_code", "CLIP_HELD");
    await advanceAfter(clip.long_video_id);
  }
}

/**
 * Chooses the frame a clip that hasn't started will start from: an image in
 * the library, the run's anchor ("anchor"), or its usual start again (null).
 */
export async function setClipStartFrame(input: {
  clipId: string;
  startFrame: string | "anchor" | null;
}): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("*")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  if (!("start_frame_override_asset_id" in clip))
    throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", clip.long_video_id)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");
  if (run.keyframe_model_id)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A keyframed video's clips start from their keyframes",
    );
  if (clip.status !== "waiting" && clip.status !== "failed")
    throw new AppError(
      "INVALID_PARAMETERS",
      "Only a clip that hasn't started (or failed) can be given another start frame: make it again instead",
    );
  const model = await loadModel(clip.model_registry_id);
  if (clipStart(model)?.kind !== "frame")
    throw new AppError(
      "INVALID_PARAMETERS",
      `${model?.display_name ?? "Its model"} doesn't start a clip from a given frame`,
    );
  const frame =
    input.startFrame === "anchor" ? await anchorOf(run) : await startFrameChoice(input.startFrame);
  const { data: changed } = await db
    .from("long_video_clips")
    .update({ start_frame_override_asset_id: frame })
    .eq("id", clip.id)
    .in("status", ["waiting", "failed"])
    .select("id");
  if (!changed?.length) throw new AppError("INVALID_PARAMETERS", "That clip has just started");
  await advanceAfter(clip.long_video_id);
}

/** Keeps a clip whose check found a character changed, and carries on. */
export async function keepLongVideoClip(input: { clipId: string }): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("id,long_video_id,check_status")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  const { data: kept } = await db
    .from("long_video_clips")
    .update({ check_status: "accepted" })
    .eq("id", clip.id)
    .eq("check_status", "flagged")
    .select("id");
  if (!kept?.length)
    throw new AppError("INVALID_PARAMETERS", "That clip has just been kept or made again");
  await reopen(clip.long_video_id);
  await advanceAfter(clip.long_video_id);
}

/**
 * Approves a run's keyframes: the clips start. Keyframes still flagged are
 * kept as they are (the person has seen them). Done under the run's lock, so
 * it can't land while a keyframe is being painted again.
 */
export async function approveStoryboard(longVideoId: string): Promise<void> {
  const { data, error } = await db.rpc("approve_long_video_storyboard", {
    p_run_id: longVideoId,
    p_by_person: true,
  });
  if (error) throw new AppError("UNKNOWN", error.message);
  const result = (data ?? {}) as { outcome?: string; position?: number; status?: string };
  if (result.outcome === "missing")
    throw new AppError("INVALID_PARAMETERS", "That video has no keyframes to approve");
  if (result.outcome === "unfinished") {
    const label =
      typeof result.position === "number" ? keyframeLabel({ position: result.position }) : null;
    throw new AppError(
      "INVALID_PARAMETERS",
      result.status === "failed" && label
        ? `${label} didn't come back: redo it first`
        : result.status === "completed" && label
          ? `${label} is still being checked: a moment more`
          : "The keyframes aren't all in yet",
    );
  }
  await advanceAfter(longVideoId);
}

/**
 * Keeps a keyframe the check flagged. A storyboard stopped on it goes on (the
 * rest are painted from it); one that's all in still waits to be approved.
 */
export async function keepKeyframe(input: { keyframeId: string }): Promise<void> {
  const { data: kept } = await db
    .from("long_video_keyframes")
    .update({ check_status: "accepted" })
    .eq("id", input.keyframeId)
    .eq("check_status", "flagged")
    .select("long_video_id");
  const runId = kept?.[0]?.long_video_id;
  if (!runId) return;
  const { data: reopened } = await db
    .from("long_videos")
    .update({ status: "running", error_code: null, error_message: null })
    .eq("id", runId)
    .eq("status", "needs_attention")
    .eq("error_code", "KEYFRAME_CHECK")
    .select("id");
  if (reopened?.length) await advanceAfter(runId);
}

/**
 * Paints keyframes again (each a new, billed attempt): one, or it and every
 * one after it (each is painted from the one before), with a note on what to
 * change. Only keyframes no started clip depends on; the storyboard is then
 * looked over again before the clips carry on. Done under the run's lock (see
 * redo_long_video_keyframes), so a clip can't start on one meanwhile.
 */
export async function redoKeyframes(input: {
  keyframeId: string;
  scope: "one" | "rest";
  note: string;
  confirmUncertain: boolean;
}): Promise<void> {
  const { data: target } = await db
    .from("long_video_keyframes")
    .select("id,long_video_id,position,provided")
    .eq("id", input.keyframeId)
    .maybeSingle();
  if (!target) throw new AppError("INVALID_PARAMETERS", "That keyframe no longer exists");
  if (target.provided)
    throw new AppError(
      "INVALID_PARAMETERS",
      "This keyframe is your own image: change it in Create and start the video again",
    );
  const runId = target.long_video_id;
  const { data: all, error: allError } = await db
    .from("long_video_keyframes")
    .select("id,position,provided")
    .eq("long_video_id", runId)
    .order("position");
  if (allError) throw new AppError("UNKNOWN", allError.message);
  const ids = (all ?? [])
    .filter(
      (keyframe) =>
        !keyframe.provided &&
        (input.scope === "rest" ? keyframe.position >= target.position : keyframe.id === target.id),
    )
    .map((keyframe) => keyframe.id);

  const { data, error } = await db.rpc("redo_long_video_keyframes", {
    p_run_id: runId,
    p_keyframe_ids: ids,
    p_target_id: target.id,
    p_note: input.note.trim().slice(0, 1000),
    p_confirm_uncertain: input.confirmUncertain,
  });
  if (error) throw new AppError("UNKNOWN", error.message);
  const result = (data ?? {}) as { outcome?: string; position?: number };
  switch (result.outcome) {
    case "redone":
      break;
    case "started":
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${(result.position ?? 0) + 1} has started with this keyframe, so it can't be painted again`,
      );
    case "painting":
      throw new AppError(
        "INVALID_PARAMETERS",
        "A keyframe is being painted right now: wait for it first",
      );
    case "uncertain":
      throw new AppError(
        "SUBMISSION_UNCERTAIN",
        `${keyframeLabel({ position: result.position ?? 0 })} may already be painting at Higgsfield. Check Activity, then confirm.`,
      );
    case "provided":
      throw new AppError(
        "INVALID_PARAMETERS",
        "A keyframe in that range is your own image, so it isn't painted again",
      );
    case "stopped":
      throw new AppError(
        "INVALID_PARAMETERS",
        "This video is stopped: press Continue first, then redo the keyframe",
      );
    default:
      throw new AppError("INVALID_PARAMETERS", "That keyframe no longer exists");
  }
  await advanceAfter(runId);
}

/* ------------------------------------------------------------------ */
/* Into the Editor                                                     */
/* ------------------------------------------------------------------ */

/**
 * Opens a run in the Editor as one edit: its clips in order, each cut at its
 * handoff frame so the next picks up seamlessly, then its end card. Once
 * made, the same edit is opened again (unless a fresh one is asked for), so a
 * second click never leaves two copies of the work.
 *
 * The end card is the run's finisher (when it was set to hold after the last
 * clip) unless `endCard` names another image, or none (null).
 */
export async function openLongVideoInEditor(input: {
  longVideoId: string;
  userId: string;
  seam: LongVideoSeam;
  keepSound: boolean;
  fresh: boolean;
  endCard?: { assetId: string; seconds: number } | null | undefined;
  /** Made to a voiceover: show its words as captions. */
  captions?: boolean;
  /** The script the voiceover was read from: captions show its words (see ../edit/captions). */
  script?: string | null | undefined;
  /** The brand's names as captions should spell them. */
  terms?: string[] | undefined;
  /** A licensed music bed under the voice (made to a voiceover). */
  musicAssetId?: string | null | undefined;
  /** Titles on the voiceover's clock (made to a voiceover). */
  titles?: PresenterTitle[] | undefined;
}): Promise<{ sequenceId: string; created: boolean; missing: number[]; notes?: string[] }> {
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", input.longVideoId)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");

  if (run.sequence_id && !input.fresh) {
    const { data: existing } = await db
      .from("sequences")
      .select("id,is_archived")
      .eq("id", run.sequence_id)
      .maybeSingle();
    if (existing && !existing.is_archived)
      return { sequenceId: existing.id, created: false, missing: [] };
  }

  const { data: clips } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", run.id)
    .order("position");
  const outputIds = (clips ?? []).flatMap((clip) =>
    clip.status === "completed" && clip.output_asset_id ? [clip.output_asset_id] : [],
  );
  if (!outputIds.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      "No clip has finished yet, so there is nothing to edit",
    );
  const { data: assets } = await db
    .from("assets")
    .select("id,duration_seconds,width,height,title")
    .in("id", outputIds)
    .is("deleted_at", null);

  // The end card: as asked, else the run's finisher when it holds after the last clip.
  const finale = storedFinale(run.references_used);
  const wanted =
    input.endCard !== undefined
      ? input.endCard
      : finale && finaleHolds(finale.mode)
        ? { assetId: finale.frameAssetId || finale.assetId, seconds: finale.seconds }
        : null;
  let endCard: LongVideoEndCard | null = null;
  if (wanted) {
    // The finisher laid out at the video's shape is a library file of its own;
    // when it has been deleted, the finisher itself stands in for it.
    const ids = [wanted.assetId];
    if (finale?.frameAssetId && wanted.assetId === finale.frameAssetId) ids.push(finale.assetId);
    const { data: rows } = await db
      .from("assets")
      .select("id,asset_type,width,height")
      .in("id", ids)
      .is("deleted_at", null);
    const image = ids
      .map((id) => (rows ?? []).find((row) => row.id === id && row.asset_type === "image"))
      .find((row) => !!row);
    if (input.endCard && !image)
      throw new AppError("INVALID_PARAMETERS", "The end card must be an image in the library");
    if (image)
      endCard = {
        assetId: image.id,
        seconds: wanted.seconds,
        width: image.width,
        height: image.height,
        // The last clip already ends on it: the card follows on with barely a blend.
        revealed:
          !!finale &&
          finaleReveals(finale.mode) &&
          image.id === (finale.frameAssetId || finale.assetId),
      };
  }

  // Made to a voiceover: the voiceover plays whole and each clip is laid
  // where its piece of it is, by its measured sync (see compileFromVoiceoverLongVideo).
  const voiceover = run.voiceover_preparation_id ? storedVoiceover(run.voiceover) : null;
  if (voiceover && run.voiceover_preparation_id)
    return openVoiceoverRunInEditor({
      run,
      clips: clips ?? [],
      assets: (assets ?? []).map((asset) => ({
        id: asset.id,
        durationSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
        width: asset.width,
        height: asset.height,
      })),
      voiceover,
      endCard,
      userId: input.userId,
      keepSound: input.keepSound,
      captions: input.captions === true,
      fresh: input.fresh,
      script: input.script ?? null,
      terms: input.terms ?? [],
      musicAssetId: input.musicAssetId ?? null,
      titles: input.titles ?? [],
    });

  // Handoff frames found by counting the clip's frames (its true last frame),
  // as against ones taken by time just before its end, by task.
  const handoffTaskIds = (clips ?? []).flatMap((clip) =>
    clip.handoff_status === "ready" && clip.handoff_task_id ? [clip.handoff_task_id] : [],
  );
  const { data: handoffTasks } = handoffTaskIds.length
    ? await db.from("media_tasks").select("id,output_payload").in("id", handoffTaskIds)
    : { data: [] as { id: string; output_payload: unknown }[] };
  const counted = new Set(
    (handoffTasks ?? []).flatMap((task) =>
      handoffFrameOf(((task.output_payload ?? {}) as Json)["metadata"]) ? [task.id] : [],
    ),
  );
  // Clips that extended the clip before (given its video): they carry on from its very end.
  const modelIds = [...new Set((clips ?? []).map((clip) => clip.model_registry_id))];
  const { data: models } = modelIds.length
    ? await db.from("model_registry").select("*").in("id", modelIds)
    : { data: [] };
  const extending = new Set(
    ((models ?? []) as unknown as ModelRegistryEntry[])
      .filter((model) => extendsVideo(model))
      .map((model) => model.id),
  );

  const result = compileFromLongVideo(
    { title: run.title, settings: (run.settings ?? {}) as Json },
    (clips ?? []).map((clip) => ({
      position: clip.position,
      assetId: clip.status === "completed" ? clip.output_asset_id : null,
      cutSeconds:
        clip.handoff_status === "ready" ? Number(clip.handoff_time_seconds) || null : null,
      // Measured length, else the length it was asked for.
      lengthSeconds: Number(clip.output_duration_seconds) || Number(clip.duration_seconds) || null,
      fps: Number(clip.output_fps) || null,
      width: clip.output_width,
      height: clip.output_height,
      handsOffLastFrame: !!clip.handoff_task_id && counted.has(clip.handoff_task_id),
      extendsPrevious: clip.position > 0 && extending.has(clip.model_registry_id),
    })),
    (assets ?? []).map((asset) => ({
      id: asset.id,
      durationSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
      width: asset.width,
      height: asset.height,
    })),
    { seam: input.seam, keepSound: input.keepSound, endCard },
  );
  if (!result.timeline.clips.length)
    throw new AppError("INVALID_PARAMETERS", "The clips' videos are no longer in the library");
  return saveRunEdit({ run, result, userId: input.userId, fresh: input.fresh });
}

/**
 * Keeps a run's edit and links the run to it. Linked only if nobody linked
 * another edit meanwhile (two clicks at once); then theirs is opened and this
 * copy removed. `prepare` runs on the new edit before it is linked (a step
 * that fails removes it).
 */
async function saveRunEdit(input: {
  run: RunRow;
  result: { title: string; timeline: unknown; missing: number[] };
  userId: string;
  fresh: boolean;
  prepare?: (sequenceId: string) => Promise<void>;
}): Promise<{ sequenceId: string; created: boolean; missing: number[] }> {
  const { run, result } = input;
  const { data: sequence, error } = await db
    .from("sequences")
    .insert({
      title: result.title,
      timeline: result.timeline as never,
      project_id: run.project_id,
      campaign_id: run.campaign_id,
      source: { kind: "long_video", long_video_id: run.id } as never,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !sequence)
    throw new AppError("UNKNOWN", error?.message ?? "The edit could not be created");
  if (input.prepare) {
    try {
      await input.prepare(sequence.id);
    } catch (problem) {
      await db.from("sequences").delete().eq("id", sequence.id);
      throw problem;
    }
  }

  const link = db.from("long_videos").update({ sequence_id: sequence.id }).eq("id", run.id);
  const { data: linked } = await (
    run.sequence_id ? link.eq("sequence_id", run.sequence_id) : link.is("sequence_id", null)
  ).select("id");
  if (!linked?.length && !input.fresh) {
    const { data: latest } = await db
      .from("long_videos")
      .select("sequence_id")
      .eq("id", run.id)
      .maybeSingle();
    if (latest?.sequence_id) {
      await db.from("sequences").delete().eq("id", sequence.id);
      return { sequenceId: latest.sequence_id, created: false, missing: [] };
    }
  }
  if (!linked?.length)
    await db.from("long_videos").update({ sequence_id: sequence.id }).eq("id", run.id);
  return { sequenceId: sequence.id, created: true, missing: result.missing };
}

/**
 * A run made to a voiceover, as one edit: the voiceover (as one of the edit's
 * takes, so it renders like a take made in the Voice tab) plays whole from the
 * start, each clip laid where its piece of it is by its measured sync, cut
 * (never blended: a blend shows two mouths at once), its own sound muted
 * unless asked for, and its words as captions where they are known.
 */
async function openVoiceoverRunInEditor(input: {
  run: RunRow;
  clips: ClipRow[];
  assets: {
    id: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  }[];
  voiceover: RunVoiceover;
  endCard: LongVideoEndCard | null;
  userId: string;
  keepSound: boolean;
  captions: boolean;
  fresh: boolean;
  script: string | null;
  terms: string[];
  musicAssetId: string | null;
  titles: PresenterTitle[];
}): Promise<{ sequenceId: string; created: boolean; missing: number[]; notes?: string[] }> {
  const { run } = input;
  // The brand's kit (the project's, else the team's default): its titles, captions and names.
  const kit = await brandKitFor(run.project_id);
  const { preparationById, takeForEdit } = await import("../lip-sync/prepare.server");
  const preparation = await preparationById(run.voiceover_preparation_id!);
  if (!preparation || preparation.status !== "ready" || !preparation.prepared_asset_id)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The voiceover this video was made to is no longer prepared, so its clips can't be lined up with it.",
    );
  const track = {
    assetId: preparation.prepared_asset_id,
    durationSeconds: input.voiceover.durationSeconds,
    fps: input.voiceover.fps,
    title: `Voiceover · ${input.voiceover.title}`,
    words: readWords(preparation.words),
    script: input.script,
    terms: [...new Set([...input.terms, ...(kit?.terms ?? [])])],
  };
  // The voiceover becomes one of the edit's takes before anyone can open it.
  const prepare = async (sequenceId: string) => {
    await takeForEdit({
      userId: input.userId,
      preparationId: preparation.id,
      sequenceId,
    });
  };

  // With cutaways: the presenter and the B-roll, shot by shot on the voiceover's clock.
  if (input.voiceover.cutaways.length) {
    const presenter = await presenterEdit({ ...input, track });
    if (!presenter.timeline.clips.length)
      throw new AppError(
        "INVALID_PARAMETERS",
        "No clip has finished yet, so there is nothing to edit",
      );
    const saved = await saveRunEdit({
      run,
      result: kit ? { ...presenter, timeline: applyBrandKit(presenter.timeline, kit) } : presenter,
      userId: input.userId,
      fresh: input.fresh,
      prepare,
    });
    return {
      ...saved,
      notes: kit
        ? [...presenter.notes, `Titles and captions are in ${kit.name}'s fonts and colours.`]
        : presenter.notes,
    };
  }

  const result = compileFromVoiceoverLongVideo(
    { title: run.title, settings: (run.settings ?? {}) as Json },
    input.clips.map((clip) => ({
      position: clip.position,
      assetId: clip.status === "completed" ? clip.output_asset_id : null,
      audioStart: Number(clip.audio_start_seconds ?? 0),
      audioEnd: Number(clip.audio_end_seconds ?? 0),
      offsetSeconds: syncOffsetOf(clip),
      lipLeadSeconds: lipLeadOf(clip),
      lengthSeconds: Number(clip.output_duration_seconds) || Number(clip.duration_seconds) || null,
      playsOut: playsOut(run, clip, clip.position === run.clip_count - 1),
    })),
    input.assets,
    track,
    {
      keepSound: input.keepSound,
      captions: input.captions,
      endCard: input.endCard,
    },
  );
  if (!result.timeline.clips.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      input.clips.some((clip) => clip.position === 0 && clip.status === "completed")
        ? "The clips' videos are no longer in the library"
        : "Clip 1 hasn't finished yet, and the clips are laid in order along the voiceover",
    );
  return saveRunEdit({
    run,
    result: kit ? { ...result, timeline: applyBrandKit(result.timeline, kit) } : result,
    userId: input.userId,
    fresh: input.fresh,
    prepare,
  });
}

/**
 * The brand kit a run's edit is styled from: its project's, else the team's
 * default. None before the database has kits (migration 0018), or when it
 * can't be read just now: the edit is made in the studio's own style.
 */
async function brandKitFor(projectId: string | null): Promise<BrandKit | null> {
  try {
    // A team keeps a handful of kits: all are read, and the right one picked here.
    const { data, error } = await db.from("brand_kits").select("*").eq("is_archived", false);
    if (error || !data?.length) return null;
    return kitForProject(
      data.map((row) => brandKitOf(row as unknown as Json)),
      projectId,
    );
  } catch {
    return null;
  }
}

/** What fills each cutaway of a run (long_videos.cutaway_fills), in order. */
function storedFills(
  value: unknown,
): ({ assetId: string; inPoint: number; label: string | null } | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = (entry ?? {}) as Json;
    return typeof record["asset_id"] === "string"
      ? {
          assetId: record["asset_id"],
          inPoint: Math.max(0, Number(record["in_point"]) || 0),
          label: typeof record["label"] === "string" ? record["label"] : null,
        }
      : null;
  });
}

/**
 * A run with cutaways as one edit (see ../edit/presenter): its clips on the
 * voiceover's clock, the B-roll chosen for each cutaway (else a placeholder:
 * the frame the clips start from), captions, titles and music as asked.
 */
async function presenterEdit(input: {
  run: RunRow;
  clips: ClipRow[];
  assets: {
    id: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  }[];
  voiceover: RunVoiceover;
  track: VoiceoverTrack;
  endCard: LongVideoEndCard | null;
  keepSound: boolean;
  captions: boolean;
  musicAssetId: string | null;
  titles: PresenterTitle[];
}) {
  const { run } = input;
  const fills = storedFills(run.cutaway_fills);
  const placeholderId = run.anchor_frame_asset_id ?? input.clips[0]?.start_frame_asset_id ?? null;
  const wanted = [
    ...fills.flatMap((fill) => (fill ? [fill.assetId] : [])),
    ...(placeholderId ? [placeholderId] : []),
    ...(input.musicAssetId ? [input.musicAssetId] : []),
  ];
  const { data: rows } = wanted.length
    ? await db
        .from("assets")
        .select("id,asset_type,duration_seconds,width,height,title")
        .in("id", wanted)
        .is("deleted_at", null)
    : { data: [] };
  const row = (id: string | null) => (rows ?? []).find((entry) => entry.id === id) ?? null;
  const placeholder = row(placeholderId);
  const music = row(input.musicAssetId);
  if (input.musicAssetId && music?.asset_type !== "audio")
    throw new AppError("INVALID_PARAMETERS", "The music must be audio in the library");
  return compilePresenterEdit(
    { title: run.title, settings: (run.settings ?? {}) as Json },
    input.clips.map((clip, index) => ({
      position: clip.position,
      assetId: clip.status === "completed" ? clip.output_asset_id : null,
      audioStart: Number(clip.audio_start_seconds ?? 0),
      audioEnd: Number(clip.audio_end_seconds ?? 0),
      offsetSeconds: syncOffsetOf(clip),
      lipLeadSeconds: lipLeadOf(clip),
      lengthSeconds: Number(clip.output_duration_seconds) || Number(clip.duration_seconds) || null,
      continuesPrevious: startsFromPrevious(run, clip, input.clips[index - 1] ?? null),
    })),
    input.assets,
    input.track,
    input.voiceover.cutaways,
    {
      keepSound: input.keepSound,
      captions: input.captions,
      endCard: input.endCard,
      fills: fills.map((fill) => {
        const asset = fill ? row(fill.assetId) : null;
        if (!fill || !asset || (asset.asset_type !== "video" && asset.asset_type !== "image"))
          return null;
        return {
          assetId: asset.id,
          kind: asset.asset_type,
          inPoint: fill.inPoint,
          sourceSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
          label: fill.label ?? asset.title,
        };
      }),
      placeholder:
        placeholder?.asset_type === "image"
          ? { assetId: placeholder.id, width: placeholder.width, height: placeholder.height }
          : null,
      music: music
        ? {
            assetId: music.id,
            durationSeconds:
              music.duration_seconds === null ? null : Number(music.duration_seconds),
            title: music.title,
          }
        : null,
      titles: input.titles,
    },
  );
}

/**
 * Chooses the B-roll for a run's cutaway (by its place in order): a video or
 * image in the library, from a point in it; null clears it. The run's edit is
 * let go, so opening it again lays the B-roll in.
 */
export async function setCutawayFill(input: {
  longVideoId: string;
  index: number;
  fill: { assetId: string; inPoint?: number | undefined; label?: string | null | undefined } | null;
}): Promise<void> {
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", input.longVideoId)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");
  if (!("cutaway_fills" in run)) throw new AppError("UNKNOWN", PRESENTER_TABLES_MISSING);
  const voiceover = storedVoiceover(run.voiceover);
  const count = voiceover?.cutaways.length ?? 0;
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= count)
    throw new AppError("INVALID_PARAMETERS", "This video has no such cutaway");
  if (input.fill) {
    const { data: asset } = await db
      .from("assets")
      .select("id,asset_type")
      .eq("id", input.fill.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset || (asset.asset_type !== "video" && asset.asset_type !== "image"))
      throw new AppError("INVALID_PARAMETERS", "B-roll is a video or an image in the library");
  }
  const fills: (Json | null)[] = Array.from({ length: count }, (_, index) => {
    const kept = storedFills(run.cutaway_fills)[index] ?? null;
    return kept
      ? {
          asset_id: kept.assetId,
          in_point: kept.inPoint,
          ...(kept.label ? { label: kept.label } : {}),
        }
      : null;
  });
  fills[input.index] = input.fill
    ? {
        asset_id: input.fill.assetId,
        in_point: Math.max(0, Number(input.fill.inPoint) || 0),
        ...(input.fill.label?.trim() ? { label: input.fill.label.trim().slice(0, 120) } : {}),
      }
    : null;
  const { error } = await db
    .from("long_videos")
    .update({ cutaway_fills: fills as never, sequence_id: null })
    .eq("id", run.id);
  if (error) throw new AppError("UNKNOWN", error.message);
}
