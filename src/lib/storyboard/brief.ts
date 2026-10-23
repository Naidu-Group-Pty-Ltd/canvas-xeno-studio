/**
 * A storyboard from a brief written as data, in the shape Reel 1's
 * system_edition.py writes brief.json: shots, each with its block, title,
 * sources (plates and graphics), beats (a time and what happens), camera,
 * what it ends on, its on-screen text exactly, its notes, its times and the
 * voiceover lines it carries. Each block becomes a scene and each shot a
 * shot, with everything the brief says about it kept in the shot's spec, so
 * nothing is lost and the page can grow to show more of it.
 *
 * A shot's cue (the words it starts on, for timing it from the voice) is its
 * own `cue`, else the first voiceover line it carries.
 *
 * Pure checks and planning, shared by the Storyboards page and tests; the
 * plan is saved through a Supabase client by saveStoryboardPlan.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

/** The most shots one brief can make. */
export const BRIEF_LIMITS = { shots: 200, beats: 200, bytes: 2_000_000 } as const;

const text = (max: number) => z.string().trim().max(max);
const time = z.number().finite().min(0).max(36_000);
const name = z.union([z.string().trim().min(1).max(40), z.number().int().min(0)]).transform(String);

export const briefBeatSchema = z.object({ at: time, do: text(4000).min(1) }).passthrough();

export const briefShotSchema = z
  .object({
    id: name,
    block: name.optional(),
    title: text(300).optional(),
    kind: text(60).optional(),
    palette: text(60).optional(),
    sources: z.array(text(200)).max(200).optional(),
    beats: z.array(briefBeatSchema).max(BRIEF_LIMITS.beats).optional(),
    camera: text(4000).optional(),
    result: text(4000).optional(),
    on_screen: z.array(text(500)).max(200).optional(),
    notes: text(8000).optional(),
    in: time.optional(),
    out: time.optional(),
    seconds: z.number().finite().positive().max(3600).optional(),
    voice_in: time.optional(),
    voiceover: z.array(text(500)).max(200).optional(),
    cue: text(500).optional(),
  })
  .passthrough();
export type BriefShot = z.infer<typeof briefShotSchema>;

export const briefSchema = z
  .object({
    title: text(300).min(1),
    idea: text(8000).optional(),
    written: text(40).optional(),
    extends: z
      .object({ brief: z.string().optional(), title: z.string().optional() })
      .passthrough()
      .optional(),
    delivery: z
      .object({
        aspect_ratio: z.string().max(20).optional(),
        size: z.string().max(40).optional(),
        fps: z.number().positive().max(120).optional(),
        seconds: z.number().positive().max(36_000).optional(),
      })
      .passthrough()
      .optional(),
    voiceover: z
      .object({
        asset_id: z.string().uuid().optional(),
        seconds: z.number().positive().optional(),
        speech_end: z.number().positive().optional(),
        timed_from: z.string().max(1000).optional(),
      })
      .passthrough()
      .optional(),
    /** Optional: each block's title and purpose (spec.json's timing.blocks shape), for the scenes. */
    blocks: z
      .array(
        z
          .object({ block: name, title: text(300).optional(), purpose: text(4000).optional() })
          .passthrough(),
      )
      .max(BRIEF_LIMITS.shots)
      .optional(),
    shots: z.array(briefShotSchema).min(1).max(BRIEF_LIMITS.shots),
  })
  .passthrough();
export type Brief = z.infer<typeof briefSchema>;

export type BriefReading =
  { ok: true; brief: Brief; warnings: string[] } | { ok: false; problems: string[] };

