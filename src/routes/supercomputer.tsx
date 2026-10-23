import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowDown,
  Brain,
  Clapperboard,
  Cpu,
  FileText,
  Globe,
  Hand,
  Images,
  Layers,
  Lightbulb,
  Loader2,
  Palette,
  PanelLeft,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AssetDetailDialog } from "@/components/studio/AssetDetailDialog";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { BriefImportDialog } from "@/components/briefs/BriefImportDialog";
import { BriefPanel } from "@/components/briefs/BriefPanel";
import { Composer } from "@/components/supercomputer/Composer";
import {
  AssistantMessage,
  ThinkingBubble,
  UserMessage,
  type AgentView,
} from "@/components/supercomputer/Messages";
import { ThreadSidebar } from "@/components/supercomputer/ThreadSidebar";
import { AgentComposer } from "@/components/supercomputer/agent/AgentComposer";
import { ArtifactsPanel, MemoryDialog } from "@/components/supercomputer/agent/AgentPanels";
import { SectionsPanel } from "@/components/supercomputer/agent/SectionsPanel";
import type { ApprovalDecisions } from "@/components/supercomputer/agent/AgentTranscript";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useAgentStatus, useAgentStream } from "@/hooks/useAgent";
import { useSectionPlans, useSectionRunner } from "@/hooks/useSections";
import { useModels, useProjects, type AssetRow } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";
import {
  THREAD_COLUMNS,
  useBriefs,
  useSupercomputerRealtime,
  useSupercomputerStatus,
  useThreadMessages,
  type MessageRow,
  type ThreadRow,
} from "@/hooks/useSupercomputerData";
import { sendSupercomputerMessage } from "@/lib/supercomputer.functions";
import { saveAgentSettings, stopAgentTurn } from "@/lib/supercomputer-agent.functions";
import {
  documentsOf,
  generationsOf,
  storedDisplay,
  type AgentDisplay,
} from "@/lib/supercomputer/agent-events";
import {
  AGENT_EFFORT_LABELS,
  agentModelLabel,
  DEFAULT_THREAD_SETTINGS,
  takesFallbacks,
  threadSettingsOf,
  type AgentThreadSettings,
} from "@/lib/supercomputer/agent-settings";
import { takeSupercomputerHandoff } from "@/lib/supercomputer/handoff";
import type {
  BriefDeliverable,
  MessageAttachment,
  SupercomputerIntent,
} from "@/lib/supercomputer/types";
import { isBriefFile } from "@/lib/briefs/parse-document";
import { mediaKindFor, uploadReference } from "@/lib/storage";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  thread: z.string().uuid().optional(),
  brief: z.string().uuid().optional(),
});

export const Route = createFileRoute("/supercomputer")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Supercomputer · Xeno Studio" },
      {
        name: "description",
        content:
          "The studio's creative agent: it thinks, researches, works from briefs and brands, makes images and videos and checks its own work.",
      },
      { property: "og:title", content: "Supercomputer · Xeno Studio" },
      { property: "og:description", content: "The studio's creative AI agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupercomputerPage,
});

const MAX_ATTACHMENTS = 16;

type SendOptions = { fromComposer?: boolean; newThread?: boolean; briefId?: string | null };

function toAttachment(asset: {
  id: string;
  asset_type: string;
  title: string | null;
  storage_bucket: string;
  storage_path: string;
}): MessageAttachment {
  return {
    assetId: asset.id,
    type: asset.asset_type as MessageAttachment["type"],
    title: asset.title,
    bucket: asset.storage_bucket,
    path: asset.storage_path,
  };
}

function useThread(threadId: string | null, enabled: boolean, agentColumns: boolean) {
  return useQuery({
    queryKey: ["supercomputer_threads", "detail", threadId, agentColumns],
    enabled: enabled && !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supercomputer_threads")
        .select(agentColumns ? `${THREAD_COLUMNS},settings,pinned` : THREAD_COLUMNS)
        .eq("id", threadId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ThreadRow | null;
    },
  });
}

/** The model and effort a new conversation starts with: the last ones chosen in this browser. */
const AGENT_DEFAULTS_KEY = "xeno.supercomputer.agent";

function agentDefaults(): AgentThreadSettings {
  try {
    const raw = window.localStorage.getItem(AGENT_DEFAULTS_KEY);
    const saved = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    return threadSettingsOf({ model: saved["model"], effort: saved["effort"] });
  } catch {
    return DEFAULT_THREAD_SETTINGS;
  }
}

function keepAgentDefaults(settings: AgentThreadSettings) {
  try {
    window.localStorage.setItem(
      AGENT_DEFAULTS_KEY,
      JSON.stringify({ model: settings.model, effort: settings.effort }),
    );
  } catch {
    // A convenience of this browser only.
  }
}

