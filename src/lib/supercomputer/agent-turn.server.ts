/**
 * The Supercomputer agent's endpoint: a person's message (new, edited, or an
 * answer to redo), or their approval of what the agent asked to spend, runs
 * a turn (see ./agent-loop.server) whose events stream back as they happen
 * (text/event-stream). Signed in with the person's own session; only an
 * active member, in their own conversation (or any, for an admin).
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { signedInUser } from "../request-user.server";
import { KEEP_ALIVE } from "../event-stream";
import { encodeEvent, displayText, type AgentEvent } from "./agent-events";
import {
  abandonPending,
  agentConfigured,
  freshState,
  runTurn,
  type TurnState,
} from "./agent-loop.server";
import {
  addressesIn,
  contextText,
  historyOf,
  resolveAssets,
  stateOf,
  storedAgent,
  threadRows,
  userTurnContent,
  type ContextKey,
  type MessageRow,
} from "./agent-history.server";
import { AGENT_SYSTEM, TITLE_SYSTEM } from "./agent-prompt";
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  AUTO_APPROVE_CAP_USD,
  threadSettingsOf,
  type AgentThreadSettings,
} from "./agent-settings";
import type { AgentContext } from "./agent-tools.server";
import type { MessageAttachment, MediaKind } from "./types";

type Json = Record<string, unknown>;

const requestSchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  text: z.string().max(32_000).default(""),
  attachmentAssetIds: z.array(z.string().uuid()).max(16).default([]),
  projectId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  briefId: z.string().uuid().nullable().optional(),
  settings: z
    .object({
      model: z.enum(AGENT_MODELS.map((model) => model.id) as [string, ...string[]]),
      effort: z.enum(AGENT_EFFORTS),
      autoApproveUsd: z.number().min(0).max(AUTO_APPROVE_CAP_USD),
      brandKitId: z.string().uuid().nullable(),
    })
    .partial()
    .optional(),
  /** A message of the person's to replace: it and everything after it make way for this one. */
  editMessageId: z.string().uuid().optional(),
  /** The last answer is made again. */
  regenerate: z.boolean().optional(),
  /** What the person decided about the calls an answer waits on. */
  approval: z
    .object({
      messageId: z.string().uuid(),
      decisions: z.record(z.string().max(80), z.enum(["approve", "deny"])),
    })
    .optional(),
});
type AgentRequest = z.infer<typeof requestSchema>;

const NEEDS_MIGRATION =
  "The Supercomputer agent needs a database update (migration 0022_supercomputer_agent). Ask an admin to apply it.";

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

