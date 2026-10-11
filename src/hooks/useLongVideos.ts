import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkLongVideo } from "@/lib/long-video.functions";
import type { Database } from "@/integrations/supabase/types";
import { isMissingTableError } from "@/lib/edit/errors";
import type { AssetRow } from "@/hooks/useStudioData";

export type LongVideoClipRow = Database["public"]["Tables"]["long_video_clips"]["Row"];
export type LongVideoRow = Database["public"]["Tables"]["long_videos"]["Row"] & {
  clips: LongVideoClipRow[];
};

/**
 * Recent long videos with their clips, newest first. Live through the studio's
 * realtime channel; while one is still moving it is also re-read now and then,
 * in case a realtime message is missed. Empty until the database has the tables.
 */
export function useLongVideos(
  options: {
    limit?: number;
    projectId?: string | null;
    /** Only runs whose request key starts with this (e.g. a Supercomputer answer's drafts). */
    requestPrefix?: string | null;
    enabled?: boolean;
  } = {},
) {
  const { limit = 6, projectId, requestPrefix, enabled = true } = options;
  return useQuery({
    queryKey: ["long_videos", limit, projectId ?? null, requestPrefix ?? null],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("long_videos")
        .select("*, long_video_clips(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (projectId) query = query.eq("project_id", projectId);
      if (requestPrefix) query = query.like("client_request_id", `${requestPrefix}%`);
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return [] as LongVideoRow[];
        throw error;
      }
      return (data ?? []).map((row) => {
        const { long_video_clips: clips, ...run } = row as typeof row & {
          long_video_clips: LongVideoClipRow[] | null;
        };
        return {
          ...run,
          clips: [...(clips ?? [])].sort((a, b) => a.position - b.position),
        } as LongVideoRow;
      });
    },
    // A stopped run can still have a clip finishing, so it is re-read until that settles too.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (run) =>
          run.status === "running" ||
          run.clips.some((clip) => clip.status === "generating" || clip.status === "submitting"),
      )
        ? 20_000
        : false,
  });
}

/** The library records of a set of files (a run's clip videos), by id. */
export function useAssetsById(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["assets", "by-id", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .in("id", key)
        .is("deleted_at", null);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as AssetRow[]).map((asset) => [asset.id, asset]));
    },
  });
}

/** A clip that hasn't moved for this long, in a running video, is nudged on in case an event was missed. */
const NUDGE_AFTER_MS = 3 * 60_000;

/** Nudges on any running video that hasn't moved for a while, once per page view. */
export function useNudgeStalledRuns(runs: LongVideoRow[]) {
  const nudged = useRef(new Set<string>());
  useEffect(() => {
    for (const run of runs) {
      if (run.status !== "running" || nudged.current.has(run.id)) continue;
      const latest = Math.max(
        new Date(run.updated_at).getTime(),
        ...run.clips.map((clip) => new Date(clip.updated_at).getTime()),
      );
      if (Date.now() - latest < NUDGE_AFTER_MS) continue;
      nudged.current.add(run.id);
      void checkLongVideo({ data: { longVideoId: run.id } }).catch(() => undefined);
    }
  }, [runs]);
}
