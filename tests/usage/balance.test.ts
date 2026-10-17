import { describe, expect, test } from "bun:test";
import {
  balanceChipLabel,
  balanceWarning,
  balanceInUsd,
  formatUsd,
  higgsfieldBalanceView,
  quotedRate,
  readRecordedBalance,
  readSpend,
  startOfToday,
  type ApiSpend,
} from "../../src/lib/usage-balance";

const NOW = new Date("2026-10-16T15:00:00Z");

function spend(overrides: Partial<ApiSpend> = {}): ApiSpend {
  return {
    spentUsd: 26.96,
    completed: 9,
    inFlightUsd: 0,
    inFlight: 0,
    uncertainUsd: 0,
    uncertain: 0,
    unpriced: 0,
    trainings: 1,
    lastAcceptedAt: "2026-10-16T14:40:13Z",
    lastRefusal: null,
    ...overrides,
  };
}

const recorded = { usd: 100, credits: null, at: "2026-10-15T09:00:00Z", byName: "Alex" };

describe("reading what the database holds", () => {
  test("the spend function's answer, as it comes back", () => {
    const value = readSpend({
      completed: 9,
      in_flight: 1,
      in_flight_usd: 6.45,
      last_accepted_at: "2026-10-16T14:40:13.823+00:00",
      last_refusal: {
        at: "2026-10-16T13:18:04.003586+00:00",
        kind: "soul_id_training",
        message: "Not enough credits",
      },
      spent_usd: "26.96",
      trainings: 1,
      uncertain: 0,
      uncertain_usd: 0,
      unpriced: 0,
    });
    expect(value).toMatchObject({
      spentUsd: 26.96,
      inFlight: 1,
      inFlightUsd: 6.45,
      lastRefusal: { kind: "soul_id_training", message: "Not enough credits" },
    });
    expect(readSpend(null)).toBeNull();
  });

  test("a recorded figure needs dollars and a time", () => {
    expect(readRecordedBalance({ usd: 150, at: "2026-10-15T09:00:00Z", by_name: "Alex" })).toEqual({
      usd: 150,
      credits: null,
      at: "2026-10-15T09:00:00Z",
      byName: "Alex",
    });
    expect(readRecordedBalance({ usd: -1, at: "2026-10-15T09:00:00Z" })).toBeNull();
    expect(readRecordedBalance({ usd: 5 })).toBeNull();
    expect(readRecordedBalance("150")).toBeNull();
  });
});

describe("the Higgsfield API balance", () => {
  test("is the recorded figure less what was spent and what is held since", () => {
    const view = higgsfieldBalanceView({
      recorded,
      spend: spend({ spentUsd: 40.5, inFlightUsd: 6.45, lastRefusal: null }),
      today: spend(),
      now: NOW,
    });
    expect(view.estimatedUsd).toBe(53.05);
    expect(view.state).toBe("ok");
    expect(balanceChipLabel(view)).toBe("≈ $53.05");
  });

  test("is low near the end of the figure", () => {
    const view = higgsfieldBalanceView({
      recorded,
      spend: spend({ spentUsd: 92 }),
      today: null,
      now: NOW,
    });
    expect(view.state).toBe("low");
    // Never shown below nothing, even when the estimate runs past it.
    const over = higgsfieldBalanceView({
      recorded,
      spend: spend({ spentUsd: 130 }),
      today: null,
      now: NOW,
    });
    expect(over.estimatedUsd).toBe(-30);
    expect(balanceChipLabel(over)).toBe("≈ $0.00");
  });

  test("is out when Higgsfield refused a request for credits and nothing went through since", () => {
    const refusal = {
      at: "2026-10-16T14:50:00Z",
      message: "Your credit balance is too low",
      kind: "generation" as const,
    };
    const view = higgsfieldBalanceView({
      recorded,
      spend: spend({ lastRefusal: refusal }),
      today: null,
      now: NOW,
    });
    expect(view.state).toBe("out");
    expect(view.refusal).toEqual(refusal);
    expect(balanceChipLabel(view)).toBe("Out of credits");
  });

  test("is low when a big request was refused but smaller ones went through after", () => {
    const view = higgsfieldBalanceView({
      recorded: null,
      spend: null,
      today: spend({
        lastRefusal: {
          at: "2026-10-16T13:18:04Z",
          message: "Not enough credits",
          kind: "soul_id_training",
        },
      }),
      now: NOW,
    });
    expect(view.state).toBe("low");
    expect(view.estimatedUsd).toBeNull();
    // Without a figure, the chip shows the day's spend.
    expect(balanceChipLabel(view)).toBe("$26.96 today");
  });

  test("forgets a refusal from before the figure was recorded (the top-up it records)", () => {
    const view = higgsfieldBalanceView({
      recorded: { ...recorded, at: "2026-10-16T14:55:00Z" },
      spend: spend({
        spentUsd: 0,
        completed: 0,
        lastAcceptedAt: "2026-10-16T13:00:00Z",
        lastRefusal: {
          at: "2026-10-16T14:50:00Z",
          message: "Not enough credits",
          kind: "generation",
        },
      }),
      today: null,
      now: NOW,
    });
    expect(view.refusal).toBeNull();
    expect(view.state).toBe("ok");
  });

  test("is unknown with nothing recorded and nothing refused", () => {
    const view = higgsfieldBalanceView({ recorded: null, spend: null, today: null, now: NOW });
    expect(view.state).toBe("unknown");
    expect(balanceChipLabel(view)).toBe("Balance");
  });
});

