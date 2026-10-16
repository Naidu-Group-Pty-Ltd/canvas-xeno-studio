/**
 * The Supercomputer's edit plan, handed to Katana to cut: the plan's clips as
 * the footage (Katana edits up to three at once), its stills as images, the
 * plan written out as the edit brief, and the drafts' characters as the cast.
 * Pure.
 */
import { bestOutput, type CompileRun } from "../edit/compile";
import { KATANA_CHARACTERS_MAX } from "../katana/cast";
import { KATANA_SLOTS, editBrief, type KatanaSend } from "../katana/handoff";
import type { SupercomputerDraft, SupercomputerEditPlan } from "./types";

export interface PlanForKatana {
  send: KatanaSend | null;
  /** Why it can't go yet. */
  reason: string | null;
  clips: number;
}

export function katanaFromPlan(
  drafts: SupercomputerDraft[],
  runs: Map<number, CompileRun[]>,
  plan: SupercomputerEditPlan,
  context: { projectId: string | null },
): PlanForKatana {
  const order = plan.shots.length
    ? plan.shots
    : drafts.map((_, index) => ({ draftIndex: index }) as SupercomputerEditPlan["shots"][number]);
  const clips: { assetId: string; title: string; shot: SupercomputerEditPlan["shots"][number] }[] =
    [];
  const stills: { assetId: string; title: string }[] = [];
  for (const shot of order) {
    const draft = drafts[shot.draftIndex];
    // A long video goes to Katana from its own card (its clips, or its render).
    if (!draft || draft.longVideo || draft.outputType === "audio") continue;
    const output = bestOutput(runs.get(shot.draftIndex));
    if (!output) continue;
    if (output.asset_type === "video") {
      if (!clips.some((clip) => clip.assetId === output.id))
        clips.push({ assetId: output.id, title: draft.title, shot });
    } else if (
      output.asset_type === "image" &&
      !stills.some((still) => still.assetId === output.id)
    ) {
      stills.push({ assetId: output.id, title: draft.title });
    }
  }
  const max = KATANA_SLOTS.footage.max;
  if (!clips.length) {
    return {
      send: null,
      reason: stills.length
        ? "Katana edits video clips: generate at least one of the plan's video shots first"
        : "Generate the plan's shots first",
      clips: 0,
    };
  }
  if (clips.length > max) {
    return {
      send: null,
      reason: `Katana edits up to ${max} clips at once, and this plan has ${clips.length}: compile it into a video, render it in the Editor and send that render to Katana`,
      clips: clips.length,
    };
  }
  const characters = new Map<string, { id: string; name: string }>();
  for (const shot of order) {
    for (const character of drafts[shot.draftIndex]?.characters ?? []) {
      if (!characters.has(character.id)) characters.set(character.id, character);
    }
  }
  const brief = editBrief({
    title: plan.title ?? null,
    aspectRatio: plan.aspectRatio ?? null,
    shots: clips.map((clip) => ({
      title: clip.title,
      seconds: clip.shot.seconds ?? null,
      note: clip.shot.note ?? null,
      transition: clip.shot.transition ?? null,
    })),
    stills: stills.map((still) => still.title),
    voiceover: plan.voiceoverScript ?? null,
    music: plan.musicDirection ?? null,
    captions: plan.captions ?? null,
    openingTitle: plan.openingTitle ?? null,
    closingCta: plan.closingCta ?? null,
  });
  return {
    send: {
      mode: "edit",
      files: [
        ...clips.map((clip) => ({
          assetId: clip.assetId,
          slot: "footage" as const,
          title: clip.title,
        })),
        ...stills.slice(0, KATANA_SLOTS.images.max).map((still) => ({
          assetId: still.assetId,
          slot: "images" as const,
          title: still.title,
        })),
      ],
      characters: [...characters.values()].slice(0, KATANA_CHARACTERS_MAX),
      brief,
      title: plan.title ?? drafts[0]?.purpose ?? null,
      projectId: context.projectId,
    },
    reason: null,
    clips: clips.length,
  };
}
