import { Film, Mic, Music, RotateCcw, Volume2, VolumeX } from "lucide-react";
import {
  MIX_CHANNEL_LABELS,
  MIX_CHANNELS,
  channelOf,
  withChannel,
  type MixChannel,
  type MixChannelSettings,
  type Timeline,
} from "@/lib/edit/timeline";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<MixChannel, typeof Film> = {
  picture: Film,
  voiceover: Mic,
  audio: Music,
};

/** What a channel carries, for the line under its fader. */
function channelContents(timeline: Timeline, channel: MixChannel): string {
  if (channel === "picture") {
    const sounding = timeline.clips.filter(
      (clip) => clip.kind === "video" && clip.volume > 0,
    ).length;
    if (!timeline.clips.some((clip) => clip.kind === "video")) return "No video clips";
    return sounding
      ? `${sounding} clip${sounding === 1 ? "" : "s"} with sound`
      : "Every clip is muted";
  }
  const items = timeline.audio.filter((item) => channelOf(item.role) === channel).length;
  if (!items) return channel === "voiceover" ? "No voiceover yet" : "No music or effects yet";
  return `${items} track${items === 1 ? "" : "s"}`;
}

/**
 * The edit's three-channel mixer: the clips' own sound, the voiceover, and
 * music with sound effects. Each fader sets a level on top of every item's own
 * volume; muting keeps the level for when the channel is turned back on.
 */
export function Mixer({
  timeline,
  onChange,
}: {
  timeline: Timeline;
  onChange: (timeline: Timeline, key?: string) => void;
}) {
  const boosted = MIX_CHANNELS.some(
    (channel) => !timeline.mix[channel].muted && timeline.mix[channel].level > 1,
  );
  return (
    <div className="space-y-3" data-testid="mixer">
      {MIX_CHANNELS.map((channel) => (
        <ChannelStrip
          key={channel}
          channel={channel}
          settings={timeline.mix[channel]}
          contents={channelContents(timeline, channel)}
          onChange={(patch, key) => onChange(withChannel(timeline, channel, patch), key)}
        />
      ))}
      {boosted && (
        <p className="text-[11px] text-muted-foreground" data-testid="mixer-boost-note">
          Browsers can't play above 100%, so the preview plays the whole edit quieter to keep a
          boosted channel louder than the rest. The finished video gets the full boost.
        </p>
      )}
    </div>
  );
}

function ChannelStrip({
  channel,
  settings,
  contents,
  onChange,
}: {
  channel: MixChannel;
  settings: MixChannelSettings;
  contents: string;
  onChange: (patch: Partial<MixChannelSettings>, key?: string) => void;
}) {
  const Icon = CHANNEL_ICONS[channel];
  const label = MIX_CHANNEL_LABELS[channel];
  return (
    <div className="space-y-1.5" data-testid={`mixer-${channel}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {settings.muted ? "Muted" : `${Math.round(settings.level * 100)}%`}
        </span>
        {settings.level !== 1 && (
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label={`Reset ${label} to 100%`}
            title="Back to 100%"
            onClick={() => onChange({ level: 1 })}
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
        <Button
          size="icon"
          variant={settings.muted ? "secondary" : "ghost"}
          className={cn("size-6", settings.muted && "text-destructive")}
          aria-label={settings.muted ? `Unmute ${label}` : `Mute ${label}`}
          aria-pressed={settings.muted}
          onClick={() => onChange({ muted: !settings.muted })}
        >
          {settings.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>
      </div>
      <Slider
        min={0}
        max={2}
        step={0.05}
        value={[settings.level]}
        disabled={settings.muted}
        className={cn(settings.muted && "opacity-50")}
        onValueChange={([value]) => onChange({ level: value ?? 1 }, `mix:${channel}`)}
        aria-label={`${label} level`}
      />
      <p className="text-[11px] text-muted-foreground">{contents}</p>
    </div>
  );
}
