import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Film, ImageIcon, Mic, Music, Sparkles, Type, Volume2, VolumeX, Waves } from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import type { SignedMedia } from "@/hooks/useEditorData";
import {
  audioPlayLength,
  clampAudio,
  formatTime,
  maxClipDuration,
  moveClip,
  updateClip,
  withChannel,
  MIX_CHANNEL_LABELS,
  type LaidOutClip,
  type MixChannel,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { cn } from "@/lib/utils";
import { useClockTime, type PlaybackClock, type Selection } from "./state";

const LABEL_WIDTH = 108;
const ROW = { ruler: 22, picture: 64, audio: 34, text: 26 } as const;

interface TimelineViewProps {
  timeline: Timeline;
  layout: TimelineLayout;
  assets: Map<string, AssetRow>;
  media: Map<string, SignedMedia>;
  clock: PlaybackClock;
  selection: Selection;
  pixelsPerSecond: number;
  onSelect: (selection: Selection) => void;
  onChange: (timeline: Timeline, key?: string) => void;
}

type Drag =
  | { kind: "move-clip"; id: string; from: number; startX: number; active: boolean; target: number }
  | {
      kind: "trim-clip";
      id: string;
      edge: "start" | "end";
      startX: number;
      origin: { trimStart: number; duration: number };
    }
  | { kind: "move-audio"; id: string; startX: number; origin: { start: number } }
  | {
      kind: "trim-audio";
      id: string;
      edge: "start" | "end";
      startX: number;
      origin: { start: number; trimStart: number; duration: number };
    }
  | { kind: "scrub" };

/**
 * The editor's tracks: picture, voiceover, music and effects, and text.
 * Drag a clip to reorder it, drag its edges to trim, drag audio to place it.
 */
export function TimelineView(props: TimelineViewProps) {
  const { timeline, layout, clock, pixelsPerSecond: pps, onChange, onSelect } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const width = Math.max(600, Math.ceil((layout.total + 4) * pps));

  const voice = timeline.audio.filter((item) => item.role === "voiceover");
  const beds = timeline.audio.filter((item) => item.role !== "voiceover");

  const timeAt = useCallback(
    (clientX: number) => {
      const element = scroller.current;
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      return Math.max(0, (clientX - rect.left + element.scrollLeft) / pps);
    },
    [pps],
  );

  const endDrag = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    setDropIndex(null);
    if (current?.kind === "move-clip" && current.active && current.target !== current.from) {
      const to = current.target > current.from ? current.target - 1 : current.target;
      onChange(moveClip(timeline, current.from, to));
    }
  }, [onChange, timeline]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      if (current.kind === "scrub") {
        clock.seek(timeAt(event.clientX));
        return;
      }
      const delta = (event.clientX - ("startX" in current ? current.startX : 0)) / pps;
      if (current.kind === "move-clip") {
        if (!current.active && Math.abs(event.clientX - current.startX) < 5) return;
        current.active = true;
        const t = timeAt(event.clientX);
        let target = layout.clips.length;
        for (const entry of layout.clips) {
          if (t < (entry.start + entry.end) / 2) {
            target = entry.index;
            break;
          }
        }
        current.target = target;
        setDropIndex(target);
        return;
      }
      if (current.kind === "trim-clip") {
        const clip = timeline.clips.find((item) => item.id === current.id);
        if (!clip) return;
        if (current.edge === "end") {
          onChange(
            updateClip(timeline, clip.id, {
              duration: Math.max(0.2, current.origin.duration + delta),
            }),
            `trim:${clip.id}`,
          );
        } else if (clip.kind === "image") {
          onChange(
            updateClip(timeline, clip.id, {
              duration: Math.max(0.2, current.origin.duration - delta),
            }),
            `trim:${clip.id}`,
          );
        } else {
          const room = current.origin.duration - 0.2;
          const shift = Math.max(-current.origin.trimStart / clip.speed, Math.min(delta, room));
          onChange(
            updateClip(timeline, clip.id, {
              trimStart: current.origin.trimStart + shift * clip.speed,
              duration: current.origin.duration - shift,
            }),
            `trim:${clip.id}`,
          );
        }
        return;
      }
      if (current.kind === "move-audio") {
        onChange(
          {
            ...timeline,
            audio: timeline.audio.map((item) =>
              item.id === current.id
                ? clampAudio({ ...item, start: current.origin.start + delta })
                : item,
            ),
          },
          `audio:${current.id}`,
        );
        return;
      }
      if (current.kind === "trim-audio") {
        onChange(
          {
            ...timeline,
            audio: timeline.audio.map((item) => {
              if (item.id !== current.id) return item;
              if (current.edge === "end")
                return clampAudio({
                  ...item,
                  duration: Math.max(0.2, current.origin.duration + delta),
                });
              const shift = Math.max(
                -Math.min(current.origin.start, current.origin.trimStart),
                Math.min(delta, current.origin.duration - 0.2),
              );
              return clampAudio({
                ...item,
                start: current.origin.start + shift,
                trimStart: current.origin.trimStart + shift,
                duration: current.origin.duration - shift,
              });
            }),
          },
          `audio:${current.id}`,
        );
      }
    },
    [clock, layout.clips, onChange, pps, timeAt, timeline],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startScrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    clock.pause();
    clock.seek(timeAt(event.clientX));
    drag.current = { kind: "scrub" };
  };

  const startClipDrag = (
    event: ReactPointerEvent,
    entry: LaidOutClip,
    mode: "move" | "start" | "end",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect({ kind: "clip", id: entry.clip.id });
    if (mode === "move") {
      drag.current = {
        kind: "move-clip",
        id: entry.clip.id,
        from: entry.index,
        startX: event.clientX,
        active: false,
        target: entry.index,
      };
    } else {
      drag.current = {
        kind: "trim-clip",
        id: entry.clip.id,
        edge: mode,
        startX: event.clientX,
        origin: { trimStart: entry.clip.trimStart, duration: entry.clip.duration },
      };
    }
  };

  const startAudioDrag = (
    event: ReactPointerEvent,
    item: TimelineAudio,
    mode: "move" | "start" | "end",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect({ kind: "audio", id: item.id });
    if (mode === "move") {
      drag.current = {
        kind: "move-audio",
        id: item.id,
        startX: event.clientX,
        origin: { start: item.start },
      };
    } else {
      drag.current = {
        kind: "trim-audio",
        id: item.id,
        edge: mode,
        startX: event.clientX,
        origin: {
          start: item.start,
          trimStart: item.trimStart,
          duration: item.duration ?? audioPlayLength(item, layout.total),
        },
      };
    }
  };

  const height = ROW.ruler + ROW.picture + ROW.audio * 2 + ROW.text + 10;
  const mute = {
    timeline: props.timeline,
    onMute: (channel: MixChannel, muted: boolean) =>
      props.onChange(withChannel(props.timeline, channel, { muted })),
  };

  return (
    <div className="flex select-none text-xs" style={{ height }}>
      <div className="shrink-0 border-r border-border bg-surface" style={{ width: LABEL_WIDTH }}>
        <div style={{ height: ROW.ruler }} />
        <TrackLabel icon={Film} label="Picture" height={ROW.picture} channel="picture" {...mute} />
        <TrackLabel icon={Mic} label="Voiceover" height={ROW.audio} channel="voiceover" {...mute} />
        <TrackLabel icon={Music} label="Music & FX" height={ROW.audio} channel="audio" {...mute} />
        <TrackLabel icon={Type} label="Text" height={ROW.text} />
      </div>
      <div
        ref={scroller}
        className="scroll-slim relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        data-testid="timeline-scroller"
      >
        <div className="relative" style={{ width, height: height - 10 }}>
          <Ruler total={layout.total} pps={pps} width={width} onPointerDown={startScrub} />

          <div
            className="absolute inset-x-0"
            style={{ top: ROW.ruler, height: ROW.picture }}
            onPointerDown={startScrub}
          >
            {layout.clips.map((entry) => (
              <ClipBlock
                key={entry.clip.id}
                entry={entry}
                pps={pps}
                asset={props.assets.get(entry.clip.assetId)}
                media={props.media.get(entry.clip.assetId)}
                selected={props.selection?.kind === "clip" && props.selection.id === entry.clip.id}
                onPointerDown={startClipDrag}
              />
            ))}
            {dropIndex !== null && (
              <div
                className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary"
                style={{
                  left:
                    (dropIndex >= layout.clips.length
                      ? layout.total
                      : (layout.clips[dropIndex]?.start ?? 0)) *
                      pps -
                    1,
                }}
              />
            )}
          </div>

          <AudioRow
            top={ROW.ruler + ROW.picture}
            items={voice}
            {...props}
            onPointerDown={startAudioDrag}
            onBackground={startScrub}
          />
          <AudioRow
            top={ROW.ruler + ROW.picture + ROW.audio}
            items={beds}
            {...props}
            onPointerDown={startAudioDrag}
            onBackground={startScrub}
          />

          <div
            className="absolute inset-x-0"
            style={{ top: ROW.ruler + ROW.picture + ROW.audio * 2, height: ROW.text }}
            onPointerDown={startScrub}
          >
            {timeline.captions.enabled &&
              timeline.captions.segments.map((segment, index) => (
                <button
                  key={`c${index}`}
                  type="button"
                  title={segment.text}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    clock.seek(segment.start);
                    onSelect({ kind: "caption", index });
                  }}
                  className={cn(
                    "absolute top-1 h-[18px] truncate rounded-sm border px-1 text-left text-[10px] leading-4",
                    props.selection?.kind === "caption" && props.selection.index === index
                      ? "border-primary bg-primary/30"
                      : "border-border bg-surface-raised text-muted-foreground",
                  )}
                  style={{
                    left: segment.start * pps,
                    width: Math.max(4, (segment.end - segment.start) * pps - 1),
                  }}
                >
                  {segment.text}
                </button>
              ))}
            {timeline.overlays.map((overlay) => (
              <button
                key={overlay.id}
                type="button"
                title={overlay.text}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  clock.seek(overlay.start);
                  onSelect({ kind: "overlay", id: overlay.id });
                }}
                className={cn(
                  "absolute top-0 z-10 flex h-[12px] items-center gap-0.5 truncate rounded-sm px-1 text-[9px] font-semibold uppercase leading-3",
                  props.selection?.kind === "overlay" && props.selection.id === overlay.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-info/70 text-background",
                )}
                style={{
                  left: overlay.start * pps,
                  width: Math.max(4, (overlay.end - overlay.start) * pps - 1),
                }}
              >
                <Sparkles className="size-2.5 shrink-0" />
                {overlay.text}
              </button>
            ))}
          </div>

          <Playhead clock={clock} pps={pps} height={height - 10} />
        </div>
      </div>
    </div>
  );
}

