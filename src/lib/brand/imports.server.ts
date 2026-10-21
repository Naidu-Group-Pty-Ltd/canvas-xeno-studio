/**
 * Brand imports: a brand's design system read from its website, its
 * guidelines or its code into a proposal a person reviews, then kept as a
 * brand kit.
 *
 * A website is scanned here: its page (title, words, logo, pictures, fonts
 * loaded), its stylesheets (every colour and how much it is used, the
 * typefaces and what they set) and its web manifest. Its logo candidates and
 * pictures are staged under generation-inputs/brand-imports/<import id>/ so
 * the review can show them and the AI can look at them. A document is read
 * in the browser (its text and page pictures, uploaded there first) and its
 * colour codes are found here. A brand's code is read from its GitHub
 * repositories (./scan-repos, ./github-source): its tokens, typefaces and
 * scales, each with the file and line it is declared on, kept with the
 * import as its `code`, and its logo files staged like a website's. Then the
 * AI reads it all (./synthesis.server) and the brand's Google fonts are
 * installed (./fonts.server).
 *
 * Each step is recorded on the import (its stage), so the review can follow.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { colourName, deltaE2000, isNeutral } from "./colour";
import { extractColourCodes } from "./colour-codes";
import { designOf, EMPTY_DESIGN, normalizeHex, type BrandDesign } from "./design";
import {
  decodeText,
  fetchCapped,
  imageKind,
  imageSize,
  inBatches,
  sanitizeSvg,
} from "./fetch.server";
import { installGoogleFont, isSystemFamily } from "./fonts.server";
import { githubSource } from "./github-source";
import { writeBrandKit } from "./kits.server";
import type { KitInput } from "./kit-input";
import {
  brandNameOf,
  proposalFromScan,
  proposalOf,
  PROPOSAL_LIMITS,
  websiteOf,
  type BrandProposal,
  type FoundColour,
  type ProposedFont,
  type ScanSignals,
  type StagedImage,
} from "./proposal";
import {
  CODE_SCAN_LIMITS,
  codeBrandName,
  codeEvidenceText,
  codeScanSignals,
  repoLabel,
  repoUrl,
  type CodeDesignSystem,
  type RepoRef,
} from "./scan-code";
import { scanCss } from "./scan-css";
import { scanHtml } from "./scan-html";
import { scanRepos } from "./scan-repos";
import { readDesignSystem, type DesignEvidence, type ReadTypeface } from "./synthesis.server";

export const IMPORT_BUCKET = "generation-inputs";
export const IMPORT_PREFIX = "brand-imports/";
export const importFolder = (importId: string) => `${IMPORT_PREFIX}${importId}/`;

const db = supabaseAdmin;

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? ""));

const NEEDS_MIGRATION =
  "Importing a design system needs a database update (migration 0021_brand_design_systems). Ask an admin to apply it.";
const NEEDS_CODE_MIGRATION =
  "Importing a design system from code needs a database update (migration 0026_brand_code_imports). Ask an admin to apply it.";

/** A check the table refuses (an import kind it doesn't know yet), or a column it doesn't have. */
const isRefusedKind = (error: { code?: string; message?: string } | null) =>
  !!error && error.code === "23514" && /kind/i.test(error.message ?? "");
const isMissingColumn = (error: { code?: string; message?: string } | null, column: string) =>
  !!error &&
  (error.code === "42703" || error.code === "PGRST204") &&
  (error.message ?? "").includes(column);

/* ------------------------------------------------------------------ */
/* The import's record                                                 */
/* ------------------------------------------------------------------ */

export type ImportKind = "url" | "document" | "repos";

