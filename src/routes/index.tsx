import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Cpu, Loader2, Paperclip, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useProviderHealth } from "@/components/layout/AppShell";
import { ModelBrowser, OPERATION_LABELS } from "@/components/create/ModelBrowser";
import { ParameterFields } from "@/components/create/ParameterFields";
import { PromptComposer } from "@/components/create/PromptComposer";
import { ReferenceTray } from "@/components/create/ReferenceTray";
import { MAX_REFERENCES, useReferenceFiles, type ReferenceItem } from "@/components/create/reference-files";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { BriefImportDialog } from "@/components/briefs/BriefImportDialog";
import { useBriefs, useSupercomputerStatus } from "@/hooks/useSupercomputerData";
import { assignRoles, pickModelForReferences, usableReferences } from "@/lib/references";
import { conversionHint } from "@/lib/storage";
import { setSupercomputerHandoff } from "@/lib/supercomputer/handoff";
import { AssetCard } from "@/components/studio/AssetCard";
import { SaveStatus } from "@/components/studio/SaveStatus";
import { AssetDetailDialog } from "@/components/studio/AssetDetailDialog";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { useAssets, useGenerations, useModels, useProjects, useSettings, type AssetRow } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { defaultsForModel, validateParameters, type ModelRegistryEntry } from "@/lib/model-schema";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { useCampaigns } from "@/hooks/useV2Data";
import { BatchMatrix, expandMatrix, type MatrixSelection } from "@/components/create/BatchMatrix";
import { loadPromptDraft, takeCreatePrefill, PREFILL_EVENT } from "@/lib/create-draft";
import { CinemaControls } from "@/components/create/CinemaControls";
import { cinemaSupported, compileCinemaPrompt, promptCinemaGroups, type CinemaSelection } from "@/lib/cinema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create · Xeno Studio" },
      { name: "description", content: "Generate images and video with the studio's configured AI models." },
      { property: "og:title", content: "Create · Xeno Studio" },
      { property: "og:description", content: "The internal creative workstation for AI image and video generation." },
    ],
  }),
  component: CreatePage,
});

type EstimateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; costUsd: number }
  /** Metered models are quoted as a rate rather than a single figure. */
  | { kind: "metered"; description: string }
  | { kind: "unavailable"; reason: string };

