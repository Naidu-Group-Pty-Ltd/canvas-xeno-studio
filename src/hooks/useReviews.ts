import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadProjectReviews } from "@/lib/reviews/store";

/** A project's reviews: its gates, versions, files, decisions, comments and notes. */
export function useProjectReviews(projectId: string) {
  return useQuery({
    queryKey: ["reviews", projectId],
    queryFn: () => loadProjectReviews(supabase, projectId),
    // Teammates comment and decide meanwhile: read again when the page is looked at again.
    refetchOnWindowFocus: true,
  });
}

/**
 * Runs a change to a project's reviews and reads them again after, saying
 * plainly what went wrong when it can't be made. Resolves true when it was.
 */
export function useReviewAction(projectId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    async (work: () => Promise<unknown>, done?: string): Promise<boolean> => {
      try {
        await work();
        if (done) toast.success(done);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That couldn't be saved. Try again.");
        return false;
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["reviews", projectId] });
      }
    },
    [projectId, queryClient],
  );
}

/** A project's finished renders, newest first: what a render version can be. */
export function useProjectRenders(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["review-renders", projectId],
    enabled,
    queryFn: async () => {
      const { data: edits, error } = await supabase
        .from("sequences")
        .select("id,title")
        .eq("project_id", projectId);
      if (error) throw error;
      if (!edits?.length) return [];
      const { data: renders, error: rendersError } = await supabase
        .from("sequence_renders")
        .select("id,sequence_id,sequence_version,duration_seconds,completed_at,asset_id")
        .in(
          "sequence_id",
          edits.map((edit) => edit.id),
        )
        .eq("status", "completed")
        .not("asset_id", "is", null)
        .order("completed_at", { ascending: false })
        .limit(40);
      if (rendersError) throw rendersError;
      const titles = new Map(edits.map((edit) => [edit.id, edit.title]));
      return (renders ?? []).map((render) => ({
        id: render.id,
        title: titles.get(render.sequence_id) ?? "Edit",
        version: render.sequence_version,
        seconds: render.duration_seconds === null ? null : Number(render.duration_seconds),
        completedAt: render.completed_at,
      }));
    },
  });
}

/** Storyboards to put up for review: the project's first, then the rest, newest first. */
export function useReviewStoryboards(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["review-storyboards", projectId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storyboards")
        .select("id,title,project_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return [...(data ?? [])].sort(
        (a, b) => Number(b.project_id === projectId) - Number(a.project_id === projectId),
      );
    },
  });
}
