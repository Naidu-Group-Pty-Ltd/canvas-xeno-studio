/**
 * Prices for token-metered models (Seedance 2.5, Cinema Studio 4.0 and the
 * like). Their estimate answers with a rate, not a figure:
 *
 *   billable video tokens = ceil(width × height × (input video s + generated s) × 24 / 1024)
 *   cost = tokens / 1000 × rate (one rate up to 720p, another at 1080p; × 0.6 with video input)
 *
 * The rate is read from the provider's own description each time, so a price
 * change is picked up without a release; only the arithmetic lives here. The
 * result is the list price: an account discount, if any, makes the real charge
 * lower, never higher.
 *
 * A description can also state a flat price: per output image, per request or
 * per second of output, in dollars or in credits (see parseUnitPrice). Where it
 * says something this doesn't follow, an admin's list price for the model is
 * priced the same way (unitQuote); no price is ever guessed.
 */
import { DEFAULT_CREDITS_PER_USD } from "../usage-balance";

export interface MeteredRates {
  /** USD per 1,000 video tokens at 480p and 720p. */
  standard: number;
  /** USD per 1,000 video tokens at 1080p, where the model offers it. */
  fullHd: number | null;
  /** Factor applied to the rate when any video is given as input. */
  videoInputFactor: number;
  fps: number;
  divisor: number;
}

const money = (text: string) => Number(text.replace(/,/g, ""));

/** The rates in a provider's pricing description, or null when it isn't one this understands. */
export function parseMeteredRates(description: string | null | undefined): MeteredRates | null {
  if (!description || !/video tokens/i.test(description)) return null;
  const text = description.replace(/\s+/g, " ");
  // "Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p"
  const both =
    /1,?000 video tokens costs? \$([\d.]+) at 480p or 720p(?: and \$([\d.]+) at 1080p)?/i.exec(
      text,
    );
  // "At 480p or 720p, each 1,000 video tokens cost $0.0214 without video input"
  const lower = /at 480p or 720p,? each 1,?000 video tokens costs? \$([\d.]+)/i.exec(text);
  const standard = both ? money(both[1]!) : lower ? money(lower[1]!) : NaN;
  if (!Number.isFinite(standard) || standard <= 0) return null;
  const fullHdMatch =
    both?.[2] ?? /\$([\d.]+) (?:per 1,?000 video tokens )?at 1080p/i.exec(text)?.[1];
  const fullHd = fullHdMatch ? money(fullHdMatch) : null;
  // "multiplied by 0.6" or "(0.6× the standard rate)"; without either, video input is billed at the full rate.
  const factorMatch =
    /multiplied by (\d+(?:\.\d+)?)/i.exec(text)?.[1] ??
    /\((\d+(?:\.\d+)?)\s*[×x] the standard rate\)/i.exec(text)?.[1];
  const videoInputFactor = factorMatch ? money(factorMatch) : 1;
  const fps = Number(/[×x]\s*(\d+)\s*(?:fps)?\s*\/\s*1024/i.exec(text)?.[1] ?? 24);
  return {
    standard,
    fullHd: fullHd !== null && Number.isFinite(fullHd) && fullHd > 0 ? fullHd : null,
    videoInputFactor:
      Number.isFinite(videoInputFactor) && videoInputFactor > 0 ? videoInputFactor : 1,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 24,
    divisor: 1024,
  };
}

/**
 * Output frame sizes by tier and aspect ratio (ByteDance's Seedance sizes,
 * which Higgsfield's metered models produce; 720p 9:16 is 720×1280, as the
 * studio's own outputs measure). An unknown ratio takes its tier's largest
 * frame, so a quote is never low.
 */
const FRAMES: Record<string, Record<string, [number, number]>> = {
  "480p": {
    "16:9": [864, 496],
    "4:3": [752, 560],
    "1:1": [640, 640],
    "3:4": [560, 752],
    "9:16": [496, 864],
    "21:9": [992, 432],
  },
  "720p": {
    "16:9": [1280, 720],
    "4:3": [1112, 834],
    "1:1": [960, 960],
    "3:4": [834, 1112],
    "9:16": [720, 1280],
    "21:9": [1470, 630],
  },
  "1080p": {
    "16:9": [1920, 1080],
    "4:3": [1664, 1248],
    "1:1": [1440, 1440],
    "3:4": [1248, 1664],
    "9:16": [1080, 1920],
    "21:9": [2206, 946],
  },
};

