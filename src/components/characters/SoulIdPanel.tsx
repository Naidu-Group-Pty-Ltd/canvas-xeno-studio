import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { attachSoulId, refreshSoulId, trainSoulId } from "@/lib/characters.functions";
import {
  CHARACTER_LIMITS,
  SOUL_VERSION_LABELS,
  SOUL_VERSIONS,
  type SoulVersion,
} from "@/lib/characters/model";
import { UUID, UUID_EXAMPLE } from "@/lib/model-schema";
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
  const [version, setVersion] = useState<SoulVersion>(
    character.soul_training_version ?? character.soul_model_version ?? "v2",
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // An unclear training's Soul ID, as found at Higgsfield (its id, if Higgsfield gave one).
  // A new training (its own request key) starts it afresh, so an earlier
  // attempt's id is never offered for it; edits within one attempt are kept.
  const [referenceId, setReferenceId] = useState(character.soul_training_id ?? "");
  const [referenceFor, setReferenceFor] = useState(character.soul_request_key);
  if (referenceFor !== character.soul_request_key) {
    setReferenceFor(character.soul_request_key);
    setReferenceId(character.soul_training_id ?? "");
  }
  // One training (or Soul ID given) per click: a second click while the first is on its way does nothing.
  const lock = useRef(false);
  const status = character.soul_status;
  const images = character.images.length;
  const active = status === "training" || status === "submitting";
  // The Soul ID in use: it stays in use while a new one trains, and if that fails.
  const inUse =
    character.soul_reference_id && character.soul_model_version
      ? character.soul_model_version
      : null;
  const trainingVersion = character.soul_training_version ?? character.soul_model_version;

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
    if (lock.current) return;
    lock.current = true;
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
      else if (result.status === "failed")
        toast.error("Higgsfield couldn't train it. The reason is shown under Soul ID.");
      else if (result.status === "ready")
        toast.success(`Soul ID ready. Pick ${character.name} under Character in Create.`);
      else toast.success("Training started. It usually takes a few minutes.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The training couldn't be started");
    } finally {
      lock.current = false;
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    }
  }

  /** Gives an unclear training the Soul ID found at Higgsfield (asked about first; nothing is charged). */
  async function attach() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await attachSoulId({
        data: { characterId: character.id, referenceId: referenceId.trim() },
      });
      if (result.status === "ready")
        toast.success(`Soul ID in use. Pick ${character.name} under Character in Create.`);
      else if (result.status === "failed")
        toast.warning("Higgsfield says that training failed, so it can be trained again.");
      else toast.success("Found it: it's still training, and comes into use once it's ready.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The Soul ID couldn't be given");
    } finally {
      lock.current = false;
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

      <div
        className="space-y-1.5 rounded-md bg-muted/40 px-3 py-2 text-xs"
        data-testid="character-soul-status"
      >
        {inUse && (
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 shrink-0 text-success" />
            <span>
              Ready for {SOUL_VERSION_LABELS[inUse]}
              {character.soul_ready_at
                ? `, trained ${formatDistanceToNow(new Date(character.soul_ready_at), { addSuffix: true })}`
                : ""}
              . Pick {character.name} under Character on that model in Create.
            </span>
          </p>
        )}
        {active && (
          <p className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span>
              Training on {character.soul_image_count ?? images} images
              {trainingVersion ? ` for ${SOUL_VERSION_LABELS[trainingVersion]}` : ""}. This usually
              takes a few minutes; you can leave this page.
              {inUse ? " The Soul ID above stays in use until the new one is ready." : ""}
            </span>
          </p>
        )}
        {status === "failed" && (
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {inUse ? "The last training failed: " : ""}
              {character.soul_error ?? "The training failed."}
              {inUse ? " The Soul ID in use is unchanged." : ""}
            </span>
          </p>
        )}
        {status === "uncertain" && (
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {character.soul_error ??
                "Higgsfield's answer was unclear, so the training may or may not have started."}{" "}
              Check Higgsfield before training again, or it may be charged twice.
              {inUse ? " The Soul ID in use is unchanged." : ""}
            </span>
          </p>
        )}
        {!inUse && status === "none" && (
          <p className="text-muted-foreground">
            Not trained. Best with 10–20 varied, sharp photos of the face (at least{" "}
            {CHARACTER_LIMITS.soulRecommendedImages}); this character has {images}.
          </p>
        )}
      </div>

      {canEdit && status === "uncertain" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void attach();
          }}
          data-testid="character-attach-soul"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`soul-id-${character.id}`} className="text-xs">
              Found it at Higgsfield? Its Soul ID
            </Label>
            <Input
              id={`soul-id-${character.id}`}
              value={referenceId}
              onChange={(event) => setReferenceId(event.target.value)}
              placeholder={UUID_EXAMPLE}
              autoComplete="off"
              spellCheck={false}
              className="h-9 font-mono text-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-9"
            disabled={busy || !UUID.test(referenceId.trim())}
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Use this Soul ID
          </Button>
          <p className="basis-full text-[11px] text-muted-foreground">
            Higgsfield is asked about it first, which is free. It's used
            {trainingVersion ? ` for ${SOUL_VERSION_LABELS[trainingVersion]}` : ""} once it's ready,
            and nothing is trained or charged again.
          </p>
        </form>
      )}

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
            variant={inUse ? "outline" : "default"}
            className="h-9"
            disabled={busy || images < CHARACTER_LIMITS.soulMinImages}
            onClick={() => setConfirming(true)}
            data-testid="character-train-soul"
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {status === "uncertain" ? "Train anyway" : inUse ? "Train again" : "Train Soul ID"}
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
              {inUse
                ? " The new Soul ID replaces the one in use once it's ready; if the training fails, the one in use stays."
                : ""}
              {status === "uncertain"
                ? " The last training's answer was unclear: if it did start, this trains (and charges) again."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void train();
              }}
            >
              Train
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
