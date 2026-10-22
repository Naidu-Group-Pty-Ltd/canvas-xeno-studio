import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Blend,
  Copy,
  Plus,
  Scissors,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import {
  ASPECT_LABELS,
  ASPECT_RATIOS,
  AUDIO_ROLE_LABELS,
  AUDIO_ROLES,
  CAPTION_POSITION_LABELS,
  CAPTION_POSITIONS,
  CAPTION_STYLE_LABELS,
  CAPTION_STYLES,
  captionsFromScript,
  duplicateClip,
  FIT_LABELS,
  FITS,
  formatTime,
  FPS_OPTIONS,
  FRAME_RATE_CONVERSIONS,
  FRAME_RATE_CONVERSION_LABELS,
  UPSCALES,
  UPSCALE_LABELS,
  LIMITS,
  maxClipDuration,
  MOTION_LABELS,
  MOTIONS,
  moveClip,
  newId,
  placeAt,
  OVERLAY_BACKING_LABELS,
  OVERLAY_BACKINGS,
  OVERLAY_POSITIONS,
  OVERLAY_STYLE_LABELS,
  OVERLAY_STYLES,
  removeClip,
  RESOLUTIONS,
  splitClipAt,
  TRANSITIONS,
  updateClip,
  audioPlayLength,
  canBlendJoin,
  channelOf,
  joinCounts,
  joinFields,
  joinModeOf,
  JOIN_MODE_LABELS,
  JOIN_MODES,
  MIX_CHANNEL_LABELS,
  withAllJoins,
  type JoinMode,
  type MixChannel,
  type AspectRatio,
  type Fit,
  type Motion,
  type Overlay,
  type Timeline,
  type TimelineAudio,
  type TimelineClip,
  type TimelineLayout,
  type TransitionType,
} from "@/lib/edit/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getMediaWorkerStatus } from "@/lib/media.functions";
import { cn } from "@/lib/utils";
import type { PlaybackClock, Selection } from "./state";
import { VoiceoverPanel, type VoiceoverContext } from "./VoiceoverPanel";
import { MusicPanel, type MusicContext } from "./MusicPanel";
import { VoicePauses } from "./VoicePauses";
import { Mixer } from "./Mixer";
import { SendToKatana } from "@/components/katana/SendToKatana";
import { useVoiceovers } from "@/hooks/useVoiceData";
import { phraseCaptions } from "@/lib/edit/captions";
import { brandedOverlay, withCaptionStyle } from "@/lib/edit/brand";
import { BrandSection, ImageOverlaysSection } from "./BrandPanel";
import { CaptionEmphasisField, CaptionPanelField } from "./BrandCaptionControls";
import { useEditBrandKit } from "@/hooks/useBrandKits";
import { CompositionSection, type CompositionControls } from "./CompositionSection";

interface InspectorProps {
  timeline: Timeline;
  layout: TimelineLayout;
  assets: Map<string, AssetRow>;
  selection: Selection;
  clock: PlaybackClock;
  onSelect: (selection: Selection) => void;
  onChange: (timeline: Timeline, key?: string) => void;
  /**
   * Applies a change to the timeline as it is when the change lands, for
   * changes that wait on something first (a take being made).
   */
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
  /** The timeline as it is now, for those changes. */
  getTimeline: () => Timeline;
  /** The edit this timeline belongs to, for voiceovers in its brand voice. */
  voiceover?: VoiceoverContext | undefined;
  /** The edit's project, campaign and planned music direction. */
  music?: MusicContext | undefined;
  /** The edit's motion graphics: their state, and drawing them again. */
  compositions?: CompositionControls | undefined;
}

