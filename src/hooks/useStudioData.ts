import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { USAGE_BALANCE_KEY } from "@/hooks/useUsageBalance";

/** Generation statuses that settle what a generation cost (or that it was refused). */
const FINISHED = new Set(["completed", "failed", "nsfw", "canceled", "submission_uncertain"]);

export function useModels(includeInactive = false) {
  return useQuery({
    queryKey: ["models", includeInactive],
    queryFn: async () => {
      let query = supabase.from("model_registry").select("*").order("sort_order");
      if (!includeInactive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ModelRegistryEntry[];
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key,value");
      if (error) throw error;
      const map: Record<string, unknown> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      return map;
    },
  });
}

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ["projects", includeArchived],
    queryFn: async () => {
      let query = supabase.from("projects").select("*").order("updated_at", { ascending: false });
      if (!includeArchived) query = query.eq("is_archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface GenerationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  model_registry_id: string;
  parent_generation_id: string | null;
  model_path: string;
  operation: string;
  prompt: string | null;
  parameters: Record<string, unknown>;
  status: string;
  ingest_status: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  error_code: string | null;
  error_message: string | null;
  hf_request_id: string | null;
  created_at: string;
  submitted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export function useGenerations(options: { limit?: number; projectId?: string | null; status?: string[] } = {}) {
  const { limit = 50, projectId, status } = options;
  return useQuery({
    queryKey: ["generations", limit, projectId ?? null, status ?? null],
    queryFn: async () => {
      let query = supabase
        .from("generations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (projectId) query = query.eq("project_id", projectId);
      if (status?.length) query = query.in("status", status as never);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as GenerationRow[];
    },
    refetchInterval: 30_000,
  });
}

export interface AssetRow {
  id: string;
  generation_id: string | null;
  project_id: string | null;
  folder_id: string | null;
  uploaded_by: string | null;
  asset_type: "image" | "video" | "audio";
  source_type: "generated" | "uploaded";
  title: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size: number | null;
  is_favorite: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useAssets(
  options: {
    limit?: number;
    projectId?: string | null;
    assetType?: "image" | "video" | "audio" | null;
    sourceType?: "generated" | "uploaded" | null;
    favoritesOnly?: boolean;
    search?: string;
    creator?: string | null;
    sort?: "newest" | "oldest";
  } = {},
) {
  const { limit = 60, projectId, assetType, sourceType, favoritesOnly, search, creator, sort = "newest" } = options;
  return useQuery({
    queryKey: ["assets", limit, projectId ?? null, assetType ?? null, sourceType ?? null, !!favoritesOnly, search ?? "", creator ?? null, sort],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: sort === "oldest" })
        .limit(limit);
      if (projectId) query = query.eq("project_id", projectId);
      if (assetType) query = query.eq("asset_type", assetType);
      if (sourceType) query = query.eq("source_type", sourceType);
      if (favoritesOnly) query = query.eq("is_favorite", true);
      if (creator) query = query.eq("uploaded_by", creator);
      if (search?.trim()) query = query.ilike("title", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AssetRow[];
    },
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,is_active,created_at")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Realtime: keeps generations and assets fresh without manual refreshes. */
export function useStudioRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("studio-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "generations" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["generations"] });
        queryClient.invalidateQueries({ queryKey: ["usage"] });
        // A generation that finished, or was refused, changes the top bar's balance.
        const status = (payload.new as { status?: string } | null)?.status;
        if (status && FINISHED.has(status)) {
          queryClient.invalidateQueries({ queryKey: USAGE_BALANCE_KEY });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        queryClient.invalidateQueries({ queryKey: ["shot_takes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["operations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_takes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["shot_takes"] });
        queryClient.invalidateQueries({ queryKey: ["storyboards"] });
      })
      .subscribe();
    // Long videos on a channel of their own: if their tables aren't installed
    // yet, refusing these subscriptions can't take the studio's updates with it.
    const longVideos = supabase
      .channel("long-video-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "long_videos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["long_videos"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "long_video_clips" }, () => {
        queryClient.invalidateQueries({ queryKey: ["long_videos"] });
      })
      .subscribe();
    // Characters and keyframes (one database update) on a channel of their own too.
    const characters = supabase
      .channel("character-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "long_video_keyframes" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["long_videos"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "characters" }, () => {
        queryClient.invalidateQueries({ queryKey: ["characters"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "character_images" }, () => {
        queryClient.invalidateQueries({ queryKey: ["characters"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(longVideos);
      supabase.removeChannel(characters);
    };
  }, [queryClient]);
}
