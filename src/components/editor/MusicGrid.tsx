import { memo, useMemo } from "react";
import { useMusicStructure } from "@/hooks/useMusicStructure";
import type { Timeline, TimelineAudio, TimelineLayout } from "@/lib/edit/timeline";
import { musicGridOnTimeline } from "@/lib/music/on-timeline";
import { SECTION_LABELS, type SectionKind } from "@/lib/music/structure";
import { cn } from "@/lib/utils";

/** Beats are drawn only when they stand at least this far apart; bar lines always are. */
const MIN_BEAT_PIXELS = 7;

const SECTION_TONES: Record<SectionKind, string> = {
  intro: "bg-chart-2",
  build: "bg-warning",
  drop: "bg-primary",
  breakdown: "bg-info",
  reentry: "bg-primary",
  outro: "bg-chart-2",
  section: "bg-muted-foreground",
};

/**
 * The music's bars and sections on the timeline, where each music track in
 * the edit plays them (through its trim, its loop or its pieces): a line on
 * every bar line, fainter ones on the beats when they're far enough apart to
 * see, and each section named along the foot of the Music & FX row. Shown
 * once a track's bars have been found (the Music panel finds them).
 */
export function MusicGrid({
  timeline,
  layout,
  pixelsPerSecond,
  top,
  height,
}: {
  timeline: Timeline;
  layout: TimelineLayout;
  pixelsPerSecond: number;
  /** Where the Music & FX row starts, and how tall it is. */
  top: number;
  height: number;
}) {
  const music = timeline.audio.filter((item) => item.role === "music");
  if (!music.length) return null;
  return (
    <>
      {music.map((item) => (
        <ItemGrid
          key={item.id}
          item={item}
          total={layout.total}
          pps={pixelsPerSecond}
          top={top}
          height={height}
        />
      ))}
    </>
  );
}

const ItemGrid = memo(function ItemGrid({
  item,
  total,
  pps,
  top,
  height,
}: {
  item: TimelineAudio;
  total: number;
  pps: number;
  top: number;
  height: number;
}) {
  const { data: known } = useMusicStructure(item.assetId);
  const grid = useMemo(
    () => (known ? musicGridOnTimeline(item, known.structure, total) : null),
    [item, known, total],
  );
  if (!grid || !known) return null;
  const beatPixels = (60 / known.structure.bpm) * pps;
  const downbeats = new Set(grid.downbeats);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[5]"
      style={{ top, height }}
      data-testid="music-grid"
      aria-hidden
    >
      {beatPixels >= MIN_BEAT_PIXELS &&
        grid.beats
          .filter((time) => !downbeats.has(time))
          .map((time) => (
            <div
              key={`b${time}`}
              className="absolute bottom-[9px] h-[9px] w-px bg-foreground/25"
              style={{ left: time * pps }}
            />
          ))}
      {grid.downbeats.map((time) => (
        <div
          key={`d${time}`}
          className="absolute inset-y-0 w-px bg-foreground/45"
          style={{ left: time * pps }}
        />
      ))}
      {grid.sections.map((section) => (
        <div
          key={`s${section.index}-${section.start}`}
          className="absolute bottom-0 flex h-[8px] items-center overflow-hidden"
          style={{
            left: section.start * pps,
            width: Math.max(2, (section.end - section.start) * pps - 1),
          }}
          title={`${SECTION_LABELS[section.kind]} · ${section.start.toFixed(1)}–${section.end.toFixed(1)}s`}
        >
          <div
            className={cn("absolute inset-x-0 bottom-0 h-[2px]", SECTION_TONES[section.kind])}
            style={{ opacity: 0.45 + 0.55 * section.energy }}
          />
          {(section.end - section.start) * pps > 36 && (
            <span className="relative mb-[2px] truncate px-0.5 text-[8px] font-semibold uppercase leading-none text-foreground/80">
              {SECTION_LABELS[section.kind]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});
