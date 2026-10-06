import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { useMusicStatus } from "@/hooks/useMusicData";
import { generateMusicTrack } from "@/lib/music.functions";
import {
  DEFAULT_MUSIC_MODEL,
  MUSIC_GENRES,
  MUSIC_LENGTH,
  MUSIC_LICENSES,
  MUSIC_MODELS,
  MUSIC_MOODS,
  musicPrompt,
} from "@/lib/music/catalog";
import { cn } from "@/lib/utils";

export type GeneratedTrack = Awaited<ReturnType<typeof generateMusicTrack>>;

/**
 * Original music to a brief with Eleven Music: pick a style, mood, tempo and
 * length (or write the prompt yourself), and the track lands in the library.
 */
export function GenerateMusic({
  seconds: initialSeconds = 30,
  direction = "",
  projectId = null,
  campaignId = null,
  compact = false,
  onGenerated,
}: {
  seconds?: number;
  direction?: string;
  projectId?: string | null;
  campaignId?: string | null;
  compact?: boolean;
  onGenerated?: (track: GeneratedTrack) => void;
}) {
  const queryClient = useQueryClient();
  const { data: status } = useMusicStatus();
  const [genre, setGenre] = useState<string>("Electronic");
  const [mood, setMood] = useState<string>("Upbeat");
  const [bpm, setBpm] = useState<number | null>(120);
  const [instruments, setInstruments] = useState("");
  const [vocals, setVocals] = useState(false);
  const [notes, setNotes] = useState(direction);
  const [seconds, setSeconds] = useState(() =>
    Math.round(Math.max(MUSIC_LENGTH.min, Math.min(MUSIC_LENGTH.max, initialSeconds))),
  );
  const [model, setModel] = useState<string>(DEFAULT_MUSIC_MODEL);
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setNotes(direction), [direction]);

  const built = useMemo(
    () => musicPrompt({ genre, mood, bpm, instruments, vocals, notes, seconds }),
    [genre, mood, bpm, instruments, vocals, notes, seconds],
  );
  const prompt = custom ?? built;

  async function generate() {
    setBusy(true);
    try {
      const made = await generateMusicTrack({
        data: {
          prompt,
          title: title.trim() || `${mood} ${genre.toLowerCase()} · ${seconds}s`,
          seconds,
          model: model as never,
          instrumental: !vocals,
          genres: [genre],
          moods: [mood],
          bpm,
          seed: null,
          clientRequestId: crypto.randomUUID(),
          projectId,
          campaignId,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
      toast.success("Music ready in the library");
      onGenerated?.(made);
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
      toast.error(error instanceof Error ? error.message : "The music could not be made");
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.elevenlabs) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
        <p className="font-medium">Eleven Music isn't connected.</p>
        <p className="mt-1 text-muted-foreground">
          Add an <code>ELEVENLABS_API_KEY</code> to the backend secrets to make original music for
          any brief, at any length, instrumental or with vocals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="generate-music">
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        <div className="space-y-1">
          <Label className="text-xs">Style</Label>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger className="h-8 text-xs" aria-label="Music style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUSIC_GENRES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Mood</Label>
          <Select value={mood} onValueChange={setMood}>
            <SelectTrigger className="h-8 text-xs" aria-label="Mood">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUSIC_MOODS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tempo</Label>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setBpm(bpm === null ? 120 : null)}
            >
              {bpm === null ? "Set" : `${bpm} BPM · auto`}
            </button>
          </div>
          {bpm !== null ? (
            <Slider
              min={60}
              max={180}
              step={1}
              value={[bpm]}
              onValueChange={([value]) => setBpm(value ?? 120)}
              aria-label="Tempo in BPM"
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">Let the style decide</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Length (s)</Label>
          <Input
            type="number"
            min={MUSIC_LENGTH.min}
            max={MUSIC_LENGTH.max}
            value={seconds}
            onChange={(event) =>
              setSeconds(
                Math.round(
                  Math.max(
                    MUSIC_LENGTH.min,
                    Math.min(MUSIC_LENGTH.max, Number(event.target.value) || 30),
                  ),
                ),
              )
            }
            className="h-8 text-xs"
            aria-label="Length in seconds"
          />
        </div>
      </div>
      <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
        <Input
          value={instruments}
          onChange={(event) => setInstruments(event.target.value.slice(0, 200))}
          placeholder="Instruments (optional): punchy kick, bright piano…"
          className="h-8 text-xs"
          aria-label="Instruments"
        />
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, 200))}
          placeholder="Track name (optional)"
          className="h-8 text-xs"
          aria-label="Track name"
        />
      </div>
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value.slice(0, 600))}
        placeholder="Direction (optional): builds to a drop at 8 s, ends on a stinger…"
        className="min-h-[56px] text-xs"
        aria-label="Music direction"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          <Switch checked={vocals} onCheckedChange={setVocals} aria-label="With vocals" /> With
          vocals
        </label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="h-7 w-auto gap-1 text-[11px]" aria-label="Music model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MUSIC_MODELS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <details
        className="rounded-md border border-border p-2 text-xs"
        onToggle={(event) => !(event.target as HTMLDetailsElement).open && setCustom(null)}
      >
        <summary className="cursor-pointer text-muted-foreground">
          Prompt sent to Eleven Music
        </summary>
        <Textarea
          value={prompt}
          onChange={(event) => setCustom(event.target.value.slice(0, 2000))}
          className="mt-2 min-h-[80px] text-xs"
          aria-label="Prompt"
        />
      </details>
      <Button
        className="w-full"
        onClick={() => void generate()}
        disabled={busy || prompt.trim().length < 10}
        data-testid="generate-music-button"
      >
        {busy ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 size-4" />
        )}
        {busy ? "Composing… (up to a minute or two)" : `Make ${seconds}s of music`}
      </Button>
      <p className="text-[11px] text-muted-foreground">{MUSIC_LICENSES.ai_generated.note}</p>
    </div>
  );
}
