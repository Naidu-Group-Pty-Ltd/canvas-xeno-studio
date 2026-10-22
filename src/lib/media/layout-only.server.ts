/**
 * Holding layout-only files out of frames (see ./layout-only): the check the
 * server makes wherever a library file would be placed in a frame or sent to
 * the provider, and the mark itself, set and lifted. Before migration
 * 0035_reference_privacy nothing can be marked, so nothing is held.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { isMissingTableError } from "../edit/errors";
import {
  layoutOnlyRefusal,
  privacyMarkOf,
  PRIVACY_NEEDS_UPDATE,
  type Placement,
  type PrivacyMark,
} from "./layout-only";
import { requireActiveMember } from "./members.server";

const idsOf = (assetIds: (string | null | undefined)[]) => [
  ...new Set(assetIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
];

/** The layout-only files among these, with their titles. */
export async function layoutOnlyAmong(
  assetIds: (string | null | undefined)[],
): Promise<{ id: string; title: string | null }[]> {
  const ids = idsOf(assetIds);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("asset_privacy")
    .select("asset_id")
    .in("asset_id", ids)
    .eq("layout_only", true);
  if (error) {
    if (isMissingTableError(error)) return [];
    // Refused rather than let through unchecked.
    throw new AppError(
      "UNKNOWN",
      "Whether these files may be used couldn't be checked just now. Try again.",
    );
  }
  const marked = ((data ?? []) as { asset_id: string }[]).map((row) => row.asset_id);
  if (!marked.length) return [];
  const { data: assets } = await supabaseAdmin.from("assets").select("id,title").in("id", marked);
  return marked.map((id) => ({
    id,
    title:
      ((assets ?? []) as { id: string; title: string | null }[]).find((row) => row.id === id)
        ?.title ?? null,
  }));
}

/** Refuses, in plain words, if any of these files is layout only. */
export async function assertPlaceable(
  assetIds: (string | null | undefined)[],
  where: Placement,
): Promise<void> {
  const marked = await layoutOnlyAmong(assetIds);
  if (marked.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      layoutOnlyRefusal(
        marked.map((file) => file.title),
        where,
      ),
    );
}

/** The privacy marks of these files, for the library's badges (none before the migration). */
export async function privacyMarks(
  assetIds: (string | null | undefined)[],
): Promise<Map<string, PrivacyMark>> {
  const ids = idsOf(assetIds);
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("asset_privacy")
    .select("asset_id,layout_only,redacted_areas,redaction_id,note,marked_at")
    .in("asset_id", ids);
  if (error) return new Map();
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
      const mark = privacyMarkOf(row);
      return mark ? [[String(row["asset_id"]), mark] as const] : [];
    }),
  );
}

/**
 * Marks a file layout only, which any member may do, or lifts the mark,
 * which only an admin may: the mark is what keeps a real client's screen out
 * of every frame.
 */
export async function setLayoutOnly(input: {
  assetId: string;
  userId: string;
  layoutOnly: boolean;
  note?: string | null | undefined;
}): Promise<PrivacyMark | null> {
  const { isAdmin } = await requireActiveMember(input.userId);
  if (!input.layoutOnly && !isAdmin)
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only an admin can lift a layout-only mark: it keeps a real client's screen out of every frame.",
    );
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("id", input.assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) throw new AppError("INVALID_PARAMETERS", "That file isn't in the library");
  const { data: existing, error } = await supabaseAdmin
    .from("asset_privacy")
    .select("asset_id,layout_only,redacted_areas,redaction_id,note,marked_at")
    .eq("asset_id", input.assetId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new AppError("INVALID_PARAMETERS", PRIVACY_NEEDS_UPDATE);
    throw new AppError("UNKNOWN", "The file's mark couldn't be read. Try again.");
  }
  const now = new Date().toISOString();
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : undefined;
  const change = input.layoutOnly
    ? {
        layout_only: true,
        marked_by: input.userId,
        marked_at: now,
        lifted_by: null,
        lifted_at: null,
      }
    : { layout_only: false, lifted_by: input.userId, lifted_at: now };
  if (!existing && !input.layoutOnly) return null;
  const { data: row, error: writeError } = existing
    ? await supabaseAdmin
        .from("asset_privacy")
        .update({ ...change, ...(note !== undefined ? { note } : {}) })
        .eq("asset_id", input.assetId)
        .select("asset_id,layout_only,redacted_areas,redaction_id,note,marked_at")
        .maybeSingle()
    : await supabaseAdmin
        .from("asset_privacy")
        .insert({ asset_id: input.assetId, ...change, note: note ?? null })
        .select("asset_id,layout_only,redacted_areas,redaction_id,note,marked_at")
        .maybeSingle();
  if (writeError || !row)
    throw new AppError("UNKNOWN", "The file's mark couldn't be saved. Try again.");
  return privacyMarkOf(row);
}
