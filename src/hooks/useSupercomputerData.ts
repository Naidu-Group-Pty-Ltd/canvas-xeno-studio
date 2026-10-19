import { useEffect, useMemo, useRef } from "react";
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
  /** Once the agent's update (migration 0022) is in. */
  pinned?: boolean;
  settings?: unknown;
}

export const THREAD_COLUMNS =
  "id,title,project_id,campaign_id,brief_id,created_by,last_message_at,created_at";

/** Conversations, newest first; pinned ones first of all once pins exist (migration 0022). */
export function useThreads(scope: "mine" | "team", enabled = true, withPins = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supercomputer_threads", scope, user?.id ?? null, withPins],
    enabled: enabled && !!user,
    queryFn: async () => {
      let query = supabase
        .from("supercomputer_threads")
        .select(withPins ? `${THREAD_COLUMNS},pinned` : THREAD_COLUMNS)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false })
        .limit(80);
      if (scope === "mine" && user) query = query.eq("created_by", user.id);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ThreadRow[];
      return withPins ? [...rows].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)) : rows;
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
  /** streaming, awaiting_approval and stopped: the agent's answers (migration 0022). */
  status: "complete" | "failed" | "streaming" | "awaiting_approval" | "stopped";
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string | null;
  /** An edited or redone message's place was taken: it is no longer part of the conversation. */
  superseded_at?: string | null;
}

/**
 * What the page reads of a message once the agent's update is in: everything
 * it shows, but not the transcript each answer keeps for Claude (tool results
 * and search pages can be large), which stays on the server.
 */
const AGENT_MESSAGE_COLUMNS = [
  "id",
  "thread_id",
  "role",
  "content",
  "attachments",
  "model",
  "status",
  "error_message",
  "created_by",
  "created_at",
  "updated_at",
  "superseded_at",
  "intent:payload->intent",
  "ideas:payload->ideas",
  "drafts:payload->drafts",
  "editPlan:payload->editPlan",
  "questions:payload->questions",
  "suggestions:payload->suggestions",
  "dropped:payload->dropped",
  "backend:payload->backend",
  "display:payload->agent->display",
].join(",");

const PAYLOAD_KEYS = [
  "intent",
  "ideas",
  "drafts",
  "editPlan",
  "questions",
  "suggestions",
  "dropped",
  "backend",
] as const;

/** A message read with the agent's columns, put back in the shape the page uses. */
function agentMessage(row: Record<string, unknown>): MessageRow {
  const payload: Record<string, unknown> = {};
  for (const key of PAYLOAD_KEYS) if (row[key] != null) payload[key] = row[key];
  if (row["display"] != null) payload["agent"] = { display: row["display"] };
  const message = { ...row, payload } as Record<string, unknown>;
  for (const key of [...PAYLOAD_KEYS, "display"]) delete message[key];
  return message as unknown as MessageRow;
}

/**
 * A conversation's messages, oldest first. With the agent's update in, the
 * ones an edit or a redo replaced are left out.
 */
export function useThreadMessages(threadId: string | null, agentColumns = false) {
  return useQuery({
    queryKey: ["supercomputer_messages", threadId, agentColumns],
    enabled: !!threadId,
    queryFn: async () => {
      if (agentColumns) {
        const { data, error } = await supabase
          .from("supercomputer_messages")
          .select(AGENT_MESSAGE_COLUMNS)
          .eq("thread_id", threadId!)
          .is("superseded_at", null)
          .order("created_at", { ascending: true })
          .limit(300);
        if (error) throw error;
        return ((data ?? []) as unknown as Record<string, unknown>[]).map(agentMessage);
      }
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

/**
 * Live updates for the open conversation and for briefs being analysed. The
 * conversation this page is streaming an answer into (`quietThreadId`) isn't
 * read again on every save: the page shows the answer as it comes and reads
 * the conversation once it ends.
 */
export function useSupercomputerRealtime(
  threadId: string | null,
  enabled: boolean,
  quietThreadId: string | null = null,
) {
  const queryClient = useQueryClient();
  const quiet = useRef(quietThreadId);
  quiet.current = quietThreadId;
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`supercomputer-${threadId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supercomputer_messages" },
        (change) => {
          const row = ((change.new && Object.keys(change.new).length ? change.new : change.old) ??
            null) as { thread_id?: string; status?: string } | null;
          if (row?.thread_id && row.thread_id !== quiet.current)
            queryClient.invalidateQueries({ queryKey: ["supercomputer_messages", row.thread_id] });
          // An answer being written saves every few seconds; the list only changes when one is added or ends.
          if (change.eventType !== "UPDATE" || row?.status !== "streaming")
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
