import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Eye,
  FileText,
  Film,
  Globe,
  Hand,
  Layers,
  Loader2,
  Palette,
  Search,
  Sparkles,
  UsersRound,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAssetsById } from "@/hooks/useLongVideos";
import type { AssetRow } from "@/hooks/useStudioData";
import {
  awaitingApprovals,
  type AgentDisplay,
  type ApprovalRequest,
  type DisplayBlock,
  type ToolUi,
} from "@/lib/supercomputer/agent-events";
import { Markdown } from "@/components/studio/Markdown";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ApprovalDecisions = Record<string, "approve" | "deny">;

export interface TranscriptActions {
  /** Answers calls waiting for approval, by id (null: this answer can't be acted on now). */
  onDecide: ((decisions: ApprovalDecisions) => void) | null;
  onOpenAsset: (asset: AssetRow) => void;
  onOpenDocument: (document: { title: string; markdown: string }) => void;
}

/** A tool's family, for its icon. */
function toolIcon(name: string) {
  if (name === "queue_generation" || name === "make_soul_still") return Sparkles;
  if (name === "view_media") return Eye;
  if (name === "wait_for_generation") return Clock;
  if (name === "estimate_generation") return Coins;
  if (name === "propose_drafts") return Layers;
  if (name === "write_document") return FileText;
  if (name === "remember" || name === "forget") return Brain;
  if (name.includes("brand")) return Palette;
  if (name.includes("character") || name === "train_soul_id") return UsersRound;
  if (
    name.includes("edit") ||
    name.includes("render") ||
    name.includes("long_video") ||
    name.includes("clip")
  )
    return Film;
  if (name.includes("model")) return Wand2;
  return Search;
}

function StatusMark({ status }: { status: string }) {
  if (status === "streaming" || status === "running")
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  if (status === "done") return <Check className="size-3.5 shrink-0 text-success" />;
  if (status === "awaiting_approval") return <Hand className="size-3.5 shrink-0 text-warning" />;
  if (status === "denied") return <XCircle className="size-3.5 shrink-0 text-muted-foreground" />;
  return <AlertTriangle className="size-3.5 shrink-0 text-destructive" />;
}

function Thinking({ text, done }: { text: string; done: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {done ? (
          "Thought it through"
        ) : (
          <span className="flex items-center gap-1.5">
            Thinking
            <span className="inline-flex gap-0.5">
              <span className="size-1 animate-pulse rounded-full bg-primary" />
              <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
              <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
            </span>
          </span>
        )}
      </button>
      {open && text && (
        <div className="mt-1.5 border-l-2 border-border pl-3 text-muted-foreground">
          <Markdown text={text} streaming={!done} compact className="text-xs" />
        </div>
      )}
    </div>
  );
}

const TERMINAL = new Set([
  "completed",
  "failed",
  "canceled",
  "cancelled",
  "nsfw",
  "submission_uncertain",
]);

/** A generation the agent started: its progress, then what it made. */
export function GenerationResult({
  generationId,
  prompt,
  onOpenAsset,
}: {
  generationId: string;
  prompt: string | null;
  onOpenAsset: (asset: AssetRow) => void;
}) {
  const { data } = useQuery({
    queryKey: ["agent-generation", generationId],
    queryFn: async () => {
      const [{ data: generation }, { data: assets }] = await Promise.all([
        supabase
          .from("generations")
          .select("id,status,error_message,model_path")
          .eq("id", generationId)
          .maybeSingle(),
        supabase
          .from("assets")
          .select("*")
          .eq("generation_id", generationId)
          .is("deleted_at", null),
      ]);
      return { generation, assets: (assets ?? []) as unknown as AssetRow[] };
    },
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.assets.length || TERMINAL.has(current?.generation?.status ?? "")
        ? false
        : 4000;
    },
  });
  const status = data?.generation?.status ?? "queued";
  const assets = data?.assets ?? [];
  return (
    <div className="space-y-1.5">
      {assets.length ? (
        <div className="flex flex-wrap gap-2">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onOpenAsset(asset)}
              className="h-40 overflow-hidden rounded-lg border border-border bg-muted transition hover:ring-2 hover:ring-primary/40"
              style={{
                aspectRatio:
                  asset.width && asset.height ? `${asset.width} / ${asset.height}` : "1 / 1",
              }}
            >
              <MediaPreview
                bucket={asset.storage_bucket}
                path={asset.storage_path}
                type={asset.asset_type === "video" ? "video" : "image"}
                alt={asset.title ?? "Generated"}
              />
            </button>
          ))}
        </div>
      ) : TERMINAL.has(status) ? (
        <p className="text-[11px] text-destructive">
          {data?.generation?.error_message ?? `Ended: ${status.replace(/_/g, " ")}`}
        </p>
      ) : (
        <div className="flex h-24 w-40 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {status.replace(/_/g, " ")}
        </div>
      )}
      {prompt && <p className="line-clamp-2 text-[11px] text-muted-foreground">{prompt}</p>}
    </div>
  );
}

