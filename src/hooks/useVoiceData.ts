import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getVoiceStatus, resolveBrandVoice } from "@/lib/voice.functions";
import type { BrandVoiceRow } from "@/lib/voice/catalog";

export function useVoiceStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["voice-status"],
    enabled: !!profile?.is_active,
    queryFn: () => getVoiceStatus(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Brand voices. Pickers pass the project the work belongs to (null for work
 * outside any project) and get only the voices that may speak for it: those
 * for any project plus that project's own. Leaving it out lists every voice.
 */
export function useBrandVoices({
  includeArchived = false,
  projectId,
}: { includeArchived?: boolean; projectId?: string | null } = {}) {
  return useQuery({
    queryKey: ["brand_voices", includeArchived, projectId === undefined ? "all" : projectId],
    queryFn: async () => {
      let query = supabase
        .from("brand_voices")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (!includeArchived) query = query.eq("is_archived", false);
      if (projectId === null) query = query.is("project_id", null);
      else if (projectId) query = query.or(`project_id.is.null,project_id.eq.${projectId}`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as BrandVoiceRow[];
    },
  });
}

export interface VoiceoverRow {
  id: string;
  voice_id: string | null;
  script: string;
  status: "pending" | "generating" | "completed" | "failed" | "submission_uncertain";
  asset_id: string | null;
  duration_seconds: number | null;
  alignment: { words?: { text: string; start: number; end: number }[] } | null;
  error_message: string | null;
  created_at: string;
}

/** The brand voice that speaks for a campaign or project when nobody picks one. */
export function useResolvedVoice(scope: { campaignId: string | null; projectId: string | null }) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["brand-voice-for", scope.campaignId, scope.projectId],
    enabled: !!profile?.is_active,
    queryFn: () => resolveBrandVoice({ data: scope }),
    staleTime: 30_000,
  });
}

/** Matches the server's STALE_VOICEOVER_MS: a take "generating" for longer was interrupted. */
const STALE_TAKE_MS = 5 * 60_000;

export function takeInProgress(take: Pick<VoiceoverRow, "status" | "created_at">): boolean {
  return (
    (take.status === "generating" || take.status === "pending") &&
    Date.now() - Date.parse(take.created_at) < STALE_TAKE_MS
  );
}

export function useVoiceovers(sequenceId: string | null) {
  const queryClient = useQueryClient();
  // A take started or finished anywhere (here or by a teammate) is fetched as
  // it changes; a slow poll covers a moment the live connection is down.
  useEffect(() => {
    if (!sequenceId) return;
    const channel = supabase
      .channel(`voiceovers-${sequenceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voiceovers",
          filter: `sequence_id=eq.${sequenceId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["voiceovers", sequenceId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sequenceId, queryClient]);
  return useQuery({
    queryKey: ["voiceovers", sequenceId],
    enabled: !!sequenceId,
    refetchInterval: (query) =>
      query.state.data?.some((take) => takeInProgress(take)) ? 4000 : 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voiceovers")
        .select(
          "id,voice_id,script,status,asset_id,duration_seconds,alignment,error_message,created_at",
        )
        .eq("sequence_id", sequenceId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as VoiceoverRow[];
    },
  });
}

/** Plays base64 audio returned by a preview, one at a time. */
let current: HTMLAudioElement | null = null;
export function playBase64(audioBase64: string, mime: string): HTMLAudioElement {
  current?.pause();
  const element = new Audio(`data:${mime};base64,${audioBase64}`);
  current = element;
  void element.play().catch(() => undefined);
  return element;
}

export function playUrl(url: string): HTMLAudioElement {
  current?.pause();
  const element = new Audio(url);
  current = element;
  void element.play().catch(() => undefined);
  return element;
}

export function stopPlayback() {
  current?.pause();
  current = null;
}
