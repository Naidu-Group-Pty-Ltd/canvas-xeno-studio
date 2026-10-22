/**
 * Motion as a brand's code writes it: easing curves (`cubic-bezier(0.2, 0, 0,
 * 1)`, or a keyword such as `ease-out`) and durations (`320ms`, `.2s`), read
 * into numbers the studio can draw with, and a curve solved at a moment the
 * way a browser solves it. The Editor's preview, the media worker's titles
 * (media-worker/src/sequence.js keeps the same solver) and a composition all
 * move alike.
 *
 * Pure: shared by the server, the browser and tests.
 */

/** A CSS cubic-bezier's four numbers: x1, y1, x2, y2 (each x from 0 to 1). */
export type CubicBezier = readonly [number, number, number, number];

export const LINEAR: CubicBezier = [0, 0, 1, 1];

/** CSS's named curves, as the specification defines them. */
export const EASE_KEYWORDS: Readonly<Record<string, CubicBezier>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** How far a curve may overshoot (a spring's y goes past 0 and 1); further is taken for a mistake. */
export const EASE_Y_RANGE = [-2, 3] as const;
/** The longest duration taken as a brand's motion (anything longer is a loop or a delay). */
export const MAX_DURATION_MS = 10_000;

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/** A curve with each number in range, or null. */
export function cubicBezierOf(value: unknown): CubicBezier | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  const [x1, y1, x2, y2] = numbers as [number, number, number, number];
  const [low, high] = EASE_Y_RANGE;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  if (y1 < low || y1 > high || y2 < low || y2 > high) return null;
  const round = (part: number) => Math.round(part * 10_000) / 10_000;
  return [round(x1), round(y1), round(x2), round(y2)];
}

/**
 * The curve a CSS value names: `cubic-bezier(0.2, 0, 0, 1)` or a keyword
 * (`ease-out`). Null for anything else (steps(), a curve out of range, a
 * value still reading another token).
 */
export function parseCubicBezier(value: string): CubicBezier | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const text = value.trim().toLowerCase();
  const keyword = EASE_KEYWORDS[text];
  if (keyword) return keyword;
  const call = /^cubic-bezier\(([^()]*)\)$/.exec(text);
  if (!call) return null;
  const parts = (call[1] ?? "").split(",").map((part) => part.trim());
  if (parts.length !== 4 || !parts.every((part) => NUMBER.test(part))) return null;
  return cubicBezierOf(parts.map(Number));
}

/** A curve as CSS writes it: `cubic-bezier(0.2, 0, 0, 1)`. */
export function formatCubicBezier(curve: CubicBezier): string {
  const number = (value: number) => String(Math.round(value * 10_000) / 10_000);
  return `cubic-bezier(${curve.map(number).join(", ")})`;
}

/** A duration in milliseconds from `320ms`, `0.32s` or `.2s`; null for anything else. */
export function parseDuration(value: string): number | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const match = /^((?:\d+\.?\d*|\.\d+))(ms|s)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]) * (match[2]!.toLowerCase() === "s" ? 1000 : 1);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_DURATION_MS) return null;
  return Math.round(amount * 100) / 100;
}

/** A duration as CSS writes it: `320ms`. */
export function formatDuration(ms: number): string {
  return `${Math.round(ms * 100) / 100}ms`;
}

/**
 * What a motion token holds: its duration and its curve, whether it is one
 * (`--motion-slow: 320ms`, `--ease-out: cubic-bezier(…)`) or a transition
 * shorthand that has both (`transform 320ms cubic-bezier(0.22, 1, 0.36, 1)`).
 * A delay (a second duration) and an animation's name are left out.
 */
export function motionParts(value: string): {
  durationMs: number | null;
  ease: CubicBezier | null;
} {
  if (typeof value !== "string" || value.length > 400 || value.includes("var(")) {
    return { durationMs: null, ease: null };
  }
  const text = value.trim();
  const ease = parseCubicBezier(text);
  if (ease) return { durationMs: null, ease };
  const duration = parseDuration(text);
  if (duration !== null) return { durationMs: duration, ease: null };
  // A shorthand: only its first transition, its first duration and its curve.
  const first = text.split(/,(?![^(]*\))/)[0] ?? "";
  const curve = /cubic-bezier\([^()]*\)/i.exec(first)?.[0];
  const words = first.replace(/cubic-bezier\([^()]*\)/gi, " ").split(/\s+/);
  const named = words.find((word) => EASE_KEYWORDS[word.toLowerCase()]);
  const timed = words.map(parseDuration).find((ms) => ms !== null) ?? null;
  return {
    durationMs: timed,
    ease: curve ? parseCubicBezier(curve) : named ? EASE_KEYWORDS[named.toLowerCase()]! : null,
  };
}

/**
 * How far along a curve is at `x` (0 to 1 of its time), solved as a browser
 * solves CSS's cubic-bezier: Newton's method on x, then halving to be sure.
 * Outside 0 to 1 it holds its ends.
 */
export function cubicBezierAt(curve: CubicBezier, x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  let s = x;
  for (let step = 0; step < 8; step += 1) {
    const error = sampleX(s) - x;
    if (Math.abs(error) < 1e-7) return sampleY(s);
    const slope = slopeX(s);
    if (Math.abs(slope) < 1e-6) break;
    s -= error / slope;
  }
  let low = 0;
  let high = 1;
  s = x;
  for (let step = 0; step < 50; step += 1) {
    const at = sampleX(s);
    if (Math.abs(at - x) < 1e-7) break;
    if (at < x) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return sampleY(s);
}

/** A curve drawn as an SVG path in a box `size` wide and high (y up, overshoot drawn outside). */
export function cubicBezierPath(curve: CubicBezier, size: number): string {
  const [x1, y1, x2, y2] = curve;
  const point = (x: number, y: number) =>
    `${Math.round(x * size * 100) / 100} ${Math.round((1 - y) * size * 100) / 100}`;
  return `M ${point(0, 0)} C ${point(x1, y1)}, ${point(x2, y2)}, ${point(1, 1)}`;
}