function TrackLabel({
  icon: Icon,
  label,
  height,
  channel,
  timeline,
  onMute,
}: {
  icon: typeof Film;
  label: string;
  height: number;
  /** The mixer channel the row plays on, for its mute button. */
  channel?: MixChannel;
  timeline?: Timeline;
  onMute?: (channel: MixChannel, muted: boolean) => void;
}) {
  const muted = channel && timeline ? timeline.mix[channel].muted : false;
  const name = channel ? MIX_CHANNEL_LABELS[channel] : label;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-t border-border px-2 text-muted-foreground",
        muted && "text-muted-foreground/50",
      )}
      style={{ height }}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", muted && "line-through")}>{label}</span>
      {channel && onMute && (
        <button
          type="button"
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded hover:bg-muted",
            muted ? "text-destructive" : "text-muted-foreground",
          )}
          aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
          aria-pressed={muted}
          title={muted ? `Unmute ${name}` : `Mute ${name}`}
          onClick={() => onMute(channel, !muted)}
          data-testid={`track-mute-${channel}`}
        >
          {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
        </button>
      )}
    </div>
  );
}

function Ruler({
  total,
  pps,
  width,
  onPointerDown,
}: {
  total: number;
  pps: number;
  width: number;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const step = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 15 ? 5 : 10;
  const ticks = useMemo(() => {
    const list: number[] = [];
    for (let t = 0; t * pps <= width; t += step) list.push(t);
    return list;
  }, [pps, width, step]);
  return (
    <div
      className="absolute inset-x-0 top-0 cursor-ew-resize border-b border-border bg-surface"
      style={{ height: ROW.ruler }}
      onPointerDown={onPointerDown}
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full border-l border-border/70 pl-1 text-[10px] leading-[22px] text-muted-foreground"
          style={{ left: t * pps }}
        >
          {formatTime(t, false)}
        </div>
      ))}
      <div
        className="absolute top-0 h-full border-l-2 border-warning/60"
        style={{ left: total * pps }}
        title="End of the edit"
      />
    </div>
  );
}

