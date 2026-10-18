/**
 * Reading a brand's design system from what was found: the studio's AI looks
 * at the site's colours (with how much each is used), fonts, words and
 * pictures, or a guideline document's text, colour codes and pages, and
 * answers with a palette (each colour with its job), typefaces, the look of
 * its imagery, its voice, its rules and the line generations carry. Colours
 * are held to those found; a near-miss becomes the brand's exact colour.
 *
 * Without an AI set up, a proposal is still made from the scan alone.
 */
import {
  clip,
  designOf,
  kitColoursOf,
  wordsOf,
  type BrandDesign,
  type BrandTypeface,
} from "./design";
import { finishPalette, type BrandProposal, type FoundColour, type StagedImage } from "./proposal";

const SYSTEM = `You read a brand's design system from evidence, for a video studio that will make images and videos in the brand's look. The evidence is either a scan of the brand's website (the colours its stylesheets use, with each colour's share of all colour use and where it appears; its fonts and which elements use them; its title, headings, buttons and text; its logo and pictures) or the text, colour codes and page pictures of its brand guidelines.

Answer with:
- name: the brand's name as it writes it.
- tagline: its slogan only if the evidence states one, else null. callToAction: its main call to action (a button's words) or null.
- terms: names that must be spelled exactly (brand, products, people), at most 12.
- palette: 3 to 10 colours the brand really uses. Take hex values exactly from the colours found or the guideline's codes; only add a colour seen in the pictures when it clearly matters. Exactly one "primary" (the brand's signature colour). Roles: primary, secondary, accent, background, surface, text, muted, highlight, other. Name each colour in plain words a painter would use ("deep navy blue", "warm sand"), and say what it is used for when the evidence shows it.
- typography: the heading and body typefaces (and an accent one if distinct), by family name as the brand names it; category (sans, serif, slab, display, mono, script, handwritten); the weight headings are set in (e.g. 700); source: "google" for a Google Fonts family, "adobe" for an Adobe Fonts one, "custom" for the brand's own files, "system" for system fonts, else "unknown"; alternative: the closest Google Fonts family when the source isn't google (else null).
- design.summary: what the brand is and does, one or two sentences. design.audience: who it speaks to.
- design.personality: 3 to 6 adjectives.
- design.visual: mood (3 to 6 words); photography (subjects, casting, setting, framing, candid or posed); illustration (if any); composition; lighting; colourGrading; texture; motion (how its video should move: pace, camera); graphics (shapes, patterns, corner radius). Describe what the pictures and design actually show; null where there is no evidence.
- design.voice: tone (3 to 6 words), description, up to 4 sampleLines quoted or closely paraphrased from its copy, vocabulary it uses, words it avoids.
- design.logo: what the logo looks like (mark, wordmark, colours) and any usage rule stated.
- design.dos and design.donts: rules for making content in the brand, from the guidelines when given, else carefully inferred (at most 8 each).
- design.promptStyle: ONE sentence of at most 60 words describing the brand's visual look for an image or video generator: palette by colour names (never hex), lighting, photographic or illustrative style, mood, composition and grading. No brand names, no text, no logos.
- design.avoid: what pictures made for it must not show, as a short comma-separated list (e.g. "cluttered backgrounds, neon colours, stock-photo poses").
- titleBacking: how its titles stay readable over video: "box" for solid blocks of colour, "outline" for crisp outlined type, "halo" for a soft shadow. uppercaseTitles: whether its headings are set in capitals.
- logo: the number of the picture that is the logo (0 when none is). references: numbers of up to 4 pictures that best show the brand's photographic or illustrative look (never the logo, never a screenshot of a form or UI).
- notes: anything a person should check (at most 4 short lines).

Never invent facts, slogans or rules the evidence doesn't support.`;

