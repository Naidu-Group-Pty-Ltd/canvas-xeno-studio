import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sword,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useKatanaEnabled, useSendToKatana } from "@/hooks/useKatana";
import { supabase } from "@/integrations/supabase/client";
import { useMusicStatus, useMusicTracks } from "@/hooks/useMusicData";
import { makeInstrumentalTrack, setMusicArchived } from "@/lib/music.functions";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { licenceBlocker, licenceTerms, type MusicTrackRow } from "@/lib/music/catalog";
import { cn } from "@/lib/utils";
import { AddLicensedTrack } from "./AddLicensedTrack";
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
  const katana = useKatanaEnabled();
  const sendToKatana = useSendToKatana();
  // A recorded track whose licence's terms are being updated (say renewed once run out).
  const [renewing, setRenewing] = useState<MusicTrackRow | null>(null);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState("");
  const [kind, setKind] = useState<"all" | "music" | "sound_effect">("all");
  // The search runs in the database (the whole library, not just what's
  // loaded), once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearched(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const {
    tracks: shown,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMusicTracks({
    includeArchived: showArchived,
    search: searched,
    kind: kind === "all" ? null : kind,
    // Only finished tracks can go into an edit.
    readyOnly: !!onAdd,
  });
  const filtered = searched.trim().length > 0 || kind !== "all";
  const { data: status } = useMusicStatus();
  const preview = usePreview();
  const [working, setWorking] = useState<string | null>(null);
  const attempts = useRef(new Map<string, string>());
  // Tracks whose instrumental may have been made (and charged) without coming
  // back: its request is kept, so asking again asks about that one, and only
  // "Make a new instrumental" starts (and pays for) another.
  const [heldSplits, setHeldSplits] = useState<ReadonlySet<string>>(new Set());
  const holdSplit = (trackId: string, held: boolean) =>
    setHeldSplits((current) => {
      const next = new Set(current);
      if (held) next.add(trackId);
      else next.delete(trackId);
      return next;
    });
  // Tracks found to have an instrumental in the library already: asking for
  // one returned it (not made, or paid for, again), and another is offered as
  // "Make a new instrumental (charged again)".
  const [madeSplits, setMadeSplits] = useState<ReadonlySet<string>>(new Set());
  const markMade = (trackId: string) => setMadeSplits((current) => new Set(current).add(trackId));

  async function instrumental(track: MusicTrackRow, startOver = false) {
    setWorking(track.id);
    if (startOver) {
      attempts.current.delete(track.id);
      keepAttempt("instrumental", track.id, null);
      holdSplit(track.id, false);
    }
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
        data: { trackId: track.id, clientRequestId: id, again: startOver },
      });
      // Another request was already making it: follow that one.
      if (made.requestId && made.requestId !== id) {
        attempts.current.set(track.id, made.requestId);
        keepAttempt("instrumental", track.id, made.requestId);
      }
      if (made.reused) {
        settled();
        holdSplit(track.id, false);
        markMade(track.id);
        if (made.archived)
          toast.message(
            `This track already has an instrumental, “${made.title}”, but it's archived`,
            {
              description:
                "Ask whoever made it, or an admin, to restore it. Making a new one is charged again.",
            },
          );
        else
          toast.message(`This track already has an instrumental: “${made.title}”`, {
            description: made.restored
              ? "It was archived, and it's back in the library now. Making a new one is charged again."
              : "It's in the library. Making a new one is charged again.",
          });
      } else if (made.status === "ready") {
        settled();
        holdSplit(track.id, false);
        toast.success("Instrumental added to the library");
      } else if (made.status === "failed") {
        settled();
        holdSplit(track.id, false);
        toast.error(made.errorMessage ?? "The instrumental could not be made");
      } else if (made.status === "submission_uncertain") {
        // Kept: asked again, it answers the same; only the person starts over.
        holdSplit(track.id, true);
        toast.error(
          made.errorMessage ??
            "This instrumental may have been made (and charged) without coming back. It wasn't made again by itself.",
          { description: "Making a new one is charged again, even if this one was." },
        );
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
      <RenewLicence track={renewing} onClose={() => setRenewing(null)} />
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
          // Katana cuts to a track it may use (one whose licence still runs).
          const canKatana =
            !onAdd &&
            katana &&
            track.status === "ready" &&
            !!track.asset_id &&
            !licenceBlocker(track);
          return (
            <TrackItem
              key={track.id}
              track={track}
              preview={preview}
              onAdd={onAdd}
              added={!!track.asset_id && !!addedAssetIds?.has(track.asset_id)}
              actions={
                !onAdd && (canChange || canSplit || canKatana) ? (
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
                      {canKatana && (
                        <DropdownMenuItem
                          onClick={() =>
                            sendToKatana({
                              files: [
                                {
                                  assetId: track.asset_id!,
                                  slot: "soundtrack",
                                  title: track.title,
                                },
                              ],
                            })
                          }
                          data-testid="track-to-katana"
                        >
                          <Sword className="mr-2 size-4" /> Cut to it in Katana
                        </DropdownMenuItem>
                      )}
                      {canSplit && !heldSplits.has(track.id) && !madeSplits.has(track.id) && (
                        <DropdownMenuItem onClick={() => void instrumental(track)}>
                          <Wand2 className="mr-2 size-4" /> Make instrumental
                        </DropdownMenuItem>
                      )}
                      {canSplit && (heldSplits.has(track.id) || madeSplits.has(track.id)) && (
                        <DropdownMenuItem onClick={() => void instrumental(track, true)}>
                          <Wand2 className="mr-2 size-4" /> Make a new instrumental (charged again)
                        </DropdownMenuItem>
                      )}
                      {canChange &&
                        (track.source === "upload" || track.parent_track_id) &&
                        // (Owned or licensed: recorded by the brand, or an instrumental of such a recording.)
                        (track.license === "licensed" || track.license === "owned") &&
                        track.asset_id && (
                          <DropdownMenuItem onClick={() => setRenewing(track)}>
                            <ShieldCheck className="mr-2 size-4" />{" "}
                            {licenceTerms(track)?.expired ? "Renew licence" : "Update licence"}
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
            {filtered
              ? "No tracks match."
              : "No music yet. Find free music, make some, or add a licensed track."}
          </li>
        )}
      </ul>
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          data-testid="music-show-more"
        >
          {isFetchingNextPage && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Show more
        </Button>
      )}
    </div>
  );
}

/**
 * Records a recorded track's licence terms as they now stand (say once it has
 * been renewed), starting from the terms on record. Edits that use the track,
 * or its instrumentals, render with them. An instrumental's licence is its
 * original's, so for one it's the original's that is renewed, by whoever
 * added the original or an admin.
 */
export function RenewLicence({
  track,
  onClose,
}: {
  track: MusicTrackRow | null;
  onClose: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const parentId = track?.parent_track_id ?? null;
  const { data: parent, isError: parentFailed } = useQuery({
    queryKey: ["music_tracks", "one", parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("music_tracks")
        .select("*")
        .eq("id", parentId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as MusicTrackRow | null;
    },
  });
  const original = parentId ? (parent ?? null) : track;
  const allowed = !!original && (isAdmin || original.created_by === user?.id);
  return (
    <Dialog open={track !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {track && licenceTerms(track)?.expired ? "Renew its licence" : "Update its licence"}
          </DialogTitle>
          <DialogDescription>
            {parentId && original
              ? `This is an instrumental of “${original.title}”, whose licence it carries: renewing that renews both. `
              : ""}
            Record the licence's terms as they now stand. Edits that use this track render with
            them.
          </DialogDescription>
        </DialogHeader>
        {parentId && !original ? (
          <p className="text-xs text-muted-foreground">
            {parentFailed || parent === null
              ? "Its original couldn't be found just now, so its licence can't be renewed here."
              : "Looking up its original…"}
          </p>
        ) : original && !allowed ? (
          <p className="text-xs text-muted-foreground">
            Only whoever added “{original.title}”, or an admin, can renew its licence.
          </p>
        ) : (
          original && <AddLicensedTrack key={original.id} renewing={original} onAdded={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
