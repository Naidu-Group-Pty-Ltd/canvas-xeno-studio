/**
 * The studio's balances, as the top bar shows them.
 *
 * Higgsfield's API (generations, Soul ID trainings) runs on a prepaid balance
 * that its API doesn't report: it is shown only in the Higgsfield Console. So
 * an admin records the Console's figure, and the studio counts it down from
 * its own records of what it has had Higgsfield do since (see migration 0016's
 * higgsfield_api_spend_since). Higgsfield keeps a request's price only when
 * it succeeds, and holds it while the request runs. When Higgsfield refuses a
 * request for want of credits, that is shown at once, whatever the estimate.
 *
 * Katana runs on the Higgsfield account the studio connected (its plan's
 * credits, a separate wallet), which Higgsfield does report.
 *
 * Pure: no I/O, so it is unit-testable.
 */

export const HIGGSFIELD_CONSOLE_URL = "https://console.higgsfield.ai";
/**
 * Higgsfield's estimates quote both credits and dollars, at 16 credits a
 * dollar; used for a balance entered in credits when no estimate has been seen.
 */
export const DEFAULT_CREDITS_PER_USD = 16;
/** Below this many dollars, or this share of the figure recorded, the balance is low. */
export const LOW_BALANCE = { usd: 5, share: 0.1 } as const;
/** A refusal for want of credits this recent marks the balance low even after a request went through. */
const RECENT_REFUSAL_MS = 24 * 60 * 60 * 1000;

/** The Console's figure, as an admin recorded it. */
export interface RecordedBalance {
  usd: number;
  /** As entered, when it was entered in credits. */
  credits: number | null;
  at: string;
  byName: string | null;
}

export interface ProviderRefusal {
  at: string;
  message: string;
  kind: "generation" | "soul_id_training";
}

/** What the studio has had Higgsfield's API do since a time (and its last acceptance and refusal ever). */
export interface ApiSpend {
  spentUsd: number;
  completed: number;
  inFlightUsd: number;
  inFlight: number;
  uncertainUsd: number;
  uncertain: number;
  unpriced: number;
  trainings: number;
  lastAcceptedAt: string | null;
  lastRefusal: ProviderRefusal | null;
}

export type BalanceState = "ok" | "low" | "out" | "unknown";

export interface HiggsfieldBalanceView {
  recorded: RecordedBalance | null;
  /** Since the figure was recorded. */
  spend: ApiSpend | null;
  /** The figure less what was spent since and what is held for requests running; null without a figure. */
  estimatedUsd: number | null;
  /** Since midnight where the viewer is, recorded or not. */
  today: ApiSpend | null;
  state: BalanceState;
  /** The refusal for want of credits the state is about, if any. */
  refusal: ProviderRefusal | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number): number => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : fallback;
};

const timeOf = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

/** The recorded figure from its setting (higgsfield_api_balance), or null. */
export function readRecordedBalance(value: unknown): RecordedBalance | null {
  if (!isRecord(value)) return null;
  const usd = numberOr(value["usd"], Number.NaN);
  const at = timeOf(value["at"]);
  if (!Number.isFinite(usd) || usd < 0 || !at) return null;
  const credits = numberOr(value["credits"], Number.NaN);
  return {
    usd,
    credits: Number.isFinite(credits) ? credits : null,
    at,
    byName: typeof value["by_name"] === "string" ? value["by_name"] : null,
  };
}

/** The spend function's answer, or null when it isn't one. */
export function readSpend(value: unknown): ApiSpend | null {
  if (!isRecord(value)) return null;
  const refusal = isRecord(value["last_refusal"]) ? value["last_refusal"] : null;
  const refusedAt = refusal ? timeOf(refusal["at"]) : null;
  return {
    spentUsd: numberOr(value["spent_usd"], 0),
    completed: numberOr(value["completed"], 0),
    inFlightUsd: numberOr(value["in_flight_usd"], 0),
    inFlight: numberOr(value["in_flight"], 0),
    uncertainUsd: numberOr(value["uncertain_usd"], 0),
    uncertain: numberOr(value["uncertain"], 0),
    unpriced: numberOr(value["unpriced"], 0),
    trainings: numberOr(value["trainings"], 0),
    lastAcceptedAt: timeOf(value["last_accepted_at"]),
    lastRefusal:
      refusal && refusedAt
        ? {
            at: refusedAt,
            message: typeof refusal["message"] === "string" ? refusal["message"] : "",
            kind: refusal["kind"] === "soul_id_training" ? "soul_id_training" : "generation",
          }
        : null,
  };
}