export function outputFrame(
  resolution: string,
  aspectRatio: string | null,
): [number, number] | null {
  const tier = FRAMES[resolution.toLowerCase()];
  if (!tier) return null;
  if (aspectRatio && tier[aspectRatio]) return tier[aspectRatio]!;
  return Object.values(tier).reduce((largest, frame) =>
    frame[0] * frame[1] > largest[0] * largest[1] ? frame : largest,
  );
}

export interface MeteredQuote {
  usd: number;
  tokens: number;
  width: number;
  height: number;
  seconds: number;
  inputVideoSeconds: number;
  ratePer1k: number;
}

/**
 * The list price of one metered request, or null when what it depends on
 * (rates, a resolution the rates cover, a length) isn't known.
 */
export function meteredQuote(input: {
  rates: MeteredRates;
  resolution: string | null | undefined;
  aspectRatio: string | null | undefined;
  seconds: number | null | undefined;
  inputVideoSeconds?: number;
}): MeteredQuote | null {
  const { rates } = input;
  const resolution = (input.resolution ?? "").toLowerCase();
  const seconds = Number(input.seconds);
  if (!resolution || !Number.isFinite(seconds) || seconds <= 0) return null;
  const frame = outputFrame(resolution, input.aspectRatio ?? null);
  if (!frame) return null;
  const base = resolution === "1080p" ? rates.fullHd : rates.standard;
  if (base === null) return null;
  const inputVideoSeconds = Math.max(0, input.inputVideoSeconds ?? 0);
  const ratePer1k = Number(
    (inputVideoSeconds > 0 ? base * rates.videoInputFactor : base).toFixed(6),
  );
  const [width, height] = frame;
  const tokens = Math.ceil(
    (width * height * (inputVideoSeconds + seconds) * rates.fps) / rates.divisor,
  );
  const usd = Math.ceil((tokens / 1000) * ratePer1k * 100) / 100;
  return { usd, tokens, width, height, seconds, inputVideoSeconds, ratePer1k };
}

/**
 * Video given as input is trimmed or padded by the provider to at most 30
 * seconds in all (per media type) before it is billed; a source video is
 * also brought up to at least 4 seconds.
 */
export const VIDEO_INPUT_BUDGET_SECONDS = 30;
export const MIN_SOURCE_VIDEO_SECONDS = 4;

/** What the provider bills of the video given as input: its total length, up to the budget. */
export function billableInputSeconds(totalSeconds: number): number {
  return Math.min(Math.max(0, totalSeconds), VIDEO_INPUT_BUDGET_SECONDS);
}

/** How long a source video is once the provider has processed it (4–30 s). */
export function processedSourceSeconds(seconds: number): number {
  return Math.min(Math.max(seconds, MIN_SOURCE_VIDEO_SECONDS), VIDEO_INPUT_BUDGET_SECONDS);
}

interface PricedField {
  key: string;
  default?: unknown;
  max?: number;
}

/**
 * A metered request's list price from what is sent: its resolution, aspect
 * ratio and length, else the model's defaults (what the provider applies when
 * a setting is left out). A length left to the provider is priced at the
 * longest the model allows, so the quote is an upper bound rather than a guess.
 * A model with no length setting (Seedance's video edit) makes a video as long
 * as its processed source video, given as `sourceVideoSeconds`.
 */
