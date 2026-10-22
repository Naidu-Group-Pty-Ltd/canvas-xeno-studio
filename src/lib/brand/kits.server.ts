/**
 * Writing a brand kit (see ../edit/brand and ./design), for the kit editor
 * and for design systems imported from a website or guidelines. A font is
 * kept only once its file is read here as a font, by the family it names
 * itself by; the logo and reference images must be pictures in the library.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import {
  FONT_FAMILY_PATTERN,
  FONT_STYLES,
  fontFamily,
  fontStyle,
  isBrandFontFile,
  type FontStyle,
} from "../edit/font-family";
import { designOf, isEmptyDesign, paletteOf } from "./design";
import { dnaOf, isEmptyDna } from "./dna";
import { ownFormulasOf } from "./own-formulas";
import type { KitInput } from "./kit-input";

/** The largest font file read. */
const FONT_MAX_BYTES = 12 * 1024 * 1024;

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

/**
 * Reads a font file from storage: the family it names itself by and the
 * style it is drawn in (null if it isn't a font).
 */
async function readStoredFont(font: {
  bucket: string;
  path: string;
}): Promise<{ family: string | null; style: FontStyle | null } | null> {
  const { data, error } = await supabaseAdmin.storage.from(font.bucket).download(font.path);
  if (error || !data || data.size > FONT_MAX_BYTES) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { family: fontFamily(bytes), style: fontStyle(bytes)?.style ?? null };
}

/** An active member's role; anyone else is refused. */
export async function activeMember(userId: string): Promise<{ role: string }> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role };
}

