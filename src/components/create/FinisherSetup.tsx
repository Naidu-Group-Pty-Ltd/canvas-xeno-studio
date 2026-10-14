import { Flag } from "lucide-react";
import type { ReferenceItem } from "@/components/create/reference-files";
import {
  newFinale,
  type FinaleDraft,
  type LongVideoPlan,
} from "@/components/create/long-video-plan";
import {
  FINALE_SECONDS,
  finaleHolds,
  finaleReveals,
  modelLine,
  type FinaleMode,
} from "@/lib/long-video/plan";
import { END_CARD_BACKGROUNDS } from "@/lib/media/end-card";
import {
  analyseFinisher,
  DEFAULT_MARK_SCALE,
  defaultScale,
  finisherTreatment,
} from "@/lib/media/brand-card";
import { hexColor } from "@/lib/media/frame";
import { pictureSize } from "@/lib/media/compose";
import { shapeDiffers } from "@/lib/media/extend-artwork";
import { ArtworkExtender } from "@/components/create/ArtworkExtender";
import { EndCardPreview } from "@/components/studio/EndCardPreview";
import { useFinisherPicture } from "@/hooks/useFinisherPicture";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MODES: { mode: FinaleMode; label: string; hint: (seconds: number) => string }[] = [
  {
    mode: "both",
    label: "Move into it, then hold",
    hint: (seconds) => `The last clip ends on it, then it holds for ${seconds}s.`,
  },
  {
    mode: "reveal",
    label: "Move into it",
    hint: () => "The last clip ends on it.",
  },
  {
    mode: "end_card",
    label: "End card",
    hint: (seconds) => `It holds for ${seconds}s after the last clip.`,
  },
];

/**
 * The brand finisher of a long video: which reference image (the logo or end
 * card) closes it, how the video ends on it, and how its end card looks. The
 * finisher is never sent with the clips, so it can't turn up partway through.
 */