/**
 * How the Higgsfield API balance stands: the recorded figure counted down,
 * and whether Higgsfield has refused a request for want of credits since it
 * was recorded (out, when nothing has gone through since; low, when something
 * has but the refusal is recent).
 */
export function higgsfieldBalanceView(input: {
  recorded: RecordedBalance | null;
  spend: ApiSpend | null;
  today: ApiSpend | null;
  now: Date;
}): HiggsfieldBalanceView {
  const { recorded, spend, today, now } = input;
  const latest = spend ?? today;
  const estimatedUsd =
    recorded && spend
      ? Math.round((recorded.usd - spend.spentUsd - spend.inFlightUsd) * 100) / 100
      : null;
  const refused = latest?.lastRefusal ?? null;
  // A refusal before the figure was recorded was answered by the top-up it records.
  const refusal =
    refused && (!recorded || Date.parse(refused.at) > Date.parse(recorded.at)) ? refused : null;
  const accepted = latest?.lastAcceptedAt ? Date.parse(latest.lastAcceptedAt) : null;
  let state: BalanceState = "unknown";
  if (refusal && (accepted === null || Date.parse(refusal.at) > accepted)) state = "out";
  else if (estimatedUsd !== null && recorded) {
    state =
      estimatedUsd <= Math.max(LOW_BALANCE.usd, recorded.usd * LOW_BALANCE.share) ? "low" : "ok";
  }
  if (
    (state === "ok" || state === "unknown") &&
    refusal &&
    now.getTime() - Date.parse(refusal.at) < RECENT_REFUSAL_MS
  ) {
    state = "low";
  }
  return { recorded, spend, estimatedUsd, today, state, refusal };
}

/** Dollars as the top bar shows them: cents always, thousands grouped. */
export function formatUsd(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The few words on the top bar's balance chip. */
export function balanceChipLabel(view: HiggsfieldBalanceView): string {
  if (view.state === "out") return "Out of credits";
  if (view.estimatedUsd !== null) return `≈ ${formatUsd(Math.max(0, view.estimatedUsd))}`;
  if (view.today) return `${formatUsd(view.today.spentUsd + view.today.inFlightUsd)} today`;
  return "Balance";
}

/** A dollar figure from a balance entered in either unit. */
export function balanceInUsd(
  amount: number,
  unit: "usd" | "credits",
  creditsPerUsd: number = DEFAULT_CREDITS_PER_USD,
): number {
  const rate = creditsPerUsd > 0 ? creditsPerUsd : DEFAULT_CREDITS_PER_USD;
  return Math.round((unit === "usd" ? amount : amount / rate) * 10_000) / 10_000;
}

/**
 * Where "today" starts for the top bar: the viewer's midnight, sent with the
 * request; a time that can't be that (in the future, or over a day ago) is
 * replaced by a day before `now`.
 */
export function startOfToday(sent: string | null | undefined, now: Date): string {
  const at = sent ? Date.parse(sent) : Number.NaN;
  const fallback = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (!Number.isFinite(at) || at > now.getTime() || now.getTime() - at > 25 * 60 * 60 * 1000) {
    return fallback;
  }
  return new Date(at).toISOString();
}

/** The credits-to-dollars rate an estimate quotes ({ credits, usd }), or null. */
export function quotedRate(estimate: unknown): number | null {
  if (!isRecord(estimate)) return null;
  const credits = numberOr(estimate["credits"], Number.NaN);
  const usd = numberOr(estimate["usd"], Number.NaN);
  if (!(credits > 0) || !(usd > 0)) return null;
  return Math.round((credits / usd) * 1000) / 1000;
}
