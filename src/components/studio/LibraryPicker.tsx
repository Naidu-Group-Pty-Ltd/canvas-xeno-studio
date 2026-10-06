import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Images, Search } from "lucide-react";
import { useAssets, type AssetRow } from "@/hooks/useStudioData";
import { useBriefAssets, useBriefs } from "@/hooks/useSupercomputerData";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Kind = "image" | "video" | "audio";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (assets: AssetRow[]) => void;
  accept?: Kind[];
  max?: number;
  title?: string;
  /** Show the "From a brief" tab (requires the briefs tables). */
  briefsEnabled?: boolean;
  initialBriefId?: string | null;
}

/** Pick existing library media (or images from an imported brief) to use as references. */
export function LibraryPicker({
  open,
  onOpenChange,
  onConfirm,
  accept = ["image", "video", "audio"],
  max = 12,
  title = "Add from library",
  briefsEnabled = false,
  initialBriefId = null,
}: Props) {
  const [tab, setTab] = useState<"library" | "brief">(
    initialBriefId && briefsEnabled ? "brief" : "library",
  );
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [selected, setSelected] = useState<Map<string, AssetRow>>(new Map());
  const [briefId, setBriefId] = useState<string | null>(initialBriefId);

  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    setTerm("");
    if (initialBriefId && briefsEnabled) {
      setTab("brief");
      setBriefId(initialBriefId);
    }
  }, [open, initialBriefId, briefsEnabled]);

  const { data: assets = [], isLoading } = useAssets({
    limit: 120,
    assetType: kind ?? (accept.length === 1 ? accept[0]! : null),
    search: term,
  });
  const visible = useMemo(
    () => assets.filter((asset) => accept.includes(asset.asset_type)),
    [assets, accept],
  );

  function toggle(asset: AssetRow) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(asset.id)) next.delete(asset.id);
      else if (next.size < max) next.set(asset.id, asset);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "library" | "brief")}
          className="flex min-h-0 flex-1 flex-col"
        >
          {briefsEnabled && (
            <TabsList className="mx-6 mt-4 w-fit">
              <TabsTrigger value="library">
                <Images className="mr-1.5 size-3.5" /> Library
              </TabsTrigger>
              <TabsTrigger value="brief">
                <FileText className="mr-1.5 size-3.5" /> From a brief
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="library" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 px-6 py-4">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search titles"
                  className="pl-9"
                />
              </div>
              {accept.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {[null, ...accept].map((value) => (
                    <button
                      key={value ?? "all"}
                      type="button"
                      onClick={() => setKind(value)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                        kind === value
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {value ? KIND_LABELS[value] : "All"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 scroll-slim">
              {isLoading ? (
                <GridSkeleton />
              ) : visible.length ? (
                <AssetGrid assets={visible} selected={selected} onToggle={toggle} />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No matching media in the library yet.
                </p>
              )}
            </div>
          </TabsContent>

          {briefsEnabled && (
            <TabsContent value="brief" className="mt-0 flex min-h-0 flex-1 flex-col">
              <BriefTab
                briefId={briefId}
                onBriefChange={setBriefId}
                selected={selected}
                onToggle={toggle}
              />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="items-center border-t border-border px-6 py-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size ? `${selected.size} selected` : `Select up to ${max}`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selected.size}
              onClick={() => {
                onConfirm([...selected.values()]);
                onOpenChange(false);
              }}
            >
              Add {selected.size || ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BriefTab({
  briefId,
  onBriefChange,
  selected,
  onToggle,
}: {
  briefId: string | null;
  onBriefChange: (id: string) => void;
  selected: Map<string, AssetRow>;
  onToggle: (asset: AssetRow) => void;
}) {
  const { data: briefs = [], isLoading } = useBriefs();
  const activeId = briefId ?? briefs[0]?.id ?? null;
  const { data: images = [], isLoading: imagesLoading } = useBriefAssets(activeId);

  if (isLoading)
    return (
      <div className="px-6 py-4">
        <GridSkeleton />
      </div>
    );
  if (!briefs.length)
    return (
      <p className="px-6 py-12 text-center text-sm text-muted-foreground">
        No briefs imported yet.
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap gap-1.5">
        {briefs.map((brief) => (
          <button
            key={brief.id}
            type="button"
            onClick={() => onBriefChange(brief.id)}
            className={cn(
              "max-w-64 truncate rounded-full border px-3 py-1 text-xs transition-colors",
              brief.id === activeId
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {brief.title}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-slim">
        {imagesLoading ? (
          <GridSkeleton />
        ) : images.length ? (
          <AssetGrid
            assets={images.map((row) => row.asset)}
            selected={selected}
            onToggle={onToggle}
          />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            This brief has no images.
          </p>
        )}
      </div>
    </div>
  );
}

const KIND_LABELS: Record<Kind, string> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
};

function AssetGrid({
  assets,
  selected,
  onToggle,
}: {
  assets: AssetRow[];
  selected: Map<string, AssetRow>;
  onToggle: (asset: AssetRow) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {assets.map((asset) => {
        const picked = selected.has(asset.id);
        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onToggle(asset)}
            aria-pressed={picked}
            aria-label={asset.title ?? `Untitled ${asset.asset_type}`}
            title={asset.title ?? undefined}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-lg border bg-surface transition-colors",
              picked ? "border-primary ring-2 ring-primary/50" : "border-border hover:border-input",
            )}
          >
            <MediaPreview
              bucket={asset.storage_bucket}
              path={asset.storage_path}
              type={asset.asset_type}
              contain
            />
            <span
              className={cn(
                "absolute top-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full border text-[10px]",
                picked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/80 text-transparent",
              )}
            >
              <Check className="size-3" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-background/95 to-transparent px-1.5 pt-5 pb-1 text-left text-[10px] leading-tight">
              {asset.asset_type !== "image" && (
                <span className="shrink-0 rounded-full bg-background/85 px-1.5 py-0.5 capitalize">
                  {asset.asset_type}
                </span>
              )}
              <span className="truncate">{asset.title ?? "Untitled"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton key={index} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}
