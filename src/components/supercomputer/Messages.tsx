import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import { useDraftLongVideos, useDraftRuns, type MessageRow } from "@/hooks/useSupercomputerData";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { displayText, type AgentDisplay } from "@/lib/supercomputer/agent-events";
import { agentModelLabel } from "@/lib/supercomputer/agent-settings";
import type { SupercomputerIdea, SupercomputerIntent } from "@/lib/supercomputer/types";
import { Markdown } from "@/components/studio/Markdown";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { useProviderHealth } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { AgentTranscript, type TranscriptActions } from "./agent/AgentTranscript";
import { CompileVideo, EditPlanCard, SendPlanToKatana } from "./CompileVideo";
import { DraftCard } from "./DraftCard";
import { providerBlockReason } from "./draft-runner";
import { GenerateAllDialog } from "./GenerateAllDialog";

/** Copies text, and says so for a moment. */
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

export function UserMessage({
  message,
  onEdit,
  pending = false,
}: {
  message: MessageRow;
  /** Edits this message: the conversation picks up again from it (null: not now; left out: no edits here). */
  onEdit?: (() => void) | null | undefined;
  /** Sent, not yet saved. */
  pending?: boolean;
}) {
  return (
    <div className="group flex justify-end" data-testid="user-message">
      <div className={cn("max-w-[min(42rem,90%)] space-y-2", pending && "opacity-80")}>
        {!!message.attachments?.length && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((item) => (
              <span
                key={item.assetId}
                className="size-16 overflow-hidden rounded-lg border border-border bg-background"
                title={item.title ?? undefined}
              >
                <MediaPreview bucket={item.bucket} path={item.path} type={item.type} contain />
              </span>
            ))}
          </div>
        )}
        {message.content && (
          <div className="rounded-2xl rounded-tr-md bg-surface-raised px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {!pending && onEdit !== undefined && (
          <div className="flex justify-end gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {message.content && <CopyButton text={message.content} />}
            {onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Edit"
                title="Edit: the conversation picks up again from here"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** An answer of the agent's: what it showed, and what can be done with it. */
export interface AgentView {
  display: AgentDisplay;
  actions: TranscriptActions;
  /** Makes this answer again (null: it can't be redone now). */
  onRegenerate: (() => void) | null;
  /** Stops it while it's being written from another page (null: not from here). */
  onStop?: (() => void) | null;
}

function tokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
}

interface AssistantProps {
  message: MessageRow;
  models: ModelRegistryEntry[];
  context: {
    projectId: string | null;
    campaignId: string | null;
    briefId?: string | null | undefined;
    threadId?: string | null | undefined;
  };
  busy: boolean;
  onSend: (text: string, intent: SupercomputerIntent) => void;
  onRetry: (messageId: string) => void;
  onOpenAsset: (asset: AssetRow) => void;
  onAttach: (asset: AssetRow) => void;
  /** An answer of the agent's (it shows its transcript). */
  agent?: AgentView | undefined;
}

export function AssistantMessage({
  message,
  models,
  context,
  busy,
  onSend,
  onRetry,
  onOpenAsset,
  onAttach,
  agent,
}: AssistantProps) {
  const payload = message.payload ?? {};
  const drafts = payload.drafts ?? [];
  const { byDraft } = useDraftRuns(message.id, drafts.length > 0);
  const { byDraft: longByDraft } = useDraftLongVideos(
    message.id,
    drafts.some((draft) => draft.longVideo),
  );
  const [generateAll, setGenerateAll] = useState(false);
  // Plain and long-video runs share a draft's run keys, so they count together.
  const runnable = drafts
    .map((draft, index) => ({
      draft,
      index,
      runNumber: (byDraft.get(index)?.length ?? 0) + (longByDraft.get(index)?.length ?? 0) + 1,
    }))
    .filter((entry) => !entry.draft.issues.length);
  const { data: health } = useProviderHealth();
  const providerBlocked = health ? providerBlockReason(health) : null;

  const display = agent?.display;
  const streaming = display?.status === "streaming";
  const usage = display?.usage;
  const answered = display ? (display.model ?? message.model) : message.model;

  return (
    <div className="group flex gap-3" data-testid="assistant-message">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Cpu className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        <p
          className="text-[11px] text-muted-foreground"
          title={
            usage
              ? `${usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens} tokens read (${usage.cacheReadTokens} from cache), ${usage.outputTokens} written`
              : undefined
          }
        >
          Supercomputer
          {answered ? ` · ${display ? agentModelLabel(answered) : answered}` : ""} ·{" "}
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          {usage && !streaming
            ? ` · ${tokens(usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} in, ${tokens(usage.outputTokens)} out`
            : ""}
        </p>

        {display && agent ? (
          <AgentTranscript display={display} actions={agent.actions} />
        ) : message.status === "failed" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
            <AlertTriangle className="size-4 text-primary" />
            <span className="min-w-0 flex-1">
              {message.error_message ?? "The assistant could not answer."}
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetry(message.id)}>
              <RefreshCw className="mr-1.5 size-3.5" /> Try again
            </Button>
          </div>
        ) : (
          message.content && <Markdown text={message.content} />
        )}

        {!!payload.ideas?.length && (
          <div className="grid gap-3 md:grid-cols-2">
            {payload.ideas.map((idea, index) => (
              <IdeaCard
                key={`${idea.title}-${index}`}
                idea={idea}
                index={index}
                busy={busy}
                onSend={onSend}
              />
            ))}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="space-y-3">
            {payload.editPlan && (
              <EditPlanCard plan={payload.editPlan} drafts={drafts}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SendPlanToKatana
                    drafts={drafts}
                    byDraft={byDraft}
                    plan={payload.editPlan}
                    context={context}
                  />
                  <CompileVideo
                    messageId={message.id}
                    drafts={drafts}
                    byDraft={byDraft}
                    plan={payload.editPlan}
                    context={context}
                  />
                </div>
              </EditPlanCard>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label-eyebrow flex items-center gap-1.5">
                <Layers className="size-3.5" /> Ready to generate ({drafts.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {runnable.length > 1 && !providerBlocked && (
                  <Button size="sm" variant="outline" onClick={() => setGenerateAll(true)}>
                    <Sparkles className="mr-1.5 size-3.5" /> Generate all ({runnable.length})
                  </Button>
                )}
                {!payload.editPlan && drafts.filter((draft) => !draft.longVideo).length > 1 && (
                  <CompileVideo
                    messageId={message.id}
                    drafts={drafts}
                    byDraft={byDraft}
                    plan={undefined}
                    context={context}
                  />
                )}
              </div>
            </div>
            {providerBlocked && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                {providerBlocked}. You can still copy prompts or open drafts in Create.
              </p>
            )}
            {drafts.map((draft, index) => (
              <DraftCard
                key={`${message.id}-${index}`}
                draft={draft}
                index={index}
                messageId={message.id}
                model={models.find((model) => model.id === draft.modelId)}
                runs={byDraft.get(index) ?? []}
                longRuns={longByDraft.get(index) ?? []}
                context={context}
                onOpenAsset={onOpenAsset}
                onAttach={onAttach}
              />
            ))}
          </div>
        )}

        {!!payload.dropped?.length && (
          <p className="text-[11px] text-muted-foreground">Skipped: {payload.dropped.join(" ")}</p>
        )}

        {!!payload.questions?.length && (
          <div className="rounded-lg border border-info/30 bg-info/5 p-3">
            <span className="label-eyebrow flex items-center gap-1.5">
              <HelpCircle className="size-3.5" /> To sharpen this
            </span>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
              {payload.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        )}

        {!!payload.suggestions?.length && (
          <div className="flex flex-wrap gap-1.5">
            {payload.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => onSend(suggestion, "chat")}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {display && agent && streaming && agent.onStop && (
          <Button size="sm" variant="outline" className="-mt-2 h-7 text-xs" onClick={agent.onStop}>
            <Square className="mr-1.5 size-3 fill-current" /> Stop
          </Button>
        )}

        {display && agent && !streaming && (
          <div className="-mt-2 flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {displayText(display) && <CopyButton text={displayText(display)} />}
            {agent.onRegenerate && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Try again"
                title="Try again: a fresh answer to your last message"
                onClick={agent.onRegenerate}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {generateAll && (
        <GenerateAllDialog
          open={generateAll}
          onOpenChange={setGenerateAll}
          messageId={message.id}
          drafts={runnable}
          context={context}
        />
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  index,
  busy,
  onSend,
}: {
  idea: SupercomputerIdea;
  index: number;
  busy: boolean;
  onSend: (text: string, intent: SupercomputerIntent) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
          {index + 1}
        </span>
        <h4 className="font-display text-sm font-semibold">{idea.title}</h4>
      </div>
      <p className="text-xs leading-relaxed">{idea.logline}</p>
      {(idea.rationale || idea.visualDirection) && (
        <>
          {open && (
            <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {idea.visualDirection && (
                <p>
                  <span className="text-foreground">Look:</span> {idea.visualDirection}
                </p>
              )}
              {idea.rationale && (
                <p>
                  <span className="text-foreground">Why it works:</span> {idea.rationale}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className="w-fit text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Less" : "More"}
          </button>
        </>
      )}
      {!!idea.formats?.length && (
        <div className="flex flex-wrap gap-1">
          {idea.formats.map((format) => (
            <span
              key={format}
              className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {format}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() =>
            onSend(
              `Develop concept ${index + 1}, "${idea.title}", into production-ready drafts.`,
              "drafts",
            )
          }
        >
          <Sparkles className="mr-1 size-3.5" /> Develop
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() =>
            onSend(
              `Give me three fresh variations on concept ${index + 1}, "${idea.title}".`,
              "brainstorm",
            )
          }
        >
          <Lightbulb className="mr-1 size-3.5" /> Variations
        </Button>
      </div>
    </div>
  );
}

/** Pending answer: honest elapsed time, no fake progress. */
export function ThinkingBubble({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Cpu className="size-4" />
      </span>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border px-4 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        Thinking it through… {seconds}s
        {seconds > 40 && (
          <span className="hidden sm:inline">· detailed briefs can take a minute</span>
        )}
      </div>
    </div>
  );
}