export function meteredQuoteFor(input: {
  description: string | null | undefined;
  fields: readonly PricedField[];
  values: Record<string, unknown>;
  inputVideoSeconds?: number;
  sourceVideoSeconds?: number | null;
}): MeteredQuote | null {
  const rates = parseMeteredRates(input.description);
  if (!rates) return null;
  const field = (key: string) => input.fields.find((entry) => entry.key === key);
  const value = (key: string) => input.values[key] ?? field(key)?.default;
  const text = (key: string) => {
    const found = value(key);
    return typeof found === "string" && found ? found : null;
  };
  const given = Number(value("duration"));
  const derived =
    !field("duration") && input.sourceVideoSeconds != null && input.sourceVideoSeconds > 0
      ? processedSourceSeconds(input.sourceVideoSeconds)
      : null;
  const seconds =
    Number.isFinite(given) && given > 0 ? given : (derived ?? field("duration")?.max ?? null);
  return meteredQuote({
    rates,
    resolution: text("resolution"),
    aspectRatio: text("aspect_ratio"),
    seconds,
    // Video edit pads a source shorter than its minimum to that minimum, and
    // bills the padded input (extend sets its own length and isn't padded).
    inputVideoSeconds: billableInputSeconds(
      (input.inputVideoSeconds ?? 0) +
        (derived !== null ? Math.max(0, derived - (input.sourceVideoSeconds ?? derived)) : 0),
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Prices per unit                                                     */
/* ------------------------------------------------------------------ */

/** What a flat price is for: each output image, each request, or each second of output. */
export type PriceUnit = "image" | "request" | "second";
export const PRICE_UNITS: readonly PriceUnit[] = ["image", "request", "second"];

export interface UnitPrice {
  unit: PriceUnit;
  /** Dollars for one. */
  usd: number;
  /** Credits for one, when the price is stated in credits. */
  credits: number | null;
}

/** A price as descriptions write it: "$0.04", "US$0.04", "0.04 USD", "8 credits". */
const FIGURES =
  /(?:us\s?)?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?:usd|us dollars?|dollars?)\b|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?credits?\b/g;

/**
 * Words that make a flat price unclear: it depends on tokens, tiers,
 * resolution or quality, or is a range or a starting price. A description
 * with any of them isn't read as a price per unit.
 */
const UNCLEAR =
  /token|depend|var(?:y|ies|iable)|tier|starting at|from (?:us\s?)?\$|up to|between|minimum|at least|per (?:1,?000|thousand|hundred|million)|\b\d{3,4}p\b|\b\d(?:\.\d)?k\b|resolution|quality|discount/;

/** A unit as descriptions name it ("output image", "generation", "second of video"). */
function unitOf(phrase: string): PriceUnit | null {
  const word = phrase
    .replace(/^(?:output|generated|result|rendered|final) /, "")
    .replace(/ of (?:output |generated )?video$/, "");
  if (/^(?:images?|pictures?|stills?)$/.test(word)) return "image";
  if (/^(?:generations?|requests?|runs?|calls?)$/.test(word)) return "request";
  if (/^(?:seconds?|secs?)$/.test(word)) return "second";
  return null;
}

const UNIT_PHRASE = String.raw`((?:output |generated |result |rendered |final )?[a-z]+(?: of (?:output |generated )?video)?)`;
/** "$0.04 per image", "8 credits/image", "$0.04 for each image", "8 credits an image". */
const UNIT_AFTER = new RegExp(
  String.raw`^ ?(?:per|\/|for each|for every|for one|each|every|an?) ?${UNIT_PHRASE}`,
);
/** "Each image costs $0.04", "One generation is 10 credits", "Per second: $0.05". */
const UNIT_BEFORE = new RegExp(
  String.raw`(?:each|every|one|per|an?) ${UNIT_PHRASE} ?(?:costs?|is|are|=|:|at) ?$`,
);
/** "Images cost $0.04 each". */
const UNIT_EACH_BEFORE = new RegExp(String.raw`\b${UNIT_PHRASE} (?:cost|are) $`);

/**
 * The unit a price in a description is for, from the words around it (past
 * an aside in brackets: "8 credits ($0.50) per image").
 */
function unitNear(text: string, start: number, end: number): PriceUnit | null {
  const after = text
    .slice(end, end + 64)
    .replace(/^ ?\([^)]*\)/, "")
    .replace(/^\)/, "");
  const before = text.slice(Math.max(0, start - 48), start);
  const phrase =
    UNIT_AFTER.exec(after)?.[1] ??
    UNIT_BEFORE.exec(before)?.[1] ??
    (/^ (?:each|apiece)\b/.test(after) ? UNIT_EACH_BEFORE.exec(before)?.[1] : undefined);
  return phrase ? unitOf(phrase) : null;
}

/**
 * The flat price a provider's pricing description states, where it states
 * one plainly: one price (in dollars, or in credits, or both for the same
 * price), for one unit it names (an output image, a request or a second of
 * output). Credits are dollars at `creditsPerUsd` (Higgsfield's 16 to the
 * dollar unless given). Null for anything else (token rates, tiers, prices
 * that depend on settings, two prices), which is never guessed at.
 */
export function parseUnitPrice(
  description: string | null | undefined,
  creditsPerUsd: number = DEFAULT_CREDITS_PER_USD,
): UnitPrice | null {
  if (!description) return null;
  const text = description.toLowerCase().replace(/\s+/g, " ").trim();
  if (UNCLEAR.test(text)) return null;
  const dollars = new Set<number>();
  const credits = new Set<number>();
  const units = new Set<PriceUnit>();
  for (const match of text.matchAll(FIGURES)) {
    const inDollars = match[1] ?? match[2];
    const value = money(inDollars ?? match[3] ?? "");
    if (!Number.isFinite(value) || value <= 0) return null;
    (inDollars ? dollars : credits).add(value);
    const unit = unitNear(text, match.index, match.index + match[0].length);
    if (unit) units.add(unit);
  }
  if (!dollars.size && !credits.size) return null;
  if (dollars.size > 1 || credits.size > 1 || units.size !== 1) return null;
  const rate = creditsPerUsd > 0 ? creditsPerUsd : DEFAULT_CREDITS_PER_USD;
  const usd = dollars.size ? [...dollars][0]! : [...credits][0]! / rate;
  return {
    unit: [...units][0]!,
    usd: Number(usd.toFixed(6)),
    credits: credits.size ? [...credits][0]! : null,
  };
}

/** The settings that say how many images one request makes. */
const IMAGE_COUNT_KEYS = ["batch_size", "num_images", "number_of_images", "num_outputs"];

/** How many images a request makes: its count setting as sent (else the model's default), or one. */
export function outputImages(
  fields: readonly PricedField[],
  values: Record<string, unknown>,
): number {
  for (const key of IMAGE_COUNT_KEYS) {
    const raw = values[key] ?? fields.find((field) => field.key === key)?.default;
    if (raw === undefined || raw === null || raw === "") continue;
    const count = Number(raw);
    if (Number.isInteger(count) && count >= 1 && count <= 100) return count;
  }
  return 1;
}

/** How long a request's output runs: its length as sent, else the default, else the longest allowed. */
function outputSeconds(
  fields: readonly PricedField[],
  values: Record<string, unknown>,
): number | null {
  const field = fields.find((entry) => entry.key === "duration");
  const raw = values["duration"] ?? field?.default;
  const given = Number(typeof raw === "string" ? raw.replace(/s$/i, "") : raw);
  if (Number.isFinite(given) && given > 0) return given;
  return field?.max !== undefined && field.max > 0 ? field.max : null;
}

export interface UnitQuote {
  usd: number;
  unit: PriceUnit;
  /** How many of the unit the request makes. */
  units: number;
  unitUsd: number;
}

/**
 * What a request costs at a price per unit (stated by the provider, or an
 * admin's list price): the unit's price times the images it makes, once for
 * the request, or times its seconds. Null when that count can't be told (a
 * price per second for a request with no length).
 */
export function unitQuote(
  price: { unit: PriceUnit; usd: number },
  fields: readonly PricedField[],
  values: Record<string, unknown>,
): UnitQuote | null {
  const units =
    price.unit === "image"
      ? outputImages(fields, values)
      : price.unit === "request"
        ? 1
        : outputSeconds(fields, values);
  if (units === null || !(units > 0) || !(price.usd > 0)) return null;
  return {
    usd: Number((price.usd * units).toFixed(4)),
    unit: price.unit,
    units,
    unitUsd: price.usd,
  };
}

/** A request's price from its pricing description's flat price (see parseUnitPrice), or null. */
export function unitQuoteFor(input: {
  description: string | null | undefined;
  fields: readonly PricedField[];
  values: Record<string, unknown>;
  creditsPerUsd?: number;
}): UnitQuote | null {
  const price = parseUnitPrice(input.description, input.creditsPerUsd);
  return price ? unitQuote(price, input.fields, input.values) : null;
}