/** "00:05.467": a time as the brief's page writes it. */
export function briefTime(seconds: number): string {
  // In whole milliseconds, so 59.9996 reads as 01:00.000 rather than 00:60.000.
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const rest = (milliseconds - minutes * 60_000) / 1000;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(3).padStart(6, "0")}`;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

function issuePath(path: (string | number)[], value: unknown): string {
  // "shots.4.beats.2.at" reads better as the shot's own id.
  if (path[0] === "shots" && typeof path[1] === "number" && value && typeof value === "object") {
    const shot = (value as { shots?: unknown[] }).shots?.[path[1]] as { id?: unknown } | undefined;
    const id =
      typeof shot?.id === "string" || typeof shot?.id === "number" ? String(shot.id) : null;
    const rest = path.slice(2).join(".");
    return `Shot ${id ?? path[1] + 1}${rest ? ` (${rest})` : ""}`;
  }
  return path.join(".") || "The brief";
}

/**
 * A brief read and checked: its shape, then that it holds together (each
 * shot named once, ending after it starts, its beats in order and inside
 * it). What would make a wrong storyboard stops the import; what is only
 * worth a look (gaps between shots, lengths that don't add up) comes back
 * as warnings.
 */
export function readBrief(value: unknown): BriefReading {
  const parsed = briefSchema.safeParse(value);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issuePath(issue.path, value)}: ${issue.message}`);
    return { ok: false, problems };
  }
  const brief = parsed.data;
  const problems: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  brief.shots.forEach((shot, index) => {
    if (seen.has(shot.id)) problems.push(`Shot ${shot.id} is in the brief twice.`);
    seen.add(shot.id);
    if (shot.in !== undefined && shot.out !== undefined) {
      if (shot.out <= shot.in)
        problems.push(`Shot ${shot.id} ends (${briefTime(shot.out)}) before it starts.`);
      else if (shot.seconds !== undefined && !near(shot.seconds, shot.out - shot.in))
        warnings.push(
          `Shot ${shot.id} says it is ${shot.seconds} s, but runs ${(shot.out - shot.in).toFixed(3)} s.`,
        );
    }
    const beats = shot.beats ?? [];
    beats.forEach((beat, at) => {
      if (at > 0 && beat.at < beats[at - 1]!.at)
        problems.push(
          `Shot ${shot.id}: its beat at ${briefTime(beat.at)} comes before the one above it.`,
        );
    });
    if (beats.length && shot.in !== undefined && shot.out !== undefined) {
      const outside = beats.filter(
        (beat) => beat.at < shot.in! - 1e-6 || beat.at >= shot.out! - 1e-6,
      );
      if (outside.length)
        problems.push(
          `Shot ${shot.id}: a beat at ${briefTime(outside[0]!.at)} falls outside ${briefTime(shot.in)}–${briefTime(shot.out)}.`,
        );
    }
    const before = brief.shots[index - 1];
    if (before?.out !== undefined && shot.in !== undefined && !near(before.out, shot.in))
      warnings.push(
        shot.in > before.out
          ? `There is a gap of ${(shot.in - before.out).toFixed(3)} s between ${before.id} and ${shot.id}.`
          : `${shot.id} starts ${(before.out - shot.in).toFixed(3)} s before ${before.id} ends.`,
      );
  });
  const last = brief.shots.at(-1)!;
  if (
    brief.delivery?.seconds !== undefined &&
    last.out !== undefined &&
    !near(last.out, brief.delivery.seconds)
  )
    warnings.push(
      `The shots run to ${briefTime(last.out)}, but the brief's delivery is ${brief.delivery.seconds} s.`,
    );
  return problems.length ? { ok: false, problems } : { ok: true, brief, warnings };
}

/** A brief from a file's text: JSON, read and checked. */
export function readBriefText(textValue: string): BriefReading {
  if (textValue.length > BRIEF_LIMITS.bytes)
    return { ok: false, problems: ["The brief is larger than 2 MB."] };
  try {
    return readBrief(JSON.parse(textValue));
  } catch {
    return { ok: false, problems: ["That isn't JSON: export the brief as its brief.json."] };
  }
}

/** The words a shot starts on: its own cue, else the first voiceover line it carries. */
export function cueOf(shot: Pick<BriefShot, "cue" | "voiceover">): string | null {
  return shot.cue?.trim() || shot.voiceover?.find((line) => line.trim())?.trim() || null;
}

/** A shot's length: as given, else from its times. */
function secondsOf(shot: BriefShot): number | null {
  if (shot.seconds !== undefined) return shot.seconds;
  if (shot.in !== undefined && shot.out !== undefined && shot.out > shot.in)
    return Number((shot.out - shot.in).toFixed(3));
  return null;
}

export interface PlannedShot {
  shot_number: number;
  name: string;
  description: string | null;
  prompt: string | null;
  spec: Record<string, unknown>;
  duration_seconds: number | null;
}

export interface PlannedScene {
  scene_number: number;
  name: string;
  purpose: string | null;
  shots: PlannedShot[];
}

export interface StoryboardPlan {
  storyboard: {
    title: string;
    objective: string | null;
    creative_direction: Record<string, unknown>;
    target_duration_seconds: number | null;
    primary_aspect_ratio: string | null;
  };
  scenes: PlannedScene[];
  shotCount: number;
  /** How long the shots run, end to end. */
  seconds: number;
}

/**
 * The storyboard a brief makes: a scene for each run of shots in one block
 * (in the brief's order), named by the block and its title where the brief
 * has one, and a shot for each shot, keeping its whole record in its spec.
 */
