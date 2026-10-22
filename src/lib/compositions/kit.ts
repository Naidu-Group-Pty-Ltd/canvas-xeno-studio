/**
 * The graphics kit compositions are drawn from, after Reel 1's (kit.cjs,
 * motion.cjs): the brand's roles as CSS custom properties, its ground, the
 * glass window, the pointer and its press, the focus corners, cards, chips
 * and badges. Every template builds on these, so a template set in one
 * brand's colours, type and motion is set in another's by changing the kit.
 */
import type { CompositionBrand } from "./brand";
import { isDarkColour } from "./brand";
import { CompositionState, fade, fontStack, lerp, px, r3, rgba, span, type Motion } from "./state";

/** The page's base: the brand's roles, its type, and the renderer's own rules (nothing moves unless a frame moves it). */
export function kitCss(brand: CompositionBrand, width: number, height: number, u: number): string {
  const c = brand.colours;
  const dark = isDarkColour(c.ground);
  return `
:root {
  --c-ground:${c.ground}; --c-surface:${c.surface}; --c-raised:${c.raised}; --c-ink:${c.ink};
  --c-muted:${c.muted}; --c-line:${c.line}; --c-accent:${c.accent}; --c-highlight:${c.highlight};
  --f-display:${fontStack(brand.fonts.display)}; --f-body:${fontStack(brand.fonts.body)};
  --u:${r3(u)}px;
}
*, *::before, *::after { box-sizing:border-box; transition:none !important; animation:none !important; caret-color:transparent; }
html, body { margin:0; padding:0; background:${c.ground}; }
.cx-frame { position:absolute; left:0; top:0; width:${width}px; height:${height}px; overflow:hidden;
  background:var(--c-ground); color:var(--c-ink); font-family:var(--f-body); -webkit-font-smoothing:antialiased; }
.cx-layer { position:absolute; inset:0; }
.cx-ground { position:absolute; inset:0;
  background:
    radial-gradient(ellipse 70% 45% at 50% 32%, ${rgba(c.accent, dark ? 0.2 : 0.1)}, transparent 70%),
    radial-gradient(ellipse 60% 40% at 82% 92%, ${rgba(c.highlight, dark ? 0.13 : 0.08)}, transparent 70%),
    linear-gradient(180deg, ${c.ground}, ${c.ground});
}
.cx-display { font-family:var(--f-display); }
.cx-eyebrow { font-family:var(--f-body); font-size:calc(var(--u) * 26); font-weight:600; letter-spacing:.18em;
  text-transform:uppercase; color:var(--c-highlight); }
.cx-headline { font-family:var(--f-display); font-size:calc(var(--u) * 76); line-height:1.08; font-weight:600; color:var(--c-ink); }
.cx-muted { color:var(--c-muted); }
.cx-glass { position:absolute; border-radius:calc(var(--u) * 26); overflow:hidden;
  background:${dark ? rgba(c.surface, 0.92) : rgba("#ffffff", 0.94)};
  border:calc(var(--u) * 1.5) solid ${rgba(c.ink, dark ? 0.14 : 0.1)};
  box-shadow:0 calc(var(--u) * 34) calc(var(--u) * 90) ${rgba("#000000", dark ? 0.5 : 0.18)},
    inset 0 1px 0 ${rgba("#ffffff", dark ? 0.08 : 0.6)}; }
.cx-bar { position:absolute; left:0; right:0; top:0; height:calc(var(--u) * 58); display:flex; align-items:center;
  gap:calc(var(--u) * 12); padding:0 calc(var(--u) * 22); border-bottom:1px solid ${rgba(c.ink, 0.1)};
  background:${dark ? rgba(c.raised, 0.9) : rgba("#f3f4f6", 0.95)}; }
.cx-bar i { width:calc(var(--u) * 14); height:calc(var(--u) * 14); border-radius:50%; background:${rgba(c.ink, 0.22)}; display:block; }
.cx-bar span { margin-left:calc(var(--u) * 14); flex:1; height:calc(var(--u) * 34); border-radius:calc(var(--u) * 10);
  background:${rgba(c.ink, dark ? 0.08 : 0.06)}; color:var(--c-muted); font-size:calc(var(--u) * 19);
  display:flex; align-items:center; padding:0 calc(var(--u) * 16); white-space:nowrap; overflow:hidden; }
.cx-card { position:absolute; border-radius:calc(var(--u) * 22); background:var(--c-surface);
  border:calc(var(--u) * 1.5) solid var(--c-line);
  box-shadow:0 calc(var(--u) * 24) calc(var(--u) * 60) ${rgba("#000000", dark ? 0.42 : 0.14)}; }
.cx-chip { display:inline-flex; align-items:center; gap:calc(var(--u) * 10); padding:calc(var(--u) * 8) calc(var(--u) * 18);
  border-radius:999px; font-size:calc(var(--u) * 22); font-weight:600; white-space:nowrap;
  background:${rgba(c.accent, 0.16)}; color:var(--c-accent); border:1px solid ${rgba(c.accent, 0.35)}; }
.cx-chip.hi { background:${rgba(c.highlight, 0.18)}; color:var(--c-highlight); border-color:${rgba(c.highlight, 0.4)}; }
.cx-pointer { position:absolute; left:0; top:0; width:calc(var(--u) * 46); height:calc(var(--u) * 46); z-index:40;
  filter:drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 6) rgba(0,0,0,.45)); overflow:visible; }
.cx-press { position:absolute; left:0; top:0; border-radius:50%; z-index:39;
  border:calc(var(--u) * 3) solid var(--c-accent); box-shadow:0 0 calc(var(--u) * 18) ${rgba(c.accent, 0.55)}; }
.cx-corners { position:absolute; z-index:38; }
.cx-corners::before, .cx-corners::after { content:""; position:absolute; width:calc(var(--u) * 46); height:calc(var(--u) * 46); }
.cx-corners::before { left:0; top:0; border-top:calc(var(--u) * 3) solid var(--c-accent); border-left:calc(var(--u) * 3) solid var(--c-accent); }
.cx-corners::after { right:0; bottom:0; border-right:calc(var(--u) * 3) solid var(--c-highlight); border-bottom:calc(var(--u) * 3) solid var(--c-highlight); }
.cx-demo { position:absolute; z-index:30; padding:calc(var(--u) * 6) calc(var(--u) * 14); border-radius:999px;
  font-size:calc(var(--u) * 18); font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  background:${rgba(c.highlight, 0.16)}; color:var(--c-highlight); border:1px solid ${rgba(c.highlight, 0.4)}; }
.cx-placeholder { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
  padding:calc(var(--u) * 40); color:var(--c-muted); font-size:calc(var(--u) * 30); background:${rgba(c.ink, 0.04)}; }
`;
}

