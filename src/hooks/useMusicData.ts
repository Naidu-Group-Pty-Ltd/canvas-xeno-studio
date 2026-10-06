import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getMusicStatus } from "@/lib/music.functions";
import type { MusicTrackRow } from "@/lib/music/catalog";

export function useMusicStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["music-status"],
    enabled: !!profile?.is_active,
    queryFn: () => getMusicStatus(),
    staleTime: 5 * 60_000,
  });
}

/** Matches the server: a track "generating" for longer than this was interrupted. */
const STALE_MS = 15 * 60_000;

export function trackInProgress(track: Pick<MusicTrackRow, "status" | "created_at">): boolean {
  return track.status === "generating" && Date.now() - Date.parse(track.created_at) < STALE_MS;
}

export function useMusicTracks(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived ?? false;
  return useQuery({
    queryKey: ["music_tracks", includeArchived],
    queryFn: async () => {
      let query = supabase
        .from("music_tracks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!includeArchived) query = query.eq("is_archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MusicTrackRow[];
    },
    // New AI music and instrumentals appear when they're ready.
    refetchInterval: (query) => (query.state.data?.some(trackInProgress) ? 4000 : false),
  });
}

/** Library tracks behind audio files used in an edit (for credits and beats). */
export function useTracksForAssets(assetIds: string[]) {
  const key = useMemo(() => [...new Set(assetIds)].sort(), [assetIds]);
  return useQuery({
    queryKey: ["music_tracks", "assets", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("music_tracks").select("*").in("asset_id", key);
      if (error) throw error;
      return (data ?? []) as unknown as MusicTrackRow[];
    },
  });
}

/** A short-lived link to play or analyse a library audio file. */
export async function audioUrlFor(assetId: string): Promise<string | null> {
  const { data: asset } = await supabase
    .from("assets")
    .select("storage_bucket,storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return null;
  const { data } = await supabase.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 900);
  return data?.signedUrl ?? null;
}
