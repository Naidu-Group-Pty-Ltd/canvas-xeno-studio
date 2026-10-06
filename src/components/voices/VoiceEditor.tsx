import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Loader2,
  Mic,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import { playBase64, playUrl, useVoiceStatus } from "@/hooks/useVoiceData";
import {
  addElevenLabsLibraryVoice,
  cloneElevenLabsVoice,
  designElevenLabsVoice,
  listElevenLabsVoices,
  previewVoice,
  saveBrandVoice,
  saveDesignedVoice,
} from "@/lib/voice.functions";
import {
  DEFAULT_ELEVENLABS_MODEL,
  DELIVERY_PRESETS,
  ELEVENLABS_MODELS,
  elevenLabsFullSettings,
  OPENAI_TTS_MODEL,
  OPENAI_VOICES,
  type BrandVoiceRow,
  type Pronunciation,
  type VoiceProvider,
} from "@/lib/voice/catalog";
import { uploadReference } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

interface VoiceDraft {
  name: string;
  description: string;
  provider: VoiceProvider;
  providerVoiceId: string;
  providerVoiceName: string;
  model: string;
  instructions: string;
  speed: number;
  stability: number;
  similarity: number;
  style: number;
  speakerBoost: boolean;
  seed: number | null;
  language: string;
  pronunciations: Pronunciation[];
  scriptGuidelines: string;
  projectId: string | null;
  source: Record<string, unknown>;
}

function draftFrom(row: BrandVoiceRow | null): VoiceDraft {
  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const number = (key: string, fallback: number) =>
    typeof settings[key] === "number" ? (settings[key] as number) : fallback;
  return {
    name: row?.name ?? "",
    description: row?.description ?? "",
    provider: row?.provider ?? "openai",
    providerVoiceId: row?.provider_voice_id ?? "marin",
    providerVoiceName:
      row?.provider === "elevenlabs"
        ? String(row.source?.["voice_name"] ?? row.provider_voice_id)
        : (row?.provider_voice_id ?? "marin"),
    model: row?.model ?? OPENAI_TTS_MODEL,
    instructions:
      typeof settings["instructions"] === "string"
        ? (settings["instructions"] as string)
        : DELIVERY_PRESETS[0].instructions,
    speed: number("speed", 1),
    stability: number("stability", 0.5),
    similarity: number("similarity_boost", 0.75),
    style: number("style", 0),
    speakerBoost: settings["use_speaker_boost"] !== false,
    seed: typeof settings["seed"] === "number" ? (settings["seed"] as number) : null,
    language: row?.language ?? "en",
    pronunciations: row?.pronunciations ?? [],
    scriptGuidelines: row?.script_guidelines ?? "",
    projectId: row?.project_id ?? null,
    source: row?.source ?? {},
  };
}