function Playhead({ clock, pps, height }: { clock: PlaybackClock; pps: number; height: number }) {
  const time = useClockTime(clock);
  return (
    <div className="pointer-events-none absolute top-0 z-30" style={{ left: time * pps, height }}>
      <div className="-ml-[5px] size-[10px] rotate-45 rounded-[2px] bg-primary" />
      <div className="-mt-1 h-full w-px bg-primary" />
    </div>
  );
}

interface ClipBlockProps {
  entry: LaidOutClip;
  pps: number;
  asset: AssetRow | undefined;
  media: SignedMedia | undefined;
  selected: boolean;
  onPointerDown: (
    event: ReactPointerEvent,
    entry: LaidOutClip,
    mode: "move" | "start" | "end",
  ) => void;
}

const ClipBlock = memo(function ClipBlock({
  entry,
  pps,
  asset,
  media,
  selected,
  onPointerDown,
}: ClipBlockProps) {
  const left = entry.start * pps;
  const width = Math.max(6, (entry.end - entry.start) * pps - 1);
  const overlap = entry.transitionIn * pps;
  const clip = entry.clip;
  const thumb = clip.kind === "image" ? media?.url : media?.posterUrl;
  const atMax = clip.kind === "video" && clip.duration >= maxClipDuration(clip) - 0.05;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Clip ${entry.index + 1}: ${clip.label ?? asset?.title ?? clip.kind}, ${clip.duration.toFixed(1)} seconds`}
      data-testid="timeline-clip"
      className={cn(
        "group absolute top-1 h-[56px] cursor-grab overflow-hidden rounded-md border bg-surface-raised active:cursor-grabbing",
        selected ? "z-10 border-primary ring-1 ring-primary" : "border-border",
      )}
      style={{ left, width }}
      onPointerDown={(event) => onPointerDown(event, entry, "move")}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-70"
          draggable={false}
        />
      ) : media && clip.kind === "video" ? (
        <video
          src={`${media.url}#t=${Math.max(0.1, clip.trimStart + 0.1)}`}
          preload="metadata"
          muted
          className="absolute inset-0 size-full object-cover opacity-70"
        />
      ) : null}
      {overlap > 0 && (
        <div
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.25)_0_4px,transparent_4px_8px)]"
          style={{ width: overlap }}
          title={`Transition: ${entry.transitionType}`}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] text-white">
        {clip.kind === "image" ? (
          <ImageIcon className="size-3 shrink-0" />
        ) : (
          <Film className="size-3 shrink-0" />
        )}
        <span className="truncate">{clip.label ?? asset?.title ?? `Clip ${entry.index + 1}`}</span>
        <span className="ml-auto shrink-0 tabular-nums opacity-80">
          {clip.duration.toFixed(1)}s
        </span>
      </div>
      <div
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30"
        onPointerDown={(event) => onPointerDown(event, entry, "start")}
        aria-hidden
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30",
          atMax ? "bg-warning/40" : "bg-white/0",
        )}
        onPointerDown={(event) => onPointerDown(event, entry, "end")}
        title={atMax ? "This clip uses all of its footage" : undefined}
        aria-hidden
      />
    </div>
  );
});

