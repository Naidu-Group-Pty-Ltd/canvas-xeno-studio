import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Clapperboard,
  Copy,
  Film,
  Flag,
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
import type { LongVideoRow } from "@/hooks/useLongVideos";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { validateParameters } from "@/lib/model-schema";
import { summarizeParameters } from "@/lib/parameter-normalize";
import { ROLE_LABELS, slotLabel } from "@/lib/references";
import { setCreatePrefill } from "@/lib/create-draft";
import {
  clipEnd,
  clipStarts,
  finaleHolds,
  finaleReveals,
  formatLength,
  LONG_VIDEO_LIMITS,
  modelLine,
  type FinaleMode,
} from "@/lib/long-video/plan";
import type { DraftLongVideoPlan } from "@/lib/supercomputer/long-video-draft";
import type { DraftFinisher, SupercomputerDraft } from "@/lib/supercomputer/types";
import { ParameterFields } from "@/components/create/ParameterFields";
import { LongVideoRunList } from "@/components/create/LongVideoRuns";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { SaveStatus } from "@/components/studio/SaveStatus";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Long videos started from this draft, oldest first. */
  longRuns: LongVideoRow[];
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
  longRuns,
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
  // How a long video ends on the brand's finisher; changeable here before it runs.
  const [finisher, setFinisher] = useState<DraftFinisher | null>(draft.longVideo?.finisher ?? null);
  const runnable = useMemo(
    () => (draft.longVideo ? { ...draft, longVideo: { ...draft.longVideo, finisher } } : draft),
    [draft, finisher],
  );

  const hasPromptField = !!model?.parameter_schema?.fields?.some((field) => field.key === "prompt");
  const submitValues = useMemo(
    () => (hasPromptField ? { ...values, prompt } : values),
    [values, prompt, hasPromptField],
  );
  const roles = draft.references.map((ref) => ref.role);
  // A long video: the prompt is its story, and the plan sets each clip's length.
  // Planned as the runner will quote and start it.
  const { longPlan: planLong } = runner;
  const longPlan = useMemo(
    () => (runnable.longVideo ? planLong(runnable, submitValues, draft.references) : null),
    [runnable, draft.references, planLong, submitValues],
  );
  const issues = !model
    ? ["This model is no longer active"]
    : longPlan
      ? longPlan.issues
      : validateParameters(model, submitValues, roles).map((issue) => issue.message);
  const chips = model
    ? summarizeParameters(
        model,
        draft.longVideo
          ? Object.fromEntries(Object.entries(submitValues).filter(([key]) => key !== "duration"))
          : submitValues,
      )
    : [];
  const edited =
    prompt !== draft.prompt ||
    JSON.stringify(values) !== JSON.stringify(draft.parameters) ||
    JSON.stringify(finisher) !== JSON.stringify(draft.longVideo?.finisher ?? null);
  const blocked = runner.providerReason ?? issues[0] ?? null;
  // Plain and long-video runs share the draft's run keys, so they count together.
  const runNumber = runs.length + longRuns.length + 1;

  async function openConfirm() {
    setConfirming(true);
    setQuote({ kind: "loading" });
    setQuote(await runner.estimate(runnable, submitValues, draft.references));
  }

  async function confirm() {
    setBusy(true);
    const ok = await runner.run({
      draft: runnable,
      index,
      runNumber,
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
      inputs: [
        ...draft.references.map((ref) => ({ assetId: ref.assetId, role: ref.role })),
        // The finisher goes along as an image, for Create to close the video on.
        ...(finisher && !draft.references.some((ref) => ref.assetId === finisher.assetId)
          ? [{ assetId: finisher.assetId, role: "" }]
          : []),
      ],
      ...(draft.longVideo
        ? {
            longVideo: {
              targetSeconds: draft.longVideo.targetSeconds,
              title: draft.longVideo.title,
              continuity: draft.longVideo.continuity,
              beats: draft.longVideo.beats,
              continuationModelId: draft.longVideo.continuationModelId,
              finisher,
            },
          }
        : {}),
    });
    navigate({ to: "/" });
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      data-testid="draft-card"
    >
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
        <div className="flex shrink-0 items-center gap-1.5">
          {draft.longVideo && (
            <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
              Long video
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {draft.modelName}
          </Badge>
        </div>
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
                  {(() => {
                    const slot = model?.capabilities?.inputs?.find(
                      (entry) => entry.role === ref.role,
                    );
                    return slot ? slotLabel(slot) : (ROLE_LABELS[ref.role] ?? ref.role);
                  })()}
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

      {draft.longVideo && model && longPlan && (
        <LongVideoSummary
          model={model}
          plan={longPlan}
          targetSeconds={draft.longVideo.targetSeconds}
          continuity={draft.longVideo.continuity}
          beats={draft.longVideo.beats}
        />
      )}

      {draft.longVideo?.finisher && longPlan?.continuation && (
        <DraftFinisherRow
          original={draft.longVideo.finisher}
          finisher={finisher}
          canMoveInto={!!clipEnd(longPlan.continuation)}
          continuationName={modelLine(longPlan.continuation)}
          onChange={setFinisher}
        />
      )}

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
                {runs.length + longRuns.length
                  ? "Generate again"
                  : draft.longVideo
                    ? "Generate long video"
                    : "Generate"}
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
              setFinisher(draft.longVideo?.finisher ?? null);
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
              hiddenKeys={draft.longVideo ? ["duration"] : undefined}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {longRuns.length > 0 && (
        <div className="border-t border-border pt-3" data-testid="draft-long-video-runs">
          <LongVideoRunList runs={longRuns} />
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {runs.map(({ generation, assets }, runIndex) => (
            <div key={generation.id} className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Take {runIndex + 1}</span>
                <StatusBadge status={generation.status} />
                <SaveStatus generation={generation} />
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
            <AlertDialogTitle>
              {draft.longVideo
                ? `Generate “${draft.title}” as a long video?`
                : `Generate “${draft.title}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {longPlan ? (
                  <p>
                    {longPlan.planned.length} clips (
                    {longPlan.durations.map((v) => `${v}s`).join(" + ")}),{" "}
                    {formatLength(longPlan.totalSeconds)} in all, every one by {draft.modelName}
                    {longPlan.continuation && longPlan.continuation.id !== draft.modelId
                      ? ` (clips 2 onward with ${longPlan.continuation.display_name})`
                      : ""}
                    , made one after another, each starting from the last frame of the one before.
                    {longPlan.capped && draft.longVideo
                      ? ` ${cappedNote(longPlan, draft.longVideo.targetSeconds)}`
                      : ""}
                    {quote?.kind === "ready" && quote.longVideo ? (
                      <>
                        {" "}
                        Clip 1 is estimated at{" "}
                        <span className="font-mono text-foreground">
                          ${quote.longVideo.firstClipUsd.toFixed(2)}
                        </span>{" "}
                        and the whole video at roughly{" "}
                        <span className="font-mono text-foreground">
                          ${quote.costUsd.toFixed(2)}
                        </span>
                        ; each clip is quoted again before it is sent.
                      </>
                    ) : (
                      <>
                        {" "}
                        Estimated cost{" "}
                        <span className="font-mono text-foreground">{formatEstimate(quote)}</span>
                      </>
                    )}
                  </p>
                ) : (
                  <p>
                    {draft.modelName} · estimated cost{" "}
                    <span className="font-mono text-foreground">{formatEstimate(quote)}</span>
                  </p>
                )}
                {quote?.kind === "metered" && <p className="text-xs">{quote.description}</p>}
                {quote?.kind === "unavailable" && runner.requireEstimate && (
                  <p className="text-xs text-primary">
                    A valid estimate is required before generating.
                  </p>
                )}
                <p className="text-xs">
                  {draft.longVideo
                    ? "Provider estimates, not a final charge. A clip that fails stops the video until you retry it; nothing is retried automatically. Progress shows in this card and under Long videos in Create."
                    : "Provider estimate, not a final charge. The result appears in this chat and in the library."}
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

/** Why a long video comes out shorter than asked: the 40-clip limit. */
function cappedNote(plan: DraftLongVideoPlan, targetSeconds: number): string {
  return `A long video has at most ${LONG_VIDEO_LIMITS.maxClips} clips, so at ${plan.durations.at(-1)}s a clip this runs ${formatLength(plan.totalSeconds)}, not the ${formatLength(targetSeconds)} asked for.`;
}

const FINISHER_MODES: { mode: FinaleMode; label: string }[] = [
  { mode: "both", label: "Move into it, then hold" },
  { mode: "reveal", label: "Move into it" },
  { mode: "end_card", label: "End card after the last clip" },
];

/**
 * The brand finisher a long-video draft ends on: kept out of every clip, it
 * closes the video. How it ends can be changed here, or the finisher dropped.
 */
function DraftFinisherRow({
  original,
  finisher,
  canMoveInto,
  continuationName,
  onChange,
}: {
  original: DraftFinisher;
  finisher: DraftFinisher | null;
  canMoveInto: boolean;
  continuationName: string;
  onChange: (finisher: DraftFinisher | null) => void;
}) {
  const mode =
    finisher && finaleReveals(finisher.mode) && !canMoveInto ? "end_card" : finisher?.mode;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
      data-testid="draft-finisher"
    >
      <span className="size-9 shrink-0 overflow-hidden rounded border border-border">
        <ReferenceThumb assetId={original.assetId} type="image" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 font-medium">
          <Flag className="size-3 text-primary" /> Ends on the brand finisher
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {finisher
            ? `${original.title ?? "The logo"} · kept out of every clip${
                mode && finaleHolds(mode) ? ` · holds ${finisher.seconds}s` : ""
              }`
            : "No finisher: the video ends on its last clip."}
          {!canMoveInto && finisher
            ? ` · ${continuationName} can't end a clip on an image, so it holds as an end card`
            : ""}
        </p>
      </div>
      <Select
        value={finisher ? (mode ?? "end_card") : "none"}
        onValueChange={(value) =>
          onChange(
            value === "none" ? null : { ...(finisher ?? original), mode: value as FinaleMode },
          )
        }
      >
        <SelectTrigger className="h-8 w-52" aria-label="How the video ends">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FINISHER_MODES.map((option) => (
            <SelectItem
              key={option.mode}
              value={option.mode}
              disabled={finaleReveals(option.mode) && !canMoveInto}
            >
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value="none">No finisher</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** A long-video draft's plan: its clips, what stays the same and what happens in each. */
function LongVideoSummary({
  model,
  plan,
  targetSeconds,
  continuity,
  beats,
}: {
  model: ModelRegistryEntry;
  plan: DraftLongVideoPlan;
  targetSeconds: number;
  continuity: string;
  beats: string[];
}) {
  const starts = clipStarts(plan.durations);
  return (
    <div
      className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
      data-testid="draft-long-video"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <Clapperboard className="size-3.5 text-primary" />
        {plan.durations.length} clips · {plan.durations.map((value) => `${value}s`).join(" + ")} ·{" "}
        {formatLength(plan.totalSeconds)}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Every clip is made by {modelLine(model)}
        {plan.continuation && plan.continuation.id !== model.id
          ? ` (clips 2 onward with ${plan.continuation.display_name})`
          : ""}
        , each as long as it allows and starting from the last frame of the one before, so the whole
        video plays as one continuous shot.
      </p>
      {plan.capped && (
        <p className="text-[11px] text-warning" data-testid="draft-long-video-capped">
          {cappedNote(plan, targetSeconds)}
        </p>
      )}
      {continuity && (
        <p className="text-[11px] leading-relaxed">
          <span className="text-foreground">Keep consistent:</span>{" "}
          <span className="text-muted-foreground">{continuity}</span>
        </p>
      )}
      {beats.some(Boolean) && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-3.5" /> What happens in each clip
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5">
            <ol className="space-y-1">
              {plan.durations.map((seconds, index) => (
                <li key={index} className="text-[11px] leading-relaxed">
                  <span className="text-foreground">
                    Clip {index + 1} · {formatLength(starts[index] ?? 0)}–
                    {formatLength((starts[index] ?? 0) + seconds)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {beats[index] || "Carries the story on from where the last clip ended."}
                  </span>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}
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
