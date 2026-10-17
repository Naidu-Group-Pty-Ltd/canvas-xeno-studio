import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { FONT_FAMILY_PATTERN, fontFamily, isBrandFontFile } from "./edit/font-family";

/**
 * Brand kits (see ./edit/brand): kept by the server, read by members. Any
 * active member may make or change one (a kit is the team's); only whoever
 * made it, or an admin, archives it. A font is kept only once its file is
 * read here as a font, by the family it names itself by.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activeMember(userId: string): Promise<{ role: string }> {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role };
}

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #1a2b3c");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

const kitInput = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  projectId: z.string().uuid().nullable().default(null),
  isDefault: z.boolean().default(false),
  logoAssetId: z.string().uuid().nullable().default(null),
  endCardAssetId: z.string().uuid().nullable().default(null),
  headingFont: z.string().regex(FONT_FAMILY_PATTERN).default("Inter"),
  bodyFont: z.string().regex(FONT_FAMILY_PATTERN).default("Inter"),
  fonts: z
    .array(
      z.object({
        family: z.string().regex(FONT_FAMILY_PATTERN),
        bucket: z.string().max(64),
        path: z.string().max(300),
      }),
    )
    .max(6)
    .default([]),
  textColor: colour.default("#ffffff"),
  accentColor: colour.default("#2563eb"),
  backgroundColor: colour.default("#0b1020"),
  titleBacking: z.enum(["outline", "halo", "box"]).default("halo"),
  uppercaseTitles: z.boolean().default(false),
  tagline: optionalText(160).default(null),
  callToAction: optionalText(60).default(null),
  website: optionalText(120).default(null),
  terms: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});

/** The largest font file read. */
const FONT_MAX_BYTES = 12 * 1024 * 1024;

/** Reads a font file from storage and gives the family it names itself by (null if it isn't a font). */
async function familyOfStoredFont(font: { bucket: string; path: string }): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db.storage.from(font.bucket).download(font.path);
  if (error || !data || data.size > FONT_MAX_BYTES) return null;
  return fontFamily(new Uint8Array(await data.arrayBuffer()));
}

export const saveBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => kitInput.parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const db = await admin();
    if (data.isDefault && data.projectId)
      throw new AppError(
        "INVALID_PARAMETERS",
        "A kit kept for one project can't be the studio's default.",
      );

    const { data: existing } = data.id
      ? await db.from("brand_kits").select("id,fonts,is_default").eq("id", data.id).maybeSingle()
      : { data: null };
    if (data.id && !existing)
      throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");

    // Fonts already on the kit were read when they were added; new ones are read now.
    const known = new Set(
      (Array.isArray(existing?.fonts) ? (existing.fonts as { path?: unknown }[]) : []).map((font) =>
        String(font.path ?? ""),
      ),
    );
    const fonts: { family: string; bucket: string; path: string }[] = [];
    for (const font of data.fonts) {
      if (!isBrandFontFile(font))
        throw new AppError("INVALID_PARAMETERS", "A font must be uploaded as a brand font");
      if (known.has(font.path)) {
        fonts.push(font);
        continue;
      }
      const family = await familyOfStoredFont(font);
      if (!family || !FONT_FAMILY_PATTERN.test(family))
        throw new AppError(
          "INVALID_PARAMETERS",
          "A font file couldn't be read. Upload it as a TrueType (.ttf) or OpenType (.otf) file.",
        );
      fonts.push({ ...font, family });
    }
    const families = new Set(["Inter", ...fonts.map((font) => font.family)]);
    for (const [which, family] of [
      ["Titles", data.headingFont],
      ["Captions", data.bodyFont],
    ] as const)
      if (!families.has(family))
        throw new AppError(
          "INVALID_PARAMETERS",
          `${which} are set in ${family}, which isn't one of the kit's fonts`,
        );

    // The logo is a picture; the end card's background a picture or a video.
    const ids = [data.logoAssetId, data.endCardAssetId].filter((id): id is string => !!id);
    if (ids.length) {
      const { data: assets } = await db
        .from("assets")
        .select("id,asset_type")
        .in("id", ids)
        .is("deleted_at", null);
      const typeOf = (id: string | null) =>
        id ? ((assets ?? []).find((asset) => asset.id === id)?.asset_type ?? null) : null;
      if (data.logoAssetId && typeOf(data.logoAssetId) !== "image")
        throw new AppError("INVALID_PARAMETERS", "The logo must be an image in the library");
      if (data.endCardAssetId && !["image", "video"].includes(typeOf(data.endCardAssetId) ?? ""))
        throw new AppError(
          "INVALID_PARAMETERS",
          "The end card's background must be an image or a video in the library",
        );
    }

    const row = {
      name: data.name,
      project_id: data.projectId,
      logo_asset_id: data.logoAssetId,
      end_card_asset_id: data.endCardAssetId,
      heading_font: data.headingFont,
      body_font: data.bodyFont,
      fonts,
      text_color: data.textColor.toLowerCase(),
      accent_color: data.accentColor.toLowerCase(),
      background_color: data.backgroundColor.toLowerCase(),
      title_backing: data.titleBacking,
      uppercase_titles: data.uppercaseTitles,
      tagline: data.tagline,
      call_to_action: data.callToAction,
      website: data.website,
      terms: [...new Set(data.terms)],
      ...(data.isDefault ? {} : { is_default: false }),
    };
    const saved = data.id
      ? await db.from("brand_kits").update(row).eq("id", data.id).select("id").maybeSingle()
      : await db
          .from("brand_kits")
          .insert({ ...row, created_by: context.userId })
          .select("id")
          .maybeSingle();
    if (saved.error?.code === "23505")
      throw new AppError("INVALID_PARAMETERS", "That project already has a brand kit");
    if (saved.error || !saved.data)
      throw new AppError("UNKNOWN", saved.error?.message ?? "The brand kit couldn't be saved");
    if (data.isDefault) {
      const { error } = await db.rpc("set_default_brand_kit", { _kit_id: saved.data.id });
      if (error)
        throw new AppError("UNKNOWN", "The kit was saved but couldn't be made the default");
    }
    return { id: saved.data.id };
  });

export const archiveBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const member = await activeMember(context.userId);
    const db = await admin();
    const { data: kit } = await db
      .from("brand_kits")
      .select("id,created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!kit) throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");
    if (kit.created_by !== context.userId && member.role !== "admin")
      throw new AppError(
        "NOT_AUTHORIZED",
        "Only the person who made this kit, or an admin, can archive it",
      );
    const { error } = await db
      .from("brand_kits")
      .update({ is_archived: true, is_default: false })
      .eq("id", data.id);
    if (error) throw new AppError("UNKNOWN", error.message);
    return { ok: true };
  });
