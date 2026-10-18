import { useState } from "react";
import { ChevronDown, Fingerprint } from "lucide-react";
import type { CharacterEntry } from "@/hooks/useCharacters";
import type { TrainingSetCheck } from "@/lib/characters/soul";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { AccountSoulIds } from "./AccountSoulIds";
import { SoulIdCards } from "./SoulIdCards";
import { TrainControls, TrainingStatus } from "./TrainSoul";
import { defaultSelection } from "./selection";
import { TrainingSet } from "./TrainingSet";
import { TrainingPack } from "./TrainingPack";

/**
 * A character's Soul ID studio: the Soul IDs in use (one per Soul model) and
 * their proven likeness; the images a new one is trained on, checked by the
 * studio's AI; a training pack for a character who exists only as AI images;
 * training itself; and Soul IDs already on the Higgsfield account.
 */
export function SoulStudio({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const [selection, setSelection] = useState<string[] | null>(null);
  const [check, setCheck] = useState<TrainingSetCheck | null>(null);
  // The default set until a person picks; images taken off the character drop out.
  const own = new Set(character.images.map((image) => image.assetId));
  const picked = (selection ?? defaultSelection(character)).filter((id) => own.has(id));
  const training = character.soul_status === "training" || character.soul_status === "submitting";

  return (
    <section className="panel space-y-4 p-4" data-testid="character-soul-id">
      <div className="flex items-start gap-2">
        <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h3 className="label-eyebrow">Soul ID</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Higgsfield's trained likeness of {character.name}: its Soul models then make images of
            exactly this person from a prompt. The studio uses it for their portraits and product
            shots, the opening still of their videos, and the reference views on their sheet. Train
            it on real, varied photos (or a training pack), check the set first, and prove the
            likeness before relying on it.
          </p>
        </div>
      </div>

      <SoulIdCards character={character} canEdit={canEdit} />
      <TrainingStatus character={character} canEdit={canEdit} />

      {canEdit && !training && (
        <>
          <Separator />
          <TrainingSet
            character={character}
            canEdit={canEdit}
            selection={picked}
            onSelection={setSelection}
            check={check}
            onCheck={setCheck}
          />
          <TrainControls character={character} selection={picked} check={check} />
          <Separator />
          <TrainingPack character={character} canEdit={canEdit} />
        </>
      )}

      <Collapsible>
        <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-3.5 transition group-data-[state=open]:rotate-180" />
          Soul IDs on the Higgsfield account
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <AccountSoulIds character={character} canEdit={canEdit} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
