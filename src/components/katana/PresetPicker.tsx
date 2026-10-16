import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listKatanaPresets } from "@/lib/katana.functions";
import { cn } from "@/lib/utils";

export interface PickedPreset {
  slug: string;
  name: string;
}

type Preset = Awaited<ReturnType<typeof listKatanaPresets>>["presets"][number];
type Category = "personalized_edits" | "style_transfer" | "motion_transfer" | null;

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: null, label: "All" },
  { value: "personalized_edits", label: "Personal edits" },
  { value: "style_transfer", label: "Style transfer" },
  { value: "motion_transfer", label: "Motion transfer" },
];

/** Higgsfield's published Katana presets: pick one, see its reference video on hover. */
export function PresetPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (preset: PickedPreset) => void;
}) {
  const [category, setCategory] = useState<Category>(null);
  const results = useInfiniteQuery({
    queryKey: ["katana-presets", category],
    queryFn: ({ pageParam }) => listKatanaPresets({ data: { cursor: pageParam, category } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5 * 60_000,
  });

  const presets = results.data?.pages.flatMap((page) => page.presets) ?? [];
  const seen = new Set<string>();
  const unique = presets.filter((preset) =>
    seen.has(preset.slug) ? false : (seen.add(preset.slug), true),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => setCategory(entry.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              category === entry.value
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {results.isError ? (
        <p className="text-xs text-primary">
          {results.error instanceof Error
            ? results.error.message
            : "Higgsfield's presets couldn't be loaded."}
        </p>
      ) : results.isLoading && !unique.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      ) : unique.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {unique.map((preset) => (
            <PresetTile
              key={preset.slug}
              preset={preset}
              picked={value === preset.slug}
              onPick={() => onChange({ slug: preset.slug, name: preset.name })}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No presets in this category.</p>
      )}
      {results.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          {results.isFetchingNextPage && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          More presets
        </Button>
      )}
    </div>
  );
}

function PresetTile({
  preset,
  picked,
  onPick,
}: {
  preset: Preset;
  picked: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={picked}
      className={cn(
        "group relative aspect-[3/4] overflow-hidden rounded-lg border bg-surface text-left transition-colors",
        picked ? "border-primary ring-2 ring-primary/50" : "border-border hover:border-input",
      )}
    >
      {hover && preset.previewUrl ? (
        <video
          src={preset.previewUrl}
          autoPlay
          muted
          loop
          playsInline
          className="size-full object-cover"
        />
      ) : preset.thumbnailUrl ? (
        <img src={preset.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="size-full bg-muted" />
      )}
      <span
        className={cn(
          "absolute top-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full border",
          picked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background/80 text-transparent",
        )}
      >
        <Check className="size-3" />
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent px-2 pt-6 pb-1.5 text-xs font-medium">
        {preset.name}
      </span>
    </button>
  );
}
