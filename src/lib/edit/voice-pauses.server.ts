/**
 * The server's side of voiceover pauses: a voiceover's measured silences,
 * looked up from its preparation (the media service's measurement of where
 * it speaks, src/lib/lip-sync/prepare.server), and an edit's pauses held to
 * them. An edit sent through the API has its pauses snapped into the nearest
 * silence or refused (see ./voice-pauses); a render is refused while a pause
 * sits where someone speaks, or the voiceover hasn't been measured.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { readAnalysis, readWords } from "../lip-sync/analysis";
import {
  preparationById,
  preparationForAsset,
  preparedFileOf,
  type PreparationRow,
} from "../lip-sync/prepare.server";
import type { TimedWord } from "../lip-sync/segments";
import { isMissingTableError } from "./errors";
import { audibleAudio, itemPauses, type Timeline } from "./timeline";
import {
  measuredVoice,
  pauseProblem,
  refusalMessage,
  settlePauses,
  type MeasuredVoice,
} from "./voice-pauses";

export type VoiceMeasurement =
  { status: "ready"; voice: MeasuredVoice } | { status: "preparing" | "unmeasured" };

/** The preparation that measured a voiceover file: its own, or the one that made it. */
async function preparationOf(assetId: string): Promise<PreparationRow | null> {
  const own = await preparationForAsset(assetId);
  if (own) return own;
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("metadata")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new AppError("UNKNOWN", "The voiceover couldn't be looked up. Try again.");
  const made = preparedFileOf(data?.metadata ?? null);
  return made ? preparationById(made.preparation_id) : null;
}

/** Word times for a voiceover the preparation has none for: a studio take's own. */
async function takeWords(assetIds: string[]): Promise<TimedWord[]> {
  const { data, error } = await supabaseAdmin
    .from("voiceovers")
    .select("alignment")
    .in("asset_id", assetIds)
    .eq("status", "completed")
    .limit(1);
  if (error) return [];
  const alignment = (data?.[0]?.alignment ?? null) as { words?: unknown } | null;
  return readWords(alignment?.words);
}

/** Where a voiceover file's silences are, if it has been measured. */
export async function voiceMeasurement(assetId: string): Promise<VoiceMeasurement> {
  let row: PreparationRow | null;
  try {
    row = await preparationOf(assetId);
  } catch (error) {
    // Before lip sync's database update nothing has been measured.
    if (isMissingTableError(error)) return { status: "unmeasured" };
    throw error;
  }
  if (!row) return { status: "unmeasured" };
  if (row.status === "preparing") return { status: "preparing" };
  const analysis = row.status === "ready" ? readAnalysis(row.analysis) : null;
  if (!analysis) return { status: "unmeasured" };
  const words = readWords(row.words);
  return {
    status: "ready",
    voice: measuredVoice({
      duration: analysis.samples / analysis.sample_rate,
      speech: analysis.speech,
      clear: analysis.clear_pauses,
      words: words.length
        ? words
        : await takeWords(
            [...new Set([assetId, row.source_asset_id, row.prepared_asset_id])].filter(
              (id): id is string => !!id,
            ),
          ),
    }),
  };
}

/**
 * An edit's voiceover pauses held to the voices' silences, as the API takes
 * them: a pause just off a silence is moved into it, one nowhere near a
 * silence is refused (an AppError saying where and why). A voiceover not yet
 * measured keeps its pauses as sent, in `unchecked`: it can't be rendered
 * until it is measured.
 */
export async function settleVoicePauses(
  timeline: Timeline,
): Promise<{ timeline: Timeline; snapped: number; unchecked: string[] }> {
  let snapped = 0;
  const unchecked: string[] = [];
  const audio = [];
  for (const item of timeline.audio) {
    if (item.role !== "voiceover" || !item.pauses.length) {
      audio.push(item);
      continue;
    }
    const measurement = await voiceMeasurement(item.assetId);
    if (measurement.status !== "ready") {
      unchecked.push(item.id);
      audio.push(item);
      continue;
    }
    const settled = settlePauses(item.pauses, measurement.voice);
    if (settled.refused.length)
      throw new AppError(
        "INVALID_PARAMETERS",
        refusalMessage(settled.refused, item.label ?? "Voiceover"),
      );
    snapped += settled.snapped;
    audio.push({ ...item, pauses: settled.pauses });
  }
  return { timeline: { ...timeline, audio }, snapped, unchecked };
}

/**
 * Whether an edit's voiceover pauses can be rendered: each heard voiceover
 * held open by pauses has been measured, and every one of its pauses sits in
 * one of its silences. Throws, in words a person can act on, when not.
 */
export async function assertPausesRenderable(
  timeline: Timeline,
  titleOf: (assetId: string) => string | null,
): Promise<void> {
  for (const item of audibleAudio(timeline)) {
    const pauses = itemPauses(item);
    if (!pauses.length) continue;
    const title = titleOf(item.assetId) ?? item.label ?? "Voiceover";
    const measurement = await voiceMeasurement(item.assetId);
    if (measurement.status === "preparing")
      throw new AppError(
        "INVALID_PARAMETERS",
        `The voiceover “${title}” is still having its silences measured. Render again in a moment.`,
      );
    if (measurement.status !== "ready")
      throw new AppError(
        "INVALID_PARAMETERS",
        `The voiceover “${title}” is held open with pauses, but its silences haven't been measured. Select it in the Editor and measure them under Pauses, then render again.`,
      );
    const refused = pauses
      .map((pause) => ({ at: pause.at, reason: pauseProblem(pause.at, measurement.voice) }))
      .filter((entry): entry is { at: number; reason: string } => entry.reason !== null);
    if (refused.length) throw new AppError("INVALID_PARAMETERS", refusalMessage(refused, title));
  }
}