function AudioRow({
  top,
  items,
  timeline,
  layout,
  assets,
  pixelsPerSecond: pps,
  selection,
  onPointerDown,
  onBackground,
}: TimelineViewProps & {
  top: number;
  items: TimelineAudio[];
  onPointerDown: (
    event: ReactPointerEvent,
    item: TimelineAudio,
    mode: "move" | "start" | "end",
  ) => void;
  onBackground: (event: ReactPointerEvent) => void;
}) {
  return (
    <div
      className="absolute inset-x-0 border-t border-border"
      style={{ top, height: ROW.audio }}
      onPointerDown={onBackground}
    >
      {items.map((item) => {
        const length = audioPlayLength(item, Math.max(layout.total, item.start + 0.1));
        const selected = selection?.kind === "audio" && selection.id === item.id;
        const asset = assets.get(item.assetId);
        const tone =
          item.role === "voiceover"
            ? "bg-chart-2/40 border-chart-2"
            : item.role === "music"
              ? "bg-chart-4/40 border-chart-4"
              : "bg-chart-5/40 border-chart-5";
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            data-testid="timeline-audio"
            aria-label={`${item.role}: ${item.label ?? asset?.title ?? "audio"}`}
            className={cn(
              "absolute top-1 h-[26px] cursor-grab overflow-hidden rounded border text-[10px]",
              tone,
              selected && "ring-1 ring-primary",
            )}
            style={{ left: item.start * pps, width: Math.max(6, length * pps - 1) }}
            onPointerDown={(event) => onPointerDown(event, item, "move")}
          >
            <div className="flex h-full items-center gap-1 px-1.5">
              <Waves className="size-3 shrink-0 opacity-70" />
              <span className="truncate">{item.label ?? asset?.title ?? "Audio"}</span>
              {item.role === "music" &&
                item.duck &&
                timeline.audio.some((other) => other.role === "voiceover") && (
                  <span className="ml-auto shrink-0 rounded bg-black/30 px-1 text-[9px] uppercase">
                    ducks
                  </span>
                )}
            </div>
            <div
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/30"
              onPointerDown={(event) => onPointerDown(event, item, "start")}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/30"
              onPointerDown={(event) => onPointerDown(event, item, "end")}
              aria-hidden
            />
          </div>
        );
      })}
    </div>
  );
}
