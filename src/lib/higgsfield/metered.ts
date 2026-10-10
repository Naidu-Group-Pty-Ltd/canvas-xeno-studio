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
 */

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
    /multiplied by ([\d.]+)/i.exec(text)?.[1] ??
    /\(([\d.]+)\s*[×x] the standard rate\)/i.exec(text)?.[1];
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
