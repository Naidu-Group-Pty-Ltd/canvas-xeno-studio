import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getWorkPage, listWorkPage } from "@/lib/work.functions";

/** Work in progress (latest first), and whether the database has it yet. */
export function useWorkList(
  options: { projectId?: string | null; includeFinished?: boolean } = {},
) {
  return useQuery({
    queryKey: ["works", options.projectId ?? null, !!options.includeFinished],
    queryFn: () =>
      listWorkPage({
        data: { projectId: options.projectId ?? null, includeFinished: !!options.includeFinished },
      }),
    // Sessions elsewhere (Claude Code, the Supercomputer) save as they go.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** A work whole, read again as its journal grows. */
export function useWorkPage(workId: string) {
  return useQuery({
    queryKey: ["work", workId],
    queryFn: () => getWorkPage({ data: { workId } }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

/** Follows a work's journal as other sessions write it (when the database publishes it). */
export function useWorkRealtime(workId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`work-${workId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "work_journal",
          filter: `work_id=eq.${workId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["work", workId] });
          void queryClient.invalidateQueries({ queryKey: ["works"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workId, queryClient]);
}

/** Runs a change to a work and reads it again after, saying plainly what went wrong. */
export function useWorkAction(workId: string) {
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
        await queryClient.invalidateQueries({ queryKey: ["work", workId] });
        await queryClient.invalidateQueries({ queryKey: ["works"] });
      }
    },
    [workId, queryClient],
  );
}

/** A request id for a person's change (a double click is kept once). */
export const changeId = () => `app-${crypto.randomUUID()}`.slice(0, 64);