/** Saves a kit (new when it has no id) and returns its id. */
export async function writeBrandKit(userId: string, data: KitInput): Promise<{ id: string }> {
  await activeMember(userId);
  const db = supabaseAdmin;
  if (data.isDefault && data.projectId)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A kit kept for one project can't be the studio's default.",
    );

  const { data: existing } = data.id
    ? await db
        .from("brand_kits")
        .select("id,fonts,is_default")
        .eq("id", data.id)
        .eq("is_archived", false)
        .maybeSingle()
    : { data: null };
  if (data.id && !existing)
    throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");

  // Fonts already on the kit were read when they were added (and keep the
  // family and style read then); new ones are read now, as is the style of
  // one kept before styles were read.
  const stored = Array.isArray(existing?.fonts)
    ? (existing.fonts as { path?: unknown; family?: unknown; style?: unknown }[])
    : [];
  const isStyle = (value: unknown): value is FontStyle =>
    (FONT_STYLES as readonly unknown[]).includes(value);
  const known = new Map<string, { family: string; style: FontStyle | null }>(
    stored.flatMap((font) =>
      typeof font.path === "string" && typeof font.family === "string"
        ? [[font.path, { family: font.family, style: isStyle(font.style) ? font.style : null }]]
        : [],
    ),
  );
  const fonts: { family: string; bucket: string; path: string; style?: FontStyle }[] = [];
  for (const font of data.fonts) {
    if (!isBrandFontFile(font))
      throw new AppError("INVALID_PARAMETERS", "A font must be uploaded as a brand font");
    if (fonts.some((entry) => entry.path === font.path)) continue;
    // The family and style are the file's own, never what was sent.
    const where = { bucket: font.bucket, path: font.path };
    const kept = known.get(font.path);
    if (kept?.style) {
      fonts.push({ ...where, family: kept.family, style: kept.style });
      continue;
    }
    const read = await readStoredFont(font);
    if (kept) {
      // Kept before styles were read: its family stands, its style is read if it can be.
      fonts.push({ ...where, family: kept.family, ...(read?.style ? { style: read.style } : {}) });
      continue;
    }
    if (!read?.family || !FONT_FAMILY_PATTERN.test(read.family))
      throw new AppError(
        "INVALID_PARAMETERS",
        "A font file couldn't be read. Upload it as a TrueType (.ttf) or OpenType (.otf) file.",
      );
    fonts.push({ ...where, family: read.family, ...(read.style ? { style: read.style } : {}) });
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

  // The logo and reference images are pictures; the end card's background a picture or a video.
  const references = [...new Set(data.referenceAssetIds ?? [])];
  const ids = [data.logoAssetId, data.endCardAssetId, ...references].filter(
    (id): id is string => !!id,
  );
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
    if (references.some((id) => typeOf(id) !== "image"))
      throw new AppError("INVALID_PARAMETERS", "Reference images must be pictures in the library");
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
  // The design system goes in only when it was sent (and needs migration 0021).
  const design = {
    ...(data.palette ? { palette: paletteOf(data.palette) } : {}),
    ...(data.design ? { design: designOf(data.design) } : {}),
    ...(data.referenceAssetIds ? { reference_asset_ids: references } : {}),
    ...(data.source !== undefined
      ? {
          source: data.source
            ? {
                kind: data.source.kind,
                url: data.source.url,
                title: data.source.title,
                import_id: data.source.importId,
                imported_at: new Date().toISOString(),
              }
            : null,
        }
      : {}),
  };
  const write = (values: Record<string, unknown>) =>
    data.id
      ? db
          .from("brand_kits")
          .update(values as never)
          .eq("id", data.id)
          .select("id")
          .maybeSingle()
      : db
          .from("brand_kits")
          .insert({ ...values, created_by: userId } as never)
          .select("id")
          .maybeSingle();
  const dna = data.dna ? dnaOf(data.dna) : null;
  const formulas = data.formulas ? ownFormulasOf(data.formulas) : null;
  // Newer parts go in only when sent. Before its migration a kit saves
  // without one, unless that would lose something.
  const later = [
    ...(dna
      ? [
          {
            column: "dna",
            value: dna,
            empty: isEmptyDna(dna),
            needs: "Brand DNA needs",
            migration: "0023_brand_dna",
          },
        ]
      : []),
    ...(formulas
      ? [
          {
            column: "formulas",
            value: formulas,
            empty: !formulas.length,
            needs: "A brand's own formulas need",
            migration: "0024_brand_formulas",
          },
        ]
      : []),
  ];
  const values: Record<string, unknown> = {
    ...row,
    ...design,
    ...Object.fromEntries(later.map((entry) => [entry.column, entry.value])),
  };
  let saved = await write(values);
  for (let tries = 0; tries < later.length && isMissingColumn(saved.error); tries += 1) {
    const message = saved.error?.message ?? "";
    const missing = later.find(
      (entry) => entry.column in values && new RegExp(`\\b${entry.column}\\b`, "i").test(message),
    );
    if (!missing) break;
    if (!missing.empty)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${missing.needs} a database update (migration ${missing.migration}). Ask an admin to apply it.`,
      );
    delete values[missing.column];
    saved = await write(values);
  }
  if (isMissingColumn(saved.error) && Object.keys(design).length) {
    // Before migration 0021 a kit saves without its design system, unless that would lose some.
    if (
      data.palette?.length ||
      data.referenceAssetIds?.length ||
      data.source ||
      (data.design && !isEmptyDesign(designOf(data.design)))
    )
      throw new AppError(
        "INVALID_PARAMETERS",
        "Design systems need a database update (migration 0021_brand_design_systems). Ask an admin to apply it.",
      );
    saved = await write(row);
  }
  if (saved.error?.code === "23505")
    throw new AppError("INVALID_PARAMETERS", "That project already has a brand kit");
  if (saved.error || !saved.data)
    throw new AppError("UNKNOWN", saved.error?.message ?? "The brand kit couldn't be saved");
  if (data.isDefault) {
    const { error } = await db.rpc("set_default_brand_kit", { _kit_id: saved.data.id });
    if (error) throw new AppError("UNKNOWN", "The kit was saved but couldn't be made the default");
  }
  return { id: saved.data.id };
}
