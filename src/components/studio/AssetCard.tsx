import { Heart, Play } from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { cn } from "@/lib/utils";

export function AssetCard({
  asset,
  onOpen,
  contain,
}: {
  asset: AssetRow;
  onOpen: (asset: AssetRow) => void;
  contain?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-input"
    >
      <MediaPreview
        bucket={asset.storage_bucket}
        path={asset.storage_path}
        type={asset.asset_type}
        contain={contain ?? true}
        alt={asset.title ?? "Asset"}
        className="transition-transform duration-300 group-hover:scale-[1.02]"
      />
      {asset.asset_type === "video" && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] backdrop-blur">
          <Play className="size-3" /> Video
        </span>
      )}
      {asset.is_favorite && (
        <Heart className="absolute top-2 right-2 size-4 fill-primary text-primary" />
      )}
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/95 to-transparent px-2.5 pt-6 pb-2 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
        )}
      >
        {asset.title ?? "Untitled"}
      </span>
    </button>
  );
}