const TEXT = { type: "string" };
const TEXTS = { type: "array", items: { type: "string" } };
const NULLABLE = { type: ["string", "null"] };

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    name: TEXT,
    tagline: NULLABLE,
    callToAction: NULLABLE,
    terms: TEXTS,
    palette: {
      type: "array",
      items: {
        type: "object",
        properties: { hex: TEXT, name: TEXT, role: TEXT, usage: NULLABLE },
        required: ["hex", "name", "role", "usage"],
      },
    },
    typography: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: TEXT,
          family: TEXT,
          category: TEXT,
          weight: { type: ["number", "null"] },
          source: TEXT,
          alternative: NULLABLE,
        },
        required: ["role", "family", "category", "weight", "source", "alternative"],
      },
    },
    design: {
      type: "object",
      properties: {
        summary: NULLABLE,
        audience: NULLABLE,
        personality: TEXTS,
        visual: {
          type: "object",
          properties: {
            mood: TEXTS,
            photography: NULLABLE,
            illustration: NULLABLE,
            composition: NULLABLE,
            lighting: NULLABLE,
            colourGrading: NULLABLE,
            texture: NULLABLE,
            motion: NULLABLE,
            graphics: NULLABLE,
          },
          required: ["mood", "photography", "lighting", "colourGrading", "composition", "motion"],
        },
        voice: {
          type: "object",
          properties: {
            tone: TEXTS,
            description: NULLABLE,
            sampleLines: TEXTS,
            vocabulary: TEXTS,
            avoid: TEXTS,
          },
          required: ["tone", "description", "sampleLines"],
        },
        logo: {
          type: "object",
          properties: { description: NULLABLE, usage: NULLABLE },
          required: ["description"],
        },
        dos: TEXTS,
        donts: TEXTS,
        promptStyle: TEXT,
        avoid: NULLABLE,
      },
      required: [
        "summary",
        "personality",
        "visual",
        "voice",
        "logo",
        "dos",
        "donts",
        "promptStyle",
      ],
    },
    titleBacking: TEXT,
    uppercaseTitles: { type: "boolean" },
    logo: { type: "number" },
    references: { type: "array", items: { type: "number" } },
    notes: TEXTS,
  },
  required: [
    "name",
    "tagline",
    "callToAction",
    "terms",
    "palette",
    "typography",
    "design",
    "titleBacking",
    "uppercaseTitles",
    "logo",
    "references",
    "notes",
  ],
};

/** A typeface as the AI named it, before any font is installed for it. */
export interface ReadTypeface {
  role: "heading" | "body" | "accent";
  family: string;
  category: BrandTypeface["category"];
  weight: number | null;
  source: BrandTypeface["source"];
  alternative: string | null;
}

/** What the AI read: a proposal still without installed fonts (those come after). */
export type ReadDesign = Omit<BrandProposal, "fonts"> & { typefaces: ReadTypeface[] };

export interface DesignEvidence {
  kind: "url" | "document";
  /** The brand's name as the scan guessed it. */
  name: string;
  url: string | null;
  title: string | null;
  description: string | null;
  website: string | null;
  colours: FoundColour[];
  fonts: { family: string; roles: string[]; share: number }[];
  googleFonts: string[];
  adobeFonts: boolean;
  headings: string[];
  ctas: string[];
  /** Body copy (a site's visible text, or the guideline's text). */
  copy: string;
  /** Pictures shown to the AI, numbered from 1 in this order, with signed links. */
  pictures: { image: StagedImage; url: string }[];
  /** Everything staged (some may not have been shown, such as SVG logos). */
  logos: StagedImage[];
  imagery: StagedImage[];
}

/** The evidence as the AI reads it: compact, most telling first. */
export function evidenceText(evidence: DesignEvidence, maxCopy = 9000): string {
  const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;
  const lines: string[] = [
    evidence.kind === "url"
      ? `Website: ${evidence.url ?? "unknown"}`
      : `Brand guidelines document: ${evidence.title ?? "untitled"}`,
    `Brand name (guessed): ${evidence.name}`,
  ];
  if (evidence.kind === "url") {
    if (evidence.title) lines.push(`Page title: ${evidence.title}`);
    if (evidence.description) lines.push(`Description: ${evidence.description}`);
  }
  if (evidence.colours.length) {
    lines.push(
      "",
      evidence.kind === "url"
        ? "Colours found (hex, name, share of colour use, where):"
        : "Colour codes in the document (hex, name, where):",
    );
    for (const colour of evidence.colours.slice(0, 32))
      lines.push(
        `- ${colour.hex} ${colour.name}${evidence.kind === "url" ? ` ${percent(colour.share)}` : ""}${colour.neutral ? " (neutral)" : ""}${colour.from.length ? ` — ${colour.from.join(", ")}` : ""}`,
      );
  }
  if (evidence.fonts.length) {
    lines.push("", "Fonts used (family, elements, share):");
    for (const font of evidence.fonts.slice(0, 8))
      lines.push(`- ${font.family}: ${font.roles.join(", ") || "other"} ${percent(font.share)}`);
  }
  if (evidence.googleFonts.length)
    lines.push(`Loaded from Google Fonts: ${evidence.googleFonts.join(", ")}`);
  if (evidence.adobeFonts) lines.push("The site loads an Adobe Fonts kit.");
  if (evidence.headings.length) lines.push("", `Headings: ${evidence.headings.join(" | ")}`);
  if (evidence.ctas.length) lines.push(`Buttons: ${evidence.ctas.join(" | ")}`);
  if (evidence.pictures.length) {
    lines.push("", "Pictures (numbered in the order attached):");
    evidence.pictures.forEach(({ image }, index) =>
      lines.push(
        `${index + 1}. ${image.kind === "logo" ? "logo candidate" : image.kind === "page" ? "document page" : "picture"}${image.origin ? ` (${image.origin.slice(0, 120)})` : ""}${image.width && image.height ? ` ${image.width}×${image.height}` : ""}`,
      ),
    );
  }
  const copy = evidence.copy.replace(/\n{3,}/g, "\n\n").trim();
  if (copy)
    lines.push(
      "",
      evidence.kind === "url" ? "Page text:" : "Document text:",
      copy.slice(0, maxCopy),
    );
  return lines.join("\n");
}