export async function createImport(input: {
  userId: string;
  kind: ImportKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
}): Promise<string> {
  const { data, error } = await db
    .from("brand_imports")
    .insert({
      kind: input.kind,
      source_url: input.sourceUrl,
      source_title: input.sourceTitle?.slice(0, 300) ?? null,
      status: "scanning",
      stage: input.kind === "document" ? "Uploading the pages" : "Starting",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (isMissingTable(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_MIGRATION);
  if (input.kind === "repos" && isRefusedKind(error))
    throw new AppError("INVALID_PARAMETERS", NEEDS_CODE_MIGRATION);
  if (error || !data) throw new AppError("UNKNOWN", error?.message ?? "The import couldn't start");
  return data.id;
}

async function setStage(importId: string, stage: string): Promise<void> {
  await db.from("brand_imports").update({ stage }).eq("id", importId);
}

async function failImport(importId: string, message: string): Promise<void> {
  await db
    .from("brand_imports")
    .update({ status: "failed", stage: null, error: message.slice(0, 1000) })
    .eq("id", importId);
}

/** An import as the server reads it, or null when it is gone. */
export async function loadImport(importId: string) {
  const { data, error } = await db
    .from("brand_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (isMissingTable(error)) throw new AppError("INVALID_PARAMETERS", NEEDS_MIGRATION);
  return data;
}

/* ------------------------------------------------------------------ */
/* Staging pictures                                                    */
/* ------------------------------------------------------------------ */

const RASTER = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function stage(
  importId: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const path = `${importFolder(importId)}${name}`;
  const { error } = await db.storage
    .from(IMPORT_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  return error ? null : path;
}

/** Fetches a picture from the site and stages it; null when it isn't a usable one. */
async function stageFromUrl(
  importId: string,
  url: string,
  key: string,
  kind: StagedImage["kind"],
  options: { maxBytes: number; minSide: number; svg: boolean },
): Promise<StagedImage | null> {
  const fetched = await fetchCapped(url, {
    maxBytes: options.maxBytes,
    timeoutMs: 12_000,
    headers: { accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8" },
  });
  if (!fetched.ok) return null;
  return stageBytes(importId, fetched.bytes, key, kind, url, options);
}

/**
 * Stages a picture's bytes (a site's, or a file from a repository); null when
 * they aren't a picture, are too small to use, or are an SVG where none is wanted.
 */
async function stageBytes(
  importId: string,
  bytes: Uint8Array,
  key: string,
  kind: StagedImage["kind"],
  origin: string,
  options: { minSide: number; svg: boolean },
): Promise<StagedImage | null> {
  const detected = imageKind(bytes);
  if (!detected) return null;
  if (detected.mime === "image/svg+xml") {
    if (!options.svg) return null;
    return stageSvg(importId, decodeText(bytes), key, origin);
  }
  if (!RASTER.has(detected.mime)) return null;
  const size = imageSize(bytes);
  if (size && Math.min(size.width, size.height) < options.minSide) return null;
  const path = await stage(importId, `${key}.${detected.extension}`, bytes, detected.mime);
  return path
    ? {
        key,
        kind,
        bucket: IMPORT_BUCKET,
        path,
        mime: detected.mime,
        width: size?.width ?? null,
        height: size?.height ?? null,
        origin,
        bytes: bytes.byteLength,
      }
    : null;
}

/** The size an SVG says it is drawn at (its width and height, else its view box). */
function svgSize(svg: string): { width: number; height: number } | null {
  const tag = /<svg[^>]*>/i.exec(svg)?.[0] ?? "";
  const width = Number(/\swidth=["']?([\d.]+)(px)?["'\s>]/i.exec(tag)?.[1]);
  const height = Number(/\sheight=["']?([\d.]+)(px)?["'\s>]/i.exec(tag)?.[1]);
  if (width > 0 && height > 0) return { width: Math.round(width), height: Math.round(height) };
  const box = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return box ? { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) } : null;
}

async function stageSvg(
  importId: string,
  markup: string,
  key: string,
  origin: string,
): Promise<StagedImage | null> {
  if (markup.length > 300_000) return null;
  const svg = sanitizeSvg(markup);
  if (!svg) return null;
  const bytes = new TextEncoder().encode(svg);
  const path = await stage(importId, `${key}.svg`, bytes, "image/svg+xml");
  const size = svgSize(svg);
  return path
    ? {
        key,
        kind: "logo",
        bucket: IMPORT_BUCKET,
        path,
        mime: "image/svg+xml",
        width: size?.width ?? null,
        height: size?.height ?? null,
        origin,
        bytes: bytes.byteLength,
      }
    : null;
}

async function signedLinks(images: StagedImage[]): Promise<{ image: StagedImage; url: string }[]> {
  const out: { image: StagedImage; url: string }[] = [];
  for (const image of images) {
    const { data } = await db.storage.from(image.bucket).createSignedUrl(image.path, 1800);
    if (data?.signedUrl) out.push({ image, url: data.signedUrl });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

/**
 * The heading and body typefaces with a font file each, where one can be
 * installed: the brand's own family from Google Fonts, else the close Google
 * font standing in for it. One file per family (the renderer sets a family
 * as drawn), so a family used for both is installed once, at the headings'
 * weight.
 */
async function installFonts(typefaces: ReadTypeface[], notes: string[]): Promise<ProposedFont[]> {
  const heading = typefaces.find((face) => face.role === "heading") ?? typefaces[0];
  const body = typefaces.find((face) => face.role === "body") ?? heading;
  const out: ProposedFont[] = [];
  for (const [role, face] of [
    ["heading", heading],
    ["body", body],
  ] as const) {
    if (!face) continue;
    const same = out.find((font) => font.family.toLowerCase() === face.family.toLowerCase());
    if (same) {
      out.push({ ...same, role });
      continue;
    }
    const weight = face.weight ?? (role === "heading" ? 700 : 400);
    let installed = isSystemFamily(face.family)
      ? null
      : await installGoogleFont(face.family, weight);
    const own = !!installed;
    if (!installed && face.alternative && face.alternative !== face.family)
      installed = await installGoogleFont(face.alternative, weight);
    if (!installed)
      notes.push(
        `${face.family} (${role === "heading" ? "titles" : "captions"}) couldn't be installed: Inter is used until its font file is uploaded to the kit.`,
      );
    else if (!own)
      notes.push(
        `${face.family} is ${face.source === "adobe" ? "an Adobe font" : face.source === "system" ? "a system font" : "a font the studio can't download"}: ${installed.family} stands in for it. Upload ${face.family}'s own file to the kit if you're licensed to use it in video.`,
      );
    out.push({
      role,
      family: face.family,
      category: face.category,
      weight,
      source: own ? "google" : face.source,
      alternative: own ? null : face.alternative,
      installed,
    });
  }
  return out;
}

/** The typefaces a site uses for headings and body text, by the scan alone. */
function typefacesFromScan(
  fonts: ScanSignals["fonts"],
  googleFonts: string[],
  adobe: boolean,
): ReadTypeface[] {
  const pick = (role: "heading" | "body") =>
    fonts.find((font) => font.roles.includes(role)) ?? fonts[0];
  return (["heading", "body"] as const).flatMap((role) => {
    const font = pick(role);
    if (!font) return [];
    const google = googleFonts.some((name) => name.toLowerCase() === font.family.toLowerCase());
    return [
      {
        role,
        family: font.family,
        category: null,
        weight: role === "heading" ? 700 : 400,
        source: google ? "google" : adobe ? "adobe" : "unknown",
        alternative: null,
      },
    ];
  });
}

/* ------------------------------------------------------------------ */
/* Finishing                                                           */
/* ------------------------------------------------------------------ */

function typographyOf(fonts: ProposedFont[], read: BrandDesign["typography"]) {
  return fonts.map((font) => ({
    role: font.role,
    family: font.family,
    category: font.category,
    weight: font.weight,
    source: font.source,
    rendered: font.installed?.family ?? null,
    notes: read.find((face) => face.role === font.role)?.notes ?? null,
  }));
}

async function finish(
  importId: string,
  evidence: DesignEvidence,
  signals: ScanSignals,
  notes: string[],
  staged: StagedImage[],
  /** What a code import read, kept with it (needs migration 0026). */
  code: CodeDesignSystem | null = null,
): Promise<void> {
  await setStage(importId, "Reading the brand");
  const read = await readDesignSystem(evidence);
  if (!read.ok) notes.push(`Read from the scan alone: ${read.reason}.`);

  await setStage(importId, "Installing its fonts");
  const typefaces = read.ok
    ? read.design.typefaces
    : typefacesFromScan(signals.fonts, signals.googleFonts, signals.adobeFonts);
  const fonts = await installFonts(typefaces, notes);

  let proposal: BrandProposal;
  if (read.ok) {
    const { typefaces: _read, ...design } = read.design;
    proposal = {
      ...design,
      fonts,
      design: { ...design.design, typography: typographyOf(fonts, design.design.typography) },
      terms: [...new Set([design.name, ...design.terms])].slice(0, 12),
      notes: [...design.notes, ...notes].slice(0, PROPOSAL_LIMITS.notes),
    };
  } else {
    proposal = proposalFromScan({
      name: evidence.name,
      signals,
      fonts,
      logos: evidence.logos,
      imagery: evidence.imagery,
      website: evidence.website,
      tagline: null,
      notes: notes.slice(0, PROPOSAL_LIMITS.notes),
    });
  }
  const values = {
    status: "ready",
    stage: null,
    error: null,
    signals: signals as never,
    proposal: proposal as never,
    staged: staged.map((image) => ({ key: image.key, path: image.path })) as never,
  };
  let { error } = await db
    .from("brand_imports")
    .update(code ? { ...values, code: code as never } : values)
    .eq("id", importId);
  // Without migration 0026 the import is still ready to keep; only its tokens aren't.
  if (code && isMissingColumn(error, "code")) {
    proposal.notes = [
      ...proposal.notes,
      "The tokens read from the code weren't kept (migration 0026_brand_code_imports isn't applied).",
    ].slice(0, PROPOSAL_LIMITS.notes);
    ({ error } = await db
      .from("brand_imports")
      .update({ ...values, proposal: proposal as never })
      .eq("id", importId));
  }
  if (error) throw new AppError("UNKNOWN", error.message);
}

/* ------------------------------------------------------------------ */
/* A website                                                           */
/* ------------------------------------------------------------------ */

/** An address someone typed, as a page to fetch: https:// added when it has no scheme. */
export function siteUrlOf(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/** The families a Google Fonts stylesheet address asks for. */
export function googleFamiliesOf(href: string): string[] {
  try {
    const url = new URL(href);
    if (url.hostname !== "fonts.googleapis.com") return [];
    return url.searchParams
      .getAll("family")
      .flatMap((value) => value.split("|"))
      .map((value) => value.split(":")[0]!.replace(/\+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const IMPORT_RULE = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi;

/** Scans a website into a proposal. Throws (and records why) when the page can't be read. */
export async function scanWebsite(importId: string, rawUrl: string): Promise<void> {
  try {
    await scanWebsiteSteps(importId, rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The website couldn't be scanned";
    await failImport(importId, message);
    throw error instanceof AppError ? error : new AppError("UNKNOWN", message);
  }
}

async function scanWebsiteSteps(importId: string, rawUrl: string): Promise<void> {
  const notes: string[] = [];
  const url = siteUrlOf(rawUrl);
  if (!url) throw new AppError("INVALID_PARAMETERS", "That isn't a website address");

  await setStage(importId, "Reading the page");
  const page = await fetchCapped(url, {
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: 20_000,
    accept: ["text/html", "application/xhtml"],
    headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
  });
  if (!page.ok)
    throw new AppError("INVALID_PARAMETERS", `The page couldn't be read: ${page.reason}.`);
  const html = scanHtml(decodeText(page.bytes, page.type), page.url);

  await setStage(importId, "Reading its styles");
  const googleFonts = new Set(html.googleFonts);
  const sheets = await inBatches(html.stylesheets.slice(0, 10), 4, (href) =>
    fetchCapped(href, { maxBytes: 2 * 1024 * 1024, timeoutMs: 12_000 }),
  );
  const texts: string[] = [html.inlineCss];
  const imported: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.ok || sheet.type.includes("html")) continue;
    const text = decodeText(sheet.bytes, sheet.type);
    texts.push(text);
    for (const match of text.matchAll(IMPORT_RULE)) {
      try {
        const href = new URL(match[1]!, sheet.url).href;
        const families = googleFamiliesOf(href);
        if (families.length) families.forEach((family) => googleFonts.add(family));
        else if (!imported.includes(href)) imported.push(href);
      } catch {
        // An @import that isn't an address is skipped.
      }
    }
  }
  const more = await inBatches(imported.slice(0, 6), 3, (href) =>
    fetchCapped(href, { maxBytes: 1024 * 1024, timeoutMs: 10_000 }),
  );
  for (const sheet of more)
    if (sheet.ok && !sheet.type.includes("html")) texts.push(decodeText(sheet.bytes, sheet.type));
  const css = scanCss(texts.join("\n"), { baseUrl: page.url });
  if (sheets.length && !sheets.some((sheet) => sheet.ok))
    notes.push("The site's stylesheets couldn't be read, so its colours come from the page alone.");

  // The web manifest names the colours a phone shows the site in.
  const themeColours = [...html.themeColours];
  if (html.manifestUrl) {
    const manifest = await fetchCapped(html.manifestUrl, { maxBytes: 256 * 1024, timeoutMs: 8000 });
    if (manifest.ok) {
      try {
        const parsed = JSON.parse(decodeText(manifest.bytes)) as Record<string, unknown>;
        for (const key of ["theme_color", "background_color"]) {
          const value = parsed[key];
          const hex = typeof value === "string" ? normalizeHex(value.trim().slice(0, 7)) : null;
          if (hex) themeColours.push(hex);
        }
      } catch {
        // A manifest that isn't JSON is skipped.
      }
    }
  }

  // Colours: the stylesheets' (by use), then the theme colours, which count for a tenth of all use.
  const total = css.colours.reduce((sum, colour) => sum + colour.weight, 0) || 1;
  const colours: FoundColour[] = css.colours.slice(0, PROPOSAL_LIMITS.colours).map((colour) => ({
    hex: colour.hex,
    name: colourName(colour.hex),
    share: colour.weight / total,
    neutral: colour.neutral,
    from: [
      ...colour.variables.map((name) => `--${name.replace(/^--/, "")}`),
      ...colour.properties,
    ].slice(0, 6),
  }));
  for (const theme of themeColours) {
    const hex = /^#[0-9a-f]{6}$/i.test(theme) ? theme.toLowerCase() : null;
    if (!hex) continue;
    const near = colours.find((colour) => deltaE2000(colour.hex, hex) < 4);
    if (near) {
      near.share += 0.1;
      if (!near.from.includes("theme-color")) near.from = ["theme-color", ...near.from].slice(0, 6);
    } else
      colours.push({
        hex,
        name: colourName(hex),
        share: 0.1,
        neutral: isNeutral(hex),
        from: ["theme-color"],
      });
  }
  colours.sort((a, b) => b.share - a.share);
  const shareTotal = colours.reduce((sum, colour) => sum + colour.share, 0) || 1;
  for (const colour of colours) colour.share = Number((colour.share / shareTotal).toFixed(4));

  const fontWeight = css.fonts.reduce((sum, font) => sum + font.weight, 0) || 1;
  const fonts = css.fonts.slice(0, PROPOSAL_LIMITS.fonts).map((font) => ({
    family: font.family,
    roles: [...font.roles],
    share: Number((font.weight / fontWeight).toFixed(4)),
  }));

  await setStage(importId, "Collecting the logo and pictures");
  const staged: StagedImage[] = [];
  const logos: StagedImage[] = [];
  for (const candidate of html.logos) {
    if (logos.length >= PROPOSAL_LIMITS.logos) break;
    const key = `logo-${logos.length + 1}`;
    const image = candidate.svg
      ? await stageSvg(importId, candidate.svg, key, "inline SVG")
      : candidate.url
        ? await stageFromUrl(importId, candidate.url, key, "logo", {
            maxBytes: 3 * 1024 * 1024,
            minSide: 16,
            svg: true,
          })
        : null;
    if (image) logos.push(image);
  }
  const pictureUrls = [
    ...new Set([...(html.ogImage ? [html.ogImage] : []), ...html.images.map((image) => image.url)]),
  ].filter((href) => !logos.some((logo) => logo.origin === href));
  const fetchedImages = await inBatches(pictureUrls.slice(0, 12), 4, (href, index) =>
    stageFromUrl(importId, href, `image-${index + 1}`, "image", {
      maxBytes: 10 * 1024 * 1024,
      minSide: 200,
      svg: false,
    }),
  );
  const fetched = fetchedImages.filter((image): image is StagedImage => !!image);
  const imagery = fetched.slice(0, PROPOSAL_LIMITS.imagery);
  staged.push(...logos, ...fetched);
  if (!logos.length) notes.push("No logo was found on the page: choose one from the library.");

  const name = brandNameOf({
    jsonLdName: html.jsonLd.name,
    siteName: html.siteName,
    title: html.title,
    url: page.url,
  });
  const signals: ScanSignals = {
    url: page.url,
    title: html.title,
    description: html.description,
    colours,
    fonts,
    googleFonts: [...googleFonts].slice(0, 12),
    adobeFonts: html.adobeFonts,
    headings: html.headings,
    ctas: html.ctas,
    pages: null,
    characters: html.text.length,
  };
  // The AI sees the pictures it can read: raster logos first, then the site's imagery.
  const shown = [
    ...logos.filter((logo) => RASTER.has(logo.mime)).slice(0, 2),
    ...imagery.slice(0, 6),
  ];
  const evidence: DesignEvidence = {
    kind: "url",
    name,
    url: page.url,
    title: html.title,
    description: html.description ?? html.jsonLd.slogan,
    website: websiteOf(page.url),
    colours,
    fonts,
    googleFonts: signals.googleFonts,
    adobeFonts: html.adobeFonts,
    headings: html.headings,
    ctas: html.ctas,
    copy: [html.jsonLd.slogan ? `Slogan: ${html.jsonLd.slogan}` : "", html.text]
      .filter(Boolean)
      .join("\n"),
    profiles: [...new Set([...html.socials, ...html.jsonLd.sameAs])].slice(0, 12),
    pictures: await signedLinks(shown),
    logos,
    imagery,
  };
  await finish(importId, evidence, signals, notes, staged);
}

/* ------------------------------------------------------------------ */
/* Its code                                                            */
/* ------------------------------------------------------------------ */

/** The step the review shows while repositories are read; the repository and file follow it. */
export const CODE_STAGE = "Reading the repositories";

/**
 * Reads a brand's design system from its GitHub repositories (the first is
 * its own source) into a proposal. `token` reads private ones for this scan
 * and is never kept; without one the studio's own GITHUB_TOKEN is used, if it
 * has one. Throws (and records why) when none of them can be read.
 */
export async function scanRepositories(
  importId: string,
  refs: RepoRef[],
  options: { token?: string | null } = {},
): Promise<void> {
  try {
    await scanRepositoriesSteps(importId, refs, options.token ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repositories couldn't be read";
    await failImport(importId, message);
    throw error instanceof AppError ? error : new AppError("UNKNOWN", message);
  }
}

async function scanRepositoriesSteps(
  importId: string,
  refs: RepoRef[],
  token: string | null,
): Promise<void> {
  if (!refs.length) throw new AppError("INVALID_PARAMETERS", "Name at least one repository");
  const github = githubSource({ token: token || process.env["GITHUB_TOKEN"]?.trim() || null });

  // Each step as the review shows it, written in order (a row update per step).
  let staging: Promise<void> = Promise.resolve();
  const onStage = (detail: string) => {
    staging = staging
      .then(() => setStage(importId, `${CODE_STAGE}: ${detail}`.slice(0, 200)))
      .catch(() => undefined);
  };
  let scanned: Awaited<ReturnType<typeof scanRepos>>;
  try {
    scanned = await scanRepos(refs, github, { onStage });
  } catch (error) {
    throw new AppError(
      "INVALID_PARAMETERS",
      error instanceof Error ? error.message : "The repositories couldn't be read",
    );
  } finally {
    await staging;
  }
  const { system, scans } = scanned;
  const notes = [...system.notes];

  await setStage(importId, "Collecting the logos");
  // The brand's own repository's logo files first, then the others', drawn ones before pictures.
  const logos: StagedImage[] = [];
  // The same file kept in several repositories (a shared favicon) is offered once.
  const seen = new Set<string>();
  for (const scan of scans) {
    for (const path of scan.logos) {
      if (logos.length >= PROPOSAL_LIMITS.logos) break;
      const bytes = await github
        .bytes(scan.ref, scan.sha, path, CODE_SCAN_LIMITS.logoBytes)
        .catch(() => null);
      if (!bytes) continue;
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      if (seen.has(digest)) continue;
      seen.add(digest);
      const image = await stageBytes(
        importId,
        bytes,
        `logo-${logos.length + 1}`,
        "logo",
        `${repoLabel(scan.ref)} ${path}`,
        { minSide: 16, svg: true },
      );
      if (image) logos.push(image);
    }
  }
  if (!logos.length)
    notes.push("No logo file was found in the repositories: choose one from the library.");
  // Code says what the colours and type are; the look of the brand's pictures and its voice aren't in it.
  notes.push(
    "Code shows the brand's colours, type and scales, not its imagery or voice: to keep those, update the kit read from its website or guidelines.",
  );

  const signals = codeScanSignals(system);
  const primary = refs[0]!;
  const evidence: DesignEvidence = {
    kind: "repos",
    name: codeBrandName(system),
    url: repoUrl(primary),
    title: system.title,
    description: system.description,
    website: websiteOf(system.homepage),
    colours: signals.colours,
    fonts: signals.fonts,
    googleFonts: signals.googleFonts,
    adobeFonts: signals.adobeFonts,
    headings: [],
    ctas: [],
    copy: codeEvidenceText(system),
    profiles: [],
    // The AI can look at pictures, not SVG: the raster logos.
    pictures: await signedLinks(logos.filter((logo) => RASTER.has(logo.mime)).slice(0, 2)),
    logos,
    imagery: [],
  };
  await finish(importId, evidence, signals, notes, logos, system);
}

/* ------------------------------------------------------------------ */
/* A guidelines document                                               */
/* ------------------------------------------------------------------ */

export interface DocumentPage {
  path: string;
  mime: string;
  width: number | null;
  height: number | null;
  /** A whole page's picture, or a picture found in the document. */
  kind: "page" | "image";
  page: number | null;
  bytes: number;
}

/** Reads a guidelines document (its text, and the pictures uploaded for it) into a proposal. */
export async function readDocument(
  importId: string,
  input: { title: string; text: string; pageCount: number | null; pictures: DocumentPage[] },
): Promise<void> {
  try {
    await readDocumentSteps(importId, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document couldn't be read";
    await failImport(importId, message);
    throw error instanceof AppError ? error : new AppError("UNKNOWN", message);
  }
}

async function readDocumentSteps(
  importId: string,
  input: { title: string; text: string; pageCount: number | null; pictures: DocumentPage[] },
): Promise<void> {
  const notes: string[] = [];
  await setStage(importId, "Finding its colour codes");
  const codes = extractColourCodes(input.text);
  // How often the guide gives each colour (in any notation), as its share.
  const sum = codes.reduce((total, code) => total + (code.hex ? code.count : 0), 0) || 1;
  const colours: FoundColour[] = [];
  // A swatch with an exact screen value (HEX or RGB) isn't also kept by its
  // print value's approximation (CMYK): that is noted on it instead.
  const exact = new Set(
    codes.flatMap((code) =>
      code.label && (code.system === "hex" || code.system === "rgb") ? [code.label] : [],
    ),
  );
  for (const code of codes) {
    if (!code.hex) continue;
    if (code.system !== "hex" && code.system !== "rgb" && code.label && exact.has(code.label)) {
      const owner = colours.find((colour) => colour.name === code.label);
      if (owner && owner.from.length < 6) owner.from.push(code.raw.slice(0, 60));
      continue;
    }
    if (colours.some((colour) => colour.hex === code.hex)) continue;
    colours.push({
      hex: code.hex,
      name: code.label ?? colourName(code.hex),
      share: Number((code.count / sum).toFixed(4)),
      neutral: isNeutral(code.hex),
      from: [code.raw.slice(0, 60)],
    });
  }
  const pantone = codes.filter((code) => !code.hex).map((code) => code.raw);
  if (pantone.length)
    notes.push(
      `Spot colours without a screen value (${pantone.slice(0, 3).join(", ")}) were matched by eye.`,
    );
  if (!colours.length)
    notes.push("No colour codes were found in the text: colours are read from its pages.");

  const folder = importFolder(importId);
  const pictures = input.pictures
    .filter((picture) => picture.path.startsWith(folder) && RASTER.has(picture.mime))
    .slice(0, PROPOSAL_LIMITS.pages + PROPOSAL_LIMITS.imagery);
  const staged: StagedImage[] = pictures.map((picture, index) => ({
    key: picture.kind === "page" ? `page-${picture.page ?? index + 1}` : `image-${index + 1}`,
    kind: picture.kind,
    bucket: IMPORT_BUCKET,
    path: picture.path,
    mime: picture.mime,
    width: picture.width,
    height: picture.height,
    origin: picture.page ? `page ${picture.page}` : null,
    bytes: picture.bytes,
  }));
  // Keys stay distinct even when two pictures come from the same page.
  const seen = new Map<string, number>();
  for (const image of staged) {
    const count = seen.get(image.key) ?? 0;
    seen.set(image.key, count + 1);
    if (count) image.key = `${image.key}-${count + 1}`;
  }
  const pages = staged.filter((image) => image.kind === "page");
  const embedded = staged.filter((image) => image.kind === "image");
  const signals: ScanSignals = {
    url: null,
    title: input.title,
    description: null,
    colours,
    fonts: [],
    googleFonts: [],
    adobeFonts: false,
    headings: [],
    ctas: [],
    pages: input.pageCount,
    characters: input.text.length,
  };
  const evidence: DesignEvidence = {
    kind: "document",
    name: brandNameOf({ title: input.title }),
    url: null,
    title: input.title,
    description: null,
    website: null,
    colours,
    fonts: [],
    googleFonts: [],
    adobeFonts: false,
    headings: [],
    ctas: [],
    copy: input.text.slice(0, 24_000),
    profiles: [],
    // Pages first (where swatches and type specimens are), then the pictures in it.
    pictures: await signedLinks([...pages.slice(0, 6), ...embedded.slice(0, 4)]),
    logos: [],
    imagery: [...embedded, ...pages],
  };
  await finish(importId, evidence, signals, notes, staged);
}

/* ------------------------------------------------------------------ */
/* Keeping it as a kit                                                 */
/* ------------------------------------------------------------------ */

export interface ApplyChoices {
  importId: string;
  kit: Omit<KitInput, "logoAssetId" | "referenceAssetIds" | "source" | "design" | "palette"> & {
    palette: NonNullable<KitInput["palette"]>;
    design: Record<string, unknown>;
  };
  /** The staged logo to keep (its key), or a library picture (a logo drawn from an SVG). */
  logo: { key: string } | { assetId: string } | null;
  /** Staged pictures to keep as style references. */
  references: string[];
  /** Library pictures the kit already uses as references, kept beside the new ones. */
  keepReferences: string[];
}

/** Registers a staged picture as a library image. */
async function keepStaged(
  userId: string,
  projectId: string | null,
  image: StagedImage,
  title: string,
  importId: string,
): Promise<string> {
  // Kept before (the same import kept twice): the same library picture.
  const { data: kept } = await db
    .from("assets")
    .select("id")
    .eq("storage_bucket", image.bucket)
    .eq("storage_path", image.path)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (kept) return kept.id;
  const { data, error } = await db
    .from("assets")
    .insert({
      project_id: projectId,
      uploaded_by: userId,
      asset_type: "image",
      source_type: "uploaded",
      title: title.slice(0, 200),
      storage_bucket: image.bucket,
      storage_path: image.path,
      mime_type: image.mime,
      file_size: image.bytes || null,
      width: image.width,
      height: image.height,
      metadata: {
        source: "brand_import",
        brand_import_id: importId,
        origin: image.origin,
      } as never,
    })
    .select("id")
    .single();
  if (error || !data) throw new AppError("UNKNOWN", error?.message ?? "A picture couldn't be kept");
  return data.id;
}

/** Keeps a reviewed import as a brand kit (a new one, or the one it updates). */
export async function applyImport(
  userId: string,
  choices: ApplyChoices,
): Promise<{ kitId: string }> {
  const row = await loadImport(choices.importId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That import no longer exists");
  if (row.status === "applied")
    throw new AppError("INVALID_PARAMETERS", "That import was already kept as a brand kit");
  if (row.status !== "ready")
    throw new AppError("INVALID_PARAMETERS", "That import has nothing to keep yet");
  const proposal = proposalOf(row.proposal);
  if (!proposal) throw new AppError("INVALID_PARAMETERS", "That import has nothing to keep");
  const projectId = choices.kit.projectId ?? null;
  const name = choices.kit.name;

  let logoAssetId: string | null = null;
  if (choices.logo && "assetId" in choices.logo) logoAssetId = choices.logo.assetId;
  else if (choices.logo) {
    const { key } = choices.logo;
    const staged = proposal.logos.find((logo) => logo.key === key);
    if (!staged) throw new AppError("INVALID_PARAMETERS", "That logo is no longer there");
    if (!RASTER.has(staged.mime))
      throw new AppError("INVALID_PARAMETERS", "An SVG logo is drawn as a picture first");
    logoAssetId = await keepStaged(userId, projectId, staged, `${name} logo`, choices.importId);
  }
  const referenceAssetIds: string[] = [...new Set(choices.keepReferences)];
  for (const key of choices.references.slice(0, PROPOSAL_LIMITS.references)) {
    if (referenceAssetIds.length >= 12) break;
    const staged = proposal.imagery.find((image) => image.key === key);
    if (!staged || !RASTER.has(staged.mime)) continue;
    referenceAssetIds.push(
      await keepStaged(
        userId,
        projectId,
        staged,
        `${name} · ${staged.kind === "page" ? (staged.origin ?? "page") : "brand look"}`,
        choices.importId,
      ),
    );
  }

  const design = designOf({ ...EMPTY_DESIGN, ...choices.kit.design });
  const { id } = await writeBrandKit(userId, {
    ...choices.kit,
    logoAssetId,
    referenceAssetIds,
    design: design as unknown as Record<string, unknown>,
    source: {
      kind: row.kind === "document" ? "document" : row.kind === "repos" ? "repos" : "url",
      url: row.source_url,
      title: row.source_title,
      importId: choices.importId,
    },
  });
  await db
    .from("brand_imports")
    .update({ status: "applied", brand_kit_id: id })
    .eq("id", choices.importId);
  // What wasn't kept is no longer needed (an applied import isn't reviewed again).
  await removeUnkeptFiles(choices.importId).catch(() => undefined);
  return { kitId: id };
}

/**
 * Throws an import away with the pictures it staged (those kept in the
 * library stay). Fonts it installed stay too: they are shared.
 */
export async function discardImport(importId: string): Promise<void> {
  const row = await loadImport(importId);
  if (!row) return;
  await removeUnkeptFiles(importId);
  await db.from("brand_imports").delete().eq("id", importId);
}

/**
 * Removes the files an import staged that weren't kept in the library: once
 * it is kept as a kit, or thrown away. Everything in its folder counts (a
 * document's pages are there before it is read).
 */
async function removeUnkeptFiles(importId: string): Promise<void> {
  const folder = importFolder(importId);
  const { data: listed } = await db.storage.from(IMPORT_BUCKET).list(folder.slice(0, -1), {
    limit: 200,
  });
  const paths = (listed ?? []).map((file) => `${folder}${file.name}`);
  const { data: kept } = paths.length
    ? await db
        .from("assets")
        .select("storage_path")
        .eq("storage_bucket", IMPORT_BUCKET)
        .in("storage_path", paths)
    : { data: [] as { storage_path: string }[] };
  const keep = new Set((kept ?? []).map((asset) => asset.storage_path));
  const remove = paths.filter((path) => !keep.has(path));
  if (remove.length) await db.storage.from(IMPORT_BUCKET).remove(remove);
}
