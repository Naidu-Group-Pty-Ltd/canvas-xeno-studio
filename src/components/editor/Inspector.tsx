import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Copy, Plus, Scissors, Trash2, Type, Wand2 } from "lucide-react";
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
  LIMITS,
  maxClipDuration,
  MOTION_LABELS,
  MOTIONS,
  moveClip,
  newId,
  OVERLAY_POSITIONS,
  OVERLAY_STYLE_LABELS,
  OVERLAY_STYLES,
  removeClip,
  RESOLUTIONS,
  splitClipAt,
  TRANSITIONS,
  updateClip,
  audioPlayLength,
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
import type { PlaybackClock, Selection } from "./state";
import { VoiceoverPanel, type VoiceoverContext } from "./VoiceoverPanel";

interface InspectorProps {
  timeline: Timeline;
  layout: TimelineLayout;
  assets: Map<string, AssetRow>;
  selection: Selection;
  clock: PlaybackClock;
  onSelect: (selection: Selection) => void;
  onChange: (timeline: Timeline, key?: string) => void;
  /** The edit this timeline belongs to, for voiceovers in its brand voice. */
  voiceover?: VoiceoverContext | undefined;
}

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
  return (
    <Tabs
      defaultValue={
        selection?.kind === "caption" || selection?.kind === "overlay" ? "text" : "format"
      }
      className="flex h-full flex-col"
    >
      <TabsList className={`mx-3 mt-3 grid ${props.voiceover ? "grid-cols-3" : "grid-cols-2"}`}>
        <TabsTrigger value="format">Format</TabsTrigger>
        {props.voiceover && <TabsTrigger value="voice">Voiceover</TabsTrigger>}
        <TabsTrigger value="text">{props.voiceover ? "Text" : "Captions & titles"}</TabsTrigger>
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
            onChange={props.onChange}
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
          onClick={() => onChange(splitClipAt(timeline, clock.getTime()))}
        >
          <Scissors className="mr-1.5 size-3.5" /> Split at playhead (S)
        </Button>
      </Section>

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

      {clip.kind === "video" && (
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
  const plays = audioPlayLength(item, layout.total);
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
            onClick={() => set({ start: Number(clock.getTime().toFixed(2)) })}
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
            onValueChange={(value) => set({ role: value as TimelineAudio["role"] })}
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
        {item.role === "music" && (
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
          </>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Format                                                              */
/* ------------------------------------------------------------------ */

function SequenceSettings({ timeline, layout, onChange }: InspectorProps) {
  const set = (patch: Partial<Timeline>, key?: string) => onChange({ ...timeline, ...patch }, key);
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
      <Section title="Sound">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs" htmlFor="loudness">
              Balance loudness for social
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Evens the final mix to −14 LUFS, the level Instagram, TikTok and YouTube expect.
            </p>
          </div>
          <Switch
            id="loudness"
            checked={timeline.normalizeLoudness}
            onCheckedChange={(checked) => set({ normalizeLoudness: checked })}
          />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Captions and titles                                                 */
/* ------------------------------------------------------------------ */

function TextPanel({ timeline, layout, clock, selection, onSelect, onChange }: InspectorProps) {
  const captions = timeline.captions;
  const setCaptions = (patch: Partial<Timeline["captions"]>, key?: string) =>
    onChange({ ...timeline, captions: { ...captions, ...patch } }, key);
  const [script, setScript] = useState("");
  const voice = timeline.audio.find((item) => item.role === "voiceover");

  const writeFromScript = () => {
    const from = voice ? voice.start : 0.3;
    const to = voice
      ? voice.start + audioPlayLength(voice, layout.total)
      : Math.max(0.6, layout.total - 0.3);
    setCaptions({
      enabled: true,
      segments: captionsFromScript(script, from, Math.min(to, layout.total)),
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
    const at = clock.getTime();
    const overlay: Overlay = {
      id: newId(),
      text: style === "cta" ? "Shop now" : style === "subtitle" ? "Subtitle" : "Title",
      start: Number(at.toFixed(2)),
      end: Number(Math.min(layout.total || at + 2.5, at + 2.5).toFixed(2)),
      style,
      position: style === "cta" ? "bottom" : "center",
    };
    onChange({ ...timeline, overlays: [...timeline.overlays, overlay].slice(0, LIMITS.overlays) });
    onSelect({ kind: "overlay", id: overlay.id });
  };

  return (
    <div>
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
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={!script.trim() || layout.total < 0.5}
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
                setCaptions({ style: value as Timeline["captions"]["style"] })
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
    </div>
  );
}
