/**
 * A brand's DNA: what kind of brand it is, who it sells to, its character,
 * what it is and why it rather than another, the themes its content comes
 * back to, the moments buyers think of it, what it can prove, the assets
 * that make it recognisable, who fronts its content, where it publishes and
 * what its content is for now. Kept on a brand kit (`dna`), read by an AI
 * from the brand's website or guidelines and looked over by a person.
 *
 * The formulas a brand's content is made with (./formulas) are ranked by it,
 * and the AI that plans and writes for the brand reads it (see dnaLines and
 * ./design brandBrief).
 *
 * Read tolerantly, like the design system: whatever is stored (or an AI
 * answered) is cut to size and anything malformed is dropped.
 *
 * Shared by the server, the browser and tests.
 */
import { clip, wordsOf } from "./text";

/** The kinds of brand, each with its own content that works (see ./formulas). */
export const BRAND_TYPES = [
  "saas",
  "product",
  "personal",
  "ugc",
  "service",
  "local",
  "education",
] as const;
export type BrandType = (typeof BRAND_TYPES)[number];

export const BRAND_TYPE_INFO: Record<BrandType, { label: string; hint: string; plural: string }> = {
  saas: {
    label: "SaaS & software",
    hint: "Software, apps and platforms people subscribe to or license",
    plural: "SaaS and software brands",
  },
  product: {
    label: "Product & e-commerce",
    hint: "Physical products sold online or in shops: DTC, retail, consumer goods",
    plural: "product and e-commerce brands",
  },
  personal: {
    label: "Personal brand & creator",
    hint: "A person is the brand: founders, experts, influencers and creators",
    plural: "personal brands and creators",
  },
  ugc: {
    label: "UGC-led",
    hint: "Content in customers' and creators' own voices: reviews, unboxings, reactions",
    plural: "UGC-led brands",
  },
  service: {
    label: "Services & B2B",
    hint: "Agencies, consultancies, professional and business services",
    plural: "service and B2B brands",
  },
  local: {
    label: "Local business",
    hint: "A place people visit or book: venues, clinics, gyms, trades, restaurants",
    plural: "local businesses",
  },
  education: {
    label: "Coaching & education",
    hint: "Courses, coaching, communities and programmes that teach",
    plural: "coaching and education brands",
  },
};

export const MARKETS = ["b2b", "b2c", "both"] as const;
export type Market = (typeof MARKETS)[number];

export const MARKET_LABELS: Record<Market, string> = {
  b2b: "Businesses (B2B)",
  b2c: "Consumers (B2C)",
  both: "Both",
};

/** Who it sells to, mid-sentence. */
const MARKET_WORDS: Record<Market, string> = {
  b2b: "businesses (B2B)",
  b2c: "consumers (B2C)",
  both: "businesses and consumers",
};

/**
 * The twelve brand archetypes of Margaret Mark and Carol S. Pearson ("The
 * Hero and the Outlaw", 2001), each with the desire at its core: a brand's
 * character, so its stories, casting and voice stay one person.
 */
