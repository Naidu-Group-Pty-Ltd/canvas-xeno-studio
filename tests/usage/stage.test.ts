import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RETAKE_ALLOWANCE,
  stageCost,
  stageTotals,
  stageVerdict,
} from "../../src/lib/stage-check";
import { higgsfieldBalanceView, type ApiSpend } from "../../src/lib/usage-balance";

const NOW = new Date("2026-10-21T09:00:00Z");
const recorded = { usd: 50, credits: null, at: "2026-10-20T09:00:00Z", byName: "Alex" };

function spend(overrides: Partial<ApiSpend> = {}): ApiSpend {
  return {
    spentUsd: 0,
    completed: 0,
    inFlightUsd: 0,
    inFlight: 0,
    uncertainUsd: 0,
    uncertain: 0,
    unpriced: 0,
    trainings: 0,
    lastAcceptedAt: "2026-10-20T10:00:00Z",
    lastRefusal: null,
    ...overrides,
  };
}

/** The balance as the studio counts it: the recorded $50 less what was spent and is held. */
const balance = (spent: number, overrides: Partial<ApiSpend> = {}) =>
  higgsfieldBalanceView({
    recorded,
    spend: spend({ spentUsd: spent, ...overrides }),
    today: null,
    now: NOW,
  });

/** Reel 1's stage 5: Cinema Studio 4.0 clips, one take each. */
const clips = (count: number, usd: number | null = 2.5) =>
  Array.from({ length: count }, (_, index) => ({ label: `C-${index + 1}`, usd, takes: 1 }));

describe("a stage's total", () => {
  test("is every take of every priced item, with a fifth again for retakes unless told otherwise", () => {
    const totals = stageTotals([
      { label: "P", usd: 0.17, takes: 3 },
      { label: "D", usd: 0.17, takes: 2 },
      { label: "Logo", usd: 4, takes: 1 },
    ]);
    expect(DEFAULT_RETAKE_ALLOWANCE).toBe(0.2);
    expect(totals).toEqual({
      totalUsd: 4.85,
      withAllowanceUsd: 5.82,
      allowance: 0.2,
      generations: 6,
      unpriced: [],
    });
    expect(stageCost(totals)).toBe("$4.85 ($5.82 with a 20% allowance for retakes)");
    expect(stageTotals(clips(2), 0).withAllowanceUsd).toBe(5);
    expect(stageCost(stageTotals(clips(2), 0))).toBe("$5.00");
    // The allowance is held to what is sensible.
    expect(stageTotals(clips(1), 7).allowance).toBe(2);
    expect(stageTotals(clips(1), -1).allowance).toBe(0);
  });

  test("names what couldn't be priced, and counts it as a generation all the same", () => {
    const totals = stageTotals([
      ...clips(2),
      { label: "Sunburst still", usd: null, takes: 2, problem: "billed by token usage" },
    ]);
    expect(totals.totalUsd).toBe(5);
    expect(totals.generations).toBe(4);
    expect(totals.unpriced).toEqual(["Sunburst still (billed by token usage)"]);
  });
});

describe("whether a stage fits", () => {
  test("it fits when its total with the allowance is within the balance and the limits", () => {
    const verdict = stageVerdict({
      totals: stageTotals(clips(9)),
      balance: balance(10),
      limit: { allowed: true, message: null, warning: null },
    });
    // $22.50, $27.00 with retakes, against $40 left.
    expect(verdict).toMatchObject({ fits: true, reasons: [], balanceUsd: 40, totalUsd: 22.5 });
    expect(verdict.warnings).toEqual([]);
  });

  test("nine clips that would run the balance out part way are refused before any is queued", () => {
    const verdict = stageVerdict({
      totals: stageTotals(clips(9)),
      balance: balance(30),
      limit: null,
    });
    expect(verdict.fits).toBe(false);
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]).toContain(
      "This stage of 9 generations is estimated at $22.50 ($27.00",
    );
    expect(verdict.reasons[0]).toContain("about $20.00 is left on the Higgsfield API balance");
    expect(verdict.reasons[0]).toContain("top up first");
  });

  test("the allowance for retakes is what tips it", () => {
    // $18.00 fits $20 left; $21.60 with retakes doesn't.
    const totals = stageTotals(clips(8, 2.25));
    expect(stageVerdict({ totals, balance: balance(30), limit: null }).fits).toBe(false);
    expect(
      stageVerdict({ totals: stageTotals(clips(8, 2.25), 0), balance: balance(30), limit: null })
        .fits,
    ).toBe(true);
  });

  test("most of what is left is a warning, not a refusal", () => {
    const verdict = stageVerdict({
      totals: stageTotals(clips(6), 0),
      balance: balance(32),
      limit: null,
    });
    expect(verdict.fits).toBe(true);
    expect(verdict.warnings[0]).toContain("most of the ≈$18.00 left");
  });

  test("a refusal for want of credits since the balance was recorded stops any stage", () => {
    const out = balance(0, {
      lastAcceptedAt: "2026-10-20T10:00:00Z",
      lastRefusal: {
        at: "2026-10-20T12:00:00Z",
        message: "Not enough credits",
        kind: "generation",
      },
    });
    const verdict = stageVerdict({ totals: stageTotals(clips(1)), balance: out, limit: null });
    expect(verdict.fits).toBe(false);
    expect(verdict.reasons[0]).toContain("turned a request away for want of credits");
  });

  test("a hard spending limit refuses it; a soft one warns", () => {
    const hard = stageVerdict({
      totals: stageTotals(clips(2)),
      balance: null,
      limit: {
        allowed: false,
        message: "This project has reached its hard spending limit.",
        warning: null,
      },
    });
    expect(hard.fits).toBe(false);
    expect(hard.reasons[0]).toBe(
      "This stage of 2 generations, at $5.00 ($6.00 with a 20% allowance for retakes), would go over a spending limit: This project has reached its hard spending limit.",
    );
    const soft = stageVerdict({
      totals: stageTotals(clips(2)),
      balance: balance(0),
      limit: {
        allowed: true,
        message: null,
        warning: "This generation takes the project over its spending limit.",
      },
    });
    expect(soft.fits).toBe(true);
    expect(soft.warnings).toEqual(["This generation takes the project over its spending limit."]);
  });

  test("with no balance recorded it is checked against the limits only, and says so", () => {
    const verdict = stageVerdict({
      totals: stageTotals(clips(2)),
      balance: higgsfieldBalanceView({ recorded: null, spend: null, today: spend(), now: NOW }),
      limit: { allowed: true, message: null, warning: null },
    });
    expect(verdict.fits).toBe(true);
    expect(verdict.balanceUsd).toBeNull();
    expect(verdict.warnings[0]).toContain("No Higgsfield API balance is recorded");
  });

  test("part of it unpriced refuses it, unless that is accepted", () => {
    const totals = stageTotals([
      ...clips(1),
      { label: "Still", usd: null, takes: 1, problem: "no price" },
    ]);
    const refused = stageVerdict({ totals, balance: balance(0), limit: null });
    expect(refused.fits).toBe(false);
    expect(refused.reasons[0]).toContain(
      "1 of the stage's items couldn't be priced (Still (no price))",
    );
    const accepted = stageVerdict({
      totals,
      balance: balance(0),
      limit: null,
      allowUnpriced: true,
    });
    expect(accepted.fits).toBe(true);
    expect(accepted.warnings[0]).toContain("The rest was checked.");
  });
});
