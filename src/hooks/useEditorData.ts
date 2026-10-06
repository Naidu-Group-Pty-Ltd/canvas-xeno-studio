import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AssetRow } from "@/hooks/useStudioData";
import type { Timeline } from "@/lib/edit/timeline";
import { isMissingTableError } from "@/lib/edit/errors";
import { renderInProgress } from "@/lib/edit/renders";

export interface SequenceRow {
  id: string;
  title: string;
  project_id: string | null;
  campaign_id: string | null;
  brief_id: string | null;
  storyboard_id: string | null;
  source: Record<string, unknown>;
  timeline: unknown;
  version: number;
  status: "draft" | "rendering" | "rendered" | "failed";
  last_render_id: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderRow {
  id: string;
  sequence_id: string;
  sequence_version: number;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  stage: string | null;
  asset_id: string | null;
  duration_seconds: number | null;
  error_code: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function useSequences(includeArchived = false) {
  return useQuery({
    queryKey: ["sequences", includeArchived],
    queryFn: async () => {
      let query = supabase
        .from("sequences")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!includeArchived) query = query.eq("is_archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as SequenceRow[];
    },
  });
}

export function useSequence(id: string | null) {
  return useQuery({
    queryKey: ["sequences", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SequenceRow | null;
    },
    // Always load fresh when an edit is opened (a cached copy could be behind a
    // newer save); once open, the editor owns its copy and realtime announces
    // teammates' saves.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useSequenceRenders(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence_renders", sequenceId],
    enabled: !!sequenceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sequence_renders")
        .select(
          "id,sequence_id,sequence_version,status,progress,stage,asset_id,duration_seconds,error_code,error_message,created_by,created_at,updated_at,completed_at",
        )
        .eq("sequence_id", sequenceId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as RenderRow[];
    },
    // Realtime carries progress; polling covers a dropped socket while rendering.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((render) => renderInProgress(render)) ? 5000 : false,
  });
}

/** Library rows for the files an edit uses, in one request. */
export function useAssetsByIds(ids: string[]) {
  const key = useMemo(() => [...new Set(ids)].sort(), [ids]);
  return useQuery({
    queryKey: ["assets", "by-ids", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*").in("id", key);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as AssetRow[]).map((asset) => [asset.id, asset]));
    },
    staleTime: 60_000,
  });
}

export interface SignedMedia {
  url: string;
  posterUrl: string | null;
}

/**
 * Short-lived playback URLs for a set of library files, signed in batches per
 * bucket. Refreshed well before they expire.
 */
export function useSignedMedia(assets: AssetRow[]) {
  const key = useMemo(
    () =>
      assets
        .map((asset) => `${asset.id}:${asset.storage_bucket}:${asset.storage_path}`)
        .sort()
        .join("|"),
    [assets],
  );
  return useQuery({
    queryKey: ["signed-media", key],
    enabled: assets.length > 0,
    staleTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    queryFn: async () => {
      const byBucket = new Map<string, string[]>();
      const add = (bucket: string, path: string) => {
        const list = byBucket.get(bucket) ?? [];
        if (!list.includes(path)) list.push(path);
        byBucket.set(bucket, list);
      };
      for (const asset of assets) {
        add(asset.storage_bucket, asset.storage_path);
        const poster = asset.metadata?.["poster_path"];
        if (typeof poster === "string") add(asset.storage_bucket, poster);
      }
      const signed = new Map<string, string>();
      for (const [bucket, paths] of byBucket) {
        for (let index = 0; index < paths.length; index += 100) {
          const { data } = await supabase.storage
            .from(bucket)
            .createSignedUrls(paths.slice(index, index + 100), 3600);
          for (const entry of data ?? []) {
            if (entry.signedUrl && entry.path)
              signed.set(`${bucket}/${entry.path}`, entry.signedUrl);
          }
        }
      }
      const media = new Map<string, SignedMedia>();
      for (const asset of assets) {
        const url = signed.get(`${asset.storage_bucket}/${asset.storage_path}`);
        if (!url) continue;
        const poster = asset.metadata?.["poster_path"];
        media.set(asset.id, {
          url,
          posterUrl:
            typeof poster === "string"
              ? (signed.get(`${asset.storage_bucket}/${poster}`) ?? null)
              : null,
        });
      }
      return media;
    },
  });
}

/** Live render progress and teammates' saves for one edit. */
export function useEditorRealtime(
  sequenceId: string | null,
  onRemoteSave: (row: SequenceRow) => void,
) {
  const queryClient = useQueryClient();
  // The latest handler is read at event time, so the channel isn't re-opened when it changes.
  const handler = useRef(onRemoteSave);
  handler.current = onRemoteSave;
  useEffect(() => {
    if (!sequenceId) return;
    const channel = supabase
      .channel(`editor-${sequenceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sequence_renders",
          filter: `sequence_id=eq.${sequenceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sequence_renders", sequenceId] });
          queryClient.invalidateQueries({ queryKey: ["sequences"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sequences", filter: `id=eq.${sequenceId}` },
        (change) => {
          if (change.new) handler.current(change.new as unknown as SequenceRow);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sequenceId, queryClient]);
}

/** Creates an edit and returns its id. Edits are team records, owned by their creator. */
export async function createSequence(input: {
  userId: string;
  title: string;
  timeline: Timeline;
  projectId?: string | null;
  campaignId?: string | null;
  briefId?: string | null;
  storyboardId?: string | null;
  source?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await supabase
    .from("sequences")
    .insert({
      title: input.title.slice(0, 200) || "Untitled edit",
      timeline: input.timeline as never,
      project_id: input.projectId ?? null,
      campaign_id: input.campaignId ?? null,
      brief_id: input.briefId ?? null,
      storyboard_id: input.storyboardId ?? null,
      source: (input.source ?? {}) as never,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTableError(error)) {
      throw new Error(
        "The Editor needs a database update (migration 0004_edit_suite). Ask an admin to apply it.",
      );
    }
    throw new Error(error?.message ?? "The edit could not be created");
  }
  return data.id;
}
