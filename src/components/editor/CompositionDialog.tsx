import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Pause, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  imageIdsFor,
  previewScene,
  useCompositionBrands,
  useCompositionCosts,
  useCompositionImages,
  useLayoutOnly,
  useSignedFonts,
} from "@/hooks/useCompositions";
import { layoutOnlyRefusal } from "@/lib/media/layout-only";
import { useBrandKits } from "@/hooks/useBrandKits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { fontFilesFor } from "@/lib/compositions/brand";
import { compileComposition, type Scene } from "@/lib/compositions/compile";
import { QUALITY_SETTINGS, renderEstimate, type RenderQuality } from "@/lib/compositions/settings";
import { specKey, type CompositionClip, type CompositionSpec } from "@/lib/compositions/spec";
import { TEMPLATES, templateById } from "@/lib/compositions/templates";
import { TEMPLATE_GROUP_LABELS, type TemplateGroup } from "@/lib/compositions/types";
import { startComposition } from "@/lib/compositions.functions";
import { formatTime } from "@/lib/edit/timeline";
import { cn } from "@/lib/utils";
import { CompositionFields } from "./CompositionFields";
import { CompositionPreview } from "./CompositionPreview";

type Params = Record<string, unknown>;
type StartedView = Awaited<ReturnType<typeof startComposition>>;

/** A drawing asked for: the workspace places it (or gives the clip it) once it is drawn. */
export interface DrawStarted {
  view: StartedView;
  spec: CompositionSpec;
  brandKitId: string | null;
  quality: RenderQuality;
  /** The clip it is a new drawing of, or null for a new clip. */
  clipId: string | null;
}

interface CompositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The edit's frame and rate: what the composition is drawn at. */
  width: number;
  height: number;
  fps: number;
  projectId: string | null;
  /** The kit the edit is styled from: a new composition's. */
  defaultKitId: string | null;
  /** The composition clip being changed, or null for a new one. */
  editing: { clipId: string; composition: CompositionClip } | null;
  onStarted: (started: DrawStarted) => void;
}

const GROUPS: TemplateGroup[] = ["kit", "brand", "product"];

/**
 * Motion graphics from the studio's templates, in the brand: pick one, set it
 * up and watch it live, then have it drawn (a draft to edit with; the edit's
 * render draws it final). Changing a composition clip opens here too.
 */
