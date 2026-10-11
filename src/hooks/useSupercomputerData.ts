import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSupercomputerStatus } from "@/lib/supercomputer.functions";
import type { AssetRow, GenerationRow } from "@/hooks/useStudioData";
import { useLongVideos, type LongVideoRow } from "@/hooks/useLongVideos";
import type {
  BriefAnalysis,
  MessageAttachment,
  SupercomputerPayload,
} from "@/lib/supercomputer/types";
import { draftIndexFromKey, draftRunPrefix } from "@/lib/supercomputer/types";

/** Reasoning backend + whether the Supercomputer tables are installed. */
export function useSupercomputerStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["supercomputer-status"],
    enabled: !!profile?.is_active,
    queryFn: () => getSupercomputerStatus(),
    staleTime: 60_000,
  });
}

export interface ThreadRow {
  id: string;
  title: string;
  project_id: string | null;
  campaign_id: string | null;
  brief_id: string | null;
  created_by: string | null;
  last_message_at: string;
  created_at: string;
}

export function useThreads(scope: "mine" | "team", enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supercomputer_threads", scope, user?.id ?? null],
    enabled: enabled && !!user,
    queryFn: async () => {
      let query = supabase
        .from("supercomputer_threads")
        .select("id,title,project_id,campaign_id,brief_id,created_by,last_message_at,created_at")
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false })
        .limit(80);
      if (scope === "mine" && user) query = query.eq("created_by", user.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ThreadRow[];
    },
  });
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  attachments: MessageAttachment[];
  payload: SupercomputerPayload;
  model: string | null;
  status: "complete" | "failed";
  error_message: string | null;
  created_by: string | null;
  created_at: string;
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["supercomputer_messages", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supercomputer_messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as MessageRow[];
    },
  });
}

export interface BriefRow {
  id: string;
  title: string;
  status: "draft" | "analysing" | "ready" | "failed";
  error_message: string | null;
  project_id: string | null;
  campaign_id: string | null;
  source_filename: string | null;
  source_bucket: string | null;
  source_path: string | null;
  page_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const BRIEF_LIST_COLUMNS =
  "id,title,status,error_message,project_id,campaign_id,source_filename,source_bucket,source_path,page_count,created_by,created_at,updated_at";

export function useBriefs(enabled = true) {
  return useQuery({
    queryKey: ["creative_briefs"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_briefs")
        .select(BRIEF_LIST_COLUMNS)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as BriefRow[];
    },
  });
}

export interface BriefDetail extends BriefRow {
  analysis: BriefAnalysis;
  extracted_text: string;
}

export function useBrief(briefId: string | null) {
  return useQuery({
    queryKey: ["creative_briefs", "detail", briefId],
    enabled: !!briefId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_briefs")
        .select(`${BRIEF_LIST_COLUMNS},analysis,extracted_text`)
        .eq("id", briefId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BriefDetail | null;
    },
    // Analysis runs server-side; keep the panel fresh while it is in progress.
    refetchInterval: (query) => (query.state.data?.status === "analysing" ? 4000 : false),
  });
}

export interface BriefAssetRow {
  position: number;
  source: "embedded" | "page" | "attached";
  caption: string | null;
  page_number: number | null;
  asset: AssetRow;
}

export function useBriefAssets(briefId: string | null) {
  return useQuery({
    queryKey: ["creative_brief_assets", briefId],
    enabled: !!briefId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_brief_assets")
        .select("position,source,caption,page_number,asset:assets(*)")
        .eq("brief_id", briefId!)
        .order("position");
      if (error) throw error;
      return ((data ?? []) as unknown as BriefAssetRow[]).filter(
        (row) => row.asset && !(row.asset as AssetRow & { deleted_at?: string | null }).deleted_at,
      );
    },
  });
}

/**
 * Generations launched from one assistant message, grouped by draft index.
 * Keyed under "generations"/"assets" so studio realtime keeps them current.
 */
export function useDraftRuns(messageId: string, enabled: boolean) {
  const runs = useQuery({
    queryKey: ["generations", "supercomputer-runs", messageId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generations")
        .select("*")
        .like("client_request_id", `${draftRunPrefix(messageId)}%`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as (GenerationRow & { client_request_id: string | null })[];
    },
  });
  const ids = (runs.data ?? []).map((run) => run.id);
  const outputs = useQuery({
    queryKey: ["assets", "by-generation", ids],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .in("generation_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AssetRow[];
    },
  });

  const byDraft = new Map<number, { generation: GenerationRow; assets: AssetRow[] }[]>();
  for (const run of runs.data ?? []) {
    const index = draftIndexFromKey(run.client_request_id, messageId);
    if (index === null) continue;
    const list = byDraft.get(index) ?? [];
    list.push({
      generation: run,
      assets: (outputs.data ?? []).filter((asset) => asset.generation_id === run.id),
    });
    byDraft.set(index, list);
  }
  return { byDraft, isLoading: runs.isLoading };
}

/** Long videos started from an answer's drafts, by draft, oldest first. */
export function useDraftLongVideos(messageId: string, enabled: boolean) {
  const { data: runs } = useLongVideos({
    requestPrefix: draftRunPrefix(messageId),
    limit: 200,
    enabled,
  });
  const byDraft = useMemo(() => {
    const map = new Map<number, LongVideoRow[]>();
    for (const run of [...(runs ?? [])].reverse()) {
      const index = draftIndexFromKey(run.client_request_id, messageId);
      if (index === null) continue;
      map.set(index, [...(map.get(index) ?? []), run]);
    }
    return map;
  }, [runs, messageId]);
  return { byDraft };
}

/** Live updates for the open conversation and for briefs being analysed. */
export function useSupercomputerRealtime(threadId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`supercomputer-${threadId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supercomputer_messages" },
        (change) => {
          const row = (change.new ?? change.old) as { thread_id?: string } | null;
          if (row?.thread_id)
            queryClient.invalidateQueries({ queryKey: ["supercomputer_messages", row.thread_id] });
          queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "creative_briefs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["creative_briefs"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, enabled, queryClient]);
}
