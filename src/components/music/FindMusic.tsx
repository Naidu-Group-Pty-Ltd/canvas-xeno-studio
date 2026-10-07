import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importOpenverseMusic, searchOpenverseMusic } from "@/lib/music.functions";
import { formatTime } from "@/lib/edit/timeline";
import { MUSIC_LICENSES, type MusicLicense } from "@/lib/music/catalog";
import { cn } from "@/lib/utils";
import { usePreview } from "./preview";

type Result = Awaited<ReturnType<typeof searchOpenverseMusic>>["tracks"][number];
export type AddedTrack = Awaited<ReturnType<typeof importOpenverseMusic>>;

const LENGTHS = [
  { id: "any", label: "Any length" },
  { id: "shortest", label: "Under 30 s" },
  { id: "short", label: "30 s – 2 min" },
  { id: "medium", label: "2 – 10 min" },
] as const;

/**
 * Free music and sound effects from Openverse, limited to licences that
 * allow commercial use and edits. Adding one copies it into the library with
 * its licence and credit.
 */
export function FindMusic({
  initialQuery = "",
  projectId = null,
  campaignId = null,
  compact = false,
  onAdded,
}: {
  initialQuery?: string;
  projectId?: string | null;
  campaignId?: string | null;
  compact?: boolean;
  onAdded?: (track: AddedTrack, kind: "music" | "sound_effect") => void;
}) {
  const queryClient = useQueryClient();
  const preview = usePreview();
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<"music" | "sound_effect">("music");
  const [length, setLength] = useState<(typeof LENGTHS)[number]["id"]>("any");
  const [results, setResults] = useState<Result[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const morePages = page < Math.min(pages, 12);

  async function search(nextPage = 1) {
    setSearching(true);
    try {
      const result = await searchOpenverseMusic({
        data: { query, kind, page: nextPage, ...(length !== "any" ? { length } : {}) },
      });
      setResults((current) => (nextPage === 1 ? result.tracks : [...current, ...result.tracks]));
      setPage(nextPage);
      setPages(result.pages);
      setSearched(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The search failed");
    } finally {
      setSearching(false);
    }
  }

  async function add(track: Result) {
    setAdding(track.id);
    try {
      const added = await importOpenverseMusic({
        data: { openverseId: track.id, projectId, campaignId },
      });
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
      toast.success(added.duplicate ? "Already in the library" : "Added to the music library");
      // The result's own category, not the selector's (which may have changed since the search).
      onAdded?.(added, track.category === "sound_effect" ? "sound_effect" : "music");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The track could not be added");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-2.5" data-testid="find-music">
      <div className={cn("flex gap-1.5", compact && "flex-col")}>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void search(1)}
            placeholder={
              kind === "music" ? "upbeat house, summer, piano…" : "whoosh, pop, crowd cheer…"
            }
            className="h-8 pl-7 text-xs"
            aria-label="Search free music"
          />
        </div>
        <div className="flex gap-1.5">
          <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
            <SelectTrigger className="h-8 w-[118px] text-xs" aria-label="Music or sound effects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="music">Music</SelectItem>
              <SelectItem value="sound_effect">Sound effects</SelectItem>
            </SelectContent>
          </Select>
          <Select value={length} onValueChange={(value) => setLength(value as typeof length)}>
            <SelectTrigger className="h-8 w-[118px] text-xs" aria-label="Length">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LENGTHS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            onClick={() => void search(1)}
            disabled={searching}
            data-testid="find-music-search"
          >
            {searching && page === 1 ? <Loader2 className="size-3.5 animate-spin" /> : "Search"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Free Creative Commons music and sound effects via Openverse, limited to licences that allow
        commercial use and edits: CC0, public domain and CC BY (credit the creator).
      </p>
      <ul className="space-y-1">
        {results.map((track) => {
          const license = track.license as MusicLicense;
          return (
            <li
              key={track.id}
              className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
              data-testid="openverse-result"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                disabled={!track.audioUrl || preview.loading === track.id}
                onClick={() => track.audioUrl && void preview.toggle(track.id, track.audioUrl)}
                aria-label={
                  preview.playing === track.id ? `Pause ${track.title}` : `Play ${track.title}`
                }
              >
                {preview.loading === track.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : preview.playing === track.id ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{track.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[
                    track.creator,
                    track.durationSeconds ? formatTime(track.durationSeconds, false) : null,
                    track.genres.slice(0, 2).join(", ") || null,
                    track.provider,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  MUSIC_LICENSES[license]?.credit
                    ? "bg-warning/15 text-warning"
                    : "bg-success/15 text-success",
                )}
                title={MUSIC_LICENSES[license]?.note}
              >
                {MUSIC_LICENSES[license]?.short ?? track.license}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={adding !== null}
                onClick={() => void add(track)}
                data-testid="openverse-add"
              >
                {adding === track.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="mr-0.5 size-3" />
                )}
                Add
              </Button>
            </li>
          );
        })}
        {searched && !searching && results.length === 0 && (
          <li className="p-3 text-center text-xs text-muted-foreground">
            {morePages
              ? "Nothing on this page can be added. Try more results or broader words."
              : "Nothing found. Try broader words."}
          </li>
        )}
      </ul>
      {/* Results the studio can't download are left out, so a page can come
          back empty while later pages still have tracks. */}
      {searched && morePages && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => void search(page + 1)}
          disabled={searching}
        >
          {searching ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
          More results
        </Button>
      )}
    </div>
  );
}
