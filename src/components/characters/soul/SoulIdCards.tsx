import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BadgeCheck,
  CheckCircle2,
  Fingerprint,
  History,
  Loader2,
  ScanFace,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { useModels } from "@/hooks/useStudioData";
import { stillComing, useKeyedGenerations } from "@/hooks/useKeyedGenerations";
import {
  approveSoulId,
  retireSoulId,
  scoreSoulProof,
  startSoulProof,
  putSoulIdInUse,
} from "@/lib/characters.functions";
import { estimateGeneration } from "@/lib/generation.functions";
import {
  SOUL_MODEL_PATHS,
  SOUL_VERSION_LABELS,
  SOUL_VERSIONS,
  type SoulVersion,
} from "@/lib/characters/model";
import {
  PROOF_SHOTS,
  proofKeyPrefix,
  proofPrompt,
  type CharacterSoul,
} from "@/lib/characters/soul";
import { soulStillValues } from "@/lib/characters/views";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const SOURCE_COPY: Record<CharacterSoul["source"], string> = {
  trained: "Trained here",
  attached: "Found at Higgsfield",
  imported: "Imported from the account",
};

const VERDICT_TONE: Record<"strong" | "fair" | "weak", string> = {
  strong: "border-success/40 text-success",
  fair: "border-border text-foreground",
  weak: "border-warning/50 text-warning",
};

const VERSION_USE: Record<SoulVersion, string> = {
  v2: "Images of them: portraits, product shots, a video's opening still.",
  cinema: "Film-look stills of them, for cinematic openings.",
  v1: "Styled images of them.",
};

/**
 * A character's Soul IDs, one card per Soul model: the one in use, how it
 * came about, and its likeness proof (images from the Soul ID alone, scored
 * against what it was trained on, for a person to approve). Earlier Soul IDs
 * stay listed, to use again.
 */
