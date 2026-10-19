import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAgentStatus, stopAgentTurn } from "@/lib/supercomputer-agent.functions";
import {
  applyAgentEvent,
  decodeEvents,
  EMPTY_DISPLAY,
  type AgentDisplay,
} from "@/lib/supercomputer/agent-events";
import type { AgentThreadSettings } from "@/lib/supercomputer/agent-settings";
import type { MessageAttachment } from "@/lib/supercomputer/types";

/** Whether the Supercomputer runs as an agent here (Claude's key set, migration 0022 applied). */
export function useAgentStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["supercomputer-agent-status"],
    enabled: !!profile?.is_active,
    queryFn: () => getAgentStatus(),
    staleTime: 60_000,
    // The page waits for this before it reads a conversation: a failure falls back quickly.
    retry: 1,
  });
}

/** What a request to the agent carries (see src/lib/supercomputer/agent-turn.server). */
export interface AgentRequestBody {
  threadId?: string | null;
  text?: string;
  attachmentAssetIds?: string[];
  /** Left out (undefined): the conversation keeps its own. */
  projectId?: string | null | undefined;
  campaignId?: string | null | undefined;
  briefId?: string | null | undefined;
  settings?: Partial<AgentThreadSettings>;
  editMessageId?: string;
  regenerate?: boolean;
  approval?: { messageId: string; decisions: Record<string, "approve" | "deny"> };
}

/** A turn in progress, as this page sees it while it streams. */
export interface LiveTurn {
  threadId: string | null;
  /** The conversation it was sent from (null: a new one, until it is made). */
  origin: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  display: AgentDisplay;
  /** What the person sent, shown until their message is saved. */
  userText: string;
  attachments: MessageAttachment[];
  /** The message being replaced (an edit), hidden with everything after it. */
  replacing: string | null;
  /** The answer being made again or resumed (it streams in its own place). */
  resuming: string | null;
  startedAt: number;
}

const ENDPOINT = "/api/public/supercomputer-agent";

/** How a request went: whether the message was taken (saved) and the turn finished well. */
export interface RunOutcome {
  started: boolean;
  ok: boolean;
}

/**
 * Runs the agent's turns from this page: sends a message (or an edit, a redo
 * or an approval), shows the turn as it streams, and stops it on request.
 */
export function useAgentStream(options: { onThread: (threadId: string) => void }) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<LiveTurn | null>(null);
  const controller = useRef<AbortController | null>(null);
  const liveRef = useRef<LiveTurn | null>(null);
  liveRef.current = live;
  const onThread = useRef(options.onThread);
  onThread.current = options.onThread;

  const run = useCallback(
    async (
      body: AgentRequestBody,
      optimistic: {
        text?: string;
        attachments?: MessageAttachment[];
        replacing?: string | null;
        resuming?: string | null;
        /** What the resumed answer showed so far (it carries on from there). */
        initial?: AgentDisplay | null;
      } = {},
    ): Promise<RunOutcome> => {
      if (controller.current) return { started: false, ok: false };
      const abort = new AbortController();
      controller.current = abort;
      let turn: LiveTurn = {
        threadId: body.threadId ?? null,
        origin: body.threadId ?? null,
        userMessageId: null,
        assistantMessageId: optimistic.resuming ?? null,
        display: optimistic.initial
          ? { ...optimistic.initial, status: "streaming" }
          : { ...EMPTY_DISPLAY },
        userText: optimistic.text ?? "",
        attachments: optimistic.attachments ?? [],
        replacing: optimistic.replacing ?? null,
        resuming: optimistic.resuming ?? null,
        startedAt: Date.now(),
      };
      setLive(turn);
      let threadId = turn.threadId;
      let ok = true;
      let started = false;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sign in again to talk to the Supercomputer");
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          const reason = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            reason?.error ?? `The Supercomputer couldn't answer (${response.status})`,
          );
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = decodeEvents(buffer);
          buffer = rest;
          if (!events.length) continue;
          for (const event of events) {
            if (event.type === "turn") {
              started = true;
              threadId = event.threadId;
              turn = {
                ...turn,
                threadId: event.threadId,
                userMessageId: event.userMessageId,
                assistantMessageId: event.assistantMessageId,
              };
              onThread.current(event.threadId);
              // The person's message is saved now: the list shows it.
              void queryClient.invalidateQueries({
                queryKey: ["supercomputer_messages", event.threadId],
              });
            } else if (event.type === "title") {
              void queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
            } else {
              turn = { ...turn, display: applyAgentEvent(turn.display, event) };
              if (event.type === "status" && event.status === "failed" && event.error) {
                ok = false;
                toast.error(event.error);
              }
            }
          }
          setLive(turn);
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          ok = false;
          toast.error(error instanceof Error ? error.message : "The Supercomputer couldn't answer");
        }
      } finally {
        controller.current = null;
        if (threadId) {
          await queryClient.invalidateQueries({ queryKey: ["supercomputer_messages", threadId] });
          void queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
        }
        // Whatever the turn made shows in the library and Activity.
        void queryClient.invalidateQueries({ queryKey: ["generations"] });
        void queryClient.invalidateQueries({ queryKey: ["assets"] });
        setLive(null);
      }
      return { started, ok };
    },
    [queryClient],
  );

  const stop = useCallback(() => {
    const current = liveRef.current;
    controller.current?.abort();
    // The server may not see the page go: the answer is marked stopped as well.
    if (current?.assistantMessageId)
      void stopAgentTurn({ data: { messageId: current.assistantMessageId } }).catch(
        () => undefined,
      );
  }, []);

  return { live, run, stop, busy: live !== null };
}
