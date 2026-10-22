import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAgentStream, type LiveTurn } from "@/hooks/useAgent";
import type { MessageRow } from "@/hooks/useSupercomputerData";
import {
  fixAgentJoin,
  holdAgentSections,
  queueAgentSections,
} from "@/lib/supercomputer-agent.functions";
import { storedDisplay } from "@/lib/supercomputer/agent-events";
import {
  planViewOf,
  type JoinFix,
  type PlanView,
  type SectionView,
} from "@/lib/supercomputer/sections";

type Json = Record<string, unknown>;

const PLANS_KEY = "supercomputer_section_plans";

/**
 * A conversation's plans in sections, newest first, with their sections and
 * joins (migration 0036). Read again every few seconds while anything in them
 * moves: a section queued or working, a join's frames being taken or checked.
 */
export function useSectionPlans(threadId: string | null, enabled: boolean, busy = false) {
  return useQuery({
    queryKey: [PLANS_KEY, threadId],
    enabled: enabled && !!threadId,
    queryFn: async (): Promise<PlanView[]> => {
      const { data: plans, error } = await supabase
        .from("supercomputer_section_plans")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const ids = (plans ?? []).map((plan) => plan.id);
      if (!ids.length) return [];
      const [sections, joins] = await Promise.all([
        supabase.from("supercomputer_sections").select("*").in("plan_id", ids),
        supabase.from("supercomputer_section_joins").select("*").in("plan_id", ids),
      ]);
      if (sections.error) throw sections.error;
      if (joins.error) throw joins.error;
      return (plans ?? []).flatMap((plan) => {
        const view = planViewOf(
          plan as unknown as Json,
          (sections.data ?? []).filter((row) => row.plan_id === plan.id) as unknown as Json[],
          (joins.data ?? []).filter((row) => row.plan_id === plan.id) as unknown as Json[],
        );
        return view ? [view] : [];
      });
    },
    refetchInterval: (query) => {
      if (busy) return 3000;
      const moving = (query.state.data ?? []).some(
        (plan) =>
          plan.sections.some(
            (section) => section.status === "working" || section.status === "queued",
          ) || plan.joins.some((join) => join.status === "framing" || join.status === "checking"),
      );
      return moving ? 4000 : false;
    },
  });
}

export interface SectionRunner {
  /** The worker's turn streaming from this page, and the section it is for. */
  live: LiveTurn | null;
  liveSectionId: string | null;
  /** Whose joins are being checked from this page. */
  checking: string | null;
  busy: boolean;
  /** Queued sections aren't started one after another (a start failed): Run all starts them again. */
  paused: boolean;
  start: (section: SectionView, options?: { extend?: boolean; note?: string }) => void;
  /** Answers what a worker's turn waits on, and lets it carry on. */
  decide: (
    section: SectionView,
    message: MessageRow,
    decisions: Record<string, "approve" | "deny">,
  ) => void;
  runAll: (planId: string) => void;
  /** Stops the worker working now, and holds the rest. */
  stop: (planId: string) => void;
  /** Lets the worker working now finish, and holds the rest. */
  hold: (planId: string) => void;
  checkJoins: (planId: string, again?: boolean) => void;
  fix: (planId: string, position: number, fix: JoinFix["kind"]) => void;
}

/**
 * Runs a conversation's sections from its page, section by section: each
 * worker's turn is its own request (the agent's own stream), and when one
 * ends the next queued section starts, so a plan carries on across requests.
 * It stops starting them after one that fails, until Run all.
 */
export function useSectionRunner(input: { plans: PlanView[]; enabled: boolean }): SectionRunner {
  const queryClient = useQueryClient();
  const {
    live,
    run,
    stop: stopTurn,
    busy: streaming,
  } = useAgentStream({
    onThread: () => undefined,
  });
  const [liveSectionId, setLiveSectionId] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Set from a run's start until the plans are read again after it, so a section
  // shown as queued from before it started is never started twice.
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [PLANS_KEY] }),
    [queryClient],
  );

  const runFor = useCallback(
    async (sectionId: string | null, run: () => Promise<{ started: boolean; ok: boolean }>) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setLiveSectionId(sectionId);
      try {
        const outcome = await run();
        if (!outcome.ok) setPaused(true);
      } finally {
        await refresh();
        setLiveSectionId(null);
        runningRef.current = false;
        setRunning(false);
      }
    },
    [refresh],
  );

  const start = useCallback(
    (section: SectionView, options: { extend?: boolean; note?: string } = {}) => {
      void runFor(section.id, () =>
        run({
          section: {
            sectionId: section.id,
            ...(options.extend ? { extend: true } : {}),
            ...(options.note?.trim() ? { note: options.note.trim() } : {}),
          },
        }),
      );
    },
    [runFor, run],
  );

  const decide = useCallback(
    (section: SectionView, message: MessageRow, decisions: Record<string, "approve" | "deny">) => {
      void runFor(section.id, () =>
        run(
          { threadId: message.thread_id, approval: { messageId: message.id, decisions } },
          { resuming: message.id, initial: storedDisplay(message) },
        ),
      );
    },
    [runFor, run],
  );

  // The next queued section starts once nothing runs from this page.
  const { enabled, plans } = input;
  useEffect(() => {
    if (!enabled || paused || running || streaming) return;
    const next = [...plans]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .flatMap((plan) => plan.sections)
      .find((section) => section.status === "queued");
    if (next) start(next);
  }, [enabled, paused, running, streaming, plans, start]);

  const act = useCallback(
    async (work: () => Promise<unknown>, done?: string) => {
      try {
        await work();
        if (done) toast.success(done);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work just now");
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  return {
    live,
    liveSectionId,
    checking,
    busy: running || streaming,
    paused,
    start,
    decide,
    runAll: (planId) => {
      setPaused(false);
      void act(() => queueAgentSections({ data: { planId } }));
    },
    stop: (planId) => {
      void act(() => holdAgentSections({ data: { planId } }));
      stopTurn();
    },
    hold: (planId) => void act(() => holdAgentSections({ data: { planId } }), "The rest are held."),
    checkJoins: (planId, again = false) => {
      setChecking(planId);
      void runFor(null, () => run({ joins: { planId, again } })).finally(() => setChecking(null));
    },
    fix: (planId, position, fix) => {
      if (fix === "redo_after" || fix === "redo_before") setPaused(false);
      void act(async () => {
        const { done } = await fixAgentJoin({ data: { planId, position, fix } });
        toast.success(done);
      });
    },
  };
}