export function CompositionDialog(props: CompositionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[min(1180px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        {props.open && (
          <CompositionEditor
            key={props.editing?.clipId ?? "new"}
            {...props}
            onDone={() => props.onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function defaultsOf(templateId: string): Params {
  const template = templateById(templateId);
  const parsed = template?.schema.safeParse({});
  return parsed?.success ? (parsed.data as Params) : {};
}

function CompositionEditor({
  width,
  height,
  fps,
  projectId,
  defaultKitId,
  editing,
  onStarted,
  onDone,
}: CompositionDialogProps & { onDone: () => void }) {
  const initial = editing?.composition ?? null;
  const [templateId, setTemplateId] = useState(
    initial && templateById(initial.spec.template) ? initial.spec.template : TEMPLATES[0]!.id,
  );
  // Each template keeps its own settings while another is looked at.
  const [paramsBy, setParamsBy] = useState<Record<string, Params>>(() =>
    initial
      ? {
          [initial.spec.template]: { ...defaultsOf(initial.spec.template), ...initial.spec.params },
        }
      : {},
  );
  const [durationBy, setDurationBy] = useState<Record<string, number>>(() =>
    initial ? { [initial.spec.template]: initial.spec.duration } : {},
  );
  const [kitId, setKitId] = useState<string | null>(initial ? initial.brandKitId : defaultKitId);
  const [quality, setQuality] = useState<RenderQuality>(initial?.quality ?? "draft");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const template = templateById(templateId) ?? TEMPLATES[0]!;
  const params = useMemo(
    () => paramsBy[template.id] ?? defaultsOf(template.id),
    [paramsBy, template.id],
  );
  const duration = Math.min(
    template.duration.max,
    Math.max(template.duration.min, durationBy[template.id] ?? template.duration.default),
  );
  const checked = template.schema.safeParse(params);
  const invalid = checked.success
    ? null
    : checked.error.issues
        .slice(0, 1)
        .map((issue) => `${fieldLabel(template.fields, issue.path[0])}: ${issue.message}`)[0]!;
  const spec: CompositionSpec = useMemo(
    () => ({
      template: template.id,
      version: template.version,
      params: (checked.success ? checked.data : params) as Params,
      duration,
    }),
    // The parsed settings follow `params`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template.id, template.version, params, duration],
  );

  const { data: kits } = useBrandKits();
  const { brandOf } = useCompositionBrands();
  const brand = brandOf(kitId);
  const imageIds = useMemo(() => imageIdsFor(spec, brand), [spec, brand]);
  const { assets, media } = useCompositionImages(imageIds);
  // A client's screen marked layout only is never drawn (the server refuses it too).
  const held = useLayoutOnly(imageIds);
  const heldOut = held.size
    ? layoutOnlyRefusal(
        [...held].map((assetId) => assets.get(assetId)?.title ?? null),
        "motion",
      )
    : null;
  const fontFiles = useMemo(() => fontFilesFor(brand), [brand]);
  const { data: fonts = new Map<string, string>() } = useSignedFonts(fontFiles);
  const built = useMemo(
    () => previewScene({ spec, brand, width, height, fps, assets, media, fonts }),
    [spec, brand, width, height, fps, assets, media, fonts],
  );

  // What drawing it takes: how many drawings change (the rest reuse the one before).
  const { data: costs } = useCompositionCosts();
  const deferred = useDeferredValue(spec);
  const estimate = useMemo(() => {
    try {
      const draft = compileComposition({
        spec: deferred,
        brand,
        width,
        height,
        fps,
        settings: QUALITY_SETTINGS.draft,
        imageInfo: () => null,
      });
      const frames = draft.bundle.frames;
      return {
        draft: renderEstimate({
          frames,
          settings: QUALITY_SETTINGS.draft,
          changing: draft.changing,
          secondsPerDrawing: costs?.draft ?? null,
          width,
          height,
        }).seconds,
        final: renderEstimate({
          frames,
          settings: QUALITY_SETTINGS.final,
          changing: draft.changing * QUALITY_SETTINGS.final.drawings,
          secondsPerDrawing: costs?.final ?? null,
          width,
          height,
        }).seconds,
      };
    } catch {
      return null;
    }
  }, [deferred, brand, width, height, fps, costs]);

  const unchanged =
    !!initial &&
    initial.quality === quality &&
    initial.renderedKey !== null &&
    initial.renderedKey === specKey(spec, kitId);
  const blocked = invalid ?? built.error ?? heldOut;

  async function draw() {
    if (blocked) return;
    if (unchanged) {
      onDone();
      return;
    }
    setSubmitting(true);
    setProblem(null);
    try {
      const view = await startComposition({
        data: { spec, brandKitId: kitId, quality, projectId, width, height, fps },
      });
      onStarted({ view, spec, brandKitId: kitId, quality, clipId: editing?.clipId ?? null });
      onDone();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The motion graphic couldn't be started";
      setProblem(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const missing = built.scene?.missing ?? [];

  return (
    <>
      <DialogHeader className="border-b border-border px-5 py-3.5 text-left">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {editing ? "Change the motion graphic" : "Add a motion graphic"}
        </DialogTitle>
        <DialogDescription className="text-xs">
          Drawn from the studio&apos;s templates in your brand, at this edit&apos;s frame ({width}×
          {height}, {fps} fps). The preview plays live; adding it has the media service draw it.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[210px_minmax(0,1fr)_300px] md:overflow-hidden">
        {/* Templates */}
        <nav
          className="scroll-slim border-b border-border p-2 md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r"
          aria-label="Templates"
        >
          {GROUPS.map((group) => (
            <div key={group} className="mb-2">
              <p className="label-eyebrow px-2 py-1">{TEMPLATE_GROUP_LABELS[group]}</p>
              <ul className="grid grid-cols-2 gap-0.5 md:grid-cols-1">
                {TEMPLATES.filter((entry) => entry.group === group).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(entry.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs",
                        entry.id === template.id
                          ? "bg-surface-raised font-medium text-foreground"
                          : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground",
                      )}
                      aria-current={entry.id === template.id}
                      title={entry.description}
                    >
                      {entry.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Preview */}
        <section className="flex min-h-0 flex-col gap-2 p-3">
          <p className="text-xs text-muted-foreground">{template.description}</p>
          <PreviewPane
            key={template.id}
            scene={built.scene}
            error={built.error}
            width={width}
            height={height}
            fps={fps}
            duration={duration}
            label={`${template.title} preview`}
          />
          {missing.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px]">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
              <span>
                The demo record has nothing for {missing.map((path) => `{{${path}}}`).join(", ")},
                so {missing.length === 1 ? "it shows" : "they show"} blank.{" "}
                <Link to="/brand" className="underline">
                  Fill it in on the Brand page
                </Link>
                .
              </span>
            </p>
          )}
        </section>

        {/* Settings */}
        <aside className="scroll-slim space-y-4 border-t border-border p-3 md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Length <span className="text-muted-foreground">({duration.toFixed(1)}s)</span>
            </Label>
            <Slider
              min={template.duration.min}
              max={template.duration.max}
              step={0.1}
              value={[duration]}
              onValueChange={([value]) =>
                setDurationBy((current) => ({
                  ...current,
                  [template.id]: value ?? template.duration.default,
                }))
              }
              aria-label="Length"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand kit</Label>
            <Select
              value={kitId ?? "studio"}
              onValueChange={(value) => setKitId(value === "studio" ? null : value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="studio">The studio&apos;s own look</SelectItem>
                {(kits?.kits ?? []).map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    {kit.name}
                    {kit.id === defaultKitId ? " (this edit's)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Its colours, type, logo, curves and demo record.
            </p>
          </div>
          <CompositionFields
            fields={template.fields}
            params={params}
            onChange={(next) => setParamsBy((current) => ({ ...current, [template.id]: next }))}
            media={media}
            assets={assets}
            held={held}
          />
          {initial &&
            initial.spec.template === template.id &&
            initial.spec.version < template.version && (
              <p className="text-[11px] text-muted-foreground">
                This template has changed since the clip was made: drawing it again uses the new
                version.
              </p>
            )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        <Select value={quality} onValueChange={(value) => setQuality(value as RenderQuality)}>
          <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Quality">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">
              Draft{estimate ? ` · about ${roughly(estimate.draft)}` : ""}
            </SelectItem>
            <SelectItem value="final">
              Final now{estimate ? ` · about ${roughly(estimate.final)}` : ""}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {quality === "draft"
            ? "A quick drawing to edit with. The edit's render draws it final (2x, with motion blur) and reuses that from then on."
            : "Drawn as the render uses it: twice the size, eight drawings a frame for motion blur."}
        </p>
        {(problem ?? blocked) && (
          <p className="w-full text-[11px] text-destructive" role="alert">
            {problem ?? blocked}
          </p>
        )}
        <Button variant="ghost" size="sm" className="h-8" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8"
          disabled={submitting || Boolean(blocked)}
          onClick={() => void draw()}
        >
          {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {editing ? (unchanged ? "Done" : "Update the clip") : "Add to the edit"}
        </Button>
      </div>
    </>
  );
}

/** The live preview and its transport: playing on a loop, scrubbed by hand. */
function PreviewPane({
  scene,
  error,
  width,
  height,
  fps,
  duration,
  label,
}: {
  scene: Scene | null;
  error: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  label: string;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) / 1000;
      last = now;
      setTime((current) => (current + step >= duration ? 0 : current + step));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  const at = Math.min(time, duration);
  const beats = scene?.scene.beats ?? [];
  return (
    <>
      <div
        className={cn(
          "relative min-h-0 flex-1 rounded-md bg-black",
          height > width ? "h-[52vh] md:h-auto" : "h-[34vh] md:h-auto",
        )}
      >
        {scene ? (
          <CompositionPreview
            scene={scene}
            width={width}
            height={height}
            time={at}
            className="absolute inset-0"
            label={label}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">
            {error ?? "Preparing the preview…"}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause the preview" : "Play the preview"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="relative flex-1">
          <Slider
            min={0}
            max={duration}
            step={1 / fps}
            value={[at]}
            onValueChange={([value]) => {
              setPlaying(false);
              setTime(value ?? 0);
            }}
            aria-label="Preview time"
          />
          {beats.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-1.5">
              {beats.map((beat) => (
                <span
                  key={`${beat.at}-${beat.label}`}
                  className="absolute h-1.5 w-px bg-muted-foreground/70"
                  style={{ left: `${Math.min(100, (beat.at / duration) * 100)}%` }}
                  title={`${formatTime(beat.at)} · ${beat.label}`}
                />
              ))}
            </div>
          )}
        </div>
        <span className="w-24 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTime(at)} / {formatTime(duration)}
        </span>
      </div>
    </>
  );
}

function fieldLabel(fields: readonly { key: string; label: string }[], key: unknown): string {
  return (
    fields.find((field) => field.key === key)?.label ?? (typeof key === "string" ? key : "Settings")
  );
}

/** Seconds as a person would say them. */
function roughly(seconds: number): string {
  if (seconds < 90) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  return `${Math.round(seconds / 60)} min`;
}