describe("today", () => {
  test("starts at the viewer's midnight, sent with the request", () => {
    // Midnight in Sydney (UTC+11) on the 17th is 13:00 UTC on the 16th.
    expect(startOfToday("2026-10-16T13:00:00.000Z", NOW)).toBe("2026-10-16T13:00:00.000Z");
  });

  test("a midnight that can't be one falls back to the last 24 hours", () => {
    const dayBefore = "2026-10-15T15:00:00.000Z";
    expect(startOfToday("2026-10-16T16:00:00.000Z", NOW)).toBe(dayBefore);
    expect(startOfToday("2026-10-14T00:00:00.000Z", NOW)).toBe(dayBefore);
    expect(startOfToday("not a time", NOW)).toBe(dayBefore);
    expect(startOfToday(null, NOW)).toBe(dayBefore);
  });
});

describe("entering the Console's figure", () => {
  test("credits are turned into dollars at the rate Higgsfield's estimates quote", () => {
    expect(quotedRate({ credits: "1.200", usd: "0.075" })).toBe(16);
    expect(quotedRate({ type: "description" })).toBeNull();
    expect(balanceInUsd(2400, "credits", 16)).toBe(150);
    expect(balanceInUsd(150, "usd", 16)).toBe(150);
    // A rate that isn't one falls back to Higgsfield's usual 16 a dollar.
    expect(balanceInUsd(160, "credits", 0)).toBe(10);
  });

  test("dollars are shown with cents and grouped thousands", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(0.075)).toBe("$0.08");
    expect(formatUsd(-3)).toBe("−$3.00");
  });
});

describe("before work that costs is started", () => {
  test("says when it would cost more than is left, so it would stop part-way", () => {
    // $100 recorded, $26.96 spent since: about $73.04 left.
    const view = higgsfieldBalanceView({ recorded, spend: spend(), today: null, now: NOW });
    expect(balanceWarning(view, 20)).toBeNull();
    expect(balanceWarning(view, 65)?.level).toBe("caution");
    const over = balanceWarning(view, 80.5)!;
    expect(over.level).toBe("stop");
    expect(over.message).toContain("$80.50");
    expect(over.message).toContain("$73.04");
  });

  test("says when Higgsfield has refused for want of credits, whatever it would cost", () => {
    const view = higgsfieldBalanceView({
      recorded,
      spend: spend({
        lastAcceptedAt: "2026-10-16T10:00:00Z",
        lastRefusal: {
          at: "2026-10-16T12:00:00Z",
          message: "Not enough credits",
          kind: "generation",
        },
      }),
      today: null,
      now: NOW,
    });
    expect(balanceWarning(view, null)?.level).toBe("stop");
  });

  test("has nothing to say without a recorded figure or a price", () => {
    const view = higgsfieldBalanceView({ recorded: null, spend: null, today: spend(), now: NOW });
    expect(balanceWarning(view, 500)).toBeNull();
    expect(balanceWarning(null, 5)).toBeNull();
  });
});
