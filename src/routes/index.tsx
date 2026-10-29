import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Cpu, Loader2, Paperclip, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useProviderHealth } from "@/components/layout/AppShell";
import { ModelBrowser, OPERATION_LABELS } from "@/components/create/ModelBrowser";
import { ParameterFields } from "@/components/create/ParameterFields";
import { PromptComposer } from "@/components/create/PromptComposer";
import { ReferenceTray } from "@/components/create/ReferenceTray";
import {
  maxReferences,
  useReferenceFiles,
  type ReferenceItem,
} from "@/components/create/reference-files";
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
import {
  useAssets,
  useGenerations,
  useModels,
  useProjects,
  useSettings,
  type AssetRow,
} from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { defaultsForModel, validateParameters, type ModelRegistryEntry } from "@/lib/model-schema";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { checkGenerationStage } from "@/lib/costs.functions";
import { useCampaigns } from "@/hooks/useV2Data";
import { BatchMatrix, expandMatrix, type MatrixSelection } from "@/components/create/BatchMatrix";
import { loadPromptDraft, takeCreatePrefill, PREFILL_EVENT } from "@/lib/create-draft";
import { CinemaControls } from "@/components/create/CinemaControls";
import { LongVideoSetup } from "@/components/create/LongVideoSetup";
import { LongVideoRuns } from "@/components/create/LongVideoRuns";
import {
  DEFAULT_LONG_VIDEO_DRAFT,
  newFinale,
  useLongVideoPlan,
  type LongVideoDraft,
} from "@/components/create/long-video-plan";
import { useFinisherSuggestion } from "@/hooks/useFinisherSuggestion";
import { planCharacter, useCharacters } from "@/hooks/useCharacters";
import { AddCharacterReferences } from "@/components/characters/AddCharacterReferences";
import { SoulStartFrame } from "@/components/characters/SoulStartFrame";
import { BrandPicker } from "@/components/brand/BrandPicker";
import { useBrandKits } from "@/hooks/useBrandKits";
import { brandKitIn } from "@/lib/edit/brand";
import {
  brandAvoidLine,
  brandStyleLine,
  longVideoBrandLine,
  promptInBrand,
} from "@/lib/brand/design";
import { startLongVideo } from "@/lib/long-video.functions";
import { endCardSize } from "@/lib/long-video/finisher";
import {
  approxExtendRunCost,
  approxRunCost,
  durationChoices,
  durationValue,
  finaleHolds,
  finaleReveals,
  formatLength,
  LONG_VIDEO_LIMITS,
  nearest,
  startFrameSlot,
  type RunFinale,
} from "@/lib/long-video/plan";
import { makeEndCard } from "@/lib/media/end-card";
import {
  drivingAudioSlot,
  lipSyncChoices,
  longestSegmentFor,
  requestSecondsFor,
} from "@/lib/lip-sync/models";
import { useLipSyncVoiceover } from "@/hooks/useLipSyncVoiceover";
import { VoiceoverLipSync } from "@/components/create/VoiceoverLipSync";
import { voiceLength } from "@/lib/lip-sync/view";
import { presenterStory, presenterValues } from "@/lib/lip-sync/presenter";
import { usePresenterRuns } from "@/hooks/useLongVideos";
import {
  cinemaSupported,
  compileCinemaPrompt,
  promptCinemaGroups,
  type CinemaSelection,
} from "@/lib/cinema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MeteredQuote } from "@/lib/higgsfield/metered";
import { balanceWarning } from "@/lib/usage-balance";
import { useUsageBalance } from "@/hooks/useUsageBalance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create · Xeno Studio" },
      {
        name: "description",
        content: "Generate images and video with the studio's configured AI models.",
      },
      { property: "og:title", content: "Create · Xeno Studio" },
      {
        property: "og:description",
        content: "The internal creative workstation for AI image and video generation.",
      },
    ],
  }),
  component: CreatePage,
});

type EstimateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      costUsd: number;
      /** For a metered model: how its price follows from the provider's rate. */
      metered?: MeteredQuote | null;
      /** For a metered model: what it would cost at each resolution it offers. */
      byResolution?: { resolution: string; usd: number }[];
      /** For a metered model: the provider's pricing description, which gives its rates. */
      description?: string | null;
    }
  /** Metered models whose rate couldn't be turned into a figure (shown as given). */
  | { kind: "metered"; description: string }
  /** `label` fits the cost line; `reason` says what is wrong and what to do. */
  | { kind: "unavailable"; label: string; reason: string; code?: string };

/** Why the provider couldn't quote, said so a person knows what to do next. */
function estimateProblem(
  result: { code: string | null; message?: string | null },
  isAdmin: boolean,
): Extract<EstimateState, { kind: "unavailable" }> {
  const detail = result.message?.trim();
  switch (result.code) {
    case "INSUFFICIENT_PROVIDER_BALANCE":
      return {
        kind: "unavailable",
        code: result.code,
        label: "Out of credits",
        reason: isAdmin
          ? "The Higgsfield account is out of credits. Top it up in the Higgsfield console, then try again."
          : "The Higgsfield account is out of credits. Ask an admin to top it up.",
      };
    case "INVALID_PARAMETERS":
      return {
        kind: "unavailable",
        code: result.code,
        label: "Settings rejected",
        reason: detail
          ? `Higgsfield rejected these settings: ${detail}`
          : "Higgsfield rejected these settings.",
      };
    case "UPLOAD_FAILED":
      return {
        kind: "unavailable",
        code: result.code,
        label: "Reference problem",
        reason: detail ?? "A reference file couldn't be sent to Higgsfield.",
      };
    case "RATE_LIMITED":
      return {
        kind: "unavailable",
        code: result.code,
        label: "Busy",
        reason:
          "Higgsfield is limiting requests right now. Change a setting or wait a moment to retry.",
      };
    case "PROVIDER_TIMEOUT":
      return {
        kind: "unavailable",
        code: result.code,
        label: "No answer",
        reason: "Higgsfield didn't answer in time. Change a setting or wait a moment to retry.",
      };
    case "PROVIDER_REJECTED":
      return {
        kind: "unavailable",
        code: result.code,
        label: "Unavailable",
        reason: detail ?? "Higgsfield can't run this model for the account right now.",
      };
    default:
      return {
        kind: "unavailable",
        code: result.code ?? "ESTIMATE_FAILED",
        label: "Unavailable",
        reason: detail
          ? `No estimate: ${detail}`
          : "Higgsfield didn't return an estimate for these settings.",
      };
  }
}

