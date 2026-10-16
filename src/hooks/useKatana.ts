import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getKatanaOverview, pollKatanaRun } from "@/lib/katana.functions";
import { KATANA_ACTIVE_STATUSES } from "@/lib/katana/model";
import { isMissingTableError } from "@/lib/edit/errors";
import { useFeatureFlags } from "@/hooks/useV2Data";
import { sendToKatana, type KatanaSend } from "@/lib/katana/handoff";

export type KatanaRunRow = Database["public"]["Tables"]["katana_runs"]["Row"];
export type KatanaEventRow = Database["public"]["Tables"]["katana_run_events"]["Row"];
export type KatanaSpendRow = Database["public"]["Tables"]["katana_spend"]["Row"];
export type KatanaResultRow = Database["public"]["Tables"]["katana_results"]["Row"];

export class KatanaNotSetUp extends Error {}

/** Whether Katana is switched on (its flag counts as on until an admin stores one). */
export function useKatanaEnabled(): boolean {
  const { data: flags } = useFeatureFlags();
  return flags?.find((flag) => flag.key === "v2_katana")?.enabled ?? true;
}

/** Sends something to Katana's form and opens it (nothing runs until Start is pressed there). */
export function useSendToKatana() {
  const navigate = useNavigate();
  return (send: KatanaSend) => {
    sendToKatana(send);
    void navigate({ to: "/katana" });
  };
}

/** The runs a character is in (through their images), newest first. */
export function useCharacterKatanaRuns(characterId: string, limit = 6) {
  return useQuery({
    queryKey: ["katana-runs", "character", characterId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("katana_runs")
        .select("id,title,status,mode,preset_name,preset_slug,created_at")
        .contains("inputs", JSON.stringify([{ character_id: characterId }]))
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) throw new KatanaNotSetUp(error.message);
        throw error;
      }
      return data ?? [];
    },
    retry: (count, error) => !(error instanceof KatanaNotSetUp) && count < 2,
  });
}

/** Whether Katana can run: the Claude key, the Higgsfield connection, the defaults. */
export function useKatanaOverview() {
  return useQuery({
    queryKey: ["katana-overview"],
    queryFn: () => getKatanaOverview(),
    staleTime: 30_000,
  });
}

/** What still has to be set up before Katana can run, or nothing when it's ready. */
export function useKatanaReadiness() {
  const { data, isLoading, error } = useKatanaOverview();
  const problems: string[] = [];
  if (data) {
    if (!data.connection.tablesReady)
      problems.push("Katana needs a database update (migration 0015_katana).");
    if (!data.anthropicConfigured)
      problems.push("Katana runs on Claude: an ANTHROPIC_API_KEY backend secret is needed.");
    if (data.connection.status !== "connected") {
      problems.push(
        data.connection.status === "error"
          ? (data.connection.lastError ?? "The Higgsfield connection needs to be renewed.")
          : "The team's Higgsfield account isn't connected yet.",
      );
    }
  }
  return {
    overview: data,
    loading: isLoading,
    error,
    problems,
    ready: !!data && problems.length === 0,
  };
}

/** Recent runs, newest first; re-read every few seconds while one is moving. */
export function useKatanaRuns(limit = 30) {
  return useQuery({
    queryKey: ["katana-runs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("katana_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) throw new KatanaNotSetUp(error.message);
        throw error;
      }
      return data ?? [];
    },
    retry: (count, error) => !(error instanceof KatanaNotSetUp) && count < 2,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => KATANA_ACTIVE_STATUSES.has(run.status))
        ? 5_000
        : false,
  });
}

export interface KatanaRunDetail {
  run: KatanaRunRow;
  events: KatanaEventRow[];
  spend: KatanaSpendRow[];
  results: KatanaResultRow[];
}

/**
 * One run with its progress, spend and results. While it is moving, the page
 * also asks the server to read its session every few seconds, which answers
 * any paid call waiting on the credit guard.
 */
export function useKatanaRun(runId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["katana-run", runId],
    queryFn: async (): Promise<KatanaRunDetail | null> => {
      const [run, events, spend, results] = await Promise.all([
        supabase.from("katana_runs").select("*").eq("id", runId).maybeSingle(),
        supabase
          .from("katana_run_events")
          .select("*")
          .eq("run_id", runId)
          .order("occurred_at", { ascending: false })
          .limit(400),
        supabase
          .from("katana_spend")
          .select("*")
          .eq("run_id", runId)
          .order("decided_at", { ascending: true }),
        supabase
          .from("katana_results")
          .select("*")
          .eq("run_id", runId)
          .order("created_at", { ascending: true }),
      ]);
      if (run.error) {
        if (isMissingTableError(run.error)) throw new KatanaNotSetUp(run.error.message);
        throw run.error;
      }
      if (!run.data) return null;
      return {
        run: run.data,
        events: [...(events.data ?? [])].reverse(),
        spend: spend.data ?? [],
        results: results.data ?? [],
      };
    },
    retry: (count, error) => !(error instanceof KatanaNotSetUp) && count < 2,
  });

  const status = query.data?.run.status ?? null;
  const savingResult = (query.data?.results ?? []).some(
    (result) => result.status === "pending" || result.status === "saving",
  );
  const moving = !!status && (KATANA_ACTIVE_STATUSES.has(status) || savingResult);
  const polling = useRef(false);
  const hasRun = !!status;

  // Re-armed when the run starts or stops moving: once on opening, then every
  // few seconds while it moves.
  useEffect(() => {
    if (!hasRun) return;
    let stopped = false;
    const tick = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        await pollKatanaRun({ data: { runId } });
      } catch {
        // The tick and the reconcile job keep the run going; the page just shows less often.
      } finally {
        polling.current = false;
      }
      if (!stopped) await queryClient.invalidateQueries({ queryKey: ["katana-run", runId] });
    };
    void tick();
    const timer = moving ? setInterval(() => void tick(), 4_000) : null;
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [runId, moving, hasRun, queryClient]);

  return query;
}