const TAB_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function Inspector(props: InspectorProps) {
  const { selection, timeline } = props;
  if (selection?.kind === "clip") {
    const clip = timeline.clips.find((item) => item.id === selection.id);
    if (clip) return <ClipInspector {...props} clip={clip} />;
  }
  if (selection?.kind === "audio") {
    const item = timeline.audio.find((entry) => entry.id === selection.id);
    if (item) return <AudioInspector {...props} item={item} />;
  }
  const tabCount = 2 + Number(!!props.voiceover) + Number(!!props.music);
  return (
    <Tabs
      defaultValue={
        selection?.kind === "caption" || selection?.kind === "overlay" ? "text" : "format"
      }
      className="flex h-full flex-col"
    >
      <TabsList className={`mx-3 mt-3 grid ${TAB_COLUMNS[tabCount]}`}>
        <TabsTrigger value="format">Format</TabsTrigger>
        {props.voiceover && <TabsTrigger value="voice">Voice</TabsTrigger>}
        {props.music && <TabsTrigger value="music">Music</TabsTrigger>}
        <TabsTrigger value="text">
          {props.voiceover || props.music ? "Text" : "Captions & titles"}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="format" className="min-h-0 flex-1 overflow-y-auto">
        <SequenceSettings {...props} />
      </TabsContent>
      {props.voiceover && (
        <TabsContent value="voice" className="min-h-0 flex-1 overflow-y-auto">
          <VoiceoverPanel
            context={props.voiceover}
            timeline={timeline}
            layout={props.layout}
            playhead={() => props.clock.getTime()}
            onUpdate={props.onUpdate}
            getTimeline={props.getTimeline}
          />
        </TabsContent>
      )}
      {props.music && (
        <TabsContent value="music" className="min-h-0 flex-1 overflow-y-auto">
          <MusicPanel
            context={props.music}
            timeline={timeline}
            layout={props.layout}
            playhead={() => props.clock.getTime()}
            onChange={props.onChange}
            onUpdate={props.onUpdate}
            getTimeline={props.getTimeline}
            onSelect={props.onSelect}
          />
        </TabsContent>
      )}
      <TabsContent value="text" className="min-h-0 flex-1 overflow-y-auto">
        <TextPanel {...props} />
      </TabsContent>
    </Tabs>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border p-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label-eyebrow">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const ANCHORS = [0, 0.5, 1] as const;
const ANCHOR_NAMES = {
  0: ["Left", "Top"],
  0.5: ["Centre", "Middle"],
  1: ["Right", "Bottom"],
} as const;

/**
 * Where a clip that fills the frame is cropped: the part of its picture kept
 * in frame, from the nine points of a grid. Offered once the media service
 * renders it the same way.
 */
function FocusField({
  focus,
  onChange,
}: {
  focus: { x: number; y: number } | null;
  onChange: (focus: { x: number; y: number } | null) => void;
}) {
  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
  });
  const supported = (worker?.features ?? []).includes("frame_focus");
  const current = focus ?? { x: 0.5, y: 0.5 };
  return (
    <Field
      label="What stays in frame"
      hint={supported ? undefined : "Centred until the media service is updated"}
    >
      <div
        className="grid w-24 grid-cols-3 gap-1"
        role="radiogroup"
        aria-label="What stays in frame"
        data-testid="clip-focus"
      >
        {ANCHORS.map((y) =>
          ANCHORS.map((x) => {
            const selected = Math.abs(current.x - x) < 0.01 && Math.abs(current.y - y) < 0.01;
            const name =
              x === 0.5 && y === 0.5
                ? "Centre"
                : `${ANCHOR_NAMES[y][1]} ${ANCHOR_NAMES[x][0].toLowerCase()}`;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name}
                title={name}
                disabled={!supported}
                onClick={() => onChange(x === 0.5 && y === 0.5 ? null : { x, y })}
                className={cn(
                  "size-7 rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  selected ? "border-primary bg-primary/30" : "border-border hover:border-input",
                )}
              />
            );
          }),
        )}
      </div>
    </Field>
  );
}

/** Whether the deployed media service makes smart joins (it matches colour only without); null until known. */
function useSmartJoins(): boolean | null {
  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
  });
  return worker ? (worker.features ?? []).includes("smart_join") : null;
}

const JOIN_HINTS: Record<JoinMode, string> = {
  smart:
    "Puts this clip back in register with the one before at the cut: its framing, colour and detail, and the two clips' own sound. Each eases back to this clip's own over a few seconds, too slowly to see. Made when the video renders; the preview plays the plain cut.",
  colour:
    "Matches only this clip's colour at the cut, easing back to its own over a couple of seconds.",
  plain: "Leaves the join as it is.",
};

/**
 * How a clip that carries straight on from the one before meets it: smart
 * blend, colour match or plain (see JOIN_MODES).
 */
