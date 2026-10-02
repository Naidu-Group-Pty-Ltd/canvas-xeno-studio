import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAvatarProviderStatus } from "../lib/avatar.functions";

export function useAvatarStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["avatar", "status"],
    enabled: !!profile?.is_active,
    queryFn: () => getAvatarProviderStatus(),
    staleTime: 60_000,
  });
}

export function useCharacters() {
  return useQuery({
    queryKey: ["avatar", "characters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avatar_characters")
        .select("*, avatar_looks(*)")
        .is("deleted_at", null)
        .order("ownership_type")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, avatar_looks: (c.avatar_looks ?? []).filter((l) => !l.deleted_at) }));
    },
  });
}
export type Character = NonNullable<ReturnType<typeof useCharacters>["data"]>[number];
export type Look = Character["avatar_looks"][number];

export function useVoices() {
  return useQuery({
    queryKey: ["avatar", "voices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_voices").select("*").is("deleted_at", null).order("is_owned", { ascending: false }).order("display_name").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
export type Voice = NonNullable<ReturnType<typeof useVoices>["data"]>[number];

export function useAvatarJobs(limit = 100) {
  return useQuery({
    queryKey: ["avatar", "jobs", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_jobs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
}
export type AvatarJob = NonNullable<ReturnType<typeof useAvatarJobs>["data"]>[number];

export function useJobEvents(jobId: string | null) {
  return useQuery({
    queryKey: ["avatar", "job-events", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_job_events").select("*").eq("job_id", jobId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAvatarAssets(filter: { roles?: string[]; type?: string | null } = {}) {
  return useQuery({
    queryKey: ["avatar", "assets", filter.roles ?? null, filter.type ?? null],
    queryFn: async () => {
      let q = supabase.from("avatar_assets").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
      if (filter.roles?.length) q = q.in("asset_role", filter.roles);
      if (filter.type) q = q.eq("asset_type", filter.type);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export type AvatarAsset = NonNullable<ReturnType<typeof useAvatarAssets>["data"]>[number];

export function usePersonas() {
  return useQuery({
    queryKey: ["avatar", "personas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_realtime_personas").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function signedAvatarUrl(bucket: string, path: string, download?: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

export function useSignedUrl(bucket?: string | null, path?: string | null) {
  return useQuery({
    queryKey: ["avatar", "signed", bucket, path],
    enabled: !!bucket && !!path,
    staleTime: 50 * 60_000,
    queryFn: () => signedAvatarUrl(bucket!, path!),
  });
}

/** Keeps Avatar Studio views in sync with job, asset and resource changes. */
export function useAvatarRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const inv = (k: string) => () => qc.invalidateQueries({ queryKey: ["avatar", k] });
    const ch = supabase
      .channel("avatar-studio")
      .on("postgres_changes", { event: "*", schema: "public", table: "avatar_jobs" }, () => {
        inv("jobs")();
        inv("job-events")();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "avatar_assets" }, inv("assets"))
      .on("postgres_changes", { event: "*", schema: "public", table: "avatar_characters" }, inv("characters"))
      .on("postgres_changes", { event: "*", schema: "public", table: "avatar_looks" }, inv("characters"))
      .on("postgres_changes", { event: "*", schema: "public", table: "avatar_voices" }, inv("voices"))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}
