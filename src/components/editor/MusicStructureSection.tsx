import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { findStructure, useMusicStructure } from "@/hooks/useMusicStructure";
import {
  formatTime,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import type { MusicTrackRow } from "@/lib/music/catalog";
import { musicGridOnTimeline } from "@/lib/music/on-timeline";
import { SECTION_LABELS } from "@/lib/music/structure";

/**
 * The music bed's bars and sections in the Music panel: its tempo and bars,
 * each section and where it plays in the edit, and a way to find them. They
 * show on the timeline as soon as they're known.
 */
export function MusicStructureSection({
  bed,
  track,
  timeline,
  layout,
  onUpdate,
  getTimeline,
}: {
  bed: TimelineAudio;
  track: MusicTrackRow | undefined;
  timeline: Timeline;
  layout: TimelineLayout;
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
  getTimeline: () => Timeline;
}) {
  const queryClient = useQueryClient();
  const { data: known, isPending } = useMusicStructure(bed.assetId);
  const [finding, setFinding] = useState(false);
  const grid = useMemo(
    () => (known ? musicGridOnTimeline(bed, known.structure, layout.total) : null),
    [bed, known, layout.total],
  );

  async function find() {
    setFinding(true);
    try {
      const found = await findStructure({ queryClient, assetId: bed.assetId, track });
      if (!found.known) {
        toast.error(
          "This music has no steady beat to find bars in, so it can't be cut or fitted on them.",
        );
        return;
      }
      if (found.note) toast.message(found.note);
      const { bars, sections } = found.known.structure;
      toast.success(
        `Found ${bars.length} bars in ${sections.length} section${sections.length === 1 ? "" : "s"}`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Its bars couldn't be found");
    } finally {
      setFinding(false);
    }
  }

  const structure = known?.structure;
  return (
    <div
      className="space-y-1.5 rounded-md border border-border p-2 text-xs"
      data-testid="music-structure"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 font-medium">
          <Rows3 className="size-3.5 text-muted-foreground" />
          Bars and sections
        </span>
        {structure && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {structure.bpm} BPM · {structure.beatsPerBar}/4 · {structure.bars.length} bars
          </span>
        )}
      </div>
      {!structure && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Find which beat is one and where the music changes (the drop, a breakdown, the
            re-entry), to cut on its bar lines and fit it to the edit.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full"
            disabled={finding || isPending}
            onClick={() => void find()}
            data-testid="find-bars"
          >
            {finding && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Find bars and sections
          </Button>
        </>
      )}
      {structure && (
        <ol className="flex flex-wrap gap-1" aria-label="Sections">
          {structure.sections.map((section, index) => {
            const heard = grid?.sections.find((placed) => placed.index === index);
            return (
              <li
                key={`${index}-${section.start}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                title={`${formatTime(section.start)} to ${formatTime(section.end)} in the track`}
              >
                {SECTION_LABELS[section.kind]}{" "}
                <span className="tabular-nums text-muted-foreground">
                  {heard ? formatTime(heard.start) : "not heard"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {structure && structure.confidence < 0.5 && (
        <p className="text-[11px] text-muted-foreground">
          Its beat isn't clear, so its bar lines are a best guess.
        </p>
      )}
    </div>
  );
}
