import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Cpu,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import { useDraftRuns, type MessageRow } from "@/hooks/useSupercomputerData";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import type { SupercomputerIdea, SupercomputerIntent } from "@/lib/supercomputer/types";
import { Markdown } from "@/components/studio/Markdown";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { useProviderHealth } from "@/components/layout/AppShell";
import { DraftCard } from "./DraftCard";
import { providerBlockReason } from "./draft-runner";
import { GenerateAllDialog } from "./GenerateAllDialog";

export function UserMessage({ message }: { message: MessageRow }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(42rem,90%)] space-y-2">
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
        <div className="rounded-2xl rounded-tr-md bg-surface-raised px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}

interface AssistantProps {
  message: MessageRow;
  models: ModelRegistryEntry[];
  context: { projectId: string | null; campaignId: string | null };
  busy: boolean;
  onSend: (text: string, intent: SupercomputerIntent) => void;
  onRetry: (messageId: string) => void;
  onOpenAsset: (asset: AssetRow) => void;
  onAttach: (asset: AssetRow) => void;
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
}: AssistantProps) {
  const payload = message.payload ?? {};
  const drafts = payload.drafts ?? [];
  const { byDraft } = useDraftRuns(message.id, drafts.length > 0);
  const [generateAll, setGenerateAll] = useState(false);
  const runnable = drafts
    .map((draft, index) => ({ draft, index, runNumber: (byDraft.get(index)?.length ?? 0) + 1 }))
    .filter((entry) => !entry.draft.issues.length);
  const { data: health } = useProviderHealth();
  const providerBlocked = health ? providerBlockReason(health) : null;

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Cpu className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        <p className="text-[11px] text-muted-foreground">
          Supercomputer
          {message.model ? ` · ${message.model}` : ""} ·{" "}
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </p>

        {message.status === "failed" ? (
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
            <div className="flex items-center justify-between gap-2">
              <span className="label-eyebrow flex items-center gap-1.5">
                <Layers className="size-3.5" /> Ready to generate ({drafts.length})
              </span>
              {runnable.length > 1 && !providerBlocked && (
                <Button size="sm" variant="outline" onClick={() => setGenerateAll(true)}>
                  <Sparkles className="mr-1.5 size-3.5" /> Generate all ({runnable.length})
                </Button>
              )}
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
