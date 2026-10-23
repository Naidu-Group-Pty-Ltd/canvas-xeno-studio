/**
 * A Supercomputer conversation that works on a work (../work): told where the
 * work stands when it starts (its brief) and, at every message after, what
 * its journal says other sessions did since; holding the work while a turn
 * runs; and every turn written into the work's journal as it ends, however
 * it ends (done, waiting for an approval, stopped, failed), so the next
 * session, here or in Claude Code, knows what it did. What its tools make is
 * attached by the tools themselves (runForWork).
 *
 * Never fails a turn: a work that can't be read or written is left out, and
 * the conversation runs as any other.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import type { AgentDisplay } from "./agent-events";
import { displayText } from "./agent-events";
import type { WorkActor } from "../work/service.server";

export interface ThreadWork {
  id: string;
  title: string;
  project_id: string | null;
  brand_kit_id: string | null;
}

/** The session id a conversation holds a work as. */
export const threadSession = (threadId: string) => `supercomputer:${threadId}`;

export function threadActor(input: {
  userId: string;
  threadId: string;
  threadTitle: string | null;
}): WorkActor {
  return {
    userId: input.userId,
    kind: "supercomputer",
    session: threadSession(input.threadId),
    label: `Supercomputer · ${(input.threadTitle ?? "a conversation").slice(0, 120)}`,
  };
}

/** The work a conversation works on, if any (none before migration 0037). */
export async function threadWork(threadId: string): Promise<ThreadWork | null> {
  try {
    const { workOfThread } = await import("../work/service.server");
    return await workOfThread(threadId);
  } catch {
    return null;
  }
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
const firstLine = (text: string) =>
  text
    .split("\n")
    .find((line) => line.trim())
    ?.trim() ?? "";

/**
 * The work's part of a message's context: its brief, the first time the
 * conversation works on it (or when it moves to another work); otherwise
 * the entries other sessions and people wrote since the last message. And
 * the last entry it has been told of, kept with the message.
 */
export async function workContext(
  work: ThreadWork,
  threadId: string,
  before: { workId?: string | null; workSeen?: number | null } | null,
  first: boolean,
): Promise<{
  facts: { id: string; title: string; brief: string | null; since: string[] };
  seen: number | null;
}> {
  const fresh = first || (before?.workId ?? null) !== work.id || !before?.workSeen;
  try {
    if (fresh) {
      const { loadWorkView } = await import("../work/service.server");
      const { resumeBrief } = await import("../work/model");
      const view = await loadWorkView(work.id, { entries: 25 });
      return {
        facts: {
          id: work.id,
          title: work.title,
          brief: resumeBrief(view, { maxChars: 14_000 }),
          since: [],
        },
        seen: view.journal[0]?.n ?? 0,
      };
    }
    const { data } = await db
      .from("work_journal")
      .select("n,kind,summary,actor_label,actor_session,created_at")
      .eq("work_id", work.id)
      .gt("n", before!.workSeen!)
      .order("n", { ascending: false })
      .limit(40);
    const rows = data ?? [];
    const others = rows.filter(
      (row) => row.actor_session !== threadSession(threadId) && row.kind !== "link",
    );
    return {
      facts: {
        id: work.id,
        title: work.title,
        brief: null,
        since: others
          .slice(0, 15)
          .reverse()
          .map(
            (row) =>
              `${row.created_at.slice(0, 16).replace("T", " ")} UTC · ${row.kind} · ${row.actor_label ?? "someone"}${row.summary ? `: ${clip(firstLine(row.summary), 400)}` : ""}`,
          ),
      },
      seen: rows[0]?.n ?? before!.workSeen!,
    };
  } catch {
    return {
      facts: { id: work.id, title: work.title, brief: null, since: [] },
      seen: before?.workSeen ?? null,
    };
  }
}

/** As a turn starts: the conversation holds the work, unless another session's hold is live (it is told so in the brief). */
export async function holdForTurn(work: ThreadWork, actor: WorkActor): Promise<void> {
  try {
    const { claimWork } = await import("../work/service.server");
    await claimWork(work.id, actor, { seconds: 30 * 60 });
  } catch (error) {
    console.error("work not held for the turn", {
      workId: work.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** What a turn did, as its journal entry says it: its words, how it ended, what it used. */
export function turnEntry(
  display: AgentDisplay | null,
  failure: unknown,
): { kind: "turn" | "interrupted"; summary: string } {
  const text = display ? displayText(display) : "";
  const tools = (display?.blocks ?? []).flatMap((entry) =>
    entry.block.kind === "tool" ? [entry.block] : [],
  );
  const counts = new Map<string, number>();
  for (const call of tools) counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  const used = counts.size
    ? `\n\nTools used: ${[...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ")}.`
    : "";
  const failed = tools.filter((call) => call.status === "error").length;
  const problems = failed ? ` ${failed} call${failed === 1 ? "" : "s"} failed.` : "";
  const status = display?.status ?? "failed";
  const words = text ? clip(text, 4000) : "";
  if (failure || status === "failed") {
    const reason =
      display?.error ??
      (failure instanceof Error ? failure.message : failure ? String(failure) : "an error");
    return {
      kind: "interrupted",
      summary: `The turn failed: ${clip(reason, 400)}.${problems}${words ? `\n\nWhat it had written:\n${words}` : ""}${used}`,
    };
  }
  if (status === "stopped")
    return {
      kind: "interrupted",
      summary: `Stopped by a person.${problems}${words ? `\n\nWhat it had written:\n${words}` : ""}${used}`,
    };
  if (status === "awaiting_approval") {
    const waiting = tools
      .filter((call) => call.status === "awaiting_approval")
      .map((call) => call.approval?.title ?? call.label);
    return {
      kind: "turn",
      summary: `Waiting for a person to approve: ${waiting.join("; ") || "a step"}.${words ? `\n\n${words}` : ""}${used}`,
    };
  }
  return {
    kind: "turn",
    summary: `${words || "(The turn ended without words.)"}${problems ? `\n\n${problems.trim()}` : ""}${used}`,
  };
}

/** As a turn ends, however it ends: written into the work's journal, and the conversation's hold renewed. */
export async function recordTurn(
  work: ThreadWork,
  actor: WorkActor,
  display: AgentDisplay | null,
  failure: unknown,
): Promise<void> {
  try {
    const { saveWork } = await import("../work/service.server");
    const { kind, summary } = turnEntry(display, failure);
    await saveWork(work.id, actor, { kind, summary });
  } catch (error) {
    console.error("turn not written into the work's journal", {
      workId: work.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
