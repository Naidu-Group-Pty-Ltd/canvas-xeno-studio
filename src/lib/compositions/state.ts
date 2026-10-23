/**
 * A composition's state at a moment: what every element it animates looks
 * like at time t. A composition is a page (its markup and stylesheet) and a
 * pure function of time that says, for each element (a selector, and an index
 * where it matches several), its style properties and text. The same
 * composition always draws the same frames, so any frame can be drawn alone,
 * in any order, on any machine: the render draws them side by side and in
 * stretches, and the Editor's preview draws whichever frame the playhead is on.
 *
 * After Reel 1's motion toolkit (scripts/aurixa-reel-1/motion.cjs), which the
 * system edition's 26 scenes were written in. Shared by the browser (the
 * preview), the server (which turns a composition into the render's track)
 * and tests.
 */

/** One element's properties at a moment: CSS properties by name, and `$text` for its text. */
export type ElementProps = Record<string, string>;

/** One change for the page: [selector, index or null for the first match, the properties that changed]. */
export type StateUpdate = [selector: string, index: number | null, props: ElementProps];

const r3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * What a frame sets. Every frame of a composition sets every property it
 * animates, so a frame never depends on the one before; what is sent to a
 * page is only what changed since the last frame it drew (see `diff`).
 */
export class CompositionState {
  readonly items = new Map<
    string,
    { selector: string; index: number | null; props: ElementProps }
  >();

  set(selector: string, props: Record<string, string | number>, index: number | null = null): this {
    const key = index === null ? selector : `${selector}\u0000${index}`;
    const item = this.items.get(key) ?? { selector, index, props: {} };
    for (const [name, value] of Object.entries(props))
      item.props[name] = typeof value === "number" ? String(r3(value)) : value;
    this.items.set(key, item);
    return this;
  }

  /** The updates since `last` (key → properties as last applied), which it brings up to date. */
  diff(last: Map<string, ElementProps>): StateUpdate[] {
    const out: StateUpdate[] = [];
    for (const [key, { selector, index, props }] of this.items) {
      const before = last.get(key) ?? {};
      const changed: ElementProps = {};
      let any = false;
      for (const [name, value] of Object.entries(props))
        if (before[name] !== value) {
          changed[name] = value;
          any = true;
        }
      if (any) {
        out.push([selector, index, changed]);
        last.set(key, { ...before, ...changed });
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Time and motion                                                     */
/* ------------------------------------------------------------------ */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** Zoom moves evenly to the eye when it moves by ratio, not by difference. */
export const zoomLerp = (a: number, b: number, p: number) => a * (b / a) ** p;
export const px = (value: number) => `${r3(value)}px`;
export { r3 };

/** A curve from time (0 to 1) to progress (0 to 1). */
export type Ease = (t: number) => number;

/** A CSS cubic-bezier as a function of time, solved as browsers solve it. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const slope = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton's method first (fast where the curve is steep), then bisection.
    let s = t;
    for (let step = 0; step < 8; step += 1) {
      const error = x(s) - t;
      if (Math.abs(error) < 1e-7) return y(s);
      const d = slope(s);
      if (Math.abs(d) < 1e-6) break;
      s -= error / d;
    }
    let low = 0;
    let high = 1;
    s = t;
    for (let step = 0; step < 50; step += 1) {
      const value = x(s);
      if (Math.abs(value - t) < 1e-7) break;
      if (value < t) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return y(s);
  };
}

/** The four numbers of a `cubic-bezier(…)`, or null when the text isn't one. */
export function parseCubicBezier(value: string): [number, number, number, number] | null {
  const match = /cubic-bezier\(\s*([^)]+)\)/i.exec(value);
  if (!match) return null;
  const numbers = match[1]!.split(",").map((part) => Number(part.trim()));
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = numbers as [number, number, number, number];
  // A curve whose time runs backwards isn't a timing function.
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return [x1, y1, x2, y2];
}

/**
 * How things move when a brand doesn't say: Material's emphasized ease for
 * anything that travels, its ease-out for arrivals, and a 320 ms press (the
 * values Reel 1 read from Aurixa's products' code).
 */
export const DEFAULT_MOTION = {
  move: [0.2, 0, 0, 1] as [number, number, number, number],
  settle: [0, 0, 0.2, 1] as [number, number, number, number],
  pressSeconds: 0.32,
};

export interface Motion {
  /** Anything that travels. */
  move: Ease;
  /** Arrivals: things that come to rest. */
  settle: Ease;
  linear: Ease;
  /** How long a press's ring lives. */
  pressSeconds: number;
}

export function motionOf(
  curves: {
    move?: [number, number, number, number] | null;
    settle?: [number, number, number, number] | null;
    pressSeconds?: number | null;
  } = {},
): Motion {
  const move = curves.move ?? DEFAULT_MOTION.move;
  const settle = curves.settle ?? DEFAULT_MOTION.settle;
  const press = curves.pressSeconds ?? DEFAULT_MOTION.pressSeconds;
  return {
    move: bezier(...move),
    settle: bezier(...settle),
    linear: (t) => t,
    pressSeconds: press > 0.05 && press < 3 ? press : DEFAULT_MOTION.pressSeconds,
  };
}

/** How far through [a, b] the time t is, on a curve (0 before, 1 after). */
export function span(t: number, a: number, b: number, ease: Ease): number {
  if (!(b > a)) return t >= b ? 1 : 0;
  return ease(clamp01((t - a) / (b - a)));
}

/** Shown or not, faded: opacity, and visibility so a hidden element costs nothing to draw. */
export function fade(opacity: number): { opacity: number; visibility: string } {
  const value = Number.isFinite(opacity) ? clamp01(opacity) : 0;
  return { opacity: r3(value), visibility: value > 0.001 ? "visible" : "hidden" };
}

/* ------------------------------------------------------------------ */
/* Escaping                                                            */
/* ------------------------------------------------------------------ */

/** Text as it may appear in markup: what a person typed is never read as markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A colour that may go into a stylesheet: #rrggbb only, else the fallback. */
export function safeColour(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

/** A #rrggbb colour at an opacity, as rgba(). */
export function rgba(hex: string, alpha: number): string {
  const colour = safeColour(hex, "#000000");
  const channel = (offset: number) => parseInt(colour.slice(offset, offset + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${r3(clamp01(alpha))})`;
}

/** Two #rrggbb colours mixed (0: the first, 1: the second). */
export function mix(a: string, b: string, amount: number): string {
  const from = safeColour(a, "#000000");
  const to = safeColour(b, "#000000");
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  const part = (offset: number) =>
    Math.round(lerp(channel(from, offset), channel(to, offset), clamp01(amount)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
}

/** A font family as a stylesheet names it, quoted, with the studio's fallbacks. */
export function fontStack(family: string | null | undefined, fallback = "Inter"): string {
  const clean = (name: string) => name.replace(/["\\;{}<>]/g, "").trim();
  const first = family && clean(family) ? clean(family) : clean(fallback);
  return `"${first}", "Inter", system-ui, sans-serif`;
}
