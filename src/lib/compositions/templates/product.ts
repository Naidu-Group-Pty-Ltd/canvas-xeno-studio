/**
 * The shell the product-page templates share: a product's window in the
 * brand's glass with its sidebar (the brand's mark and its sections), its top
 * bar (the page's title, search and who is signed in) and the Demo workspace
 * label, so every recreated screen says it isn't real data. Each product
 * template draws its page inside it, from the brand's demo record.
 */
import type { CompositionBrand } from "../brand";
import { demoValue } from "../demo";
import { CompositionState, escapeHtml, fade, px, r3, span, type Motion } from "../state";

export interface ProductShell {
  html: (content: string) => string;
  css: string;
  /** The content area, on the frame. */
  content: { x: number; y: number; w: number; h: number };
  /** The window, on the frame. */
  window: { x: number; y: number; w: number; h: number };
  /** The shell's own state (it rises in over [0, rise]). */
  state: (st: CompositionState, t: number) => void;
  rise: number;
}

/** Up to two capitals from a name, for an avatar. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "•"
  );
}

const NAV = 5;

export function productShell(input: {
  brand: CompositionBrand;
  motion: Motion;
  width: number;
  height: number;
  u: number;
  duration: number;
  section: string;
  /** Which sidebar item is the page shown (0 is the first). */
  active: number;
}): ProductShell {
  const { brand, motion, width, height, u, duration } = input;
  const portrait = height >= width;
  const w = width * (portrait ? 0.92 : 0.8);
  const h = portrait ? Math.min(height * 0.47, 920 * u) : height * 0.8;
  const x = (width - w) / 2;
  const y = portrait ? height * 0.2 : (height - h) / 2;
  const bar = 58 * u;
  const side = 104 * u;
  const top = 92 * u;
  const content = {
    x: x + side + 28 * u,
    y: y + bar + top + 20 * u,
    w: w - side - 56 * u,
    h: h - bar - top - 44 * u,
  };
  const person = demoValue(brand.demo, "person.name") ?? "";
  const rise = Math.min(0.6, duration * 0.14);
  const css = `
.pd-win { left:${px(x)}; top:${px(y)}; width:${px(w)}; height:${px(h)}; }
.pd-side { position:absolute; left:0; top:${px(bar)}; bottom:0; width:${px(side)}; border-right:1px solid var(--c-line);
  display:flex; flex-direction:column; align-items:center; gap:${px(26 * u)}; padding-top:${px(26 * u)}; }
.pd-mark { width:${px(56 * u)}; height:${px(56 * u)}; border-radius:${px(16 * u)}; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, var(--c-accent), var(--c-highlight)); color:#fff; font-family:var(--f-display); font-weight:700; font-size:${px(28 * u)}; }
.pd-nav { width:${px(44 * u)}; height:${px(44 * u)}; border-radius:${px(12 * u)}; background:var(--c-raised); position:relative; }
.pd-nav.on { background:var(--c-accent); box-shadow:0 0 ${px(18 * u)} var(--c-accent); }
.pd-top { position:absolute; left:${px(side)}; right:0; top:${px(bar)}; height:${px(top)}; display:flex; align-items:center; gap:${px(20 * u)};
  padding:0 ${px(28 * u)}; border-bottom:1px solid var(--c-line); }
.pd-title { font-family:var(--f-display); font-size:${px(36 * u)}; color:var(--c-ink); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pd-search { width:${px(200 * u)}; height:${px(46 * u)}; border-radius:${px(23 * u)}; background:var(--c-raised); }
.pd-avatar { width:${px(50 * u)}; height:${px(50 * u)}; border-radius:50%; background:var(--c-raised); border:1px solid var(--c-line);
  display:flex; align-items:center; justify-content:center; font-size:${px(20 * u)}; font-weight:700; color:var(--c-ink); }
.pd-content { position:absolute; left:${px(side + 28 * u)}; top:${px(bar + top + 20 * u)}; width:${px(content.w)}; height:${px(content.h)}; }
`;
  const html = (inner: string) =>
    [
      `<div class="cx-glass pd-win" id="pd-win"><div class="cx-bar"><i></i><i></i><i></i><span>${escapeHtml(brand.website ?? brand.name)}</span></div>`,
      `<div class="pd-side"><div class="pd-mark">${escapeHtml(initialsOf(brand.name).slice(0, 1))}</div>`,
      Array.from(
        { length: NAV },
        (_, k) => `<div class="pd-nav${k === input.active ? " on" : ""}"></div>`,
      ).join(""),
      `</div>`,
      `<div class="pd-top"><div class="pd-title">${escapeHtml(input.section)}</div><div class="pd-search"></div><div class="pd-avatar">${escapeHtml(initialsOf(person))}</div></div>`,
      `<div class="pd-content">${inner}</div></div>`,
      `<div class="cx-demo" id="cx-demo" style="left:${px(x + 20 * u)};top:${px(y + h + 22 * u)}">${escapeHtml(brand.demo.label)}</div>`,
    ].join("");
  return {
    html,
    css,
    content,
    window: { x, y, w, h },
    rise,
    state: (st, t) => {
      const up = span(t, 0, rise, motion.settle);
      st.set("#pd-win", {
        transform: `translateY(${px((1 - up) * 80 * u)}) scale(${r3(0.97 + 0.03 * up)})`,
        ...fade(up),
      });
      st.set("#cx-demo", fade(span(t, rise, rise + 0.3, motion.linear)));
    },
  };
}

/** A status as a chip's tone: done things in the highlight, the rest in the accent. */
export function statusTone(status: string): "hi" | "" {
  return /approv|done|complete|settled|booked|paid|ready|won|signed/i.test(status) ? "hi" : "";
}
