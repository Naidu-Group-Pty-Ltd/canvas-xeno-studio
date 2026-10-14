import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { refreshSoulId, trainSoulId } from "@/lib/characters.functions";
import {
  CHARACTER_LIMITS,
  SOUL_VERSION_LABELS,
  SOUL_VERSIONS,
  type SoulVersion,
} from "@/lib/characters/model";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const VERSION_HINTS: Record<SoulVersion, string> = {
  v2: "Soul 2: fast, high-quality images of them.",
  cinema: "Soul Cinema: film-look stills of them.",
  v1: "Soul Standard: styled images of them.",
};

/**
 * A character's Soul ID: Higgsfield trains a reusable likeness on their
 * images (billed), which its Soul models then use to make images of them.
 */
export function SoulIdPanel({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<SoulVersion>(character.soul_model_version ?? "v2");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = character.soul_status;
  const images = character.images.length;
  const active = status === "training" || status === "submitting";

  // While it trains, Higgsfield is asked now and then (the server keeps asking too).
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void refreshSoulId({ data: { characterId: character.id } })
        .then(() => queryClient.invalidateQueries({ queryKey: ["characters"] }))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [active, character.id, queryClient]);

  async function train() {
    setConfirming(false);
    setBusy(true);
    try {
      const result = await trainSoulId({
        data: { characterId: character.id, version, confirmUncertain: status === "uncertain" },
      });
      if (result.status === "uncertain")
        toast.warning(
          "Higgsfield's answer was unclear, so the training may or may not have started. Check Higgsfield before training again.",
        );
      else toast.success("Training started. It usually takes a few minutes.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The training couldn't be started");
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    }
  }

  return (
    <section className="panel space-y-3 p-4" data-testid="character-soul-id">
      <div className="flex items-start gap-2">
        <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h3 className="label-eyebrow">Soul ID</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Higgsfield's trained likeness: once trained on the character's images, its Soul model
            makes images of exactly this person from a prompt, and the studio can make their
            reference views with it. Optional; long videos keep characters consistent without it.
          </p>
        </div>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs" data-testid="character-soul-status">
        {status === "ready" && (
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-success" />
            Ready for{" "}
            {character.soul_model_version
              ? SOUL_VERSION_LABELS[character.soul_model_version]
              : "Soul"}
            {character.soul_ready_at
              ? `, trained ${formatDistanceToNow(new Date(character.soul_ready_at), { addSuffix: true })}`
              : ""}
            . Pick {character.name} under Character on that model in Create.
          </p>
        )}
        {active && (
          <p className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            Training on {character.soul_image_count ?? images} images
            {character.soul_model_version
              ? ` for ${SOUL_VERSION_LABELS[character.soul_model_version]}`
              : ""}
            . This usually takes a few minutes; you can leave this page.
          </p>
        )}
        {status === "failed" && (
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {character.soul_error ?? "The training failed."}
          </p>
        )}
        {status === "uncertain" && (
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {character.soul_error ??
              "Higgsfield's answer was unclear, so the training may or may not have started."}{" "}
            Check Higgsfield before training again, or it may be charged twice.
          </p>
        )}
        {status === "none" && (
          <p className="text-muted-foreground">
            Not trained. Best with 10–20 varied, sharp photos of the face (at least{" "}
            {CHARACTER_LIMITS.soulRecommendedImages}); this character has {images}.
          </p>
        )}
      </div>

      {canEdit && !active && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">For</Label>
            <Select value={version} onValueChange={(value) => setVersion(value as SoulVersion)}>
              <SelectTrigger className="h-9 w-44" aria-label="Which Soul model it's for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOUL_VERSIONS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {SOUL_VERSION_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant={status === "ready" ? "outline" : "default"}
            className="h-9"
            disabled={busy || images < CHARACTER_LIMITS.soulMinImages}
            onClick={() => setConfirming(true)}
            data-testid="character-train-soul"
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {status === "ready"
              ? "Train again"
              : status === "uncertain"
                ? "Train anyway"
                : "Train Soul ID"}
          </Button>
          <p className="basis-full text-[11px] text-muted-foreground">{VERSION_HINTS[version]}</p>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Train a Soul ID for {character.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Higgsfield trains it on all {images} of {character.name}'s images (the sheet and the
              training photos) for {SOUL_VERSION_LABELS[version]}, and bills the training to the
              studio's Higgsfield account (its API doesn't quote a price).
              {images < CHARACTER_LIMITS.soulRecommendedImages
                ? ` With fewer than ${CHARACTER_LIMITS.soulRecommendedImages} images the likeness is weaker.`
                : ""}
              {status === "ready" ? " The new Soul ID replaces the current one." : ""}
              {status === "uncertain"
                ? " The last training's answer was unclear: if it did start, this trains (and charges) again."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void train()}>Train</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
