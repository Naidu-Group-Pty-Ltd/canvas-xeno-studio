/**
 * G-RAIL, the journey rail: the stages of a journey on a rail, the traveller
 * moving from one to the next on the brand's move curve, each stage passed
 * checked off and the one reached lit in the highlight with a hairline under
 * it. Where a reel says where the viewer is in the story.
 */
import { z } from "zod";
import { beatsAcross, groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, lerp, px, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  eyebrow: z.string().max(60).default(""),
  headline: z.string().max(90).default(""),
  stages: z
    .array(z.string().max(40))
    .min(2)
    .max(6)
    .default(["Research", "Report", "Approve", "Settle"]),
  /** The stage the journey ends on (1 is the first). */
  reach: z.number().int().min(1).max(6).default(4),
  result: z.string().max(90).default(""),
});

const CHECK =
  '<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';

export const railTemplate = defineTemplate({
  id: "journey-rail",
  version: 1,
  title: "Journey rail",
  description:
    "The stages of a journey on a rail: the traveller moves from one to the next, each passed checked off, the one reached lit.",
  group: "kit",
  schema,
  fields: [
    { key: "eyebrow", label: "Eyebrow", kind: "text", max: 60 },
    { key: "headline", label: "Headline", kind: "text", max: 90 },
    { key: "stages", label: "Stages (one a line)", kind: "lines", max: 6 },
    { key: "reach", label: "Ends on stage", kind: "number", min: 1, max: 6, step: 1 },
    { key: "result", label: "Result line", kind: "text", max: 90 },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const stages = params.stages.map((stage) => escapeHtml(fill(stage) || " "));
    const n = stages.length;
    const reach = Math.min(params.reach, n);
    const railW = width * (portrait ? 0.86 : 0.7);
    const railX = (width - railW) / 2;
    const railY = portrait ? height * 0.47 : height * 0.55;
    const inset = 120 * u;
    const nodeX = (k: number) => railX + inset + ((railW - 2 * inset) * k) / Math.max(1, n - 1);
    const eyebrow = escapeHtml(fill(params.eyebrow));
    const headline = escapeHtml(fill(params.headline));
    const result = escapeHtml(fill(params.result));

    const rise = Math.min(0.6, duration * 0.14);
    // The traveller reaches each stage on its own beat; the last result is held.
    const arrivals = beatsAcross(
      duration,
      Array.from({ length: reach }, (_, k) => (reach === 1 ? 0 : k / (reach - 1))),
      rise + 0.2,
      result ? 1.4 : 0.9,
    );
    const travel = (k: number) =>
      Math.max(0.35, Math.min(0.8, (arrivals[k]! - (arrivals[k - 1] ?? rise)) * 0.7));

    const css = `
.rl-text { position:absolute; left:${px(width * 0.08)}; right:${px(width * 0.08)}; top:${px(railY - (portrait ? 430 : 330) * u)}; text-align:center; }
.rl-text .cx-eyebrow { display:block; margin-bottom:${px(18 * u)}; }
.rl-bar { left:${px(railX)}; top:${px(railY - 110 * u)}; width:${px(railW)}; height:${px(220 * u)}; }
.rl-line { position:absolute; left:${px(inset)}; right:${px(inset)}; top:${px(70 * u)}; height:${px(4 * u)}; border-radius:${px(2 * u)}; background:var(--c-line); }
.rl-fill { position:absolute; left:${px(inset)}; top:${px(70 * u)}; height:${px(4 * u)}; border-radius:${px(2 * u)};
  background:linear-gradient(90deg, var(--c-accent), var(--c-highlight)); width:0; }
.rl-node { position:absolute; top:${px(70 * u - 25 * u)}; width:${px(54 * u)}; height:${px(54 * u)}; margin-left:${px(-27 * u)}; border-radius:50%;
  background:var(--c-surface); border:${px(3 * u)} solid var(--c-line); color:var(--c-ground); display:flex; align-items:center; justify-content:center; }
.rl-node svg { width:${px(26 * u)}; height:${px(26 * u)}; }
.rl-label { position:absolute; top:${px(120 * u)}; width:${px(220 * u)}; margin-left:${px(-110 * u)}; text-align:center;
  font-size:${px(26 * u)}; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--c-muted); }
.rl-label i { display:block; margin:${px(10 * u)} auto 0; height:${px(3 * u)}; width:0; background:var(--c-highlight); }
.rl-trav { position:absolute; top:${px(70 * u + 2 * u)}; width:${px(22 * u)}; height:${px(22 * u)}; border-radius:50%;
  background:var(--c-highlight); box-shadow:0 0 ${px(28 * u)} var(--c-highlight); transform:translate(-50%, -50%); }
.rl-result { position:absolute; left:${px(width * 0.1)}; right:${px(width * 0.1)}; top:${px(railY + 170 * u)}; text-align:center;
  font-family:var(--f-display); font-size:${px(44 * u)}; color:var(--c-ink); }
`;
    const nodes = stages
      .map(
        (stage, k) =>
          `<div class="rl-node" id="rl-node-${k}" style="left:${px(nodeX(k) - railX)}"><svg viewBox="0 0 24 24" id="rl-check-${k}">${CHECK}</svg></div>` +
          `<div class="rl-label" id="rl-label-${k}" style="left:${px(nodeX(k) - railX)}">${stage}<i id="rl-hair-${k}"></i></div>`,
      )
      .join("");
    const html = [
      groundHtml(),
      eyebrow || headline
        ? `<div class="rl-text">${eyebrow ? `<span class="cx-eyebrow" id="rl-eyebrow">${eyebrow}</span>` : ""}${
            headline ? `<div class="cx-headline" id="rl-headline">${headline}</div>` : ""
          }</div>`
        : "",
      `<div class="cx-glass rl-bar" id="rl-bar"><div class="rl-line"></div><div class="rl-fill" id="rl-fill"></div>${nodes}<div class="rl-trav" id="rl-trav"></div></div>`,
      result ? `<div class="rl-result" id="rl-result">${result}</div>` : "",
    ].join("");

    /** A node's pop as the traveller arrives: up and back over half a second. */
    const pop = (t: number, at: number) => {
      const q = (t - at) / 0.5;
      return q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0;
    };

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, 0, rise, motion.settle);
      st.set("#rl-bar", { transform: `translateY(${px((1 - up) * 60 * u)})`, ...fade(up) });
      if (eyebrow) riseState(st, t, motion, u, "#rl-eyebrow", null, 0.05);
      if (headline) riseState(st, t, motion, u, "#rl-headline", null, 0.15);
      // Where the traveller is: between the stage it left and the one it is going to.
      let x = nodeX(0);
      for (let k = 1; k < reach; k += 1) {
        const p = span(t, arrivals[k]! - travel(k), arrivals[k]!, motion.move);
        if (p > 0) x = lerp(nodeX(k - 1), nodeX(k), p);
      }
      st.set("#rl-trav", {
        left: px(x - railX),
        ...fade(span(t, arrivals[0]! - 0.25, arrivals[0]!, motion.linear)),
      });
      st.set("#rl-fill", { width: px(Math.max(0, x - nodeX(0))) });
      stages.forEach((_stage, k) => {
        const reached =
          k < reach ? span(t, arrivals[k]! - 0.05, arrivals[k]! + 0.25, motion.settle) : 0;
        // A stage the traveller has moved on from is checked off; the one it is at is lit.
        const left =
          k + 1 < reach
            ? span(
                t,
                arrivals[k + 1]! - travel(k + 1),
                arrivals[k + 1]! - travel(k + 1) + 0.2,
                motion.linear,
              )
            : 0;
        const current = reached * (1 - left);
        st.set(`#rl-node-${k}`, {
          background: reached > 0.5 ? "var(--c-highlight)" : "var(--c-surface)",
          "border-color": reached > 0.5 ? "var(--c-highlight)" : "var(--c-line)",
          transform: `scale(${(1 + 0.18 * (k < reach ? pop(t, arrivals[k]!) : 0)).toFixed(3)})`,
        });
        st.set(`#rl-check-${k}`, fade(left));
        st.set(`#rl-label-${k}`, {
          color:
            current > 0.5 ? "var(--c-highlight)" : left > 0.5 ? "var(--c-ink)" : "var(--c-muted)",
        });
        st.set(`#rl-hair-${k}`, { width: px(60 * u * current) });
      });
      if (result) riseState(st, t, motion, u, "#rl-result", null, arrivals[reach - 1]! + 0.3);
      return st;
    };

    return {
      html,
      css,
      state,
      beats: arrivals.map((at, k) => ({
        at,
        label: `Reaches ${params.stages[k] ?? `stage ${k + 1}`}`,
      })),
    };
  },
});