const ROLES = new Set(["heading", "body", "accent"]);

/** Reads the AI's answer into a design, its colours held to those found. */
export function readAnswer(
  answer: unknown,
  evidence: DesignEvidence,
  model: string | null,
): ReadDesign {
  const item = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
  const palette = finishPalette(item["palette"], evidence.colours);
  const design: BrandDesign = designOf(item["design"]);
  const typefaces: ReadTypeface[] = [];
  for (const entry of Array.isArray(item["typography"]) ? item["typography"] : []) {
    const face = (entry ?? {}) as Record<string, unknown>;
    const role = String(face["role"] ?? "");
    const family = clip(face["family"], 80);
    if (!family || !ROLES.has(role) || typefaces.some((other) => other.role === role)) continue;
    const read = designOf({ typography: [{ ...face, role }] }).typography[0];
    typefaces.push({
      role: role as ReadTypeface["role"],
      family: family.replace(/^["']|["']$/g, ""),
      category: read?.category ?? null,
      weight: read?.weight ?? null,
      source: read?.source ?? "unknown",
      alternative: clip(face["alternative"], 80),
    });
  }
  const picture = (number: unknown) => {
    const index = Number(number);
    return Number.isInteger(index) && index >= 1 ? evidence.pictures[index - 1]?.image : undefined;
  };
  // The logo the AI picked; a picture it found to be the logo (a guideline's
  // embedded logo, say) becomes one; with none picked, the scan's best candidate.
  const chosenLogo = picture(item["logo"]);
  let logos = evidence.logos;
  let imagery = evidence.imagery;
  let logo = chosenLogo ? null : (logos[0]?.key ?? null);
  if (chosenLogo?.kind === "logo") logo = chosenLogo.key;
  else if (chosenLogo?.kind === "image") {
    logos = [...logos, { ...chosenLogo, kind: "logo" }];
    imagery = imagery.filter((image) => image.key !== chosenLogo.key);
    logo = chosenLogo.key;
  }
  const references = (Array.isArray(item["references"]) ? item["references"] : [])
    .map(picture)
    .filter((image): image is StagedImage => !!image && image.kind !== "logo" && image.key !== logo)
    .map((image) => image.key);
  const backing = item["titleBacking"];
  return {
    name: clip(item["name"], 120) ?? evidence.name,
    website: evidence.website,
    tagline: clip(item["tagline"], 160),
    callToAction: clip(item["callToAction"], 60),
    terms: wordsOf(item["terms"], 12, 80),
    palette,
    colours: kitColoursOf(palette),
    logos,
    logo,
    imagery,
    references: [...new Set(references)].slice(0, 4),
    design: { ...design, typography: [] },
    titleBacking: backing === "box" || backing === "outline" ? backing : "halo",
    uppercaseTitles: item["uppercaseTitles"] === true,
    notes: wordsOf(item["notes"], 4, 300),
    model,
    typefaces,
  };
}

/**
 * Asks the studio's AI to read the evidence. Null when no AI is set up or it
 * couldn't answer (the caller then proposes from the scan alone), with why.
 */
export async function readDesignSystem(
  evidence: DesignEvidence,
): Promise<{ ok: true; design: ReadDesign } | { ok: false; reason: string }> {
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route) return { ok: false, reason: "No AI model is set up to read the brand" };
  const result = await route.provider.generateStructured({
    system: SYSTEM,
    input: evidenceText(evidence),
    schemaName: "brand_design_system",
    schema: SCHEMA,
    model: route.model,
    images: evidence.pictures.map((picture) => picture.url),
    timeoutMs: 150_000,
  });
  if (!result.ok || !result.data)
    return { ok: false, reason: result.errorMessage ?? "The AI couldn't read the brand" };
  return { ok: true, design: readAnswer(result.data, evidence, result.model ?? route.model) };
}