function Assets({
  assets,
  onOpenAsset,
}: {
  assets: Extract<ToolUi, { type: "assets" }>["assets"];
  onOpenAsset: (asset: AssetRow) => void;
}) {
  const { data: rows } = useAssetsById(assets.map((asset) => asset.id));
  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => {
            const row = rows?.get(asset.id);
            if (row) onOpenAsset(row);
          }}
          className="size-24 overflow-hidden rounded-lg border border-border bg-muted transition hover:ring-2 hover:ring-primary/40"
          title={asset.title ?? undefined}
        >
          <MediaPreview
            bucket={asset.bucket}
            path={asset.poster ?? asset.path}
            type={asset.kind === "video" && !asset.poster ? "video" : "image"}
            alt={asset.title ?? "Library file"}
          />
        </button>
      ))}
    </div>
  );
}

function Swatches({ palette }: { palette: string[] }) {
  return (
    <span className="flex h-4 w-28 overflow-hidden rounded-sm border border-border">
      {palette.slice(0, 10).map((hex) => (
        <span key={hex} className="flex-1" style={{ background: hex }} />
      ))}
    </span>
  );
}

/** What a tool made or found, shown with its call. */
function ToolResult({ ui, actions }: { ui: ToolUi; actions: TranscriptActions }) {
  switch (ui.type) {
    case "generation":
      return (
        <GenerationResult
          generationId={ui.generationId}
          prompt={ui.prompt}
          onOpenAsset={actions.onOpenAsset}
        />
      );
    case "assets":
      return <Assets assets={ui.assets} onOpenAsset={actions.onOpenAsset} />;
    case "document":
      return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <FileText className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{ui.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {ui.markdown.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              void navigator.clipboard?.writeText(ui.markdown);
              toast.success("Copied.");
            }}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => actions.onOpenDocument(ui)}
          >
            Open
          </Button>
        </div>
      );
    case "brand":
      return (
        <Link to="/brand" className="inline-flex items-center gap-2 text-xs hover:underline">
          <Swatches palette={ui.palette} /> {ui.name}
        </Link>
      );
    case "brand_import":
      return (
        <Link
          to="/brand"
          className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs hover:bg-primary/10"
        >
          <Swatches palette={ui.palette} />
          <span>{ui.name ?? "The brand"}'s design system is ready to review on the Brand page</span>
        </Link>
      );
    case "characters":
      return (
        <div className="flex flex-wrap gap-1">
          {ui.characters.map((character) => (
            <Link
              key={character.id}
              to="/characters/$characterId"
              params={{ characterId: character.id }}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-primary/50"
            >
              {character.name}
            </Link>
          ))}
        </div>
      );
    case "models":
      return (
        <div className="flex flex-wrap gap-1">
          {ui.models.slice(0, 12).map((model) => (
            <span
              key={model.id}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {model.name}
            </span>
          ))}
          {ui.models.length > 12 && (
            <span className="text-[10px] text-muted-foreground">+{ui.models.length - 12} more</span>
          )}
        </div>
      );
    case "edit":
      return (
        <Link
          to="/editor/$sequenceId"
          params={{ sequenceId: ui.sequenceId }}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Film className="size-3.5" /> Open {ui.title ? `“${ui.title}”` : "the edit"} in the Editor
        </Link>
      );
    case "render":
      return ui.sequenceId ? (
        <Link
          to="/editor/$sequenceId"
          params={{ sequenceId: ui.sequenceId }}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Film className="size-3.5" /> Follow the render in the Editor
        </Link>
      ) : null;
    case "long_video":
      return (
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Film className="size-3.5" /> {ui.title ?? "The long video"}: follow it under Long videos
          in Create
        </Link>
      );
    case "memory":
      return (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Brain className="mt-0.5 size-3 shrink-0" />
          {ui.scope === "team" ? "Remembered for the team: " : "Remembered: "}
          {ui.content}
        </p>
      );
    case "drafts":
      return ui.count ? (
        <p className="text-[11px] text-muted-foreground">
          {ui.count} {ui.count === 1 ? "draft is" : "drafts are"} below, ready to run.
        </p>
      ) : null;
    default:
      return null;
  }
}

