import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useModels } from "@/hooks/useStudioData";
import type { Picture } from "@/lib/media/compose";
import {
  artworkPainter,
  checkPainting,
  discardPainting,
  findUnusedPainting,
  painterAspect,
  paintingTitle,
  prepareArtworkGuide,
  quoteArtworkExtension,
  saveExtension,
  startArtworkExtension,
  waitForPainting,
  type ArtworkGuide,
  type CheckedPainting,
  type Painting,
  type UnusedPainting,
} from "@/lib/media/extend-artwork";
import { Button } from "@/components/ui/button";
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

type Step =
  | { kind: "idle" }
  | { kind: "pricing" }
  | {
      kind: "confirm";
      guide: ArtworkGuide & { pad: string };
      costUsd: number | null;
      description: string | null;
    }
  | { kind: "painting" }
  | { kind: "checking" }
  | { kind: "review"; checked: CheckedPainting; url: string }
  | { kind: "saving" };

/**
 * Offers to extend designed artwork to the video's shape with an image model
 * (see lib/media/extend-artwork): priced first, started only once confirmed,
 * checked, and shown before it is used. A painting paid for but never used
 * is offered again, at no cost.
 */
export function ArtworkExtender({
  finisherAssetId,
  picture,
  frame,
  scale,
  title,
  projectId,
  campaignId,
  onExtended,
}: {
  finisherAssetId: string;
  /** The artwork as uploaded, once loaded. */
  picture: Picture | null;
  /** The video's frame. */
  frame: { width: number; height: number };
  /** The artwork's size on the card, as set (null: as large as the frame allows). */
  scale: number | null;
  /** What the new files are named after. */
  title: string;
  projectId: string | null;
  campaignId: string | null;
  onExtended: (assetId: string) => void;
}) {
  const { user } = useAuth();
  const { data: models = [] } = useModels();
  const painter = artworkPainter(models);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [unused, setUnused] = useState<UnusedPainting | null>(null);
  const [lookedUp, setLookedUp] = useState(0);

  // A painting already paid for that was never used (its page closed while it was made).
  const { width: frameWidth, height: frameHeight } = frame;
  useEffect(() => {
    let current = true;
    findUnusedPainting(finisherAssetId, { width: frameWidth, height: frameHeight })
      .then((found) => current && setUnused(found))
      .catch(() => current && setUnused(null));
    return () => {
      current = false;
    };
  }, [finisherAssetId, frameWidth, frameHeight, lookedUp]);

  // The preview's picture is let go once it's no longer shown.
  const previewUrl = step.kind === "review" ? step.url : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!painter) return null;
  const shape = painterAspect(painter.model, frame) ?? `${frame.width}×${frame.height}`;
  const busy = step.kind !== "idle" && step.kind !== "confirm" && step.kind !== "review";
  const named = paintingTitle(title, painter, frame);

  async function price() {
    if (!picture || !user || !painter) return;
    setProblem(null);
    setStep({ kind: "pricing" });
    try {
      const guide = await prepareArtworkGuide({
        picture,
        frame,
        scale,
        finisherAssetId,
        userId: user.id,
        projectId,
        title,
      });
      const quote = await quoteArtworkExtension(painter, guide);
      if (!quote.ok) throw new Error(quote.message);
      setStep({ kind: "confirm", guide, costUsd: quote.costUsd, description: quote.description });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "It couldn't be priced");
      setStep({ kind: "idle" });
    }
  }

  /** Checks a painting and shows what it makes, or says why it can't be used. */
  async function check(input: { guide: ArtworkGuide; painting: Painting; generationId: string }) {
    if (!picture) return;
    setStep({ kind: "checking" });
    const checked = await checkPainting({ picture, frame, title: named, ...input });
    if (!checked.result) {
      setProblem(
        `${checked.problem}, so it isn't used (it's in your library). Try again (each try is billed), or keep the standard end card.`,
      );
      setStep({ kind: "idle" });
      setLookedUp((count) => count + 1);
      return;
    }
    setStep({ kind: "review", checked, url: URL.createObjectURL(checked.result.blob) });
  }

  async function extend(guide: ArtworkGuide & { pad: string }, costUsd: number | null) {
    if (!picture || !user || !painter) return;
    setStep({ kind: "painting" });
    try {
      const generationId = await startArtworkExtension({
        painter,
        guide,
        costUsd,
        projectId,
        campaignId,
      });
      const painting = await waitForPainting(generationId);
      await check({ guide, painting, generationId });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "It couldn't be extended");
      setStep({ kind: "idle" });
      setLookedUp((count) => count + 1);
    }
  }

  async function resume(found: UnusedPainting) {
    setProblem(null);
    try {
      await check(found);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The painting couldn't be checked");
      setStep({ kind: "idle" });
    }
  }

  async function use(checked: CheckedPainting) {
    if (!user) return;
    setStep({ kind: "saving" });
    try {
      const assetId = await saveExtension({
        checked,
        finisherAssetId,
        painter,
        frame,
        userId: user.id,
        projectId,
        title,
      });
      onExtended(assetId);
      toast.success(`The artwork now fills the ${shape} frame, your own artwork laid over it.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "It couldn't be saved");
    } finally {
      setStep({ kind: "idle" });
      setLookedUp((count) => count + 1);
    }
  }

  async function discard(checked: CheckedPainting) {
    setStep({ kind: "idle" });
    await discardPainting(checked);
    setLookedUp((count) => count + 1);
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border px-2.5 py-2">
      {unused && step.kind === "idle" && (
        <div
          className="flex flex-wrap items-center gap-2 rounded bg-primary/5 px-2 py-1.5 text-[11px]"
          data-testid="finisher-extend-unused"
        >
          <span>
            A painting made for this artwork{" "}
            {formatDistanceToNow(new Date(unused.createdAt), { addSuffix: true })} hasn't been used
            yet.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={!picture}
            onClick={() => void resume(unused)}
          >
            Check and use it (free)
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!picture || !user || busy}
          onClick={() => void price()}
          data-testid="finisher-extend-ai"
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 size-3.5 text-primary" />
          )}
          {step.kind === "pricing"
            ? "Pricing…"
            : step.kind === "painting"
              ? "Painting the background…"
              : step.kind === "checking"
                ? "Checking the painting…"
                : step.kind === "saving"
                  ? "Saving…"
                  : `Extend to ${shape} with AI`}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Billed; you'll see the price first.
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {painter.model.display_name} paints the artwork's background out to the video's {shape}{" "}
        frame. The painting is checked, your own artwork is laid back over it exactly (no letter or
        logo is redrawn), and you see the result before it's used.
        {step.kind === "painting" ? " Painting usually takes under a minute." : ""}
      </p>
      {problem && <p className="text-[11px] text-primary">{problem}</p>}

      <AlertDialog
        open={step.kind === "confirm"}
        onOpenChange={(open) =>
          !open && setStep((current) => (current.kind === "confirm" ? { kind: "idle" } : current))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extend the artwork to {shape} with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              {painter.model.display_name} paints its background out to the video's shape. You see
              the result before it's used, with your own artwork laid back over it exactly; a
              painting that changed your artwork or left part of the frame empty isn't used.{" "}
              {step.kind === "confirm" && step.costUsd !== null
                ? `Estimated cost: $${step.costUsd.toFixed(2)} (Higgsfield's list price).`
                : step.kind === "confirm" && step.description
                  ? `Higgsfield's price: ${step.description}`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (step.kind === "confirm") void extend(step.guide, step.costUsd);
              }}
              data-testid="finisher-extend-confirm"
            >
              {step.kind === "confirm" && step.costUsd !== null
                ? `Extend for $${step.costUsd.toFixed(2)}`
                : "Extend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Its buttons decide for themselves (and keep it from closing on its own);
          closing it any other way is not using it. */}
      <AlertDialog
        open={step.kind === "review"}
        onOpenChange={(open) => {
          if (!open && step.kind === "review") void discard(step.checked);
        }}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Use this for the end card?</AlertDialogTitle>
            <AlertDialogDescription>
              The background painted out to {shape}, with your own artwork laid back over it
              exactly. If you don't use it, it stays in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {step.kind === "review" && (
            <div className="flex justify-center rounded-md bg-muted/40 p-2">
              <img
                src={step.url}
                alt="The artwork extended to the video's shape"
                className="max-h-[55vh] w-auto rounded object-contain"
                data-testid="finisher-extend-preview"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(event) => {
                event.preventDefault();
                if (step.kind === "review") void discard(step.checked);
              }}
              data-testid="finisher-extend-discard"
            >
              Don't use it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (step.kind === "review") void use(step.checked);
              }}
              data-testid="finisher-extend-use"
            >
              Use it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
