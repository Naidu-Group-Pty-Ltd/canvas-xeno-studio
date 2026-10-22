import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { audioUrlFor } from "@/hooks/useMusicData";
import { saveMusicAnalysis } from "@/lib/music.functions";
import { analyzeMusicUrl } from "@/lib/music/analyze";
import type { BeatAnalysis } from "@/lib/music/beats";
import type { MusicTrackRow } from "@/lib/music/catalog";
import { readStructure, type BarFeatures, type MusicStructure } from "@/lib/music/structure";

export interface KnownStructure {
  structure: MusicStructure;
  features: BarFeatures;
}

const key = (assetId: string | null) => ["music_structure", assetId] as const;

/**
 * A library track's bars and sections: as kept on the track, or as found in
 * this session (which is how they're known before migration 0033, which
 * keeps them, is applied). Null until they have been found.
 */
export function useMusicStructure(assetId: string | null) {
  return useQuery({
    queryKey: key(assetId),
    enabled: !!assetId,
    staleTime: Infinity,
    queryFn: async (): Promise<KnownStructure | null> => {
      // Every column, so a database without the structure columns still answers.
      const { data, error } = await supabase
        .from("music_tracks")
        .select("*")
        .eq("asset_id", assetId!)
        .limit(5);
      if (error) throw error;
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const known = readStructure(row["structure"], row["bar_features"]);
        if (known) return known;
      }
      return null;
    },
  });
}

/** Shares bars and sections just found, so everything showing the track has them at once. */
export function rememberStructure(
  queryClient: QueryClient,
  assetId: string,
  known: KnownStructure,
): void {
  queryClient.setQueryData(key(assetId), known);
}

/**
 * Finds a library track's beats, bars and sections from its file (decoded
 * once, in the browser), shares them, and keeps them on the track so the
 * next edit needn't find them again. `note` says why its bars and sections
 * couldn't be kept, when they couldn't.
 */
export async function findStructure(input: {
  queryClient: QueryClient;
  assetId: string;
  track: MusicTrackRow | undefined;
}): Promise<{
  beats: BeatAnalysis | null;
  known: KnownStructure | null;
  duration: number;
  note: string | null;
}> {
  const url = await audioUrlFor(input.assetId);
  if (!url) throw new Error("The music file couldn't be opened");
  const length = input.track?.duration_seconds ? Number(input.track.duration_seconds) : null;
  const found = await analyzeMusicUrl(url, length);
  const known =
    found.structure && found.features
      ? { structure: found.structure, features: found.features }
      : null;
  if (known) rememberStructure(input.queryClient, input.assetId, known);
  let note: string | null = null;
  const { track } = input;
  if (track && found.beats && found.beats.confidence >= 0.15) {
    try {
      const kept = await saveMusicAnalysis({
        data: {
          trackId: track.id,
          bpm: found.beats.bpm,
          beats: found.beats.beats,
          durationSeconds: found.duration,
          structure: known?.structure ?? null,
          features: known?.features ?? null,
        },
      });
      note = kept.message;
      void input.queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
    } catch {
      // Not kept this time: they're worked out again next time.
    }
  }
  return { beats: found.beats, known, duration: found.duration, note };
}
