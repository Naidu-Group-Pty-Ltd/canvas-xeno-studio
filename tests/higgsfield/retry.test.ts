import { describe, expect, test } from "bun:test";
import {
  MAX_AUTO_RETRIES,
  nextRetryAt,
  submissionKey,
  transientFailure,
  transientRefusal,
} from "../../src/lib/higgsfield/retry";

describe("refusals worth trying again on their own", () => {
  test("are rate limits and refusals that say they are for the moment", () => {
    expect(
      transientRefusal({ code: "RATE_LIMITED", message: "Too many requests", status: 429 }),
    ).toBe(true);
    expect(
      transientRefusal({
        code: "PROVIDER_REJECTED",
        message: "Model temporarily unavailable",
        status: 409,
      }),
    ).toBe(true);
    expect(
      transientRefusal({
        code: "RATE_LIMITED",
        message: "Concurrent generation limit reached",
        status: 400,
      }),
    ).toBe(true);
  });

  test("never include anything uncertain, or refused on its merits", () => {
    // A 5xx may already be running: never sent again on its own.
    expect(
      transientRefusal({
        code: "PROVIDER_REJECTED",
        message: "temporarily unavailable",
        status: 503,
      }),
    ).toBe(false);
    expect(transientRefusal({ code: "PROVIDER_TIMEOUT", message: "timed out", status: 0 })).toBe(
      false,
    );
    expect(
      transientRefusal({
        code: "INVALID_PARAMETERS",
        message: "try again with a shorter prompt",
        status: 422,
      }),
    ).toBe(false);
    expect(
      transientRefusal({
        code: "INSUFFICIENT_PROVIDER_BALANCE",
        message: "not_enough_credits",
        status: 403,
      }),
    ).toBe(false);
    expect(transientRefusal({ code: "MODERATION_BLOCKED", message: "nsfw", status: 400 })).toBe(
      false,
    );
    expect(
      transientRefusal({
        code: "PROVIDER_REJECTED",
        message: "HTTP 404 (model unavailable for this account)",
        status: 404,
      }),
    ).toBe(false);
  });
});

describe("failures after acceptance worth trying again", () => {
  test("are the provider's own trouble, not the request's", () => {
    expect(transientFailure("Model temporarily unavailable")).toBe(true);
    expect(transientFailure("Generation timed out")).toBe(true);
    expect(transientFailure("Internal server error")).toBe(true);
    expect(transientFailure("Content failed the safety policy")).toBe(false);
    expect(transientFailure("Invalid image dimensions")).toBe(false);
    expect(transientFailure("Generation failed at the provider")).toBe(false);
    expect(transientFailure(null)).toBe(false);
  });
});

describe("when tries go", () => {
  test("a few minutes apart, longer each time, a few times at most", () => {
    const now = Date.parse("2026-10-17T10:00:00Z");
    expect(nextRetryAt(0, now)?.toISOString()).toBe("2026-10-17T10:02:00.000Z");
    expect(nextRetryAt(1, now)?.toISOString()).toBe("2026-10-17T10:05:00.000Z");
    expect(nextRetryAt(2, now)?.toISOString()).toBe("2026-10-17T10:10:00.000Z");
    expect(nextRetryAt(MAX_AUTO_RETRIES, now)).toBeNull();
  });

  test("each under its own idempotency key, the first under the generation's id", () => {
    expect(submissionKey("gen-1", 0)).toBe("gen-1");
    expect(submissionKey("gen-1", 2)).toBe("gen-1:retry-2");
  });
});