export function FinisherSetup({
  images,
  finale,
  plan,
  startRole,
  size,
  projectId,
  campaignId,
  onChange,
  onExtend,
}: {
  images: ReferenceItem[];
  finale: FinaleDraft | null;
  plan: LongVideoPlan;
  /** The role of the image clip 1 starts from, which can't also be the finisher. */
  startRole: string | null;
  /** The end card's size: the video's own shape. */
  size: { width: number; height: number };
  /** Where files made for it (the extended artwork) are kept. */
  projectId: string | null;
  campaignId: string | null;
  /** `off` is true when the person chose no finisher. */
  onChange: (finale: FinaleDraft | null, off: boolean) => void;
  /** Uses the finisher extended to the video's shape with AI in its place (null: as uploaded). */
  onExtend: (finisherAssetId: string, sourceAssetId: string | null) => void;
}) {
  // The finisher the plan uses (none when its image is gone or clip 1 starts from it).
  const chosen =
    finale && plan.finale?.assetId === finale.assetId
      ? images.find((image) => image.assetId === finale.assetId)
      : undefined;
  const original = useFinisherPicture(
    chosen ? { assetId: chosen.assetId, bucket: chosen.bucket, path: chosen.path } : null,
  );
  // Artwork extended to the video's shape with AI stands in for it on the card.
  const extendedId = chosen ? (finale?.sourceAssetId ?? null) : null;
  const extended = useFinisherPicture(extendedId ? { assetId: extendedId } : null);
  const picture = extendedId ? extended : original;
  const canMoveInto = !!plan.end;
  const mode = plan.finale?.mode ?? finale?.mode ?? "end_card";
  const set = (patch: Partial<FinaleDraft>) =>
    finale && onChange({ ...finale, ...patch, suggested: null }, false);
  const preview =
    size.width >= size.height
      ? { width: 240, height: Math.round((240 * size.height) / size.width) }
      : { width: Math.round((200 * size.width) / size.height), height: 200 };
  const customColour = finale ? hexColor(finale.style.background) : null;
  // The video's final moment exists only once the video does: for a card held after it.
  const backgrounds = END_CARD_BACKGROUNDS.filter(
    (option) => option.value !== "scene" || mode === "end_card",
  );
  const backgroundValue =
    finale && backgrounds.some((option) => option.value === finale.style.background)
      ? finale.style.background
      : finale && !customColour
        ? "auto"
        : "custom";
  const backgroundHint = backgrounds.find((option) => option.value === backgroundValue)?.hint;
  const analysis = picture ? analyseFinisher(picture) : null;
  // Designed artwork of another shape can have its background painted out to the frame's edges.
  const extendable =
    !extendedId &&
    !!original &&
    analyseFinisher(original).kind === "artwork" &&
    shapeDiffers(pictureSize(original), size);
  const autoScale =
    picture && analysis ? defaultScale(picture, analysis, size) : DEFAULT_MARK_SCALE;
  const scale = finale?.style.scale ?? autoScale;

  return (
    <div
      className="space-y-3 rounded-md border border-border bg-background/60 p-3"
      data-testid="long-video-finisher"
    >
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Flag className="size-3.5 text-primary" /> Brand finisher
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The logo or end card the video closes on. It's kept out of every clip, so it never turns
          up partway through, and each clip before the last is told not to wrap up.
        </p>
      </div>

      {images.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Attach your logo or end card as a reference image to finish the video on it.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Finisher">
          <button
            type="button"
            role="radio"
            aria-checked={!chosen}
            onClick={() => onChange(null, true)}
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-md border text-[11px]",
              !chosen
                ? "border-primary/60 bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            data-testid="finisher-none"
          >
            None
          </button>
          {images.map((image, index) => {
            const selected = chosen?.assetId === image.assetId;
            const startsClip = !!startRole && image.role === startRole;
            return (
              <button
                key={image.assetId}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Image ${index + 1}${image.title ? `: ${image.title}` : ""}`}
                title={
                  startsClip
                    ? "Clip 1 starts from this image, so it can't also be the finisher"
                    : (image.title ?? `Image ${index + 1}`)
                }
                disabled={startsClip}
                onClick={() =>
                  selected || startsClip
                    ? undefined
                    : onChange(newFinale(image.assetId, canMoveInto), false)
                }
                className={cn(
                  "relative h-16 w-16 overflow-hidden rounded-md border bg-surface",
                  selected ? "border-primary ring-2 ring-primary/40" : "border-border",
                  startsClip && "cursor-not-allowed opacity-40",
                )}
                data-testid="finisher-option"
                data-selected={selected}
              >
                <MediaPreview
                  bucket={image.bucket}
                  path={image.path}
                  type="image"
                  contain
                  alt={`Image ${index + 1}`}
                />
                <span className="absolute bottom-0 left-0 rounded-tr bg-background/85 px-1 text-[9px]">
                  {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {finale && chosen && (
        <div className="space-y-3">
          {finale.suggested && (
            <p className="text-[11px] text-muted-foreground" data-testid="finisher-suggested">
              <span className="font-medium text-foreground">Picked for you:</span>{" "}
              {finale.suggested}. Choose another image, or None, if that's wrong.
            </p>
          )}
          <div
            className="grid gap-1.5 sm:grid-cols-3"
            role="radiogroup"
            aria-label="How the video ends"
          >
            {MODES.map((option) => {
              const unavailable = finaleReveals(option.mode) && !canMoveInto;
              const selected = mode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={unavailable}
                  onClick={() => set({ mode: option.mode })}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "border-primary/60 bg-primary/10" : "border-border",
                  )}
                  data-testid={`finisher-mode-${option.mode}`}
                >
                  <span className="block text-xs font-medium">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {option.hint(finale.seconds)}
                  </span>
                </button>
              );
            })}
          </div>
          {!canMoveInto && plan.continuation && (
            <p className="text-[11px] text-muted-foreground">
              {plan.start?.kind === "video"
                ? "A clip that extends the one before can't end on a given image, so the finisher holds as an end card after the last clip."
                : `${modelLine(plan.continuation)} can't end a clip on a given image, so the finisher holds as an end card after the last clip.`}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-3">
              {finaleHolds(mode) && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Hold the end card for</Label>
                  <Select
                    value={String(finale.seconds)}
                    onValueChange={(value) => set({ seconds: Number(value) })}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label="End card length">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: FINALE_SECONDS.max - FINALE_SECONDS.min + 1 },
                        (_, index) => FINALE_SECONDS.min + index,
                      ).map((seconds) => (
                        <SelectItem key={seconds} value={String(seconds)}>
                          {seconds}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {extendedId ? (
                <p
                  className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed"
                  data-testid="finisher-treatment"
                >
                  Your artwork, extended to the video's shape with AI: it fills the frame, with your
                  own artwork laid over the painted background exactly.{" "}
                  <button
                    type="button"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => onExtend(finale.assetId, null)}
                    data-testid="finisher-extend-undo"
                  >
                    Use the original
                  </button>
                </p>
              ) : (
                analysis && (
                  <p
                    className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed"
                    data-testid="finisher-treatment"
                  >
                    {finisherTreatment(analysis)}
                  </p>
                )
              )}
              {extendable && original && (
                <ArtworkExtender
                  key={finale.assetId}
                  finisherAssetId={finale.assetId}
                  picture={original}
                  frame={size}
                  scale={finale.style.scale}
                  title={chosen.title ?? "Brand artwork"}
                  projectId={projectId}
                  campaignId={campaignId}
                  onExtended={(assetId) => onExtend(finale.assetId, assetId)}
                />
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Around the logo</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={backgroundValue}
                    onValueChange={(value) =>
                      set({
                        style: {
                          ...finale.style,
                          background: value === "custom" ? (customColour ?? "#101828") : value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-56" aria-label="End card background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {backgrounds.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">A colour…</SelectItem>
                    </SelectContent>
                  </Select>
                  {backgroundValue === "custom" && (
                    <input
                      type="color"
                      value={customColour ?? "#101828"}
                      onChange={(event) =>
                        set({ style: { ...finale.style, background: event.target.value } })
                      }
                      className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                      aria-label="End card colour"
                    />
                  )}
                </div>
                {backgroundHint && (
                  <p className="text-[11px] text-muted-foreground">{backgroundHint}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">
                    {analysis?.kind === "artwork" ? "Artwork size" : "Logo size"} ·{" "}
                    {Math.round(scale * 100)}%{finale.style.scale === null ? " (auto)" : ""}
                  </Label>
                  {finale.style.scale !== null && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => set({ style: { ...finale.style, scale: null } })}
                    >
                      Auto
                    </button>
                  )}
                </div>
                <Slider
                  min={30}
                  max={100}
                  step={5}
                  value={[Math.round(scale * 100)]}
                  onValueChange={([value]) =>
                    set({ style: { ...finale.style, scale: (value ?? 80) / 100 } })
                  }
                  className="max-w-56"
                  aria-label={analysis?.kind === "artwork" ? "Artwork size" : "Logo size"}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Laid out for the video's shape ({size.width}×{size.height}): your logo's own pixels
                are never redrawn, only placed.
                {finaleReveals(mode)
                  ? " The last clip ends on this card."
                  : " It's added after the last clip when you open the video in the Editor."}
                {mode === "end_card" &&
                (finale.style.background === "auto" || finale.style.background === "scene") &&
                analysis?.kind !== "artwork"
                  ? " There it sits over the video's final moment, softly defocused; the preview shows it on its own."
                  : ""}
              </p>
            </div>
            <EndCardPreview
              picture={picture}
              style={finale.style}
              width={preview.width}
              height={preview.height}
              className={
                size.width >= size.height ? "w-60 justify-self-start" : "h-52 justify-self-start"
              }
              label="End card preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
