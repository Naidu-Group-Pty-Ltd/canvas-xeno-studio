import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { attachSoulId, refreshSoulId, trainSoulId } from "@/lib/characters.functions";
import { SOUL_VERSION_LABELS, SOUL_VERSIONS, type SoulVersion } from "@/lib/characters/model";
import { SOUL_TRAINING, type TrainingSetCheck } from "@/lib/characters/soul";
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
  v2: "Soul 2: the truest likeness in images (portraits, product shots, a video's opening still).",
  cinema: "Soul Cinema: film-look stills of them.",
  v1: "Soul Standard: styled images of them.",
};

/** The latest training's state, and recovering one whose answer was unclear. */
export function TrainingStatus({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const status = character.soul_status;
  const active = status === "training" || status === "submitting";
  const trainingVersion = character.soul_training_version ?? character.soul_model_version;
  const [referenceId, setReferenceId] = useState(character.soul_training_id ?? "");
  const [referenceFor, setReferenceFor] = useState(character.soul_request_key);
  if (referenceFor !== character.soul_request_key) {
    setReferenceFor(character.soul_request_key);
    setReferenceId(character.soul_training_id ?? "");
  }
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

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

  async function attach() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await attachSoulId({
        data: { characterId: character.id, referenceId: referenceId.trim() },
      });
      if (result.status === "ready") toast.success("Soul ID in use");
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

  if (!active && status !== "failed" && status !== "uncertain") return null;
  return (
    <div
      className="space-y-2 rounded-md bg-muted/40 px-3 py-2 text-xs"
      data-testid="character-soul-status"
    >
      {active && (
        <p className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>
            Training on {character.soul_image_count ?? "its"} images
            {trainingVersion ? ` for ${SOUL_VERSION_LABELS[trainingVersion]}` : ""}. This usually
            takes a few minutes; you can leave this page. The Soul ID in use stays in use until the
            new one is ready.
          </span>
        </p>
      )}
      {status === "failed" && (
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            The last training failed: {character.soul_error ?? "Higgsfield couldn't train it."}
          </span>
        </p>
      )}
      {status === "uncertain" && (
        <>
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {character.soul_error ??
                "Higgsfield's answer was unclear, so the training may or may not have started."}{" "}
              Check Higgsfield (or "Find on Higgsfield" below) before training again, or it may be
              charged twice.
            </span>
          </p>
          {canEdit && (
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
            </form>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Training a Soul ID for one Soul model on the images picked: refused under
 * the minimum, warned when the check found the set weak. Billed by
 * Higgsfield; started once per click, never repeated on its own.
 */
export function TrainControls({
  character,
  selection,
  check,
}: {
  character: CharacterEntry;
  selection: string[];
  check: TrainingSetCheck | null;
}) {
  const queryClient = useQueryClient();
  const status = character.soul_status;
  const active = status === "training" || status === "submitting";
  const [version, setVersion] = useState<SoulVersion>(
    character.soul_training_version ?? character.soul_model_version ?? "v2",
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const inUse = character.souls.find((soul) => soul.active && soul.version === version) ?? null;
  const count = selection.length;
  const checkedThisSet =
    !!check &&
    selection.every((id) => id in check.images) &&
    Object.keys(check.images).length >= count;

  async function train() {
    if (lock.current) return;
    lock.current = true;
    setConfirming(false);
    setBusy(true);
    try {
      const result = await trainSoulId({
        data: {
          characterId: character.id,
          version,
          confirmUncertain: status === "uncertain",
          assetIds: selection,
        },
      });
      if (result.status === "uncertain")
        toast.warning(
          "Higgsfield's answer was unclear, so the training may or may not have started. Check Higgsfield before training again.",
        );
      else if (result.status === "failed")
        toast.error("Higgsfield couldn't train it. The reason is shown above.");
      else if (result.status === "ready") toast.success("Soul ID ready. Prove its likeness above.");
      else toast.success("Training started. It usually takes a few minutes.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The training couldn't be started");
    } finally {
      lock.current = false;
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    }
  }

  if (active) return null;
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="soul-train-controls">
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
        className="h-9"
        disabled={busy || count < SOUL_TRAINING.minImages}
        onClick={() => setConfirming(true)}
        data-testid="character-train-soul"
      >
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        {status === "uncertain"
          ? "Train anyway"
          : inUse
            ? "Train a new one"
            : "Train Soul ID"} on {count} image{count === 1 ? "" : "s"}
      </Button>
      <p className="basis-full text-[11px] text-muted-foreground">
        {VERSION_HINTS[version]}
        {count < SOUL_TRAINING.minImages
          ? ` Pick at least ${SOUL_TRAINING.minImages} images to train on.`
          : !checkedThisSet
            ? " Check the set with AI first: it finds images that would weaken the likeness."
            : ""}
      </p>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Train a Soul ID for {character.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Higgsfield trains it on the {count} images picked, for {SOUL_VERSION_LABELS[version]},
              and bills the training to the studio's Higgsfield account (its API doesn't quote a
              price).
              {checkedThisSet && check?.verdict === "weak"
                ? " The check found this set weak: the likeness may not hold."
                : ""}
              {!checkedThisSet ? " The set hasn't been checked." : ""}
              {inUse
                ? ` It replaces the ${SOUL_VERSION_LABELS[version]} Soul ID in use once it's ready; if the training fails, the one in use stays.`
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
    </div>
  );
}
