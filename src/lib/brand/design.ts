/**
 * A brand's design system: its palette (each colour with the job it does),
 * its typefaces, the look of its imagery, its voice, what it always and
 * never does, and the line every generation carries so pictures and clips
 * come out in its look. Kept on a brand kit (`palette`, `design`), imported
 * from the brand's website or guidelines and looked over by a person first.
 *
 * Read tolerantly: whatever is stored (or an AI answered) is cut to size and
 * anything malformed is dropped, so a kit always reads.
 *
 * Shared by the server, the browser and tests.
 */
import { contrastRatio, isNeutral, relativeLuminance } from "./colour";
import { dnaLines, type BrandDna } from "./dna";
import { contentMix, formulasForBrand } from "./formulas";
import { clip, wordsOf } from "./text";

export { clip, wordsOf };

export const PALETTE_ROLES = [
  "primary",
  "secondary",
  "accent",
  "background",
  "surface",
  "text",
  "muted",
  "highlight",
  "other",
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export const PALETTE_ROLE_LABELS: Record<PaletteRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  background: "Background",
  surface: "Surface",
  text: "Text",
  muted: "Muted",
  highlight: "Highlight",
  other: "Other",
};

export interface PaletteColour {
  /** Lowercase #rrggbb. */
  hex: string;
  /** In words, for prompts and people: "deep navy blue". */
  name: string;
  role: PaletteRole;
  /** What the brand uses it for, when known: "buttons and links". */
  usage: string | null;
}

export const TYPE_CATEGORIES = [
  "sans",
  "serif",
  "slab",
  "display",
  "mono",
  "script",
  "handwritten",
] as const;
export type TypeCategory = (typeof TYPE_CATEGORIES)[number];

export const FONT_SOURCES = ["google", "adobe", "custom", "system", "unknown"] as const;
export type FontSource = (typeof FONT_SOURCES)[number];

export interface BrandTypeface {
  role: "heading" | "body" | "accent";
  /** The family as the brand names it. */
  family: string;
  category: TypeCategory | null;
  /** The weight it is set in (700 for bold headings), when known. */
  weight: number | null;
  /** Where the brand's own font comes from: Google Fonts can be installed; the others need a file. */
  source: FontSource;
  /** The family the kit sets it in: the brand's own, or a close Google font standing in. */
  rendered: string | null;
  notes: string | null;
}

export interface BrandVisual {
  /** A few words for how it feels: "calm", "premium", "playful". */
  mood: string[];
  photography: string | null;
  illustration: string | null;
  composition: string | null;
  lighting: string | null;
  colourGrading: string | null;
  texture: string | null;
  motion: string | null;
  /** Shapes, patterns, corners and other graphic devices. */
  graphics: string | null;
}

export interface BrandVoice {
  tone: string[];
  description: string | null;
  /** Lines written the way the brand writes. */
  sampleLines: string[];
  /** Words and phrases it uses. */
  vocabulary: string[];
  /** Words and phrases it never uses. */
  avoid: string[];
}

export interface BrandDesign {
  /** What the brand is and does, in a sentence or two. */
  summary: string | null;
  audience: string | null;
  personality: string[];
  typography: BrandTypeface[];
  visual: BrandVisual;
  voice: BrandVoice;
  logo: { description: string | null; usage: string | null };
  dos: string[];
  donts: string[];
  /** The brand's look in a sentence: carried by every generation made in it. */
  promptStyle: string | null;
  /** What pictures and clips made in it must not show. */
  avoid: string | null;
}

/** Where a design system was imported from. */
export interface BrandSource {
  kind: "url" | "document";
  url: string | null;
  title: string | null;
  importId: string | null;
  importedAt: string | null;
}

export const DESIGN_LIMITS = {
  palette: 24,
  words: 8,
  lines: 10,
  samples: 6,
  typefaces: 4,
  short: 300,
  long: 700,
  promptStyle: 420,
  avoid: 300,
} as const;

export const EMPTY_DESIGN: BrandDesign = {
  summary: null,
  audience: null,
  personality: [],
  typography: [],
  visual: {
    mood: [],
    photography: null,
    illustration: null,
    composition: null,
    lighting: null,
    colourGrading: null,
    texture: null,
    motion: null,
    graphics: null,
  },
  voice: { tone: [], description: null, sampleLines: [], vocabulary: [], avoid: [] },
  logo: { description: null, usage: null },
  dos: [],
  donts: [],
  promptStyle: null,
  avoid: null,
};

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/** A colour as lowercase #rrggbb (from #rgb or #rrggbb), or null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;

/** A palette as stored or answered: well-formed colours, each once, at most 24. */
export function paletteOf(value: unknown): PaletteColour[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PaletteColour[] = [];
  for (const entry of value) {
    const item = record(entry);
    const hex = normalizeHex(item["hex"]);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push({
      hex,
      name: clip(item["name"], 40) ?? hex,
      role: oneOf(PALETTE_ROLES, item["role"]) ?? "other",
      usage: clip(item["usage"], 120),
    });
    if (out.length >= DESIGN_LIMITS.palette) break;
  }
  return out;
}

