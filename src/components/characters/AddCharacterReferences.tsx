import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
import { toast } from "sonner";
import { planCharacter, useCharacters, type CharacterEntry } from "@/hooks/useCharacters";
import type { AssetRow } from "@/hooks/useStudioData";
import { charactersLine } from "@/lib/characters/model";
import { CharacterAvatar } from "@/components/characters/CharacterPicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Adds a character's reference sheet (best view first) to a single
 * generation's references, as many as there is room for.
 */
export function AddCharacterReferences({
  room,
  onAdd,
  onLook,
}: {
  /** How many more references can be attached. */
  room: number;
  onAdd: (assets: AssetRow[]) => void;
  /** Adds the character's look to the prompt (the line every clip of theirs carries). */
  onLook?: (line: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: characters = [] } = useCharacters({ enabled: open });
  const usable = characters.filter((character) =>
    character.images.some((image) => image.role === "sheet"),
  );

  function add(character: CharacterEntry) {
    setOpen(false);
    const ordered = planCharacter(character).images.flatMap((image) => {
      const asset = character.images.find((entry) => entry.assetId === image.assetId)?.asset;
      return asset ? [asset] : [];
    });
    const assets = ordered.slice(0, Math.max(0, room));
    if (!assets.length) {
      toast.error("There's no room for more references.");
      return;
    }
    onAdd(assets);
    // Their look goes into the prompt too: images alone don't keep the clothes and age.
    const line = onLook
      ? charactersLine([planCharacter(character)], { references: true, descriptionChars: 300 })
      : "";
    if (line) onLook?.(line);
    toast.success(
      `Added ${assets.length} of ${character.name}'s images${line ? " and their look to the prompt" : ""}. Name ${character.name} in the prompt.`,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <UsersRound className="mr-1 size-3.5" /> Character
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-1 p-2">
        {usable.map((character) => (
          <button
            key={character.id}
            type="button"
            onClick={() => add(character)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
          >
            <CharacterAvatar character={character} className="size-7" />
            <span className="min-w-0 flex-1 truncate font-medium">{character.name}</span>
          </button>
        ))}
        {!usable.length && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No characters with reference images yet.
          </p>
        )}
        <Link
          to="/characters"
          className="block rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Make or change characters
        </Link>
      </PopoverContent>
    </Popover>
  );
}
