import { useMemo } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

/** Tracks fetched at a time; "Show more" fetches the next page. */
export const MUSIC_PAGE = 100;

/** Where a page of the library starts: after this track (none for the first page). */
type MusicPageStart = { createdAt: string; id: string } | null;

/**
 * The library, newest first, searched and paged by the database
 * (search_music_tracks): every track stays reachable however large the
 * library grows. Each word of `search` must appear in the title, artist,
 * licence, genres, moods or tags. Each page starts after the last track
 * shown rather than at a count of rows, so a track archived or deleted
 * meanwhile doesn't move another past the page boundary unseen.
 */
export function useMusicTracks(
  options: {
    includeArchived?: boolean;
    search?: string;
    kind?: "music" | "sound_effect" | null;
    readyOnly?: boolean;
  } = {},
) {
  const includeArchived = options.includeArchived ?? false;
  const search = (options.search ?? "").trim().toLowerCase();
  const kind = options.kind ?? null;
  const readyOnly = options.readyOnly ?? false;
  const query = useInfiniteQuery({
    queryKey: ["music_tracks", includeArchived, search, kind, readyOnly],
    initialPageParam: null as MusicPageStart,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc(
        "search_music_tracks" as never,
        {
          p_query: search,
          p_kind: kind,
          p_include_archived: includeArchived,
          p_ready_only: readyOnly,
          p_limit: MUSIC_PAGE,
          p_after_created_at: pageParam?.createdAt ?? null,
          p_after_id: pageParam?.id ?? null,
        } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as MusicTrackRow[];
    },
    getNextPageParam: (last): MusicPageStart | undefined => {
      const end = last.at(-1);
      return last.length < MUSIC_PAGE || !end
        ? undefined
        : { createdAt: end.created_at, id: end.id };
    },
    // While a new search runs, the last results stay on screen.
    placeholderData: keepPreviousData,
    // New AI music and instrumentals appear when they're ready.
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) => page.some(trackInProgress)) ? 4000 : false,
  });
  const tracks = useMemo(() => (query.data?.pages ?? []).flat(), [query.data]);
  return { ...query, tracks };
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
