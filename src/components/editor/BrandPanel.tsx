import { useState } from "react";
import { Clapperboard, ImagePlus, Loader2, Palette, Stamp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { useEditBrandKit } from "@/hooks/useBrandKits";
import { useAssetsById } from "@/hooks/useLongVideos";
import { uploadAssetBlob, storageScope } from "@/lib/storage";
import {
  addEndCard,
  applyBrandKit,
  clearBrand,
  safeInsets,
  SAFE_AREA_LABELS,
  SAFE_AREAS,
  type SafeArea,
} from "@/lib/edit/brand";
import {
  aspectQuotient,
  formatTime,
  frameSize,
  LIMITS,
  newId,
  type ImageOverlay,
  type Timeline,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { timelineRefusal } from "@/lib/media/layout-only-check";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

/** A still in one colour at the edit's size, kept in the library (an end card's background). */
async function colourStill(input: {
  colour: string;
  size: { width: number; height: number };
  userId: string;
  projectId: string | null;
  title: string;
}): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = input.size.width;
  canvas.height = input.size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The end card couldn't be drawn");
  context.fillStyle = input.colour;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("The end card couldn't be drawn");
  const asset = await uploadAssetBlob(blob, {
    userId: input.userId,
    projectId: input.projectId,
    path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-end-card.jpg`,
    mimeType: "image/jpeg",
    kind: "image",
    title: input.title,
    width: input.size.width,
    height: input.size.height,
    metadata: { end_card: { background: input.colour } },
  });
  return asset.id;
}

/**
 * The edit's brand: the kit its titles and captions are set from, its logo
 * laid over the edit, its end card, and the platform whose own buttons and
 * captions the preview marks.
 */
export function BrandSection({
  timeline,
  layout,
  projectId,
  onChange,
  onUpdate,
}: {
  timeline: Timeline;
  layout: TimelineLayout;
  projectId: string | null;
  onChange: (timeline: Timeline, key?: string) => void;
  /** Applies a change to the timeline as it is when the change lands (after an upload). */
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
}) {
  const { user } = useAuth();
  const { kit, kits, supported } = useEditBrandKit(timeline, projectId);
  // The kit's end-card background, read for what it is (a still or a video) and how long it runs.
  const { data: kitAssets } = useAssetsById(kit?.endCardAssetId ? [kit.endCardAssetId] : []);
  const [seconds, setSeconds] = useState(3);
  const [making, setMaking] = useState(false);
  if (!supported) return null;

  const chosen = (id: string) => kits.find((entry) => entry.id === id) ?? null;
  const applied = timeline.brandKitId === kit?.id;
  const area = timeline.safeArea as SafeArea;

  const addLogo = async () => {
    if (!kit?.logoAssetId || layout.total < 0.2) return;
    const refused = await timelineRefusal([{ id: kit.logoAssetId, title: "The logo" }]);
    if (refused) {
      toast.error(refused);
      return;
    }
    const insets = safeInsets(area, timeline.aspectRatio);
    const width = aspectQuotient(timeline.aspectRatio) < 1 ? 0.22 : 0.12;
    const logo: ImageOverlay = {
      id: newId(),
      assetId: kit.logoAssetId,
      start: 0,
      end: Number(layout.total.toFixed(3)),
      // In the top corner away from the platform's buttons, inside the clear area.
      x: Number((insets.left + width / 2 + 0.02).toFixed(4)),
      y: Number((insets.top + 0.06).toFixed(4)),
      width,
      opacity: 0.9,
      fade: 0.3,
      label: "Logo",
    };
    onChange({ ...timeline, images: [...timeline.images, logo].slice(0, LIMITS.images) });
  };

  const makeEndCard = async () => {
    if (!kit || !user) return;
    setMaking(true);
    try {
      const background = kit.endCardAssetId ? kitAssets?.get(kit.endCardAssetId) : undefined;
      if (kit.endCardAssetId && !background)
        throw new Error("The kit's end card background isn't in the library any more");
      const backgroundId =
        kit.endCardAssetId ??
        (await colourStill({
          colour: kit.backgroundColor,
          size: frameSize(timeline.aspectRatio, timeline.resolution),
          userId: user.id,
          projectId,
          title: `${kit.name} end card background`,
        }));
      const kind: "video" | "image" =
        kit.endCardAssetId && background?.asset_type === "video" ? "video" : "image";
      const input = {
        seconds,
        area,
        background: {
          assetId: backgroundId,
          kind,
          durationSeconds:
            kind === "video" && background?.duration_seconds
              ? Number(background.duration_seconds)
              : null,
        },
        logoAssetId: kit.logoAssetId,
      };
      // Laid on the edit as it is once the background is ready, so nothing done meanwhile is lost.
      onUpdate((current) => addEndCard(current, kit, input));
      toast.success("End card added after the last clip.", {
        description: "Its background, logo and words are ordinary items: change any of them.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The end card couldn't be made");
    } finally {
      setMaking(false);
    }
  };

  return (
    <section className="space-y-3 border-b border-border p-3" data-testid="brand-section">
      <h3 className="label-eyebrow flex items-center gap-1.5">
        <Palette className="size-3" /> Brand
      </h3>
      {kits.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No brand kits yet. Make one in Settings → Brand kits: its fonts, colours, logo and end
          card are then one click away here.
        </p>
      ) : (
        <>
          <Select
            value={kit?.id ?? ""}
            onValueChange={(id) => {
              const next = chosen(id);
              if (next) onChange(applyBrandKit(timeline, next));
            }}
          >
            <SelectTrigger className="h-8" aria-label="Brand kit">
              <SelectValue placeholder="Choose a brand kit" />
            </SelectTrigger>
            <SelectContent>
              {kits.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.isDefault ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kit && (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                variant={applied ? "outline" : "secondary"}
                className="h-8 text-xs"
                onClick={() => onChange(applyBrandKit(timeline, kit))}
              >
                <Palette className="mr-1 size-3.5" /> {applied ? "Apply again" : "Apply to text"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={
                  !kit.logoAssetId || timeline.images.length >= LIMITS.images || layout.total < 0.2
                }
                title={kit.logoAssetId ? undefined : "The kit has no logo"}
                onClick={addLogo}
              >
                <Stamp className="mr-1 size-3.5" /> Add logo
              </Button>
            </div>
          )}
          {timeline.brandKitId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full text-xs"
              onClick={() => onChange(clearBrand(timeline))}
            >
              Back to the studio's own text style
            </Button>
          )}
          {kit && (
            <div className="flex items-center gap-1.5">
              <Select value={String(seconds)} onValueChange={(value) => setSeconds(Number(value))}>
                <SelectTrigger className="h-8 w-24 text-xs" aria-label="End card length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} seconds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 text-xs"
                disabled={making || timeline.clips.length >= LIMITS.clips}
                onClick={() => void makeEndCard()}
                data-testid="add-end-card"
              >
                {making ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Clapperboard className="mr-1 size-3.5" />
                )}
                Add end card
              </Button>
            </div>
          )}
        </>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Keep clear of</Label>
        <Select
          value={area}
          onValueChange={(value) => onChange({ ...timeline, safeArea: value as SafeArea })}
        >
          <SelectTrigger className="h-8" aria-label="Platform safe area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SAFE_AREAS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {SAFE_AREA_LABELS[entry]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          The preview marks where the platform's own buttons and captions cover the picture; end
          cards and logos are laid out inside the clear area.
        </p>
      </div>
    </section>
  );
}

/** Pictures laid over the edit (a logo): where each shows, how big, and when. */
export function ImageOverlaysSection({
  timeline,
  layout,
  assets,
  onChange,
}: {
  timeline: Timeline;
  layout: TimelineLayout;
  assets: Map<string, AssetRow>;
  onChange: (timeline: Timeline, key?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const update = (id: string, patch: Partial<ImageOverlay>, key?: string) =>
    onChange(
      {
        ...timeline,
        images: timeline.images.map((image) => (image.id === id ? { ...image, ...patch } : image)),
      },
      key,
    );
  return (
    <section className="space-y-3 border-b border-border p-3" data-testid="image-overlays">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label-eyebrow">Logos & pictures</h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={timeline.images.length >= LIMITS.images || layout.total < 0.2}
          onClick={() => setPicking(true)}
        >
          <ImagePlus className="mr-1 size-3.5" /> Add
        </Button>
      </div>
      {timeline.images.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Lay a logo or a picture over the video (a PNG with a clear background sits on it cleanly).
        </p>
      )}
      {timeline.images.map((image) => {
        const asset = assets.get(image.assetId);
        const slider = (
          label: string,
          value: number,
          min: number,
          max: number,
          step: number,
          apply: (value: number) => Partial<ImageOverlay>,
          shown: string,
        ) => (
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{label}</span>
              <span>{shown}</span>
            </div>
            <Slider
              min={min}
              max={max}
              step={step}
              value={[value]}
              onValueChange={([next]) =>
                update(image.id, apply(next ?? value), `image-${label}:${image.id}`)
              }
              aria-label={`${image.label ?? "Picture"} ${label.toLowerCase()}`}
            />
          </div>
        );
        return (
          <div key={image.id} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {image.label ?? asset?.title ?? "Picture"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatTime(image.start)}–{formatTime(image.end)}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${image.label ?? "picture"}`}
                onClick={() =>
                  onChange({
                    ...timeline,
                    images: timeline.images.filter((entry) => entry.id !== image.id),
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {slider("Across", image.x, 0, 1, 0.01, (x) => ({ x }), `${Math.round(image.x * 100)}%`)}
            {slider("Down", image.y, 0, 1, 0.01, (y) => ({ y }), `${Math.round(image.y * 100)}%`)}
            {slider(
              "Width",
              image.width,
              0.03,
              1,
              0.01,
              (width) => ({ width }),
              `${Math.round(image.width * 100)}%`,
            )}
            {slider(
              "Opacity",
              image.opacity,
              0.1,
              1,
              0.05,
              (opacity) => ({ opacity }),
              `${Math.round(image.opacity * 100)}%`,
            )}
            {slider(
              "From",
              image.start,
              0,
              Math.max(0.1, layout.total - 0.1),
              0.1,
              (start) => ({ start: Math.max(0, Math.min(start, image.end - 0.1)) }),
              formatTime(image.start),
            )}
            {slider(
              "Until",
              image.end,
              0.1,
              Math.max(0.2, layout.total),
              0.1,
              (end) => ({ end: Math.max(end, image.start + 0.1) }),
              formatTime(image.end),
            )}
          </div>
        );
      })}
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image"]}
        max={1}
        title="A picture to lay over the video"
        onConfirm={async (chosen: AssetRow[]) => {
          setPicking(false);
          const asset = chosen[0];
          if (!asset) return;
          // A client's screen marked layout only is never laid over a frame.
          const refused = await timelineRefusal([{ id: asset.id, title: asset.title }]);
          if (refused) {
            toast.error(refused);
            return;
          }
          onChange({
            ...timeline,
            images: [
              ...timeline.images,
              {
                id: newId(),
                assetId: asset.id,
                start: 0,
                end: Number(layout.total.toFixed(3)),
                x: 0.5,
                y: 0.5,
                width: 0.3,
                opacity: 1,
                fade: 0.3,
                label: asset.title ?? "Picture",
              },
            ].slice(0, LIMITS.images),
          });
        }}
      />
    </section>
  );
}
