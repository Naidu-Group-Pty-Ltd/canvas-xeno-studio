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
import { hexColor } from "@/lib/media/frame";
import { FramePreview } from "@/components/studio/FramePreview";
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
  size,
  onChange,
}: {
  images: ReferenceItem[];
  finale: FinaleDraft | null;
  plan: LongVideoPlan;
  /** The end card's size: the video's own shape. */
  size: { width: number; height: number };
  /** `off` is true when the person chose no finisher. */
  onChange: (finale: FinaleDraft | null, off: boolean) => void;
}) {
  const chosen = finale ? images.find((image) => image.assetId === finale.assetId) : undefined;
  const picture = useFinisherPicture(
    chosen ? { assetId: chosen.assetId, bucket: chosen.bucket, path: chosen.path } : null,
  );
  const canMoveInto = !!plan.end;
  const mode = plan.finale?.mode ?? finale?.mode ?? "end_card";
  const set = (patch: Partial<FinaleDraft>) =>
    finale && onChange({ ...finale, ...patch, suggested: null }, false);
  const preview = { width: 160, height: Math.round((160 * size.height) / size.width) };
  const customColour = finale ? hexColor(finale.style.background) : null;
  const backgroundValue =
    finale && END_CARD_BACKGROUNDS.some((option) => option.value === finale.style.background)
      ? finale.style.background
      : "custom";

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
            return (
              <button
                key={image.assetId}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Image ${index + 1}${image.title ? `: ${image.title}` : ""}`}
                title={image.title ?? `Image ${index + 1}`}
                onClick={() =>
                  selected ? undefined : onChange(newFinale(image.assetId, canMoveInto), false)
                }
                className={cn(
                  "relative h-16 w-16 overflow-hidden rounded-md border bg-surface",
                  selected ? "border-primary ring-2 ring-primary/40" : "border-border",
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
              {modelLine(plan.continuation)} can't end a clip on a given image, so the finisher
              holds as an end card after the last clip.
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
                    <SelectTrigger className="h-8 w-44" aria-label="End card background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {END_CARD_BACKGROUNDS.map((option) => (
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
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Logo size · {Math.round(finale.style.scale * 100)}% of the frame
                </Label>
                <Slider
                  min={30}
                  max={100}
                  step={5}
                  value={[Math.round(finale.style.scale * 100)]}
                  onValueChange={([value]) =>
                    set({ style: { ...finale.style, scale: (value ?? 80) / 100 } })
                  }
                  className="max-w-56"
                  aria-label="Logo size"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The end card is your image exactly as uploaded, laid out at the video's shape (
                {size.width}×{size.height}).
                {finaleReveals(mode)
                  ? " The last clip ends on it."
                  : " It's added after the last clip when you open the video in the Editor."}
              </p>
            </div>
            <FramePreview
              picture={picture}
              layout={{
                ...preview,
                fit: "contain",
                background: finale.style.background,
                scale: finale.style.scale,
              }}
              className="h-40 w-auto justify-self-start"
              label="End card preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
