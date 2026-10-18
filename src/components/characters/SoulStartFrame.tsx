import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCharacters, type CharacterEntry } from "@/hooks/useCharacters";
import { useModels, type AssetRow } from "@/hooks/useStudioData";
import { useKeyedGenerations } from "@/hooks/useKeyedGenerations";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { SOUL_MODEL_PATHS, SOUL_VERSION_LABELS } from "@/lib/characters/model";
import { pickSoul, soulStillPrompt } from "@/lib/characters/soul";
import { soulStillValues } from "@/lib/characters/views";
import { CharacterAvatar } from "@/components/characters/CharacterPicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Width over height from an aspect ratio like "9:16" (16:9 when it can't be read). */
function ratioOf(aspect: unknown): number {
  const match =
    typeof aspect === "string" ? /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect) : null;
  const ratio = match ? Number(match[1]) / Number(match[2]) : NaN;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
}

/**
 * A video's start frame painted from a character's Soul ID: their trained
 * likeness on its Soul model, in the scene the prompt describes, at the
 * video's shape. Video models can't take a Soul ID themselves, so the
 * likeness reaches the clip through the frame it starts from. One billed
 * image; it lands in the library and is attached as the start frame.
 */
export function SoulStartFrame({
  prompt,
  aspectRatio,
  projectId,
  onReady,
}: {
  prompt: string;
  aspectRatio: unknown;
  projectId: string | null;
  onReady: (asset: AssetRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: characters = [] } = useCharacters({ enabled: open });
  const { data: models = [] } = useModels();
  const withSoul = characters.flatMap((character) => {
    const soul = pickSoul(character.souls, { look: "image" });
    const model = soul
      ? models.find(
          (entry) => entry.is_active && entry.model_path === SOUL_MODEL_PATHS[soul.version],
        )
      : null;
    return soul && model ? [{ character, soul, model }] : [];
  });
  const [chosen, setChosen] = useState<CharacterEntry | null>(null);
  const [quote, setQuote] = useState<number | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const delivered = useRef<string | null>(null);
  const pick = withSoul.find((entry) => entry.character.id === chosen?.id) ?? null;
  const ratio = ratioOf(aspectRatio);

  function request() {
    if (!pick) return null;
    return {
      modelId: pick.model.id,
      parameters: {
        ...soulStillValues(pick.model, ratio, pick.soul.referenceId),
        prompt: soulStillPrompt(prompt, pick.character),
      },
      inputs: [] as { assetId: string; role: string; position: number }[],
    };
  }

  useEffect(() => {
    let current = true;
    const sample = request();
    setQuote(null);
    if (!sample) return;
    estimateGeneration({ data: sample })
      .then((result) => current && setQuote(result.ok ? result.costUsd : null))
      .catch(() => undefined);
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.character.id, pick?.model.id, ratio]);

  const { data: made = [] } = useKeyedGenerations(["soul-start", key], key ?? "none", {
    enabled: !!key,
    limit: 1,
  });
  const result = made[0];
  const painting =
    !!key &&
    (!result || (!result.assets.length && !result.errorMessage && result.status !== "failed"));
  useEffect(() => {
    const asset = result?.assets[0];
    if (!asset || !key || delivered.current === key) return;
    delivered.current = key;
    onReady(asset);
    toast.success("Start frame attached: the clip starts from their likeness.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.assets[0]?.id, key]);
  useEffect(() => {
    if (result && !result.assets.length && ["failed", "nsfw", "canceled"].includes(result.status))
      toast.error(result.errorMessage ?? "The start frame couldn't be painted");
  }, [result?.status, result]);

  async function paint() {
    const sample = request();
    if (!sample || starting) return;
    setStarting(true);
    const next = `soulstart:${crypto.randomUUID()}`;
    try {
      await submitGeneration({
        data: {
          ...sample,
          projectId,
          clientRequestId: next,
          estimatedCostUsd: quote,
        },
      });
      setKey(next);
      setOpen(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The start frame couldn't be painted");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={painting}
        >
          {painting ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <Fingerprint className="mr-1 size-3.5" />
          )}
          {painting ? "Painting start frame…" : "Start frame from Soul ID"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-2">
        <p className="px-1 text-[11px] text-muted-foreground">
          Paints the clip's first frame from a character's Soul ID, in the scene your prompt
          describes, at the video's shape. The video then starts from their trained likeness.
        </p>
        {withSoul.map(({ character, soul }) => (
          <button
            key={character.id}
            type="button"
            onClick={() => setChosen(character)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${chosen?.id === character.id ? "bg-muted" : ""}`}
          >
            <CharacterAvatar character={character} className="size-7" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{character.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {SOUL_VERSION_LABELS[soul.version]}
                {soul.likeness ? ` · likeness ${soul.likeness.score.toFixed(1)}` : ""}
                {soul.approvedAt ? " · approved" : ""}
              </span>
            </span>
          </button>
        ))}
        {!withSoul.length && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No character has a Soul ID yet.{" "}
            <Link to="/characters" className="underline underline-offset-2">
              Train one
            </Link>
            .
          </p>
        )}
        {pick && (
          <Button
            size="sm"
            className="h-8 w-full"
            disabled={starting || !prompt.trim()}
            onClick={() => void paint()}
          >
            {starting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Paint {pick.character.name}'s start frame
            {quote != null ? ` · about $${quote.toFixed(2)}` : ""}
          </Button>
        )}
        {pick && !prompt.trim() && (
          <p className="px-1 text-[11px] text-muted-foreground">
            Describe the scene in the prompt first.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
