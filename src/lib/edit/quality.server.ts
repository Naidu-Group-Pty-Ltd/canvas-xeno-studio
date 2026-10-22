/**
 * A render's quality report kept on the render (sequence_renders.quality,
 * migration 0031_render_quality), when the media service sent one with it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingTableError } from "./errors";
import { readQualityReport } from "./quality";

/**
 * Records the report the media service measured a finished render with.
 * Repeating it is harmless (the same report). Before the migration there is
 * no column for it, and the report stays in the video's library record; any
 * other failure is thrown, so the worker's report is taken again.
 */
export async function recordRenderQuality(
  renderId: string,
  metadata: Record<string, unknown> | null,
): Promise<void> {
  const report = metadata?.["quality"];
  if (!readQualityReport(report)) return;
  const { error } = await supabaseAdmin
    .from("sequence_renders")
    .update({ quality: report as never })
    .eq("id", renderId);
  if (error && !isMissingTableError(error))
    throw new Error(`Could not record the render's quality report: ${error.message}`);
}
