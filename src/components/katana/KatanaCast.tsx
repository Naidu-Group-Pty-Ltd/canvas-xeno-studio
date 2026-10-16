import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { CharacterPicker } from "@/components/characters/CharacterPicker";
import { soulSummary } from "@/components/characters/labels";
import { planCharacter, type CharacterEntry } from "@/hooks/useCharacters";
import { KATANA_CHARACTERS_MAX, sheetGaps, type SheetImage } from "@/lib/katana/cast";
import type { CharacterView } from "@/lib/characters/model";

const GAP_NAMES: Partial<Record<CharacterView, string>> = {
  face: "face close-up",
  front: "full-body front view",
};

/**
 * The team's characters a run keeps the same: who they are, how much of their
 * sheet goes, and what is missing from it. Their sheet images show in the
 * images slot they go to; their name and look are written into Katana's brief.
 */
export function KatanaCast({
  characters,
  selected,
  onChange,
  sheet,
  problem,
  disabled,
}: {
  characters: CharacterEntry[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** The sheet images that go, for all of them. */
  sheet: SheetImage[];
  /** Why they can't go as chosen, if they can't. */
  problem: string | null;
  disabled?: boolean;
}) {
  const chosen = selected.flatMap((id) => {
    const entry = characters.find((character) => character.id === id);
    return entry ? [entry] : [];
  });
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="katana-cast">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">
          Characters
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        </Label>
        <span className="text-[11px] text-muted-foreground">
          {chosen.length}/{KATANA_CHARACTERS_MAX}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Katana keeps them the same from their reference sheet, best views first, and is told who
        they are and how they look. It can't use a Soul ID itself: the views made from one go as
        part of the sheet.
      </p>
      <CharacterPicker
        characters={characters}
        selected={chosen.map((character) => character.id)}
        onChange={onChange}
        max={KATANA_CHARACTERS_MAX}
        {...(disabled !== undefined ? { disabled } : {})}
      />
      {chosen.map((character) => {
        const run = planCharacter(character);
        const going = sheet.filter((image) => image.characterId === character.id).length;
        const gaps = sheetGaps(run).flatMap((view) => GAP_NAMES[view] ?? []);
        const soul = soulSummary(character);
        return (
          <div
            key={character.id}
            className="space-y-0.5 text-[11px]"
            data-testid="katana-cast-member"
          >
            <p>
              <Link
                to="/characters/$characterId"
                params={{ characterId: character.id }}
                className="font-medium hover:underline"
              >
                {character.name}
              </Link>
              <span className="text-muted-foreground">
                {" · "}
                {going === run.images.length
                  ? `${going} reference image${going === 1 ? "" : "s"}`
                  : `${going} of ${run.images.length} reference images, best views first`}
                {soul ? ` · ${soul}` : ""}
              </span>
            </p>
            {character.description.trim() && (
              <p className="line-clamp-2 text-muted-foreground">{character.description}</p>
            )}
            {gaps.length > 0 && (
              <p className="flex items-start gap-1 text-warning">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>
                  No {gaps.join(" or ")} in their sheet yet: Katana holds a likeness best with both.
                  Make {gaps.length === 1 ? "it" : "them"} with the Views maker on their page
                  {character.soul_reference_id && character.soul_model_version
                    ? ", from their Soul ID"
                    : ""}
                  .
                </span>
              </p>
            )}
          </div>
        );
      })}
      {problem && (
        <p
          className="flex items-start gap-1 text-[11px] text-warning"
          data-testid="katana-cast-problem"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>{problem}</span>
        </p>
      )}
    </div>
  );
}
