import { describe, expect, test } from "bun:test";
import { describeChecks, drawingChecksOf } from "../../src/lib/compositions/checks";

const settled = (frames_recaptured: number, unsettled: number[] = []) => ({
  frames_recaptured,
  unsettled,
});

describe("how a drawing's frames were checked", () => {
  test("a drawing in stretches is checked stretch by stretch, and its checks are theirs together", () => {
    const checks = drawingChecksOf([
      {
        settle: settled(2),
        verified: { frames: 14, disagreed: [250], replaced_by_agreement: [250], unresolved: [] },
      },
      {
        settle: settled(1, [480]),
        verified: { frames: 13, disagreed: [], replaced_by_agreement: [], unresolved: [] },
      },
    ]);
    expect(checks).toEqual({
      recaptured: 3,
      unsettled: [480],
      voted: 27,
      disagreed: [250],
      replaced: [250],
      unresolved: [],
      unreported: 0,
    });
    expect(describeChecks(checks)).toBe(
      "3 frames captured again before two captures agreed; 1 with a drawing that never settled (480); 27 frames drawn again to check: 1 disagreed: 1 replaced by the frame two draws agreed on.",
    );
  });

  test("a draft is not put to the vote, and a drawing that settled at once says so", () => {
    const checks = drawingChecksOf([{ settle: settled(0), verified: null }]);
    expect(checks.voted).toBeNull();
    expect(describeChecks(checks)).toBe("every drawing settled at once.");
  });

  test("a task drawn before the media service reported its checks is counted, not guessed", () => {
    const checks = drawingChecksOf([{ drawings_captured: 40 }, null]);
    expect(checks).toMatchObject({ unreported: 2, recaptured: 0, voted: null });
    expect(describeChecks(checks)).toBeNull();
    expect(describeChecks(null)).toBeNull();
  });
});