export function planFromBrief(brief: Brief): StoryboardPlan {
  const titles = new Map((brief.blocks ?? []).map((block) => [block.block, block]));
  const runs: { block: string | null; shots: BriefShot[] }[] = [];
  for (const shot of brief.shots) {
    const block = shot.block ?? null;
    const run = runs.at(-1);
    if (run && run.block === block) run.shots.push(shot);
    else runs.push({ block, shots: [shot] });
  }
  const scenes: PlannedScene[] = runs.map((run, index) => {
    const about = run.block ? titles.get(run.block) : undefined;
    const first = run.shots[0]!;
    const last = run.shots.at(-1)!;
    const span =
      first.in !== undefined && last.out !== undefined
        ? `${briefTime(first.in)} to ${briefTime(last.out)}, ${(last.out - first.in).toFixed(2)} s`
        : null;
    const purpose = [about?.purpose, span && `(${span})`].filter(Boolean).join(" ");
    return {
      scene_number: index + 1,
      name: (run.block
        ? `Block ${run.block}${about?.title ? ` · ${about.title}` : ""}`
        : `Shots ${first.id} to ${last.id}`
      ).slice(0, 300),
      purpose: purpose || null,
      shots: run.shots.map((shot, at) => {
        const beats = shot.beats ?? [];
        const cue = cueOf(shot);
        return {
          shot_number: at + 1,
          name: `${shot.id}${shot.title ? ` · ${shot.title}` : ""}`.slice(0, 300),
          description: shot.result || shot.camera || null,
          // What happens, beat by beat: the best brief for whoever makes the shot.
          prompt: beats.length
            ? beats
                .map((beat) => `${briefTime(beat.at)} ${beat.do}`)
                .join("\n")
                .slice(0, 4000)
            : null,
          spec: { ...shot, cue, brief: brief.title },
          duration_seconds: secondsOf(shot),
        };
      }),
    };
  });
  const lengths = brief.shots.map(secondsOf);
  const seconds = Number(lengths.reduce<number>((sum, value) => sum + (value ?? 0), 0).toFixed(3));
  const delivery = brief.delivery ?? {};
  return {
    storyboard: {
      title: brief.title.slice(0, 300),
      objective: brief.idea?.slice(0, 4000) || null,
      creative_direction: {
        source: "brief",
        brief: {
          title: brief.title,
          ...(brief.written ? { written: brief.written } : {}),
          ...(brief.extends ? { extends: brief.extends } : {}),
        },
        ...(brief.delivery ? { delivery: brief.delivery } : {}),
        ...(brief.voiceover ? { voiceover: brief.voiceover } : {}),
        ...(brief.voiceover?.asset_id ? { voiceover_asset_id: brief.voiceover.asset_id } : {}),
      },
      // The shots are the plan: their length, else the delivery's.
      target_duration_seconds:
        Math.round(seconds) ||
        (delivery.seconds !== undefined ? Math.round(delivery.seconds) : null),
      primary_aspect_ratio: delivery.aspect_ratio ?? null,
    },
    scenes,
    shotCount: brief.shots.length,
    seconds,
  };
}

/**
 * Saves a plan as a storyboard, its scenes and its shots, through the
 * browser's client (as the member, under row-level security) or the
 * server's. If any part can't be saved the storyboard is taken out again
 * (its scenes and shots go with it), so a failed import leaves nothing.
 */
export async function saveStoryboardPlan(
  client: SupabaseClient<Database>,
  plan: StoryboardPlan,
  options: { userId: string; projectId: string | null },
): Promise<string> {
  const { data: board, error } = await client
    .from("storyboards")
    .insert({
      ...plan.storyboard,
      creative_direction: plan.storyboard.creative_direction as Json,
      project_id: options.projectId,
      status: "draft",
      created_by: options.userId,
    })
    .select("id")
    .single();
  if (error || !board) throw new Error(error?.message ?? "The storyboard couldn't be saved");
  try {
    const { data: scenes, error: scenesError } = await client
      .from("scenes")
      .insert(
        plan.scenes.map((scene) => ({
          storyboard_id: board.id,
          scene_number: scene.scene_number,
          name: scene.name,
          purpose: scene.purpose,
        })),
      )
      .select("id,scene_number");
    if (scenesError || !scenes)
      throw new Error(scenesError?.message ?? "The scenes couldn't be saved");
    const sceneIds = new Map(scenes.map((scene) => [scene.scene_number, scene.id]));
    const rows = plan.scenes.flatMap((scene) =>
      scene.shots.map((shot) => ({
        scene_id: sceneIds.get(scene.scene_number)!,
        shot_number: shot.shot_number,
        name: shot.name,
        description: shot.description,
        prompt: shot.prompt,
        spec: shot.spec as Json,
        duration_seconds: shot.duration_seconds,
        status: "planned",
      })),
    );
    const { error: shotsError } = await client.from("shots").insert(rows);
    if (shotsError) throw new Error(shotsError.message);
    return board.id;
  } catch (failure) {
    await client.from("storyboards").delete().eq("id", board.id);
    throw failure;
  }
}
