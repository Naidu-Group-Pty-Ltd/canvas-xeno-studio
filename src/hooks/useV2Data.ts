import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature_flags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feature_flags").select("*").order("key");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useFlagEnabled(key: string) {
  const { data } = useFeatureFlags();
  return data?.find((f) => f.key === key)?.enabled ?? false;
}

export function useCampaigns(includeArchived = false) {
  return useQuery({
    queryKey: ["campaigns", includeArchived],
    queryFn: async () => {
      let q = supabase.from("campaigns").select("*").order("updated_at", { ascending: false });
      if (!includeArchived) q = q.eq("is_archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStoryboards() {
  return useQuery({
    queryKey: ["storyboards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storyboards")
        .select("*, scenes(id, scene_number, name, purpose, environment, shots(id, shot_number, name, description, prompt, duration_seconds, operation_type, recommended_model_id, status, selected_take_id))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProductionPlans() {
  return useQuery({
    queryKey: ["production_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_plans")
        .select("id,title,plan,version,status,total_estimated_cost_usd,storyboard_id,created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContinuityPacks() {
  return useQuery({
    queryKey: ["continuity_packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("continuity_packs")
        .select("*, continuity_pack_items(id, asset_id, role, position)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkflowTemplates() {
  return useQuery({
    queryKey: ["workflow_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select("*, workflow_nodes(id,node_key,node_type,label), workflow_edges(id,source_node_key,target_node_key)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useModelMetrics() {
  return useQuery({
    queryKey: ["model_performance_metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("model_performance_metrics").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useArenaSessions() {
  return useQuery({
    queryKey: ["arena_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arena_sessions")
        .select("*, arena_entries(id, model_registry_id, generation_id, estimated_cost_usd)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}
