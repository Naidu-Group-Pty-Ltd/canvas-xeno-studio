import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AssetRow } from "@/hooks/useStudioData";

/**
 * Generations found by what their request keys start with (a character's
 * training packs, a Soul ID's likeness proofs, a view's takes), newest first,
 * each with the images it made once they're in the library. Asked again every
 * few seconds while any is still being made.
 */
export interface KeyedGeneration {
  generationId: string;
  key: string;
  status: string;
  /** Whether its saving to the library has ended (completed or given up). */
  ingested: "pending" | "completed" | "failed";
  /** Its images in the library (a batch makes several). */
  assets: AssetRow[];
  createdAt: string;
  errorMessage: string | null;
}

/** Generation states after which nothing more comes (an unclear one is a person's to check). */
const ENDED = new Set(["failed", "nsfw", "canceled", "submission_uncertain"]);

/** Still on its way: being made, or made and being saved. */
export function stillComing(entry: KeyedGeneration): boolean {
  if (entry.assets.length || ENDED.has(entry.status)) return false;
  return !(entry.status === "completed" && entry.ingested !== "pending");
}

/** It ended without an image (failed, refused, or unclear). */
export function endedEmpty(entry: KeyedGeneration): boolean {
  return !entry.assets.length && ENDED.has(entry.status);
}

export function useKeyedGenerations(
  queryKey: readonly unknown[],
  prefix: string,
  options: { limit?: number; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey,
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<KeyedGeneration[]> => {
      const { data: generations, error } = await supabase
        .from("generations")
        .select("id,status,ingest_status,error_code,error_message,client_request_id,created_at")
        .like("client_request_id", `${prefix}%`)
        .order("created_at", { ascending: false })
        .limit(options.limit ?? 48);
      if (error) throw error;
      const ids = (generations ?? []).map((row) => row.id);
      const { data: assets, error: assetsError } = ids.length
        ? await supabase.from("assets").select("*").in("generation_id", ids).is("deleted_at", null)
        : { data: [], error: null };
      if (assetsError) throw assetsError;
      return (generations ?? []).map((row) => ({
        generationId: row.id,
        key: row.client_request_id ?? "",
        status: row.status,
        ingested:
          row.ingest_status === "completed"
            ? "completed"
            : row.ingest_status === "failed" && row.error_code === "INGEST_RETRIES_EXHAUSTED"
              ? "failed"
              : "pending",
        assets: ((assets ?? []) as unknown as AssetRow[]).filter(
          (asset) => asset.generation_id === row.id && asset.asset_type === "image",
        ),
        createdAt: row.created_at,
        errorMessage: row.error_message ?? null,
      }));
    },
    refetchInterval: (query) => ((query.state.data ?? []).some(stillComing) ? 8_000 : false),
  });
}