function typefacesOf(value: unknown): BrandTypeface[] {
  if (!Array.isArray(value)) return [];
  const out: BrandTypeface[] = [];
  for (const entry of value) {
    const item = record(entry);
    const family = clip(item["family"], 80);
    const role = oneOf(["heading", "body", "accent"] as const, item["role"]);
    if (!family || !role) continue;
    const weight = Number(item["weight"]);
    out.push({
      role,
      family,
      category: oneOf(TYPE_CATEGORIES, item["category"]),
      weight: Number.isFinite(weight) && weight >= 100 && weight <= 950 ? Math.round(weight) : null,
      source: oneOf(FONT_SOURCES, item["source"]) ?? "unknown",
      rendered: clip(item["rendered"], 80),
      notes: clip(item["notes"], 200),
    });
    if (out.length >= DESIGN_LIMITS.typefaces) break;
  }
  return out;
}

/** A design as stored or answered, every part cut to size (never null: empty parts are empty). */
export function designOf(value: unknown): BrandDesign {
  const item = record(value);
  const visual = record(item["visual"]);
  const voice = record(item["voice"]);
  const logo = record(item["logo"]);
  const { words, lines, samples, short, long } = DESIGN_LIMITS;
  return {
    summary: clip(item["summary"], long),
    audience: clip(item["audience"], short),
    personality: wordsOf(item["personality"], words, 30),
    typography: typefacesOf(item["typography"]),
    visual: {
      mood: wordsOf(visual["mood"], words, 30),
      photography: clip(visual["photography"], short),
      illustration: clip(visual["illustration"], short),
      composition: clip(visual["composition"], short),
      lighting: clip(visual["lighting"], short),
      colourGrading: clip(visual["colourGrading"], short),
      texture: clip(visual["texture"], short),
      motion: clip(visual["motion"], short),
      graphics: clip(visual["graphics"], short),
    },
    voice: {
      tone: wordsOf(voice["tone"], words, 30),
      description: clip(voice["description"], short),
      sampleLines: wordsOf(voice["sampleLines"], samples, 200),
      vocabulary: wordsOf(voice["vocabulary"], lines, 40),
      avoid: wordsOf(voice["avoid"], lines, 40),
    },
    logo: { description: clip(logo["description"], short), usage: clip(logo["usage"], short) },
    dos: wordsOf(item["dos"], lines, 200),
    donts: wordsOf(item["donts"], lines, 200),
    promptStyle: clip(item["promptStyle"], DESIGN_LIMITS.promptStyle),
    avoid: clip(item["avoid"], DESIGN_LIMITS.avoid),
  };
}

/** Whether a design says nothing yet (a kit made by hand, before any import). */
export function isEmptyDesign(design: BrandDesign): boolean {
  return JSON.stringify(design) === JSON.stringify(EMPTY_DESIGN);
}

export function sourceOf(value: unknown): BrandSource | null {
  const item = record(value);
  const kind = oneOf(["url", "document"] as const, item["kind"]);
  if (!kind) return null;
  return {
    kind,
    url: clip(item["url"], 2000),
    title: clip(item["title"], 300),
    importId: clip(item["import_id"] ?? item["importId"], 64),
    importedAt: clip(item["imported_at"] ?? item["importedAt"], 40),
  };
}

/** The palette's colours that do a job, in the order a reader should meet them. */
export function paletteInOrder(palette: PaletteColour[]): PaletteColour[] {
  const rank = (role: PaletteRole) => PALETTE_ROLES.indexOf(role);
  return [...palette].sort((a, b) => rank(a.role) - rank(b.role));
}

