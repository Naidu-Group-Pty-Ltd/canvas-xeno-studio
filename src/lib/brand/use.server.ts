/**
 * A brand kit as the server's AI and generation steps use it: the kit, the
 * block an AI planner or writer reads (what the brand is, its look, voice
 * and rules), and the snapshot a long video keeps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { brandKitOf, type BrandKit } from "../edit/brand";
import { brandBrief, brandSnapshot, type BrandSnapshot, type BriefFocus } from "./design";

/** A kit by id (not archived), or null. */
export async function loadBrandKit(kitId: string | null | undefined): Promise<BrandKit | null> {
  if (!kitId) return null;
  const { data } = await supabaseAdmin
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .eq("is_archived", false)
    .maybeSingle();
  return data ? brandKitOf(data as unknown as Record<string, unknown>) : null;
}

/** A kit that must exist (a request named it). */
export async function requireBrandKit(kitId: string): Promise<BrandKit> {
  const kit = await loadBrandKit(kitId);
  if (!kit) throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");
  return kit;
}

/**
 * The brand for an AI that plans, writes or prompts for it: empty when no
 * kit is named. Its heading tells the AI to keep everything in it.
 */
export async function brandBlock(
  kitId: string | null | undefined,
  max?: number,
  focus?: BriefFocus,
): Promise<string> {
  const kit = await loadBrandKit(kitId);
  return kit ? brandBlockOf(kit, max, focus) : "";
}

export function brandBlockOf(kit: BrandKit, max?: number, focus?: BriefFocus): string {
  return `BRAND (make everything in this brand: its look, palette, voice and rules; never put its logo or text in a picture unless asked):\n${brandBrief(kit, max, focus)}`;
}

/** What a long video keeps of the kit it is made in. */
export async function brandSnapshotFor(
  kitId: string | null | undefined,
): Promise<BrandSnapshot | null> {
  const kit = await loadBrandKit(kitId);
  return kit ? brandSnapshot(kit) : null;
}
