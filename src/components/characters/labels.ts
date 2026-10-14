import type { CharacterEntry } from "@/hooks/useCharacters";
import { SOUL_VERSION_LABELS } from "@/lib/characters/model";

/** A character's Soul ID, in a few words. */
export function soulSummary(character: CharacterEntry): string | null {
  const version = character.soul_model_version
    ? SOUL_VERSION_LABELS[character.soul_model_version]
    : "Soul";
  switch (character.soul_status) {
    case "ready":
      return `Soul ID ready · ${version}`;
    case "training":
    case "submitting":
      return `Soul ID training · ${version}`;
    case "failed":
      return "Soul ID failed";
    case "uncertain":
      return "Soul ID unclear";
    default:
      return null;
  }
}
