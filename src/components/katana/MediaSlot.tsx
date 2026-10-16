import { useState } from "react";
import { Plus, X } from "lucide-react";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AssetRow } from "@/hooks/useStudioData";

type Kind = "image" | "video" | "audio";

/** Library media for one of Katana's inputs: what's chosen, and a way to add or take some out. */
export function MediaSlot({
  label,
  hint,
  accept,
  max,
  value,
  onChange,
  required = false,
}: {
  label: string;
  hint?: string;
  accept: Kind[];
  max: number;
  value: AssetRow[];
  onChange: (assets: AssetRow[]) => void;
  required?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const room = Math.max(0, max - value.length);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">
          {label}
          {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
        </Label>
        <span className="text-[11px] text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {value.map((asset) => (
          <div
            key={asset.id}
            className="group relative size-20 overflow-hidden rounded-md border border-border bg-surface"
          >
            <MediaPreview
              bucket={asset.storage_bucket}
              path={asset.storage_path}
              type={asset.asset_type}
              contain
            />
            <button
              type="button"
              aria-label={`Remove ${asset.title ?? "file"}`}
              onClick={() => onChange(value.filter((entry) => entry.id !== asset.id))}
              className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {room > 0 && (
          <Button
            type="button"
            variant="outline"
            className="size-20 flex-col gap-1 text-[11px]"
            onClick={() => setPicking(true)}
          >
            <Plus className="size-4" />
            Add
          </Button>
        )}
      </div>
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={accept}
        max={room}
        title={`Add to "${label}"`}
        onConfirm={(assets) => {
          const known = new Set(value.map((asset) => asset.id));
          onChange([...value, ...assets.filter((asset) => !known.has(asset.id))].slice(0, max));
        }}
      />
    </div>
  );
}
