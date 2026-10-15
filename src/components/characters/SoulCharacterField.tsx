import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCharacters } from "@/hooks/useCharacters";
import { SOUL_VERSION_LABELS, type SoulVersion } from "@/lib/characters/model";
import { CharacterAvatar } from "@/components/characters/CharacterPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";
const OTHER = "__other__";

/**
 * A Soul model's character: one of the team's characters whose Soul ID is
 * trained for this model, so the images it makes are of exactly that person
 * (or another Soul ID pasted in). Sets the model's custom_reference_id.
 */
export function SoulCharacterField({
  version,
  value,
  onChange,
  issue,
}: {
  version: SoulVersion;
  value: unknown;
  onChange: (value: string | undefined) => void;
  issue?: string | undefined;
}) {
  const { data: characters = [] } = useCharacters();
  // Each character's Soul ID in use (a newer one may be training meanwhile).
  const ready = characters.filter(
    (character) => character.soul_model_version === version && !!character.soul_reference_id,
  );
  const current = typeof value === "string" ? value.trim() : "";
  const match = ready.find((character) => character.soul_reference_id === current);
  const [pasting, setPasting] = useState(false);
  const selected = !current ? (pasting ? OTHER : NONE) : match ? match.id : OTHER;

  return (
    <div className="space-y-1.5" data-testid="soul-character">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">Character</Label>
        {issue && <span className="text-[11px] text-primary">{issue}</span>}
      </div>
      <Select
        value={selected}
        onValueChange={(next) => {
          if (next === NONE) {
            setPasting(false);
            onChange(undefined);
          } else if (next === OTHER) {
            setPasting(true);
            onChange(undefined);
          } else {
            setPasting(false);
            onChange(
              ready.find((character) => character.id === next)?.soul_reference_id ?? undefined,
            );
          }
        }}
      >
        <SelectTrigger className="h-9" aria-label="Character">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No character</SelectItem>
          {ready.map((character) => (
            <SelectItem key={character.id} value={character.id}>
              <span className="flex items-center gap-2">
                <CharacterAvatar character={character} className="size-5" />
                {character.name}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Another Soul ID…</SelectItem>
        </SelectContent>
      </Select>
      {selected === OTHER && (
        <Input
          value={current}
          placeholder="Paste a Soul ID trained for this model"
          onChange={(event) => onChange(event.target.value || undefined)}
          className="h-8 text-xs"
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        {ready.length
          ? `Images of exactly that person. Characters appear here once their Soul ID is trained for ${SOUL_VERSION_LABELS[version]}.`
          : `Train a character's Soul ID for ${SOUL_VERSION_LABELS[version]} on the `}
        {!ready.length && (
          <Link to="/characters" className="underline underline-offset-2">
            Characters page
          </Link>
        )}
        {!ready.length && " to make images of exactly that person here."}
      </p>
    </div>
  );
}