function CreatePage() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: health } = useProviderHealth();
  const { data: models = [], isLoading: modelsLoading } = useModels();
  const { data: projects = [] } = useProjects();
  const { data: settings } = useSettings();

  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [modelId, setModelId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const { data: campaigns = [] } = useCampaigns();
  const [matrix, setMatrix] = useState<MatrixSelection>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [parentGenerationId, setParentGenerationId] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [estimate, setEstimate] = useState<EstimateState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmHighCost, setConfirmHighCost] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [cinemaEnabled, setCinemaEnabled] = useState(true);
  const [cinema, setCinema] = useState<CinemaSelection>({});
  const [shotId, setShotId] = useState<string | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const navigate = useNavigate();
  const { data: assistantStatus } = useSupercomputerStatus();
  const briefsReady = assistantStatus?.tablesReady === true;
  const { data: briefs = [] } = useBriefs(briefsReady);
  const prefillApplied = useRef(false);
  const submitLock = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  const mediaModels = useMemo(() => models.filter((model) => model.output_type === mediaType), [models, mediaType]);
  const model = useMemo(() => models.find((entry) => entry.id === modelId) ?? null, [models, modelId]);
  const familyModels = useMemo(
    () => (model ? mediaModels.filter((entry) => entry.family === model.family) : []),
    [mediaModels, model],
  );
  const [pickerBriefMode, setPickerBriefMode] = useState(false);
  const referenceFiles = useReferenceFiles({
    model,
    projectId,
    items: references,
    onChange: setReferences,
    onDocument: (file) => {
      setImportFile(file);
      setImportOpen(true);
    },
  });

  const requireEstimate = settings?.["require_cost_estimate"] === true;
  const highCostThreshold = Number(settings?.["high_cost_warning_usd"] ?? 2);

  const applyModel = useCallback((next: ModelRegistryEntry, keep?: Record<string, unknown>) => {
    setModelId(next.id);
    setValues({ ...defaultsForModel(next), ...(keep ?? {}) });
    // References stay attached and are re-mapped onto the new model's inputs.
    setReferences((current) => assignRoles(current, next));
  }, []);

  // Default model from settings, and one-time prefill from Recreate / Animate / Use as reference.
  const applyPrefill = useCallback(
    (prefill: NonNullable<ReturnType<typeof takeCreatePrefill>>) => {
      const kind = prefill.mediaType ?? "image";
      if (prefill.mediaType) setMediaType(prefill.mediaType);
      setProjectId(prefill.projectId ?? null);
      if (prefill.campaignId !== undefined) setCampaignId(prefill.campaignId ?? null);
      setParentGenerationId(prefill.parentGenerationId ?? null);
      setShotId(prefill.shotId ?? null);
      setReferences([]);

      const explicit = prefill.modelId ? models.find((entry) => entry.id === prefill.modelId) : undefined;
      const fallback =
        models.find((entry) => entry.id === settings?.[kind === "video" ? "default_video_model" : "default_image_model"]) ??
        models.find((entry) => entry.output_type === kind);
      const load = (target: ModelRegistryEntry | undefined) => {
        if (!target) return;
        setModelId(target.id);
        setValues({
          ...defaultsForModel(target),
          ...(prefill.parameters ?? {}),
          ...(prefill.prompt !== undefined ? { prompt: prefill.prompt } : {}),
        });
      };

      if (!prefill.inputs?.length) {
        load(explicit ?? fallback);
      } else {
        if (explicit) load(explicit);
        // Without an explicit model, pick one that can actually use the hand-off's media.
        void loadReferenceItems(prefill.inputs).then((items) => {
          const target =
            explicit ??
            pickModelForReferences(items, models, {
              outputType: kind,
              fallback,
              preferredRole: prefill.inputs?.[0]?.role,
            });
          if (!explicit) load(target);
          setReferences(assignRoles(items, target ?? null));
        });
      }
      toast.info("Settings loaded. Review them and press Generate when ready.");
    },
    [models, settings],
  );

  useEffect(() => {
    if (!models.length || prefillApplied.current) return;
    prefillApplied.current = true;
    const prefill = takeCreatePrefill();

    if (prefill) {
      applyPrefill(prefill);
      return;
    }

    const defaultId = settings?.["default_image_model"] as string | undefined;
    const target = models.find((entry) => entry.id === defaultId) ?? models.find((entry) => entry.output_type === "image");
    if (target) {
      setModelId(target.id);
      setValues({ ...defaultsForModel(target), prompt: loadPromptDraft() });
    }
  }, [models, settings, applyPrefill]);

  // Recreate / Animate / Use as reference fired while Create is already open.
  useEffect(() => {
    function onPrefill() {
      const prefill = takeCreatePrefill();
      if (prefill) applyPrefill(prefill);
    }
    window.addEventListener(PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(PREFILL_EVENT, onPrefill);
  }, [applyPrefill]);

  // Keep a valid model when the media type toggles. The first model is chosen by
  // the prefill/default effect above; acting before that would overwrite a
  // hand-off (Recreate, Animate, Open in Create) with the default model.
  useEffect(() => {
    if (!models.length || !model) return;
    if (model.output_type === mediaType) return;
    const defaultKey = mediaType === "image" ? "default_image_model" : "default_video_model";
    const preferred = models.find((entry) => entry.id === settings?.[defaultKey]) ?? mediaModels[0];
    if (preferred) applyModel(preferred, { prompt: values["prompt"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, models]);

  // Only references mapped onto one of the model's inputs are estimated and submitted.
  const usable = usableReferences(references);
  const inputRoles = usable.map((item) => item.role);
  const conversionIssues = usable.flatMap((item) => {
    const hint = conversionHint(item.assetType, item.mimeType);
    return hint ? [{ key: item.role, message: `${item.title ?? "A reference"}: ${hint}` }] : [];
  });
  const issues = model ? [...validateParameters(model, values, inputRoles), ...conversionIssues] : [];
  const issueMap = Object.fromEntries(issues.map((issue) => [issue.key, issue.message]));
  const promptField = model?.parameter_schema?.fields?.find((field) => field.key === "prompt");

  // Cinema Mode compiles shot language into the prompt actually submitted, so the
  // estimate and the generation always use the identical payload.
  const cinemaOn = cinemaSupported(model) && cinemaEnabled;
  const submitValues = useMemo(() => {
    if (!model || !cinemaOn) return values;
    return {
      ...values,
      prompt: compileCinemaPrompt((values["prompt"] as string) ?? "", cinema, promptCinemaGroups(model)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, JSON.stringify(values), JSON.stringify(cinema), cinemaOn]);

  // Debounced live estimate; any parameter change invalidates the previous one.
  useEffect(() => {
    if (!model || !health?.configured || issues.length) {
      setEstimate(
        !health?.configured
          ? { kind: "unavailable", reason: "Provider not configured" }
          : issues.length
            ? { kind: "unavailable", reason: "Parameters incomplete" }
            : { kind: "idle" },
      );
      return;
    }
    setEstimate({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const result = await estimateGeneration({
          data: {
            modelId: model.id,
            parameters: submitValues,
            inputs: usable.map((item, index) => ({ assetId: item.assetId, role: item.role, position: index })),
          },
        });
        if (result.ok && result.costUsd !== null) setEstimate({ kind: "ready", costUsd: result.costUsd });
        else if (result.ok && result.pricingDescription)
          setEstimate({ kind: "metered", description: result.pricingDescription });
        else
          setEstimate({
            kind: "unavailable",
            reason:
              result.code === "INSUFFICIENT_PROVIDER_BALANCE"
                ? "Provider account is out of credits"
                : "Estimate unavailable",
          });
      } catch {
        setEstimate({ kind: "unavailable", reason: "Estimate unavailable" });
      }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, JSON.stringify(submitValues), JSON.stringify(inputRoles), health?.configured, issues.length]);

  const canGenerate =
    !!model &&
    !!user &&
    !submitting &&
    issues.length === 0 &&
    health?.configured === true &&
    health?.state !== "disabled" &&
    (!requireEstimate || estimate.kind === "ready" || estimate.kind === "metered");

  const disabledReason = !health?.configured
    ? "Higgsfield credentials are not configured"
    : health?.state === "disabled"
      ? "The provider is switched off in Settings"
      : issues.length
        ? issues[0]!.message
        : estimate.kind === "unavailable"
          ? estimate.reason
          : requireEstimate && estimate.kind !== "ready" && estimate.kind !== "metered"
            ? "Waiting for a valid cost estimate"
            : null;

  async function runSubmit() {
    if (!model || !canGenerate) return;
    // Synchronous lock + idempotency key: a double-click can never bill twice.
    if (submitLock.current) return;
    submitLock.current = true;
    const clientRequestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = clientRequestId;
    setSubmitting(true);
    try {
      // A batch matrix turns into one independent generation per combination;
      // each carries its own idempotency key so none can be billed twice.
      const combos = expandMatrix(matrix);
      const payloads = combos.length ? combos : [{}];
      let result: { generationId: string; status: string; budgetWarning?: string | null } = { generationId: "", status: "" };
      for (let index = 0; index < payloads.length; index += 1) {
        result = await submitGeneration({
          data: {
            modelId: model.id,
            parameters: { ...submitValues, ...payloads[index] },
            inputs: usable.map((item, i) => ({ assetId: item.assetId, role: item.role, position: i })),
            projectId,
            campaignId,
            parentGenerationId,
            estimatedCostUsd: estimate.kind === "ready" ? estimate.costUsd : null,
            clientRequestId: payloads.length > 1 ? `${clientRequestId}-${index}` : clientRequestId,
          },
        });
      }
      if (result.budgetWarning) toast.warning(result.budgetWarning);
      if (payloads.length > 1) toast.success(`${payloads.length} generations submitted. Track them in Activity.`);
      requestIdRef.current = null;
      if (payloads.length > 1) {
        // Per-combination outcomes are shown individually in Activity.
      } else if (result.status === "submission_uncertain")
        toast.warning(
          "Submission status is uncertain. Automatic retry is disabled to prevent accidental duplicate generation charges. Review it in Activity.",
        );
      else if (result.status === "failed")
        toast.error("The provider rejected this generation. Open it in Activity for the reason.");
      else
        toast.success(
          result.status === "local_queued"
            ? "Queued — it will submit as soon as a provider slot frees up."
            : "Generation submitted. Track it in Activity.",
        );
      // A generation launched from a storyboard shot is filed as the next take.
      if (shotId && result.generationId) {
        const { count } = await supabase
          .from("shot_takes")
          .select("id", { count: "exact", head: true })
          .eq("shot_id", shotId);
        await supabase.from("shot_takes").insert({
          shot_id: shotId,
          generation_id: result.generationId,
          take_number: (count ?? 0) + 1,
          created_by: user?.id ?? null,
        });
        await supabase.from("shots").update({ status: "shooting" }).eq("id", shotId);
        queryClient.invalidateQueries({ queryKey: ["shot_takes", shotId] });
        queryClient.invalidateQueries({ queryKey: ["storyboards"] });
      }
      setParentGenerationId(null);
      queryClient.invalidateQueries({ queryKey: ["generations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The generation could not be submitted");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const batchCount = Math.max(expandMatrix(matrix).length, 1);

  /** Hands the current prompt, references and context to Supercomputer (nothing is sent automatically). */
  function openInSupercomputer() {
    const prompt = typeof values["prompt"] === "string" ? values["prompt"].trim() : "";
    setSupercomputerHandoff({
      text: prompt ? `Help me push this further, with sharper concepts and ready-to-run drafts:\n\n${prompt}` : "",
      intent: prompt ? "drafts" : "brainstorm",
      attachments: references.map((item) => ({
        assetId: item.assetId,
        type: item.assetType,
        title: item.title,
        bucket: item.bucket,
        path: item.path,
      })),
      briefId,
      projectId,
      campaignId,
    });
    void navigate({ to: "/supercomputer" });
  }

  function handleGenerate() {
    if (!canGenerate) return;
    if (batchCount > 1) setConfirmHighCost(true);
    else if (estimate.kind === "ready" && estimate.costUsd >= highCostThreshold) setConfirmHighCost(true);
    else void runSubmit();
  }

  return (
    <AppShell title="Create">
      <div className="space-y-6 p-6">
        {health && !health.configured && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Configure Higgsfield credentials before generating.</p>
              {isAdmin && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the backend secrets HF_KEY_ID and HF_KEY_SECRET, then reload. Details are in{" "}
                  <Link to="/settings" className="underline">
                    Settings
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <div
              className="panel p-5"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.files?.length) return;
                event.preventDefault();
                void referenceFiles.addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(["image", "video"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setMediaType(type)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors",
                        mediaType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <Select value={projectId ?? "none"} onValueChange={(value) => setProjectId(value === "none" ? null : value)}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={campaignId ?? "none"} onValueChange={(value) => setCampaignId(value === "none" ? null : value)}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="No campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {briefsReady && briefs.length > 0 && (
                  <Select value={briefId ?? "none"} onValueChange={(value) => setBriefId(value === "none" ? null : value)}>
                    <SelectTrigger className="h-9 w-48" aria-label="Brief">
                      <SelectValue placeholder="No brief" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No brief</SelectItem>
                      {briefs.map((brief) => (
                        <SelectItem key={brief.id} value={brief.id}>
                          {brief.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {parentGenerationId && <Badge variant="outline">Variation</Badge>}
                {shotId && (
                  <Badge variant="outline" className="gap-2">
                    Shooting a storyboard shot
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShotId(null)}>
                      ×
                    </button>
                  </Badge>
                )}

                <Button variant="outline" size="sm" className="ml-auto h-9" onClick={openInSupercomputer}>
                  <Cpu className="mr-1.5 size-4 text-primary" /> Brainstorm
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                {modelsLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setBrowserOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/40 p-4 text-left transition-colors hover:border-input"
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-base font-semibold">
                        {model?.display_name ?? "Select a model"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {model ? `${model.family} · ${model.recommended_for ?? model.model_path}` : "Browse the registry"}
                      </span>
                    </span>
                    <Wand2 className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )}

                {familyModels.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {familyModels.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => applyModel(entry, { prompt: values["prompt"] })}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          entry.id === model?.id
                            ? "border-primary/60 bg-primary/10"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {OPERATION_LABELS[entry.operation] ?? entry.operation}
                      </button>
                    ))}
                  </div>
                )}

                {model && (
                  <BatchMatrix model={model} values={values} selection={matrix} onChange={setMatrix} />
                )}

                {model && (
                  <ReferenceTray
                    model={model}
                    models={models}
                    projectId={projectId}
                    items={references}
                    onChange={setReferences}
                    onSwitchModel={(next) => {
                      setMediaType(next.output_type === "video" ? "video" : "image");
                      applyModel(next, { prompt: values["prompt"] });
                    }}
                    onOpenLibrary={() => {
                      setPickerBriefMode(false);
                      setLibraryOpen(true);
                    }}
                    onImportBrief={() => {
                      // With briefs on file, pick from their images; otherwise import one.
                      if (briefsReady && briefs.length) {
                        setPickerBriefMode(true);
                        setLibraryOpen(true);
                      } else {
                        setImportFile(null);
                        setImportOpen(true);
                      }
                    }}
                    addFiles={referenceFiles.addFiles}
                    uploading={referenceFiles.uploading}
                  />
                )}

                {promptField && (
                  <PromptComposer
                    value={(values["prompt"] as string) ?? ""}
                    onChange={(value) => setValues((current) => ({ ...current, prompt: value }))}
                    {...(promptField.maxLength ? { maxLength: promptField.maxLength } : {})}
                    required={promptField.required ?? false}
                    onSubmitShortcut={handleGenerate}
                    onPasteFiles={(files) => void referenceFiles.addFiles(files)}
                    {...(model
                      ? {
                          assist: {
                            modelId: model.id,
                            referenceAssetIds: references
                              .filter((item) => item.assetType !== "audio")
                              .map((item) => item.assetId),
                            briefId,
                            unavailableReason: assistantStatus?.backend
                              ? null
                              : "Add an AI key in Settings → AI to use the assistant",
                          },
                        }
                      : {})}
                  />
                )}
              </div>
            </div>

            {model && cinemaSupported(model) && (
              <CinemaControls
                model={model}
                prompt={(values["prompt"] as string) ?? ""}
                enabled={cinemaEnabled}
                onEnabledChange={setCinemaEnabled}
                selection={cinema}
                onSelectionChange={setCinema}
              />
            )}

            <RecentOutputs
              projectId={projectId}
              onOpenAsset={setSelectedAsset}
              onUseAsReference={(asset) => {
                setReferences((current) =>
                  current.some((item) => item.assetId === asset.id)
                    ? current
                    : assignRoles([...current, assetToReference(asset)], model),
                );
                toast.success("Added as a reference.");
              }}
            />
          </section>

          <aside className="space-y-4">
            <div className="panel space-y-5 p-5">
              <h2 className="label-eyebrow">Model settings</h2>
              {model ? (
                <>
                  <ParameterFields
                    model={model}
                    values={values}
                    inputRoles={inputRoles}
                    issues={issueMap}
                    onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
                  />
                  <Collapsible>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      Advanced settings
                      <ChevronDown className="size-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <ParameterFields
                        model={model}
                        values={values}
                        inputRoles={inputRoles}
                        issues={issueMap}
                        advanced
                        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choose a model to see its controls.</p>
              )}
            </div>

            <div className="panel sticky top-20 space-y-3 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="label-eyebrow">Estimated cost</span>
                <span className="font-mono">
                  {estimate.kind === "loading" && "Calculating…"}
                  {estimate.kind === "ready" && `$${estimate.costUsd.toFixed(2)}`}
                  {estimate.kind === "metered" && "Metered"}
                  {estimate.kind === "unavailable" && estimate.reason}
                  {estimate.kind === "idle" && "—"}
                </span>
              </div>
              {estimate.kind === "metered" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">{estimate.description}</p>
              )}
              {batchCount > 1 && (
                <p className="text-[11px] text-primary">
                  Batch matrix: {batchCount} generations
                  {estimate.kind === "ready" ? ` · approx. $${(estimate.costUsd * batchCount).toFixed(2)} total` : ""}
                </p>
              )}
              <Button
                size="lg"
                className="w-full accent-glow"
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {submitting
                  ? "Submitting…"
                  : estimate.kind === "ready"
                    ? `Generate · ~$${estimate.costUsd.toFixed(2)}`
                    : "Generate"}
              </Button>
              {disabledReason && !submitting && (
                <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Costs shown are provider estimates, not final charges.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <ModelBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        models={models}
        mediaType={mediaType}
        {...(model ? { selectedId: model.id } : {})}
        referenceTypes={[...new Set(references.map((item) => item.assetType))]}
        onSelect={(next) => {
          setMediaType(next.output_type === "video" ? "video" : "image");
          applyModel(next, { prompt: values["prompt"] });
        }}
      />

      <LibraryPicker
        open={libraryOpen}
        onOpenChange={(open) => {
          setLibraryOpen(open);
          if (!open) setPickerBriefMode(false);
        }}
        briefsEnabled={briefsReady}
        initialBriefId={pickerBriefMode ? (briefId ?? briefs[0]?.id ?? null) : null}
        title="Add references"
        max={Math.max(1, MAX_REFERENCES - references.length)}
        onConfirm={(assets) =>
          setReferences((current) =>
            assignRoles(
              [
                ...current,
                ...assets.filter((asset) => !current.some((item) => item.assetId === asset.id)).map(assetToReference),
              ],
              model,
            ),
          )
        }
      />

      <BriefImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initialFile={importFile}
        projectId={projectId}
        campaignId={campaignId}
        aiReady={!!assistantStatus?.backend}
        onImported={(id) => {
          setBriefId(id);
          setPickerBriefMode(true);
          setLibraryOpen(true);
        }}
      />

      <AssetDetailDialog asset={selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)} />

      <AlertDialog open={confirmHighCost} onOpenChange={setConfirmHighCost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{batchCount > 1 ? "Confirm this batch" : "Confirm this generation"}</AlertDialogTitle>
            <AlertDialogDescription>
              {batchCount > 1
                ? `This runs ${batchCount} separate generations, approximately $${
                    estimate.kind === "ready" ? (estimate.costUsd * batchCount).toFixed(2) : "0.00"
                  } in total. Each one is estimated again by the provider before it is sent.`
                : `This generation is estimated to cost $${estimate.kind === "ready" ? estimate.costUsd.toFixed(2) : "0.00"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmHighCost(false);
                void runSubmit();
              }}
            >
              Generate anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function assetToReference(asset: AssetRow): ReferenceItem {
  return {
    assetId: asset.id,
    role: "",
    assetType: asset.asset_type,
    bucket: asset.storage_bucket,
    path: asset.storage_path,
    title: asset.title,
    mimeType: asset.mime_type,
  };
}

/** Loads hand-off inputs (Recreate, Animate, Use as reference) as reference items, in order. */
async function loadReferenceItems(inputs: { assetId: string; role: string }[]): Promise<ReferenceItem[]> {
  const { data } = await supabase
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,title,mime_type")
    .in(
      "id",
      inputs.map((input) => input.assetId),
    );
  const items: ReferenceItem[] = [];
  for (const input of inputs) {
    const asset = data?.find((row) => row.id === input.assetId);
    if (!asset) continue;
    items.push({
      assetId: asset.id,
      role: input.role,
      assetType: asset.asset_type as ReferenceItem["assetType"],
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      title: asset.title,
      mimeType: asset.mime_type,
    });
  }
  return items;
}

/**
 * The model a hand-off should open with when none was named: the default model
 * if it can use the media, otherwise the best registry match (preferring a slot
 * with the requested role, e.g. "reference" over "source").
 */
function RecentOutputs({
  projectId,
  onOpenAsset,
  onUseAsReference,
}: {
  projectId: string | null;
  onOpenAsset: (asset: AssetRow) => void;
  onUseAsReference: (asset: AssetRow) => void;
}) {
  const { data: assets = [], isLoading } = useAssets({ limit: 12, projectId, sourceType: "generated" });
  const { data: generations = [] } = useGenerations({ limit: 6, projectId });

  // Completed generations stay listed until their output is saved (or the save needs a retry).
  const running = generations.filter(
    (generation) =>
      generation.status !== "completed" ||
      ["pending", "processing", "failed"].includes(generation.ingest_status),
  );

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="label-eyebrow">Recent outputs</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/assets">View library</Link>
        </Button>
      </div>

      {!!running.length && (
        <div className="space-y-2">
          {running.map((generation) => (
            <div
              key={generation.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
            >
              <StatusBadge status={generation.status} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {generation.prompt ?? generation.model_path}
              </span>
              <SaveStatus generation={generation} />
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !assets.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Your generated images and videos will appear here.
        </p>
      )}

      {!isLoading && !!assets.length && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {assets.map((asset) => (
            <div key={asset.id} className="group/output relative">
              <AssetCard asset={asset} onOpen={onOpenAsset} />
              <button
                type="button"
                onClick={() => onUseAsReference(asset)}
                aria-label="Use as reference"
                className="absolute right-1.5 bottom-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover/output:opacity-100 focus:opacity-100"
              >
                <Paperclip className="size-3" /> Reference
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
