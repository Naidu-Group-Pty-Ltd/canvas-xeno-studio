/**
 * Which refusals and failures from Higgsfield are worth trying again on their
 * own, and when.
 *
 * Higgsfield keeps a request's price only when it succeeds: one it turned
 * away, and one that failed, cost nothing. Some of those are only for the
 * moment (a model "temporarily unavailable", the account rate limited, the
 * provider overloaded): in the Aurixa job, 14 of 29 keyframe attempts came
 * back "temporarily unavailable" and each was requeued by hand. Those go back
 * in the local queue a few minutes later, up to a few times. Anything whose
 * outcome is uncertain (the request may be running) is never sent again on
 * its own; nor is anything the provider refused on its merits (the settings,
 * moderation, the balance).
 */

/** Tries again on its own, at most. */
export const MAX_AUTO_RETRIES = 3;
/** How long to wait before each, in minutes. */
export const RETRY_WAIT_MINUTES = [2, 5, 10] as const;

const NEVER = new Set([
  "INVALID_PARAMETERS",
  "MODERATION_BLOCKED",
  "INSUFFICIENT_PROVIDER_BALANCE",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_DISABLED",
  "BUDGET_EXCEEDED",
  "SUBMISSION_UNCERTAIN",
  "UPLOAD_FAILED",
  "ESTIMATE_FAILED",
]);

const FOR_NOW =
  /temporar(?:il)?y|try (?:it )?again|overload|over capacity|at capacity|capacity|too many requests|rate[- ]?limit|busy|queue is full|unavailable right now|currently unavailable|high demand/i;
/** Failures after it was accepted that read as the provider's own trouble, not the request's. */
const PROVIDER_TROUBLE =
  /timed? ?out|timeout|internal (?:server )?error|worker (?:crashed|died|lost)|service unavailable|server error/i;
const ON_ITS_MERITS =
  /nsfw|moderation|safety|policy|invalid|not allowed|unsupported|credits?|balance|insufficient|not found|unavailable for this account/i;

/**
 * Whether a refusal at submission (nothing was started) is for the moment:
 * rate limits, and refusals that say so.
 */
export function transientRefusal(input: {
  code: string | null | undefined;
  message: string | null | undefined;
  status: number;
}): boolean {
  const code = input.code ?? "";
  if (NEVER.has(code)) return false;
  // 5xx and dropped connections are uncertain (the request may be running): never here.
  if (input.status === 0 || input.status >= 500) return false;
  if (input.status === 404) return false;
  if (code === "RATE_LIMITED" || input.status === 429) return true;
  const message = input.message ?? "";
  return FOR_NOW.test(message) && !ON_ITS_MERITS.test(message.replace(FOR_NOW, ""));
}

/** Whether a generation that failed at the provider (after it was accepted, so refunded) failed for the moment. */
export function transientFailure(message: string | null | undefined): boolean {
  const text = message ?? "";
  if (!text) return false;
  if (ON_ITS_MERITS.test(text.replace(FOR_NOW, "").replace(PROVIDER_TROUBLE, ""))) return false;
  return FOR_NOW.test(text) || PROVIDER_TROUBLE.test(text);
}

/** When the next automatic try goes, after `retries` already made (null: no more). */
export function nextRetryAt(retries: number, now = Date.now()): Date | null {
  if (!(retries >= 0) || retries >= MAX_AUTO_RETRIES) return null;
  const minutes = RETRY_WAIT_MINUTES[Math.min(retries, RETRY_WAIT_MINUTES.length - 1)]!;
  return new Date(now + minutes * 60_000);
}

/**
 * The idempotency key a try is sent with: the generation's id for the first,
 * then a key of its own for each automatic try, so a provider that remembered
 * the refusal under the first key still takes the next.
 */
export function submissionKey(generationId: string, retries: number): string {
  return retries > 0 ? `${generationId}:retry-${retries}` : generationId;
}