function JoinField({ mode, onChange }: { mode: JoinMode; onChange: (mode: JoinMode) => void }) {
  const smart = useSmartJoins();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Join with the clip before</Label>
      <div
        className="grid grid-cols-3 gap-1"
        role="radiogroup"
        aria-label="Join with the clip before"
        data-testid="clip-join"
      >
        {JOIN_MODES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onChange(value)}
            className={cn(
              "rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
              mode === value
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:border-input hover:text-foreground",
            )}
          >
            {JOIN_MODE_LABELS[value]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{JOIN_HINTS[mode]}</p>
      {mode === "smart" && smart === false && (
        <p className="text-[11px] text-warning" data-testid="smart-join-unavailable">
          The media service hasn't been updated for smart blends yet: until it is, this join's
          colour is matched only.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {hint && <span className="text-[11px] tabular-nums text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Says when the mixer changes what an item's volume gives. */
function ChannelNote({ timeline, channel }: { timeline: Timeline; channel: MixChannel }) {
  const settings = timeline.mix[channel];
  if (!settings.muted && settings.level === 1) return null;
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="channel-note">
      {settings.muted
        ? `The ${MIX_CHANNEL_LABELS[channel]} channel is muted in the mixer, so this isn't heard.`
        : `The ${MIX_CHANNEL_LABELS[channel]} channel is at ${Math.round(settings.level * 100)}% in the mixer, on top of this.`}
    </p>
  );
}

/** Above 100%, the preview turns everything down so the boost can be heard (see PreviewPlayer). */
function BoostNote() {
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="volume-boost-note">
      Browsers can't play above 100%, so the preview plays the whole edit quieter to keep this
      louder than the rest. The finished video gets the full boost.
    </p>
  );
}

function Seconds({
  value,
  min,
  max,
  step = 0.1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      type="number"
      inputMode="decimal"
      aria-label={label}
      className="h-8 tabular-nums"
      min={min}
      max={max}
      step={step}
      value={draft ?? value.toFixed(2)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const parsed = Number(draft);
        setDraft(null);
        if (Number.isFinite(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Clip                                                                */
/* ------------------------------------------------------------------ */

function ClipInspector({
  timeline,
  layout,
  assets,
  clock,
  onChange,
  onSelect,
  compositions,
  clip,
}: InspectorProps & { clip: TimelineClip }) {
  const index = timeline.clips.findIndex((item) => item.id === clip.id);
  const entry = layout.clips[index];
  const asset = assets.get(clip.assetId);
  const set = (patch: Partial<TimelineClip>, key?: string) =>
    onChange(updateClip(timeline, clip.id, patch), key);
  const max = maxClipDuration(clip);
  const sourceLength = clip.sourceDuration ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title={`Clip ${index + 1} of ${timeline.clips.length}`}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSelect(null)}
          >
            Done
          </Button>
        }
      >
        <p className="truncate text-sm font-medium" title={asset?.title ?? undefined}>
          {clip.label ?? asset?.title ?? (clip.kind === "image" ? "Still image" : "Video clip")}
        </p>
        {entry && (
          <p className="text-xs text-muted-foreground">
            On screen {formatTime(entry.start)} – {formatTime(entry.end)}
            {clip.kind === "video" && sourceLength ? ` · footage ${sourceLength.toFixed(1)}s` : ""}
          </p>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            title="Move earlier"
            disabled={index <= 0}
            onClick={() => onChange(moveClip(timeline, index, index - 1))}
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            title="Move later"
            disabled={index >= timeline.clips.length - 1}
            onClick={() => onChange(moveClip(timeline, index, index + 1))}
          >
            <ArrowRight className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            title="Duplicate (Ctrl+D)"
            disabled={timeline.clips.length >= LIMITS.clips}
            onClick={() => onChange(duplicateClip(timeline, clip.id))}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-destructive"
            title="Remove (Delete)"
            onClick={() => {
              onChange(removeClip(timeline, clip.id));
              onSelect(null);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full"
          disabled={
            !entry || clock.getTime() <= entry.start + 0.1 || clock.getTime() >= entry.end - 0.1
          }
          onClick={() => onChange(splitClipAt(timeline, clock.getTime(), clip.id))}
        >
          <Scissors className="mr-1.5 size-3.5" /> Split at playhead (S)
        </Button>
        {asset && (
          <SendToKatana
            file={asset}
            label={clip.kind === "video" ? "Send its footage to Katana" : "Send it to Katana"}
            className="h-8 w-full"
          />
        )}
      </Section>

      {clip.composition && compositions && (
        <CompositionSection clip={clip} composition={clip.composition} controls={compositions} />
      )}

      <Section title={clip.kind === "image" ? "Timing" : "Trim"}>
        {clip.kind === "video" && (
          <Field
            label="Starts at (in the footage)"
            hint={sourceLength ? `of ${sourceLength.toFixed(1)}s` : undefined}
          >
            <Slider
              min={0}
              max={Math.max(
                0.1,
                (sourceLength ?? clip.trimStart + clip.duration * clip.speed) - 0.1,
              )}
              step={0.05}
              value={[clip.trimStart]}
              onValueChange={([value]) => set({ trimStart: value ?? 0 }, `trimstart:${clip.id}`)}
              aria-label="Start point in the footage"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          {clip.kind === "video" && (
            <Field label="In point">
              <Seconds
                label="In point"
                value={clip.trimStart}
                min={0}
                max={Math.max(0, (sourceLength ?? 86_400) - 0.1)}
                onChange={(value) => set({ trimStart: value })}
              />
            </Field>
          )}
          <Field
            label="Duration"
            hint={clip.kind === "video" ? `max ${max.toFixed(1)}s` : undefined}
          >
            <Seconds
              label="Duration"
              value={clip.duration}
              min={0.2}
              max={max}
              onChange={(value) => set({ duration: value })}
            />
          </Field>
        </div>
        {clip.kind === "video" && (
          <Field label="Speed" hint={`${clip.speed}×`}>
            <Select
              value={String(clip.speed)}
              onValueChange={(value) => set({ speed: Number(value) })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((speed) => (
                  <SelectItem key={speed} value={String(speed)}>
                    {speed === 1 ? "Normal (1×)" : `${speed}×${speed < 1 ? " slow motion" : ""}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </Section>

      <Section title="Transition in">
        {index === 0 ? (
          <p className="text-xs text-muted-foreground">
            The first clip opens the edit. Use the fade-in under Format for a soft start.
          </p>
        ) : (
          <>
            <Select
              value={clip.transition.type}
              onValueChange={(value) =>
                set({
                  transition: {
                    type: value as TransitionType,
                    duration: value === "cut" ? 0 : clip.transition.duration || 0.5,
                  },
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="Transition type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSITIONS.map((transition) => (
                  <SelectItem key={transition.id} value={transition.id}>
                    {transition.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clip.transition.type !== "cut" && (
              <Field
                label="Length"
                hint={`${clip.transition.duration.toFixed(2)}s${entry && entry.transitionIn + 0.01 < clip.transition.duration ? ` (fits ${entry.transitionIn.toFixed(2)}s)` : ""}`}
              >
                <Slider
                  min={0.1}
                  max={LIMITS.transitionSeconds}
                  step={0.05}
                  value={[clip.transition.duration]}
                  onValueChange={([value]) =>
                    set(
                      { transition: { ...clip.transition, duration: value ?? 0.5 } },
                      `transition:${clip.id}`,
                    )
                  }
                  aria-label="Transition length"
                />
              </Field>
            )}
            {canBlendJoin(timeline, index) ? (
              <JoinField mode={joinModeOf(clip)} onChange={(mode) => set(joinFields(mode))} />
            ) : (
              clip.kind === "video" && (
                <p className="text-[11px] text-muted-foreground">
                  A join can be smart-blended between two video clips.
                </p>
              )
            )}
          </>
        )}
      </Section>

      <Section title="Picture">
        <Field label="Framing">
          <Select
            value={clip.fit ?? "default"}
            onValueChange={(value) => set({ fit: value === "default" ? null : (value as Fit) })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                Edit default ({FIT_LABELS[timeline.fit].split(" (")[0]})
              </SelectItem>
              {FITS.map((fit) => (
                <SelectItem key={fit} value={fit}>
                  {FIT_LABELS[fit]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {(clip.fit ?? timeline.fit) === "cover" && (
          <FocusField focus={clip.focus} onChange={(focus) => set({ focus })} />
        )}
        {clip.kind === "image" && (
          <Field label="Motion">
            <Select value={clip.motion} onValueChange={(value) => set({ motion: value as Motion })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIONS.map((motion) => (
                  <SelectItem key={motion} value={motion}>
                    {MOTION_LABELS[motion]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </Section>

      {clip.kind === "video" && !clip.composition && (
        <Section title="Clip sound">
          <Field
            label="Volume"
            hint={clip.volume === 0 ? "Muted" : `${Math.round(clip.volume * 100)}%`}
          >
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[clip.volume]}
              onValueChange={([value]) => set({ volume: value ?? 1 }, `volume:${clip.id}`)}
              aria-label="Clip volume"
            />
            {clip.volume > 1 && <BoostNote />}
            <ChannelNote timeline={timeline} channel="picture" />
          </Field>
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor={`mute-${clip.id}`}>
              Mute this clip
            </Label>
            <Switch
              id={`mute-${clip.id}`}
              checked={clip.volume === 0}
              onCheckedChange={(checked) => set({ volume: checked ? 0 : 1 })}
            />
          </div>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

function AudioInspector({
  timeline,
  layout,
  assets,
  clock,
  onChange,
  onSelect,
  voiceover,
  music,
  item,
}: InspectorProps & { item: TimelineAudio }) {
  const asset = assets.get(item.assetId);
  const set = (patch: Partial<TimelineAudio>, key?: string) =>
    onChange(
      {
        ...timeline,
        audio: timeline.audio.map((entry) =>
          entry.id === item.id ? { ...entry, ...patch } : entry,
        ),
      },
      key,
    );
  const plays = audioPlayLength(item, layout.total, timeline.fps);
  const hasVoice = timeline.audio.some((entry) => entry.role === "voiceover");

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title={AUDIO_ROLE_LABELS[item.role]}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSelect(null)}
          >
            Done
          </Button>
        }
      >
        <p className="truncate text-sm font-medium">{item.label ?? asset?.title ?? "Audio"}</p>
        <p className="text-xs text-muted-foreground">
          Plays {formatTime(item.start)} – {formatTime(item.start + plays)}
          {item.sourceDuration ? ` · track ${item.sourceDuration.toFixed(1)}s` : ""}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => set({ start: placeAt(clock.getTime()) })}
          >
            Start at playhead
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-destructive"
            onClick={() => {
              onChange({
                ...timeline,
                audio: timeline.audio.filter((entry) => entry.id !== item.id),
              });
              onSelect(null);
            }}
          >
            <Trash2 className="mr-1 size-3.5" /> Remove
          </Button>
        </div>
      </Section>

      <Section title="Placement">
        <Field label="Use as">
          <Select
            value={item.role}
            onValueChange={(value) => {
              const role = value as TimelineAudio["role"];
              // Only music loops: the flag goes when a bed becomes a voiceover or effect.
              set(role === "music" ? { role } : { role, loop: false });
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {AUDIO_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts in the edit at">
            <Seconds
              label="Start in the edit"
              value={item.start}
              min={0}
              max={LIMITS.totalSeconds}
              onChange={(value) => set({ start: value })}
            />
          </Field>
          <Field label="From the track at">
            <Seconds
              label="Offset into the track"
              value={item.trimStart}
              min={0}
              max={Math.max(0, (item.sourceDuration ?? 86_400) - 0.1)}
              onChange={(value) => set({ trimStart: value })}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs" htmlFor={`auto-${item.id}`}>
            Play to the end of the edit
          </Label>
          <Switch
            id={`auto-${item.id}`}
            checked={item.duration === null}
            onCheckedChange={(checked) =>
              set({ duration: checked ? null : Number(Math.max(0.5, plays).toFixed(2)) })
            }
          />
        </div>
        {item.duration !== null && (
          <Field label="Length">
            <Seconds
              label="Audio length"
              value={item.duration}
              min={0.2}
              max={LIMITS.totalSeconds}
              onChange={(value) => set({ duration: value })}
            />
          </Field>
        )}
        {item.role === "music" && (
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor={`loop-${item.id}`}>
              Loop to fill the edit
            </Label>
            <Switch
              id={`loop-${item.id}`}
              checked={item.loop}
              onCheckedChange={(checked) => set({ loop: checked })}
            />
          </div>
        )}
      </Section>

      <Section title="Level">
        <Field label="Volume" hint={`${Math.round(item.volume * 100)}%`}>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={[item.volume]}
            onValueChange={([value]) => set({ volume: value ?? 1 }, `volume:${item.id}`)}
            aria-label="Track volume"
          />
          {item.volume > 1 && <BoostNote />}
          <ChannelNote timeline={timeline} channel={channelOf(item.role)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fade in">
            <Seconds
              label="Fade in"
              value={item.fadeIn}
              min={0}
              max={10}
              onChange={(value) => set({ fadeIn: value })}
            />
          </Field>
          <Field label="Fade out">
            <Seconds
              label="Fade out"
              value={item.fadeOut}
              min={0}
              max={10}
              onChange={(value) => set({ fadeOut: value })}
            />
          </Field>
        </div>
        {(item.role === "music" || item.role === "sfx") && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-xs" htmlFor={`duck-${item.id}`}>
                Dip under the voiceover
              </Label>
              <Switch
                id={`duck-${item.id}`}
                checked={item.duck}
                onCheckedChange={(checked) => set({ duck: checked })}
              />
            </div>
            {item.duck && (
              <Field
                label="Level while someone speaks"
                hint={`${Math.round(item.duckLevel * 100)}%`}
              >
                <Slider
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={[item.duckLevel]}
                  onValueChange={([value]) => set({ duckLevel: value ?? 0.25 }, `duck:${item.id}`)}
                  aria-label="Music level under voice"
                />
              </Field>
            )}
            {item.duck && !hasVoice && (
              <p className="text-xs text-muted-foreground">
                Add a voiceover and the music will dip wherever it speaks.
              </p>
            )}
            {item.role === "music" && !item.duck && hasVoice && (
              <p className="text-xs text-muted-foreground" data-testid="never-ducked">
                Never dipped: it plays at its own level all through, voice or not. Right for a quiet
                bed under short lines, which dipping would make pump between them; keep its volume
                low enough for the words.
              </p>
            )}
          </>
        )}
      </Section>

      {item.role === "voiceover" && (
        <Section title="Pauses">
          <VoicePauses
            timeline={timeline}
            layout={layout}
            item={item}
            clock={clock}
            projectId={voiceover?.projectId ?? music?.projectId ?? null}
            sequenceId={voiceover?.sequenceId ?? null}
            onChange={onChange}
          />
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Format                                                              */
/* ------------------------------------------------------------------ */

/** How many of an edit's video clips were made at a frame rate other than its own (when measured). */
function otherRateClips(timeline: Timeline, assets: Map<string, AssetRow>): number {
  return timeline.clips.filter((clip) => {
    if (clip.kind !== "video") return false;
    const metadata = (assets.get(clip.assetId)?.metadata ?? {}) as Record<string, unknown>;
    const fps = typeof metadata["fps"] === "number" ? metadata["fps"] : null;
    return fps !== null && Math.abs(fps * clip.speed - timeline.fps) / timeline.fps > 0.005;
  }).length;
}

function SequenceSettings({ timeline, layout, assets, onChange }: InspectorProps) {
  const set = (patch: Partial<Timeline>, key?: string) => onChange({ ...timeline, ...patch }, key);
  const otherRate = otherRateClips(timeline, assets);
  return (
    <div>
      <Section title="Frame">
        <Field label="Aspect ratio">
          <Select
            value={timeline.aspectRatio}
            onValueChange={(value) => set({ aspectRatio: value as AspectRatio })}
          >
            <SelectTrigger className="h-8" aria-label="Aspect ratio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ASPECT_LABELS[ratio]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Resolution">
            <Select
              value={timeline.resolution}
              onValueChange={(value) => set({ resolution: value as Timeline["resolution"] })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((resolution) => (
                  <SelectItem key={resolution} value={resolution}>
                    {resolution === "1080p" ? "1080p (full HD)" : "720p (faster)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Frame rate">
            <Select
              value={String(timeline.fps)}
              onValueChange={(value) => set({ fps: Number(value) as Timeline["fps"] })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((fps) => (
                  <SelectItem key={fps} value={String(fps)}>
                    {fps} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Default framing">
          <Select value={timeline.fit} onValueChange={(value) => set({ fit: value as Fit })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FITS.map((fit) => (
                <SelectItem key={fit} value={fit}>
                  {FIT_LABELS[fit]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          {layout.clips.length} clip{layout.clips.length === 1 ? "" : "s"} ·{" "}
          {formatTime(layout.total)} long
        </p>
      </Section>
      <Section title="Picture">
        <Field label="Clips at another frame rate">
          <Select
            value={timeline.frameRateConversion}
            onValueChange={(value) =>
              set({ frameRateConversion: value as Timeline["frameRateConversion"] })
            }
          >
            <SelectTrigger className="h-8" aria-label="Clips at another frame rate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAME_RATE_CONVERSIONS.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {FRAME_RATE_CONVERSION_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-[11px] text-muted-foreground" data-testid="frame-rate-note">
          {otherRate
            ? `${otherRate} clip${otherRate === 1 ? " was" : "s were"} made at another frame rate (24 fps B-roll in a ${timeline.fps} fps edit, say). Repeated frames can judder on a slow camera move; blending smooths it, and motion interpolation makes the missing frames (it renders several times slower).`
            : "Every measured clip is at the edit's frame rate. For one that isn't (24 fps B-roll in a 30 fps edit), blending or motion interpolation keeps a slow camera move from juddering."}
        </p>
        <Field label="Scaling up">
          <Select
            value={timeline.upscale}
            onValueChange={(value) => set({ upscale: value as Timeline["upscale"] })}
          >
            <SelectTrigger className="h-8" aria-label="Scaling up">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPSCALES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {UPSCALE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Sharp scales 720p clips up to a 1080p edit with a finer filter and a light sharpen.
        </p>
      </Section>
      <Section title="Open and close">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fade in from black">
            <Seconds
              label="Fade in from black"
              value={timeline.fadeIn}
              min={0}
              max={3}
              onChange={(value) => set({ fadeIn: value })}
            />
          </Field>
          <Field label="Fade out to black">
            <Seconds
              label="Fade out to black"
              value={timeline.fadeOut}
              min={0}
              max={3}
              onChange={(value) => set({ fadeOut: value })}
            />
          </Field>
        </div>
      </Section>
      <JoinsSection timeline={timeline} onChange={onChange} />
      <Section title="Mix">
        <Mixer timeline={timeline} onChange={onChange} />
      </Section>
      <Section title="Sound">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs" htmlFor="loudness">
              Balance loudness for social
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Evens the final mix to −14 LUFS, the level Instagram, TikTok and YouTube expect. The
              mixer sets the balance between the channels; this sets the overall level.
            </p>
          </div>
          <Switch
            id="loudness"
            checked={timeline.normalizeLoudness}
            onCheckedChange={(checked) => set({ normalizeLoudness: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs" htmlFor="stems">
              Export stems with the video
            </Label>
            <p className="text-[11px] text-muted-foreground">
              The voiceover, the music and the effects, each as a WAV file beside the finished
              video, as mixed into it before its loudness is evened out.
            </p>
          </div>
          <Switch
            id="stems"
            checked={timeline.stems}
            onCheckedChange={(checked) => set({ stems: checked })}
          />
        </div>
      </Section>
    </div>
  );
}

/** Every join between video clips set at once, smart-blended most of all. */
function JoinsSection({
  timeline,
  onChange,
}: {
  timeline: Timeline;
  onChange: (timeline: Timeline, key?: string) => void;
}) {
  const smart = useSmartJoins();
  const { joins, smart: blended } = joinCounts(timeline);
  if (!joins) return null;
  const colour = timeline.clips.filter(
    (clip, index) => canBlendJoin(timeline, index) && joinModeOf(clip) === "colour",
  ).length;
  const all = (mode: JoinMode) =>
    timeline.clips.every(
      (clip, index) => !canBlendJoin(timeline, index) || joinModeOf(clip) === mode,
    );
  return (
    <Section title="Joins">
      <p className="text-xs text-muted-foreground" data-testid="join-counts">
        {joins} join{joins === 1 ? "" : "s"} between video clips: {blended} smart-blended
        {colour ? `, ${colour} colour-matched` : ""}
        {joins - blended - colour ? `, ${joins - blended - colour} plain` : ""}
      </p>
      <Button
        variant={all("smart") ? "secondary" : "outline"}
        size="sm"
        className="h-8 w-full"
        disabled={all("smart")}
        onClick={() => onChange(withAllJoins(timeline, "smart"))}
        data-testid="smart-blend-all"
      >
        <Blend className="mr-1.5 size-3.5" />
        {all("smart") ? "Every join is smart-blended" : "Smart-blend every join"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        For clips that carry straight on from each other, like a long video's. Each join is put back
        in register when the video renders: framing, colour, detail and sound. A join between clips
        that don't show the same picture is left as it is.
      </p>
      {smart === false && blended > 0 && (
        <p className="text-[11px] text-warning">
          The media service hasn't been updated for smart blends yet: until it is, these joins'
          colour is matched only.
        </p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {(["colour", "plain"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={all(mode)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onChange(withAllJoins(timeline, mode))}
          >
            {mode === "colour" ? "Colour-match every join" : "Plain cuts everywhere"}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Captions and titles                                                 */
/* ------------------------------------------------------------------ */

function TextPanel({
  timeline,
  layout,
  assets,
  clock,
  selection,
  onSelect,
  onChange,
  onUpdate,
  voiceover,
  music,
}: InspectorProps) {
  const projectId = voiceover?.projectId ?? music?.projectId ?? null;
  // The brand kit titles are set from, and whose names captions spell right.
  const { kit } = useEditBrandKit(timeline, projectId);
  const captions = timeline.captions;
  const setCaptions = (patch: Partial<Timeline["captions"]>, key?: string) =>
    onChange({ ...timeline, captions: { ...captions, ...patch } }, key);
  const [script, setScript] = useState("");
  const [terms, setTerms] = useState("");
  const voice = timeline.audio.find((item) => item.role === "voiceover");
  // The voiceover's word timings, where it is one of the edit's takes.
  const { data: takes = [] } = useVoiceovers(voiceover?.sequenceId ?? null);
  const words = voice
    ? (takes.find((take) => take.asset_id === voice.assetId)?.alignment?.words ?? [])
    : [];

  const writeFromScript = () => {
    const from = voice ? voice.start : 0.3;
    const to = voice
      ? voice.start + audioPlayLength(voice, layout.total, timeline.fps)
      : Math.max(0.6, layout.total - 0.3);
    const until = Math.min(to, layout.total);
    // With the voiceover's word timings, the script's words land where they
    // were said, as phrases; without them, it is spread over the voiceover.
    if (voice && words.length) {
      const timed = phraseCaptions(words, voice.start - voice.trimStart, {
        script,
        terms: [
          ...terms
            .split(",")
            .map((term) => term.trim())
            .filter(Boolean),
          ...(kit?.terms ?? []),
        ],
        from: voice.start,
        until,
      });
      if (timed.segments.length) {
        setCaptions({ enabled: true, segments: timed.segments });
        if (timed.source === "words")
          toast.message("The script didn't match what the voiceover says", {
            description: "The captions show the voiceover's own words instead.",
          });
        return;
      }
    }
    setCaptions({
      enabled: true,
      segments: captionsFromScript(script, from, until),
    });
  };

  const updateOverlay = (id: string, patch: Partial<Overlay>, key?: string) =>
    onChange(
      {
        ...timeline,
        overlays: timeline.overlays.map((overlay) =>
          overlay.id === id ? { ...overlay, ...patch } : overlay,
        ),
      },
      key,
    );

  const addOverlay = (style: Overlay["style"]) => {
    // At the playhead for 2.5 seconds, within what an edit can hold.
    const at = Math.min(placeAt(clock.getTime()), LIMITS.totalSeconds - 2.5);
    const overlay: Overlay = {
      id: newId(),
      text: style === "cta" ? "Shop now" : style === "subtitle" ? "Subtitle" : "Title",
      start: at,
      end: Number(Math.min(layout.total || at + 2.5, at + 2.5, LIMITS.totalSeconds).toFixed(2)),
      style,
      position: style === "cta" ? "bottom" : "center",
      y: null,
      // New titles read on any picture.
      backing: style === "cta" ? "outline" : "halo",
      font: null,
      color: null,
      accent: null,
    };
    // In the brand's look, where the edit has been styled from a kit.
    const added = kit && timeline.brandKitId === kit.id ? brandedOverlay(overlay, kit) : overlay;
    onChange({ ...timeline, overlays: [...timeline.overlays, added].slice(0, LIMITS.overlays) });
    onSelect({ kind: "overlay", id: overlay.id });
  };

  return (
    <div>
      <BrandSection
        timeline={timeline}
        layout={layout}
        projectId={projectId}
        onChange={onChange}
        onUpdate={onUpdate}
      />
      <Section
        title="Captions"
        action={
          <Switch
            aria-label="Show captions"
            checked={captions.enabled}
            onCheckedChange={(checked) => setCaptions({ enabled: checked })}
          />
        }
      >
        <p className="text-xs text-muted-foreground">
          Burned into the video. Most social video is watched without sound.
        </p>
        <Field label={voice ? "Script (timed to the voiceover)" : "Script"}>
          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="Paste or write the words to show…"
            className="min-h-[72px] text-sm"
          />
        </Field>
        {voice && words.length > 0 && (
          <Field label="Names to spell right (comma-separated)">
            <Input
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder={
                kit?.terms.length
                  ? `${kit.name}'s are used too: ${kit.terms.slice(0, 3).join(", ")}`
                  : "e.g. Aurixa Systems"
              }
              className="h-8 text-xs"
            />
          </Field>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={(!script.trim() && !(voice && words.length)) || layout.total < 0.5}
          onClick={writeFromScript}
        >
          <Wand2 className="mr-1.5 size-3.5" />{" "}
          {captions.segments.length ? "Replace captions" : "Make captions"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Style">
            <Select
              value={captions.style}
              onValueChange={(value) =>
                // In a brand's edit, its brand style is set in the kit's display face.
                onChange(withCaptionStyle(timeline, value as Timeline["captions"]["style"], kit))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {CAPTION_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Position">
            <Select
              value={captions.position}
              onValueChange={(value) =>
                setCaptions({ position: value as Timeline["captions"]["position"] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    {CAPTION_POSITION_LABELS[position]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <CaptionPanelField captions={captions} onChange={setCaptions} />
        <Field label="Size" hint={`${Math.round(captions.size * 100)}%`}>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={[captions.size]}
            onValueChange={([value]) => setCaptions({ size: value ?? 1 }, "caption-size")}
            aria-label="Caption size"
          />
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs" htmlFor="caption-upper">
            UPPERCASE
          </Label>
          <Switch
            id="caption-upper"
            checked={captions.uppercase}
            onCheckedChange={(checked) => setCaptions({ uppercase: checked })}
          />
        </div>
        {captions.segments.length > 0 && (
          <ol className="space-y-1.5">
            {captions.segments.map((segment, index) => {
              const selected = selection?.kind === "caption" && selection.index === index;
              return (
                <li
                  key={index}
                  className={`rounded-md border p-2 ${selected ? "border-primary" : "border-border"}`}
                >
                  <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <button
                      type="button"
                      className="tabular-nums hover:text-foreground"
                      onClick={() => clock.seek(segment.start)}
                    >
                      {formatTime(segment.start)} – {formatTime(segment.end)}
                    </button>
                    <button
                      type="button"
                      className="ml-auto hover:text-destructive"
                      aria-label={`Remove caption ${index + 1}`}
                      onClick={() =>
                        setCaptions({
                          segments: captions.segments.filter((_, position) => position !== index),
                        })
                      }
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <Input
                    value={segment.text}
                    maxLength={LIMITS.captionChars}
                    className="h-7 text-xs"
                    aria-label={`Caption ${index + 1}`}
                    onFocus={() => onSelect({ kind: "caption", index })}
                    onChange={(event) =>
                      setCaptions(
                        {
                          segments: captions.segments.map((item, position) =>
                            position === index ? { ...item, text: event.target.value } : item,
                          ),
                        },
                        `caption:${index}`,
                      )
                    }
                  />
                  {captions.style === "brand" && (
                    <CaptionEmphasisField
                      segment={segment}
                      index={index}
                      onChange={(emphasis) =>
                        setCaptions(
                          {
                            segments: captions.segments.map((item, position) =>
                              position === index ? { ...item, emphasis } : item,
                            ),
                          },
                          `caption-emphasis:${index}`,
                        )
                      }
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title="Titles & call to action">
        <div className="grid grid-cols-3 gap-1.5">
          {OVERLAY_STYLES.map((style) => (
            <Button
              key={style}
              variant="outline"
              size="sm"
              className="h-8 px-1 text-xs"
              disabled={timeline.overlays.length >= LIMITS.overlays}
              onClick={() => addOverlay(style)}
            >
              <Plus className="mr-0.5 size-3" />{" "}
              {OVERLAY_STYLE_LABELS[style].replace("Call to action", "CTA")}
            </Button>
          ))}
        </div>
        {timeline.overlays.length === 0 && (
          <p className="text-xs text-muted-foreground">
            <Type className="mr-1 inline size-3" />
            Add an opening title or an end-card call to action at the playhead.
          </p>
        )}
        {timeline.overlays.map((overlay) => {
          const selected = selection?.kind === "overlay" && selection.id === overlay.id;
          return (
            <div
              key={overlay.id}
              className={`space-y-2 rounded-md border p-2 ${selected ? "border-primary" : "border-border"}`}
            >
              <Input
                value={overlay.text}
                maxLength={LIMITS.overlayChars}
                className="h-8 text-sm"
                aria-label="Title text"
                onFocus={() => onSelect({ kind: "overlay", id: overlay.id })}
                onChange={(event) =>
                  updateOverlay(overlay.id, { text: event.target.value }, `overlay:${overlay.id}`)
                }
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Select
                  value={overlay.style}
                  onValueChange={(value) =>
                    updateOverlay(overlay.id, { style: value as Overlay["style"] })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERLAY_STYLES.map((style) => (
                      <SelectItem key={style} value={style}>
                        {OVERLAY_STYLE_LABELS[style]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={overlay.position}
                  onValueChange={(value) =>
                    updateOverlay(overlay.id, { position: value as Overlay["position"] })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERLAY_POSITIONS.map((position) => (
                      <SelectItem key={position} value={position}>
                        {position === "center"
                          ? "Centre"
                          : position[0]!.toUpperCase() + position.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {overlay.style !== "cta" && (
                <Select
                  value={overlay.backing}
                  onValueChange={(value) =>
                    updateOverlay(overlay.id, { backing: value as Overlay["backing"] })
                  }
                >
                  <SelectTrigger className="h-7 text-xs" aria-label="What keeps it readable">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERLAY_BACKINGS.map((backing) => (
                      <SelectItem key={backing} value={backing}>
                        {OVERLAY_BACKING_LABELS[backing]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Field
                label="Height"
                hint={overlay.y === null ? "by position" : `${Math.round(overlay.y * 100)}% down`}
              >
                <div className="flex items-center gap-2">
                  <Slider
                    min={4}
                    max={96}
                    step={1}
                    value={[Math.round((overlay.y ?? 0.5) * 100)]}
                    onValueChange={([value]) =>
                      updateOverlay(
                        overlay.id,
                        { y: (value ?? 50) / 100 },
                        `overlay-y:${overlay.id}`,
                      )
                    }
                    aria-label="Title height on the frame"
                  />
                  {overlay.y !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => updateOverlay(overlay.id, { y: null })}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </Field>
              {overlay.motion && (
                <Field label="Motion" hint="the brand kit's">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Rises in over {Math.round(overlay.motion.enter * 1000)} ms and goes over{" "}
                      {Math.round(overlay.motion.exit * 1000)} ms, on the brand's curves.
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-1.5 text-[11px]"
                      onClick={() => updateOverlay(overlay.id, { motion: null })}
                    >
                      Plain fade
                    </Button>
                  </div>
                </Field>
              )}
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
                <Field label="From">
                  <Seconds
                    label="Title start"
                    value={overlay.start}
                    min={0}
                    max={LIMITS.totalSeconds}
                    onChange={(value) => updateOverlay(overlay.id, { start: value })}
                  />
                </Field>
                <Field label="To">
                  <Seconds
                    label="Title end"
                    value={overlay.end}
                    min={0}
                    max={LIMITS.totalSeconds}
                    onChange={(value) => updateOverlay(overlay.id, { end: value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-destructive"
                  aria-label="Remove title"
                  onClick={() =>
                    onChange({
                      ...timeline,
                      overlays: timeline.overlays.filter((item) => item.id !== overlay.id),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </Section>
      <ImageOverlaysSection
        timeline={timeline}
        layout={layout}
        assets={assets}
        onChange={onChange}
      />
    </div>
  );
}
