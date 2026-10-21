import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingTableError } from "@/lib/edit/errors";
import { proposalOf, signalsOf, type BrandProposal, type ScanSignals } from "@/lib/brand/proposal";
import { codeSystemOf, type CodeDesignSystem } from "@/lib/brand/scan-code";

export interface BrandImport {
  id: string;
  kind: "url" | "document" | "repos";
  sourceUrl: string | null;
  sourceTitle: string | null;
  status: "scanning" | "ready" | "applied" | "failed";
  stage: string | null;
  error: string | null;
  signals: ScanSignals;
  proposal: BrandProposal | null;
  /** What a code import read (its tokens with where each is declared): only on one import read alone. */
  code: CodeDesignSystem | null;
  brandKitId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const LIST_COLUMNS =
  "id,kind,source_url,source_title,status,stage,error,signals,proposal,staged,brand_kit_id,created_by,created_at,updated_at";

/** A scan that hasn't moved in this long was cut off (the page that started it was closed). */
const STALE_MS = 10 * 60_000;

function importOf(row: Record<string, unknown>): BrandImport {
  const status = String(row["status"]);
  const updatedAt = String(row["updated_at"] ?? "");
  const stale = status === "scanning" && Date.now() - Date.parse(updatedAt) > STALE_MS;
  return {
    id: String(row["id"]),
    kind: row["kind"] === "document" || row["kind"] === "repos" ? row["kind"] : "url",
    sourceUrl: typeof row["source_url"] === "string" ? row["source_url"] : null,
    sourceTitle: typeof row["source_title"] === "string" ? row["source_title"] : null,
    status: stale
      ? "failed"
      : status === "ready" || status === "applied" || status === "failed"
        ? status
        : "scanning",
    stage: stale ? null : typeof row["stage"] === "string" ? row["stage"] : null,
    error: stale
      ? "The scan was cut off before it finished. Start it again."
      : typeof row["error"] === "string"
        ? row["error"]
        : null,
    signals: signalsOf(row["signals"]),
    proposal: proposalOf(row["proposal"]),
    code: codeSystemOf(row["code"]),
    brandKitId: typeof row["brand_kit_id"] === "string" ? row["brand_kit_id"] : null,
    createdBy: typeof row["created_by"] === "string" ? row["created_by"] : null,
    createdAt: String(row["created_at"] ?? ""),
    updatedAt,
  };
}

/** One import, followed every second and a half while it is still scanning. */
export function useBrandImport(importId: string | null) {
  return useQuery({
    queryKey: ["brand_import", importId],
    enabled: !!importId,
    queryFn: async (): Promise<BrandImport | null> => {
      const { data, error } = await supabase
        .from("brand_imports")
        .select("*")
        .eq("id", importId!)
        .maybeSingle();
      if (error) throw error;
      return data ? importOf(data as Record<string, unknown>) : null;
    },
    refetchInterval: (query) => (query.state.data?.status === "scanning" ? 1500 : false),
  });
}

/**
 * Recent imports, newest first. `supported` is false before the database
 * has them (migration 0021).
 */
export function useBrandImports() {
  return useQuery({
    queryKey: ["brand_imports"],
    staleTime: 15_000,
    queryFn: async (): Promise<{ supported: boolean; imports: BrandImport[] }> => {
      // Everything but a code import's tokens, which only its review reads.
      const { data, error } = await supabase
        .from("brand_imports")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (isMissingTableError(error)) return { supported: false, imports: [] };
        throw error;
      }
      return {
        supported: true,
        imports: (data ?? []).map((row) => importOf(row as Record<string, unknown>)),
      };
    },
  });
}
