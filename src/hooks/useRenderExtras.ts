import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingTableError } from "@/lib/edit/errors";

/** What migration 0031_render_quality keeps on a render: its quality report and its review sheet's task. */
export interface RenderExtras {
  quality: unknown;
  reviewSheetTaskId: string | null;
}

/**
 * An edit's renders' quality reports and review sheets, by render id. Before
 * migration 0031_render_quality there are none to read (`available` is false):
 * the Render panel then shows each report from the video's library record.
 */
export function useRenderExtras(sequenceId: string | null, renderIds: string[]) {
  const key = renderIds.join(",");
  return useQuery({
    queryKey: ["sequence_renders", sequenceId, "extras", key],
    enabled: !!sequenceId && renderIds.length > 0,
    queryFn: async (): Promise<{ available: boolean; byRender: Map<string, RenderExtras> }> => {
      const { data, error } = await supabase
        .from("sequence_renders")
        .select("id,quality,review_sheet_task_id")
        .in("id", renderIds);
      if (error) {
        if (isMissingTableError(error)) return { available: false, byRender: new Map() };
        throw error;
      }
      return {
        available: true,
        byRender: new Map(
          (data ?? []).map((row) => [
            row.id,
            { quality: row.quality, reviewSheetTaskId: row.review_sheet_task_id },
          ]),
        ),
      };
    },
  });
}
