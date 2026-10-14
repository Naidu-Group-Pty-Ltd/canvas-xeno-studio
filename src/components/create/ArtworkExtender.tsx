import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useModels } from "@/hooks/useStudioData";
import type { Picture } from "@/lib/media/compose";
import {
  artworkPainter,
  finishArtworkExtension,
  painterAspect,
  prepareArtworkGuide,
  quoteArtworkExtension,
  startArtworkExtension,
  waitForPainting,
  type ArtworkGuide,
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
  | { kind: "confirm"; guide: ArtworkGuide; costUsd: number | null; description: string | null }
  | { kind: "painting" }
  | { kind: "finishing" };

/**
 * Offers to extend designed artwork to the video's shape with an image model
 * (see lib/media/extend-artwork): priced first, started only once confirmed,
 * and the artwork's own pixels laid back over the result.
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
  if (!painter) return null;
  const shape = painterAspect(painter.model, frame) ?? `${frame.width}×${frame.height}`;
  const busy = step.kind !== "idle" && step.kind !== "confirm";

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

  async function extend(guide: ArtworkGuide, costUsd: number | null) {
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
      setStep({ kind: "finishing" });
      const result = await finishArtworkExtension({
        picture,
        guide,
        painting,
        frame,
        finisherAssetId,
        generationId,
        painter,
        userId: user.id,
        projectId,
        title,
      });
      onExtended(result.assetId);
      toast.success(`The artwork now fills the ${shape} frame, your own artwork laid over it.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "It couldn't be extended");
    } finally {
      setStep({ kind: "idle" });
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border px-2.5 py-2">
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
              : step.kind === "finishing"
                ? "Laying your artwork back over it…"
                : `Extend to ${shape} with AI`}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Billed; you'll see the price first.
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {painter.model.display_name} paints the artwork's background out to the video's {shape}{" "}
        frame as part of the design. Your artwork itself is then laid back over the result exactly,
        so no letter or logo is redrawn.
        {step.kind === "painting" ? " This usually takes under a minute." : ""}
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
              {painter.model.display_name} paints its background out to the video's shape, then your
              artwork is laid back over the result exactly. If the model moves or changes your
              artwork, its result isn't used.{" "}
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
    </div>
  );
}
