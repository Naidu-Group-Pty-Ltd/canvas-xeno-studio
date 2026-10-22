/**
 * A whole stage of generations, priced before any of it is queued (the
 * studio API's estimate_stage and queue_stage, and wherever the app queues
 * several at once). Reel 1 had nine clips and its 4K logo takes refused for
 * the provider's balance part way through a stage; a stage checked first is
 * queued whole or not at all.
 *
 * A stage doesn't fit, so none of it is queued, when its total with an
 * allowance for retakes goes past what is left on the Higgsfield API balance
 * as the studio counts it (see ./usage-balance), when it would go past a hard
 * spending limit, when Higgsfield has turned work away for want of credits
 * since the balance was recorded, or (unless the caller accepts it) when part
 * of it can't be priced, since its total would then say less than it costs.
 *
 * Pure: no I/O, so it is unit-testable.
 */
import { formatUsd, type HiggsfieldBalanceView } from "./usage-balance";

/** The share added for retakes unless one is given: a fifth again. */
export const DEFAULT_RETAKE_ALLOWANCE = 0.2;

/** The most a stage holds, the most takes of one item, and the largest allowance. */
export const STAGE_LIMITS = { items: 50, takes: 10, allowance: 2 } as const;

export interface StageItemPrice {
  /** What the item is called in an answer: its label, else its place in the stage. */
  label: string;
  /** One take's price, or null when it couldn't be priced. */
  usd: number | null;
  takes: number;
  /** Why it couldn't be priced. */
  problem?: string | null;
}

export interface StageTotals {
  /** What the priced items cost, every take of each. */
  totalUsd: number;
  /** The same with the allowance for retakes. */
  withAllowanceUsd: number;
  /** The share added for retakes. */
  allowance: number;
  /** How many generations the stage queues (every take of every item). */
  generations: number;
  /** The items that couldn't be priced, each with why. */
  unpriced: string[];
}

const cents = (usd: number) => Math.round(usd * 10_000) / 10_000;

/** What a stage comes to: its priced takes, with and without the allowance for retakes. */
export function stageTotals(
  items: readonly StageItemPrice[],
  allowance: number = DEFAULT_RETAKE_ALLOWANCE,
): StageTotals {
  const share = Math.min(STAGE_LIMITS.allowance, Math.max(0, Number(allowance) || 0));
  let total = 0;
  let generations = 0;
  const unpriced: string[] = [];
  for (const item of items) {
    const takes = Math.max(1, Math.round(item.takes));
    generations += takes;
    if (item.usd === null || !Number.isFinite(item.usd) || item.usd < 0)
      unpriced.push(item.problem ? `${item.label} (${item.problem})` : item.label);
    else total += item.usd * takes;
  }
  return {
    totalUsd: cents(total),
    withAllowanceUsd: cents(total * (1 + share)),
    allowance: share,
    generations,
    unpriced,
  };
}

/** A spending limit's answer for an amount (check_spend_allowance, or the member's monthly cap). */
export interface SpendLimit {
  allowed: boolean;
  /** Why it isn't allowed. */
  message: string | null;
  /** A soft limit passed, or a cap nearly used. */
  warning: string | null;
}

export interface StageVerdict extends StageTotals {
  /** Whether the whole stage may be queued. */
  fits: boolean;
  /** Why it may not, each in words a person can act on. */
  reasons: string[];
  /** What to know even though it fits. */
  warnings: string[];
  /** What is thought to be left on the Higgsfield API balance; null with no figure recorded. */
  balanceUsd: number | null;
}

/** "$4.00 ($4.80 with a 20% allowance for retakes)". */
export function stageCost(totals: StageTotals): string {
  return totals.allowance > 0
    ? `${formatUsd(totals.totalUsd)} (${formatUsd(totals.withAllowanceUsd)} with a ${Math.round(totals.allowance * 100)}% allowance for retakes)`
    : formatUsd(totals.totalUsd);
}

/**
 * Whether a stage fits: its total with the allowance against the balance and
 * the spending limit, and every part of it priced (unless `allowUnpriced`).
 */
export function stageVerdict(input: {
  totals: StageTotals;
  balance: HiggsfieldBalanceView | null;
  limit: SpendLimit | null;
  allowUnpriced?: boolean;
}): StageVerdict {
  const { totals, balance, limit } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const count = totals.generations === 1 ? "1 generation" : `${totals.generations} generations`;
  const cost = stageCost(totals);

  if (totals.unpriced.length) {
    const which = totals.unpriced.slice(0, 5).join("; ");
    const more = totals.unpriced.length > 5 ? ` and ${totals.unpriced.length - 5} more` : "";
    const message = `${totals.unpriced.length} of the stage's items couldn't be priced (${which}${more}), so its total says less than it will cost.`;
    if (input.allowUnpriced) warnings.push(`${message} The rest was checked.`);
    else
      reasons.push(
        `${message} Price them first (an admin can set a model's list price on the Usage page), or queue the stage accepting that.`,
      );
  }

  const balanceUsd = balance?.estimatedUsd ?? null;
  if (balance?.state === "out")
    reasons.push(
      "Higgsfield turned a request away for want of credits, and nothing has gone through since. Top up the API balance in the Higgsfield Console first, or the stage would stop at its first request.",
    );
  else if (balance && balanceUsd !== null && balance.recorded) {
    const left = Math.max(0, balanceUsd);
    const recordedOn = new Date(balance.recorded.at).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    });
    if (totals.withAllowanceUsd > left)
      reasons.push(
        `This stage of ${count} is estimated at ${cost}, but about ${formatUsd(left)} is left on the Higgsfield API balance (counted down from the figure recorded ${recordedOn}). It would stop part way when the credits run out: top up first, or record the balance again if it has been topped up.`,
      );
    else if (totals.withAllowanceUsd > left * 0.8)
      warnings.push(
        `This stage would use most of the ≈${formatUsd(left)} left on the Higgsfield API balance.`,
      );
  } else if (!balance?.recorded && totals.totalUsd > 0)
    warnings.push(
      "No Higgsfield API balance is recorded, so the stage wasn't checked against it. An admin records the Console's figure from the balance in the top bar.",
    );

  if (limit && !limit.allowed)
    reasons.push(
      `This stage of ${count}, at ${cost}, would go over a spending limit: ${limit.message ?? "the limit set for this work."}`,
    );
  else if (limit?.warning) warnings.push(limit.warning);

  return { ...totals, fits: reasons.length === 0, reasons, warnings, balanceUsd };
}
