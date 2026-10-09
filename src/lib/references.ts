/**
 * Reference media ↔ model input slots.
 *
 * References stay attached when the model changes; each one is mapped onto a
 * slot the selected model actually declares. Anything the model cannot use is
 * marked unused (and never uploaded to the provider) instead of being dropped.
 */
import {
  SLOT_ROLE_LABELS,
  type InputMediaType,
  type InputSlot,
  type ModelRegistryEntry,
} from "./model-schema";

export { slotLabel } from "./model-schema";

export const UNUSED_ROLE = "unused";

export interface RoleCarrier {
  assetId: string;
  role: string;
  assetType: InputMediaType;
}

export const ROLE_LABELS: Record<string, string> = {
  ...SLOT_ROLE_LABELS,
  [UNUSED_ROLE]: "Not used",
};

export function slotsFor(model: ModelRegistryEntry | null | undefined): InputSlot[] {
  return model?.capabilities?.inputs ?? [];
}

function capacity(slot: InputSlot): number {
  return slot.max ?? 1;
}

/** Keeps valid role choices, fills remaining references into free slots in declaration order. */
export function assignRoles<T extends RoleCarrier>(
  items: T[],
  model: ModelRegistryEntry | null | undefined,
): T[] {
  const slots = slotsFor(model);
  const used = new Map<string, number>();
  const result: (T | null)[] = items.map(() => null);
  const take = (slot: InputSlot) => used.set(slot.role, (used.get(slot.role) ?? 0) + 1);
  const hasRoom = (slot: InputSlot) => (used.get(slot.role) ?? 0) < capacity(slot);

  items.forEach((item, index) => {
    const slot = slots.find((entry) => entry.role === item.role && entry.type === item.assetType);
    if (slot && hasRoom(slot)) {
      take(slot);
      result[index] = item;
    }
  });

  // Required slots are filled before optional ones of the same media type.
  const ordered = [...slots].sort((a, b) => Number(!!b.required) - Number(!!a.required));
  items.forEach((item, index) => {
    if (result[index]) return;
    const slot = ordered.find((entry) => entry.type === item.assetType && hasRoom(entry));
    if (slot) {
      take(slot);
      result[index] = { ...item, role: slot.role };
    } else {
      result[index] = { ...item, role: UNUSED_ROLE };
    }
  });

  return result as T[];
}

/** Only references mapped onto a real slot are sent with a generation. */
export function usableReferences<T extends RoleCarrier>(items: T[]): T[] {
  return items.filter((item) => item.role !== UNUSED_ROLE);
}

/** Roles a reference of this type could take on the model. */
export function rolesForType(
  model: ModelRegistryEntry | null | undefined,
  type: InputMediaType,
): InputSlot[] {
  return slotsFor(model).filter((slot) => slot.type === type);
}

/**
 * True when the model can use every attached media type and none of its
 * required inputs is missing a matching reference.
 */
export function modelFitsReferences(model: ModelRegistryEntry, types: InputMediaType[]): boolean {
  const slots = slotsFor(model);
  if (!types.length) return false;
  if (!types.every((type) => slots.some((slot) => slot.type === type))) return false;
  return slots.filter((slot) => slot.required).every((slot) => types.includes(slot.type));
}

/**
 * Models that can use the attached references, best first: same family, then
 * same output type, then registry order.
 */
export function referenceCompatibleModels(
  items: RoleCarrier[],
  models: ModelRegistryEntry[],
  context: { family?: string | null; outputType?: string | null; excludeId?: string | null } = {},
): ModelRegistryEntry[] {
  const types = [...new Set(items.map((item) => item.assetType))];
  return models
    .filter(
      (model) =>
        model.is_active && model.id !== context.excludeId && modelFitsReferences(model, types),
    )
    .map((model) => ({
      model,
      score:
        (context.family && model.family === context.family ? 4 : 0) +
        (context.outputType && model.output_type === context.outputType ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.model.sort_order - b.model.sort_order)
    .map((entry) => entry.model);
}

/**
 * The model to load for a hand-off that carries media: the fallback when it
 * can use the media, otherwise the best compatible model of the wanted output
 * type, preferring one that declares the hand-off's role (e.g. "source").
 */
export function pickModelForReferences(
  items: RoleCarrier[],
  models: ModelRegistryEntry[],
  options: {
    outputType: "image" | "video";
    fallback?: ModelRegistryEntry | undefined;
    preferredRole?: string | undefined;
  },
): ModelRegistryEntry | undefined {
  const { outputType, fallback, preferredRole } = options;
  const types = [...new Set(items.map((item) => item.assetType))];
  if (!types.length) return fallback;
  if (fallback && modelFitsReferences(fallback, types)) return fallback;
  const candidates = referenceCompatibleModels(items, models, {
    family: fallback?.family ?? null,
    outputType,
  });
  const sameType = candidates.filter((model) => model.output_type === outputType);
  const declaresRole = (model: ModelRegistryEntry) =>
    slotsFor(model).some((slot) => slot.role === preferredRole);
  return sameType.find(declaresRole) ?? sameType[0] ?? candidates[0] ?? fallback;
}

/** Short capability label for model cards, e.g. "Image refs · Video input". */
export function inputCapabilityLabels(model: ModelRegistryEntry): string[] {
  const slots = slotsFor(model);
  const labels: string[] = [];
  const images = slots.filter((slot) => slot.type === "image");
  if (images.length) {
    const total = images.reduce((sum, slot) => sum + capacity(slot), 0);
    labels.push(
      images.some((slot) => slot.required)
        ? `Needs image${total > 1 ? "s" : ""}`
        : `Image refs (${total})`,
    );
  }
  if (slots.some((slot) => slot.type === "video"))
    labels.push(
      slots.some((slot) => slot.type === "video" && slot.required) ? "Needs video" : "Video refs",
    );
  if (slots.some((slot) => slot.type === "audio"))
    labels.push(
      slots.some((slot) => slot.type === "audio" && slot.required) ? "Needs audio" : "Audio refs",
    );
  return labels;
}
