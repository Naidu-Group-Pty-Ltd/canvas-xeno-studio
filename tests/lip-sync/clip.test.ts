import { describe, expect, test } from "bun:test";
import {
  clipLipSyncOf,
  clipSyncStep,
  MAX_SYNC_ATTEMPTS,
  SYNC_ASK_GRACE_MS,
  type ClipLipSync,
} from "../../src/lib/lip-sync/clip";

const NOW = Date.parse("2026-10-16T09:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const link = (overrides: Partial<ClipLipSync> = {}): ClipLipSync => ({
  preparation_id: "prep",
  piece_asset_id: "piece",
  start_seconds: 0,
  end_seconds: 7.4,
  status: "measuring",
  attempts: 1,
  task_id: "task",
  updated_at: ago(60_000),
  ...overrides,
});

describe("settling a single clip's sync in the reconcile job", () => {
  test("takes in an answer that came but wasn't taken in, whether it measured or failed", () => {
    expect(clipSyncStep(link(), { status: "completed" }, NOW)).toBe("record");
    expect(clipSyncStep(link(), { status: "failed" }, NOW)).toBe("record");
    // Taken in even with every try spent: a failure then settles it as in step.
    expect(clipSyncStep(link({ attempts: MAX_SYNC_ATTEMPTS }), { status: "failed" }, NOW)).toBe(
      "record",
    );
  });

  test("leaves a task that is still running to the media service", () => {
    expect(clipSyncStep(link(), { status: "submitting" }, NOW)).toBeNull();
    expect(clipSyncStep(link(), { status: "processing" }, NOW)).toBeNull();
  });

  test("asks again for a clip whose task is gone, until every try is spent", () => {
    expect(clipSyncStep(link(), null, NOW)).toBe("ask");
    expect(clipSyncStep(link({ attempts: MAX_SYNC_ATTEMPTS }), null, NOW)).toBe("give_up");
  });

  test("asks for a clip with no task once the request asking for one has had its chance", () => {
    const waiting = link({ task_id: null, attempts: 0 });
    expect(
      clipSyncStep({ ...waiting, updated_at: ago(SYNC_ASK_GRACE_MS - 1_000) }, null, NOW),
    ).toBeNull();
    expect(
      clipSyncStep({ ...waiting, updated_at: ago(SYNC_ASK_GRACE_MS + 1_000) }, null, NOW),
    ).toBe("ask");
    // A busy media service was asked twice already: one more try, then none.
    expect(
      clipSyncStep({ ...waiting, attempts: 2, updated_at: ago(SYNC_ASK_GRACE_MS + 1) }, null, NOW),
    ).toBe("ask");
    expect(
      clipSyncStep(
        { ...waiting, attempts: MAX_SYNC_ATTEMPTS, updated_at: ago(SYNC_ASK_GRACE_MS + 1) },
        null,
        NOW,
      ),
    ).toBe("give_up");
  });

  test("asks for a clip whose time can't be read rather than leaving it waiting", () => {
    expect(clipSyncStep(link({ task_id: null, updated_at: "not a time" }), null, NOW)).toBe("ask");
  });

  test("does nothing for a clip that is settled", () => {
    for (const status of ["measured", "unverified", "failed"] as const)
      expect(clipSyncStep(link({ status }), { status: "completed" }, NOW)).toBeNull();
  });

  test("reads the link it is given back from a clip's file", () => {
    expect(clipLipSyncOf({ lip_sync: link({ task_id: null }) })).toMatchObject({
      status: "measuring",
      task_id: null,
    });
    expect(clipLipSyncOf({ lip_sync: { status: "measuring" } })).toBeNull();
  });
});