async function member(userId: string): Promise<{ role: string; name: string | null }> {
  const { data } = await db
    .from("profiles")
    .select("is_active,role,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role, name: (data as { full_name?: string | null }).full_name ?? null };
}

interface ThreadRow {
  id: string;
  title: string;
  project_id: string | null;
  campaign_id: string | null;
  brief_id: string | null;
  created_by: string | null;
  settings: unknown;
}

const THREAD_COLUMNS = "id,title,project_id,campaign_id,brief_id,created_by,settings";

/** The conversation a request is for (made when it is new), its settings brought up to date. */
async function threadFor(
  input: AgentRequest,
  userId: string,
  role: string,
): Promise<{ thread: ThreadRow; settings: AgentThreadSettings; isNew: boolean }> {
  let thread: ThreadRow | null = null;
  let isNew = false;
  if (input.threadId) {
    const { data, error } = await db
      .from("supercomputer_threads")
      .select(THREAD_COLUMNS)
      .eq("id", input.threadId)
      .maybeSingle();
    if (isMissingColumn(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_MIGRATION);
    if (!data) throw new AppError("INVALID_PARAMETERS", "That conversation no longer exists");
    if (data.created_by !== userId && role !== "admin")
      throw new AppError("NOT_AUTHORIZED", "That conversation is someone else's");
    thread = data as ThreadRow;
  } else {
    const { data, error } = await db
      .from("supercomputer_threads")
      .insert({
        title: input.text.trim().replace(/\s+/g, " ").slice(0, 80) || "New chat",
        project_id: input.projectId ?? null,
        campaign_id: input.campaignId ?? null,
        brief_id: input.briefId ?? null,
        created_by: userId,
        settings: threadSettingsOf(input.settings ?? {}) as never,
      })
      .select(THREAD_COLUMNS)
      .single();
    if (isMissingColumn(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_MIGRATION);
    if (error || !data)
      throw new AppError("UNKNOWN", error?.message ?? "The conversation couldn't be started");
    thread = data as ThreadRow;
    isNew = true;
  }
  // What the request changes: the context it works in, and how the agent runs.
  const settings = threadSettingsOf({
    ...((thread.settings ?? {}) as Json),
    ...(input.settings ?? {}),
  });
  const patch: Json = {};
  if (JSON.stringify(settings) !== JSON.stringify(threadSettingsOf(thread.settings)))
    patch["settings"] = settings;
  if (input.projectId !== undefined && input.projectId !== thread.project_id)
    patch["project_id"] = input.projectId;
  if (input.campaignId !== undefined && input.campaignId !== thread.campaign_id)
    patch["campaign_id"] = input.campaignId;
  if (input.briefId !== undefined && input.briefId !== thread.brief_id)
    patch["brief_id"] = input.briefId;
  if (Object.keys(patch).length) {
    await db
      .from("supercomputer_threads")
      .update(patch as never)
      .eq("id", thread.id);
    thread = { ...thread, ...(patch as Partial<ThreadRow>) };
  }
  return { thread, settings, isNew };
}

/* ------------------------------------------------------------------ */
/* A person's message                                                  */
/* ------------------------------------------------------------------ */

async function contextKeyOf(rows: MessageRow[]): Promise<ContextKey | null> {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.role !== "user") continue;
    const key = (((row.payload ?? {}) as Json)["agent"] as Json | undefined)?.["contextKey"];
    return (key as ContextKey | undefined) ?? null;
  }
  return null;
}

/** Writes a person's message: its words, attachments and the content the agent is sent. */
async function writeUserMessage(input: {
  thread: ThreadRow;
  settings: AgentThreadSettings;
  userId: string;
  person: { name: string | null; role: string };
  text: string;
  attachmentAssetIds: string[];
  earlier: MessageRow[];
}): Promise<MessageRow> {
  const { thread, settings } = input;
  const { data: assets } = input.attachmentAssetIds.length
    ? await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,title,mime_type,metadata")
        .in("id", input.attachmentAssetIds)
        .is("deleted_at", null)
    : { data: [] as never[] };
  const rows = input.attachmentAssetIds.flatMap((id) => {
    const row = (assets ?? []).find((entry: { id: string }) => entry.id === id);
    return row
      ? [
          row as {
            id: string;
            asset_type: string;
            storage_bucket: string;
            storage_path: string;
            title: string | null;
            mime_type: string | null;
            metadata: unknown;
          },
        ]
      : [];
  });
  const attachments: MessageAttachment[] = rows.map((row) => ({
    assetId: row.id,
    type: row.asset_type as MediaKind,
    title: row.title,
    bucket: row.storage_bucket,
    path: row.storage_path,
  }));
  const agent = await import("./agent.server");
  const pictures = rows.flatMap((row) => {
    const source = agent.visionSourceFor(row);
    return source
      ? [{ bucket: source.bucket, path: source.path, label: `${row.id} (${source.label}):` }]
      : [];
  });

  // The context: given in full when it is new to the conversation.
  const before = await contextKeyOf(input.earlier);
  const key: ContextKey = {
    projectId: thread.project_id,
    campaignId: thread.campaign_id,
    briefId: thread.brief_id,
    brandKitId: settings.brandKitId,
  };
  const first = !input.earlier.some((row) => row.role === "user");
  const [project, campaign, brand, brief, memories] = await Promise.all([
    thread.project_id
      ? db.from("projects").select("name,description").eq("id", thread.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    thread.campaign_id
      ? db.from("campaigns").select("name,objective").eq("id", thread.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (async () => {
      if (!settings.brandKitId) return null;
      const { loadBrandKit, brandBlockOf } = await import("../brand/use.server");
      const kit = await loadBrandKit(settings.brandKitId);
      return kit ? { id: kit.id, name: kit.name, block: brandBlockOf(kit, 1800) } : null;
    })(),
    (async () => {
      if (!thread.brief_id) return null;
      const { data } = await db
        .from("creative_briefs")
        .select("id,title,analysis,extracted_text")
        .eq("id", thread.brief_id)
        .maybeSingle();
      if (!data) return null;
      const analysis = { ...((data.analysis ?? {}) as Json) };
      delete analysis["analysed_at"];
      delete analysis["model"];
      const block = Object.keys(analysis).length
        ? JSON.stringify(analysis).slice(0, 8000)
        : (data.extracted_text ?? "").slice(0, 12000);
      return { id: data.id, title: data.title, block };
    })(),
    first
      ? db
          .from("supercomputer_memories")
          .select("id,content,scope,created_by")
          .or(`scope.eq.team,created_by.eq.${input.userId}`)
          .order("created_at", { ascending: false })
          .limit(30)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);
  const context = contextText({
    person: input.person,
    project: project.data ?? null,
    campaign: campaign.data ?? null,
    brand,
    brief,
    memories: (memories as { id: string; content: string; scope: string }[]).map((memory) => ({
      id: memory.id,
      content: memory.content,
      scope: memory.scope,
    })),
    attachments: attachments.map((item) => ({
      assetId: item.assetId,
      type: item.type,
      title: item.title,
    })),
    addresses: addressesIn(input.text),
    changed: {
      first,
      brand: (before?.brandKitId ?? null) !== key.brandKitId,
      brief: (before?.briefId ?? null) !== key.briefId,
    },
    now: new Date(),
  });
  const content = userTurnContent({ context, text: input.text, pictures });
  const { data, error } = await db
    .from("supercomputer_messages")
    .insert({
      thread_id: thread.id,
      role: "user",
      content: input.text.trim(),
      attachments: attachments as never,
      payload: { intent: "chat", agent: { content, contextKey: key } } as never,
      created_by: input.userId,
    })
    .select("id,role,content,attachments,payload,status,created_at,superseded_at")
    .single();
  if (error || !data)
    throw new AppError("UNKNOWN", error?.message ?? "The message couldn't be saved");
  return data as MessageRow;
}

/** Closes answers that still wait for an approval the person moved past. */
async function abandonWaiting(rows: MessageRow[]): Promise<MessageRow[]> {
  const out: MessageRow[] = [];
  for (const row of rows) {
    if (row.role !== "assistant" || row.status !== "awaiting_approval") {
      out.push(row);
      continue;
    }
    const state = stateOf(row.payload);
    if (!state) {
      out.push(row);
      continue;
    }
    const closed = abandonPending(state);
    const payload = payloadOf(row.payload, closed);
    await db
      .from("supercomputer_messages")
      .update({ status: "complete", payload: payload as never })
      .eq("id", row.id);
    out.push({ ...row, status: "complete", payload });
  }
  return out;
}

function payloadOf(base: unknown, state: TurnState): Json {
  const previous = (base ?? {}) as Json;
  return {
    intent: previous["intent"] ?? "chat",
    backend: "anthropic",
    ...state.payload,
    agent: {
      version: 1,
      transcript: state.transcript,
      display: state.display,
      pending: state.pending,
      usage: state.usage,
      model: state.model,
      steps: state.steps,
    },
  };
}

const STATUS_OF: Record<string, string> = {
  streaming: "streaming",
  awaiting_approval: "awaiting_approval",
  complete: "complete",
  stopped: "stopped",
  failed: "failed",
};

/* ------------------------------------------------------------------ */
/* The turn                                                            */
/* ------------------------------------------------------------------ */

/** A short title for a new conversation, from its first message (best effort). */
async function writeTitle(threadId: string, text: string, emit: (event: AgentEvent) => void) {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey: process.env["ANTHROPIC_API_KEY"],
      maxRetries: 1,
      timeout: 20_000,
    });
    const response = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 40,
      system: TITLE_SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
    });
    if (response.stop_reason === "refusal") return;
    const title = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join(" ")
      .replace(/["“”.]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!title) return;
    await db.from("supercomputer_threads").update({ title }).eq("id", threadId);
    emit({ type: "title", title });
  } catch {
    // The conversation keeps the title made from its first words.
  }
}

async function runRequest(
  input: AgentRequest,
  userId: string,
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const { role, name } = await member(userId);
  if (!agentConfigured())
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "The Supercomputer agent runs on Claude: an admin needs to add an ANTHROPIC_API_KEY backend secret.",
    );
  const { thread, settings, isNew } = await threadFor(input, userId, role);
  let rows = await threadRows(thread.id);

  let state: TurnState;
  let assistantId: string;
  let userMessageId: string | null = null;
  let decisions: Record<string, "approve" | "deny"> | undefined;
  let history: Anthropic.Beta.Messages.BetaMessageParam[];

  if (input.approval) {
    const row = rows.find((entry) => entry.id === input.approval!.messageId);
    if (!row || row.role !== "assistant" || row.status !== "awaiting_approval")
      throw new AppError("INVALID_PARAMETERS", "That answer isn't waiting for an approval");
    const kept = stateOf(row.payload);
    if (!kept?.pending) throw new AppError("INVALID_PARAMETERS", "There's nothing to approve");
    // Taken for this request: the same approval from another page finds it already going.
    const { data: claimed } = await db
      .from("supercomputer_messages")
      .update({ status: "streaming" })
      .eq("id", row.id)
      .eq("status", "awaiting_approval")
      .select("id");
    if (!claimed?.length)
      throw new AppError("INVALID_PARAMETERS", "That answer is already carrying on");
    state = { ...kept, model: settings.model };
    assistantId = row.id;
    decisions = input.approval.decisions;
    history = historyOf(rows.filter((entry) => entry.created_at < row.created_at));
  } else {
    rows = await abandonWaiting(rows);
    if (input.regenerate || input.editMessageId) {
      // The message the answer is made from (the last one, or the one edited) and everything after it.
      const target = input.editMessageId
        ? rows.find((entry) => entry.id === input.editMessageId && entry.role === "user")
        : [...rows].reverse().find((entry) => entry.role === "user");
      if (!target) throw new AppError("INVALID_PARAMETERS", "There's no message to answer again");
      const after = rows.filter(
        (entry) =>
          entry.created_at > target.created_at ||
          (input.editMessageId ? entry.id === target.id : false),
      );
      if (after.length)
        await db
          .from("supercomputer_messages")
          .update({ superseded_at: new Date().toISOString() })
          .in(
            "id",
            after.map((entry) => entry.id),
          );
      rows = rows.filter((entry) => !after.some((gone) => gone.id === entry.id));
      if (input.editMessageId) {
        const written = await writeUserMessage({
          thread,
          settings,
          userId,
          person: { name, role },
          text: input.text,
          attachmentAssetIds: input.attachmentAssetIds,
          earlier: rows,
        });
        rows = [...rows, written];
        userMessageId = written.id;
      } else userMessageId = target.id;
    } else {
      if (!input.text.trim() && !input.attachmentAssetIds.length)
        throw new AppError("INVALID_PARAMETERS", "Write a message first");
      const written = await writeUserMessage({
        thread,
        settings,
        userId,
        person: { name, role },
        text: input.text,
        attachmentAssetIds: input.attachmentAssetIds,
        earlier: rows,
      });
      rows = [...rows, written];
      userMessageId = written.id;
    }
    history = historyOf(rows);
    state = freshState(settings.model);
    const { data, error } = await db
      .from("supercomputer_messages")
      .insert({
        thread_id: thread.id,
        role: "assistant",
        content: "",
        payload: payloadOf({ intent: "chat" }, state) as never,
        model: settings.model,
        status: "streaming",
        created_by: userId,
      })
      .select("id")
      .single();
    if (isMissingColumn(error) || /status_check/i.test(error?.message ?? ""))
      throw new AppError("INVALID_PARAMETERS", NEEDS_MIGRATION);
    if (error || !data)
      throw new AppError("UNKNOWN", error?.message ?? "The answer couldn't be started");
    assistantId = data.id;
  }

  emit({
    type: "turn",
    threadId: thread.id,
    userMessageId,
    assistantMessageId: assistantId,
    model: settings.model,
  });
  const titling =
    isNew && input.text.trim() ? writeTitle(thread.id, input.text, emit) : Promise.resolve();

  // The turn ends when its page goes, or when it is stopped from another page
  // (stopAgentTurn marks the answer stopped; this notices within seconds).
  const ending = new AbortController();
  const end = () => ending.abort();
  if (signal.aborted) end();
  else signal.addEventListener("abort", end, { once: true });
  const watch = setInterval(() => {
    void db
      .from("supercomputer_messages")
      .select("status")
      .eq("id", assistantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === "stopped") end();
      });
  }, 4000);

  const context: AgentContext = {
    userId,
    threadId: thread.id,
    turnId: assistantId,
    settings,
    projectId: thread.project_id,
    campaignId: thread.campaign_id,
    signal: ending.signal,
  };
  const base = rows.find((entry) => entry.id === assistantId)?.payload ?? { intent: "chat" };
  try {
    await runTurn(
      {
        context,
        system: AGENT_SYSTEM,
        history,
        emit,
        resolve: resolveAssets,
        persist: async (current, phase) => {
          const status = STATUS_OF[current.display.status] ?? "streaming";
          const values = {
            content: displayText(current.display).slice(0, 32_000),
            payload: payloadOf(base, current) as never,
            model: current.display.model ?? settings.model,
            status: phase === "streaming" ? "streaming" : status,
            error_message: current.display.error,
          };
          // A person who stopped it elsewhere wins over the saves it makes while it works.
          const query = db.from("supercomputer_messages").update(values).eq("id", assistantId);
          await (phase === "final" ? query : query.eq("status", "streaming"));
        },
      },
      state,
      decisions,
    );
  } finally {
    clearInterval(watch);
    signal.removeEventListener("abort", end);
  }
  await db
    .from("supercomputer_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", thread.id);
  await Promise.race([titling, new Promise((resolve) => setTimeout(resolve, 4000))]);
}

/** Handles a POST to the agent's endpoint: the turn's events, streamed. */
export async function handleAgentRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: AgentRequest;
  try {
    userId = await signedInUser(request, "talk to the Supercomputer");
    input = requestSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "That request couldn't be read"
        : error instanceof Error
          ? error.message
          : "Unauthorized";
    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof AppError && error.code === "NOT_AUTHORIZED" ? 401 : 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stop = new AbortController();
  request.signal?.addEventListener("abort", () => stop.abort(), { once: true });
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };
      // A comment every 15 seconds keeps quiet stretches (a long tool) from timing out.
      const beat = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(KEEP_ALIVE));
        } catch {
          open = false;
        }
      }, 15_000);
      try {
        await runRequest(input, userId, emit, stop.signal);
      } catch (error) {
        emit({
          type: "status",
          status: "failed",
          error: error instanceof Error ? error.message : "The Supercomputer couldn't answer",
        });
      } finally {
        clearInterval(beat);
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the browser.
        }
      }
    },
    cancel() {
      stop.abort();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/** Whether the agent can run (its key is set), for the page to choose its mode. */
export function agentReady(): boolean {
  return agentConfigured();
}

export { storedAgent };