export const ARCHETYPES = [
  "innocent",
  "explorer",
  "sage",
  "hero",
  "outlaw",
  "magician",
  "everyman",
  "lover",
  "jester",
  "caregiver",
  "creator",
  "ruler",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_INFO: Record<Archetype, { label: string; desire: string; tells: string }> = {
  innocent: {
    label: "The Innocent",
    desire: "to be happy and do things right",
    tells: "simple, optimistic, honest, wholesome",
  },
  explorer: {
    label: "The Explorer",
    desire: "freedom to find out who you are by exploring the world",
    tells: "adventurous, independent, open roads and new frontiers",
  },
  sage: {
    label: "The Sage",
    desire: "to discover the truth and understand the world",
    tells: "expert, analytical, evidence first, teaches",
  },
  hero: {
    label: "The Hero",
    desire: "to prove one's worth through courageous, difficult action",
    tells: "determined, competitive, triumph over a challenge",
  },
  outlaw: {
    label: "The Outlaw",
    desire: "to overturn what isn't working",
    tells: "rebellious, disruptive, breaks the category's rules",
  },
  magician: {
    label: "The Magician",
    desire: "to make dreams come true by understanding how things work",
    tells: "transformative, visionary, moments of wonder",
  },
  everyman: {
    label: "The Everyman",
    desire: "to belong and connect with others",
    tells: "down to earth, friendly, real people, no pretence",
  },
  lover: {
    label: "The Lover",
    desire: "intimacy and the pleasure of the senses",
    tells: "sensual, warm, beautiful, emotional closeness",
  },
  jester: {
    label: "The Jester",
    desire: "to live in the moment and enjoy it",
    tells: "playful, funny, irreverent, light",
  },
  caregiver: {
    label: "The Caregiver",
    desire: "to protect and care for others",
    tells: "nurturing, reassuring, generous, safe",
  },
  creator: {
    label: "The Creator",
    desire: "to make something of enduring value",
    tells: "imaginative, crafted, expressive, original",
  },
  ruler: {
    label: "The Ruler",
    desire: "control, order and stability",
    tells: "authoritative, premium, structured, in command",
  },
};

/** Who fronts a brand's content. */
export const FACES = ["founder", "team", "customers", "creators", "presenter", "product"] as const;
export type Face = (typeof FACES)[number];

export const FACE_LABELS: Record<Face, string> = {
  founder: "The founder",
  team: "The team",
  customers: "Real customers",
  creators: "Creators and influencers",
  presenter: "A presenter (person or avatar)",
  product: "The product alone, no faces",
};

/** Where content is published. */
export const CHANNELS = [
  "tiktok",
  "reels",
  "shorts",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "web",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  web: "Website and ads",
};

/** What a piece of content is for. */
export const GOALS = ["awareness", "consideration", "conversion", "retention"] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_INFO: Record<Goal, { label: string; hint: string }> = {
  awareness: { label: "Awareness", hint: "Be noticed and remembered by people not yet buying" },
  consideration: { label: "Consideration", hint: "Be understood, trusted and compared" },
  conversion: { label: "Conversion", hint: "Get the sign-up, demo, booking or sale" },
  retention: { label: "Loyalty", hint: "Keep customers, and turn them into advocates" },
};

export interface BrandPillar {
  name: string;
  about: string | null;
}

/** Who it serves: one kind of buyer, what they hire it for and what gets in their way. */
export interface BrandAudience {
  name: string;
  job: string | null;
  pain: string | null;
}

/** What it sells: a product, module or service as it names it, and what that does. */
export interface BrandOffer {
  name: string;
  what: string | null;
}

export interface BrandDna {
  /** The kind of brand it mainly is. */
  type: BrandType | null;
  /** Kinds it also is (at most two): a SaaS that sells through its founder is also a personal brand. */
  alsoTypes: BrandType[];
  market: Market | null;
  archetype: Archetype | null;
  /** A second archetype that colours the first. */
  archetypeAlso: Archetype | null;
  /** What it is, in the words its buyers would use: "an AI operating system for property firms". */
  category: string | null;
  /** The job buyers hire it for (Jobs to Be Done). */
  job: string | null;
  /** Why it rather than the alternative buyers would otherwise choose. */
  difference: string | null;
  /** Who it serves, one kind of buyer at a time (for content aimed at one of them). */
  audiences: BrandAudience[];
  /** What it sells, as it names it (for content that shows one of them). */
  offers: BrandOffer[];
  /** What buyers use instead: the status quo or the kinds of competitor. */
  alternatives: string[];
  /** The themes its content keeps coming back to (three to five). */
  pillars: BrandPillar[];
  /** Buying moments: the situations in which buyers think of the category (category entry points). */
  moments: string[];
  /** What it can prove: results, numbers, reviews, awards, clients. Only what it stands behind. */
  proof: string[];
  /** Its distinctive assets: what makes it recognisable at a glance or a listen. */
  assets: string[];
  /**
   * Its own guardrails: rules every piece of its content keeps, beyond any
   * formula's (how its claims are worded, what it discloses, what its
   * regulated field forbids).
   */
  guardrails: string[];
  faces: Face[];
  channels: Channel[];
  /** What most of its content is for now. */
  goal: Goal | null;
  /** The formulas it works with, best first (ids from ./formulas). */
  formulas: string[];
}

export const DNA_LIMITS = {
  alsoTypes: 2,
  pillars: 6,
  audiences: 8,
  offers: 10,
  alternatives: 6,
  guardrails: 12,
  lines: 8,
  short: 200,
  pillarAbout: 160,
  formulas: 12,
} as const;

export const EMPTY_DNA: BrandDna = {
  type: null,
  alsoTypes: [],
  market: null,
  archetype: null,
  archetypeAlso: null,
  category: null,
  job: null,
  difference: null,
  audiences: [],
  offers: [],
  alternatives: [],
  pillars: [],
  moments: [],
  proof: [],
  assets: [],
  guardrails: [],
  faces: [],
  channels: [],
  goal: null,
  formulas: [],
};

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;

/** The values of a list that are among `values`, each once, at most `max`. */
function someOf<T extends string>(values: readonly T[], value: unknown, max: number): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    const known = oneOf(values, entry);
    if (known && !out.includes(known)) out.push(known);
    if (out.length >= max) break;
  }
  return out;
}