function Approval({
  approval,
  onDecide,
}: {
  approval: ApprovalRequest;
  onDecide: ((decisions: ApprovalDecisions) => void) | null;
}) {
  return (
    <div
      className="space-y-2.5 rounded-xl border border-warning/50 bg-warning/5 p-3.5"
      data-testid="agent-approval"
    >
      <div className="flex items-start gap-2">
        <Coins className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{approval.title}</p>
          <p className="text-[11px] text-muted-foreground">{approval.reason}</p>
        </div>
        <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-xs font-medium">
          {approval.estimateUsd !== null
            ? `About $${approval.estimateUsd.toFixed(2)}`
            : "Not priced"}
        </span>
      </div>
      {approval.details.length > 0 && (
        <dl className="grid gap-1 text-xs sm:grid-cols-[6rem_1fr]">
          {approval.details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="line-clamp-4 whitespace-pre-wrap">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {onDecide ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8"
            onClick={() => onDecide({ [approval.toolUseId]: "approve" })}
          >
            <CheckCircle2 className="mr-1.5 size-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => onDecide({ [approval.toolUseId]: "deny" })}
          >
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Waiting for an answer.</p>
      )}
    </div>
  );
}

function ToolCall({
  block,
  actions,
}: {
  block: Extract<DisplayBlock, { kind: "tool" }>;
  actions: TranscriptActions;
}) {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon(block.name);
  const input =
    block.input && Object.keys(block.input as object).length
      ? JSON.stringify(block.input, null, 2)
      : "";
  return (
    <div className="space-y-2" data-testid="agent-tool">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-center gap-2 text-left text-xs"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
          <Icon className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{block.label}</span>
          {block.summary && <span className="text-muted-foreground"> · {block.summary}</span>}
        </span>
        <StatusMark status={block.status} />
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      {open && input && (
        <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px] scroll-slim">
          {input.slice(0, 6000)}
        </pre>
      )}
      {block.approval && block.status === "awaiting_approval" && (
        <Approval approval={block.approval} onDecide={actions.onDecide} />
      )}
      {block.ui && block.status !== "error" && (
        <div className="pl-8">
          <ToolResult ui={block.ui} actions={actions} />
        </div>
      )}
    </div>
  );
}

function Web({ block }: { block: Extract<DisplayBlock, { kind: "web" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
          <Globe className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">
            {block.tool === "web_fetch" ? "Reading" : "Searching the web"}
          </span>
          {block.query && <span className="text-muted-foreground"> · {block.query}</span>}
          {block.results.length > 0 && block.tool === "web_search" && (
            <span className="text-muted-foreground"> · {block.results.length} results</span>
          )}
        </span>
        <StatusMark status={block.status} />
      </button>
      {open && block.results.length > 0 && (
        <ul className="space-y-1 pl-8">
          {block.results.map((result) => (
            <li key={result.url} className="truncate">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {result.title}
              </a>{" "}
              <span className="text-muted-foreground">
                {new URL(result.url).hostname.replace(/^www\./, "")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Several calls waiting at once (a batch of generations): answered together. */
function ApproveAll({
  display,
  onDecide,
}: {
  display: AgentDisplay;
  onDecide: ((decisions: ApprovalDecisions) => void) | null;
}) {
  const waiting = awaitingApprovals(display);
  if (waiting.length < 2 || !onDecide) return null;
  const priced = waiting.filter((approval) => approval.estimateUsd !== null);
  const total = priced.reduce((sum, approval) => sum + (approval.estimateUsd ?? 0), 0);
  const all = (decision: "approve" | "deny") =>
    onDecide(Object.fromEntries(waiting.map((approval) => [approval.toolUseId, decision])));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3.5 py-2.5 text-xs">
      <Coins className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        {waiting.length} actions wait for you
        {priced.length
          ? ` · about $${total.toFixed(2)}${priced.length < waiting.length ? " for the priced ones" : " in all"}`
          : ""}
      </span>
      <Button size="sm" className="h-7" onClick={() => all("approve")}>
        <CheckCircle2 className="mr-1.5 size-3.5" /> Approve all
      </Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => all("deny")}>
        Decline all
      </Button>
    </div>
  );
}

/** A turn of the agent, as it streams or as it was kept: its thinking, words, tool calls and searches. */
export function AgentTranscript({
  display,
  actions,
  footer,
}: {
  display: AgentDisplay;
  actions: TranscriptActions;
  footer?: ReactNode;
}) {
  const streaming = display.status === "streaming";
  const last = display.blocks.at(-1)?.block;
  // While nothing new is showing yet (a tool working, the next step starting), say so.
  const waiting =
    streaming &&
    (!last ||
      (last.kind === "tool" && last.status === "done") ||
      (last.kind === "web" && last.status === "done") ||
      ((last.kind === "text" || last.kind === "thinking") && last.done));
  return (
    <div className="space-y-3" data-testid="agent-transcript">
      {display.blocks.map(({ key, block }) => {
        if (block.kind === "thinking")
          return <Thinking key={key} text={block.text} done={block.done} />;
        if (block.kind === "text")
          return block.text ? (
            <Markdown key={key} text={block.text} streaming={!block.done} />
          ) : null;
        if (block.kind === "tool") return <ToolCall key={key} block={block} actions={actions} />;
        if (block.kind === "web") return <Web key={key} block={block} />;
        return (
          <p
            key={key}
            className={cn(
              "flex items-start gap-1.5 rounded-md px-3 py-2 text-xs",
              block.tone === "error"
                ? "bg-destructive/10 text-destructive"
                : block.tone === "warning"
                  ? "bg-warning/10"
                  : "bg-muted/50 text-muted-foreground",
            )}
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {block.text}
          </p>
        );
      })}
      {waiting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          {display.blocks.length ? "Working…" : "Starting…"}
        </p>
      )}
      {display.status === "failed" && display.error && (
        <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {display.error}
        </p>
      )}
      {display.status === "stopped" && (
        <p className="text-[11px] text-muted-foreground">Stopped.</p>
      )}
      <ApproveAll display={display} onDecide={actions.onDecide} />
      {footer}
    </div>
  );
}