function settingsFor(draft: VoiceDraft): Record<string, unknown> {
  if (draft.provider === "openai") return { instructions: draft.instructions, speed: draft.speed };
  return {
    stability: draft.stability,
    similarity_boost: draft.similarity,
    style: draft.style,
    use_speaker_boost: draft.speakerBoost,
    speed: Math.min(1.2, Math.max(0.7, draft.speed)),
    seed: draft.seed,
  };
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
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Create or edit a brand voice: pick (or design, or clone) the voice, tune
 * how it speaks, teach it how to say brand names, and set the rules scripts
 * for it should follow.
 */
export function VoiceEditor({
  open,
  onOpenChange,
  voice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voice: BrandVoiceRow | null;
}) {
  const queryClient = useQueryClient();
  const { data: status } = useVoiceStatus();
  const { data: projects = [] } = useProjects();
  const [draft, setDraft] = useState<VoiceDraft>(() => draftFrom(voice));
  const [sample, setSample] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(voice));
      setSample("");
    }
  }, [open, voice]);

  const set = (patch: Partial<VoiceDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const sampleText =
    sample.trim() ||
    `Hi, I'm the voice of ${draft.name.trim() || "your brand"}. This is how every video in this campaign will sound.`;

  async function listen() {
    setPreviewing(true);
    try {
      const result = await previewVoice({
        data: {
          text: sampleText.slice(0, 400),
          draft: {
            provider: draft.provider,
            providerVoiceId: draft.providerVoiceId,
            model: draft.provider === "openai" ? OPENAI_TTS_MODEL : draft.model,
            settings: settingsFor(draft),
            pronunciations: draft.pronunciations,
            language: draft.language || null,
          },
        },
      });
      playBase64(result.audioBase64, result.mime);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The preview could not be made");
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveBrandVoice({
        data: {
          id: voice?.id ?? null,
          voice: {
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            provider: draft.provider,
            providerVoiceId: draft.providerVoiceId,
            model: draft.provider === "openai" ? OPENAI_TTS_MODEL : draft.model,
            settings: settingsFor(draft),
            language: draft.language.trim() || null,
            pronunciations: draft.pronunciations.filter(
              (rule) => rule.term.trim() && rule.say.trim(),
            ),
            scriptGuidelines: draft.scriptGuidelines.trim() || null,
            projectId: draft.projectId,
            source: { ...draft.source, voice_name: draft.providerVoiceName },
          },
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brand_voices"] }),
        queryClient.invalidateQueries({ queryKey: ["brand-voice-for"] }),
      ]);
      toast.success(voice ? "Voice updated" : "Brand voice saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The voice could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{voice ? `Edit ${voice.name}` : "New brand voice"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
          <div className="space-y-3">
            <Tabs
              value={draft.provider}
              onValueChange={(value) =>
                set(
                  value === "openai"
                    ? {
                        provider: "openai",
                        providerVoiceId: "marin",
                        providerVoiceName: "marin",
                        model: OPENAI_TTS_MODEL,
                        source: {},
                      }
                    : {
                        provider: "elevenlabs",
                        providerVoiceId: "",
                        providerVoiceName: "",
                        model: DEFAULT_ELEVENLABS_MODEL,
                        source: {},
                      },
                )
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="openai">OpenAI voices</TabsTrigger>
                <TabsTrigger value="elevenlabs">
                  ElevenLabs{status && !status.elevenlabs ? " (not connected)" : ""}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="openai" className="space-y-3">
                {status && !status.openai && (
                  <p className="text-xs text-destructive">
                    OpenAI isn't configured, so these voices can't speak yet.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {OPENAI_VOICES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        set({
                          providerVoiceId: option.id,
                          providerVoiceName: option.id,
                          source: {},
                        })
                      }
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                        draft.providerVoiceId === option.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      <span className="block font-medium capitalize">{option.id}</span>
                      <span className="block text-[11px] text-muted-foreground">{option.note}</span>
                    </button>
                  ))}
                </div>
                <Field label="Delivery">
                  <Select
                    value={
                      DELIVERY_PRESETS.find((preset) => preset.instructions === draft.instructions)
                        ?.id ?? "custom"
                    }
                    onValueChange={(value) => {
                      const preset = DELIVERY_PRESETS.find((entry) => entry.id === value);
                      if (preset) set({ instructions: preset.instructions });
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="How it speaks" hint="Used for every voiceover">
                  <Textarea
                    value={draft.instructions}
                    onChange={(event) => set({ instructions: event.target.value.slice(0, 1000) })}
                    className="min-h-[70px] text-xs"
                  />
                </Field>
                <Field label="Pace" hint={`${draft.speed.toFixed(2)}×`}>
                  <Slider
                    min={0.7}
                    max={1.3}
                    step={0.05}
                    value={[draft.speed]}
                    onValueChange={([value]) => set({ speed: value ?? 1 })}
                    aria-label="Speaking pace"
                  />
                </Field>
              </TabsContent>
              <TabsContent value="elevenlabs" className="space-y-3">
                {status && !status.elevenlabs ? (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                    <p className="font-medium">ElevenLabs isn't connected.</p>
                    <p className="mt-1 text-muted-foreground">
                      Add an <code>ELEVENLABS_API_KEY</code> to the project's backend secrets to use
                      its voice library, design a voice from a description, or clone a voice with
                      the speaker's consent.
                    </p>
                  </div>
                ) : (
                  <ElevenLabsPicker draft={draft} onPick={(patch) => set(patch)} />
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(event) => set({ name: event.target.value.slice(0, 120) })}
                placeholder="Fizz brand voice"
              />
            </Field>
            <Field label="Persona" hint="Who this voice is">
              <Textarea
                value={draft.description}
                onChange={(event) => set({ description: event.target.value.slice(0, 1000) })}
                placeholder="Warm, witty Australian woman in her early 30s. Talks to Gen Z like a smart older sister."
                className="min-h-[60px] text-xs"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Language">
                <Input
                  value={draft.language}
                  onChange={(event) => set({ language: event.target.value.slice(0, 20) })}
                  placeholder="en-AU"
                  className="h-8"
                />
              </Field>
              <Field label="Brand / project">
                <Select
                  value={draft.projectId ?? "none"}
                  onValueChange={(value) => set({ projectId: value === "none" ? null : value })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <PronunciationList
              rules={draft.pronunciations}
              onChange={(pronunciations) => set({ pronunciations })}
            />
            <Field label="Script guidelines" hint="For scripts written for this voice">
              <Textarea
                value={draft.scriptGuidelines}
                onChange={(event) => set({ scriptGuidelines: event.target.value.slice(0, 2000) })}
                placeholder="Short sentences. Always say “Fizz”, never “the product”. No exclamation marks. End on “Turn up your everyday.”"
                className="min-h-[60px] text-xs"
              />
            </Field>
            <div className="space-y-2 rounded-md border border-border p-2.5">
              <Field label="Try a line">
                <Input
                  value={sample}
                  onChange={(event) => setSample(event.target.value.slice(0, 400))}
                  placeholder={sampleText}
                  className="h-8 text-xs"
                />
              </Field>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={previewing || !draft.providerVoiceId}
                onClick={() => void listen()}
              >
                {previewing ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 size-3.5" />
                )}
                Listen
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <p className="mr-auto self-center text-[11px] text-muted-foreground">
            Voiceovers made with this voice are AI-generated; disclose that where your channels
            require it.
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !draft.name.trim() || !draft.providerVoiceId}
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {voice ? "Save changes" : "Save voice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PronunciationList({
  rules,
  onChange,
}: {
  rules: Pronunciation[];
  onChange: (rules: Pronunciation[]) => void;
}) {
  return (
    <Field label="Pronunciations" hint="Said the same way every time">
      <div className="space-y-1.5">
        {rules.map((rule, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            <Input
              value={rule.term}
              onChange={(event) =>
                onChange(
                  rules.map((item, position) =>
                    position === index ? { ...item, term: event.target.value.slice(0, 60) } : item,
                  ),
                )
              }
              placeholder="Word"
              className="h-7 text-xs"
              aria-label="Word as written"
            />
            <Input
              value={rule.say}
              onChange={(event) =>
                onChange(
                  rules.map((item, position) =>
                    position === index ? { ...item, say: event.target.value.slice(0, 120) } : item,
                  ),
                )
              }
              placeholder="Say it as"
              className="h-7 text-xs"
              aria-label="Say it as"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onChange(rules.filter((_, position) => position !== index))}
              aria-label="Remove pronunciation"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={rules.length >= 100}
          onClick={() => onChange([...rules, { term: "", say: "" }])}
        >
          <Plus className="mr-1 size-3" /> Add a word
        </Button>
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* ElevenLabs                                                          */
/* ------------------------------------------------------------------ */

interface PickedVoice {
  voiceId: string;
  name: string;
  description: string | null;
  previewUrl: string | null;
  publicOwnerId: string | null;
  meta?: string | undefined;
}

function ElevenLabsPicker({
  draft,
  onPick,
}: {
  draft: VoiceDraft;
  onPick: (patch: Partial<VoiceDraft>) => void;
}) {
  const [mode, setMode] = useState<"account" | "library" | "design" | "clone">("library");
  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-4 gap-1 rounded-md border border-border p-0.5 text-[11px]"
        role="tablist"
      >
        {(
          [
            ["library", "Library"],
            ["account", "My voices"],
            ["design", "Design"],
            ["clone", "Clone"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "rounded px-1.5 py-1",
              mode === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {draft.providerVoiceId ? (
        <p className="flex items-center gap-1.5 text-xs">
          <Check className="size-3.5 text-success" /> Using{" "}
          <span className="font-medium">{draft.providerVoiceName || draft.providerVoiceId}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Pick a voice below.</p>
      )}
      {(mode === "library" || mode === "account") && (
        <VoiceBrowser scope={mode} onPick={onPick} selected={draft.providerVoiceId} />
      )}
      {mode === "design" && <VoiceDesigner onPick={onPick} />}
      {mode === "clone" && <VoiceCloner onPick={onPick} />}
      <Field label="Model">
        <Select value={draft.model} onValueChange={(value) => onPick({ model: value })}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ELEVENLABS_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Field label="Stability" hint={draft.stability.toFixed(2)}>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[draft.stability]}
            onValueChange={([value]) => onPick({ stability: value ?? 0.5 })}
            aria-label="Stability"
          />
        </Field>
        <Field label="Similarity" hint={draft.similarity.toFixed(2)}>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[draft.similarity]}
            onValueChange={([value]) => onPick({ similarity: value ?? 0.75 })}
            aria-label="Similarity"
          />
        </Field>
        {elevenLabsFullSettings(draft.model) && (
          <>
            <Field label="Style" hint={draft.style.toFixed(2)}>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[draft.style]}
                onValueChange={([value]) => onPick({ style: value ?? 0 })}
                aria-label="Style"
              />
            </Field>
            <Field label="Pace" hint={`${draft.speed.toFixed(2)}×`}>
              <Slider
                min={0.7}
                max={1.2}
                step={0.05}
                value={[Math.min(1.2, Math.max(0.7, draft.speed))]}
                onValueChange={([value]) => onPick({ speed: value ?? 1 })}
                aria-label="Pace"
              />
            </Field>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="fixed-seed" className="text-xs">
          Same reading every time <span className="text-muted-foreground">(fixed seed)</span>
        </Label>
        <Switch
          id="fixed-seed"
          checked={draft.seed !== null}
          onCheckedChange={(checked) =>
            onPick({ seed: checked ? Math.floor(Math.random() * 4_000_000_000) : null })
          }
        />
      </div>
    </div>
  );
}

function VoiceBrowser({
  scope,
  onPick,
  selected,
}: {
  scope: "account" | "library";
  onPick: (patch: Partial<VoiceDraft>) => void;
  selected: string;
}) {
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("any");
  const [accent, setAccent] = useState("");
  const [voices, setVoices] = useState<PickedVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await listElevenLabsVoices({
        data: {
          scope,
          search,
          ...(gender !== "any" ? { gender } : {}),
          ...(accent.trim() ? { accent: accent.trim().toLowerCase() } : {}),
          page: 0,
        },
      });
      setVoices(
        result.voices.map((voice) => ({
          voiceId: voice.voiceId,
          name: voice.name,
          description: voice.description,
          previewUrl: voice.previewUrl,
          publicOwnerId: voice.publicOwnerId ?? null,
          meta:
            "gender" in voice
              ? [voice.gender, voice.age, voice.accent, voice.useCase].filter(Boolean).join(" · ")
              : (voice.category ?? undefined),
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voices could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function choose(voice: PickedVoice) {
    if (scope === "library" && voice.publicOwnerId) {
      setAdding(voice.voiceId);
      try {
        const added = await addElevenLabsLibraryVoice({
          data: { publicOwnerId: voice.publicOwnerId, voiceId: voice.voiceId, name: voice.name },
        });
        onPick({
          providerVoiceId: added.voiceId,
          providerVoiceName: voice.name,
          source: {
            kind: "library",
            library_voice_id: voice.voiceId,
            public_owner_id: voice.publicOwnerId,
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The voice could not be added");
      } finally {
        setAdding(null);
      }
      return;
    }
    onPick({
      providerVoiceId: voice.voiceId,
      providerVoiceName: voice.name,
      source: { kind: "account" },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void load()}
            placeholder={
              scope === "library" ? "warm narrator, upbeat, Australian…" : "Search my voices"
            }
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Search"}
        </Button>
      </div>
      {scope === "library" && (
        <div className="grid grid-cols-2 gap-1.5">
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any gender</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            placeholder="Accent (e.g. australian)"
            className="h-7 text-xs"
          />
        </div>
      )}
      <ul className="scroll-slim max-h-56 space-y-1 overflow-y-auto">
        {voices.map((voice) => (
          <li
            key={voice.voiceId}
            className={cn(
              "flex items-center gap-2 rounded-md border p-1.5",
              selected === voice.voiceId ? "border-primary" : "border-border",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              disabled={!voice.previewUrl}
              onClick={() => voice.previewUrl && playUrl(voice.previewUrl)}
              aria-label={`Play ${voice.name}`}
            >
              <Play className="size-3.5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{voice.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {voice.meta || voice.description || ""}
              </p>
            </div>
            <Button
              size="sm"
              variant={selected === voice.voiceId ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              disabled={adding === voice.voiceId}
              onClick={() => void choose(voice)}
            >
              {adding === voice.voiceId ? (
                <Loader2 className="size-3 animate-spin" />
              ) : selected === voice.voiceId ? (
                "Chosen"
              ) : (
                "Use"
              )}
            </Button>
          </li>
        ))}
        {!loading && !voices.length && (
          <li className="p-2 text-center text-xs text-muted-foreground">No voices found.</li>
        )}
      </ul>
    </div>
  );
}

function VoiceDesigner({ onPick }: { onPick: (patch: Partial<VoiceDraft>) => void }) {
  const [description, setDescription] = useState("");
  const [previews, setPreviews] = useState<
    { generatedVoiceId: string; audioBase64: string; mime: string }[]
  >([]);
  const [busy, setBusy] = useState<"design" | "save" | null>(null);
  const [name, setName] = useState("");

  async function design() {
    setBusy("design");
    try {
      const result = await designElevenLabsVoice({ data: { description } });
      setPreviews(result.previews);
      if (!result.previews.length) toast.error("No previews came back. Try a fuller description.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The voice could not be designed");
    } finally {
      setBusy(null);
    }
  }

  async function keep(generatedVoiceId: string) {
    setBusy("save");
    try {
      const saved = await saveDesignedVoice({
        data: { name: name.trim() || "Designed voice", description, generatedVoiceId },
      });
      onPick({
        providerVoiceId: saved.voiceId,
        providerVoiceName: name.trim() || "Designed voice",
        description,
        source: { kind: "designed", prompt: description },
      });
      toast.success("Designed voice added to ElevenLabs");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The voice could not be saved");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
        placeholder="A warm, confident Australian woman in her 30s with a bright, friendly smile in her voice and a relaxed pace."
        className="min-h-[70px] text-xs"
      />
      <Input
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 100))}
        placeholder="Name for the designed voice"
        className="h-8 text-xs"
      />
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={busy !== null || description.trim().length < 20}
        onClick={() => void design()}
      >
        {busy === "design" ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Wand2 className="mr-1.5 size-3.5" />
        )}
        Design three options
      </Button>
      {previews.map((preview, index) => (
        <div
          key={preview.generatedVoiceId}
          className="flex items-center gap-2 rounded-md border border-border p-1.5 text-xs"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => playBase64(preview.audioBase64, preview.mime)}
            aria-label={`Play option ${index + 1}`}
          >
            <Play className="size-3.5" />
          </Button>
          <span className="flex-1">Option {index + 1}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy !== null}
            onClick={() => void keep(preview.generatedVoiceId)}
          >
            {busy === "save" ? <Loader2 className="size-3 animate-spin" /> : "Keep this one"}
          </Button>
        </div>
      ))}
    </div>
  );
}

function VoiceCloner({ onPick }: { onPick: (patch: Partial<VoiceDraft>) => void }) {
  const { user } = useAuth();
  const [samples, setSamples] = useState<{ id: string; title: string | null }[]>([]);
  const [speaker, setSpeaker] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"upload" | "clone" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ready = useMemo(
    () => samples.length > 0 && consent && speaker.trim().length >= 2,
    [samples, consent, speaker],
  );

  async function upload(files: FileList | null) {
    if (!files?.length || !user) return;
    setBusy("upload");
    try {
      const added: { id: string; title: string | null }[] = [];
      for (const file of Array.from(files).slice(0, 10 - samples.length)) {
        const asset = await uploadReference(file, { userId: user.id });
        added.push({ id: asset.id, title: asset.title });
      }
      setSamples((current) => [...current, ...added]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A sample could not be uploaded");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function clone() {
    setBusy("clone");
    try {
      const result = await cloneElevenLabsVoice({
        data: {
          name: `${speaker.trim()} (brand voice)`,
          description: "",
          sampleAssetIds: samples.map((sample) => sample.id),
          consent: { confirmed: true, speakerName: speaker.trim() },
          removeBackgroundNoise: true,
        },
      });
      onPick({
        providerVoiceId: result.voiceId,
        providerVoiceName: `${speaker.trim()} (clone)`,
        source: { kind: "cloned", consent: result.consent },
      });
      toast.success("Voice cloned");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The voice could not be cloned");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">
        Upload one to ten clean recordings of the speaker (a minute or more in total, no music).
      </p>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        disabled={busy !== null || samples.length >= 10}
        onClick={() => input.current?.click()}
      >
        {busy === "upload" ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1.5 size-3.5" />
        )}
        Add recordings
      </Button>
      <input
        ref={input}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a"
        multiple
        className="hidden"
        onChange={(event) => void upload(event.target.files)}
      />
      {samples.map((sample) => (
        <p key={sample.id} className="flex items-center gap-1.5">
          <Mic className="size-3" /> {sample.title ?? "Recording"}
        </p>
      ))}
      <Input
        value={speaker}
        onChange={(event) => setSpeaker(event.target.value.slice(0, 120))}
        placeholder="Speaker's full name"
        className="h-8 text-xs"
      />
      <label className="flex items-start gap-2 rounded-md border border-border p-2">
        <Checkbox
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          className="mt-0.5"
        />
        <span>
          <ShieldCheck className="mr-1 inline size-3.5 text-success" />I confirm the speaker has
          given written consent for their voice to be cloned and used in our marketing. The
          confirmation is recorded with the voice.
        </span>
      </label>
      <Button
        size="sm"
        className="w-full"
        disabled={!ready || busy !== null}
        onClick={() => void clone()}
      >
        {busy === "clone" ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Mic className="mr-1.5 size-3.5" />
        )}
        Clone voice
      </Button>
    </div>
  );
}
