/**
 * The agent's sections on the server (./sections says what they are): a reel
 * read as shots from its edit, long video or storyboard; a plan made with its
 * integration edit; the frames at each section's edges taken by the media
 * service; a worker's conversation started with its brief, its turns held to
 * its step limit and settled into the plan as they end; what it saves merged
 * into the integration edit; and the joins checked on both sides, by the
 * studio's AI with the render's own measurements and the character and
 * lettering checks.
 *
 * Section by section: a worker's turn is a turn of the agent like any other
 * (./agent-turn.server), one request each, so the work carries on across
 * requests, and what a worker saved is kept if a request is cut short.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import type { RunCharacter } from "../characters/model";
import { compileFromStoryboard, type CompileAsset, type CompileTake } from "../edit/compile";
import {
  aspectFromValue,
  emptyTimeline,
  joinFields,
  joinModeOf,
  parseTimeline,
  type Timeline,
} from "../edit/timeline";
import { measurementOf } from "../media/measure";
import type { TurnBudget, TurnState } from "./agent-loop.server";
import {
  clipFrame,
  EMPTY_WORK,
  extensionSteps,
  frameIndex,
  joinClips,
  joinKind,
  joinLookOf,
  joinMeasuresOf,
  joinsOf,
  judgeJoin,
  mergeSection,
  ownedByAsset,
  planSections,
  planViewOf,
  REEL_KIND_LABELS,
  renderJoinAt,
  sectionBrief,
  sectionWorkOf,
  statusAfterTurn,
  TAKING_FRAME,
  turnLimit,
  unavailableFrame,
  unsavedShots,
  warnFrom,
  withGenerations,
  withSaved,
  type FrameRef,
  type FrameSource,
  type JoinFix,
  type JoinFrame,
  type JoinLook,
  type JoinMeasures,
  type JoinVerdict,
  type LooseTake,
  type MergeResult,
  type Neighbour,
  type OwnedClip,
  type PlanView,
  type ReelKind,
  type ReelShot,
  type SavedShot,
  type SectionView,
  type SectionWork,
} from "./sections";

type Json = Record<string, unknown>;

export const NEEDS_SECTIONS =
  "Working in sections needs a database update (migration 0036_agent_sections). Ask an admin to apply it.";

const isMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
    /does not exist|could not find the/i.test(error.message ?? ""));

/** Whether the sections' tables are in (migration 0036). */
export async function sectionsReady(): Promise<boolean> {
  const [plans, threads] = await Promise.all([
    db.from("supercomputer_section_plans").select("id").limit(1),
    db.from("supercomputer_threads").select("id,parent_thread_id").limit(1),
  ]);
  return !isMissing(plans.error) && !isMissing(threads.error);
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* The reel, as shots                                                  */
/* ------------------------------------------------------------------ */

interface StoryboardLayout {
  board: { title: string; primary_aspect_ratio: string | null };
  scenes: {
    scene_number: number;
    shots: {
      id: string;
      shot_number: number;
      name: string | null;
      duration_seconds: number | null;
      selected_take_id: string | null;
    }[];
  }[];
  takes: CompileTake[];
}

export interface Reel {
  kind: ReelKind;
  id: string;
  title: string;
  shots: ReelShot[];
  projectId: string | null;
  campaignId: string | null;
  /** The cast a join's character check compares against (a long video's). */
  characters: RunCharacter[];
  /** What a storyboard's integration edit is laid out from. */
  storyboard?: StoryboardLayout;
}

/** The prompts (or titles) library files were made from, by file: what a shot of an edit is. */
async function promptsOf(assetIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(assetIds)].slice(0, 200);
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data: assets } = await db.from("assets").select("id,title,generation_id").in("id", ids);
  const generationIds = [
    ...new Set((assets ?? []).flatMap((row) => (row.generation_id ? [row.generation_id] : []))),
  ];
  const { data: generations } = generationIds.length
    ? await db.from("generations").select("id,prompt").in("id", generationIds)
    : { data: [] as { id: string; prompt: string | null }[] };
  const prompts = new Map((generations ?? []).map((row) => [row.id, row.prompt]));
  for (const row of assets ?? []) {
    const words = (row.generation_id ? prompts.get(row.generation_id) : null) ?? row.title;
    if (words?.trim()) out.set(row.id, words.replace(/\s+/g, " ").trim().slice(0, 400));
  }
  return out;
}

