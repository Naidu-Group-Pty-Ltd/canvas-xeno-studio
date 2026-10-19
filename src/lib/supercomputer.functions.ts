import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import type {
  BriefAnalysis,
  MediaKind,
  MessageAttachment,
  PromptSuggestion,
  SupercomputerIntent,
  SupercomputerPayload,
} from "./supercomputer/types";

/**
 * Supercomputer server functions: conversation turns, brief analysis and
 * inline prompt help. Reasoning only — none of these submit a generation.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertActiveMember(userId: string) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

async function requireReasoning() {
  const { resolveReasoning } = await import("./reasoning/provider.server");
  const route = await resolveReasoning("supercomputer");
  if (!route)
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Supercomputer needs an AI model. Add an OPENAI_API_KEY backend secret or enable Lovable AI for this project.",
    );
  return route;
}

function tablesMissing(): AppError {
  return new AppError(
    "UNKNOWN",
    "Supercomputer's database tables are not installed yet. Apply migration 0002_supercomputer_and_creative_briefs, then reload.",
  );
}

/** Reasoning backend, model and database readiness. Never returns a key. */
export const getSupercomputerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveMember(context.userId);
    const { reasoningStatus } = await import("./reasoning/provider.server");
    const { isMissingTable } = await import("./supercomputer/agent.server");
    const supabaseAdmin = await admin();
    const [status, threads, briefs] = await Promise.all([
      reasoningStatus("supercomputer"),
      supabaseAdmin
        .from("supercomputer_threads")
        .select("id", { head: true, count: "exact" })
        .limit(1),
      supabaseAdmin.from("creative_briefs").select("id", { head: true, count: "exact" }).limit(1),
    ]);
    return {
      ...status,
      tablesReady: !isMissingTable(threads.error) && !isMissingTable(briefs.error),
    };
  });

const INTENT_GUIDANCE: Record<SupercomputerIntent, string> = {
  chat: "Respond naturally. Include ideas or drafts whenever they would help.",
  brainstorm: 'Brainstorm genuinely distinct concepts in "ideas". Drafts are optional.',
  drafts: "Produce ready-to-run drafts for what the user asked.",
  deliverables:
    "Produce one ready-to-run draft per deliverable in the brief (respect each deliverable's format, aspect ratio and duration). Use brief images as references where they help.",
  review:
    "Review the attached outputs against the request and the brief: what works, what to fix. Then propose improved drafts.",
};

interface AssetRowLite {
  id: string;
  asset_type: string;
  storage_bucket: string;
  storage_path: string;
  title: string | null;
  mime_type: string | null;
  metadata: unknown;
}

const ASSET_COLUMNS = "id,asset_type,storage_bucket,storage_path,title,mime_type,metadata";

function attachmentSummary(attachments: MessageAttachment[]): string {
  if (!attachments.length) return "";
  return `\n[Attached: ${attachments.map((item) => `${item.type} "${item.title ?? "untitled"}" (${item.assetId})`).join("; ")}]`;
}

function assistantSummary(content: string, payload: SupercomputerPayload): string {
  const parts = [content];
  if (payload.ideas?.length)
    parts.push(`[Ideas: ${payload.ideas.map((idea, i) => `${i + 1}) ${idea.title}`).join("; ")}]`);
  if (payload.drafts?.length)
    parts.push(
      `[Drafts: ${payload.drafts.map((draft, i) => `${i + 1}) ${draft.title} — ${draft.modelName}${draft.longVideo ? ` (long video: ${draft.longVideo.durations.reduce((sum, value) => sum + value, 0)}s in ${draft.longVideo.durations.length} clips)` : ""}`).join("; ")}]`,
    );
  if (payload.editPlan)
    parts.push(
      `[Edit plan: ${payload.editPlan.shots.map((shot) => `draft ${shot.draftIndex + 1}${shot.seconds ? ` ${shot.seconds}s` : ""}`).join(" → ")}${payload.editPlan.voiceoverScript ? `; voiceover: "${payload.editPlan.voiceoverScript.slice(0, 300)}"` : ""}${payload.editPlan.musicDirection ? `; music: ${payload.editPlan.musicDirection}` : ""}]`,
    );
  return parts.join("\n");
}

