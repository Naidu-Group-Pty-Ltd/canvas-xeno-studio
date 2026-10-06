import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Film,
  ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AssetRow, GenerationRow } from "@/hooks/useStudioData";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { validateParameters } from "@/lib/model-schema";
import { summarizeParameters } from "@/lib/parameter-normalize";
import { ROLE_LABELS } from "@/lib/references";
import { setCreatePrefill } from "@/lib/create-draft";
import type { SupercomputerDraft } from "@/lib/supercomputer/types";
import { ParameterFields } from "@/components/create/ParameterFields";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { estimateAllows, formatEstimate, useDraftRunner, type DraftEstimate } from "./draft-runner";

interface Props {
  draft: SupercomputerDraft;
  index: number;
  messageId: string;
  model: ModelRegistryEntry | undefined;
  runs: { generation: GenerationRow; assets: AssetRow[] }[];
  context: { projectId: string | null; campaignId: string | null };
  onOpenAsset: (asset: AssetRow) => void;
  onAttach: (asset: AssetRow) => void;
}

/** One ready-to-run draft: review, tweak, estimate and generate — results land in the card. */
export function DraftCard({
  draft,
  index,
  messageId,
  model,
  runs,
  context,
  onOpenAsset,
  onAttach,
}: Props) {
  const navigate = useNavigate();
  const runner = useDraftRunner({ messageId, ...context });
  const [prompt, setPrompt] = useState(draft.prompt);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(draft.parameters);
  const [confirming, setConfirming] = useState(false);
  const [quote, setQuote] = useState<DraftEstimate | null>(null);
  const [busy, setBusy] = useState(false);

  const hasPromptField = !!model?.parameter_schema?.fields?.some((field) => field.key === "prompt");
  const submitValues = useMemo(
    () => (hasPromptField ? { ...values, prompt } : values),
    [values, prompt, hasPromptField],
  );
  const roles = draft.references.map((ref) => ref.role);
  const issues = model
    ? validateParameters(model, submitValues, roles).map((issue) => issue.message)
    : ["This model is no longer active"];
  const chips = model ? summarizeParameters(model, submitValues) : [];
  const edited =
    prompt !== draft.prompt || JSON.stringify(values) !== JSON.stringify(draft.parameters);
  const blocked = runner.providerReason ?? issues[0] ?? null;

  async function openConfirm() {
    setConfirming(true);
    setQuote({ kind: "loading" });
    setQuote(await runner.estimate(draft, submitValues, draft.references));
  }

  async function confirm() {
    setBusy(true);
    const ok = await runner.run({
      draft,
      index,
      runNumber: runs.length + 1,
      values: submitValues,
      references: draft.references,
      estimate: quote,
    });
    setBusy(false);
    if (ok) setConfirming(false);
  }

  function openInCreate() {
    setCreatePrefill({
      mediaType: draft.outputType === "video" ? "video" : "image",
      modelId: draft.modelId,
      parameters: submitValues,
      ...(hasPromptField ? { prompt } : {}),
      projectId: context.projectId,
      campaignId: context.campaignId,
      inputs: draft.references.map((ref) => ({ assetId: ref.assetId, role: ref.role })),
    });
    navigate({ to: "/" });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {draft.outputType === "video" ? (
              <Film className="size-4 shrink-0 text-primary" />
            ) : (
              <ImageIcon className="size-4 shrink-0 text-primary" />
            )}
            <h4 className="truncate font-display text-sm font-semibold">{draft.title}</h4>
          </div>
          {draft.purpose && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{draft.purpose}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {draft.modelName}
        </Badge>
      </div>

      {(chips.length > 0 || draft.references.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {chip}
            </span>
          ))}
          {draft.references.map((ref) => (
            <Tooltip key={ref.assetId}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-md border border-border py-0.5 pr-2 pl-0.5 text-[11px] text-muted-foreground">
                  <span className="size-5 overflow-hidden rounded">
                    <ReferenceThumb assetId={ref.assetId} type={ref.assetType} />
                  </span>
                  {ROLE_LABELS[ref.role] ?? ref.role}
                </span>
              </TooltipTrigger>
              <TooltipContent>{ref.title ?? "Reference"}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {hasPromptField &&
        (editing ? (
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            className="text-xs leading-relaxed"
          />
        ) : (
          <p className="line-clamp-4 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {prompt}
          </p>
        ))}

      {draft.notes && <p className="text-[11px] text-muted-foreground italic">{draft.notes}</p>}
      {issues.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {issues.join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                className="accent-glow"
                disabled={!!blocked || busy}
                onClick={() => void openConfirm()}
              >
                <Sparkles className="mr-1.5 size-3.5" />{" "}
                {runs.length ? "Generate again" : "Generate"}
              </Button>
            </span>
          </TooltipTrigger>
          {blocked && <TooltipContent>{blocked}</TooltipContent>}
        </Tooltip>
        <Button size="sm" variant="outline" onClick={openInCreate}>
          <Wand2 className="mr-1.5 size-3.5" /> Open in Create
        </Button>
        {hasPromptField && (
          <Button size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
            <Pencil className="mr-1.5 size-3.5" /> {editing ? "Done" : "Edit prompt"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(prompt).then(() => toast.success("Prompt copied"));
          }}
        >
          <Copy className="mr-1.5 size-3.5" /> Copy
        </Button>
        {edited && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPrompt(draft.prompt);
              setValues(draft.parameters);
            }}
          >
            <RotateCcw className="mr-1.5 size-3.5" /> Reset
          </Button>
        )}
      </div>

      {model && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-3.5" /> Settings
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <ParameterFields
              model={model}
              values={values}
              inputRoles={roles}
              onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {runs.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {runs.map(({ generation, assets }, runIndex) => (
            <div key={generation.id} className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Take {runIndex + 1}</span>
                <StatusBadge status={generation.status} />
                {generation.status === "completed" && generation.ingest_status !== "completed" && (
                  <span>Saving to library…</span>
                )}
                {generation.error_message && generation.status !== "completed" && (
                  <span className="truncate text-primary">{generation.error_message}</span>
                )}
              </div>
              {assets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative size-28 overflow-hidden rounded-lg border border-border bg-background"
                    >
                      <button
                        type="button"
                        className="size-full"
                        onClick={() => onOpenAsset(asset)}
                        aria-label="Open output"
                      >
                        <MediaPreview
                          bucket={asset.storage_bucket}
                          path={asset.storage_path}
                          type={asset.asset_type}
                          contain
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onAttach(asset)}
                        className="absolute right-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Paperclip className="size-3" /> Attach
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate “{draft.title}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {draft.modelName} · estimated cost{" "}
                  <span className="font-mono text-foreground">{formatEstimate(quote)}</span>
                </p>
                {quote?.kind === "metered" && <p className="text-xs">{quote.description}</p>}
                {quote?.kind === "unavailable" && runner.requireEstimate && (
                  <p className="text-xs text-primary">
                    A valid estimate is required before generating.
                  </p>
                )}
                <p className="text-xs">
                  Provider estimate, not a final charge. The result appears in this chat and in the
                  library.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !estimateAllows(quote, runner.requireEstimate)}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {quote?.kind === "ready" ? `Generate · ~$${quote.costUsd.toFixed(2)}` : "Generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Small thumbnail for a reference whose storage location is not in the draft. */
function ReferenceThumb({ assetId, type }: { assetId: string; type: "image" | "video" | "audio" }) {
  const location = useAssetLocation(assetId);
  if (!location) return <span className="block size-full bg-muted" />;
  return <MediaPreview bucket={location.bucket} path={location.path} type={type} />;
}

function useAssetLocation(assetId: string) {
  const { data } = useQuery({
    queryKey: ["asset-location", assetId],
    staleTime: Infinity,
    queryFn: async () => {
      const { data: row } = await supabase
        .from("assets")
        .select("storage_bucket,storage_path")
        .eq("id", assetId)
        .maybeSingle();
      return row ? { bucket: row.storage_bucket, path: row.storage_path } : null;
    },
  });
  return data ?? null;
}
