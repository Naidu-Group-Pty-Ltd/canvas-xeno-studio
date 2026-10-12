import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { suggestFinisher, type FinisherCandidate } from "@/lib/long-video/finisher";

/**
 * Which of a long video's reference images looks like the brand's finisher (a
 * logo, wordmark or end card), going by its name and by what the brief it came
 * from says it is for. Null when none clearly does.
 */
export function useFinisherSuggestion(imageAssetIds: string[]) {
  // In the order attached: a tie goes to the first.
  const ids = [...new Set(imageAssetIds)];
  return useQuery({
    queryKey: ["finisher-suggestion", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: assets } = await supabase
        .from("assets")
        .select("id,title,metadata")
        .in("id", ids)
        .is("deleted_at", null);
      const briefIds = [
        ...new Set(
          (assets ?? []).flatMap((asset) => {
            const briefId = (asset.metadata as Record<string, unknown> | null)?.["brief_id"];
            return typeof briefId === "string" ? [briefId] : [];
          }),
        ),
      ];
      const { data: briefs } = briefIds.length
        ? await supabase.from("creative_briefs").select("id,analysis").in("id", briefIds)
        : { data: [] as { id: string; analysis: unknown }[] };
      const notes = new Map<string, { description?: string; suggested_use?: string }>();
      for (const brief of briefs ?? []) {
        const analysis = (brief.analysis ?? {}) as Record<string, unknown>;
        const imageNotes = Array.isArray(analysis["image_notes"]) ? analysis["image_notes"] : [];
        for (const note of imageNotes as Record<string, unknown>[])
          if (typeof note["asset_id"] === "string")
            notes.set(note["asset_id"], {
              description: typeof note["description"] === "string" ? note["description"] : "",
              suggested_use: typeof note["suggested_use"] === "string" ? note["suggested_use"] : "",
            });
      }
      const candidates: FinisherCandidate[] = ids.flatMap((id) => {
        const asset = (assets ?? []).find((entry) => entry.id === id);
        if (!asset) return [];
        const note = notes.get(id);
        return [
          {
            assetId: id,
            title: asset.title,
            description: note?.description ?? null,
            suggestedUse: note?.suggested_use ?? null,
          },
        ];
      });
      return suggestFinisher(candidates);
    },
  });
}
