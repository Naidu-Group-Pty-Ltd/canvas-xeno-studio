import type { CharacterEntry } from "@/hooks/useCharacters";
import { SOUL_VERSION_LABELS } from "@/lib/characters/model";

/** A character's Soul ID, in a few words: the one in use, or how the latest training went. */
export function soulSummary(character: CharacterEntry): string | null {
  const inUse =
    character.soul_reference_id && character.soul_model_version
      ? `Soul ID ready · ${SOUL_VERSION_LABELS[character.soul_model_version]}`
      : null;
  switch (character.soul_status) {
    case "training":
    case "submitting": {
      const version = character.soul_training_version ?? character.soul_model_version;
      return `Soul ID training${version ? ` · ${SOUL_VERSION_LABELS[version]}` : ""}`;
    }
    case "failed":
      return inUse ?? "Soul ID failed";
    case "uncertain":
      return inUse ? `${inUse} · last training unclear` : "Soul ID unclear";
    default:
      return inUse;
  }
}