const sendInput = z
  .object({
    threadId: z.string().uuid().nullable().optional(),
    text: z.string().max(32000).default(""),
    attachmentAssetIds: z.array(z.string().uuid()).max(16).default([]),
    briefId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    intent: z.enum(["chat", "brainstorm", "drafts", "deliverables", "review"]).default("chat"),
    retryMessageId: z.string().uuid().optional(),
  })
  .refine((value) => value.text.trim().length > 0 || !!value.retryMessageId, {
    message: "Write a message first",
  });

/** One conversation turn: stores the message, asks the agent, stores the validated answer. */
export const sendSupercomputerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const route = await requireReasoning();
    const db = await admin();
    const agent = await import("./supercomputer/agent.server");

    // A retry re-runs the turn that produced a failed answer, in place.
    let failed: { id: string; thread_id: string; created_at: string } | null = null;
    if (data.retryMessageId) {
      const { data: row } = await db
        .from("supercomputer_messages")
        .select("id,thread_id,role,status,created_at")
        .eq("id", data.retryMessageId)
        .maybeSingle();
      if (!row || row.role !== "assistant" || row.status !== "failed")
        throw new AppError("INVALID_PARAMETERS", "That message cannot be retried");
      failed = row;
    }

    /* ---------------- Thread ---------------- */
    const threadId = failed?.thread_id ?? data.threadId ?? null;
    let thread: {
      id: string;
      title: string;
      project_id: string | null;
      campaign_id: string | null;
      brief_id: string | null;
    };
    let isNewThread = false;
    if (threadId) {
      const { data: row, error } = await db
        .from("supercomputer_threads")
        .select("id,title,project_id,campaign_id,brief_id")
        .eq("id", threadId)
        .maybeSingle();
      if (agent.isMissingTable(error)) throw tablesMissing();
      if (!row) throw new AppError("INVALID_PARAMETERS", "That conversation no longer exists");
      thread = row;
      const patch: {
        brief_id?: string | null;
        project_id?: string | null;
        campaign_id?: string | null;
      } = {};
      if (data.briefId !== undefined && data.briefId !== row.brief_id)
        patch.brief_id = data.briefId;
      if (data.projectId !== undefined && data.projectId !== row.project_id)
        patch.project_id = data.projectId;
      if (data.campaignId !== undefined && data.campaignId !== row.campaign_id)
        patch.campaign_id = data.campaignId;
      if (Object.keys(patch).length) {
        await db.from("supercomputer_threads").update(patch).eq("id", row.id);
        thread = { ...row, ...patch };
      }
    } else {
      const { data: row, error } = await db
        .from("supercomputer_threads")
        .insert({
          title: data.text.trim().replace(/\s+/g, " ").slice(0, 80) || "New chat",
          project_id: data.projectId ?? null,
          campaign_id: data.campaignId ?? null,
          brief_id: data.briefId ?? null,
          created_by: context.userId,
        })
        .select("id,title,project_id,campaign_id,brief_id")
        .single();
      if (agent.isMissingTable(error)) throw tablesMissing();
      if (error || !row)
        throw new AppError("UNKNOWN", error?.message ?? "The conversation could not be created");
      thread = row;
      isNewThread = true;
    }

    /* ---------------- User message ---------------- */
    let userMessage: {
      id: string;
      content: string;
      attachments: MessageAttachment[];
      created_at: string;
    };
    if (failed) {
      const { data: prior } = await db
        .from("supercomputer_messages")
        .select("id,content,attachments,created_at")
        .eq("thread_id", thread.id)
        .eq("role", "user")
        .lt("created_at", failed.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prior)
        throw new AppError("INVALID_PARAMETERS", "The original request could not be found");
      userMessage = {
        ...prior,
        attachments: (prior.attachments ?? []) as unknown as MessageAttachment[],
      };
    } else {
      const { data: rows } = data.attachmentAssetIds.length
        ? await db
            .from("assets")
            .select(ASSET_COLUMNS)
            .in("id", data.attachmentAssetIds)
            .is("deleted_at", null)
        : { data: [] as AssetRowLite[] };
      const attachments: MessageAttachment[] = data.attachmentAssetIds
        .map((id) => (rows ?? []).find((row) => row.id === id))
        .filter((row): row is AssetRowLite => !!row)
        .map((row) => ({
          assetId: row.id,
          type: row.asset_type as MediaKind,
          title: row.title,
          bucket: row.storage_bucket,
          path: row.storage_path,
        }));
      const { data: inserted, error } = await db
        .from("supercomputer_messages")
        .insert({
          thread_id: thread.id,
          role: "user",
          content: data.text.trim(),
          attachments: attachments as never,
          payload: { intent: data.intent } as never,
          created_by: context.userId,
        })
        .select("id,content,created_at")
        .single();
      if (error || !inserted)
        throw new AppError("UNKNOWN", error?.message ?? "The message could not be saved");
      userMessage = { ...inserted, attachments };
    }

    /* ---------------- Context ---------------- */
    const { data: earlier } = await db
      .from("supercomputer_messages")
      .select("role,content,attachments,payload,status")
      .eq("thread_id", thread.id)
      .lt("created_at", userMessage.created_at)
      .order("created_at", { ascending: false })
      .limit(14);
    const history = (earlier ?? [])
      .reverse()
      .filter((row) => row.status !== "failed")
      .map((row) => ({
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content:
          row.role === "assistant"
            ? assistantSummary(row.content, (row.payload ?? {}) as SupercomputerPayload)
            : `${row.content}${attachmentSummary((row.attachments ?? []) as unknown as MessageAttachment[])}`,
      }));

    // Every asset seen in this conversation may be used as a draft reference.
    const allowed = new Map<
      string,
      { id: string; type: MediaKind; title: string | null; origin: string }
    >();
    for (const row of earlier ?? []) {
      for (const item of (row.attachments ?? []) as unknown as MessageAttachment[]) {
        allowed.set(item.assetId, {
          id: item.assetId,
          type: item.type,
          title: item.title,
          origin: "attached earlier",
        });
      }
    }
    for (const item of userMessage.attachments) {
      allowed.set(item.assetId, {
        id: item.assetId,
        type: item.type,
        title: item.title,
        origin: "attached to this message",
      });
    }

    let briefBlock = "";
    const briefImages: AssetRowLite[] = [];
    // What the brief says each of its images is, for spotting the brand's logo.
    const imageNotes = new Map<string, { description: string; suggestedUse: string }>();
    if (thread.brief_id) {
      const { data: brief } = await db
        .from("creative_briefs")
        .select("title,analysis,extracted_text,status")
        .eq("id", thread.brief_id)
        .maybeSingle();
      if (brief) {
        const analysis = { ...((brief.analysis ?? {}) as Record<string, unknown>) };
        delete analysis["analysed_at"];
        delete analysis["model"];
        for (const note of (Array.isArray(analysis["image_notes"])
          ? analysis["image_notes"]
          : []) as Record<string, unknown>[])
          if (typeof note["asset_id"] === "string")
            imageNotes.set(note["asset_id"], {
              description: typeof note["description"] === "string" ? note["description"] : "",
              suggestedUse: typeof note["suggested_use"] === "string" ? note["suggested_use"] : "",
            });
        const hasAnalysis = Object.keys(analysis).length > 0;
        briefBlock = [
          `## BRIEF: ${brief.title}`,
          hasAnalysis ? `Structured brief (JSON):\n${JSON.stringify(analysis)}` : "",
          brief.extracted_text
            ? `Brief text (excerpt):\n${brief.extracted_text.slice(0, hasAnalysis ? 8000 : 24000)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const { data: links } = await db
          .from("creative_brief_assets")
          .select(
            "caption,page_number,position,asset:assets(id,asset_type,storage_bucket,storage_path,title,mime_type,metadata,deleted_at)",
          )
          .eq("brief_id", thread.brief_id)
          .order("position")
          .limit(40);
        for (const link of links ?? []) {
          const asset = link.asset as unknown as
            (AssetRowLite & { deleted_at: string | null }) | null;
          if (!asset || asset.deleted_at) continue;
          const caption =
            link.caption ?? (link.page_number ? `page ${link.page_number}` : asset.title);
          if (!allowed.has(asset.id))
            allowed.set(asset.id, {
              id: asset.id,
              type: asset.asset_type as MediaKind,
              title: caption,
              origin: "from the brief",
            });
          briefImages.push(asset);
        }
      }
    }

    const [{ data: project }, { data: campaign }] = await Promise.all([
      thread.project_id
        ? db.from("projects").select("name,description").eq("id", thread.project_id).maybeSingle()
        : Promise.resolve({ data: null }),
      thread.campaign_id
        ? db.from("campaigns").select("name,objective").eq("id", thread.campaign_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // The brand voice that will speak this work's voiceovers, so scripts are written for it.
    let voiceBlock = "";
    const { resolveVoiceWithOrigin, VoicesNotSetUp } = await import("./voice/service.server");
    try {
      const resolved = await resolveVoiceWithOrigin({
        campaignId: thread.campaign_id,
        projectId: thread.project_id,
      });
      if (resolved) {
        const { voice } = resolved;
        const terms = (Array.isArray(voice.pronunciations) ? voice.pronunciations : [])
          .map((rule) => rule.term)
          .filter(Boolean)
          .slice(0, 30);
        voiceBlock = [
          "## BRAND VOICE (speaks every voiceover)",
          `${voice.name}${voice.description ? ` — ${voice.description}` : ""}`,
          voice.script_guidelines ? `Script guidelines: ${voice.script_guidelines}` : "",
          terms.length
            ? `Brand terms (write them exactly like this; the voice knows how to say them): ${terms.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      }
    } catch (error) {
      // Without the brand-voice tables (their migration still to come) there is
      // no voice to write for. Any other failed lookup stops here rather than
      // writing scripts (and plans) that ignore the voice that applies.
      if (!(error instanceof VoicesNotSetUp)) throw error;
    }

    // What the model can see: this message's attachments first, then brief imagery.
    const { data: attachedRows } = userMessage.attachments.length
      ? await db
          .from("assets")
          .select(ASSET_COLUMNS)
          .in(
            "id",
            userMessage.attachments.map((item) => item.assetId),
          )
      : { data: [] as AssetRowLite[] };
    const visionCandidates = [
      ...userMessage.attachments.map((item) =>
        (attachedRows ?? []).find((row) => row.id === item.assetId),
      ),
      ...(briefImages.length &&
      (isNewThread || data.intent === "deliverables" || data.intent === "brainstorm")
        ? briefImages.slice(0, 4)
        : []),
    ]
      .filter((row): row is AssetRowLite => !!row)
      .map(agent.visionSourceFor)
      .filter((source): source is NonNullable<typeof source> => !!source)
      .slice(0, 8);
    const vision = await agent.signVisionSources(visionCandidates);
    const imageIndex = new Map(vision.used.map((source, index) => [source.assetId, index + 1]));

    const models = await agent.activeModels();
    // The image that looks like the brand's logo or end card: a long video's finisher.
    const { suggestFinisher } = await import("./long-video/finisher");
    const finisherHint =
      suggestFinisher(
        [...allowed.values()]
          .filter((asset) => asset.type === "image")
          .map((asset) => ({
            assetId: asset.id,
            title: asset.title,
            description: imageNotes.get(asset.id)?.description ?? null,
            suggestedUse: imageNotes.get(asset.id)?.suggestedUse ?? null,
          })),
      )?.assetId ?? null;
    // The team's characters, for drafts to cast: who they are, their images and Soul IDs.
    const { charactersForAgent } = await import("./characters/service.server");
    const { characterLines } = await import("./supercomputer/draft-characters");
    const characters = await charactersForAgent();
    const mediaLines = [...allowed.values()].map((asset) => {
      const shown = imageIndex.get(asset.id);
      return `- ${asset.id} · ${asset.type} · "${asset.title ?? "untitled"}" · ${asset.origin}${shown ? ` · shown as image #${shown}` : ""}${asset.id === finisherHint ? " · the brand's logo or end card: a long video's finisher, never one of its clips' references" : ""}`;
    });

    const input = [
      "## STUDIO CONTEXT",
      `Project: ${project ? `${project.name}${project.description ? ` — ${project.description}` : ""}` : "none"}`,
      `Campaign: ${campaign ? `${campaign.name}${campaign.objective ? ` — objective: ${campaign.objective}` : ""}` : "none"}`,
      briefBlock,
      voiceBlock,
      "## REFERENCE MEDIA (asset ids usable in drafts)",
      mediaLines.length ? mediaLines.join("\n") : "(none)",
      '## CHARACTERS (the team\'s recurring people and mascots; ids usable in "character_ids")',
      characters.length ? characterLines(characters, models).join("\n") : "(none yet)",
      "## MODEL CATALOGUE (JSON)",
      JSON.stringify(agent.compactCatalogue(models, { longVideo: true })),
      "## REQUEST",
      `Task: ${INTENT_GUIDANCE[data.intent]}`,
      userMessage.content,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await route.provider.generateStructured<Record<string, unknown>>({
      system: agent.SUPERCOMPUTER_SYSTEM,
      input,
      schemaName: "supercomputer_turn",
      schema: agent.SUPERCOMPUTER_SCHEMA,
      model: route.model,
      images: vision.urls,
      history,
      timeoutMs: 170_000,
    });

    /* ---------------- Assistant message ---------------- */
    let row: Record<string, unknown>;
    if (!result.ok || !result.data) {
      row = {
        role: "assistant",
        content: "",
        payload: { intent: data.intent, backend: route.backend } as never,
        model: result.model ?? route.model,
        status: "failed",
        error_message: result.errorMessage ?? "The assistant could not answer. Try again.",
      };
    } else {
      const raw = result.data;
      const ideas = agent.normalizeIdeas(raw["ideas"]);
      const { drafts, dropped, indexMap } = agent.normalizeDrafts(raw["drafts"], models, allowed, {
        finisherHint,
        characters,
      });
      // A long video isn't a shot of an edit: it opens in the Editor as its own clips.
      const shotMap = indexMap.map((index) =>
        index !== null && !drafts[index]?.longVideo ? index : null,
      );
      const editPlan =
        shotMap.filter((index) => index !== null).length > 1
          ? agent.normalizeEditPlan(raw["edit_plan"], shotMap)
          : undefined;
      const payload: SupercomputerPayload = {
        intent: data.intent,
        ideas,
        drafts,
        ...(editPlan ? { editPlan } : {}),
        questions: agent.textList(raw["questions"], 5, 300),
        suggestions: agent.textList(raw["suggestions"], 4, 120),
        dropped,
        backend: route.backend,
      };
      const reply =
        (typeof raw["reply"] === "string" ? raw["reply"].trim().slice(0, 32000) : "") ||
        (drafts.length
          ? "Here are drafts ready to generate."
          : ideas.length
            ? "Here are a few directions."
            : "Done.");
      row = {
        role: "assistant",
        content: reply,
        payload: payload as never,
        model: result.model ?? route.model,
        status: "complete",
        error_message: null,
      };
      const suggestedTitle =
        typeof raw["thread_title"] === "string" ? raw["thread_title"].trim().slice(0, 80) : "";
      if (isNewThread && suggestedTitle) {
        await db
          .from("supercomputer_threads")
          .update({ title: suggestedTitle })
          .eq("id", thread.id);
      }
    }

    let assistantId: string;
    if (failed) {
      await db
        .from("supercomputer_messages")
        .update(row as never)
        .eq("id", failed.id);
      assistantId = failed.id;
    } else {
      const { data: inserted, error } = await db
        .from("supercomputer_messages")
        .insert({ ...row, thread_id: thread.id } as never)
        .select("id")
        .single();
      if (error || !inserted)
        throw new AppError("UNKNOWN", error?.message ?? "The answer could not be saved");
      assistantId = inserted.id;
    }
    await db
      .from("supercomputer_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread.id);

    return {
      threadId: thread.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantId,
      ok: row["status"] === "complete",
      error: row["status"] === "failed" ? (row["error_message"] as string) : null,
    };
  });

/* ------------------------------------------------------------------ */
/* Briefs                                                              */
/* ------------------------------------------------------------------ */

/** Structures an imported brief: objective, audience, messaging, brand rules and deliverables. */
export const analyseBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ briefId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const db = await admin();
    const agent = await import("./supercomputer/agent.server");

    const { data: brief, error } = await db
      .from("creative_briefs")
      .select("id,title,source_filename,page_count,extracted_text")
      .eq("id", data.briefId)
      .maybeSingle();
    if (agent.isMissingTable(error)) throw tablesMissing();
    if (!brief) throw new AppError("INVALID_PARAMETERS", "That brief no longer exists");

    let route;
    try {
      route = await requireReasoning();
    } catch (failure) {
      await db
        .from("creative_briefs")
        .update({ status: "draft", error_message: "AI analysis is not configured yet." })
        .eq("id", brief.id);
      throw failure;
    }

    await db
      .from("creative_briefs")
      .update({ status: "analysing", error_message: null })
      .eq("id", brief.id);

    const { data: links } = await db
      .from("creative_brief_assets")
      .select(
        "caption,page_number,source,position,asset:assets(id,asset_type,storage_bucket,storage_path,title,mime_type,metadata,deleted_at)",
      )
      .eq("brief_id", brief.id)
      .order("position")
      .limit(40);
    const images = (links ?? [])
      .map((link) => ({
        link,
        asset: link.asset as unknown as (AssetRowLite & { deleted_at: string | null }) | null,
      }))
      .filter((entry) => entry.asset && !entry.asset.deleted_at);
    // Embedded artwork first; page snapshots fill any remaining slots.
    const ordered = [
      ...images.filter((entry) => entry.link.source !== "page"),
      ...images.filter((entry) => entry.link.source === "page"),
    ];
    const vision = await agent.signVisionSources(
      ordered
        .map((entry) => agent.visionSourceFor(entry.asset!))
        .filter((source): source is NonNullable<typeof source> => !!source)
        .slice(0, 8),
    );
    const shown = new Map(vision.used.map((source, index) => [source.assetId, index + 1]));
    const knownIds = new Set(images.map((entry) => entry.asset!.id));

    const input = [
      `DOCUMENT: ${brief.title}${brief.source_filename ? ` (${brief.source_filename})` : ""}${brief.page_count ? `, ${brief.page_count} pages` : ""}`,
      "IMAGES FROM THE DOCUMENT:",
      images.length
        ? images
            .map(({ link, asset }) => {
              const index = shown.get(asset!.id);
              return `- ${asset!.id} · ${link.source === "page" ? `snapshot of page ${link.page_number ?? "?"}` : `image${link.page_number ? ` on page ${link.page_number}` : ""}`}${link.caption ? ` · "${link.caption}"` : ""}${index ? ` · shown as image #${index}` : ""}`;
            })
            .join("\n")
        : "(none)",
      "TEXT:",
      brief.extracted_text.slice(0, 60_000) || "(no extractable text — rely on the images)",
    ].join("\n\n");

    const result = await route.provider.generateStructured<BriefAnalysis>({
      system: agent.BRIEF_ANALYSIS_SYSTEM,
      input,
      schemaName: "brief_analysis",
      schema: agent.BRIEF_ANALYSIS_SCHEMA,
      model: route.model,
      images: vision.urls,
      timeoutMs: 170_000,
    });

    if (!result.ok || !result.data) {
      const message = result.errorMessage ?? "The brief could not be analysed. Try again.";
      await db
        .from("creative_briefs")
        .update({ status: "failed", error_message: message })
        .eq("id", brief.id);
      throw new AppError("PROVIDER_REJECTED", message);
    }

    const analysis: BriefAnalysis = {
      ...result.data,
      deliverables: (result.data.deliverables ?? [])
        .filter((item) => item && typeof item.name === "string")
        .map((item) => ({
          ...item,
          media_type: item.media_type === "video" ? ("video" as const) : ("image" as const),
        }))
        .slice(0, 40),
      image_notes: (result.data.image_notes ?? []).filter(
        (note) => note && knownIds.has(note.asset_id),
      ),
      analysed_at: new Date().toISOString(),
      model: result.model ?? route.model,
    };

    await db
      .from("creative_briefs")
      .update({ analysis: analysis as never, status: "ready", error_message: null })
      .eq("id", brief.id);
    return { analysis };
  });