/** A model's name without its workflow, e.g. "Seedance 2.5" for "Seedance 2.5 (Image to video)". */
function modelLine(model: ModelRegistryEntry): string {
  return model.display_name.replace(/\s*\([^)]*\)\s*$/, "");
}

/** The workflow a model's name ends with, or its operation for the model's main workflow. */
function workflowLabel(model: ModelRegistryEntry): string {
  return (
    /\(([^)]*)\)\s*$/.exec(model.display_name)?.[1] ??
    OPERATION_LABELS[model.operation] ??
    model.operation
  );
}

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
  const [longDraft, setLongDraft] = useState<LongVideoDraft>(DEFAULT_LONG_VIDEO_DRAFT);
  const [shotId, setShotId] = useState<string | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  // The brand everything is made in: the one chosen in this browser (remembered between visits,
  // "none" for no brand), else the project's kit, else the studio's default, as in the Director.
  const [brandChoice, setBrandChoice] = useState<string | null | undefined>(() => {
    try {
      if (typeof window === "undefined") return undefined;
      const stored = window.localStorage.getItem("xeno.create.brandKitId");
      return stored === null ? undefined : stored === "none" ? null : stored;
    } catch {
      return undefined;
    }
  });
  const chooseBrand = (kitId: string | null) => {
    setBrandChoice(kitId);
    try {
      window.localStorage.setItem("xeno.create.brandKitId", kitId ?? "none");
    } catch {
      // Remembering it is a convenience only.
    }
  };
  const { data: brandData } = useBrandKits();
  const brandKit = brandKitIn(brandData?.kits ?? [], projectId, brandChoice);
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

  const mediaModels = useMemo(
    () => models.filter((model) => model.output_type === mediaType),
    [models, mediaType],
  );
  const model = useMemo(
    () => models.find((entry) => entry.id === modelId) ?? null,
    [models, modelId],
  );
  // The selected model's other workflows (image to video, reference to video, …).
  const familyModels = useMemo(
    () =>
      model
        ? mediaModels.filter(
            (entry) => entry.family === model.family && modelLine(entry) === modelLine(model),
          )
        : [],
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
      // A hand-off sets up one generation unless it brings a long video, so a
      // long video set up earlier on this page doesn't carry over to it.
      setLongDraft(
        prefill.longVideo
          ? {
              ...DEFAULT_LONG_VIDEO_DRAFT,
              enabled: true,
              targetSeconds: Math.max(
                1,
                Math.min(LONG_VIDEO_LIMITS.maxSeconds, Math.round(prefill.longVideo.targetSeconds)),
              ),
              title: prefill.longVideo.title ?? "",
              continuity: prefill.longVideo.continuity ?? "",
              beats: prefill.longVideo.beats ?? [],
              continuationModelId: prefill.longVideo.continuationModelId ?? null,
              // The finisher it was set up with, or none at all when it was dropped.
              finale: prefill.longVideo.finisher
                ? {
                    ...newFinale(prefill.longVideo.finisher.assetId, true),
                    mode: prefill.longVideo.finisher.mode,
                    seconds: prefill.longVideo.finisher.seconds,
                  }
                : null,
              finaleOff: prefill.longVideo.finisher === null,
              characterIds: prefill.longVideo.characterIds ?? [],
              keyframes: prefill.longVideo.keyframes ?? null,
            }
          : DEFAULT_LONG_VIDEO_DRAFT,
      );

      const explicit = prefill.modelId
        ? models.find((entry) => entry.id === prefill.modelId)
        : undefined;
      const fallback =
        models.find(
          (entry) =>
            entry.id ===
            settings?.[kind === "video" ? "default_video_model" : "default_image_model"],
        ) ?? models.find((entry) => entry.output_type === kind);
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
    const target =
      models.find((entry) => entry.id === defaultId) ??
      models.find((entry) => entry.output_type === "image");
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

  // A voiceover attached as the model's driving audio (Wan 2.6 and 2.7) drives
  // the speaker's lips: it is prepared once, so it can be cut and lined up exactly.
  const drivingSlot = mediaType === "video" ? drivingAudioSlot(model) : null;
  const voiceReference = drivingSlot
    ? (references.find(
        (item) =>
          item.role === drivingSlot.role &&
          (item.assetType === "audio" || item.assetType === "video"),
      ) ?? null)
    : null;
  const lipSync = useLipSyncVoiceover({
    assetId: voiceReference?.assetId ?? null,
    projectId,
    enabled: !!voiceReference,
  });

  // Only references mapped onto one of the model's inputs are estimated and submitted.
  const usable = usableReferences(references);
  const inputRoles = usable.map((item) => item.role);
  const conversionIssues = usable.flatMap((item) => {
    // A voiceover goes as its prepared piece, a WAV, whatever it was uploaded as.
    if (voiceReference && item.assetId === voiceReference.assetId) return [];
    const hint = conversionHint(item.assetType, item.mimeType);
    return hint ? [{ key: item.role, message: `${item.title ?? "A reference"}: ${hint}` }] : [];
  });
  const promptField = model?.parameter_schema?.fields?.find((field) => field.key === "prompt");

  // Cinema Mode compiles shot language into the prompt actually submitted, so the
  // estimate and the generation always use the identical payload.
  const cinemaOn = cinemaSupported(model) && cinemaEnabled;

  // A long video: clips chained into one continuous shot, planned clip by clip
  // exactly as the server will check and send them.
  const runReferences = useMemo(
    () =>
      references
        .filter((item) => item.role)
        .map((item) => ({ assetId: item.assetId, role: item.role, assetType: item.assetType })),
    [references],
  );
  // The end card (and a keyframed video's frames) take the video's own shape:
  // its aspect ratio setting, else (a model that takes it from its start
  // frame) that frame's.
  const startFrame = references.find(
    (item) => item.assetType === "image" && ["source", "first_frame", "image"].includes(item.role),
  );
  const { data: startFrameSize } = useQuery({
    queryKey: ["asset-size", startFrame?.assetId ?? null],
    enabled: mediaType === "video" && longDraft.enabled && !!startFrame,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("width,height")
        .eq("id", startFrame!.assetId)
        .maybeSingle();
      return data ?? null;
    },
  });
  // The characters chosen for a long video, as the plan uses them.
  const charactersQuery = useCharacters({
    enabled: mediaType === "video" && longDraft.enabled,
  });
  const characterEntries = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data]);
  const chosenCharacters = useMemo(
    () =>
      longDraft.characterIds.flatMap((id) => {
        const entry = characterEntries.find((character) => character.id === id);
        return entry ? [planCharacter(entry)] : [];
      }),
    [longDraft.characterIds, characterEntries],
  );
  // A character chosen elsewhere (a Supercomputer draft) that has since left
  // the library is taken out, said so; until the library is read, nothing starts.
  useEffect(() => {
    if (!charactersQuery.isSuccess) return;
    const gone = longDraft.characterIds.filter(
      (id) => !characterEntries.some((character) => character.id === id),
    );
    if (!gone.length) return;
    setLongDraft((current) => ({
      ...current,
      characterIds: current.characterIds.filter((id) => !gone.includes(id)),
    }));
    toast.warning(
      gone.length === 1
        ? "A character chosen for this video is no longer in the Characters library, so it was taken out."
        : `${gone.length} characters chosen for this video are no longer in the Characters library, so they were taken out.`,
    );
  }, [charactersQuery.isSuccess, characterEntries, longDraft.characterIds]);
  const characterIssues: { key: string; message: string }[] =
    longDraft.characterIds.length && !charactersQuery.isSuccess
      ? [
          {
            key: "long-video-characters",
            message: charactersQuery.isError
              ? "The characters couldn't be loaded"
              : "Loading the characters…",
          },
        ]
      : chosenCharacters
          .filter((character) => !character.images.length)
          .map((character) => ({
            key: `long-video-character-${character.id}`,
            message: `${character.name} has no reference images yet: add some on the Characters page, or take them out`,
          }));
  // Whether the database can run presenter videos (migration 0017).
  const presenterRuns = usePresenterRuns();
  const longPlan = useLongVideoPlan({
    presenterRuns,
    draft: longDraft,
    model,
    models,
    values,
    references: runReferences,
    cinema: { on: cinemaOn, selection: cinema },
    characters: chosenCharacters,
    // Undefined while its size is still being read.
    openingFrame: startFrame ? startFrameSize : null,
    voiceover: voiceReference
      ? { assetId: voiceReference.assetId, preparation: lipSync.voiceover }
      : null,
    brandLine: brandKit
      ? longVideoBrandLine(brandStyleLine(brandKit, "video"), brandAvoidLine(brandKit))
      : null,
  });
  const longMode = mediaType === "video" && longDraft.enabled && longPlan.eligible;
  const longPanel = mediaType === "video" && longDraft.enabled && !!model;

  // One clip made to a voiceover: asked for the voiceover's length and a
  // moment more, once that is known, and never shorter than it.
  const voiceReady =
    lipSync.voiceover?.status === "ready" && lipSync.voiceover.durationSeconds
      ? lipSync.voiceover
      : null;
  const clipVoiceChoices = model && drivingSlot ? lipSyncChoices(durationChoices(model)) : [];
  const longestVoice = clipVoiceChoices.length ? longestSegmentFor(clipVoiceChoices) : 0;
  const voiceRequest =
    voiceReady && clipVoiceChoices.length
      ? requestSecondsFor(clipVoiceChoices, voiceReady.durationSeconds!)
      : null;
  useEffect(() => {
    if (!model || longDraft.enabled || voiceRequest === null) return;
    const wanted = durationValue(model, voiceRequest);
    setValues((current) =>
      current["duration"] === wanted ? current : { ...current, duration: wanted },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, longDraft.enabled, voiceRequest, voiceReady?.id]);
  const lipSyncIssues: { key: string; message: string }[] =
    !voiceReference || longMode
      ? []
      : !lipSync.voiceover
        ? [
            {
              key: "lip-sync",
              message: lipSync.needsConfirmation
                ? "Confirm the voice in the voiceover may be used (under Lip sync), so it can be prepared"
                : "The voiceover is being prepared for lip sync…",
            },
          ]
        : lipSync.voiceover.status === "preparing"
          ? [{ key: "lip-sync", message: "The voiceover is being prepared for lip sync…" }]
          : lipSync.voiceover.status === "failed"
            ? [
                {
                  key: "lip-sync",
                  message:
                    lipSync.voiceover.errorMessage ??
                    "The voiceover couldn't be prepared for lip sync",
                },
              ]
            : voiceReady && voiceReady.durationSeconds! > longestVoice + 1e-6
              ? [
                  {
                    key: "lip-sync",
                    message: `The voiceover runs ${voiceLength(voiceReady.durationSeconds!)}; one clip holds up to ${voiceLength(Math.floor(longestVoice * 10) / 10)} of it. Make it as a long video.`,
                  },
                ]
              : voiceReady && Number(values["duration"]) + 1e-9 < voiceReady.durationSeconds!
                ? [
                    {
                      key: "duration",
                      message: `The clip is shorter than its voiceover, which would be cut off: make it at least ${voiceRequest ?? Math.ceil(voiceReady.durationSeconds!)}s long`,
                    },
                  ]
                : [];

  // The brand finisher is one of the reference images (one taken off the
  // references stops counting), suggested when one looks like the logo: its
  // name, or what its brief says it is for.
  const imageReferences = useMemo(
    () => references.filter((item) => item.assetType === "image"),
    [references],
  );
  const { data: finisherSuggestion } = useFinisherSuggestion(
    longPanel ? imageReferences.map((item) => item.assetId) : [],
  );
  const canMoveIntoFinisher = !!longPlan.end;
  // The image clip 1 starts from is never taken for the finisher on a guess.
  const firstFrameRole = startFrameSlot(model)?.role ?? null;
  useEffect(() => {
    if (!longPanel || longDraft.finaleOff || !finisherSuggestion) return;
    const attached = (assetId: string) => imageReferences.some((item) => item.assetId === assetId);
    if (longDraft.finale && attached(longDraft.finale.assetId)) return;
    const suggested = imageReferences.find((item) => item.assetId === finisherSuggestion.assetId);
    if (!suggested || (firstFrameRole && suggested.role === firstFrameRole)) return;
    const reason = finisherSuggestion.reason.replace(/^./, (letter) => letter.toLowerCase());
    setLongDraft((current) => ({
      ...current,
      finale: newFinale(finisherSuggestion.assetId, canMoveIntoFinisher, reason),
    }));
  }, [
    longPanel,
    longDraft.finale,
    longDraft.finaleOff,
    imageReferences,
    finisherSuggestion,
    canMoveIntoFinisher,
    firstFrameRole,
  ]);

  const endCard = endCardSize(values, startFrameSize ?? null);

  // A long video's first clip is checked with the media it is sent (never the
  // finisher); a keyframed one's clips are all checked on its workflow, per clip.
  const baseIssues =
    model && !(longMode && longPlan.keyframed)
      ? validateParameters(
          model,
          values,
          longMode ? (longPlan.planned[0]?.roles ?? inputRoles) : inputRoles,
        )
      : [];
  // In a long video the plan sets each clip's length and prompt (a beat can
  // stand in for the story), so those are checked per clip instead.
  const issues = longMode
    ? [
        ...baseIssues.filter((issue) => issue.key !== "prompt" && issue.key !== "duration"),
        ...characterIssues,
        ...longPlan.issues.map((issue) => ({
          key: `long-video-${issue.position ?? "run"}`,
          message: issue.message,
        })),
        ...conversionIssues,
      ]
    : model
      ? [...baseIssues, ...conversionIssues, ...lipSyncIssues]
      : [];
  const issueMap = Object.fromEntries(issues.map((issue) => [issue.key, issue.message]));
  const submitValues = useMemo(() => {
    const prompt = (values["prompt"] as string) ?? "";
    const compiled =
      model && cinemaOn
        ? { ...values, prompt: compileCinemaPrompt(prompt, cinema, promptCinemaGroups(model)) }
        : values;
    // Made in a brand: its look in the prompt, what it never shows in the
    // negative prompt (or the prompt, on a model without one), as the API does.
    if (!model || !brandKit || typeof compiled["prompt"] !== "string") return compiled;
    const branded = promptInBrand({
      prompt: compiled["prompt"],
      negativePrompt:
        typeof compiled["negative_prompt"] === "string" ? compiled["negative_prompt"] : null,
      brand: brandKit,
      kind: model.output_type === "video" ? "video" : "image",
      fields: model.parameter_schema?.fields ?? [],
    });
    return {
      ...compiled,
      prompt: branded.prompt,
      ...(branded.negativePrompt !== undefined ? { negative_prompt: branded.negativePrompt } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, JSON.stringify(values), JSON.stringify(cinema), cinemaOn, brandKit]);

  // A long video is quoted by its first clip, exactly as that clip will be sent:
  // its model (a keyframed video's workflow), settings and media (the finisher
  // isn't sent; a stand-in image goes where its keyframes will).
  // With keyframes and no image at all to stand in for clip 1's frames, the
  // model's own clip is priced instead (about the same), at one of its lengths.
  const ownChoices = model ? durationChoices(model) : [];
  const ownSeconds =
    longMode && !longPlan.quote && ownChoices.length && longPlan.durations[0]
      ? nearest(ownChoices, longPlan.durations[0])
      : null;
  const estimateModel = longMode ? (longPlan.quote?.model ?? model) : model;
  const estimateValues = longMode
    ? (longPlan.quote?.values ??
      (model && ownSeconds !== null
        ? { ...submitValues, duration: durationValue(model, ownSeconds) }
        : submitValues))
    : submitValues;
  const estimateInputs = longMode ? (longPlan.quote?.inputs ?? []) : usable;
  // ...unless the model itself needs an image to start from: then clip 1 is
  // priced just before it is made, once its opening keyframe is painted.
  const clipPricedLater =
    longMode &&
    longPlan.keyframed &&
    !longPlan.quote &&
    !!model?.capabilities?.inputs?.some((slot) => slot.required && slot.type === "image");
  /** How long the clip the estimate prices runs. */
  const quotedSeconds = ownSeconds ?? longPlan.durations[0];

  // Debounced live estimate; any parameter or reference change invalidates the previous one.
  const referenceKey = JSON.stringify(estimateInputs.map((item) => [item.assetId, item.role]));
  const valuesKey = JSON.stringify(estimateValues);
  useEffect(() => {
    if (!model || !estimateModel || !health?.configured || issues.length) {
      setEstimate(
        !health?.configured
          ? {
              kind: "unavailable",
              label: "Not configured",
              reason: "Higgsfield credentials are not configured",
            }
          : issues.length
            ? { kind: "unavailable", label: "—", reason: issues[0]!.message }
            : { kind: "idle" },
      );
      return;
    }
    if (clipPricedLater) {
      setEstimate({
        kind: "metered",
        description:
          "Each clip is priced just before it's made: with no image to stand in for its frames, clip 1 can't be priced until its opening keyframe is painted. The clips are tried with Higgsfield then, before any other keyframe is painted.",
      });
      return;
    }
    setEstimate({ kind: "loading" });
    // A slower answer for settings that have since changed must not overwrite the current one.
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await estimateGeneration({
          data: {
            modelId: estimateModel.id,
            parameters: estimateValues,
            inputs: estimateInputs.map((item, index) => ({
              assetId: item.assetId,
              role: item.role,
              position: index,
            })),
          },
        });
        if (cancelled) return;
        if (result.ok && result.costUsd !== null)
          setEstimate({
            kind: "ready",
            costUsd: result.costUsd,
            metered: result.metered,
            byResolution: result.byResolution,
            description: result.pricingDescription,
          });
        else if (result.ok && result.pricingDescription)
          setEstimate({ kind: "metered", description: result.pricingDescription });
        else setEstimate(estimateProblem(result, isAdmin));
      } catch {
        if (!cancelled) setEstimate(estimateProblem({ code: null }, isAdmin));
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    model?.id,
    estimateModel?.id,
    valuesKey,
    referenceKey,
    health?.configured,
    issues.length,
    isAdmin,
    clipPricedLater,
  ]);

  // One keyframe's price (a keyframed long video paints several before its clips).
  const keyframeQuote = longMode && longPlan.keyframed ? longPlan.keyframeQuote : null;
  const { data: keyframePrice = null, isFetching: keyframePricing } = useQuery({
    queryKey: [
      "keyframe-quote",
      keyframeQuote?.model.id ?? null,
      JSON.stringify(keyframeQuote?.values ?? null),
      JSON.stringify(keyframeQuote?.inputs ?? null),
    ],
    enabled: !!keyframeQuote && health?.configured === true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const result = await estimateGeneration({
        data: {
          modelId: keyframeQuote!.model.id,
          parameters: keyframeQuote!.values,
          inputs: keyframeQuote!.inputs.map((item, index) => ({
            assetId: item.assetId,
            role: item.role,
            position: index,
          })),
        },
      });
      return result.ok
        ? { usd: result.costUsd, metered: result.costUsd === null && !!result.pricingDescription }
        : null;
    },
  });
  const keyframeUsd = keyframePrice?.usd ?? null;

  // Under the studio's estimate policy, the keyframes' price is needed too.
  const keyframesUnpriced =
    requireEstimate &&
    longMode &&
    longPlan.keyframed &&
    longPlan.paintedKeyframes > 0 &&
    keyframeUsd === null &&
    !keyframePrice?.metered;
  const canGenerate =
    !!model &&
    !!user &&
    !submitting &&
    issues.length === 0 &&
    health?.configured === true &&
    health?.state !== "disabled" &&
    (!requireEstimate || estimate.kind === "ready" || estimate.kind === "metered") &&
    !keyframesUnpriced;

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
            : keyframesUnpriced
              ? keyframePricing || !keyframeQuote
                ? "Waiting for the keyframes' price"
                : "Higgsfield couldn't price the keyframes, and a cost estimate is required"
              : null;
  // Only an estimate the provider couldn't give (not one it refused for the
  // settings or the balance) can be worked around by generating without one.
  const estimateBypassHint =
    isAdmin &&
    requireEstimate &&
    issues.length === 0 &&
    estimate.kind === "unavailable" &&
    !["INSUFFICIENT_PROVIDER_BALANCE", "INVALID_PARAMETERS", "UPLOAD_FAILED"].includes(
      estimate.code ?? "",
    );

  async function runSubmit() {
    if (!model || !canGenerate) return;
    // Synchronous lock + idempotency key: a double-click can never bill twice.
    if (submitLock.current) return;
    submitLock.current = true;
    const clientRequestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = clientRequestId;
    setSubmitting(true);
    if (longMode) {
      try {
        await runLongVideo(clientRequestId);
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
      return;
    }
    try {
      // A batch matrix turns into one independent generation per combination;
      // each carries its own idempotency key so none can be billed twice.
      const combos = expandMatrix(matrix);
      const payloads = combos.length ? combos : [{}];
      // A batch is checked whole first, against the Higgsfield balance and the
      // spending limit with an allowance for retakes, so it never stops part way.
      if (payloads.length > 1) {
        const verdict = await checkGenerationStage({
          data: {
            items: payloads.slice(0, 200).map((_, index) => ({
              label: `Combination ${index + 1}`,
              usd: estimate.kind === "ready" ? estimate.costUsd : null,
            })),
            projectId: projectId ?? null,
            campaignId: campaignId ?? null,
            allowUnpriced: true,
          },
        });
        if (!verdict.fits) {
          toast.error(verdict.reasons[0] ?? "This batch doesn't fit the balance or the limit.");
          return;
        }
      }
      let result: { generationId: string; status: string; budgetWarning?: string | null } = {
        generationId: "",
        status: "",
      };
      for (let index = 0; index < payloads.length; index += 1) {
        result = await submitGeneration({
          data: {
            modelId: model.id,
            parameters: { ...submitValues, ...payloads[index] },
            inputs: usable.map((item, i) => ({
              assetId: item.assetId,
              role: item.role,
              position: i,
            })),
            projectId,
            campaignId,
            parentGenerationId,
            estimatedCostUsd: estimate.kind === "ready" ? estimate.costUsd : null,
            clientRequestId: payloads.length > 1 ? `${clientRequestId}-${index}` : clientRequestId,
          },
        });
      }
      if (result.budgetWarning) toast.warning(result.budgetWarning);
      if (payloads.length > 1)
        toast.success(`${payloads.length} generations submitted. Track them in Activity.`);
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

  /** Starts the long video the panel describes; the server runs it from here. */
  async function runLongVideo(clientRequestId: string) {
    if (!model || !longPlan.continuation || !user) return;
    const story = typeof values["prompt"] === "string" ? values["prompt"] : "";
    const title = longDraft.title.trim() || story.trim().slice(0, 80) || "Long video";
    let finale: RunFinale | null = null;
    if (longPlan.finale && longDraft.finale) {
      // Its end card, laid out at the video's shape: the last clip ends on it, the Editor holds it.
      const image = imageReferences.find((item) => item.assetId === longPlan.finale!.assetId);
      const extended = longPlan.finale.sourceAssetId;
      let frameAssetId: string | null = null;
      try {
        frameAssetId = await makeEndCard({
          // The artwork extended to the video's shape, when it was; else as uploaded.
          finisher: extended
            ? { assetId: extended }
            : { assetId: longPlan.finale.assetId, bucket: image?.bucket, path: image?.path },
          size: endCard,
          style: longDraft.finale.style,
          userId: user.id,
          projectId,
          title,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "it couldn't be saved";
        if (finaleReveals(longPlan.finale.mode)) {
          toast.error(
            `The end card couldn't be made (${reason}), so nothing was started. Try again.`,
          );
          return;
        }
        toast.warning(
          `The end card couldn't be laid out (${reason}): the Editor shows your image as it is.`,
        );
      }
      finale = { ...longPlan.finale, frameAssetId, style: longDraft.finale.style };
    }
    try {
      const result = await startLongVideo({
        data: {
          title,
          // A keyframed video's clips are all made by its workflow.
          firstModelId: longPlan.keyframed && longPlan.workflow ? longPlan.workflow.id : model.id,
          continuationModelId: longPlan.continuation.id,
          characterIds: longPlan.characters.map((character) => character.id),
          identityCheck: longDraft.identityCheck,
          keyframes:
            longPlan.keyframed && longPlan.painter
              ? {
                  painterModelId: longPlan.painter.id,
                  review: longDraft.reviewKeyframes,
                  soulOpening: longDraft.soulOpening,
                }
              : null,
          story,
          continuity: longDraft.continuity,
          values,
          // Made to a voiceover, the voiceover is sent as the run's own, not as a reference.
          references: runReferences
            .filter((item) => !(longPlan.voiceover && voiceReference?.assetId === item.assetId))
            .map((item) => ({ assetId: item.assetId, role: item.role })),
          clips: longPlan.clips,
          finale,
          projectId,
          campaignId,
          clientRequestId,
          // Made to a voiceover: each clip from its own piece of it.
          voiceover: longPlan.voiceover?.segments.length
            ? {
                preparationId: longPlan.voiceover.preparationId,
                pieces: longPlan.voiceover.segments.map(({ start, end, requestSeconds }) => ({
                  start,
                  end,
                  requestSeconds,
                })),
                keepClipSound: false,
                cutaways: longPlan.voiceover.cutaways,
              }
            : null,
          // Presenter videos (where the database can run them).
          startFrom: longPlan.voiceover ? longPlan.startFrom : "chain",
          qc:
            longPlan.voiceover && presenterRuns
              ? { lipCheck: longDraft.lipCheck, takes: longDraft.lipCheck ? longDraft.takes : 1 }
              : null,
          // The whole video's estimate, checked against spending limits before it starts.
          estimatedCostUsd: longGrandTotal,
          // Its brand, kept with it for every keyframe and its edit.
          brandKitId: brandKit?.id ?? null,
        },
      });
      requestIdRef.current = null;
      for (const warning of result.warnings ?? []) toast.warning(warning);
      if (result.status === "needs_attention")
        toast.warning("The long video stopped before its first clip. See why under Long videos.");
      else if (longPlan.keyframed)
        toast.success(
          `Painting ${longPlan.paintedKeyframes} keyframes first${longDraft.reviewKeyframes ? ": you'll review them under Long videos before the clips are made" : ", then the clips"}.`,
        );
      else if (longPlan.voiceover)
        toast.success(
          `Long video started: ${longPlan.clips.length} ${longPlan.clips.length === 1 ? "clip" : "clips"}, each made to its own piece of the voiceover. Follow it under Long videos.`,
        );
      else
        toast.success(
          `Long video started: ${longPlan.clips.length} clips, made one after another. Follow it under Long videos.`,
        );
      queryClient.invalidateQueries({ queryKey: ["long_videos"] });
      queryClient.invalidateQueries({ queryKey: ["generations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The long video could not be started");
    }
  }

  const batchCount = longMode ? 1 : Math.max(expandMatrix(matrix).length, 1);
  // How the video ends, for the confirmation.
  const finisherNumber = longPlan.finale
    ? imageReferences.findIndex((item) => item.assetId === longPlan.finale!.assetId) + 1
    : 0;
  const finisherSummary = longPlan.finale
    ? `It ends on image ${finisherNumber} (your finisher)${
        finaleReveals(longPlan.finale.mode) ? ": the last clip moves into it" : ""
      }${
        finaleHolds(longPlan.finale.mode)
          ? `${finaleReveals(longPlan.finale.mode) ? ", then it" : ", which"} holds for ${longPlan.finale.seconds}s in the Editor`
          : ""
      }. `
    : "";
  // A long video's total, approximated from its first clip's quote per second
  // (clips that extend the clip before are also billed for it, at the
  // provider's rates); each clip is quoted again before it is sent.
  const longTotalEstimate =
    longMode && estimate.kind === "ready" && longPlan.durations[0]
      ? longPlan.start?.kind === "video"
        ? approxExtendRunCost({
            firstClipUsd: estimate.costUsd,
            durations: longPlan.durations,
            description: estimate.description,
            resolution: String(
              longPlan.planned[1]?.values["resolution"] ?? estimateValues["resolution"] ?? "",
            ),
            aspectRatio:
              typeof estimateValues["aspect_ratio"] === "string"
                ? estimateValues["aspect_ratio"]
                : null,
          })
        : quotedSeconds
          ? approxRunCost(estimate.costUsd, quotedSeconds, longPlan.totalSeconds)
          : null
      : null;
  // Only the keyframes that are painted are billed (the person's own frames aren't).
  const keyframesEstimate =
    longMode && longPlan.keyframed && keyframeUsd !== null
      ? keyframeUsd * longPlan.paintedKeyframes
      : null;
  // A total only once every part of it is priced: without the keyframes' price
  // it would say less than the video costs.
  const keyframesPriced =
    !(longMode && longPlan.keyframed && longPlan.paintedKeyframes > 0) ||
    keyframesEstimate !== null;
  const longGrandTotal =
    longTotalEstimate !== null && keyframesPriced
      ? longTotalEstimate + (keyframesEstimate ?? 0)
      : null;

  // Lip-scored clips can be made again (up to the takes chosen): the most the run could cost.
  const longTakes = longMode && longDraft.lipCheck ? Math.max(1, longDraft.takes) : 1;
  const longWorstCase =
    longGrandTotal !== null && longTakes > 1 && longTotalEstimate !== null
      ? longGrandTotal + longTotalEstimate * (longTakes - 1)
      : null;
  // What this would cost, against what is thought to be left on the Higgsfield balance.
  const { data: usageBalance } = useUsageBalance();
  const plannedCost = longMode
    ? longGrandTotal
    : estimate.kind === "ready"
      ? estimate.costUsd * Math.max(1, batchCount)
      : null;
  const creditWarning = balanceWarning(usageBalance?.higgsfield, plannedCost, longWorstCase);

  /** Hands the current prompt, references and context to Supercomputer (nothing is sent automatically). */
  function openInSupercomputer() {
    const prompt = typeof values["prompt"] === "string" ? values["prompt"].trim() : "";
    setSupercomputerHandoff({
      text: prompt
        ? `Help me push this further, with sharper concepts and ready-to-run drafts:\n\n${prompt}`
        : "",
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
    if (longMode || batchCount > 1) setConfirmHighCost(true);
    else if (estimate.kind === "ready" && estimate.costUsd >= highCostThreshold)
      setConfirmHighCost(true);
    // A metered price that couldn't be worked out is confirmed every time.
    else if (estimate.kind === "metered") setConfirmHighCost(true);
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
                        mediaType === type
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <Select
                  value={projectId ?? "none"}
                  onValueChange={(value) => setProjectId(value === "none" ? null : value)}
                >
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

                <Select
                  value={campaignId ?? "none"}
                  onValueChange={(value) => setCampaignId(value === "none" ? null : value)}
                >
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
                  <Select
                    value={briefId ?? "none"}
                    onValueChange={(value) => setBriefId(value === "none" ? null : value)}
                  >
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
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setShotId(null)}
                    >
                      ×
                    </button>
                  </Badge>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-9"
                  onClick={openInSupercomputer}
                >
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
                        {model
                          ? `${model.family} · ${model.recommended_for ?? model.model_path}`
                          : "Browse the registry"}
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
                        {workflowLabel(entry)}
                      </button>
                    ))}
                  </div>
                )}

                {model && mediaType === "video" && longPlan.eligible && (
                  <LongVideoSetup
                    model={model}
                    draft={longDraft}
                    plan={longPlan}
                    onChange={setLongDraft}
                    story={typeof values["prompt"] === "string" ? values["prompt"] : ""}
                    images={imageReferences}
                    briefId={briefId}
                    endCardSize={endCard}
                    projectId={projectId}
                    campaignId={campaignId}
                    aiUnavailableReason={
                      assistantStatus?.backend
                        ? null
                        : "Add an AI key in Settings → AI to write beats"
                    }
                    characters={characterEntries}
                    keyframeUsd={keyframeUsd}
                    presenterRuns={presenterRuns}
                    brandKitId={brandKit?.id ?? null}
                    onApplyPresenterRecipe={
                      longPlan.voiceover
                        ? () => {
                            // The prompt and settings the recipe asks for, and no keyframes.
                            const recipeModel =
                              longPlan.keyframed && longPlan.workflow ? longPlan.workflow : model;
                            setValues((current) => ({
                              ...(recipeModel ? presenterValues(recipeModel, current) : current),
                              prompt: presenterStory(
                                typeof current["prompt"] === "string" ? current["prompt"] : "",
                              ),
                            }));
                            setLongDraft((current) => ({ ...current, keyframes: false }));
                            toast.success(
                              "Presenter recipe on: a locked-off camera, no prompt rewriting and no keyframes.",
                            );
                          }
                        : null
                    }
                  />
                )}

                {model && !longMode && (
                  <BatchMatrix
                    model={model}
                    values={values}
                    selection={matrix}
                    onChange={setMatrix}
                  />
                )}

                {model && (
                  <ReferenceTray
                    model={model}
                    models={models}
                    projectId={projectId}
                    items={references}
                    onChange={setReferences}
                    finisherId={longMode ? (longPlan.finale?.assetId ?? null) : null}
                    // A long video takes its characters in its own panel.
                    extraActions={
                      longMode ? undefined : (
                        <>
                          {model.output_type === "video" && startFrameSlot(model) && (
                            <SoulStartFrame
                              prompt={String(values["prompt"] ?? "")}
                              aspectRatio={values["aspect_ratio"]}
                              projectId={projectId}
                              onReady={(asset) => {
                                const role = startFrameSlot(model)?.role ?? "";
                                // The painted frame takes the start-frame slot (one fits).
                                setReferences((current) =>
                                  assignRoles(
                                    [
                                      { ...assetToReference(asset), role },
                                      ...current.filter(
                                        (item) => item.role !== role && item.assetId !== asset.id,
                                      ),
                                    ],
                                    model,
                                  ),
                                );
                              }}
                            />
                          )}
                          <AddCharacterReferences
                            room={maxReferences(model) - references.length}
                            onAdd={(assets) =>
                              setReferences((current) =>
                                assignRoles(
                                  [
                                    ...current,
                                    ...assets
                                      .filter(
                                        (asset) =>
                                          !current.some((item) => item.assetId === asset.id),
                                      )
                                      .map(assetToReference),
                                  ],
                                  model,
                                ),
                              )
                            }
                            onLook={(line) =>
                              setValues((current) => {
                                const prompt = String(current["prompt"] ?? "").trim();
                                return prompt.includes(line)
                                  ? current
                                  : { ...current, prompt: prompt ? `${prompt}\n\n${line}` : line };
                              })
                            }
                          />
                        </>
                      )
                    }
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

                {model && voiceReference && drivingSlot && (
                  <VoiceoverLipSync
                    model={model}
                    state={lipSync}
                    title={voiceReference.title}
                    clip={
                      longMode
                        ? null
                        : {
                            requestSeconds: voiceRequest,
                            longestSeconds: longestVoice,
                            onLongVideo: () =>
                              setLongDraft((current) => ({ ...current, enabled: true })),
                          }
                    }
                    cuts={
                      longMode && longPlan.voiceover
                        ? longPlan.voiceover.segments.slice(1).map((segment) => segment.start)
                        : null
                    }
                    cutaways={longMode && longPlan.voiceover ? longPlan.voiceover.cutaways : null}
                  />
                )}

                {model && (
                  <div className="flex flex-wrap items-center gap-2">
                    <BrandPicker
                      kitId={brandKit?.id ?? null}
                      onChange={chooseBrand}
                      kind={model.output_type === "video" ? "video" : "image"}
                      negativePrompt={(model.parameter_schema?.fields ?? []).some(
                        (field) => field.key === "negative_prompt",
                      )}
                      room={maxReferences(model) - references.length}
                      onAddReferences={(assets) =>
                        setReferences((current) =>
                          assignRoles(
                            [
                              ...current,
                              ...assets
                                .filter(
                                  (asset) => !current.some((item) => item.assetId === asset.id),
                                )
                                .map(assetToReference),
                            ],
                            model,
                          ),
                        )
                      }
                    />
                    {brandKit && !brandStyleLine(brandKit) && (
                      <span className="text-[11px] text-muted-foreground">
                        {brandKit.name} has no look yet: import its design system on the Brand page.
                      </span>
                    )}
                  </div>
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
                            brandKitId: brandKit?.id ?? null,
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

            <LongVideoRuns projectId={projectId} />

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
                    hiddenKeys={longMode ? ["duration"] : undefined}
                    onChange={(key, value) =>
                      setValues((current) => ({ ...current, [key]: value }))
                    }
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
                        hiddenKeys={longMode ? ["duration"] : undefined}
                        onChange={(key, value) =>
                          setValues((current) => ({ ...current, [key]: value }))
                        }
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
                <span className="font-mono" data-testid="estimated-cost">
                  {estimate.kind === "loading" && "Calculating…"}
                  {estimate.kind === "ready" && `$${estimate.costUsd.toFixed(2)}`}
                  {estimate.kind === "metered" && "Metered"}
                  {estimate.kind === "unavailable" && estimate.label}
                  {estimate.kind === "idle" && "—"}
                </span>
              </div>
              {estimate.kind === "metered" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {estimate.description}
                </p>
              )}
              {estimate.kind === "ready" && estimate.metered && (
                <div className="space-y-1.5" data-testid="metered-cost">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Charged by output size and length: {estimate.metered.seconds}s at{" "}
                    {estimate.metered.width}×{estimate.metered.height}
                    {estimate.metered.inputVideoSeconds > 0
                      ? ` plus ${Math.round(estimate.metered.inputVideoSeconds)}s of input video`
                      : ""}{" "}
                    ≈ {estimate.metered.tokens.toLocaleString()} video tokens at $
                    {estimate.metered.ratePer1k} per 1,000 (Higgsfield's list price; an account
                    discount makes it lower).
                  </p>
                  {(estimate.byResolution?.length ?? 0) > 1 && (
                    <div className="flex flex-wrap gap-1" data-testid="metered-by-resolution">
                      {estimate.byResolution!.map((option) => {
                        const current = values["resolution"] === option.resolution;
                        return (
                          <button
                            key={option.resolution}
                            type="button"
                            onClick={() =>
                              setValues((previous) => ({
                                ...previous,
                                resolution: option.resolution,
                              }))
                            }
                            className={cn(
                              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                              current
                                ? "border-primary text-foreground"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                            title={`Use ${option.resolution}`}
                          >
                            {option.resolution} ${option.usd.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {longMode && (
                <p className="text-[11px] text-primary" data-testid="long-video-cost">
                  Long video: {longPlan.clips.length} clips · {formatLength(longPlan.totalSeconds)}
                  {estimate.kind === "ready"
                    ? ` · clip 1 $${estimate.costUsd.toFixed(2)}`
                    : " · the estimate is for clip 1"}
                  {longPlan.keyframed && longPlan.paintedKeyframes > 0
                    ? ` · ${longPlan.paintedKeyframes} keyframes ${keyframesEstimate !== null ? `$${keyframesEstimate.toFixed(2)}` : "(not priced yet)"}`
                    : ""}
                  {longGrandTotal !== null ? ` · approx. $${longGrandTotal.toFixed(2)} in all` : ""}
                  {longWorstCase !== null
                    ? ` (up to $${longWorstCase.toFixed(2)} if every clip needs all its takes)`
                    : ""}
                </p>
              )}
              {creditWarning && (
                <p
                  className={cn(
                    "flex gap-1.5 rounded-md px-2 py-1.5 text-[11px] leading-relaxed",
                    creditWarning.level === "stop"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-foreground",
                  )}
                  data-testid="credit-warning"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {creditWarning.message}
                </p>
              )}
              {batchCount > 1 && (
                <p className="text-[11px] text-primary">
                  Batch matrix: {batchCount} generations
                  {estimate.kind === "ready"
                    ? ` · approx. $${(estimate.costUsd * batchCount).toFixed(2)} total`
                    : ""}
                </p>
              )}
              <Button
                size="lg"
                className="w-full accent-glow"
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                {submitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                {submitting
                  ? "Submitting…"
                  : longMode
                    ? `Generate long video · ${longPlan.clips.length} clips`
                    : estimate.kind === "ready"
                      ? `Generate · ~$${estimate.costUsd.toFixed(2)}`
                      : "Generate"}
              </Button>
              {disabledReason && !submitting && (
                <p
                  className={cn(
                    "text-[11px]",
                    estimate.kind === "unavailable" &&
                      estimate.code === "INSUFFICIENT_PROVIDER_BALANCE"
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                  data-testid="generate-blocked-reason"
                >
                  {disabledReason}
                </p>
              )}
              {estimateBypassHint && (
                <p className="text-[11px] text-muted-foreground">
                  To generate without an estimate, turn off “Require a cost estimate” in{" "}
                  <Link to="/settings" className="underline hover:text-foreground">
                    Settings
                  </Link>
                  .
                </p>
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
        max={Math.max(1, maxReferences(model) - references.length)}
        onConfirm={(assets) =>
          setReferences((current) =>
            assignRoles(
              [
                ...current,
                ...assets
                  .filter((asset) => !current.some((item) => item.assetId === asset.id))
                  .map(assetToReference),
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

      <AssetDetailDialog
        asset={selectedAsset}
        onOpenChange={(open) => !open && setSelectedAsset(null)}
      />

      <AlertDialog open={confirmHighCost} onOpenChange={setConfirmHighCost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {longMode
                ? "Start this long video?"
                : batchCount > 1
                  ? "Confirm this batch"
                  : "Confirm this generation"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {longMode
                ? `${
                    longPlan.keyframed
                      ? `First ${longPlan.paintedKeyframes} keyframes are painted${keyframesEstimate !== null ? ` (about $${keyframesEstimate.toFixed(2)})` : " (not priced yet)"}${longDraft.reviewKeyframes ? ", for you to review" : ""}; then ${longPlan.clips.length} clips are made one after another, each moving into its keyframe.`
                      : `This makes ${longPlan.clips.length} clips one after another, each starting from the last frame of the one before.`
                  } About ${formatLength(longPlan.totalSeconds)} in all. ${
                    longPlan.characters.length
                      ? `${longPlan.characters.map((character) => character.name).join(", ")} ${longPlan.characters.length === 1 ? "is" : "are"} kept the same throughout${longDraft.identityCheck ? ", and every clip is checked before the next is made" : ""}. `
                      : ""
                  }${finisherSummary}${
                    estimate.kind === "ready"
                      ? `Clip 1 is estimated at $${estimate.costUsd.toFixed(2)}${longGrandTotal !== null ? ` and the whole video at roughly $${longGrandTotal.toFixed(2)}` : ""}. `
                      : ""
                  }Each clip is quoted again by the provider before it is sent, and you can stop the run at any point.`
                : batchCount > 1
                  ? `This runs ${batchCount} separate generations, approximately $${
                      estimate.kind === "ready"
                        ? (estimate.costUsd * batchCount).toFixed(2)
                        : "0.00"
                    } in total. Each one is estimated again by the provider before it is sent.`
                  : estimate.kind === "metered"
                    ? `This model is charged by output size and length, and its price couldn't be worked out here: ${estimate.description}`
                    : `This generation is estimated to cost $${estimate.kind === "ready" ? estimate.costUsd.toFixed(2) : "0.00"}${
                        estimate.kind === "ready" && estimate.metered
                          ? ` at Higgsfield's list price (${estimate.metered.seconds}s at ${estimate.metered.width}×${estimate.metered.height})${
                              (estimate.byResolution ?? []).some(
                                (option) => option.usd < estimate.costUsd,
                              )
                                ? `. A lower resolution costs less: ${(estimate.byResolution ?? [])
                                    .filter((option) => option.usd < estimate.costUsd)
                                    .map(
                                      (option) => `${option.resolution} $${option.usd.toFixed(2)}`,
                                    )
                                    .join(", ")}`
                                : ""
                            }`
                          : ""
                      }.`}
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
              {longMode ? "Start long video" : "Generate anyway"}
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
async function loadReferenceItems(
  inputs: { assetId: string; role: string }[],
): Promise<ReferenceItem[]> {
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
  const { data: assets = [], isLoading } = useAssets({
    limit: 12,
    projectId,
    sourceType: "generated",
  });
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
