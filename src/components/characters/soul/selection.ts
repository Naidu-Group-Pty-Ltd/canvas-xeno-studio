import type { CharacterEntry } from "@/hooks/useCharacters";
import { defaultTrainingSet, storedTrainingCheck } from "@/lib/characters/soul";

/** The images a character's Soul ID would be trained on by default (training photos first). */
export function defaultSelection(character: CharacterEntry): string[] {
  const checks = new Map(
    character.images.flatMap((image) => {
      const check = storedTrainingCheck(image.asset?.metadata);
      return check ? [[image.assetId, check] as const] : [];
    }),
  );
  return defaultTrainingSet(character.images, checks);
}
