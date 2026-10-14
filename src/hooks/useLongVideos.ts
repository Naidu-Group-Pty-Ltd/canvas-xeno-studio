import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkLongVideo } from "@/lib/long-video.functions";
import type { Database } from "@/integrations/supabase/types";
import { isMissingTableError } from "@/lib/edit/errors";
import type { AssetRow } from "@/hooks/useStudioData";

export type LongVideoClipRow = Database["public"]["Tables"]["long_video_clips"]["Row"];
export type LongVideoKeyframeRow = Database["public"]["Tables"]["long_video_keyframes"]["Row"];
export type LongVideoRow = Database["public"]["Tables"]["long_videos"]["Row"] & {
  clips: LongVideoClipRow[];
  /** Its keyframes in order (none unless it paints them first). */
  keyframes: LongVideoKeyframeRow[];
};

/** Keyframe states still on their way. */
const KEYFRAME_ACTIVE = new Set(["submitting", "generating", "sizing"]);

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
      // Keyframes asked for apart: a database without them yet must not blank the runs.
      const keyframed = (data ?? [])
        .filter((row) => !!(row as { keyframe_model_id?: string | null }).keyframe_model_id)
        .map((row) => row.id);
      const { data: keyframes } = keyframed.length
        ? await supabase
            .from("long_video_keyframes")
            .select("*")
            .in("long_video_id", keyframed)
            .order("position")
        : { data: [] as LongVideoKeyframeRow[] };
      return (data ?? []).map((row) => {
        const { long_video_clips: clips, ...run } = row as typeof row & {
          long_video_clips: LongVideoClipRow[] | null;
        };
        return {
          ...run,
          clips: [...(clips ?? [])].sort((a, b) => a.position - b.position),
          keyframes: (keyframes ?? []).filter((keyframe) => keyframe.long_video_id === run.id),
        } as LongVideoRow;
      });
    },
    // A stopped run can still have a clip finishing, so it is re-read until that settles too.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (run) =>
          run.status === "running" ||
          run.clips.some((clip) => clip.status === "generating" || clip.status === "submitting") ||
          run.keyframes.some((keyframe) => KEYFRAME_ACTIVE.has(keyframe.status)),
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

/**
 * A running video that hasn't moved for this long is nudged on, in case an
 * event was missed or a step was cut short (a check by the AI that ran out
 * of time); then at most this often while it still hasn't moved.
 */
const NUDGE_AFTER_MS = 75_000;
const NUDGE_EVERY_MS = 2 * 60_000;

/** Nudges on any running video that hasn't moved for a while, now and then while it's shown. */
export function useNudgeStalledRuns(runs: LongVideoRow[]) {
  const nudged = useRef(new Map<string, number>());
  const latestRuns = useRef(runs);
  latestRuns.current = runs;
  useEffect(() => {
    const look = () => {
      for (const run of latestRuns.current) {
        if (run.status !== "running") continue;
        const latest = Math.max(
          new Date(run.updated_at).getTime(),
          ...run.clips.map((clip) => new Date(clip.updated_at).getTime()),
          ...run.keyframes.map((keyframe) => new Date(keyframe.updated_at).getTime()),
        );
        const last = nudged.current.get(run.id) ?? 0;
        if (Date.now() - latest < NUDGE_AFTER_MS || Date.now() - last < NUDGE_EVERY_MS) continue;
        nudged.current.set(run.id, Date.now());
        void checkLongVideo({ data: { longVideoId: run.id } }).catch(() => undefined);
      }
    };
    look();
    const timer = window.setInterval(look, 30_000);
    return () => window.clearInterval(timer);
  }, []);
}
