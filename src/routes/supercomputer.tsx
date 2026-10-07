import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertTriangle,
  Clapperboard,
  Cpu,
  FileText,
  Images,
  Lightbulb,
  PanelLeft,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AssetDetailDialog } from "@/components/studio/AssetDetailDialog";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { BriefImportDialog } from "@/components/briefs/BriefImportDialog";
import { BriefPanel } from "@/components/briefs/BriefPanel";
import { Composer } from "@/components/supercomputer/Composer";
import { AssistantMessage, ThinkingBubble, UserMessage } from "@/components/supercomputer/Messages";
import { ThreadSidebar } from "@/components/supercomputer/ThreadSidebar";
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
import { useModels, useProjects, type AssetRow } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";
import {
  useBriefs,
  useSupercomputerRealtime,
  useSupercomputerStatus,
  useThreadMessages,
  type ThreadRow,
} from "@/hooks/useSupercomputerData";
import { sendSupercomputerMessage } from "@/lib/supercomputer.functions";
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
          "Brainstorm concepts, work from imported briefs and get ready-to-run drafts for every studio model.",
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

function useThread(threadId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["supercomputer_threads", "detail", threadId],
    enabled: enabled && !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supercomputer_threads")
        .select("id,title,project_id,campaign_id,brief_id,created_by,last_message_at,created_at")
        .eq("id", threadId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ThreadRow | null;
    },
  });
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
  const { data: models = [] } = useModels();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useCampaigns();
  const { data: briefs = [] } = useBriefs(tablesReady);

  const threadId = search.thread ?? null;
  const { data: thread } = useThread(threadId, tablesReady);
  const { data: messages = [], isLoading: messagesLoading } = useThreadMessages(
    tablesReady ? threadId : null,
  );
  useSupercomputerRealtime(threadId, tablesReady);

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
    if (search.thread) void navigate({ search: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const selectThread = useCallback(
    (id: string | null) => {
      setSidebarOpen(false);
      setPending(null);
      if (!id) setDraftContext({ projectId: null, campaignId: null, briefId: null });
      void navigate({
        search: (previous) => ({
          ...(previous.brief ? { brief: previous.brief } : {}),
          ...(id ? { thread: id } : {}),
        }),
      });
    },
    [navigate],
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

  async function send(
    body: string,
    chosenIntent: SupercomputerIntent,
    options: { fromComposer?: boolean; newThread?: boolean; briefId?: string | null } = {},
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
  const empty = !threadId || (!messagesLoading && messages.length === 0 && !pending);

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
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-slim">
            <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
              {statusFailed && (
                <SetupNotice kind="offline" onRetry={() => void statusQuery.refetch()} />
              )}
              {!statusLoading && !statusFailed && !tablesReady && <SetupNotice kind="tables" />}
              {!statusLoading && tablesReady && !aiReady && (
                <SetupNotice kind="ai" isAdmin={isAdmin} />
              )}

              {empty && !messagesLoading && (
                <EmptyHero
                  onPick={(starter) => {
                    if (starter === "brief") {
                      setImportFile(null);
                      setImportOpen(true);
                      return;
                    }
                    if (starter === "references") {
                      setIntent("drafts");
                      setText("Write production-ready prompts that build on these references: ");
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
              )}

              {threadId && messagesLoading && <Skeleton className="h-32 w-full" />}

              {messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    models={models}
                    context={{
                      projectId: context.projectId,
                      campaignId: context.campaignId,
                      briefId: context.briefId,
                      threadId,
                    }}
                    busy={!!pending || !!disabledReason}
                    onSend={(body, chosen) => void send(body, chosen)}
                    onRetry={(id) => void retry(id)}
                    onOpenAsset={setSelectedAsset}
                    onAttach={(asset) => {
                      addAttachments([toAttachment(asset)]);
                      toast.success("Attached to your next message.");
                    }}
                  />
                ),
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

          <div className="mx-auto w-full max-w-4xl px-4 pb-4">
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
              onSend={() => void send(text, intent, { fromComposer: true })}
              onFiles={(files) => void handleFiles(files)}
              onOpenLibrary={() => setLibraryOpen(true)}
              onImportBrief={() => {
                setImportFile(null);
                setImportOpen(true);
              }}
            />
            <p className="mt-1.5 px-2 text-[10px] text-muted-foreground">
              Planning is free of Higgsfield credits. Nothing is generated until you press Generate
              on a draft
              {status?.backend
                ? ` · AI: ${status.backend === "openai" ? "OpenAI" : "Lovable AI"} (${status.model})`
                : ""}
              .
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