export function SoulIdCards({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const active = character.souls.filter((soul) => soul.active);
  const retired = character.souls.filter((soul) => !soul.active);
  const [showRetired, setShowRetired] = useState(false);
  if (!character.souls.length)
    return (
      <p
        className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        data-testid="soul-none"
      >
        No Soul ID yet. Pick what it's trained on below, check it, then train it.
      </p>
    );
  return (
    <div className="space-y-2" data-testid="soul-id-cards">
      <div className="grid gap-2 lg:grid-cols-2">
        {SOUL_VERSIONS.flatMap((version) => {
          const soul = active.find((entry) => entry.version === version);
          return soul
            ? [<SoulCard key={soul.id} soul={soul} character={character} canEdit={canEdit} />]
            : [];
        })}
      </div>
      {retired.length > 0 && (
        <div className="text-xs">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShowRetired((value) => !value)}
          >
            <History className="size-3.5" /> {showRetired ? "Hide" : "Show"} earlier Soul IDs (
            {retired.length})
          </button>
          {showRetired && (
            <ul className="mt-2 space-y-1">
              {retired.map((soul) => (
                <RetiredSoul key={soul.id} soul={soul} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RetiredSoul({ soul, canEdit }: { soul: CharacterSoul; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
      <span className="min-w-0 truncate">
        {SOUL_VERSION_LABELS[soul.version]} · {SOURCE_COPY[soul.source]} ·{" "}
        {formatDistanceToNow(new Date(soul.readyAt), { addSuffix: true })}
        {soul.likeness ? ` · likeness ${soul.likeness.score.toFixed(1)}` : ""}
      </span>
      {canEdit && !soul.id.startsWith("legacy:") && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await putSoulIdInUse({ data: { soulId: soul.id } });
              toast.success(`Back in use for ${SOUL_VERSION_LABELS[soul.version]}`);
            } catch (cause) {
              toast.error(cause instanceof Error ? cause.message : "It couldn't be used");
            } finally {
              setBusy(false);
              void queryClient.invalidateQueries({ queryKey: ["characters"] });
            }
          }}
        >
          Use again
        </Button>
      )}
    </li>
  );
}

function SoulCard({
  soul,
  character,
  canEdit,
}: {
  soul: CharacterSoul;
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: models = [] } = useModels();
  const legacy = soul.id.startsWith("legacy:");
  const { data: proofs = [], isLoading } = useKeyedGenerations(
    ["soul-proof", soul.id],
    proofKeyPrefix(soul.id),
    { enabled: !legacy, limit: 16 },
  );
  // The latest proof (one round of shots).
  const round = proofs[0]?.key.split(":")[2] ?? null;
  const latest = proofs.filter((entry) => entry.key.split(":")[2] === round);
  const making = latest.some(stillComing);
  const images = latest.flatMap((entry) => entry.assets);
  const scoredIds = new Set(soul.likeness?.assetIds ?? []);
  const scoredLatest = images.length > 0 && images.every((asset) => scoredIds.has(asset.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [quote, setQuote] = useState<number | null>(null);
  const lock = useRef(false);
  const model =
    models.find(
      (entry) => entry.is_active && entry.model_path === SOUL_MODEL_PATHS[soul.version],
    ) ?? null;

  // Scored as soon as the proof's images are in (free), once per proof.
  const autoScored = useRef<string | null>(null);
  useEffect(() => {
    if (!round || making || !images.length || scoredLatest || autoScored.current === round) return;
    autoScored.current = round;
    void act("score", () => scoreSoulProof({ data: { soulId: soul.id } }), "Likeness scored");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, making, images.length, scoredLatest]);

  async function act(name: string, run: () => Promise<unknown>, done?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    try {
      await run();
      if (done) toast.success(done);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work");
    } finally {
      lock.current = false;
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
      void queryClient.invalidateQueries({ queryKey: ["soul-proof", soul.id] });
    }
  }

  async function openProof() {
    setConfirming(true);
    setQuote(null);
    if (!model) return;
    try {
      const result = await estimateGeneration({
        data: {
          modelId: model.id,
          parameters: {
            ...soulStillValues(model, 3 / 4, soul.referenceId),
            prompt: proofPrompt(PROOF_SHOTS[0]),
          },
          inputs: [],
        },
      });
      if (result.ok && result.costUsd != null) setQuote(result.costUsd * PROOF_SHOTS.length);
    } catch {
      /* no quote: the dialog says so */
    }
  }

  const likeness = soul.likeness;
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`soul-card-${soul.version}`}>
      <div className="flex items-start gap-2">
        {soul.thumbnailUrl ? (
          <img
            src={soul.thumbnailUrl}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover"
            referrerPolicy="no-referrer"
            onError={(event) => (event.currentTarget.style.display = "none")}
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Fingerprint className="size-5 text-primary" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{SOUL_VERSION_LABELS[soul.version]}</span>
            <Badge variant="outline" className="border-success/40 text-[10px] text-success">
              <CheckCircle2 className="mr-1 size-3" /> In use
            </Badge>
            {soul.approvedAt && (
              <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
                <ShieldCheck className="mr-1 size-3" /> Approved
              </Badge>
            )}
            {likeness && (
              <Badge
                variant="outline"
                className={cn("text-[10px]", VERDICT_TONE[likeness.verdict])}
              >
                Likeness {likeness.score.toFixed(1)}/10
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {SOURCE_COPY[soul.source]}
            {soul.imageCount ? ` on ${soul.imageCount} images` : ""} ·{" "}
            {formatDistanceToNow(new Date(soul.readyAt), { addSuffix: true })}.{" "}
            {VERSION_USE[soul.version]}
          </p>
        </div>
      </div>

      {!legacy && (latest.length > 0 || isLoading) && (
        <div className="grid grid-cols-4 gap-1.5">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="aspect-[3/4]" />
              ))
            : latest
                .slice()
                .sort((a, b) => a.key.localeCompare(b.key))
                .map((entry) => {
                  const asset = entry.assets[0];
                  const scored = asset
                    ? likeness?.perImage.find((item) => item.assetId === asset.id)
                    : null;
                  return (
                    <div
                      key={entry.generationId}
                      className="relative aspect-[3/4] overflow-hidden rounded bg-muted"
                    >
                      {asset ? (
                        <MediaPreview
                          bucket={asset.storage_bucket}
                          path={asset.storage_path}
                          type="image"
                        />
                      ) : stillComing(entry) ? (
                        <div className="flex size-full items-center justify-center">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="flex size-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                          Not made
                        </div>
                      )}
                      {scored && (
                        <span
                          className={cn(
                            "absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[10px] font-medium",
                            scored.score >= 7.5
                              ? "text-success"
                              : scored.score >= 5.5
                                ? ""
                                : "text-warning",
                          )}
                          title={scored.notes}
                        >
                          {scored.score.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
        </div>
      )}
      {likeness?.summary && <p className="text-[11px] text-muted-foreground">{likeness.summary}</p>}

      {canEdit && !legacy && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={likeness ? "ghost" : "outline"}
            className="h-7"
            disabled={!!busy || making || !model}
            onClick={() => void openProof()}
            data-testid={`soul-prove-${soul.version}`}
          >
            {making || busy === "prove" ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <ScanFace className="mr-1.5 size-3.5" />
            )}
            {making ? "Making proof…" : likeness ? "Prove again" : "Prove likeness"}
          </Button>
          {images.length > 0 && !making && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={!!busy}
              onClick={() =>
                void act(
                  "score",
                  () => scoreSoulProof({ data: { soulId: soul.id } }),
                  "Likeness scored",
                )
              }
            >
              {busy === "score" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              Score again
            </Button>
          )}
          <Button
            size="sm"
            variant={soul.approvedAt ? "ghost" : "outline"}
            className="h-7"
            disabled={!!busy}
            onClick={() =>
              void act(
                "approve",
                () => approveSoulId({ data: { soulId: soul.id, approved: !soul.approvedAt } }),
                soul.approvedAt ? "Approval taken back" : "Likeness approved",
              )
            }
          >
            <BadgeCheck className="mr-1.5 size-3.5" />
            {soul.approvedAt ? "Unapprove" : "Approve likeness"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            disabled={!!busy}
            onClick={() =>
              void act(
                "retire",
                () => retireSoulId({ data: { soulId: soul.id } }),
                "No longer in use",
              )
            }
          >
            Stop using
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prove {character.name}'s likeness?</AlertDialogTitle>
            <AlertDialogDescription>
              {SOUL_VERSION_LABELS[soul.version]} makes {PROOF_SHOTS.length} images of them from the
              Soul ID alone (a portrait, a smile outdoors, an office shot and a profile), then the
              studio's AI scores each against the images it was trained on.{" "}
              {quote != null ? `About $${quote.toFixed(2)} in all.` : "Billed like any generation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setConfirming(false);
                void act(
                  "prove",
                  () => startSoulProof({ data: { soulId: soul.id } }),
                  "Making the proof images",
                );
              }}
            >
              Make proof
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
