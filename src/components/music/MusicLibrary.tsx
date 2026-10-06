import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Loader2, MoreHorizontal, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useMusicStatus, useMusicTracks } from "@/hooks/useMusicData";
import { makeInstrumentalTrack, setMusicArchived } from "@/lib/music.functions";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { licenceBlocker, type MusicTrackRow } from "@/lib/music/catalog";
import { cn } from "@/lib/utils";
import { TrackItem } from "./TrackItem";
import { usePreview } from "./preview";

/** The studio's music: search it, preview it, and (in the editor) add it to an edit. */
export function MusicLibrary({
  onAdd,
  addedAssetIds,
  showArchived = false,
}: {
  onAdd?: (track: MusicTrackRow) => void;
  addedAssetIds?: Set<string>;
  showArchived?: boolean;
}) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: tracks = [], isLoading } = useMusicTracks({ includeArchived: showArchived });
  const { data: status } = useMusicStatus();
  const preview = usePreview();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "music" | "sound_effect">("all");
  const [working, setWorking] = useState<string | null>(null);
  const attempts = useRef(new Map<string, string>());

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return tracks.filter((track) => {
      if (kind !== "all" && track.kind !== kind) return false;
      if (onAdd && track.status !== "ready") return false;
      const haystack = [
        track.title,
        track.artist,
        ...track.genres,
        ...track.moods,
        ...track.tags,
        track.license,
      ]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [tracks, search, kind, onAdd]);

  async function instrumental(track: MusicTrackRow) {
    setWorking(track.id);
    // Each track's request keeps its id until it has a known outcome (across
    // reloads too), so a retry after a lost response returns that instrumental
    // instead of paying again.
    const id =
      attempts.current.get(track.id) ??
      savedAttempt("instrumental", track.id) ??
      crypto.randomUUID();
    attempts.current.set(track.id, id);
    keepAttempt("instrumental", track.id, id);
    const settled = () => {
      attempts.current.delete(track.id);
      keepAttempt("instrumental", track.id, null);
    };
    try {
      const made = await makeInstrumentalTrack({
        data: { trackId: track.id, clientRequestId: id },
      });
      // Another request was already making it: follow that one.
      if (made.requestId && made.requestId !== id) {
        attempts.current.set(track.id, made.requestId);
        keepAttempt("instrumental", track.id, made.requestId);
      }
      if (made.status === "ready") {
        settled();
        toast.success("Instrumental added to the library");
      } else if (made.status === "failed" || made.status === "submission_uncertain") {
        settled();
        toast.error(made.errorMessage ?? "The instrumental could not be made");
      } else {
        toast.message("This instrumental is still being made", {
          description: "It appears in the library when it's ready.",
        });
      }
    } catch (error) {
      // The request may still have been recorded (or finished): the same id is kept.
      toast.error(error instanceof Error ? error.message : "The instrumental could not be made");
    } finally {
      setWorking(null);
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
    }
  }

  async function archive(track: MusicTrackRow, archived: boolean) {
    try {
      await setMusicArchived({ data: { trackId: track.id, archived } });
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The track could not be changed");
    }
  }

  return (
    <div className="space-y-2.5" data-testid="music-library">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the library"
            className="h-8 pl-7 text-xs"
            aria-label="Search the music library"
          />
        </div>
        <div
          className="flex rounded-md border border-border p-0.5 text-[11px]"
          role="radiogroup"
          aria-label="Kind"
        >
          {(
            [
              ["all", "All"],
              ["music", "Music"],
              ["sound_effect", "SFX"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              onClick={() => setKind(id)}
              className={cn(
                "rounded px-2",
                kind === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />}
      <ul className="space-y-1.5">
        {shown.map((track) => {
          const canChange = isAdmin || track.created_by === user?.id;
          // No instrumental of a track whose licence has run out: it couldn't be used.
          const canSplit =
            !onAdd &&
            status?.elevenlabs &&
            track.status === "ready" &&
            track.instrumental !== true &&
            track.asset_id &&
            !licenceBlocker(track);
          return (
            <TrackItem
              key={track.id}
              track={track}
              preview={preview}
              onAdd={onAdd}
              added={!!track.asset_id && !!addedAssetIds?.has(track.asset_id)}
              actions={
                !onAdd && (canChange || canSplit) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0"
                        aria-label={`More for ${track.title}`}
                        disabled={working === track.id}
                      >
                        {working === track.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canSplit && (
                        <DropdownMenuItem onClick={() => void instrumental(track)}>
                          <Wand2 className="mr-2 size-4" /> Make instrumental
                        </DropdownMenuItem>
                      )}
                      {canChange &&
                        (track.is_archived ? (
                          <DropdownMenuItem onClick={() => void archive(track, false)}>
                            <ArchiveRestore className="mr-2 size-4" /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void archive(track, true)}>
                            <Archive className="mr-2 size-4" /> Archive
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          );
        })}
        {!isLoading && shown.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {tracks.length
              ? "No tracks match."
              : "No music yet. Find free music, make some, or add a licensed track."}
          </li>
        )}
      </ul>
    </div>
  );
}
