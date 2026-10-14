import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { isMissingTableError } from "@/lib/edit/errors";
import type { AssetRow } from "@/hooks/useStudioData";
import {
  CHARACTER_VIEWS,
  runCharacter,
  type CharacterImage,
  type CharacterImageRole,
  type CharacterView,
  type RunCharacter,
  type SoulStatus,
  type SoulVersion,
} from "@/lib/characters/model";

type CharacterTableRow = Database["public"]["Tables"]["characters"]["Row"];

/** One of a character's images, with its library file (null once deleted from the library). */
export interface CharacterImageEntry extends CharacterImage {
  asset: AssetRow | null;
}

/** A character as the studio shows it: its record and its images, in their arranged order. */
export interface CharacterEntry extends Omit<
  CharacterTableRow,
  "soul_status" | "soul_model_version"
> {
  soul_status: SoulStatus;
  soul_model_version: SoulVersion | null;
  images: CharacterImageEntry[];
}

function asView(value: string): CharacterView {
  return (CHARACTER_VIEWS as readonly string[]).includes(value)
    ? (value as CharacterView)
    : "other";
}

/** The query the team's characters are cached under (kept fresh by the realtime channel). */
export const CHARACTERS_KEY = ["characters"] as const;

/**
 * The team's characters, most recently changed first, each with its images
 * (only those still in the library). Live through the studio's realtime
 * channel. Empty until the database has the tables.
 */
export function useCharacters(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CHARACTERS_KEY,
    enabled: options.enabled ?? true,
    queryFn: fetchCharacters,
  });
}

/** Reads the team's characters (see useCharacters). */
export async function fetchCharacters(): Promise<CharacterEntry[]> {
  const { data, error } = await supabase
    .from("characters")
    .select("*, character_images(asset_id, role, view, position)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as (CharacterTableRow & {
    character_images: { asset_id: string; role: string; view: string; position: number }[];
  })[];
  const ids = [
    ...new Set(rows.flatMap((row) => row.character_images.map((image) => image.asset_id))),
  ];
  const assets = new Map<string, AssetRow>();
  // Fetched in pages: a long `in` list can pass what a request URL holds.
  for (let start = 0; start < ids.length; start += 150) {
    const { data: page, error: assetsError } = await supabase
      .from("assets")
      .select("*")
      .in("id", ids.slice(start, start + 150))
      .is("deleted_at", null);
    if (assetsError) throw assetsError;
    for (const asset of (page ?? []) as unknown as AssetRow[]) assets.set(asset.id, asset);
  }
  return rows.map(({ character_images: images, ...row }) => ({
    ...row,
    soul_status: row.soul_status as SoulStatus,
    soul_model_version: (row.soul_model_version as SoulVersion | null) ?? null,
    images: [...images]
      .sort((a, b) => a.position - b.position)
      .flatMap((image) => {
        const asset = assets.get(image.asset_id) ?? null;
        return asset
          ? [
              {
                assetId: image.asset_id,
                role: (image.role === "photo" ? "photo" : "sheet") as CharacterImageRole,
                view: asView(image.view),
                position: image.position,
                asset,
              },
            ]
          : [];
      }),
  }));
}

/** One character, from the team's list. */
export function useCharacter(id: string | null | undefined) {
  const query = useCharacters({ enabled: !!id });
  return { ...query, data: query.data?.find((entry) => entry.id === id) ?? null };
}

/** A character as plans use it (its reference sheet, best view first). */
export function planCharacter(entry: CharacterEntry): RunCharacter {
  return runCharacter({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    images: entry.images,
  });
}

/** The sheet's best image, for a character's thumbnail. */
export function characterCover(entry: CharacterEntry): AssetRow | null {
  const sheet = planCharacter(entry).images[0];
  return (
    (sheet ? entry.images.find((image) => image.assetId === sheet.assetId)?.asset : null) ??
    entry.images[0]?.asset ??
    null
  );
}
