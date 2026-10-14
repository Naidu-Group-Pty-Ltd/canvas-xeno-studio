/**
 * The brand finisher of a long video: the logo, wordmark or end card it ends
 * on (see `RunFinale` in ./plan). Finding the likely one among a run's
 * reference images, the size its end card is laid out at, and reading it back
 * from a run's record. Shared by Create, Supercomputer and the server.
 */
import { FINALE_MODES, FINALE_SECONDS, type FinaleMode, type RunFinale } from "./plan";

/** Words that mark an image as a logo or end card. */
const FINISHER_WORDS =
  /\b(logos?|logotypes?|logo ?marks?|word ?marks?|lock-?ups?|end ?cards?|end ?slates?|end ?frames?|brand ?marks?|hero ?marks?|brand (close|sign-?off)|sign-?off)\b/i;
/** Words that only hint at it. */
const HINT_WORDS = /\b(marks?|emblems?|monograms?|badges?|closing|pack ?shots?)\b/i;

export interface FinisherCandidate {
  assetId: string;
  title?: string | null;
  /** What a brief says the image is and is for (its image notes). */
  description?: string | null;
  suggestedUse?: string | null;
}

/**
 * The reference image that looks most like the brand's finisher, going by its
 * title and what its brief says it is for ("Logo and brand-world reference;
 * hero brand close"), or null when none clearly does. A description alone
 * isn't enough: "the logo on the lid" describes a product shot too.
 */
export function suggestFinisher(
  candidates: FinisherCandidate[],
): { assetId: string; reason: string } | null {
  const fields = [
    { key: "title", weight: 4, reason: "Its name says it's a logo or end card" },
    { key: "suggestedUse", weight: 3, reason: "Its brief marks it as the logo or brand close" },
    { key: "description", weight: 2, reason: "Its brief describes it as the logo" },
  ] as const;
  let best: { assetId: string; score: number; reason: string } | null = null;
  for (const candidate of candidates) {
    let score = 0;
    let reason = "";
    for (const field of fields) {
      const text = candidate[field.key] ?? "";
      // Each field counts once: as saying so, or else as hinting at it.
      if (FINISHER_WORDS.test(text)) {
        score += field.weight;
        reason ||= field.reason;
      } else if (HINT_WORDS.test(text)) score += 1;
    }
    if (score >= 3 && (!best || score > best.score))
      best = { assetId: candidate.assetId, score, reason };
  }
  return best ? { assetId: best.assetId, reason: best.reason } : null;
}

const RESOLUTION_SHORT_SIDE: Record<string, number> = {
  "360p": 360,
  "480p": 480,
  "540p": 540,
  "720p": 720,
  "1080p": 1080,
  "2k": 1440,
  "4k": 2160,
};

function ratioOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/.exec(value.trim().toLowerCase());
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

const even = (value: number) => Math.max(2, 2 * Math.round(value / 2));

/**
 * The size an end card is laid out at: the video's own shape (its aspect
 * ratio setting, else the size given, e.g. its first frame's) with the short
 * side at its resolution, kept between 720 and 1080 pixels so the card stays
 * sharp without being heavy.
 */
export function endCardSize(
  values: Record<string, unknown>,
  fallback?: { width: number | null; height: number | null } | null,
): { width: number; height: number } {
  const ratio =
    ratioOf(values["aspect_ratio"] ?? values["aspect"]) ??
    (fallback?.width && fallback.height ? fallback.width / fallback.height : null) ??
    16 / 9;
  const resolution =
    typeof values["resolution"] === "string" ? values["resolution"].toLowerCase() : "";
  const short = Math.min(1080, Math.max(720, RESOLUTION_SHORT_SIDE[resolution] ?? 1080));
  return ratio >= 1
    ? { width: Math.min(3840, even(short * ratio)), height: short }
    : { width: short, height: Math.min(3840, even(short / ratio)) };
}

/** How a run's finisher is kept among the references it was started with. */
export interface StoredFinale {
  asset_id: string;
  role: "finale";
  mode: FinaleMode;
  seconds: number;
  frame_asset_id: string | null;
  style: { background: string; scale: number | null } | null;
}

/** End card backgrounds a run may keep: the named ones, or a colour. */
const STYLE_BACKGROUNDS = new Set(["auto", "scene", "brand", "extend", "blur"]);

/** A finisher's end card style as given, or null when it isn't one. */
export function finaleStyle(value: unknown): { background: string; scale: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const background = item["background"];
  if (
    typeof background !== "string" ||
    !(STYLE_BACKGROUNDS.has(background) || /^#[0-9a-f]{6}$/i.test(background))
  )
    return null;
  const scale = Number(item["scale"]);
  return {
    background,
    scale:
      item["scale"] === null || !Number.isFinite(scale) ? null : Math.min(1, Math.max(0.3, scale)),
  };
}

export function storeFinale(finale: RunFinale): StoredFinale {
  return {
    asset_id: finale.assetId,
    role: "finale",
    mode: finale.mode,
    seconds: finale.seconds,
    frame_asset_id: finale.frameAssetId ?? null,
    style: finaleStyle(finale.style),
  };
}

/** A run's finisher, read back from the references it was started with. */
export function storedFinale(referencesUsed: unknown): RunFinale | null {
  if (!Array.isArray(referencesUsed)) return null;
  for (const entry of referencesUsed) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (item["role"] !== "finale" || typeof item["asset_id"] !== "string") continue;
    const mode = FINALE_MODES.includes(item["mode"] as FinaleMode)
      ? (item["mode"] as FinaleMode)
      : "end_card";
    const seconds = Number(item["seconds"]);
    return {
      assetId: item["asset_id"],
      mode,
      seconds:
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(FINALE_SECONDS.max, Math.max(FINALE_SECONDS.min, seconds))
          : FINALE_SECONDS.default,
      frameAssetId: typeof item["frame_asset_id"] === "string" ? item["frame_asset_id"] : null,
      // Runs from before styles were kept laid their cards out on the image's own colour.
      style: finaleStyle(item["style"]),
    };
  }
  return null;
}
