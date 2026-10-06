import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  CheckSquare,
  Download,
  Film,
  ImageIcon,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useBrief, useBriefAssets } from "@/hooks/useSupercomputerData";
import type { AssetRow } from "@/hooks/useStudioData";
import { analyseBrief } from "@/lib/supercomputer.functions";
import type { BriefDeliverable } from "@/lib/supercomputer/types";
import { signedUrl } from "@/lib/storage";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  briefId: string;
  aiReady: boolean;
  onBrainstorm?: () => void;
  onDraftAll?: () => void;
  onDraftDeliverable?: (deliverable: BriefDeliverable) => void;
  onUseImages?: (assets: AssetRow[]) => void;
  useImagesLabel?: string;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Not analysed", tone: "border-border text-muted-foreground" },
  analysing: { label: "Analysing…", tone: "border-info/40 text-info" },
  ready: { label: "Analysed", tone: "border-success/40 text-success" },
  failed: { label: "Analysis failed", tone: "border-primary/40 text-primary" },
};

export function BriefPanel({
  briefId,
  aiReady,
  onBrainstorm,
  onDraftAll,
  onDraftDeliverable,
  onUseImages,
  useImagesLabel = "Attach selected",
}: Props) {
  const queryClient = useQueryClient();
  const { data: brief, isLoading } = useBrief(briefId);
  const { data: images = [] } = useBriefAssets(briefId);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showText, setShowText] = useState(false);

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (!brief)
    return <p className="text-sm text-muted-foreground">This brief is no longer available.</p>;

  const analysis = brief.analysis ?? {};
  const status = STATUS[brief.status] ?? STATUS["draft"]!;
  const notes = new Map((analysis.image_notes ?? []).map((note) => [note.asset_id, note]));
  const colours = (analysis.brand_guidelines?.colours ?? []).map((value) => ({
    value,
    hex: /#(?:[0-9a-f]{3}){1,2}\b/i.exec(value)?.[0] ?? null,
  }));
  const deliverables = analysis.deliverables ?? [];
  const hasAnalysis = brief.status === "ready" && !!analysis.summary;

  async function runAnalysis() {
    setRunning(true);
    try {
      await analyseBrief({ data: { briefId } });
      toast.success("Brief analysed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The brief could not be analysed.");
    } finally {
      setRunning(false);
      await queryClient.invalidateQueries({ queryKey: ["creative_briefs"] });
    }
  }

  async function downloadSource() {
    if (!brief?.source_bucket || !brief.source_path) return;
    const url = await signedUrl(brief.source_bucket, brief.source_path, 300);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("The original document is not available.");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", status.tone)}>
            {status.label}
          </span>
          {brief.page_count ? (
            <span className="text-[11px] text-muted-foreground">{brief.page_count} pages</span>
          ) : null}
          {brief.source_path && (
            <button
              type="button"
              onClick={() => void downloadSource()}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3" /> {brief.source_filename ?? "Original"}
            </button>
          )}
        </div>
        {analysis.brand && <p className="label-eyebrow">{analysis.brand}</p>}
        {analysis.summary && <p className="text-sm leading-relaxed">{analysis.summary}</p>}
      </header>

      {brief.status === "analysing" && (
        <div className="flex items-center gap-3 rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
          <Loader2 className="size-4 animate-spin" /> Reading the brief: objective, audience,
          messaging, brand rules and deliverables. This usually takes under a minute.
        </div>
      )}
      {brief.status === "failed" && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{brief.error_message ?? "The analysis did not complete."}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onBrainstorm && (
          <Button size="sm" onClick={onBrainstorm} disabled={!aiReady}>
            <Lightbulb className="mr-1.5 size-4" /> Brainstorm concepts
          </Button>
        )}
        {onDraftAll && (
          <Button size="sm" variant="outline" onClick={onDraftAll} disabled={!aiReady}>
            <ListChecks className="mr-1.5 size-4" /> Draft every deliverable
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void runAnalysis()}
          disabled={!aiReady || running || brief.status === "analysing"}
        >
          {running ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : hasAnalysis ? (
            <RefreshCw className="mr-1.5 size-4" />
          ) : (
            <Brain className="mr-1.5 size-4" />
          )}
          {hasAnalysis ? "Re-analyse" : "Analyse"}
        </Button>
      </div>

      {hasAnalysis && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Objective" value={analysis.objective} />
          <Field label="Audience" value={analysis.audience} />
          {analysis.key_message && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:col-span-2">
              <span className="label-eyebrow block">Key message</span>
              <p className="mt-1 font-display text-base font-semibold">“{analysis.key_message}”</p>
              {!!analysis.supporting_messages?.length && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {analysis.supporting_messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Field label="Tone" value={analysis.tone} />
          <Field label="Visual direction" value={analysis.visual_direction} />
          {(colours.length > 0 ||
            analysis.brand_guidelines?.typography ||
            analysis.brand_guidelines?.logo_usage) && (
            <div className="space-y-2 rounded-lg border border-border p-3 sm:col-span-2">
              <span className="label-eyebrow block">Brand</span>
              {colours.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {colours.map((colour) => (
                    <span
                      key={colour.value}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]"
                    >
                      {colour.hex && (
                        <span
                          className="size-3 rounded-full border border-border"
                          style={{ backgroundColor: colour.hex }}
                        />
                      )}
                      {colour.value}
                    </span>
                  ))}
                </div>
              )}
              {analysis.brand_guidelines?.typography && (
                <p className="text-xs text-muted-foreground">
                  Type: {analysis.brand_guidelines.typography}
                </p>
              )}
              {analysis.brand_guidelines?.logo_usage && (
                <p className="text-xs text-muted-foreground">
                  Logo: {analysis.brand_guidelines.logo_usage}
                </p>
              )}
              <RuleList title="Do" items={analysis.brand_guidelines?.dos} />
              <RuleList title="Don't" items={analysis.brand_guidelines?.donts} />
            </div>
          )}
          {!!analysis.mandatories?.length && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 sm:col-span-2">
              <span className="label-eyebrow block">Mandatories</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {analysis.mandatories.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {hasAnalysis && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="label-eyebrow">Deliverables ({deliverables.length})</h3>
          </div>
          {deliverables.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {deliverables.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-raised/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {item.media_type === "video" ? (
                        <Film className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="size-3.5 text-muted-foreground" />
                      )}
                      {item.name}
                    </span>
                    {item.quantity && item.quantity > 1 ? (
                      <Badge variant="outline">×{item.quantity}</Badge>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {[
                      item.channel,
                      item.aspect_ratio,
                      item.duration_seconds ? `${item.duration_seconds}s` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Format not specified"}
                  </p>
                  {item.copy && <p className="text-xs">“{item.copy}”</p>}
                  {item.notes && <p className="text-[11px] text-muted-foreground">{item.notes}</p>}
                  {onDraftDeliverable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-auto h-7 w-fit px-2 text-xs text-primary"
                      disabled={!aiReady}
                      onClick={() => onDraftDeliverable(item)}
                    >
                      <Sparkles className="mr-1 size-3.5" /> Draft this
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The brief does not list specific deliverables.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="label-eyebrow">Images from the brief ({images.length})</h3>
          {onUseImages && images.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!selected.size}
              onClick={() => {
                onUseImages(
                  images.filter((row) => selected.has(row.asset.id)).map((row) => row.asset),
                );
                setSelected(new Set());
              }}
            >
              {useImagesLabel}
              {selected.size ? ` (${selected.size})` : ""}
            </Button>
          )}
        </div>
        {images.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((row) => {
              const on = selected.has(row.asset.id);
              const note = notes.get(row.asset.id);
              return (
                <button
                  key={row.asset.id}
                  type="button"
                  title={
                    note
                      ? `${note.description}${note.suggested_use ? ` — ${note.suggested_use}` : ""}`
                      : (row.caption ?? undefined)
                  }
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(row.asset.id)) next.delete(row.asset.id);
                      else next.add(row.asset.id);
                      return next;
                    })
                  }
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border bg-surface",
                    on
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border hover:border-input",
                  )}
                >
                  <MediaPreview
                    bucket={row.asset.storage_bucket}
                    path={row.asset.storage_path}
                    type="image"
                    contain
                  />
                  {onUseImages && (
                    <span className="absolute top-1.5 left-1.5">
                      {on ? (
                        <CheckSquare className="size-4 text-primary" />
                      ) : (
                        <Square className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      )}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-0.5 text-left text-[10px] text-muted-foreground">
                    {note?.suggested_use ??
                      row.caption ??
                      (row.source === "page" ? `Page ${row.page_number}` : "Image")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No images were kept from this brief.</p>
        )}
      </section>

      {hasAnalysis && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ListBlock title="Channels" items={analysis.channels} />
          <ListBlock title="KPIs" items={analysis.kpis} />
          <Field label="Timeline" value={analysis.timeline} />
          <Field label="Budget" value={analysis.budget} />
          {!!analysis.open_questions?.length && (
            <div className="rounded-lg border border-border p-3 sm:col-span-2">
              <span className="label-eyebrow block">Open questions for the client</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {analysis.open_questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          className="label-eyebrow underline-offset-2 hover:underline"
          onClick={() => setShowText((value) => !value)}
        >
          {showText ? "Hide brief text" : "Show brief text"}
        </button>
        {showText && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-sans text-xs text-muted-foreground scroll-slim">
            {brief.extracted_text || "(no text was extracted)"}
          </pre>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="label-eyebrow block">{label}</span>
      <p className="mt-1 text-xs leading-relaxed">{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="label-eyebrow block">{title}</span>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RuleList({ title, items }: { title: string; items?: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{title}:</span>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
