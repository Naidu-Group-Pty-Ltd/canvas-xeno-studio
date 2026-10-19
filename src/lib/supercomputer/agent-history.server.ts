/**
 * The Supercomputer agent's conversation as the Messages API takes it, built
 * from what each turn kept: a person's message exactly as it was first sent
 * (its context, words and pictures), then every message the agent's turn
 * produced, unchanged. Pictures are kept as studio addresses and given fresh
 * links each time the conversation is sent (the same bytes, so the agent's
 * earlier thinking stays valid). Turns from before the agent are summarised.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import type { ApiMessage, TurnState } from "./agent-loop.server";
import { displayOf } from "./agent-events";
import { ASSET_URL_PREFIX, assetUrl } from "./agent-tools.server";
import type { MessageAttachment, SupercomputerPayload } from "./types";

type Json = Record<string, unknown>;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** What a person's message is sent with, and the context it was sent in. */
export interface UserTurn {
  content: Block[];
  contextKey: ContextKey;
}

export interface ContextKey {
  projectId: string | null;
  campaignId: string | null;
  briefId: string | null;
  brandKitId: string | null;
}

/** An assistant message's agent state, as kept in its payload. */
export interface StoredAgent {
  version: 1;
  transcript: ApiMessage[];
  display: unknown;
  pending: TurnState["pending"];
  usage: TurnState["usage"];
  model: string;
  steps: number;
}

export interface MessageRow {
  id: string;
  role: string;
  content: string;
  attachments: unknown;
  payload: unknown;
  status: string;
  created_at: string;
  superseded_at?: string | null;
}

export function storedAgent(payload: unknown): StoredAgent | null {
  const agent = ((payload ?? {}) as Json)["agent"] as Json | undefined;
  if (!agent || !Array.isArray(agent["transcript"])) return null;
  return {
    version: 1,
    transcript: agent["transcript"] as ApiMessage[],
    display: agent["display"],
    pending: (agent["pending"] as TurnState["pending"]) ?? null,
    usage: (agent["usage"] as TurnState["usage"]) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    model: typeof agent["model"] === "string" ? agent["model"] : "claude-opus-5-5",
    steps: typeof agent["steps"] === "number" ? agent["steps"] : 0,
  };
}

/** A turn's kept state, to resume it (after an approval). */
export function stateOf(payload: unknown): TurnState | null {
  const agent = storedAgent(payload);
  if (!agent) return null;
  const item = (payload ?? {}) as Json;
  const display = displayOf(agent.display) ?? {
    blocks: [],
    status: "streaming" as const,
    error: null,
    usage: null,
    model: agent.model,
  };
  return {
    transcript: agent.transcript,
    display,
    payload: {
      ...(Array.isArray(item["ideas"]) ? { ideas: item["ideas"] as never } : {}),
      ...(Array.isArray(item["drafts"]) ? { drafts: item["drafts"] as never } : {}),
      ...(item["editPlan"] ? { editPlan: item["editPlan"] as never } : {}),
      ...(Array.isArray(item["dropped"]) ? { dropped: item["dropped"] as never } : {}),
    },
    pending: agent.pending,
    usage: agent.usage,
    model: agent.model,
    steps: agent.steps,
  };
}

/** A person's message as first sent, or (from before the agent) its words and attachments. */
function userContent(row: MessageRow): Block[] {
  const kept = (((row.payload ?? {}) as Json)["agent"] as Json | undefined)?.["content"];
  if (Array.isArray(kept) && kept.length) return kept as Block[];
  const attachments = (
    Array.isArray(row.attachments) ? row.attachments : []
  ) as MessageAttachment[];
  const note = attachments.length
    ? `\n[Attached: ${attachments.map((item) => `${item.type} "${item.title ?? "untitled"}" (${item.assetId})`).join("; ")}]`
    : "";
  const text = `${row.content}${note}`.trim();
  return [{ type: "text", text: text || "(no text)" }];
}

/** An answer from before the agent, in brief: its words and what it proposed. */
function legacyAnswer(row: MessageRow): string {
  const payload = (row.payload ?? {}) as SupercomputerPayload;
  const parts = [row.content.trim()];
  if (payload.ideas?.length)
    parts.push(`[Ideas: ${payload.ideas.map((idea, i) => `${i + 1}) ${idea.title}`).join("; ")}]`);
  if (payload.drafts?.length)
    parts.push(
      `[Drafts: ${payload.drafts.map((draft, i) => `${i + 1}) ${draft.title} — ${draft.modelName}`).join("; ")}]`,
    );
  return parts.filter(Boolean).join("\n");
}

/**
 * The conversation before `until` (a message's time, not included), as the
 * API takes it. Superseded and failed messages are left out; an answer
 * waiting for approval is left out too (it is resumed on its own).
 */
export function historyOf(rows: MessageRow[]): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const row of rows) {
    if (row.superseded_at) continue;
    if (row.role === "user") {
      messages.push({ role: "user", content: userContent(row) });
      continue;
    }
    if (row.status === "failed") continue;
    const agent = storedAgent(row.payload);
    if (agent) {
      // Only the consistent part of a turn is kept (see ./agent-loop.server).
      if (row.status !== "awaiting_approval") messages.push(...agent.transcript);
      continue;
    }
    const text = legacyAnswer(row);
    if (text) messages.push({ role: "assistant", content: [{ type: "text", text }] });
  }
  return messages;
}

