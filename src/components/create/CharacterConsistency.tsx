import { AlertTriangle, Film, Fingerprint, Images, ShieldCheck } from "lucide-react";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { CHARACTER_LIMITS } from "@/lib/characters/model";
import { clipEnd, modelLine } from "@/lib/long-video/plan";
import type { LongVideoDraft, LongVideoPlan } from "@/components/create/long-video-plan";
import { CharacterPicker } from "@/components/characters/CharacterPicker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Who must look the same throughout a long video, and how the chosen model
 * keeps them so, said plainly: whether their images reach every clip or only
 * the first, keyframes (where the model can end a clip on a frame), and the
 * check after every clip.
 */
export function CharacterConsistency({
  model,
  draft,
  plan,
  characters,
  onChange,
  keyframeUsd,
  aiUnavailableReason,
}: {
  model: ModelRegistryEntry;
  draft: LongVideoDraft;
  plan: LongVideoPlan;
  /** The team's characters. */
  characters: CharacterEntry[];
  onChange: (patch: Partial<LongVideoDraft>) => void;
  /** Higgsfield's price for one keyframe, when known. */
  keyframeUsd: number | null;
  /** Why the studio's AI can't check clips, if it can't. */
  aiUnavailableReason: string | null;
}) {
  const chosen = plan.characters;
  const first = plan.planned[0];
  const later = plan.planned.slice(1);
  const laterImages = later.length ? Math.max(...later.map((clip) => clip.characterImages)) : 0;
  const continuation = plan.continuation;
  const softEnd = !!continuation && clipEnd(continuation)?.kind === "reference";
  // Only the keyframes that are painted are billed (the person's own frames aren't).
  const keyframeCost =
    keyframeUsd !== null && plan.paintedKeyframes
      ? ` · about $${(keyframeUsd * plan.paintedKeyframes).toFixed(2)}`
      : "";

  return (
    <div className="space-y-2" data-testid="long-video-characters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-eyebrow">Characters</span>
        <CharacterPicker
          characters={characters}
          selected={draft.characterIds}
          onChange={(characterIds) => onChange({ characterIds })}
          max={CHARACTER_LIMITS.perRun}
        />
      </div>
      {chosen.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Name them in the beats: a clip gets the characters its beat names (all of them when it
          names none), their look written into its prompt.
        </p>
      )}

      {(chosen.length > 0 || draft.keyframes || plan.workflow) && (
        <ul
          className="space-y-2.5 rounded-md bg-background/60 px-3 py-2.5 text-xs"
          data-testid="long-video-consistency"
        >
          {chosen.length > 0 && (
            <li className="flex gap-2">
              <Images className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Their images. </span>
                {first && first.characterImages > 0
                  ? `Clip 1 is sent ${first.characterImages} of them`
                  : `${plan.keyframed ? "Clip 1 starts on its keyframe" : `${modelLine(model)} can't take them in clip 1`}`}
                {later.length
                  ? laterImages > 0
                    ? `; every later clip up to ${laterImages}, with the frame it starts from.`
                    : `; ${continuation ? modelLine(continuation) : "the model"} takes no reference images with a start frame, so later clips carry them by their last frame and description${plan.keyframed ? " (and their keyframes)" : ""}.`
                  : "."}
              </p>
            </li>
          )}

          <li className="flex gap-2">
            <Film className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-1.5">
              {plan.workflow ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="long-video-keyframes" className="text-xs font-medium">
                      Paint keyframes first
                    </Label>
                    <Switch
                      id="long-video-keyframes"
                      checked={plan.keyframed}
                      disabled={!!plan.voiceover}
                      onCheckedChange={(on) => onChange({ keyframes: on })}
                      data-testid="long-video-keyframes"
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {plan.voiceover
                      ? "Not with a voiceover: its clips are cut where the voiceover pauses, so none can be made to end on a painted frame. The characters still carry from clip to clip by their images and description."
                      : plan.keyframed
                        ? `${plan.paintedKeyframes} stills${keyframeCost}: the opening frame and the frame each clip ends on${plan.keyframeCount > plan.paintedKeyframes ? " (your own frames are used as they are)" : ""}, painted from ${chosen.length ? "their images" : "your references"}. Every clip is then made by ${modelLine(plan.workflow)} and ${softEnd ? "steered toward" : "ends on"} its keyframe, so no one can drift for more than a clip. Motion can settle for a moment where clips meet.`
                        : chosen.length
                          ? `Recommended with characters: the frame each clip ends on is painted first, so no one can drift for more than a clip (${modelLine(plan.workflow)} makes every clip).`
                          : `The frame each clip ends on can be painted first and looked over, so the video goes exactly where you want (${modelLine(plan.workflow)} makes every clip).`}
                  </p>
                  {plan.keyframed && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {plan.painters.length > 1 && (
                        <Select
                          value={plan.painter?.id ?? ""}
                          onValueChange={(painterModelId) => onChange({ painterModelId })}
                        >
                          <SelectTrigger className="h-8 text-xs" aria-label="Keyframes painted by">
                            <SelectValue placeholder="Painted by" />
                          </SelectTrigger>
                          <SelectContent>
                            {plan.painters.map((painter) => (
                              <SelectItem key={painter.id} value={painter.id} className="text-xs">
                                Painted by {painter.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5">
                        <Label htmlFor="long-video-review" className="text-[11px]">
                          Let me review them first
                        </Label>
                        <Switch
                          id="long-video-review"
                          checked={draft.reviewKeyframes}
                          onCheckedChange={(reviewKeyframes) => onChange({ reviewKeyframes })}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Keyframes </span>
                  aren't available: {modelLine(model)} can't end a clip on a given frame. Models
                  that can include Seedance 2.5, Kling 3.0, Kling O3, Wan 3.0 and MiniMax H3.
                </p>
              )}
            </div>
          </li>

          {chosen.length > 0 && (
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="long-video-check" className="text-xs font-medium">
                    Check every clip
                  </Label>
                  <Switch
                    id="long-video-check"
                    checked={draft.identityCheck}
                    onCheckedChange={(identityCheck) => onChange({ identityCheck })}
                    data-testid="long-video-identity-check"
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  After each clip, the studio's AI compares frames from it with their images. If
                  someone's face, hair or clothes changed, the video stops before the next clip is
                  paid for, for you to redo that clip or keep it.
                </p>
                {draft.identityCheck && aiUnavailableReason && (
                  <p className="flex items-start gap-1 text-[11px] text-warning">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    No AI model is set up (add an AI key in Settings → AI), so clips can't be
                    checked.
                  </p>
                )}
              </div>
            </li>
          )}

          {chosen.some((character) => character.images.length === 1) && (
            <li className="flex gap-2 text-[11px] text-warning">
              <Fingerprint className="mt-0.5 size-3.5 shrink-0" />
              {chosen
                .filter((character) => character.images.length === 1)
                .map((character) => character.name)
                .join(", ")}{" "}
              {chosen.filter((character) => character.images.length === 1).length === 1
                ? "has"
                : "have"}{" "}
              a single reference image: a face close-up and a full-body shot keep them far better.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
