import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ImagePlus, Palette, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useBrandKits } from "@/hooks/useBrandKits";
import { useAssetsById } from "@/hooks/useLongVideos";
import type { AssetRow } from "@/hooks/useStudioData";
import { brandAvoidLine, brandStyleLine } from "@/lib/brand/design";
import type { BrandKit } from "@/lib/edit/brand";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The colours a kit shows as: its palette, else its three title colours. */
function swatchesOf(kit: BrandKit): string[] {
  return kit.palette.length
    ? kit.palette.map((colour) => colour.hex)
    : [kit.backgroundColor, kit.accentColor, kit.textColor];
}

function Swatches({ kit, className }: { kit: BrandKit; className?: string | undefined }) {
  return (
    <span
      className={cn("flex h-3 w-10 overflow-hidden rounded-sm border border-border", className)}
    >
      {swatchesOf(kit)
        .slice(0, 6)
        .map((hex) => (
          <span key={hex} className="flex-1" style={{ background: hex }} />
        ))}
    </span>
  );
}

/**
 * The brand a picture or video is made in: its look goes into the prompt
 * (the line shown here), what it never shows into the negative prompt where
 * the model has one, and its style references can be added as reference
 * images. A long video keeps it for every clip, keyframe and its edit.
 */
export function BrandPicker({
  kitId,
  onChange,
  kind,
  room,
  onAddReferences,
}: {
  kitId: string | null;
  onChange: (kitId: string | null) => void;
  kind: "image" | "video";
  /** How many more reference images the model takes (0: none). */
  room: number;
  onAddReferences?: ((assets: AssetRow[]) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useBrandKits();
  const kits = data?.kits ?? [];
  const kit = kits.find((entry) => entry.id === kitId) ?? null;
  const { data: assets } = useAssetsById(kit?.referenceAssetIds ?? []);
  if (data && !data.supported) return null;
  const line = kit ? brandStyleLine(kit, kind) : "";
  const avoid = kit ? brandAvoidLine(kit) : "";
  const references = (kit?.referenceAssetIds ?? []).flatMap((id) => {
    const asset = assets?.get(id);
    return asset ? [asset] : [];
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={kit ? "secondary" : "ghost"}
          className="h-7 gap-1.5 px-2 text-xs"
          data-testid="brand-picker"
        >
          {kit ? <Swatches kit={kit} className="w-8" /> : <Palette className="size-3.5" />}
          {kit ? kit.name : "Brand"}
          {kit && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Make it without a brand"
              className="-mr-1 rounded p-0.5 hover:bg-background/60"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(null);
                }
              }}
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2">
        <p className="px-1 text-[11px] text-muted-foreground">
          Made in a brand, the prompt carries its look (palette, light, style, mood) and avoids what
          it never shows.
        </p>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {kits.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                onChange(entry.id);
                if (!brandStyleLine(entry, kind))
                  toast.info(
                    `${entry.name} has no look yet: import its design system on the Brand page to carry it into prompts.`,
                  );
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                entry.id === kitId && "bg-muted",
              )}
            >
              <Swatches kit={entry} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{entry.name}</span>
                {entry.design.visual.mood.length > 0 && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {entry.design.visual.mood.slice(0, 4).join(" · ")}
                  </span>
                )}
              </span>
              {entry.id === kitId && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
          {!kits.length && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No brands yet.{" "}
              <Link to="/brand" className="underline underline-offset-2">
                Import one
              </Link>{" "}
              from its website or guidelines.
            </p>
          )}
        </div>
        {kit && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2 text-[11px]">
            <p className="flex items-center gap-1 font-medium">
              <Sparkles className="size-3 text-primary" /> Added to the prompt
            </p>
            <p className="text-muted-foreground">{line || "Nothing yet: this kit has no look."}</p>
            {avoid && <p className="text-muted-foreground">Avoids: {avoid}</p>}
            {references.length > 0 && onAddReferences && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                disabled={room <= 0}
                onClick={() => {
                  onAddReferences(references.slice(0, Math.max(0, room)));
                  setOpen(false);
                }}
              >
                <ImagePlus className="mr-1.5 size-3.5" />
                {room > 0
                  ? `Add ${Math.min(room, references.length)} of its style references`
                  : "No room for its style references"}
              </Button>
            )}
          </div>
        )}
        <Link
          to="/brand"
          className="block rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Import or change brands
        </Link>
      </PopoverContent>
    </Popover>
  );
}