/** The ground: the brand's colour with its accent's light on it. */
export const groundHtml = () => `<div class="cx-ground" id="cx-ground"></div>`;

/** The label every recreated product screen carries, so nobody takes it for real data. */
export function demoLabelHtml(label: string, place: { left: number; top: number }): string {
  return `<div class="cx-demo" id="cx-demo" style="left:${px(place.left)};top:${px(place.top)}">${label}</div>`;
}

/* ------------------------------------------------------------------ */
/* The pointer and its press                                           */
/* ------------------------------------------------------------------ */

const ARROW =
  '<path d="M3 2l17 9.5-7.5 1.6L9 21z" fill="#ffffff" stroke="#0b1020" stroke-width="1.4" stroke-linejoin="round"/>';
/** Where the arrow's tip is in its own 46-unit box. */
const TIP = [3 * (46 / 24), 2 * (46 / 24)] as const;

export const pointerHtml = () =>
  `<div class="cx-press" id="cx-ring" style="visibility:hidden"></div><svg class="cx-pointer" id="cx-ptr" style="visibility:hidden" viewBox="0 0 24 24">${ARROW}</svg>`;

/**
 * The pointer: its tip on a gentle curve from `from` to `to` over [a, b] on
 * the brand's move curve (bowed to the right of travel), shown from `show`,
 * gone after `hide`; a press at `press` dips it and draws the press ring,
 * which grows to 24 units and fades over the brand's press time.
 */