async function editReel(id: string): Promise<Reel> {
  const { data } = await db
    .from("sequences")
    .select("id,title,timeline,project_id,campaign_id,is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.is_archived)
    throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
  const timeline = parseTimeline(data.timeline);
  if (!timeline) throw new AppError("INVALID_PARAMETERS", "That edit's timeline can't be read");
  const prompts = await promptsOf(timeline.clips.map((clip) => clip.assetId));
  return {
    kind: "edit",
    id,
    title: data.title,
    projectId: data.project_id,
    campaignId: data.campaign_id,
    characters: [],
    shots: timeline.clips.map((clip, index) => ({
      ref: clip.id,
      index,
      label: clip.label?.trim() || `Shot ${index + 1}`,
      seconds: Number(clip.duration.toFixed(3)),
      assetId: clip.assetId,
      kind: clip.kind,
      beat: prompts.get(clip.assetId) ?? clip.label?.trim() ?? null,
      group: null,
      // A clip matched to the one before it carries straight on from it.
      continuous: index > 0 && joinModeOf(clip) !== "plain",
      firstFrame: clipFrame(clip, "first"),
      lastFrame: clipFrame(clip, "last"),
    })),
  };
}

/** The characters a long video checks its clips against: those with reference images. */
async function castOf(longVideoId: string): Promise<RunCharacter[]> {
  const { data } = await db
    .from("long_videos")
    .select("characters")
    .eq("id", longVideoId)
    .maybeSingle();
  return runCharacters(data?.characters).filter((character) => character.images.length);
}

/** A long video's cast, as it keeps it (long_videos.characters), read tolerantly. */
function runCharacters(value: unknown): RunCharacter[] {
  if (!Array.isArray(value)) return [];
  return (value as Json[]).flatMap((entry) => {
    const id = typeof entry?.["id"] === "string" ? entry["id"] : null;
    if (!id) return [];
    const images = Array.isArray(entry["images"]) ? (entry["images"] as Json[]) : [];
    return [
      {
        id,
        name: typeof entry["name"] === "string" ? entry["name"] : "Character",
        description: typeof entry["description"] === "string" ? entry["description"] : "",
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
      },
    ];
  });
}

async function longVideoReel(id: string): Promise<Reel> {
  const { data: run } = await db
    .from("long_videos")
    .select("id,title,project_id,campaign_id,characters,start_from")
    .eq("id", id)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video doesn't exist");
  const { data: clips } = await db
    .from("long_video_clips")
    .select(
      "id,position,beat,prompt,duration_seconds,status,output_asset_id,output_duration_seconds,start_frame_asset_id,start_frame_override_asset_id,end_frame_asset_id,handoff_asset_id",
    )
    .eq("long_video_id", id)
    .order("position");
  // An anchored run starts every clip from its approved still, not from the clip before.
  const anchored = run.start_from === "anchor";
  return {
    kind: "long_video",
    id,
    title: run.title,
    projectId: run.project_id,
    campaignId: run.campaign_id,
    characters: runCharacters(run.characters),
    shots: (clips ?? []).map((clip, index) => {
      const seconds = Number(clip.output_duration_seconds ?? clip.duration_seconds) || 5;
      const made = clip.status === "completed" ? clip.output_asset_id : null;
      const start = clip.start_frame_override_asset_id ?? clip.start_frame_asset_id;
      const lastStill = (made ? clip.handoff_asset_id : null) ?? clip.end_frame_asset_id;
      return {
        ref: clip.id,
        index,
        label: `Clip ${clip.position + 1}`,
        seconds: Number(seconds.toFixed(3)),
        assetId: made,
        kind: "video" as const,
        beat: clip.beat?.trim() || clip.prompt?.replace(/\s+/g, " ").trim().slice(0, 400) || null,
        group: null,
        continuous: index > 0 && !anchored && !clip.start_frame_override_asset_id,
        firstFrame: start
          ? { kind: "still" as const, assetId: start }
          : made
            ? { kind: "video" as const, assetId: made, seconds: 0 }
            : null,
        lastFrame: lastStill
          ? { kind: "still" as const, assetId: lastStill }
          : made
            ? { kind: "video" as const, assetId: made, seconds }
            : null,
      } satisfies ReelShot;
    }),
  };
}

/** A storyboard's shot's take as its edit would use it (the rule compileFromStoryboard follows). */
function chosenTake(
  shot: { id: string; selected_take_id: string | null },
  takes: CompileTake[],
): CompileTake | null {
  const own = takes.filter((take) => take.shot_id === shot.id);
  if (shot.selected_take_id) return own.find((take) => take.id === shot.selected_take_id) ?? null;
  return (
    own.find((take) => take.is_selected) ??
    own.filter((take) => take.asset).sort((a, b) => b.take_number - a.take_number)[0] ??
    null
  );
}

async function storyboardReel(id: string): Promise<Reel> {
  const { data: board } = await db
    .from("storyboards")
    .select("id,title,project_id,campaign_id,primary_aspect_ratio")
    .eq("id", id)
    .maybeSingle();
  if (!board) throw new AppError("INVALID_PARAMETERS", "That storyboard doesn't exist");
  const { data: scenes } = await db
    .from("scenes")
    .select("id,scene_number,name")
    .eq("storyboard_id", id)
    .order("scene_number");
  const sceneIds = (scenes ?? []).map((scene) => scene.id);
  const { data: shotRows } = sceneIds.length
    ? await db
        .from("shots")
        .select(
          "id,scene_id,shot_number,name,description,prompt,duration_seconds,selected_take_id,operation_type",
        )
        .in("scene_id", sceneIds)
    : { data: [] };
  const shotIds = (shotRows ?? []).map((shot) => shot.id);
  const { data: takeRows } = shotIds.length
    ? await db
        .from("shot_takes")
        .select("id,shot_id,take_number,is_selected,asset_id,generation_id")
        .in("shot_id", shotIds)
    : { data: [] };
  const assetIds = (takeRows ?? []).flatMap((take) => (take.asset_id ? [take.asset_id] : []));
  const generationIds = (takeRows ?? []).flatMap((take) =>
    take.generation_id ? [take.generation_id] : [],
  );
  const columns = "id,asset_type,title,duration_seconds,created_at,generation_id";
  const [byId, byGeneration] = await Promise.all([
    assetIds.length
      ? db.from("assets").select(columns).in("id", assetIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    generationIds.length
      ? db.from("assets").select(columns).in("generation_id", generationIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const assets = [...(byId.data ?? []), ...(byGeneration.data ?? [])] as (CompileAsset & {
    generation_id: string | null;
  })[];
  const takes: CompileTake[] = (takeRows ?? []).map((take) => {
    const fromGeneration = assets.filter(
      (asset) => take.generation_id && asset.generation_id === take.generation_id,
    );
    return {
      id: take.id,
      shot_id: take.shot_id,
      take_number: take.take_number,
      is_selected: take.is_selected,
      asset:
        assets.find((asset) => asset.id === take.asset_id) ??
        fromGeneration.find((asset) => asset.asset_type === "video") ??
        fromGeneration.find((asset) => asset.asset_type === "image") ??
        null,
    };
  });

  const ordered = (scenes ?? []).map((scene) => ({
    scene,
    shots: (shotRows ?? [])
      .filter((shot) => shot.scene_id === scene.id)
      .sort((a, b) => a.shot_number - b.shot_number),
  }));
  const shots: ReelShot[] = [];
  for (const { scene, shots: sceneShots } of ordered)
    for (const shot of sceneShots) {
      const asset = chosenTake(shot, takes)?.asset ?? null;
      const media = asset && asset.asset_type !== "audio" ? asset : null;
      const seconds =
        Number(shot.duration_seconds) ||
        (media?.duration_seconds ? Number(media.duration_seconds) : 0) ||
        (media?.asset_type === "image" ? 3 : 5);
      const kind =
        media?.asset_type === "image" ||
        (!media &&
          /image/i.test(shot.operation_type ?? "") &&
          !/video/i.test(shot.operation_type ?? ""))
          ? ("image" as const)
          : ("video" as const);
      const index = shots.length;
      shots.push({
        ref: shot.id,
        index,
        label: shot.name
          ? `${scene.scene_number}.${shot.shot_number} ${shot.name}`
          : `Shot ${scene.scene_number}.${shot.shot_number}`,
        seconds: Number(seconds.toFixed(3)),
        assetId: media?.id ?? null,
        kind,
        beat: (shot.description ?? shot.prompt)?.replace(/\s+/g, " ").trim().slice(0, 400) || null,
        group: `${scene.scene_number}. ${scene.name}`,
        continuous: false,
        firstFrame: media
          ? media.asset_type === "image"
            ? { kind: "still", assetId: media.id }
            : { kind: "video", assetId: media.id, seconds: 0 }
          : null,
        lastFrame: media
          ? media.asset_type === "image"
            ? { kind: "still", assetId: media.id }
            : {
                kind: "video",
                assetId: media.id,
                seconds: Math.min(seconds, Number(media.duration_seconds) || seconds),
              }
          : null,
      });
    }
  return {
    kind: "storyboard",
    id,
    title: board.title,
    projectId: board.project_id,
    campaignId: board.campaign_id,
    characters: [],
    shots,
    storyboard: {
      board: { title: board.title, primary_aspect_ratio: board.primary_aspect_ratio },
      scenes: ordered.map(({ scene, shots: sceneShots }) => ({
        scene_number: scene.scene_number,
        shots: sceneShots.map((shot) => ({
          id: shot.id,
          shot_number: shot.shot_number,
          name: shot.name,
          duration_seconds: shot.duration_seconds,
          selected_take_id: shot.selected_take_id,
        })),
      })),
      takes,
    },
  };
}

/** A reel read as shots, from its edit, long video or storyboard. */
export function readReel(kind: ReelKind, id: string): Promise<Reel> {
  if (kind === "edit") return editReel(id);
  if (kind === "long_video") return longVideoReel(id);
  return storyboardReel(id);
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

/** The integration edit, laid out from the reel as it is now: every section merges into it. */
async function integrationEdit(
  reel: Reel,
  userId: string,
  title: string,
): Promise<{ sequenceId: string; timeline: Timeline }> {
  const insert = async (timeline: Timeline, source: Json, storyboardId: string | null = null) => {
    const { data, error } = await db
      .from("sequences")
      .insert({
        title,
        timeline: timeline as never,
        project_id: reel.projectId,
        campaign_id: reel.campaignId,
        storyboard_id: storyboardId,
        source: source as never,
        created_by: userId,
        version: 1,
      })
      .select("id")
      .single();
    if (error || !data)
      throw new AppError("UNKNOWN", error?.message ?? "The integration edit couldn't be made");
    return { sequenceId: data.id, timeline };
  };
  if (reel.kind === "edit") {
    const { data } = await db.from("sequences").select("timeline").eq("id", reel.id).maybeSingle();
    const timeline = parseTimeline(data?.timeline) ?? emptyTimeline();
    return insert(timeline, { kind: "sections", from: { kind: "edit", sequence_id: reel.id } });
  }
  if (reel.kind === "storyboard" && reel.storyboard) {
    const compiled = compileFromStoryboard(
      { ...reel.storyboard.board, scenes: reel.storyboard.scenes },
      reel.storyboard.takes,
    );
    return insert(
      compiled.timeline,
      { kind: "sections", from: { kind: "storyboard", storyboard_id: reel.id } },
      reel.id,
    );
  }
  // A long video is laid out as its own edit does it (smart-blended joins).
  try {
    const { openLongVideoInEditor } = await import("../long-video/service.server");
    const opened = await openLongVideoInEditor({
      longVideoId: reel.id,
      userId,
      seam: "smart",
      keepSound: false,
      fresh: true,
    });
    await db.from("sequences").update({ title }).eq("id", opened.sequenceId);
    const { data } = await db
      .from("sequences")
      .select("timeline")
      .eq("id", opened.sequenceId)
      .maybeSingle();
    return {
      sequenceId: opened.sequenceId,
      timeline: parseTimeline(data?.timeline) ?? emptyTimeline(),
    };
  } catch (error) {
    // Nothing made yet: an empty edit in the run's shape, filled as its sections save.
    if (!(error instanceof AppError) || error.code !== "INVALID_PARAMETERS") throw error;
    const { data: run } = await db
      .from("long_videos")
      .select("settings")
      .eq("id", reel.id)
      .maybeSingle();
    const aspect = aspectFromValue(((run?.settings ?? {}) as Json)["aspect_ratio"]) ?? "16:9";
    return insert(emptyTimeline(aspect), {
      kind: "sections",
      from: { kind: "long_video", long_video_id: reel.id },
    });
  }
}

/** A plan, its sections and joins, as they are now. */
export async function loadPlan(planId: string): Promise<PlanView> {
  const [plan, sections, joins] = await Promise.all([
    db.from("supercomputer_section_plans").select("*").eq("id", planId).maybeSingle(),
    db.from("supercomputer_sections").select("*").eq("plan_id", planId),
    db.from("supercomputer_section_joins").select("*").eq("plan_id", planId),
  ]);
  if (isMissing(plan.error)) throw new AppError("INVALID_PARAMETERS", NEEDS_SECTIONS);
  if (!plan.data) throw new AppError("INVALID_PARAMETERS", "That plan no longer exists");
  const view = planViewOf(
    plan.data as unknown as Json,
    (sections.data ?? []) as unknown as Json[],
    (joins.data ?? []) as unknown as Json[],
  );
  if (!view) throw new AppError("UNKNOWN", "That plan can't be read");
  return view;
}

/** A conversation's newest plan, if it has one. */
export async function latestPlanId(threadId: string): Promise<string | null> {
  const { data, error } = await db
    .from("supercomputer_section_plans")
    .select("id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissing(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_SECTIONS);
  return data?.id ?? null;
}

/**
 * Plans a reel in sections for a conversation: reads it as shots, splits it,
 * lays out its integration edit, keeps the plan with its sections and joins,
 * and asks the media service for the frames at every section's edges, so
 * the briefs carry them.
 */
export async function createSectionPlan(input: {
  threadId: string;
  userId: string;
  kind: ReelKind;
  id: string;
  sections?: number | null;
  starts?: number[] | null;
  title?: string | null;
}): Promise<PlanView> {
  if (!(await sectionsReady())) throw new AppError("INVALID_PARAMETERS", NEEDS_SECTIONS);
  const reel = await readReel(input.kind, input.id);
  if (reel.shots.length < 2)
    throw new AppError(
      "INVALID_PARAMETERS",
      `That ${REEL_KIND_LABELS[reel.kind]} has ${reel.shots.length ? "one shot" : "no shots"}: there is nothing to split`,
    );
  const planned = planSections(reel.shots, {
    ...(input.sections ? { sections: input.sections } : {}),
    ...(input.starts?.length ? { starts: input.starts } : {}),
  });
  const title = (input.title?.trim() || `${reel.title} in sections`).slice(0, 200);
  const edit = await integrationEdit(reel, input.userId, `${reel.title} · sections`.slice(0, 200));
  const owned = ownedByAsset(reel.shots, edit.timeline);

  const { data: plan, error } = await db
    .from("supercomputer_section_plans")
    .insert({
      thread_id: input.threadId,
      title,
      source_kind: reel.kind,
      source_id: reel.id,
      source_title: reel.title.slice(0, 200),
      sequence_id: edit.sequenceId,
      shots: reel.shots as never,
      project_id: reel.projectId,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !plan) {
    await db.from("sequences").delete().eq("id", edit.sequenceId);
    throw new AppError(
      isMissing(error) ? "INVALID_PARAMETERS" : "UNKNOWN",
      isMissing(error) ? NEEDS_SECTIONS : (error?.message ?? "The plan couldn't be kept"),
    );
  }
  const [sections, joins] = await Promise.all([
    db.from("supercomputer_sections").insert(
      planned.map((section) => ({
        plan_id: plan.id,
        position: section.position,
        title: section.title,
        first_shot: section.first,
        last_shot: section.last,
        step_budget: section.budget,
        estimated_steps: section.steps,
        clips: owned.filter(
          (entry) => entry.shot >= section.first && entry.shot <= section.last,
        ) as never,
      })),
    ),
    db.from("supercomputer_section_joins").insert(
      joinsOf(planned, reel.shots).map((join) => ({
        plan_id: plan.id,
        position: join.position,
        kind: join.kind,
      })),
    ),
  ]);
  if (sections.error || joins.error) {
    await db.from("supercomputer_section_plans").delete().eq("id", plan.id);
    await db.from("sequences").delete().eq("id", edit.sequenceId);
    throw new AppError("UNKNOWN", (sections.error ?? joins.error)!.message);
  }
  const view = await loadPlan(plan.id);
  // The frames at the sections' edges that their neighbours' briefs carry, asked for
  // now; a brief waits a moment for them.
  const last = view.sections.length - 1;
  await Promise.all(
    view.sections.flatMap((section) => [
      ...(section.position > 0 ? [edgeFrame(view, section, "first", input.userId)] : []),
      ...(section.position < last ? [edgeFrame(view, section, "last", input.userId)] : []),
    ]),
  ).catch(() => undefined);
  return view;
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

/** Frames larger than this go as best-quality JPEG (as PNG they can pass what a provider takes). */
const PNG_MAX_PIXELS = 2_600_000;

/**
 * A frame as a library still: a still already, or one the media service
 * takes from a video, once (keyed by the file and the frame, so every plan
 * and check asking for the same frame shares it). Twice at most: a take that
 * failed is tried once more.
 */
export async function takeFrame(input: {
  source: FrameSource | null;
  side: "first" | "last";
  label: string;
  userId: string;
  projectId: string | null;
}): Promise<FrameRef> {
  if (!input.source) return unavailableFrame("its shot isn't made yet");
  const { data: asset } = await db
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,width,height,metadata")
    .eq("id", input.source.assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) return unavailableFrame("its file isn't in the library");
  if (input.source.kind === "still" || asset.asset_type === "image")
    return {
      status: "ready",
      assetId: asset.id,
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      note: null,
    };
  if (asset.asset_type !== "video") return unavailableFrame("its file isn't a picture");
  const fps = measurementOf(asset.metadata).fps ?? 30;
  const index = frameIndex(input.source.seconds, fps, input.side);
  const key = `scf:${asset.id}:${index}`;
  for (const attempt of [key, `${key}:2`]) {
    const { data: task } = await db
      .from("media_tasks")
      .select("id,status,result_asset_id,error_message")
      .eq("dedupe_key", attempt)
      .maybeSingle();
    if (task?.status === "completed") {
      const { data: still } = task.result_asset_id
        ? await db
            .from("assets")
            .select("id,storage_bucket,storage_path")
            .eq("id", task.result_asset_id)
            .is("deleted_at", null)
            .maybeSingle()
        : { data: null };
      return still
        ? {
            status: "ready",
            assetId: still.id,
            bucket: still.storage_bucket,
            path: still.storage_path,
            note: null,
          }
        : unavailableFrame("the frame taken is no longer in the library");
    }
    if (task && ["failed", "cancelled", "stalled"].includes(task.status)) {
      if (attempt === key) continue;
      return unavailableFrame(task.error_message ?? "the media service couldn't take it");
    }
    if (task) return TAKING_FRAME;
    const { enqueueInternalMediaTask } = await import("../media/enqueue.server");
    const format = (asset.width ?? 0) * (asset.height ?? 0) > PNG_MAX_PIXELS ? "jpg" : "png";
    const width = asset.width
      ? Math.max(64, Math.min(3840, Math.floor(asset.width / 2) * 2))
      : null;
    const result = await enqueueInternalMediaTask({
      createdBy: input.userId,
      projectId: input.projectId,
      taskType: "extract_frames",
      source: {
        assetId: asset.id,
        assetType: "video",
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
      },
      // The frame by its number; the time is for a media service that can't count frames.
      params: {
        frame: "index",
        index,
        times_seconds: [Number((index / fps).toFixed(3))],
        format,
        ...(width ? { width } : {}),
      },
      dedupeKey: attempt,
      output: {
        count: 1,
        ext: format,
        mime: format === "png" ? "image/png" : "image/jpeg",
        kind: "image",
      },
      context: { output_title: input.label.slice(0, 200) },
      notConfiguredMessage: "the media service isn't set up, so the frame can't be taken",
    });
    if (result.ok || result.retryable) return TAKING_FRAME;
    return unavailableFrame(result.message);
  }
  return unavailableFrame("the media service couldn't take it");
}

/** Where a section's shot shows its edge now: its clip in the integration edit, else as planned. */
async function edgeSource(
  view: PlanView,
  section: SectionView,
  side: "first" | "last",
  timeline?: Timeline | null,
): Promise<FrameSource | null> {
  const shotIndex = side === "first" ? section.first : section.last;
  const owned = section.clips.find((entry) => entry.shot === shotIndex);
  if (owned && view.sequenceId) {
    const edit =
      timeline !== undefined
        ? timeline
        : await integrationTimeline(view.sequenceId).then((found) => found?.timeline ?? null);
    const clip = edit?.clips.find((entry) => entry.id === owned.clipId);
    if (clip) return clipFrame(clip, side);
  }
  const shot = view.shots[shotIndex];
  return (side === "first" ? shot?.firstFrame : shot?.lastFrame) ?? null;
}

/** A section's first or last frame, as a library still (taken if need be). */
function edgeFrame(
  view: PlanView,
  section: SectionView,
  side: "first" | "last",
  userId: string,
  timeline?: Timeline | null,
): Promise<FrameRef> {
  return edgeSource(view, section, side, timeline).then((source) =>
    takeFrame({
      source,
      side,
      label: `${view.title} · section ${section.position + 1}'s ${side} frame`,
      userId,
      projectId: view.projectId,
    }),
  );
}

async function integrationTimeline(
  sequenceId: string,
): Promise<{ timeline: Timeline; version: number; lastRenderId: string | null } | null> {
  const { data } = await db
    .from("sequences")
    .select("timeline,version,last_render_id,is_archived")
    .eq("id", sequenceId)
    .maybeSingle();
  const timeline = data && !data.is_archived ? parseTimeline(data.timeline) : null;
  return data && timeline
    ? { timeline, version: data.version, lastRenderId: data.last_render_id }
    : null;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A section's neighbours where it meets them: their shot at the join, and its frame (waited for a moment). */
async function neighboursOf(
  view: PlanView,
  section: SectionView,
  userId: string,
  waitMs: number,
): Promise<{ before: Neighbour | null; after: Neighbour | null }> {
  const previous = view.sections.find((entry) => entry.position === section.position - 1) ?? null;
  const next = view.sections.find((entry) => entry.position === section.position + 1) ?? null;
  const timeline = view.sequenceId
    ? ((await integrationTimeline(view.sequenceId))?.timeline ?? null)
    : null;
  const frames = () =>
    Promise.all([
      previous ? edgeFrame(view, previous, "last", userId, timeline) : Promise.resolve(null),
      next ? edgeFrame(view, next, "first", userId, timeline) : Promise.resolve(null),
    ]);
  const until = Date.now() + waitMs;
  let [before, after] = await frames();
  while ((before?.status === "taking" || after?.status === "taking") && Date.now() < until) {
    await pause(2_500);
    [before, after] = await frames();
  }
  return {
    before:
      previous && view.shots[previous.last]
        ? {
            section: previous.position,
            shot: view.shots[previous.last]!,
            join: joinKind(view.shots, section.first),
            frame: before,
          }
        : null,
    after:
      next && view.shots[next.first]
        ? {
            section: next.position,
            shot: view.shots[next.first]!,
            join: joinKind(view.shots, next.first),
            frame: after,
          }
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Workers                                                             */
/* ------------------------------------------------------------------ */

/** The section a worker's conversation works for, and its step limit for the turn. */
export interface WorkerSection {
  planId: string;
  sectionId: string;
  position: number;
  /** The section's step limit, and the steps its worker used before this turn. */
  budget: number;
  usedBefore: number;
  parentThreadId: string;
  workerThreadId: string;
}

interface ThreadSeed {
  id: string;
  title: string;
  project_id: string | null;
  campaign_id: string | null;
  brief_id: string | null;
  created_by: string | null;
  settings: unknown;
}

/** The steps a worker's conversation has used: every turn of it still in the conversation. */
export async function stepsUsed(workerThreadId: string, except?: string): Promise<number> {
  const { data } = await db
    .from("supercomputer_messages")
    .select("id,steps:payload->agent->steps")
    .eq("thread_id", workerThreadId)
    .eq("role", "assistant")
    .is("superseded_at", null);
  return ((data ?? []) as unknown as { id: string; steps: unknown }[])
    .filter((row) => row.id !== except)
    .reduce((sum, row) => sum + (typeof row.steps === "number" ? row.steps : 0), 0);
}

/** The section a conversation is the worker for (null for any other, or before migration 0036). */
export async function workerOfThread(
  threadId: string,
  turnId?: string,
): Promise<WorkerSection | null> {
  const { data, error } = await db
    .from("supercomputer_sections")
    .select("id,plan_id,position,step_budget")
    .eq("worker_thread_id", threadId)
    .maybeSingle();
  if (error || !data) return null;
  const { data: plan } = await db
    .from("supercomputer_section_plans")
    .select("thread_id")
    .eq("id", data.plan_id)
    .maybeSingle();
  if (!plan) return null;
  return {
    planId: data.plan_id,
    sectionId: data.id,
    position: data.position,
    budget: data.step_budget,
    usedBefore: await stepsUsed(threadId, turnId),
    parentThreadId: plan.thread_id,
    workerThreadId: threadId,
  };
}

/**
 * Starts (or carries on) a section's worker: claims the section, raises its
 * limit when it is spent, makes its conversation the first time (under the
 * one that planned it, in the same project, brief, brand and spending
 * settings), and writes what its worker is sent: its brief, with its
 * neighbours' frames as pictures.
 */
export async function startSectionWorker(input: {
  sectionId: string;
  userId: string;
  role: string;
  extend?: boolean;
  note?: string | null;
}): Promise<{ thread: ThreadSeed; worker: WorkerSection; brief: string; frames: string[] }> {
  const { data: row, error } = await db
    .from("supercomputer_sections")
    .select("*")
    .eq("id", input.sectionId)
    .maybeSingle();
  if (isMissing(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_SECTIONS);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That section no longer exists");
  const view = await loadPlan(row.plan_id);
  const section = view.sections.find((entry) => entry.id === row.id)!;
  const { data: parent } = await db
    .from("supercomputer_threads")
    .select("id,title,project_id,campaign_id,brief_id,created_by,settings")
    .eq("id", view.threadId)
    .maybeSingle();
  if (!parent) throw new AppError("INVALID_PARAMETERS", "The conversation that planned it is gone");
  if (parent.created_by !== input.userId && input.role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only whoever planned these sections, or an admin, can run them",
    );
  if (section.status === "working" && section.workerThreadId) {
    const { data: live } = await db
      .from("supercomputer_messages")
      .select("status,updated_at")
      .eq("thread_id", section.workerThreadId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fresh =
      live?.status === "streaming" && Date.now() - new Date(live.updated_at).getTime() < 3 * 60_000;
    if (fresh)
      throw new AppError(
        "INVALID_PARAMETERS",
        `Section ${section.position + 1} is already being worked on`,
      );
  }

  // A spent limit is raised by what its unsaved shots need.
  const used = section.workerThreadId ? await stepsUsed(section.workerThreadId) : 0;
  const work = section.work;
  const budget =
    input.extend || used >= section.budget - 1
      ? used + extensionSteps(view.shots, unsavedShots(section, work))
      : section.budget;
  const note = input.note?.trim() ? input.note.trim().slice(0, 1200) : work.note;
  const { data: claimed } = await db
    .from("supercomputer_sections")
    .update({
      status: "working",
      step_budget: Math.min(1000, budget),
      started_at: now(),
      finished_at: null,
      error_message: null,
      work: { ...work, note, finished: false } as never,
    })
    .eq("id", section.id)
    .eq("status", row.status)
    .select("id");
  if (!claimed?.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      `Section ${section.position + 1} changed just now: try again`,
    );
  // Claimed: anything that stops it starting now lets it go again, saying why.
  try {
    return await workerFor(view, section, parent, { ...work, note }, budget, used, input.userId);
  } catch (error) {
    await failSection(section.id, error).catch(() => undefined);
    throw error;
  }
}

/** A claimed section's worker: its conversation (made the first time) and its brief. */
async function workerFor(
  view: PlanView,
  section: SectionView,
  parent: ThreadSeed,
  work: SectionWork,
  budget: number,
  used: number,
  userId: string,
): Promise<{ thread: ThreadSeed; worker: WorkerSection; brief: string; frames: string[] }> {
  let workerThreadId = section.workerThreadId;
  if (!workerThreadId) {
    const { data: made, error: madeError } = await db
      .from("supercomputer_threads")
      .insert({
        title: `${view.title} · section ${section.position + 1}`.slice(0, 200),
        parent_thread_id: parent.id,
        project_id: parent.project_id,
        campaign_id: parent.campaign_id,
        brief_id: parent.brief_id,
        settings: parent.settings as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (madeError || !made)
      throw new AppError(
        "UNKNOWN",
        madeError?.message ?? "The worker's conversation couldn't be made",
      );
    const { data: linked } = await db
      .from("supercomputer_sections")
      .update({ worker_thread_id: made.id })
      .eq("id", section.id)
      .is("worker_thread_id", null)
      .select("id");
    if (linked?.length) workerThreadId = made.id;
    else {
      // Another request made it a moment ago: that one is used.
      await db.from("supercomputer_threads").delete().eq("id", made.id);
      const { data: again } = await db
        .from("supercomputer_sections")
        .select("worker_thread_id")
        .eq("id", section.id)
        .maybeSingle();
      workerThreadId = again?.worker_thread_id ?? null;
    }
  }
  if (!workerThreadId) throw new AppError("UNKNOWN", "The worker's conversation couldn't be found");
  const { data: thread } = await db
    .from("supercomputer_threads")
    .select("id,title,project_id,campaign_id,brief_id,created_by,settings")
    .eq("id", workerThreadId)
    .single();
  // The worker follows the planning conversation's settings: what it may spend, its brand.
  if (thread && JSON.stringify(thread.settings) !== JSON.stringify(parent.settings))
    await db
      .from("supercomputer_threads")
      .update({ settings: parent.settings as never })
      .eq("id", workerThreadId);

  // Files of generations it started before that have come in since are kept to place.
  await keepMadeWork(section.id, null).catch(() => "");
  const { data: kept } = await db
    .from("supercomputer_sections")
    .select("work")
    .eq("id", section.id)
    .maybeSingle();
  const neighbours = await neighboursOf(view, section, userId, 20_000);
  const brief = briefFor(
    view,
    section,
    neighbours,
    { ...sectionWorkOf(kept?.work), note: work.note },
    budget,
    used,
  );
  const frames = [neighbours.before?.frame, neighbours.after?.frame].flatMap((frame) =>
    frame?.status === "ready" && frame.assetId ? [frame.assetId] : [],
  );
  return {
    thread: { ...(thread ?? parent), id: workerThreadId, settings: parent.settings },
    worker: {
      planId: view.id,
      sectionId: section.id,
      position: section.position,
      budget,
      usedBefore: used,
      parentThreadId: parent.id,
      workerThreadId,
    },
    brief: used > 0 ? `Carry on: here is where your section stands.\n\n${brief}` : brief,
    frames,
  };
}

/** A worker's brief from its plan as it stands (see sectionBrief). */
function briefFor(
  view: PlanView,
  section: SectionView,
  neighbours: { before: Neighbour | null; after: Neighbour | null },
  work: SectionWork,
  budget: number,
  used: number,
): string {
  return sectionBrief({
    plan: {
      title: view.title,
      kind: view.kind,
      sourceTitle: view.sourceTitle,
      editTitle: view.sequenceId ? `${view.sourceTitle} · sections` : null,
      sections: view.sections.length,
    },
    section: { ...section, steps: section.estimated, seconds: sectionSeconds(view, section) },
    shots: view.shots,
    before: neighbours.before,
    after: neighbours.after,
    work,
    budget,
    used,
  });
}

/**
 * A worker's brief as its section stands now, with its neighbours' frames
 * as they are (for a worker that started before they were taken).
 */
export async function sectionBriefNow(
  sectionId: string,
  userId: string,
): Promise<{ brief: string; frames: { label: string; bucket: string; path: string }[] }> {
  const { data: row } = await db
    .from("supercomputer_sections")
    .select("plan_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!row) throw new AppError("INVALID_PARAMETERS", "That section no longer exists");
  const view = await loadPlan(row.plan_id);
  const section = view.sections.find((entry) => entry.id === sectionId)!;
  const neighbours = await neighboursOf(view, section, userId, 10_000);
  const used = section.workerThreadId ? await stepsUsed(section.workerThreadId) : section.used;
  const frames = [
    { neighbour: neighbours.before, side: "last" },
    { neighbour: neighbours.after, side: "first" },
  ].flatMap(({ neighbour, side }) =>
    neighbour?.frame?.status === "ready" && neighbour.frame.bucket && neighbour.frame.path
      ? [
          {
            label: `Section ${neighbour.section + 1}'s ${side} frame (shot ${neighbour.shot.index + 1}, library image ${neighbour.frame.assetId})`,
            bucket: neighbour.frame.bucket,
            path: neighbour.frame.path,
          },
        ]
      : [],
  );
  return {
    brief: briefFor(view, section, neighbours, section.work, section.budget, used),
    frames,
  };
}

function sectionSeconds(view: PlanView, section: SectionView): number {
  let seconds = 0;
  for (let index = section.first; index <= section.last; index += 1)
    seconds += view.shots[index]?.seconds ?? 0;
  return Number(seconds.toFixed(3));
}

/** Reads, changes and writes a section's work, retrying if another save landed in between. */
async function changeWork(
  sectionId: string,
  change: (work: SectionWork) => SectionWork,
): Promise<SectionWork> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data } = await db
      .from("supercomputer_sections")
      .select("work,updated_at")
      .eq("id", sectionId)
      .maybeSingle();
    if (!data) throw new AppError("INVALID_PARAMETERS", "That section no longer exists");
    const before = sectionWorkOf(data.work);
    const after = change(before);
    if (after === before || JSON.stringify(after) === JSON.stringify(before)) return before;
    const { data: written } = await db
      .from("supercomputer_sections")
      .update({ work: after as never })
      .eq("id", sectionId)
      .eq("updated_at", data.updated_at)
      .select("id");
    if (written?.length) return after;
  }
  throw new AppError("UNKNOWN", "The section kept changing as it was saved: try again");
}

/**
 * Keeps what a worker made but didn't save to a shot, so nothing done is
 * lost: the generations its turn started (and any from before still being
 * made) are recorded until their files are in, then kept as takes to place.
 * Merges what it saved, and says in words what is kept.
 */
async function keepMadeWork(sectionId: string, state: TurnState | null): Promise<string> {
  const started = new Set<string>();
  for (const { block } of state?.display.blocks ?? [])
    if (block.kind === "tool" && block.ui?.type === "generation")
      started.add(block.ui.generationId);
  const { data: before } = await db
    .from("supercomputer_sections")
    .select("work")
    .eq("id", sectionId)
    .maybeSingle();
  const wanted = [...new Set([...sectionWorkOf(before?.work).generations, ...started])];
  if (wanted.length) {
    const { data: files } = await db
      .from("assets")
      .select("id,asset_type,generation_id,created_at")
      .in("generation_id", wanted)
      .is("deleted_at", null);
    const takes: LooseTake[] = (files ?? []).flatMap((file) =>
      file.asset_type === "video" || file.asset_type === "image"
        ? [
            {
              assetId: file.id,
              kind: file.asset_type,
              generationId: file.generation_id,
              madeAt: file.created_at,
            },
          ]
        : [],
    );
    await changeWork(sectionId, (work) => withGenerations(work, [...started], takes));
  }
  const merged = await mergeIntoEdit(sectionId).catch(() => null);
  const { data } = await db
    .from("supercomputer_sections")
    .select("work")
    .eq("id", sectionId)
    .maybeSingle();
  const work = sectionWorkOf(data?.work);
  const parts = [
    merged
      ? `${merged.placed} ${merged.placed === 1 ? "shot" : "shots"} in the integration edit`
      : "",
    work.loose.length
      ? `${work.loose.length} ${work.loose.length === 1 ? "take" : "takes"} kept to place`
      : "",
    work.generations.length ? `${work.generations.length} still being made` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/** A section claimed for its worker whose turn couldn't start: let go again, saying why. */
export async function failSection(sectionId: string, error: unknown): Promise<void> {
  await db
    .from("supercomputer_sections")
    .update({
      status: "failed",
      error_message: (error instanceof Error ? error.message : "Its worker couldn't start").slice(
        0,
        600,
      ),
    })
    .eq("id", sectionId)
    .eq("status", "working");
}

/** A worker's section is being worked on again (a turn resumed after an approval). */
export async function markSectionWorking(sectionId: string): Promise<void> {
  await db
    .from("supercomputer_sections")
    .update({ status: "working", error_message: null })
    .eq("id", sectionId)
    .neq("status", "working");
}

/** A worker's turn held to its section's limit: warned near it, saved before it. */
export function workerBudget(worker: WorkerSection): TurnBudget {
  const maxSteps = turnLimit(worker.budget, worker.usedBefore);
  const number = worker.position + 1;
  return {
    maxSteps,
    warnAt: warnFrom(maxSteps),
    onWarning: async (state) => {
      const kept = await keepMadeWork(worker.sectionId, state);
      await db
        .from("supercomputer_sections")
        .update({ warned_at: now() })
        .eq("id", worker.sectionId);
      const left = maxSteps - state.steps;
      return {
        note: `[From the studio] ${left} of this section's ${maxSteps} steps ${left === 1 ? "is" : "are"} left. Save every shot that is right now with save_section, then finish with finish_section, or say what is left: at the limit the studio saves what you have made and stops.`,
        notice: `Section ${number} is near its step limit: ${left} of ${maxSteps} steps left.${kept ? ` Kept so far: ${kept}.` : ""}`,
      };
    },
    onLimit: async (state) => {
      const kept = await keepMadeWork(worker.sectionId, state);
      return `Section ${number} reached its step limit (${maxSteps} steps), so it stopped here. What it made is saved${kept ? `: ${kept}` : ""}. Carry it on to finish it.`;
    },
  };
}

/**
 * A worker's turn, settled into its plan as it ends: what it made kept, its
 * saved shots merged, its steps counted, its state set from how the turn
 * ended, and the frames of the joins either side asked for, to be checked.
 */
export async function settleWorkerTurn(
  worker: WorkerSection,
  state: TurnState,
  userId: string,
): Promise<void> {
  await keepMadeWork(worker.sectionId, state).catch(() => "");
  const used = await stepsUsed(worker.workerThreadId);
  const { data } = await db
    .from("supercomputer_sections")
    .select("work")
    .eq("id", worker.sectionId)
    .maybeSingle();
  const work = sectionWorkOf(data?.work);
  const status = statusAfterTurn(state.display.status, work);
  await db
    .from("supercomputer_sections")
    .update({
      status,
      steps_used: used,
      ...(status === "done" ? { finished_at: now() } : {}),
      error_message:
        status === "failed" ? (state.display.error ?? "The worker's turn failed") : null,
    })
    .eq("id", worker.sectionId);
  const view = await loadPlan(worker.planId);
  const done = view.sections.every((section) => section.status === "done");
  await db
    .from("supercomputer_section_plans")
    .update({ status: done ? "done" : "working" })
    .eq("id", worker.planId);
  // The joins either side: their frames asked for now, checked when both are in.
  await checkJoins({
    planId: worker.planId,
    positions: [worker.position - 1, worker.position],
    userId,
    waitMs: 0,
    look: false,
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Saving and merging                                                  */
/* ------------------------------------------------------------------ */

/**
 * Merges a section's saved shots into the integration edit (see
 * mergeSection), only over the version it read: if the edit was saved in
 * between (the Editor, or another section), it is read again and merged again.
 */
export async function mergeIntoEdit(sectionId: string): Promise<MergeResult> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: row } = await db
      .from("supercomputer_sections")
      .select("plan_id")
      .eq("id", sectionId)
      .maybeSingle();
    if (!row) throw new AppError("INVALID_PARAMETERS", "That section no longer exists");
    const view = await loadPlan(row.plan_id);
    const section = view.sections.find((entry) => entry.id === sectionId)!;
    if (!view.sequenceId)
      throw new AppError(
        "INVALID_PARAMETERS",
        "The integration edit is gone: plan the sections again",
      );
    const edit = await integrationTimeline(view.sequenceId);
    if (!edit)
      throw new AppError(
        "INVALID_PARAMETERS",
        "The integration edit is gone: plan the sections again",
      );
    const result = mergeSection({
      timeline: edit.timeline,
      shots: view.shots,
      section,
      owned: section.clips,
      others: view.sections
        .filter((entry) => entry.id !== sectionId)
        .map((entry) => ({
          position: entry.position,
          clipIds: entry.clips.map((clip) => clip.clipId),
        })),
      saved: section.work.shots,
    });
    if (result.changed) {
      const { data: saved } = await db
        .from("sequences")
        .update({ timeline: result.timeline as never, version: edit.version + 1 })
        .eq("id", view.sequenceId)
        .eq("version", edit.version)
        .select("id");
      if (!saved?.length) continue;
    }
    if (result.changed || JSON.stringify(result.owned) !== JSON.stringify(section.clips))
      await db
        .from("supercomputer_sections")
        .update({ clips: result.owned as never, merged_at: now() })
        .eq("id", sectionId);
    return result;
  }
  throw new AppError("UNKNOWN", "The integration edit kept changing as it was merged: try again");
}

/**
 * A worker saves shots of its section: each shot's number (from 1) and the
 * library file that now shows it. They go into the integration edit at once.
 */
export async function saveSectionShots(input: {
  sectionId: string;
  shots: {
    shot: number;
    assetId: string;
    seconds?: number | null | undefined;
    trimStart?: number | null | undefined;
  }[];
}): Promise<{ saved: SavedShot[]; merge: MergeResult; left: number[]; section: SectionView }> {
  const { data: row } = await db
    .from("supercomputer_sections")
    .select("plan_id,first_shot,last_shot,position")
    .eq("id", input.sectionId)
    .maybeSingle();
  if (!row) throw new AppError("INVALID_PARAMETERS", "That section no longer exists");
  const outside = input.shots.filter(
    (entry) => entry.shot - 1 < row.first_shot || entry.shot - 1 > row.last_shot,
  );
  if (outside.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      `Shot ${outside.map((entry) => entry.shot).join(", ")} ${outside.length === 1 ? "isn't" : "aren't"} this section's: it owns shots ${row.first_shot + 1} to ${row.last_shot + 1}`,
    );
  const ids = [...new Set(input.shots.map((entry) => entry.assetId))];
  const { data: files } = await db
    .from("assets")
    .select("id,asset_type,duration_seconds")
    .in("id", ids)
    .is("deleted_at", null);
  const at = now();
  const saved: SavedShot[] = input.shots.map((entry) => {
    const file = (files ?? []).find((candidate) => candidate.id === entry.assetId);
    if (!file || (file.asset_type !== "video" && file.asset_type !== "image"))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${entry.assetId} isn't a picture or video in the library`,
      );
    return {
      shot: entry.shot - 1,
      assetId: file.id,
      kind: file.asset_type,
      seconds: entry.seconds && entry.seconds > 0 ? entry.seconds : null,
      trimStart: file.asset_type === "video" ? Math.max(0, entry.trimStart ?? 0) : 0,
      fileSeconds: file.duration_seconds === null ? null : Number(file.duration_seconds),
      savedAt: at,
    };
  });
  const work = await changeWork(input.sectionId, (current) => withSaved(current, saved));
  const merge = await mergeIntoEdit(input.sectionId);
  const view = await loadPlan(row.plan_id);
  const section = view.sections.find((entry) => entry.id === input.sectionId)!;
  return { saved, merge, left: unsavedShots(section, work), section };
}

/** A worker ends its section: its line on what it made, and anything left. */
export async function finishSection(input: {
  sectionId: string;
  summary: string;
  left?: string | null;
}): Promise<SectionWork> {
  return changeWork(input.sectionId, (work) => ({
    ...work,
    finished: true,
    summary: input.summary.trim().slice(0, 600) || work.summary,
    left: input.left?.trim() ? input.left.trim().slice(0, 600) : null,
    note: null,
  }));
}

/** Gives sections to their workers: queued, to run one after another on the planning conversation's page. */
export async function queueSections(input: {
  planId: string;
  positions?: number[] | null;
  note?: string | null;
}): Promise<PlanView> {
  const view = await loadPlan(input.planId);
  const chosen = view.sections.filter(
    (section) =>
      section.status !== "working" &&
      (input.positions?.length
        ? input.positions.includes(section.position)
        : section.status !== "done"),
  );
  for (const section of chosen) {
    await db
      .from("supercomputer_sections")
      .update({
        status: "queued",
        ...(input.note?.trim()
          ? { work: { ...section.work, note: input.note.trim().slice(0, 1200) } as never }
          : {}),
      })
      .eq("id", section.id)
      .neq("status", "working");
  }
  await db.from("supercomputer_section_plans").update({ status: "working" }).eq("id", view.id);
  return loadPlan(input.planId);
}

/** Takes a plan's queued sections back: none starts after the one working now. */
export async function holdSections(planId: string): Promise<PlanView> {
  await db
    .from("supercomputer_sections")
    .update({ status: "waiting" })
    .eq("plan_id", planId)
    .eq("status", "queued");
  return loadPlan(planId);
}

/* ------------------------------------------------------------------ */
/* Join checks                                                         */
/* ------------------------------------------------------------------ */

const LOOK_SYSTEM = `You compare the two frames either side of a cut in a video: the last frame before the cut (image 1), then the first frame after it (image 2). The two sides were made separately, so they may not meet as they should.

Judge three things, each "same", "minor", "different" or "unseen":
- framing: the camera's framing and position: where the subject sits and how large, the angle, the horizon.
- colour: the grade: exposure, white balance, saturation and contrast.
- continuity: what is in the picture: the setting, objects and props, the light's direction, the weather, what people wear and where they are.

"same": a viewer would see nothing jump. "minor": a small shift a viewer might just catch (a touch of exposure, a nudge of framing). "different": a viewer would notice the cut jump. "unseen": a frame is too dark, blurred or blank to judge.

For "minor" and "different", list what changed in a few words each (at most four), starting with what it is, e.g. "colour: warmer after the cut", "framing: closer and lower after the cut".`;

const LOOK_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    framing: { type: "string", enum: ["same", "minor", "different", "unseen"] },
    colour: { type: "string", enum: ["same", "minor", "different", "unseen"] },
    continuity: { type: "string", enum: ["same", "minor", "different", "unseen"] },
    differences: { type: "array", items: { type: "string" } },
  },
  required: ["framing", "colour", "continuity", "differences"],
};

const HOW_MEANT: Record<JoinMeasures["kind"], string> = {
  continuous:
    "How the cut is meant to read: one shot carrying straight on. The two frames should be the same picture.",
  cut: "How the cut is meant to read: a cut within one scene. The framing may change; the colour and what is in the picture should hold.",
  scene: "How the cut is meant to read: a cut to another scene.",
};

async function signed(bucket: string, path: string): Promise<string | null> {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

/** The studio's AI on a join's two frames (null when it couldn't look). */
async function lookAtJoin(
  urls: [string, string],
  kind: JoinMeasures["kind"],
): Promise<JoinLook | null> {
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route) return null;
  const answer = await route.provider.generateStructured<Json>({
    system: LOOK_SYSTEM,
    input: `${HOW_MEANT[kind]}\n\nImage 1: the last frame before the cut. Image 2: the first frame after it.`,
    schemaName: "join_look",
    schema: LOOK_SCHEMA,
    model: route.model,
    images: urls,
    timeoutMs: 60_000,
  });
  return answer.ok && answer.data ? joinLookOf(answer.data) : null;
}

/** What the integration edit's last render (of this very version) measured at a clip's join. */
async function renderAt(
  edit: { version: number; lastRenderId: string | null },
  clipIndex: number,
): Promise<JoinMeasures["render"]> {
  if (!edit.lastRenderId) return null;
  const { data: render } = await db
    .from("sequence_renders")
    .select("status,sequence_version,asset_id")
    .eq("id", edit.lastRenderId)
    .maybeSingle();
  if (
    render?.status !== "completed" ||
    render.sequence_version !== edit.version ||
    !render.asset_id
  )
    return null;
  const { data: file } = await db
    .from("assets")
    .select("metadata")
    .eq("id", render.asset_id)
    .maybeSingle();
  return renderJoinAt(file?.metadata, clipIndex);
}

const sameSource = (a: FrameSource | null | undefined, b: FrameSource | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Checks joins between sections on both sides (all of a plan's, or those at
 * `positions`): the frames either side are taken from the integration
 * edit's clips (waited for up to `waitMs`), then the studio's AI looks at
 * them for framing, colour and continuity, the last render's smart-join
 * measurement is read, and the character and lettering checks run. A join
 * whose frames haven't changed keeps its verdict unless asked `again`.
 */
export async function checkJoins(input: {
  planId: string;
  positions?: number[] | null;
  userId: string;
  waitMs: number;
  again?: boolean;
  /** False: only take the frames (the check runs on a later call). */
  look?: boolean;
}): Promise<PlanView> {
  const until = Date.now() + Math.max(0, input.waitMs);
  for (;;) {
    const view = await loadPlan(input.planId);
    const edit = view.sequenceId ? await integrationTimeline(view.sequenceId) : null;
    const wanted = view.joins.filter(
      (join) => !input.positions?.length || input.positions.includes(join.position),
    );
    const results = await Promise.all(
      wanted.map((join) => checkJoin(view, join.position, edit, input)),
    );
    if (!results.includes("framing") || Date.now() >= until) return loadPlan(input.planId);
    await pause(3_000);
  }
}

async function checkJoin(
  view: PlanView,
  position: number,
  edit: Awaited<ReturnType<typeof integrationTimeline>>,
  input: { userId: string; again?: boolean; look?: boolean },
): Promise<"waiting" | "framing" | "checked" | "kept" | "busy"> {
  const join = view.joins.find((entry) => entry.position === position)!;
  const before = view.sections.find((entry) => entry.position === position);
  const after = view.sections.find((entry) => entry.position === position + 1);
  const update = (patch: Json) =>
    db
      .from("supercomputer_section_joins")
      .update(patch as never)
      .eq("id", join.id);
  if (!edit || !before || !after) {
    await update({ status: "waiting" });
    return "waiting";
  }
  const sides = joinClips(edit.timeline, before.clips, after.clips);
  if (!sides.before || !sides.after) {
    if (join.status !== "waiting") await update({ status: "waiting", verdict: null });
    return "waiting";
  }
  const sources = {
    before: clipFrame(sides.before, "last"),
    after: clipFrame(sides.after, "first"),
  };
  const unchanged =
    sameSource(join.before?.source, sources.before) &&
    sameSource(join.after?.source, sources.after);
  if (unchanged && join.verdict && !input.again) return "kept";
  const label = (side: string) => `${view.title} · join ${position + 1}, ${side}`;
  const [frameBefore, frameAfter] = await Promise.all([
    takeFrame({
      source: sources.before,
      side: "last",
      label: label("before the cut"),
      userId: input.userId,
      projectId: view.projectId,
    }),
    takeFrame({
      source: sources.after,
      side: "first",
      label: label("after the cut"),
      userId: input.userId,
      projectId: view.projectId,
    }),
  ]);
  const frames: { before: JoinFrame; after: JoinFrame } = {
    before: { clipId: sides.before.id, source: sources.before, frame: frameBefore },
    after: { clipId: sides.after.id, source: sources.after, frame: frameAfter },
  };
  if (frameBefore.status === "taking" || frameAfter.status === "taking" || input.look === false) {
    await update({
      status:
        frameBefore.status === "taking" || frameAfter.status === "taking" ? "framing" : "checking",
      frames,
      ...(unchanged ? {} : { verdict: null }),
    });
    return frameBefore.status === "taking" || frameAfter.status === "taking" ? "framing" : "busy";
  }
  // One check at a time: a claim older than two minutes was cut short and is taken over.
  const claim = now();
  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: held } = await db
    .from("supercomputer_section_joins")
    .update({ status: "checking", claimed_at: claim, frames: frames as never })
    .eq("id", join.id)
    .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
    .select("id");
  if (!held?.length) return "busy";

  const readyFrames = [frameBefore, frameAfter].filter(
    (frame): frame is FrameRef & { bucket: string; path: string } =>
      frame.status === "ready" && !!frame.bucket && !!frame.path,
  );
  const measures: JoinMeasures = {
    kind: join.kind,
    look: null,
    render: null,
    characters: null,
    lettering: null,
    videos: sides.before.kind === "video" && sides.after.kind === "video",
    blend: joinModeOf(sides.after),
    ...(sides.adjacent ? {} : { apart: true }),
  };
  if (readyFrames.length === 2) {
    const urls = await Promise.all(readyFrames.map((frame) => signed(frame.bucket, frame.path)));
    const [beforeUrl, afterUrl] = urls;
    const cast = view.kind === "long_video" ? await castOf(view.sourceId) : [];
    const [look, render, characters, lettering] = await Promise.all([
      join.kind !== "scene" && beforeUrl && afterUrl
        ? lookAtJoin([beforeUrl, afterUrl], join.kind).catch(() => null)
        : Promise.resolve(null),
      sides.afterIndex !== null
        ? renderAt(edit, sides.afterIndex).catch(() => null)
        : Promise.resolve(null),
      (async () => {
        if (!cast.length) return null;
        const { checkIdentity } = await import("../characters/identity.server");
        const outcome = await checkIdentity({
          characters: cast,
          frames: [
            {
              bucket: readyFrames[0]!.bucket,
              path: readyFrames[0]!.path,
              label: "the last frame before the cut",
            },
            {
              bucket: readyFrames[1]!.bucket,
              path: readyFrames[1]!.path,
              label: "the first frame after it",
            },
          ],
          what: `the cut between sections ${position + 1} and ${position + 2}`,
          timeoutMs: 60_000,
        });
        return outcome.ok
          ? { flagged: outcome.result.flagged, summary: outcome.result.summary }
          : null;
      })().catch(() => null),
      (async () => {
        if (!beforeUrl || !afterUrl) return null;
        const { checkPicturesForText } = await import("../media/text-check.server");
        const [left, right] = await Promise.all([
          checkPicturesForText({ urls: [beforeUrl], what: "the last frame before a cut" }),
          checkPicturesForText({ urls: [afterUrl], what: "the first frame after a cut" }),
        ]);
        if (!left.ok && !right.ok) return null;
        const garbled = [left, right].flatMap((outcome) =>
          outcome.ok && outcome.result.verdict === "garbled" ? [outcome.result.summary] : [],
        );
        return {
          before: left.ok ? left.result.verdict : null,
          after: right.ok ? right.result.verdict : null,
          summary: garbled.join(" ") || null,
        };
      })().catch(() => null),
    ]);
    measures.look = look;
    measures.render = render;
    measures.characters = characters;
    measures.lettering = lettering;
  }
  const verdict = judgeJoin(measures, { before: position, after: position + 1 });
  const unavailable = [frameBefore, frameAfter].find((frame) => frame.status === "unavailable");
  const kept: JoinVerdict =
    verdict.status === "unmeasured" && unavailable
      ? {
          ...verdict,
          summary: `${verdict.summary.replace(/it couldn't be judged\.$/, "")}its frames couldn't be taken (${unavailable.note ?? "unavailable"}).`,
        }
      : verdict;
  await db
    .from("supercomputer_section_joins")
    .update({
      status: kept.status,
      verdict: { ...kept, measures } as never,
      frames: frames as never,
      checked_at: now(),
      claimed_at: null,
    })
    .eq("id", join.id)
    .eq("claimed_at", claim);
  return "checked";
}

/**
 * Puts a join right: a smart blend or colour match set on the integration
 * edit's clip after it (free; the next render does it), or a section queued
 * to make its shot again, with a note saying what to fix (it asks before it
 * spends, as ever).
 */
export async function fixJoin(input: {
  planId: string;
  position: number;
  fix: JoinFix["kind"];
}): Promise<{ view: PlanView; done: string }> {
  const view = await loadPlan(input.planId);
  const join = view.joins.find((entry) => entry.position === input.position);
  if (!join) throw new AppError("INVALID_PARAMETERS", "That join isn't in the plan");
  if (input.fix === "redo_after" || input.fix === "redo_before") {
    const target = view.sections.find(
      (entry) =>
        entry.position === (input.fix === "redo_after" ? input.position + 1 : input.position),
    );
    if (!target) throw new AppError("INVALID_PARAMETERS", "That section isn't in the plan");
    const frame = (input.fix === "redo_after" ? join.before : join.after)?.frame;
    const what = join.verdict?.findings
      .filter((entry) => entry.status === "differs")
      .map((entry) => `${entry.aspect}: ${entry.detail}`)
      .join("; ");
    const note =
      input.fix === "redo_after"
        ? `Make your first shot (shot ${target.first + 1}) again so it meets section ${input.position + 1} where it ends${frame?.assetId ? `: start from its last frame, library image ${frame.assetId}` : ""}.${what ? ` The join's check found: ${what}.` : ""} Then save it with save_section.`
        : `Make your last shot (shot ${target.last + 1}) again so it meets section ${input.position + 2} where it begins${frame?.assetId ? ` (its first frame is library image ${frame.assetId})` : ""}.${what ? ` The join's check found: ${what}.` : ""} Then save it with save_section.`;
    const queued = await queueSections({ planId: view.id, positions: [target.position], note });
    return { view: queued, done: `Section ${target.position + 1} is queued to make it again.` };
  }
  if (!view.sequenceId)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The integration edit is gone: plan the sections again",
    );
  const before = view.sections.find((entry) => entry.position === input.position);
  const after = view.sections.find((entry) => entry.position === input.position + 1);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const edit = await integrationTimeline(view.sequenceId);
    if (!edit || !before || !after)
      throw new AppError(
        "INVALID_PARAMETERS",
        "The integration edit is gone: plan the sections again",
      );
    const sides = joinClips(edit.timeline, before.clips, after.clips);
    if (!sides.before || !sides.after || sides.afterIndex === null)
      throw new AppError("INVALID_PARAMETERS", "Both sides of the join need a clip first");
    if (sides.before.kind !== "video" || sides.after.kind !== "video")
      throw new AppError("INVALID_PARAMETERS", "Only a join between two videos can be blended");
    const mode = input.fix === "smart_blend" ? "smart" : "colour";
    const clips = edit.timeline.clips.map((clip, index) =>
      index === sides.afterIndex ? { ...clip, ...joinFields(mode) } : clip,
    );
    const { data: saved } = await db
      .from("sequences")
      .update({ timeline: { ...edit.timeline, clips } as never, version: edit.version + 1 })
      .eq("id", view.sequenceId)
      .eq("version", edit.version)
      .select("id");
    if (!saved?.length) continue;
    // The verdict, judged again with the join as it is now set.
    const measures = joinMeasuresOf(join.verdict);
    if (measures) {
      const next = { ...measures, blend: mode } satisfies JoinMeasures;
      const verdict = judgeJoin(next, { before: input.position, after: input.position + 1 });
      await db
        .from("supercomputer_section_joins")
        .update({ status: verdict.status, verdict: { ...verdict, measures: next } as never })
        .eq("id", join.id);
    }
    return {
      view: await loadPlan(view.id),
      done:
        mode === "smart"
          ? "The join is smart-blended: the next render puts the later clip back in register."
          : "The join is colour-matched: the next render matches its colour.",
    };
  }
  throw new AppError("UNKNOWN", "The integration edit kept changing: try again");
}

export { EMPTY_WORK, type OwnedClip };