/** The thread's messages, oldest first (the live ones; superseded ones are skipped by historyOf). */
export async function threadRows(threadId: string): Promise<MessageRow[]> {
  const { data, error } = await db
    .from("supercomputer_messages")
    .select("id,role,content,attachments,payload,status,created_at,superseded_at")
    .eq("thread_id", threadId)
    .is("superseded_at", null)
    .order("created_at", { ascending: true })
    .limit(400);
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

/* ------------------------------------------------------------------ */
/* Pictures                                                            */
/* ------------------------------------------------------------------ */

function collectAssets(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const item = value as Json;
  const source = item["source"] as Json | undefined;
  if (
    item["type"] === "image" &&
    source?.["type"] === "url" &&
    typeof source["url"] === "string" &&
    source["url"].startsWith(ASSET_URL_PREFIX)
  )
    into.add(source["url"]);
  if (Array.isArray(item["content"])) collectAssets(item["content"], into);
}

function replaceAssets(value: unknown, links: Map<string, string | null>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceAssets(item, links));
  if (!value || typeof value !== "object") return value;
  const item = value as Json;
  const source = item["source"] as Json | undefined;
  if (item["type"] === "image" && source?.["type"] === "url" && typeof source["url"] === "string") {
    if (!source["url"].startsWith(ASSET_URL_PREFIX)) return item;
    const link = links.get(source["url"]);
    return link
      ? { ...item, source: { type: "url", url: link } }
      : { type: "text", text: "(a picture that is no longer in the library)" };
  }
  if (Array.isArray(item["content"]))
    return { ...item, content: replaceAssets(item["content"], links) };
  return item;
}

/** The conversation with every studio picture address turned into a fresh link. */
export async function resolveAssets(messages: ApiMessage[]): Promise<ApiMessage[]> {
  const wanted = new Set<string>();
  collectAssets(messages, wanted);
  if (!wanted.size) return messages;
  const byBucket = new Map<string, string[]>();
  for (const url of wanted) {
    const rest = url.slice(ASSET_URL_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) continue;
    const bucket = rest.slice(0, slash);
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), rest.slice(slash + 1)]);
  }
  const links = new Map<string, string | null>();
  for (const [bucket, paths] of byBucket) {
    const { data } = await db.storage.from(bucket).createSignedUrls(paths, 1800);
    paths.forEach((path, index) => {
      const signed = data?.[index]?.signedUrl ?? null;
      links.set(assetUrl(bucket, path), signed);
    });
  }
  return replaceAssets(messages, links) as ApiMessage[];
}

/* ------------------------------------------------------------------ */
/* A person's message                                                  */
/* ------------------------------------------------------------------ */

export interface ContextFacts {
  person: { name: string | null; role: string };
  project: { name: string; description: string | null } | null;
  campaign: { name: string; objective: string | null } | null;
  brand: { id: string; name: string; block: string } | null;
  brief: { id: string; title: string; block: string } | null;
  memories: { id: string; content: string; scope: string }[];
  attachments: { assetId: string; type: string; title: string | null }[];
  /** What changed since the last message (the brand and brief are given in full only then). */
  changed: { brand: boolean; brief: boolean; first: boolean };
  now: Date;
}

/** The context a message is sent with: the date, who's asking, and what the work is about. */
export function contextText(facts: ContextFacts): string {
  const date = facts.now.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const lines = [
    `Date: ${date} (UTC)`,
    `Person: ${facts.person.name ?? "a team member"} (${facts.person.role})`,
    `Project: ${facts.project ? `${facts.project.name}${facts.project.description ? ` — ${facts.project.description.slice(0, 300)}` : ""}` : "none"}`,
    ...(facts.campaign
      ? [
          `Campaign: ${facts.campaign.name}${facts.campaign.objective ? ` — objective: ${facts.campaign.objective.slice(0, 300)}` : ""}`,
        ]
      : []),
    facts.brand
      ? `Brand kit: ${facts.brand.name} (brandKitId ${facts.brand.id}): generations in this conversation carry its look unless you pass brandKitId null.`
      : "Brand kit: none chosen",
  ];
  if (facts.brand && (facts.changed.brand || facts.changed.first))
    lines.push("", facts.brand.block);
  if (facts.brief && (facts.changed.brief || facts.changed.first))
    lines.push(
      "",
      `Creative brief "${facts.brief.title}" (id ${facts.brief.id}):`,
      facts.brief.block,
    );
  if (facts.changed.first && facts.memories.length)
    lines.push(
      "",
      "Memories (kept from earlier conversations; forget any that are wrong):",
      ...facts.memories.map((memory) => `- [${memory.id}] (${memory.scope}) ${memory.content}`),
    );
  if (facts.attachments.length)
    lines.push(
      "",
      "Attached to this message:",
      ...facts.attachments.map(
        (item) => `- ${item.assetId} · ${item.type} · "${item.title ?? "untitled"}"`,
      ),
    );
  return `<context>\n${lines.join("\n")}\n</context>`;
}

/** A person's message as the API takes it: its context, words, then the pictures attached. */
export function userTurnContent(input: {
  context: string;
  text: string;
  pictures: { bucket: string; path: string; label: string }[];
}): Block[] {
  const blocks: Block[] = [{ type: "text", text: input.context }];
  if (input.text.trim()) blocks.push({ type: "text", text: input.text.trim() });
  for (const picture of input.pictures.slice(0, 12)) {
    blocks.push({ type: "text", text: picture.label });
    blocks.push({
      type: "image",
      source: { type: "url", url: assetUrl(picture.bucket, picture.path) },
    });
  }
  return blocks;
}