/** Named rows ({name, …}), each name once, at most `max`, every part cut to its length. */
function rowsOf<K extends string>(
  value: unknown,
  max: number,
  parts: Record<K, number>,
): ({ name: string } & Record<K, string | null>)[] {
  if (!Array.isArray(value)) return [];
  const out: ({ name: string } & Record<K, string | null>)[] = [];
  for (const entry of value) {
    const item = typeof entry === "string" ? { name: entry } : record(entry);
    const name = clip(item["name"], 60);
    if (!name || out.some((row) => row.name.toLowerCase() === name.toLowerCase())) continue;
    const row = { name } as { name: string } & Record<K, string | null>;
    for (const [key, chars] of Object.entries(parts) as [K, number][])
      (row as Record<K, string | null>)[key] = clip(item[key], chars);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/** A DNA as stored or answered, every part cut to size (never null: unknown parts are empty). */
export function dnaOf(value: unknown): BrandDna {
  const item = record(value);
  const type = oneOf(BRAND_TYPES, item["type"]);
  const archetype = oneOf(ARCHETYPES, item["archetype"]);
  const archetypeAlso = oneOf(ARCHETYPES, item["archetypeAlso"]);
  const { lines, short } = DNA_LIMITS;
  return {
    type,
    alsoTypes: someOf(BRAND_TYPES, item["alsoTypes"], DNA_LIMITS.alsoTypes + 1)
      .filter((entry) => entry !== type)
      .slice(0, DNA_LIMITS.alsoTypes),
    market: oneOf(MARKETS, item["market"]),
    archetype,
    archetypeAlso: archetypeAlso !== archetype ? archetypeAlso : null,
    category: clip(item["category"], short),
    job: clip(item["job"], short),
    difference: clip(item["difference"], short),
    audiences: rowsOf(item["audiences"], DNA_LIMITS.audiences, { job: 160, pain: 200 }),
    offers: rowsOf(item["offers"], DNA_LIMITS.offers, { what: 160 }),
    alternatives: wordsOf(item["alternatives"], DNA_LIMITS.alternatives, 120),
    pillars: rowsOf(item["pillars"], DNA_LIMITS.pillars, { about: DNA_LIMITS.pillarAbout }),
    moments: wordsOf(item["moments"], lines, 160),
    proof: wordsOf(item["proof"], lines, 200),
    assets: wordsOf(item["assets"], lines, 120),
    guardrails: wordsOf(item["guardrails"], DNA_LIMITS.guardrails, 240),
    faces: someOf(FACES, item["faces"], FACES.length),
    channels: someOf(CHANNELS, item["channels"], CHANNELS.length),
    goal: oneOf(GOALS, item["goal"]),
    formulas: wordsOf(item["formulas"], DNA_LIMITS.formulas, 60).filter((id) =>
      /^[a-z0-9-]+$/.test(id),
    ),
  };
}

/** A suggestion kept where a person has written nothing (their own words stay). */
export function mergeSuggestion(current: BrandDna, suggested: BrandDna): BrandDna {
  const pick = <T>(mine: T, theirs: T): T =>
    mine === null || (Array.isArray(mine) && mine.length === 0) ? theirs : mine;
  return {
    type: pick(current.type, suggested.type),
    alsoTypes: pick(current.alsoTypes, suggested.alsoTypes).filter(
      (type) => type !== (current.type ?? suggested.type),
    ),
    market: pick(current.market, suggested.market),
    archetype: pick(current.archetype, suggested.archetype),
    archetypeAlso: current.archetype ? current.archetypeAlso : suggested.archetypeAlso,
    category: pick(current.category, suggested.category),
    job: pick(current.job, suggested.job),
    difference: pick(current.difference, suggested.difference),
    audiences: pick(current.audiences, suggested.audiences),
    offers: pick(current.offers, suggested.offers),
    alternatives: pick(current.alternatives, suggested.alternatives),
    pillars: pick(current.pillars, suggested.pillars),
    moments: pick(current.moments, suggested.moments),
    proof: pick(current.proof, suggested.proof),
    assets: pick(current.assets, suggested.assets),
    guardrails: pick(current.guardrails, suggested.guardrails),
    faces: pick(current.faces, suggested.faces),
    channels: pick(current.channels, suggested.channels),
    goal: pick(current.goal, suggested.goal),
    formulas: current.formulas,
  };
}

/** Whether a DNA says nothing yet. */
export function isEmptyDna(dna: BrandDna): boolean {
  return JSON.stringify(dna) === JSON.stringify(EMPTY_DNA);
}

/** "SaaS & software, also Personal brand & creator". */
export function typeWords(dna: BrandDna): string | null {
  if (!dna.type) return null;
  const also = dna.alsoTypes.map((type) => BRAND_TYPE_INFO[type].label);
  return `${BRAND_TYPE_INFO[dna.type].label}${also.length ? `, also ${also.join(" and ")}` : ""}`;
}

/** "The Ruler with The Sage". */
export function archetypeWords(dna: BrandDna): string | null {
  if (!dna.archetype) return null;
  const first = ARCHETYPE_INFO[dna.archetype].label;
  return dna.archetypeAlso ? `${first} with ${ARCHETYPE_INFO[dna.archetypeAlso].label}` : first;
}

const sentence = (text: string) => text.replace(/[\s.]+$/, "");

/** "Small firms" → "small firms" mid-sentence; acronyms and names ("AI", "iPhone") stay. */
const midSentence = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;

/** "a" or "an" before a phrase, by how its first word sounds. */
export function articleFor(phrase: string): "a" | "an" {
  const word = phrase.trim().split(/[\s-]/)[0] ?? "";
  // An acronym is said letter by letter: "an AI", "an SEO", "a B2B", "a URL".
  if (/^[A-Z][A-Z0-9]+$/.test(word)) return /^[AEFHILMNORSX]/.test(word) ? "an" : "a";
  if (/^(uni|use|usu|uti|ure|eu|ewe|one|once)/i.test(word)) return "a";
  if (/^(hour|honest|hono)/i.test(word)) return "an";
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Its positioning in one sentence, after Geoffrey Moore's template: for
 * whom, the job, what it is, and why it rather than another. Null when it
 * says too little to make one.
 */
export function positioningLine(
  dna: BrandDna,
  brand: { name: string; audience?: string | null },
): string | null {
  if (!dna.category) return null;
  const category = midSentence(sentence(dna.category));
  // Who it's for: its audiences by name when it has them (a long audience sentence reads badly here).
  const named = dna.audiences.slice(0, 4).map((audience) => midSentence(audience.name));
  const audience = named.length
    ? named.length > 1
      ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
      : named[0]!
    : brand.audience
      ? midSentence(sentence(brand.audience))
      : null;
  const who = audience ? `For ${audience}` : null;
  const job = dna.job
    ? `who need to ${midSentence(sentence(dna.job).replace(/^to\s+/i, ""))}`
    : null;
  const lead = [who, who ? job : null].filter(Boolean).join(" ");
  const what = `${brand.name} is ${/^(a|an|the)\s/i.test(category) ? "" : `${articleFor(category)} `}${category}`;
  const first = lead ? `${lead}, ${what}.` : `${what}.`;
  return dna.difference ? `${first} ${sentence(dna.difference)}.` : first;
}

/** Who fronts its content, in words: one of them for each piece. */
function frontedBy(faces: Face[]): string {
  const words = faces.map((face) =>
    // "No faces" is said only when the product is all there is.
    face === "product" && faces.length > 1 ? "the product itself" : FACE_LABELS[face].toLowerCase(),
  );
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0]!;
}

/**
 * The DNA as lines for the AI that plans and writes for the brand (empty
 * when it says nothing). `formulaNames` names the formulas it works with.
 */
export function dnaLines(
  dna: BrandDna,
  brand: { name: string; audience?: string | null },
  formulaNames: string[] = [],
): string[] {
  const type = typeWords(dna);
  const market = dna.market ? MARKET_WORDS[dna.market] : null;
  const first = dna.archetype ? ARCHETYPE_INFO[dna.archetype] : null;
  const second = dna.archetypeAlso ? ARCHETYPE_INFO[dna.archetypeAlso] : null;
  const archetype = first
    ? `${first.label}. Core desire: ${first.desire}. Comes across as ${first.tells}${second ? `. Coloured by ${second.label}: ${second.tells}` : ""}`
    : null;
  const positioning = positioningLine(dna, brand);
  // The positioning only says the job when it says who it's for.
  const jobSaid = !!positioning && (!!brand.audience || dna.audiences.length > 0);
  const pains = dna.audiences.filter((audience) => audience.pain);
  return [
    type ? `Brand type: ${type}${market ? `, selling to ${market}` : ""}` : null,
    archetype ? `Archetype: ${archetype}` : null,
    positioning ? `Positioning: ${positioning}` : null,
    dna.job && !jobSaid ? `The job buyers hire it for: ${dna.job}` : null,
    // Its own guardrails come early, so a brief cut short still keeps them.
    dna.guardrails.length
      ? `Its guardrails (every piece keeps these): ${dna.guardrails.map(sentence).join("; ")}`
      : null,
    dna.audiences.length
      ? `Who it serves: ${dna.audiences
          .map((audience) =>
            audience.job
              ? `${audience.name} (to ${sentence(midSentence(audience.job)).replace(/^to\s+/i, "")})`
              : audience.name,
          )
          .join("; ")}`
      : null,
    dna.offers.length
      ? `What it sells: ${dna.offers
          .map((offer) => (offer.what ? `${offer.name} (${sentence(offer.what)})` : offer.name))
          .join("; ")}`
      : null,
    dna.pillars.length
      ? `Content pillars: ${dna.pillars.map((pillar) => (pillar.about ? `${pillar.name} (${pillar.about})` : pillar.name)).join("; ")}`
      : null,
    dna.moments.length ? `Buying moments (hooks start here): ${dna.moments.join("; ")}` : null,
    pains.length
      ? `What holds them back: ${pains.map((audience) => `${audience.name}: ${sentence(midSentence(audience.pain!))}`).join("; ")}`
      : null,
    dna.proof.length ? `Proof it stands behind (use only these): ${dna.proof.join("; ")}` : null,
    dna.alternatives.length
      ? `What buyers use instead (compare fairly, never disparage): ${dna.alternatives.join("; ")}`
      : null,
    dna.assets.length
      ? `Distinctive assets (show early and often): ${dna.assets.join("; ")}`
      : null,
    dna.faces.length ? `Fronted by: ${frontedBy(dna.faces)}` : null,
    dna.channels.length
      ? `Publishes on: ${dna.channels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}`
      : null,
    dna.goal
      ? `Most content is for: ${GOAL_INFO[dna.goal].label.toLowerCase()} (${GOAL_INFO[dna.goal].hint.toLowerCase()})`
      : null,
    formulaNames.length ? `Content formulas it works with: ${formulaNames.join("; ")}` : null,
  ].filter((line): line is string => !!line);
}
