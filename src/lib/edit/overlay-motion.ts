/**
 * Titles that move in a brand's own motion: the motion a kit gives them (its
 * enter and exit curves and durations, see ../brand/production), and where a
 * title is at any moment. The Editor's preview draws a title from
 * overlayMotionState; the media worker draws the same state frame by frame
 * (media-worker/src/sequence.js keeps the same maths), so what the preview
 * shows is what the render makes.
 *
 * Shared by the server, the browser and tests.
 */
import { cubicBezierAt, type CubicBezier } from "../brand/motion";
import { brandMotion, type BrandProduction } from "../brand/production";
import type { Overlay, OverlayMotion } from "./timeline";

/** A title without a brand's motion fades in and out over this long, as the render's \fad(250,250) does. */
export const STUDIO_FADE_SECONDS = 0.25;

/** How far a title rises as it comes in, as a share of its own size (Reel 1's words rose a third of one). */
export const OVERLAY_RISE = 0.3;

/** A title's duration when the brand's code gives a curve and no duration: the studio's own. */
const DEFAULT_MS = STUDIO_FADE_SECONDS * 1000;

export interface OverlayState {
  /** 0 (unseen) to 1. */
  opacity: number;
  /** How far it sits from its place, as a share of its own size: positive below, negative above. */
  offset: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 1000) / 1000;
const curve = (ease: CubicBezier | null): [number, number, number, number] | null =>
  ease ? [ease[0], ease[1], ease[2], ease[3]] : null;

/**
 * The motion a kit's titles take: its enter and exit roles' durations (one
 * standing in for the other when only one is declared, the studio's quarter
 * second when neither is) and curves (arrivals settle and departures move,
 * when the brand names no curve of their own). Null when the kit says nothing
 * about how things move.
 */
export function kitOverlayMotion(production: BrandProduction): OverlayMotion | null {
  const motion = brandMotion(production);
  const roles = [motion.enter, motion.exit, motion.settle, motion.move];
  if (!roles.some((role) => role.ease || role.durationMs !== null)) return null;
  const enterMs = motion.enter.durationMs ?? motion.exit.durationMs ?? DEFAULT_MS;
  const exitMs = motion.exit.durationMs ?? motion.enter.durationMs ?? DEFAULT_MS;
  return {
    enter: round(Math.min(2, enterMs / 1000)),
    exit: round(Math.min(2, exitMs / 1000)),
    enterEase: curve(motion.enter.ease ?? motion.settle.ease) ?? [0, 0, 1, 1],
    exitEase: curve(motion.exit.ease ?? motion.move.ease) ?? [0, 0, 1, 1],
    rise: OVERLAY_RISE,
  };
}

/** How long a title's motion takes to come in and to go: each at most half the title's time. */
export function motionSpans(
  overlay: Pick<Overlay, "start" | "end">,
  motion: OverlayMotion,
): { enter: number; exit: number } {
  const half = Math.max(0, overlay.end - overlay.start) / 2;
  return { enter: Math.min(motion.enter, half), exit: Math.min(motion.exit, half) };
}

/**
 * Where a title is at `time`. With a motion it comes in over its enter time
 * on its curve, rising into place from `rise` of its size below, and goes
 * over its exit time on its own curve, lifting half that. Without one it
 * fades in and out over a quarter of a second. Outside its times it is unseen.
 */
export function overlayMotionState(
  overlay: Pick<Overlay, "start" | "end"> & { motion?: OverlayMotion | null | undefined },
  time: number,
): OverlayState {
  const { start, end } = overlay;
  if (time < start || time >= end) return { opacity: 0, offset: 0 };
  const motion = overlay.motion;
  if (!motion) {
    const fade = Math.min((time - start) / STUDIO_FADE_SECONDS, (end - time) / STUDIO_FADE_SECONDS);
    return { opacity: clamp01(fade), offset: 0 };
  }
  const { enter, exit } = motionSpans(overlay, motion);
  if (enter > 0 && time < start + enter) {
    const eased = cubicBezierAt(motion.enterEase, (time - start) / enter);
    return { opacity: clamp01(eased), offset: (1 - eased) * motion.rise };
  }
  if (exit > 0 && time >= end - exit) {
    const eased = cubicBezierAt(motion.exitEase, (time - (end - exit)) / exit);
    return { opacity: clamp01(1 - eased), offset: eased ? -eased * motion.rise * 0.5 : 0 };
  }
  return { opacity: 1, offset: 0 };
}
