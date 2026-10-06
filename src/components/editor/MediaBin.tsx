import { useMemo, useRef, useState } from "react";
import { Film, ImageIcon, Loader2, Mic, Music, Plus, Search, Upload, Waves } from "lucide-react";
import { toast } from "sonner";
import { useAssets, type AssetRow } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCEPT_ATTRIBUTE, uploadReference } from "@/lib/storage";
import type { AudioRole } from "@/lib/edit/timeline";
import { cn } from "@/lib/utils";

type Kind = "video" | "image" | "audio";

const KINDS: { id: Kind; label: string; icon: typeof Film }[] = [
  { id: "video", label: "Video", icon: Film },
  { id: "image", label: "Stills", icon: ImageIcon },
  { id: "audio", label: "Audio", icon: Waves },
];

interface MediaBinProps {
  projectId: string | null;
  usedAssetIds: Set<string>;
  onAddVisual: (asset: AssetRow) => void;
  onAddAudio: (asset: AssetRow, role: AudioRole) => void;
}

/** The library, filtered for editing: drop footage, stills and sound onto the edit. */
export function MediaBin({ projectId, usedAssetIds, onAddVisual, onAddAudio }: MediaBinProps) {
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>("video");
  const [term, setTerm] = useState("");
  const [projectOnly, setProjectOnly] = useState(Boolean(projectId));
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    data: assets = [],
    isLoading,
    refetch,
  } = useAssets({
    limit: 120,
    assetType: kind,
    search: term,
    projectId: projectOnly ? projectId : null,
  });

  const counts = useMemo(
    () => assets.filter((asset) => usedAssetIds.has(asset.id)).length,
    [assets, usedAssetIds],
  );

  async function upload(files: FileList | null) {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        await uploadReference(file, { userId: user.id, projectId });
      }
      toast.success(
        files.length === 1 ? "Added to the library" : `${files.length} files added to the library`,
      );
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be uploaded");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div
          className="grid grid-cols-3 gap-1 rounded-md border border-border p-0.5"
          role="tablist"
          aria-label="Media type"
        >
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={kind === item.id}
              onClick={() => setKind(item.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs",
                kind === item.id
                  ? "bg-surface-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search the library"
            className="h-8 pl-7 text-xs"
            aria-label="Search the library"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {projectId ? (
            <div className="flex items-center gap-1.5">
              <Switch id="bin-project" checked={projectOnly} onCheckedChange={setProjectOnly} />
              <Label htmlFor="bin-project" className="text-[11px] text-muted-foreground">
                This project only
              </Label>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {counts ? `${counts} in this edit` : "Whole library"}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : (
              <Upload className="mr-1 size-3" />
            )}
            Upload
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            accept={[ACCEPT_ATTRIBUTE.video, ACCEPT_ATTRIBUTE.image, ACCEPT_ATTRIBUTE.audio].join(
              ",",
            )}
            onChange={(event) => void upload(event.target.files)}
          />
        </div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="aspect-video w-full" />
            ))}
          </div>
        )}
        {!isLoading && !assets.length && (
          <p className="p-3 text-center text-xs text-muted-foreground">
            {term
              ? "Nothing matches that search."
              : kind === "audio"
                ? "No audio yet. Upload a voiceover or a licensed music track."
                : "Nothing here yet. Generate in Create or Supercomputer, or upload files."}
          </p>
        )}
        {kind !== "audio" ? (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onAddVisual(asset)}
                className="group relative overflow-hidden rounded-md border border-border bg-surface-raised text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title={`Add "${asset.title ?? "file"}" to the end of the edit`}
                data-testid="bin-item"
              >
                <div className="aspect-video">
                  <MediaPreview
                    bucket={asset.storage_bucket}
                    path={asset.storage_path}
                    type={asset.asset_type}
                  />
                </div>
                <div className="flex items-center gap-1 px-1.5 py-1 text-[11px]">
                  <span className="truncate">
                    {asset.title ?? (asset.asset_type === "image" ? "Image" : "Video")}
                  </span>
                  {asset.duration_seconds ? (
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                      {Number(asset.duration_seconds).toFixed(1)}s
                    </span>
                  ) : null}
                </div>
                {usedAssetIds.has(asset.id) && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] uppercase text-white">
                    In edit
                  </span>
                )}
                <span className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Plus className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-raised p-2"
                data-testid="bin-audio"
              >
                <Waves className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{asset.title ?? "Audio"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {asset.duration_seconds
                      ? `${Number(asset.duration_seconds).toFixed(1)}s`
                      : "Length unknown"}
                    {usedAssetIds.has(asset.id) ? " · in edit" : ""}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      aria-label={`Add ${asset.title ?? "audio"} to the edit`}
                    >
                      <Plus className="mr-0.5 size-3" /> Add
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onAddAudio(asset, "voiceover")}>
                      <Mic className="mr-2 size-3.5" /> As voiceover (at playhead)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAddAudio(asset, "music")}>
                      <Music className="mr-2 size-3.5" /> As music bed (from the start)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAddAudio(asset, "sfx")}>
                      <Waves className="mr-2 size-3.5" /> As sound effect (at playhead)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
