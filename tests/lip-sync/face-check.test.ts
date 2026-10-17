import { describe, expect, test } from "bun:test";
import {
  faceNotes,
  framingOf,
  lipReading,
  referenceFraming,
  silentMouthOf,
} from "../../src/lib/lip-sync/lip-check";

/** A lip check's report, as the media service sends it. */
function report(eyeSpanPx: number, extra: Record<string, unknown> = {}) {
  return lipReading({
    status: "scored",
    offset_frames: 0,
    confidence: 7.2,
    confidence_at_zero: 7.2,
    framing: {
      eye_span_px: eyeSpanPx,
      eye_span_frac: eyeSpanPx / 720,
      eye_span_spread: 0.04,
      face_x: 0.5,
      face_y: 0.38,
      frame_width: 720,
      frame_height: 1280,
    },
    ...extra,
  }).result;
}

describe("the face beyond lip sync", () => {
  test("framing and silences are kept with the clip's lip score", () => {
    const result = report(144, { silence: { silent_seconds: 1.2, mouth_open_fraction: 0.1 } });
    expect(framingOf(result)).toMatchObject({ eyeSpanPx: 144, faceY: 0.38 });
    expect(silentMouthOf(result)).toEqual({ silentSeconds: 1.2, openFraction: 0.1 });
  });

  test("a clip framed like the first passes; one framed closer is flagged", () => {
    const clips = [
      { position: 0, lip_result: report(144) },
      { position: 1, lip_result: report(150) },
      { position: 2, lip_result: report(176) },
    ];
    const reference = referenceFraming(clips);
    expect(reference?.position).toBe(0);
    expect(faceNotes(clips[1]!, reference)).toEqual([]);
    const notes = faceNotes(clips[2]!, reference);
    expect(notes.map((note) => note.label)).toEqual(["Framed closer"]);
    expect(notes[0]!.detail).toContain("22% bigger than in clip 1");
  });

  test("a clip whose face grows within it reads as a camera move", () => {
    const result = report(144);
    (result["framing"] as Record<string, unknown>)["eye_span_spread"] = 0.35;
    expect(faceNotes({ position: 0, lip_result: result }, null).map((note) => note.label)).toEqual([
      "Camera moves",
    ]);
  });

  test("a mouth open through the pauses is flagged, a brief one isn't", () => {
    const moving = report(144, { silence: { silent_seconds: 1.4, mouth_open_fraction: 0.6 } });
    const brief = report(144, { silence: { silent_seconds: 0.4, mouth_open_fraction: 0.9 } });
    expect(faceNotes({ position: 0, lip_result: moving }, null).map((note) => note.label)).toEqual([
      "Mouth moves in pauses",
    ]);
    expect(faceNotes({ position: 0, lip_result: brief }, null)).toEqual([]);
  });

  test("a clip checked before framing was reported has nothing to say", () => {
    const old = lipReading({ status: "scored", offset_frames: -1, confidence: 6.8 }).result;
    expect(framingOf(old)).toBeNull();
    expect(faceNotes({ position: 1, lip_result: old }, null)).toEqual([]);
  });
});
