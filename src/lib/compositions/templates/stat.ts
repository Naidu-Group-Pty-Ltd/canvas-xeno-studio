/**
 * The big number: a figure that counts up to its value on the brand's settle
 * curve (or, for one that isn't a number, such as a grade, rises into focus),
 * a ring that draws round to its share, and its label. For the one figure a
 * shot is about. Anything modelled says so (the note), as Reel 1's guardrails
 * require.
 */
import { z } from "zod";
import { groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  value: z.string().max(40).default("{{record.score}}"),
  prefix: z.string().max(4).default(""),
  suffix: z.string().max(8).default(""),
  label: z.string().max(80).default("{{record.verdict}}"),
  eyebrow: z.string().max(60).default(""),
  /** How much of the ring to draw (0 for no ring). */
  ring: z.number().min(0).max(100).default(84),
  note: z.string().max(60).default(""),
});

/** A value's number and how many decimals it is written with, or null for one that isn't a number. */
export function countable(
  value: string,
): { number: number; decimals: number; grouped: boolean } | null {
  const clean = value.trim();
  if (!/^-?[\d,]*\.?\d+$/.test(clean)) return null;
  const number = Number(clean.replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  return { number, decimals: clean.split(".")[1]?.length ?? 0, grouped: clean.includes(",") };
}

export const statTemplate = defineTemplate({
  id: "big-number",
  version: 1,
  title: "Big number",
  description:
    "One figure counts up to its value (or rises in, for a grade), a ring draws round to its share, and its label follows.",
  group: "brand",
  schema,
  fields: [
    { key: "value", label: "Value", kind: "text", max: 40 },
    { key: "prefix", label: "Before it ($)", kind: "text", max: 4 },
    { key: "suffix", label: "After it (%)", kind: "text", max: 8 },
    { key: "label", label: "Label", kind: "text", max: 80 },
    { key: "eyebrow", label: "Eyebrow", kind: "text", max: 60 },
    { key: "ring", label: "Ring (0 for none)", kind: "number", min: 0, max: 100, step: 1 },
    { key: "note", label: "Note (e.g. Illustrative example)", kind: "text", max: 60 },
  ],
  duration: { default: 3.5, min: 2, max: 15 },
  build({ params, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const value = fill(params.value).slice(0, 14);
    const counting = countable(value);
    const size = Math.min(width * (portrait ? 0.7 : 0.4), 640 * u);
    const cx = width / 2;
    const cy = portrait ? height * 0.43 : height * 0.47;
    const circumference = 2 * Math.PI * 92;
    const label = escapeHtml(fill(params.label));
    const eyebrow = escapeHtml(fill(params.eyebrow));
    const note = escapeHtml(fill(params.note));
    const count: [number, number] = [0.25, Math.max(0.9, Math.min(1.6, duration * 0.42))];
    const labelAt = count[1] - 0.15;

    const format = (n: number) => {
      if (!counting) return value;
      const fixed = n.toFixed(counting.decimals);
      if (!counting.grouped) return fixed;
      const [whole, part] = fixed.split(".");
      return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${part ? `.${part}` : ""}`;
    };

    const css = `
.st-ring { position:absolute; left:${px(cx - size / 2)}; top:${px(cy - size / 2)}; width:${px(size)}; height:${px(size)}; }
.st-ring svg { width:100%; height:100%; transform:rotate(-90deg); }
.st-value { position:absolute; left:0; right:0; top:${px(cy - 120 * u)}; height:${px(240 * u)}; display:flex; align-items:center; justify-content:center;
  font-family:var(--f-display); font-size:${px((value.length > 5 ? 150 : 200) * u)}; line-height:1; color:var(--c-ink); font-variant-numeric:tabular-nums; }
.st-value small { font-size:.45em; color:var(--c-highlight); margin:0 ${px(8 * u)}; }
.st-label { position:absolute; left:${px(width * 0.08)}; right:${px(width * 0.08)}; top:${px(cy + size / 2 + 56 * u)}; text-align:center;
  font-family:var(--f-display); font-size:${px(52 * u)}; color:var(--c-ink); }
.st-eyebrow { position:absolute; left:0; right:0; top:${px(cy - size / 2 - 90 * u)}; text-align:center; }
.st-note { position:absolute; left:0; right:0; top:${px(cy + size / 2 + 150 * u)}; text-align:center; font-size:${px(24 * u)}; color:var(--c-muted); }
`;
    const prefix = escapeHtml(params.prefix);
    const suffix = escapeHtml(params.suffix);
    const html = [
      groundHtml(),
      eyebrow
        ? `<div class="st-eyebrow"><span class="cx-eyebrow" id="st-eyebrow">${eyebrow}</span></div>`
        : "",
      params.ring > 0
        ? `<div class="st-ring" id="st-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="none" stroke="var(--c-line)" stroke-width="6"/>` +
          `<circle id="st-arc" cx="100" cy="100" r="92" fill="none" stroke="var(--c-highlight)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${r3(circumference)}" stroke-dashoffset="${r3(circumference)}"/></svg></div>`
        : "",
      `<div class="st-value" id="st-value">${prefix ? `<small>${prefix}</small>` : ""}<span id="st-number">${escapeHtml(counting ? format(0) : value)}</span>${suffix ? `<small>${suffix}</small>` : ""}</div>`,
      label ? `<div class="st-label" id="st-label">${label}</div>` : "",
      note ? `<div class="st-note" id="st-note">${note}</div>` : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      const p = span(t, count[0], count[1], motion.settle);
      if (counting) {
        st.set("#st-number", { $text: format(counting.number * p) });
        st.set("#st-value", fade(span(t, count[0] - 0.15, count[0] + 0.1, motion.linear)));
      } else
        riseState(st, t, motion, u, "#st-value", null, count[0], {
          lift: 30,
          blur: 12,
          seconds: 0.6,
        });
      if (params.ring > 0) {
        st.set("#st-arc", {
          "stroke-dashoffset": String(r3(circumference * (1 - (p * params.ring) / 100))),
        });
        st.set("#st-ring", fade(span(t, 0, 0.3, motion.linear)));
      }
      if (eyebrow) riseState(st, t, motion, u, "#st-eyebrow", null, 0.05);
      if (label) riseState(st, t, motion, u, "#st-label", null, labelAt);
      if (note) st.set("#st-note", fade(span(t, labelAt + 0.3, labelAt + 0.6, motion.linear)));
      return st;
    };

    return { html, css, state, beats: [{ at: count[1], label: "The figure lands" }] };
  },
});