/* ------------------------------------------------------------------ */
/* Inline prompt help (Create page)                                    */
/* ------------------------------------------------------------------ */

const assistInput = z.object({
  modelId: z.string().uuid(),
  prompt: z.string().max(8000).default(""),
  mode: z.enum(["enhance", "variations", "describe", "brief"]),
  referenceAssetIds: z.array(z.string().uuid()).max(8).default([]),
  briefId: z.string().uuid().nullable().optional(),
  instruction: z.string().max(1000).optional(),
  /** The brand kit the prompt is written for: suggestions keep to its look. */
  brandKitId: z.string().uuid().nullable().optional(),
});

export const assistPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assistInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const route = await requireReasoning();
    const db = await admin();
    const agent = await import("./supercomputer/agent.server");

    const { data: modelRow } = await db
      .from("model_registry")
      .select("*")
      .eq("id", data.modelId)
      .maybeSingle();
    if (!modelRow?.is_active) throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
    const [card] = agent.compactCatalogue([modelRow as never]);

    const { data: refs } = data.referenceAssetIds.length
      ? await db
          .from("assets")
          .select(ASSET_COLUMNS)
          .in("id", data.referenceAssetIds)
          .is("deleted_at", null)
      : { data: [] as AssetRowLite[] };
    const vision = await agent.signVisionSources(
      (refs ?? [])
        .map(agent.visionSourceFor)
        .filter((source): source is NonNullable<typeof source> => !!source)
        .slice(0, 6),
    );
    if (data.mode === "describe" && !vision.urls.length)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Attach a reference image first, then ask for a prompt from it.",
      );

    let briefBlock = "";
    if (data.briefId) {
      const { data: brief } = await db
        .from("creative_briefs")
        .select("title,analysis,extracted_text")
        .eq("id", data.briefId)
        .maybeSingle();
      if (brief) {
        const analysis = brief.analysis as Record<string, unknown>;
        briefBlock = `BRIEF "${brief.title}":\n${
          Object.keys(analysis ?? {}).length
            ? JSON.stringify(analysis)
            : brief.extracted_text.slice(0, 12000)
        }`;
      }
    }
    if (data.mode === "brief" && !briefBlock)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Choose a brief first, then ask for prompts from it.",
      );

    // The brand's look, so suggestions are made in it (Create adds its style line on its own).
    const brandText = data.brandKitId
      ? await (await import("./brand/use.server")).brandBlock(data.brandKitId, 6000, "look")
      : "";

    const maxLength = card?.prompt_max ?? 2000;
    const input = [
      `MODEL (JSON): ${JSON.stringify(card)}`,
      `MODE: ${data.mode}`,
      `CHARACTER LIMIT: ${maxLength}`,
      data.prompt.trim() ? `CURRENT PROMPT:\n${data.prompt.trim()}` : "CURRENT PROMPT: (empty)",
      data.instruction?.trim() ? `USER NOTE: ${data.instruction.trim()}` : "",
      vision.urls.length ? `REFERENCE IMAGES: ${vision.urls.length} attached.` : "",
      briefBlock,
      brandText
        ? `${brandText}\nWrite the subject, action and framing in the brand's look; the studio adds the brand's style line itself, so don't repeat it word for word.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await route.provider.generateStructured<{
      suggestions?: PromptSuggestion[];
      notes?: string;
    }>({
      system: agent.PROMPT_ASSIST_SYSTEM,
      input,
      schemaName: "prompt_suggestions",
      schema: agent.PROMPT_ASSIST_SCHEMA,
      model: route.model,
      images: vision.urls,
      timeoutMs: 120_000,
    });
    if (!result.ok || !result.data)
      throw new AppError(
        "PROVIDER_REJECTED",
        result.errorMessage ?? "No suggestions could be produced. Try again.",
      );

    const suggestions = (result.data.suggestions ?? [])
      .filter((item) => item && typeof item.prompt === "string" && item.prompt.trim())
      .slice(0, 4)
      .map((item) => {
        const suggestion: PromptSuggestion = {
          title: (typeof item.title === "string" && item.title.trim()) || "Suggestion",
          prompt: item.prompt.trim().slice(0, maxLength),
        };
        if (typeof item.rationale === "string" && item.rationale.trim())
          suggestion.rationale = item.rationale.trim();
        return suggestion;
      });
    return { suggestions, notes: typeof result.data.notes === "string" ? result.data.notes : null };
  });