/** A palette in words: "deep navy blue, vivid orange and off-white". */
export function paletteWords(palette: PaletteColour[], max = 5): string {
  const names = [
    ...new Set(paletteInOrder(palette).map((colour) => colour.name.toLowerCase())),
  ].slice(0, max);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/* ------------------------------------------------------------------ */
/* Kit colours                                                         */
/* ------------------------------------------------------------------ */

/**
 * The three colours a kit's titles and end card use, from a palette: the
 * accent behind calls to action (the brand's accent, else its primary, else
 * its strongest colour), the end card's background (its background colour
 * when it isn't near-white, else its primary, else its darkest), and the
 * text set on it (its text colour when it reads there, else white or black).
 */
export function kitColoursOf(
  palette: PaletteColour[],
  fallback: { text: string; accent: string; background: string } = {
    text: "#ffffff",
    accent: "#2563eb",
    background: "#0b1020",
  },
): { text: string; accent: string; background: string } {
  if (!palette.length) return fallback;
  const byRole = (role: PaletteRole) => palette.find((colour) => colour.role === role)?.hex;
  const vivid = palette.filter((colour) => !isNeutral(colour.hex));
  const accent = byRole("accent") ?? byRole("primary") ?? vivid[0]?.hex ?? fallback.accent;
  const darkest = [...palette].sort(
    (a, b) => relativeLuminance(a.hex) - relativeLuminance(b.hex),
  )[0]?.hex;
  const background = [byRole("background"), byRole("primary"), darkest].find(
    (hex): hex is string => !!hex && relativeLuminance(hex) < 0.8,
  );
  const ground = background ?? fallback.background;
  const textRole = byRole("text");
  const text =
    textRole && contrastRatio(textRole, ground) >= 4.5
      ? textRole
      : contrastRatio("#ffffff", ground) >= contrastRatio("#000000", ground)
        ? "#ffffff"
        : "#000000";
  return { text, accent, background: ground };
}

/* ------------------------------------------------------------------ */
/* What generations carry                                              */
/* ------------------------------------------------------------------ */

/** What the prompt lines below read from a brand (a kit has all of it). */
export interface BrandLook {
  name: string;
  tagline: string | null;
  callToAction: string | null;
  website: string | null;
  palette: PaletteColour[];
  design: BrandDesign;
  terms: string[];
  /** What kind of brand it is (see ./dna); a look without one is read as it was. */
  dna?: BrandDna | undefined;
}

const sentence = (text: string) => text.replace(/[\s.]+$/, "");

/**
 * The line a picture or clip made in a brand's look carries: its look in a
 * sentence (the design's own, else one built from its palette, mood and the
 * look of its imagery) and its palette, kept short so the prompt's subject
 * still leads. Empty when the brand has nothing to say about its look.
 */
export function brandStyleLine(brand: BrandLook, kind: "image" | "video" = "image"): string {
  const { design } = brand;
  const palette = paletteWords(brand.palette, 4);
  const parts: string[] = [];
  if (design.promptStyle) parts.push(sentence(design.promptStyle));
  else {
    const mood = design.visual.mood.slice(0, 3).join(", ");
    const built = [
      mood ? `${mood} mood` : null,
      design.visual.photography,
      design.visual.lighting,
      design.visual.colourGrading,
    ]
      .filter((part): part is string => !!part)
      .map(sentence)
      .join("; ");
    if (built) parts.push(built);
  }
  if (palette && !parts.join(" ").toLowerCase().includes(palette.split(",")[0]!.trim()))
    parts.push(`colour palette of ${palette}`);
  if (kind === "video" && design.visual.motion) parts.push(sentence(design.visual.motion));
  if (!parts.length) return "";
  return clip(`In ${brand.name}'s brand look: ${parts.join("; ")}.`, 520) ?? "";
}

/** What a picture or clip made in the brand's look must not show (empty when nothing). */
export function brandAvoidLine(brand: BrandLook): string {
  const avoid = [
    brand.design.avoid,
    ...brand.design.donts.filter((line) =>
      /\b(show|image|photo|picture|colou?r|visual|logo|stock|clich|dark|bright|text)/i.test(line),
    ),
  ].filter((part): part is string => !!part);
  return avoid.length ? (clip(avoid.map(sentence).join("; "), 300) ?? "") : "";
}

/** How words written for the brand should sound (empty when it has no voice yet). */
export function brandVoiceLine(brand: BrandLook): string {
  const { voice } = brand.design;
  const parts = [
    voice.tone.length ? `Tone: ${voice.tone.join(", ")}` : null,
    voice.description ? sentence(voice.description) : null,
    voice.vocabulary.length ? `It says: ${voice.vocabulary.slice(0, 6).join(", ")}` : null,
    voice.avoid.length ? `It never says: ${voice.avoid.slice(0, 6).join(", ")}` : null,
  ].filter((part): part is string => !!part);
  return parts.length
    ? (clip(`Write in ${brand.name}'s voice. ${parts.join(". ")}.`, 500) ?? "")
    : "";
}

/**
 * The brand, briefly, for the AI that plans and writes for it: what it is
 * and what kind of brand (its DNA), its look, its voice, what its content is
 * about and made with, and its rules. Up to `max` characters: a line that
 * doesn't fit is left out, the ones after it still go in.
 */
export function brandBrief(brand: BrandLook, max = 3000): string {
  const { design } = brand;
  const dna = brand.dna
    ? dnaLines(
        brand.dna,
        { name: brand.name, audience: design.audience },
        formulasForBrand(brand.dna).map((formula) => `${formula.name} (${formula.id})`),
      )
    : [];
  // Who it is goes first; what its content is about and made with, after its voice.
  const identity = dna.filter((line) => /^(Brand type|Archetype|Positioning|The job)/.test(line));
  const mix = brand.dna ? contentMix(brand.dna.market) : null;
  const content = [
    ...dna.filter((line) => !identity.includes(line)),
    ...(mix && brand.dna?.type ? [`Content mix over time: ${mix.short}`] : []),
  ];
  const lines = [
    `Brand: ${brand.name}${brand.tagline ? ` ("${brand.tagline}")` : ""}`,
    design.summary ? `What it is: ${design.summary}` : null,
    design.audience ? `Audience: ${design.audience}` : null,
    ...identity,
    design.personality.length ? `Personality: ${design.personality.join(", ")}` : null,
    brand.palette.length
      ? `Palette: ${paletteInOrder(brand.palette)
          .slice(0, 8)
          .map((colour) => `${colour.name} ${colour.hex} (${colour.role})`)
          .join(", ")}`
      : null,
    design.typography.length
      ? `Type: ${design.typography.map((face) => `${face.role} ${face.family}`).join(", ")}`
      : null,
    design.promptStyle ? `Look: ${design.promptStyle}` : null,
    design.visual.mood.length ? `Mood: ${design.visual.mood.join(", ")}` : null,
    design.visual.photography ? `Photography: ${design.visual.photography}` : null,
    design.visual.lighting ? `Lighting: ${design.visual.lighting}` : null,
    design.visual.colourGrading ? `Grading: ${design.visual.colourGrading}` : null,
    design.visual.composition ? `Composition: ${design.visual.composition}` : null,
    design.visual.motion ? `Motion: ${design.visual.motion}` : null,
    brandVoiceLine(brand) || null,
    design.voice.sampleLines.length
      ? `Sounds like: ${design.voice.sampleLines
          .slice(0, 3)
          .map((line) => `"${line}"`)
          .join(" ")}`
      : null,
    ...content,
    design.dos.length ? `Always: ${design.dos.slice(0, 5).join("; ")}` : null,
    design.donts.length ? `Never: ${design.donts.slice(0, 5).join("; ")}` : null,
    brand.callToAction ? `Call to action: ${brand.callToAction}` : null,
    brand.website ? `Website: ${brand.website}` : null,
    brand.terms.length ? `Spell exactly: ${brand.terms.slice(0, 12).join(", ")}` : null,
  ].filter((line): line is string => !!line);
  let out = "";
  for (const line of lines) {
    if (out.length + line.length + 1 > max) continue;
    out += `${out ? "\n" : ""}${line}`;
  }
  return out;
}

/** A prompt with the brand's look added (once: a prompt that already carries it is kept). */
export function withBrandStyle(
  prompt: string,
  brand: BrandLook,
  kind: "image" | "video" = "image",
): string {
  const line = brandStyleLine(brand, kind);
  const text = prompt.trim();
  if (!line || text.includes(line)) return text;
  return text ? `${text}\n\n${line}` : line;
}

/**
 * What a long video keeps of the brand it was started in, so every clip,
 * keyframe and line of it is made in the same look even if the kit changes.
 */
export interface BrandSnapshot {
  kitId: string;
  name: string;
  styleLine: string;
  videoStyleLine: string;
  avoidLine: string;
  voiceLine: string;
  brief: string;
  terms: string[];
  referenceAssetIds: string[];
}

export function brandSnapshot(
  kit: BrandLook & { id: string; referenceAssetIds: string[] },
): BrandSnapshot {
  return {
    kitId: kit.id,
    name: kit.name,
    styleLine: brandStyleLine(kit, "image"),
    videoStyleLine: brandStyleLine(kit, "video"),
    avoidLine: brandAvoidLine(kit),
    voiceLine: brandVoiceLine(kit),
    brief: brandBrief(kit, 2600),
    terms: kit.terms.slice(0, 50),
    referenceAssetIds: kit.referenceAssetIds.slice(0, 12),
  };
}

/** A stored brand snapshot, or null. */
export function storedBrandSnapshot(value: unknown): BrandSnapshot | null {
  const item = record(value);
  const kitId = clip(item["kitId"], 64);
  const name = clip(item["name"], 120);
  if (!kitId || !name) return null;
  const text = (key: string, max: number) => clip(item[key], max) ?? "";
  // The brief is read line by line, as it was written.
  const brief = typeof item["brief"] === "string" ? item["brief"].trim().slice(0, 3200) : "";
  return {
    kitId,
    name,
    styleLine: text("styleLine", 600),
    videoStyleLine: text("videoStyleLine", 600),
    avoidLine: text("avoidLine", 400),
    voiceLine: text("voiceLine", 600),
    brief,
    terms: wordsOf(item["terms"], 50, 80),
    referenceAssetIds: wordsOf(item["referenceAssetIds"], 12, 64),
  };
}
