import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Plus, Search, UserRound, X } from "lucide-react";
import { characterCover, type CharacterEntry } from "@/hooks/useCharacters";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A character's face, small. */
export function CharacterAvatar({
  character,
  className,
}: {
  character: CharacterEntry;
  className?: string;
}) {
  const cover = characterCover(character);
  return (
    <span
      className={cn(
        "relative inline-flex size-6 shrink-0 overflow-hidden rounded-full border border-border bg-surface",
        className,
      )}
    >
      {cover ? (
        <MediaPreview
          bucket={cover.storage_bucket}
          path={cover.storage_path}
          type="image"
          alt={character.name}
        />
      ) : (
        <UserRound className="m-auto size-3.5 text-muted-foreground" />
      )}
    </span>
  );
}

/**
 * Chooses characters from the team's library: chips for those chosen, and a
 * searchable list to add more (up to `max`). Characters without reference
 * images can't be chosen; the list says why.
 */
export function CharacterPicker({
  characters,
  selected,
  onChange,
  max,
  disabled,
}: {
  characters: CharacterEntry[];
  selected: string[];
  onChange: (ids: string[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const chosen = selected
    .map((id) => characters.find((entry) => entry.id === id))
    .filter((entry): entry is CharacterEntry => !!entry);
  const shown = characters.filter((entry) =>
    entry.name.toLowerCase().includes(term.trim().toLowerCase()),
  );
  const sheet = (entry: CharacterEntry) =>
    entry.images.filter((image) => image.role === "sheet").length;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id].slice(0, max),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="character-picker">
      {chosen.map((character) => (
        <span
          key={character.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pr-1 pl-0.5 text-xs"
        >
          <CharacterAvatar character={character} />
          {character.name}
          <button
            type="button"
            onClick={() => toggle(character.id)}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Take ${character.name} out`}
            disabled={disabled}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-xs"
            disabled={disabled || chosen.length >= max}
            data-testid="character-picker-open"
          >
            <Plus className="mr-1 size-3.5" />
            {chosen.length ? "Add another" : "Add a character"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2 p-2">
          <div className="relative">
            <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Find a character"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {shown.map((character) => {
              const images = sheet(character);
              const isChosen = selected.includes(character.id);
              return (
                <li key={character.id}>
                  <button
                    type="button"
                    disabled={!images || (!isChosen && chosen.length >= max)}
                    onClick={() => toggle(character.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      isChosen ? "bg-primary/10" : "hover:bg-muted",
                      !images && "opacity-50",
                    )}
                  >
                    <CharacterAvatar character={character} className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{character.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {images
                          ? `${images} reference image${images === 1 ? "" : "s"}`
                          : "No reference images yet"}
                      </span>
                    </span>
                    {isChosen && <Check className="size-3.5 text-primary" />}
                  </button>
                </li>
              );
            })}
            {!shown.length && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                {characters.length ? "No character by that name." : "No characters yet."}
              </li>
            )}
          </ul>
          <Link
            to="/characters"
            className="block rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Make or change characters
          </Link>
        </PopoverContent>
      </Popover>
    </div>
  );
}