export function pointerState(
  st: CompositionState,
  t: number,
  motion: Motion,
  u: number,
  options: {
    from: [number, number];
    to: [number, number];
    a: number;
    b: number;
    show: number;
    hide?: number;
    press?: number | null;
    bow?: number;
  },
): [number, number] {
  const { from, to, a, b, show } = options;
  const hide = options.hide ?? Infinity;
  const bow = options.bow ?? 0.12;
  const p = span(t, a, b, motion.move);
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const control: [number, number] = [mid[0] - dy * bow, mid[1] + dx * bow];
  const along = (q: number, i: 0 | 1) =>
    (1 - q) ** 2 * from[i] + 2 * (1 - q) * q * control[i] + q * q * to[i];
  const x = along(p, 0);
  const y = along(p, 1);
  const gone = Number.isFinite(hide) ? span(t, hide, hide + 0.2, motion.linear) : 0;
  const opacity = Math.min(span(t, show, show + 0.14, motion.linear), 1 - gone);
  const since = options.press === null || options.press === undefined ? -1 : t - options.press;
  const dip = since >= 0 && since < 0.2 ? 1 - 0.1 * Math.sin((Math.PI * since) / 0.2) : 1;
  const tipX = TIP[0] * u;
  const tipY = TIP[1] * u;
  st.set("#cx-ptr", {
    transform: `translate(${px(x - tipX)}, ${px(y - tipY)}) scale(${r3(dip)})`,
    "transform-origin": `${px(tipX)} ${px(tipY)}`,
    ...fade(opacity),
  });
  if (since >= 0 && since < motion.pressSeconds) {
    const q = since / motion.pressSeconds;
    const d = 24 * u * 2 * motion.settle(q);
    st.set("#cx-ring", {
      transform: `translate(${px(x - d / 2)}, ${px(y - d / 2)})`,
      width: px(d),
      height: px(d),
      ...fade((1 - q) * opacity),
    });
  } else st.set("#cx-ring", { transform: "none", width: "0px", height: "0px", ...fade(0) });
  return [x, y];
}

/* ------------------------------------------------------------------ */
/* Focus corners                                                       */
/* ------------------------------------------------------------------ */

export const cornersHtml = () =>
  `<div class="cx-corners" id="cx-corners" style="visibility:hidden"></div>`;

/** The focus corners closing in on a frame rect from `from` units further out, over [a, b]. */
export function cornersState(
  st: CompositionState,
  t: number,
  motion: Motion,
  u: number,
  rect: [number, number, number, number],
  a: number,
  b: number,
  {
    inset = 10,
    from = 34,
    until = Infinity,
  }: { inset?: number; from?: number; until?: number } = {},
): void {
  const p = span(t, a, b, motion.settle);
  const i = lerp(from, inset, p) * u;
  const [x, y, w, h] = rect;
  const gone = Number.isFinite(until) ? span(t, until, until + 0.25, motion.linear) : 0;
  st.set("#cx-corners", {
    left: px(x - i),
    top: px(y - i),
    width: px(w + 2 * i),
    height: px(h + 2 * i),
    ...fade(Math.min(span(t, a, a + 0.16, motion.linear), 1 - gone)),
  });
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Beats laid out over a composition's length: each at its share of the time,
 * after a lead-in, keeping the last result on screen at least `hold` seconds
 * (the brief's rule: a result is held at least 0.8 s before anything else moves).
 */
export function beatsAcross(duration: number, shares: number[], lead = 0.35, hold = 0.9): number[] {
  const room = Math.max(0.2, duration - lead - hold);
  return shares.map((share) => Number((lead + room * share).toFixed(3)));
}

/** A word-by-word rise into focus: each element's opacity, blur and lift at time t. */
export function riseState(
  st: CompositionState,
  t: number,
  motion: Motion,
  u: number,
  selector: string,
  index: number | null,
  at: number,
  { seconds = 0.42, lift = 22, blur = 8 }: { seconds?: number; lift?: number; blur?: number } = {},
): void {
  const p = span(t, at, at + seconds, motion.settle);
  st.set(
    selector,
    {
      transform: `translateY(${px((1 - p) * lift * u)})`,
      filter: p >= 1 ? "none" : `blur(${px((1 - p) * blur * u)})`,
      ...fade(p),
    },
    index,
  );
}