/** A clock for things shown by age (an answer that stopped moving is shown as cut off). */
function useClock(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function SupercomputerPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const statusQuery = useSupercomputerStatus();
  const status = statusQuery.data;
  const statusLoading = statusQuery.isPending;
  const statusFailed = statusQuery.isError;
  const tablesReady = status?.tablesReady === true;
  const aiReady = !!status?.backend;
  // The agent: on Claude, once its key is set and its database update (0022) is in.
  const agentQuery = useAgentStatus();
  const agentSettled = agentQuery.data !== undefined || agentQuery.fetchStatus === "idle";
  const agentTables = tablesReady && agentQuery.data?.tablesReady === true;
  const agentMode = agentTables && agentQuery.data?.configured === true;
  const { data: models = [] } = useModels();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useCampaigns();
  const { data: briefs = [] } = useBriefs(tablesReady);

  const threadId = search.thread ?? null;
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const { data: thread } = useThread(threadId, tablesReady && agentSettled, agentTables);
  const { data: messages = [], isLoading: messagesLoading } = useThreadMessages(
    tablesReady && agentSettled ? threadId : null,
    agentTables,
  );
  // Following a conversation this page started, into the page it gets once it's made.
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  const follow = useCallback((value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
  }, []);
  const stream = useAgentStream({
    onThread: (id) => {
      if (!followingRef.current || threadIdRef.current === id) return;
      void navigate({
        search: (previous) => ({
          ...(previous.brief ? { brief: previous.brief } : {}),
          thread: id,
        }),
      });
    },
  });
  const live = stream.live;
  const liveHere =
    live && (live.threadId === threadId || (following && threadId === null && live.origin === null))
      ? live
      : null;
  useSupercomputerRealtime(threadId, tablesReady, live?.threadId ?? null);

  // Context for a chat that does not exist yet; an open thread carries its own.
  const [draftContext, setDraftContext] = useState<{
    projectId: string | null;
    campaignId: string | null;
    briefId: string | null;
  }>({
    projectId: null,
    campaignId: null,
    briefId: null,
  });
  const context = thread
    ? { projectId: thread.project_id, campaignId: thread.campaign_id, briefId: thread.brief_id }
    : draftContext;

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [intent, setIntent] = useState<SupercomputerIntent>("chat");
  const [pending, setPending] = useState<{
    text: string;
    attachments: MessageAttachment[];
    startedAt: number;
  } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [editing, setEditing] = useState<{
    messageId: string;
    before: { text: string; attachments: MessageAttachment[] };
  } | null>(null);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [artifactFocus, setArtifactFocus] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [sectionsFocus, setSectionsFocus] = useState<string | null>(null);

  // How the agent runs: a new conversation's own choice, or the open one's (saved with it).
  const [draftSettings, setDraftSettings] = useState<AgentThreadSettings>(DEFAULT_THREAD_SETTINGS);
  const [settingsPatch, setSettingsPatch] = useState<{
    threadId: string;
    patch: Partial<AgentThreadSettings>;
  } | null>(null);
  useEffect(() => setDraftSettings(agentDefaults()), []);
  const settings = thread
    ? threadSettingsOf({
        ...((thread.settings ?? {}) as Record<string, unknown>),
        ...(settingsPatch?.threadId === thread.id ? settingsPatch.patch : {}),
      })
    : draftSettings;
  const canAct = !thread || thread.created_by === user?.id || isAdmin;
  const clock = useClock(30_000);

  // Working in sections (migration 0036): the conversation's plans, and their
  // workers run from this page one after another, each its own request, while
  // the conversation's own turn isn't streaming.
  const sectionsReady = agentMode && agentQuery.data?.sectionsReady === true;
  const { data: plans = [] } = useSectionPlans(threadId, sectionsReady && !!thread);
  const runner = useSectionRunner({
    plans,
    enabled: sectionsReady && !!thread && canAct && !stream.busy,
  });
  // A turn that ends may have planned or queued sections.
  useEffect(() => {
    if (!stream.busy && sectionsReady)
      void queryClient.invalidateQueries({ queryKey: ["supercomputer_section_plans"] });
  }, [stream.busy, sectionsReady, queryClient]);
  // Said above the composer: a worker waiting for the person, or one working from this page.
  const sectionsNote = (() => {
    for (const plan of plans)
      for (const section of plan.sections)
        if (section.status === "awaiting_approval" && section.id !== runner.liveSectionId)
          return {
            planId: plan.id,
            waiting: true,
            text: `Section ${section.position + 1}'s worker waits for your approval.`,
          };
    const working = plans.find((plan) =>
      plan.sections.some((section) => section.id === runner.liveSectionId),
    );
    const section = working?.sections.find((entry) => entry.id === runner.liveSectionId);
    return working && section
      ? {
          planId: working.id,
          waiting: false,
          text: `Section ${section.position + 1}'s worker is building “${section.title}”.`,
        }
      : null;
  })();

  // Prefill from Create / Library hand-offs. Nothing is sent automatically.
  useEffect(() => {
    const handoff = takeSupercomputerHandoff();
    if (!handoff) return;
    setText(handoff.text ?? "");
    setAttachments(handoff.attachments ?? []);
    if (handoff.intent) setIntent(handoff.intent);
    setDraftContext({
      projectId: handoff.projectId ?? null,
      campaignId: handoff.campaignId ?? null,
      briefId: handoff.briefId ?? null,
    });
    // A conversation made for the hand-off (a work carried on) stays open.
    if (search.thread && handoff.threadId !== search.thread) void navigate({ search: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    atBottomRef.current = true;
  }, [messages.length, pending, liveHere?.assistantMessageId]);

  // An answer being written keeps the view at its end, unless the person scrolled up to read.
  const liveDisplay = liveHere?.display;
  useEffect(() => {
    const element = scrollRef.current;
    if (element && liveDisplay && atBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [liveDisplay]);

  const selectThread = useCallback(
    (id: string | null) => {
      setSidebarOpen(false);
      setPending(null);
      follow(false);
      if (editing) {
        setText(editing.before.text);
        setAttachments(editing.before.attachments);
        setEditing(null);
      }
      if (!id) setDraftContext({ projectId: null, campaignId: null, briefId: null });
      void navigate({
        search: (previous) => ({
          ...(previous.brief ? { brief: previous.brief } : {}),
          ...(id ? { thread: id } : {}),
        }),
      });
    },
    [navigate, follow, editing],
  );

  const openBrief = useCallback(
    (id: string | null) => {
      setSidebarOpen(false);
      void navigate({
        search: (previous) => ({
          ...(previous.thread ? { thread: previous.thread } : {}),
          ...(id ? { brief: id } : {}),
        }),
      });
    },
    [navigate],
  );

  const disabledReason = statusFailed
    ? "Supercomputer is unreachable"
    : statusLoading
      ? "Checking the AI service…"
      : !tablesReady
        ? "Database update pending"
        : !aiReady
          ? "AI is not configured"
          : null;

  async function sendClassic(
    body: string,
    chosenIntent: SupercomputerIntent,
    options: SendOptions = {},
  ) {
    const content = body.trim();
    if (!content || pending || disabledReason) return;
    const files = options.fromComposer ? attachments : [];
    const target = options.newThread ? null : threadId;
    const brief = options.briefId !== undefined ? options.briefId : context.briefId;
    const briefRow = brief ? briefs.find((entry) => entry.id === brief) : undefined;

    setPending({ text: content, attachments: files, startedAt: Date.now() });
    if (options.fromComposer) {
      setText("");
      setAttachments([]);
    }
    try {
      const result = await sendSupercomputerMessage({
        data: {
          threadId: target,
          text: content,
          attachmentAssetIds: files.map((item) => item.assetId),
          intent: chosenIntent,
          // An open thread that hasn't loaded yet keeps its brief, project and campaign.
          briefId: options.briefId !== undefined || !target || thread ? (brief ?? null) : undefined,
          projectId: target
            ? thread
              ? context.projectId
              : undefined
            : (context.projectId ?? briefRow?.project_id ?? null),
          campaignId: target
            ? thread
              ? context.campaignId
              : undefined
            : (context.campaignId ?? briefRow?.campaign_id ?? null),
        },
      });
      if (result.threadId !== threadId) {
        void navigate({
          search: (previous) => ({
            ...(previous.brief ? { brief: previous.brief } : {}),
            thread: result.threadId,
          }),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: ["supercomputer_messages", result.threadId],
      });
      void queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
      if (!result.ok && result.error) toast.error(result.error);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Supercomputer could not answer. Try again.",
      );
      if (options.fromComposer) {
        setText(content);
        setAttachments(files);
      }
    } finally {
      setPending(null);
    }
  }

  async function retry(messageId: string) {
    if (pending) return;
    setPending({ text: "", attachments: [], startedAt: Date.now() });
    try {
      const result = await sendSupercomputerMessage({
        data: { retryMessageId: messageId, text: "" },
      });
      await queryClient.invalidateQueries({
        queryKey: ["supercomputer_messages", result.threadId],
      });
      if (!result.ok && result.error) toast.error(result.error);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Supercomputer could not answer. Try again.",
      );
    } finally {
      setPending(null);
    }
  }

  const agentDisabledReason = statusFailed
    ? "Supercomputer is unreachable"
    : !canAct
      ? "Only whoever started this conversation can continue it"
      : null;

  /** Sends a message to the agent (or an edit of an earlier one, from the composer). */
  async function sendAgent(
    body: string,
    options: { fromComposer?: boolean; newThread?: boolean; briefId?: string | null } = {},
  ) {
    const content = body.trim();
    const files = options.fromComposer ? attachments : [];
    if ((!content && !files.length) || stream.busy || agentDisabledReason) return;
    const target = options.newThread ? null : threadId;
    const brief = options.briefId !== undefined ? options.briefId : context.briefId;
    const briefRow = brief ? briefs.find((entry) => entry.id === brief) : undefined;
    const edit = options.fromComposer && target ? editing : null;
    const before = { text, attachments, editing };
    if (options.fromComposer) {
      setText("");
      setAttachments([]);
      setEditing(null);
    }
    if (!target) {
      follow(true);
      // A new conversation from inside another opens on its own page.
      if (threadId) void navigate({ search: {} });
    }
    const outcome = await stream.run(
      {
        threadId: target,
        text: content,
        attachmentAssetIds: files.map((item) => item.assetId),
        // An open thread that hasn't loaded yet keeps its brief, project and campaign.
        briefId: options.briefId !== undefined || !target || thread ? (brief ?? null) : undefined,
        projectId: target
          ? thread
            ? context.projectId
            : undefined
          : (context.projectId ?? briefRow?.project_id ?? null),
        campaignId: target
          ? thread
            ? context.campaignId
            : undefined
          : (context.campaignId ?? briefRow?.campaign_id ?? null),
        settings: target ? settings : draftSettings,
        ...(edit ? { editMessageId: edit.messageId } : {}),
      },
      { text: content, attachments: files, replacing: edit?.messageId ?? null },
    );
    // Nothing was taken: the message goes back where it was written.
    if (!outcome.started && options.fromComposer) {
      setText(before.text);
      setAttachments(before.attachments);
      setEditing(before.editing);
    }
  }

  /** Answers the calls an answer waits on, and lets it carry on from where it was. */
  function decide(message: MessageRow, decisions: ApprovalDecisions) {
    void stream.run(
      { threadId: message.thread_id, approval: { messageId: message.id, decisions }, settings },
      { resuming: message.id, initial: storedDisplay(message) },
    );
  }

  /** A fresh answer to the last message, in place of this one. */
  function regenerate(message: MessageRow) {
    void stream.run(
      { threadId: message.thread_id, regenerate: true, settings },
      { replacing: message.id },
    );
  }

  function startEdit(message: MessageRow) {
    setEditing({
      messageId: message.id,
      before: editing ? editing.before : { text, attachments },
    });
    setText(message.content);
    setAttachments(message.attachments ?? []);
  }

  function cancelEdit() {
    if (!editing) return;
    setText(editing.before.text);
    setAttachments(editing.before.attachments);
    setEditing(null);
  }

  function changeSettings(patch: Partial<AgentThreadSettings>) {
    const next = threadSettingsOf({ ...settings, ...patch });
    keepAgentDefaults(next);
    if (!thread) {
      setDraftSettings(next);
      return;
    }
    setSettingsPatch((current) => ({
      threadId: thread.id,
      patch: { ...(current?.threadId === thread.id ? current.patch : {}), ...patch },
    }));
    if (!canAct) return;
    saveAgentSettings({ data: { threadId: thread.id, settings: patch } })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["supercomputer_threads", "detail", thread.id] }),
      )
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "The setting couldn't be saved"),
      );
  }

  /** The Sections panel, on a plan (or the newest). */
  function openSections(planId: string | null) {
    setSectionsFocus(planId);
    setSectionsOpen(true);
    void queryClient.invalidateQueries({ queryKey: ["supercomputer_section_plans", threadId] });
  }

  function openDocument(document: { title: string; markdown: string }) {
    setArtifactFocus(document.title);
    setArtifactsOpen(true);
  }

  function addAttachments(items: MessageAttachment[]) {
    setAttachments((current) => {
      const next = [...current];
      for (const item of items)
        if (!next.some((entry) => entry.assetId === item.assetId)) next.push(item);
      if (next.length > MAX_ATTACHMENTS)
        toast.info(`Up to ${MAX_ATTACHMENTS} attachments per message.`);
      return next.slice(0, MAX_ATTACHMENTS);
    });
  }

  async function handleFiles(files: File[]) {
    if (!user || !files.length) return;
    const documents = files.filter(isBriefFile);
    const media = files.filter((file) => !isBriefFile(file) && mediaKindFor(file.type));
    const rejected = files.length - documents.length - media.length;
    if (rejected)
      toast.error(
        "Some files were skipped. Attach images, video, audio, or a PDF/Word/PowerPoint brief.",
      );
    if (documents[0]) {
      setImportFile(documents[0]);
      setImportOpen(true);
    }
    for (const file of media) {
      setUploading((count) => count + 1);
      try {
        const asset = await uploadReference(file, {
          userId: user.id,
          projectId: context.projectId,
        });
        addAttachments([toAttachment(asset)]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `${file.name}: ${error.message}`
            : `${file.name} could not be uploaded`,
        );
      } finally {
        setUploading((count) => count - 1);
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
  }

  async function updateThread(patch: {
    project_id?: string | null;
    campaign_id?: string | null;
    brief_id?: string | null;
  }) {
    if (!thread) {
      setDraftContext((current) => ({
        projectId: patch.project_id !== undefined ? patch.project_id : current.projectId,
        campaignId: patch.campaign_id !== undefined ? patch.campaign_id : current.campaignId,
        briefId: patch.brief_id !== undefined ? patch.brief_id : current.briefId,
      }));
      return;
    }
    if (thread.created_by !== user?.id && !isAdmin) {
      toast.error("Only the person who started this conversation can change its context.");
      return;
    }
    const { error } = await supabase
      .from("supercomputer_threads")
      .update(patch)
      .eq("id", thread.id);
    if (error) toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
  }

  function briefAction(kind: "brainstorm" | "all" | "deliverable", deliverable?: BriefDeliverable) {
    const briefId = search.brief ?? null;
    if (!briefId) return;
    openBrief(null);
    const sameThread = !!thread && thread.brief_id === briefId;
    const send = (body: string, chosen: SupercomputerIntent, options: SendOptions) =>
      agentMode ? void sendAgent(body, options) : sendClassic(body, chosen, options);
    if (kind === "brainstorm")
      void send(
        "Brainstorm five genuinely different campaign concepts for this brief.",
        "brainstorm",
        {
          newThread: !sameThread,
          briefId,
        },
      );
    else if (kind === "all")
      void send(
        "Create production-ready drafts for every deliverable in this brief, using the brief's images as references where they help.",
        "deliverables",
        {
          newThread: !sameThread,
          briefId,
        },
      );
    else if (deliverable)
      void send(
        `Create a production-ready draft for the deliverable "${deliverable.name}"${
          [
            deliverable.channel,
            deliverable.aspect_ratio,
            deliverable.duration_seconds ? `${deliverable.duration_seconds}s` : null,
          ].filter(Boolean).length
            ? ` (${[deliverable.channel, deliverable.aspect_ratio, deliverable.duration_seconds ? `${deliverable.duration_seconds}s` : null].filter(Boolean).join(", ")})`
            : ""
        }.`,
        "drafts",
        { newThread: !sameThread, briefId },
      );
  }

  const lastMessage = messages[messages.length - 1];
  const showOptimisticUser =
    !!pending?.text && !(lastMessage?.role === "user" && lastMessage.content === pending.text);
  const activeBrief = briefs.find((entry) => entry.id === context.briefId) ?? null;

  // The conversation as shown: what an edit or a redo in progress replaces makes way for it.
  const replacing = liveHere?.replacing ?? null;
  const shown = useMemo(() => {
    const rows = messages.filter((message) => !message.superseded_at);
    const at = replacing ? rows.findIndex((message) => message.id === replacing) : -1;
    return at >= 0 ? rows.slice(0, at) : rows;
  }, [messages, replacing]);
  const stored = useMemo(() => {
    const map = new Map<string, AgentDisplay>();
    if (!agentTables) return map;
    for (const message of shown) {
      if (message.role !== "assistant") continue;
      const display = storedDisplay(message, clock);
      if (display) map.set(message.id, display);
    }
    return map;
  }, [shown, agentTables, clock]);
  const lastShown = shown.at(-1);
  const liveRowShown =
    !!liveHere && shown.some((message) => message.id === liveHere.assistantMessageId);
  const liveUserPending =
    !!liveHere &&
    !liveRowShown &&
    (!!liveHere.userText || liveHere.attachments.length > 0) &&
    !shown.some((message) => message.id === liveHere.userMessageId);
  const displays = [
    ...shown.flatMap((message) => {
      if (liveHere && message.id === liveHere.assistantMessageId) return [liveHere.display];
      const display = stored.get(message.id);
      return display ? [display] : [];
    }),
    ...(liveHere && !liveRowShown ? [liveHere.display] : []),
  ];
  const artifacts = { documents: documentsOf(displays), generations: generationsOf(displays) };
  const artifactCount = artifacts.documents.length + artifacts.generations.length;
  const empty = !pending && !liveHere && (!threadId || (!messagesLoading && shown.length === 0));

  const messageContext = {
    projectId: context.projectId,
    campaignId: context.campaignId,
    briefId: context.briefId,
    threadId,
  };
  const messagesBusy = agentMode
    ? stream.busy || !!agentDisabledReason
    : !!pending || !!disabledReason;
  const sendFromMessage = (body: string, chosen: SupercomputerIntent) =>
    agentMode ? void sendAgent(body) : void sendClassic(body, chosen);

  const agentView = (message: MessageRow, display: AgentDisplay, isLive: boolean): AgentView => ({
    display,
    actions: {
      onDecide:
        agentMode && canAct && !isLive && !stream.busy && message.status === "awaiting_approval"
          ? (decisions) => decide(message, decisions)
          : null,
      onOpenAsset: setSelectedAsset,
      onOpenDocument: openDocument,
      onOpenSections: sectionsReady ? openSections : undefined,
    },
    onRegenerate:
      agentMode &&
      canAct &&
      !isLive &&
      !stream.busy &&
      message.id === lastShown?.id &&
      display.status !== "streaming"
        ? () => regenerate(message)
        : null,
    onStop:
      canAct && !isLive && display.status === "streaming"
        ? () =>
            void stopAgentTurn({ data: { messageId: message.id } })
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: ["supercomputer_messages", message.thread_id],
                }),
              )
              .catch(() => toast.error("It couldn't be stopped from here"))
        : null,
  });

  const assistantRow = (message: MessageRow) => {
    const isLive = !!liveHere && message.id === liveHere.assistantMessageId;
    const display = isLive ? liveHere.display : (stored.get(message.id) ?? null);
    return (
      <AssistantMessage
        key={message.id}
        message={message}
        models={models}
        context={messageContext}
        busy={messagesBusy}
        onSend={sendFromMessage}
        onRetry={(id) => void retry(id)}
        onOpenAsset={setSelectedAsset}
        onAttach={(asset) => {
          addAttachments([toAttachment(asset)]);
          toast.success("Attached to your next message.");
        }}
        agent={display ? agentView(message, display, isLive) : undefined}
      />
    );
  };

  const sidebar = (
    <ThreadSidebar
      activeThreadId={threadId}
      activeBriefId={search.brief ?? null}
      enabled={tablesReady}
      onSelectThread={selectThread}
      onOpenBrief={(id) => openBrief(id)}
      onImportBrief={() => {
        setImportFile(null);
        setImportOpen(true);
      }}
      pinsEnabled={agentTables}
      streamingThreadId={live?.threadId ?? null}
      sectionsEnabled={sectionsReady}
    />
  );

  return (
    <AppShell title="Supercomputer">
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-sidebar/40 lg:block">
          {sidebar}
        </aside>

        <section
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(Array.from(event.dataTransfer.files ?? []));
          }}
        >
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Chats and briefs"
            >
              <PanelLeft className="size-4" />
            </Button>
            <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
              {thread?.title ?? "New chat"}
            </h2>
            <ContextSelect
              label="Project"
              value={context.projectId}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(value) => void updateThread({ project_id: value })}
            />
            <ContextSelect
              label="Campaign"
              value={context.campaignId}
              options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
              onChange={(value) => void updateThread({ campaign_id: value })}
            />
            {tablesReady && (
              <ContextSelect
                label="Brief"
                value={context.briefId}
                options={briefs.map((brief) => ({ value: brief.id, label: brief.title }))}
                onChange={(value) => void updateThread({ brief_id: value })}
              />
            )}
            {activeBrief && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => openBrief(activeBrief.id)}
              >
                <FileText className="mr-1 size-3.5" /> View brief
              </Button>
            )}
            {agentMode && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    setArtifactFocus(null);
                    setArtifactsOpen(true);
                  }}
                  data-testid="agent-artifacts"
                >
                  <Sparkles className="size-3.5" /> Made here
                  {artifactCount ? (
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                      {artifactCount}
                    </span>
                  ) : null}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Memory"
                  title="What the Supercomputer remembers"
                  onClick={() => setMemoryOpen(true)}
                >
                  <Brain className="size-4" />
                </Button>
                {sectionsReady && plans.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => openSections(null)}
                    data-testid="agent-sections"
                  >
                    <Layers className="size-3.5" /> Sections
                    {runner.busy ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    ) : null}
                  </Button>
                )}
              </>
            )}
          </header>

          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto scroll-slim"
              onScroll={(event) => {
                const element = event.currentTarget;
                const bottom =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 120;
                atBottomRef.current = bottom;
                setAtBottom(bottom);
              }}
            >
              <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
                {statusFailed && (
                  <SetupNotice kind="offline" onRetry={() => void statusQuery.refetch()} />
                )}
                {!statusLoading && !statusFailed && !tablesReady && <SetupNotice kind="tables" />}
                {!statusLoading && tablesReady && !aiReady && !agentMode && (
                  <SetupNotice kind="ai" isAdmin={isAdmin} />
                )}
                {isAdmin && tablesReady && !agentMode && agentQuery.data && (
                  <AgentSetupNotice
                    configured={agentQuery.data.configured}
                    tablesReady={agentQuery.data.tablesReady}
                  />
                )}

                {empty &&
                  !messagesLoading &&
                  (agentMode ? (
                    <AgentHero
                      onPick={(starter) => {
                        if (starter.id === "brief") {
                          setImportFile(null);
                          setImportOpen(true);
                          return;
                        }
                        setText(starter.text);
                      }}
                    />
                  ) : (
                    <EmptyHero
                      onPick={(starter) => {
                        if (starter === "brief") {
                          setImportFile(null);
                          setImportOpen(true);
                          return;
                        }
                        if (starter === "references") {
                          setIntent("drafts");
                          setText(
                            "Write production-ready prompts that build on these references: ",
                          );
                          setLibraryOpen(true);
                          return;
                        }
                        if (starter === "film") {
                          setIntent("drafts");
                          setText(
                            "Plan a 30-second product film in six shots, with a ready-to-run video draft for each shot, for ",
                          );
                          return;
                        }
                        setIntent("brainstorm");
                        setText("Brainstorm five distinct campaign concepts for ");
                      }}
                    />
                  ))}

                {threadId && messagesLoading && <Skeleton className="h-32 w-full" />}

                {shown.map((message) =>
                  message.role === "user" ? (
                    <UserMessage
                      key={message.id}
                      message={message}
                      onEdit={
                        agentMode
                          ? canAct && !stream.busy
                            ? () => startEdit(message)
                            : null
                          : undefined
                      }
                    />
                  ) : (
                    assistantRow(message)
                  ),
                )}

                {liveHere && !liveRowShown && (
                  <>
                    {liveUserPending && (
                      <UserMessage
                        pending
                        message={{
                          id: "pending",
                          thread_id: threadId ?? "",
                          role: "user",
                          content: liveHere.userText,
                          attachments: liveHere.attachments,
                          payload: {},
                          model: null,
                          status: "complete",
                          error_message: null,
                          created_by: user?.id ?? null,
                          created_at: new Date(liveHere.startedAt).toISOString(),
                        }}
                      />
                    )}
                    {assistantRow({
                      id: liveHere.assistantMessageId ?? "live",
                      thread_id: liveHere.threadId ?? "",
                      role: "assistant",
                      content: "",
                      attachments: [],
                      payload: {},
                      model: settings.model,
                      status: "streaming",
                      error_message: null,
                      created_by: user?.id ?? null,
                      created_at: new Date(liveHere.startedAt).toISOString(),
                    })}
                  </>
                )}

                {agentMode &&
                  canAct &&
                  !liveHere &&
                  !stream.busy &&
                  !messagesLoading &&
                  lastShown?.role === "user" && (
                    <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
                      No answer to this yet.
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() =>
                          void stream.run({
                            threadId: lastShown.thread_id,
                            regenerate: true,
                            settings,
                          })
                        }
                      >
                        <RefreshCw className="mr-1.5 size-3.5" /> Answer it
                      </Button>
                    </div>
                  )}

                {pending && (
                  <>
                    {showOptimisticUser && (
                      <UserMessage
                        message={{
                          id: "pending",
                          thread_id: threadId ?? "",
                          role: "user",
                          content: pending.text,
                          attachments: pending.attachments,
                          payload: {},
                          model: null,
                          status: "complete",
                          error_message: null,
                          created_by: user?.id ?? null,
                          created_at: new Date(pending.startedAt).toISOString(),
                        }}
                      />
                    )}
                    <ThinkingBubble startedAt={pending.startedAt} />
                  </>
                )}
              </div>
            </div>
            {!atBottom && (
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full shadow-md"
                aria-label="Jump to the latest"
                onClick={() => {
                  const element = scrollRef.current;
                  element?.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
                }}
              >
                <ArrowDown className="size-4" />
              </Button>
            )}
          </div>

          <div className="mx-auto w-full max-w-4xl px-4 pb-4">
            {sectionsReady && sectionsNote && (
              <div
                className={cn(
                  "mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  sectionsNote.waiting ? "border-warning/50 bg-warning/5" : "border-border",
                )}
              >
                {sectionsNote.waiting ? (
                  <Hand className="size-3.5 shrink-0 text-warning" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                )}
                <span className="min-w-0 flex-1">{sectionsNote.text}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => openSections(sectionsNote.planId)}
                >
                  Open the sections
                </Button>
              </div>
            )}
            {agentMode ? (
              <AgentComposer
                value={text}
                onChange={setText}
                attachments={attachments}
                onRemoveAttachment={(assetId) =>
                  setAttachments((current) => current.filter((item) => item.assetId !== assetId))
                }
                uploading={uploading}
                settings={settings}
                onSettings={changeSettings}
                busy={stream.busy}
                disabledReason={agentDisabledReason}
                editing={!!editing}
                onCancelEdit={cancelEdit}
                onSend={() => void sendAgent(text, { fromComposer: true })}
                onStop={stream.stop}
                onFiles={(files) => void handleFiles(files)}
                onOpenLibrary={() => setLibraryOpen(true)}
                onImportBrief={() => {
                  setImportFile(null);
                  setImportOpen(true);
                }}
              />
            ) : (
              <Composer
                value={text}
                onChange={setText}
                attachments={attachments}
                onRemoveAttachment={(assetId) =>
                  setAttachments((current) => current.filter((item) => item.assetId !== assetId))
                }
                uploading={uploading}
                intent={intent}
                onIntentChange={setIntent}
                hasBrief={!!context.briefId}
                busy={!!pending}
                disabledReason={disabledReason}
                onSend={() => void sendClassic(text, intent, { fromComposer: true })}
                onFiles={(files) => void handleFiles(files)}
                onOpenLibrary={() => setLibraryOpen(true)}
                onImportBrief={() => {
                  setImportFile(null);
                  setImportOpen(true);
                }}
              />
            )}
            <p className="mt-1.5 px-2 text-[10px] text-muted-foreground">
              {agentMode ? (
                <>
                  On {agentModelLabel(settings.model)} ·{" "}
                  {AGENT_EFFORT_LABELS[settings.effort].toLowerCase()} thinking ·{" "}
                  {settings.autoApproveUsd > 0
                    ? `goes ahead with actions up to $${settings.autoApproveUsd} and asks before anything more`
                    : "asks before it spends Higgsfield credits"}
                  {takesFallbacks(settings.model)
                    ? " · if Claude declines a request, another Claude model can answer it"
                    : ""}
                  .
                </>
              ) : (
                <>
                  Planning is free of Higgsfield credits. Nothing is generated until you press
                  Generate on a draft
                  {status?.backend
                    ? ` · AI: ${status.backend === "openai" ? "OpenAI" : "Lovable AI"} (${status.model})`
                    : ""}
                  .
                </>
              )}
            </p>
          </div>

          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
              <div className="text-center">
                <Upload className="mx-auto size-6 text-primary" />
                <p className="mt-2 text-sm font-medium">Drop images, video, audio or a brief</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Chats and briefs</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <Sheet open={!!search.brief} onOpenChange={(open) => !open && openBrief(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="pr-6">
              {briefs.find((entry) => entry.id === search.brief)?.title ?? "Brief"}
            </SheetTitle>
          </SheetHeader>
          {search.brief && (
            <div className="mt-4">
              <BriefPanel
                briefId={search.brief}
                aiReady={aiReady}
                draftsReady={aiReady || agentMode}
                onBrainstorm={() => briefAction("brainstorm")}
                onDraftAll={() => briefAction("all")}
                onDraftDeliverable={(deliverable) => briefAction("deliverable", deliverable)}
                onUseImages={(assets) => {
                  addAttachments(assets.map(toAttachment));
                  updateThread({ brief_id: search.brief ?? null });
                  openBrief(null);
                  toast.success(
                    `${assets.length} image${assets.length === 1 ? "" : "s"} attached.`,
                  );
                }}
                useImagesLabel="Attach to chat"
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        briefsEnabled={tablesReady}
        initialBriefId={context.briefId}
        max={MAX_ATTACHMENTS - attachments.length}
        title="Attach references"
        onConfirm={(assets) => addAttachments(assets.map(toAttachment))}
      />

      <BriefImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initialFile={importFile}
        projectId={context.projectId}
        campaignId={context.campaignId}
        aiReady={aiReady}
        onImported={(briefId) => {
          void updateThread({ brief_id: briefId });
          openBrief(briefId);
        }}
      />

      <AssetDetailDialog
        asset={selectedAsset}
        onOpenChange={(open) => !open && setSelectedAsset(null)}
      />

      {agentMode && (
        <>
          <ArtifactsPanel
            open={artifactsOpen}
            onOpenChange={setArtifactsOpen}
            artifacts={artifacts}
            focus={artifactFocus}
            onOpenAsset={setSelectedAsset}
          />
          <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />
          {sectionsReady && (
            <SectionsPanel
              open={sectionsOpen}
              onOpenChange={setSectionsOpen}
              plans={plans}
              focus={sectionsFocus}
              onFocus={setSectionsFocus}
              runner={runner}
              canAct={canAct}
              actions={{ onOpenAsset: setSelectedAsset, onOpenDocument: openDocument }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

function ContextSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(next) => onChange(next === "none" ? null : next)}
    >
      <SelectTrigger
        className={cn("h-8 w-auto max-w-44 gap-1 text-xs", !value && "text-muted-foreground")}
        aria-label={label}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STARTERS = [
  {
    id: "brainstorm",
    icon: Lightbulb,
    title: "Brainstorm a campaign",
    body: "Distinct concepts with a hook, a look and a reason they work.",
  },
  {
    id: "brief",
    icon: FileText,
    title: "Turn a brief into content",
    body: "Import a PDF, Word or PowerPoint brief and draft every deliverable.",
  },
  {
    id: "references",
    icon: Images,
    title: "Prompts from references",
    body: "Attach product, mood or style images and get model-ready prompts.",
  },
  {
    id: "film",
    icon: Clapperboard,
    title: "Plan a short film",
    body: "A shot list with a ready-to-run video draft for every shot.",
  },
] as const;

function EmptyHero({ onPick }: { onPick: (id: (typeof STARTERS)[number]["id"]) => void }) {
  return (
    <div className="space-y-6 py-6 text-center">
      <div className="space-y-2">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Cpu className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Supercomputer</h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Your creative director. Brainstorm ideas, work from a brief, and get ready-to-run drafts
          routed to the right Higgsfield model. Nothing is generated until you say so.
        </p>
      </div>
      <div className="grid gap-3 text-left sm:grid-cols-2">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => onPick(starter.id)}
            className="group flex gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
          >
            <starter.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{starter.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{starter.body}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const AGENT_STARTERS = [
  {
    id: "make",
    icon: Wand2,
    title: "Make it, check it, refine it",
    body: "It picks the model, generates, looks at what came back and improves it.",
    text: "Make a 9:16 hero image of our product on a clean studio set, look at the result and refine it until it's right.",
  },
  {
    id: "research",
    icon: Globe,
    title: "Research, then plan",
    body: "Searches the web, reads what matters and plans the content around it.",
    text: "Research what's working in short-form video in our category right now, then plan three videos for us.",
  },
  {
    id: "brief",
    icon: FileText,
    title: "Turn a brief into content",
    body: "Import a PDF, Word or PowerPoint brief and get every deliverable drafted.",
    text: "",
  },
  {
    id: "brand",
    icon: Palette,
    title: "Learn a brand",
    body: "Reads a website's colours, fonts and voice into a brand design system.",
    text: "Read the brand's design system from this website: ",
  },
] as const;

function AgentHero({ onPick }: { onPick: (starter: (typeof AGENT_STARTERS)[number]) => void }) {
  return (
    <div className="space-y-6 py-6 text-center">
      <div className="space-y-2">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Cpu className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Supercomputer</h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          The studio's agent, on Claude. It thinks a request through, researches the web, works from
          your library, briefs and brands, makes images and videos with the right model, then looks
          at what it made and refines it. It shows you what it will spend before it does.
        </p>
      </div>
      <div className="grid gap-3 text-left sm:grid-cols-2">
        {AGENT_STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => onPick(starter)}
            className="group flex gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
          >
            <starter.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{starter.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{starter.body}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const AGENT_NOTICE_KEY = "xeno.supercomputer.agent-notice";

/** For admins: what turns the Supercomputer into an agent here. */
function AgentSetupNotice({
  configured,
  tablesReady,
}: {
  configured: boolean;
  tablesReady: boolean;
}) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(AGENT_NOTICE_KEY) === "hidden");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  const steps = [
    !configured ? "add an ANTHROPIC_API_KEY backend secret" : null,
    !tablesReady ? "apply migration 0022_supercomputer_agent" : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">The Supercomputer can work as an agent.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          On Claude it thinks, researches the web, uses the studio's tools, generates and checks its
          own work, and asks before it spends. To turn it on, {steps.join(" and ")}.
        </p>
      </div>
      <button
        type="button"
        aria-label="Hide"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          setHidden(true);
          try {
            window.localStorage.setItem(AGENT_NOTICE_KEY, "hidden");
          } catch {
            // Hidden for this visit only.
          }
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function SetupNotice({
  kind,
  isAdmin = false,
  onRetry,
}: {
  kind: "tables" | "ai" | "offline";
  isAdmin?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      {kind === "offline" ? (
        <div>
          <p className="font-medium">Couldn't reach Supercomputer.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The studio server did not answer the status check. Check your connection and try again.
          </p>
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : kind === "tables" ? (
        <div>
          <p className="font-medium">Supercomputer needs a database update.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Apply migration <code>0002_supercomputer_and_creative_briefs</code>{" "}
            (drizzle/migrations), then reload. Create and the rest of the studio keep working
            meanwhile.
          </p>
        </div>
      ) : (
        <div>
          <p className="font-medium">No AI model is configured for Supercomputer.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It uses an <code>OPENAI_API_KEY</code> backend secret when present, otherwise the
            project's built-in Lovable AI.{" "}
            {isAdmin ? (
              <>
                Check{" "}
                <Link to="/settings" className="underline">
                  Settings → AI
                </Link>
                .
              </>
            ) : (
              "Ask an admin to enable one."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
