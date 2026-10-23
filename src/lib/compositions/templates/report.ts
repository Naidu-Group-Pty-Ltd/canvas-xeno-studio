/**
 * A page of the product's report, from the brand's demo record: its heading,
 * the grade in a ring that draws round to the score, a bar chart growing bar
 * by bar, and its key figures. Reel 1 showed the client's report this way
 * (05.2, 08.2). Anything modelled carries the product's illustrative-example
 * label, as its guardrails require.
 */
import { z } from "zod";
import { beatsAcross, groundHtml, riseState } from "../kit";
import { demoList, demoValue, type DemoRecord } from "../demo";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  title: z.string().max(80).default("{{record.title}}"),
  subtitle: z.string().max(100).default("{{record.subtitle}}"),
  grade: z.string().max(40).default("{{record.grade}}"),
  score: z.string().max(40).default("{{record.score}}"),
  chartTitle: z.string().max(60).default("Scores by dimension"),
  /**
   * One bar a line: "Label: value" (values on one scale, e.g. out of 100).
   * None: the demo record's `grade` list, so the bars are the record's own.
   */
  bars: z.array(z.string().max(60)).max(8).default([]),
  note: z.string().max(60).default("Illustrative example"),
});

/** Bars for a record with no `grade` list: plainly illustrative. */
const ILLUSTRATIVE_BARS = ["Growth: 78", "Location: 92", "Yield: 64", "Demand: 85", "Risk: 71"];

/**
 * The record's grade as bars: each row's first column its label, and the
 * first number in its second its value ("Capital growth", "86 / 100"), so a
 * page never shows scores the record's grade wasn't reached from.
 */
export function gradeBars(demo: DemoRecord): string[] | null {
  const rows = (demoList(demo, "grade")?.rows ?? []).flatMap((row) => {
    const value = /-?\d+(?:\.\d+)?/.exec(row[1] ?? "")?.[0];
    return row[0]?.trim() && value !== undefined ? [`${row[0].trim()}: ${value}`] : [];
  });
  return rows.length ? rows.slice(0, 8) : null;
}

export const reportTemplate = defineTemplate({
  id: "report-page",
  version: 2,
  title: "Report page",
  description:
    "A page of the product's report: its grade in a ring, a bar chart growing bar by bar, and the illustrative-example label.",
  group: "product",
  schema,
  fields: [
    { key: "title", label: "Title", kind: "text", max: 80 },
    { key: "subtitle", label: "Subtitle", kind: "text", max: 100 },
    { key: "grade", label: "Grade", kind: "text", max: 40 },
    { key: "score", label: "Score (0-100)", kind: "text", max: 40 },
    { key: "chartTitle", label: "Chart title", kind: "text", max: 60 },
    {
      key: "bars",
      label: "Bars (Label: value, one a line; none: the demo record's grade)",
      kind: "lines",
      max: 8,
    },
    { key: "note", label: "Note", kind: "text", max: 60 },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const pageW = Math.min(width * (portrait ? 0.86 : 0.44), 900 * u);
    const pageH = pageW * 1.3;
    const pageX = (width - pageW) / 2;
    const pageY = (portrait ? height * 0.47 : height * 0.5) - pageH / 2;
    const lines = params.bars.length ? params.bars : (gradeBars(brand.demo) ?? ILLUSTRATIVE_BARS);
    const bars = lines
      .map((line) => {
        const filled = fill(line);
        const split = filled.lastIndexOf(":");
        const value = Number(filled.slice(split + 1).replace(/[^\d.-]/g, ""));
        return split > 0 && Number.isFinite(value)
          ? { label: filled.slice(0, split).trim(), value }
          : null;
      })
      .filter((bar): bar is { label: string; value: number } => bar !== null);
    const top = Math.max(1, ...bars.map((bar) => bar.value));
    const grade = escapeHtml(fill(params.grade).slice(0, 4));
    const scoreValue = Number(fill(params.score).replace(/[^\d.]/g, ""));
    const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0;
    const ring = 2 * Math.PI * 80;
    const chartH = 300 * u;
    const verdict = escapeHtml(demoValue(brand.demo, "record.verdict") ?? "");

    const rise = Math.min(0.65, duration * 0.15);
    const [gradeAt, barsAt] = beatsAcross(duration, [0, 0.35], rise, 1.1);
    const barAt = (k: number) => barsAt! + k * Math.min(0.18, 1 / Math.max(1, bars.length));

    const css = `
.rp-page { position:absolute; left:${px(pageX)}; top:${px(pageY)}; width:${px(pageW)}; height:${px(pageH)}; border-radius:${px(12 * u)};
  background:#fbfbf8; color:#111827; overflow:hidden; box-shadow:0 ${px(40 * u)} ${px(100 * u)} rgba(0,0,0,.5); }
.rp-band { height:${px(96 * u)}; padding:0 ${px(48 * u)}; display:flex; align-items:center; justify-content:space-between;
  background:var(--c-ground); color:var(--c-ink); font-size:${px(22 * u)}; letter-spacing:.16em; text-transform:uppercase; }
.rp-band b { color:var(--c-highlight); font-weight:600; }
.rp-body { padding:${px(46 * u)} ${px(48 * u)}; }
.rp-head { display:flex; justify-content:space-between; gap:${px(30 * u)}; align-items:flex-start; }
.rp-title { font-family:var(--f-display); font-size:${px(50 * u)}; line-height:1.1; }
.rp-sub { margin-top:${px(10 * u)}; font-size:${px(25 * u)}; color:#6b7280; }
.rp-grade { position:relative; flex:none; width:${px(180 * u)}; height:${px(180 * u)}; }
.rp-grade svg { position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg); }
.rp-grade div { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.rp-grade b { font-family:var(--f-display); font-size:${px(64 * u)}; line-height:1; color:#111827; }
.rp-grade span { font-size:${px(19 * u)}; color:#6b7280; margin-top:${px(4 * u)}; text-transform:uppercase; letter-spacing:.06em; }
.rp-chart-title { margin:${px(46 * u)} 0 ${px(18 * u)}; font-size:${px(22 * u)}; letter-spacing:.12em; text-transform:uppercase; color:#6b7280; }
.rp-chart { position:relative; height:${px(chartH)}; display:flex; align-items:flex-end; gap:${px(22 * u)}; border-bottom:2px solid #e5e7eb; }
.rp-bar { flex:1; position:relative; height:100%; display:flex; flex-direction:column; justify-content:flex-end; }
.rp-bar i { display:block; border-radius:${px(8 * u)} ${px(8 * u)} 0 0; background:linear-gradient(180deg, var(--c-highlight), var(--c-accent)); transform-origin:50% 100%; }
.rp-bar b { position:absolute; left:0; right:0; text-align:center; font-size:${px(22 * u)}; font-weight:700; color:#111827; }
.rp-labels { display:flex; gap:${px(22 * u)}; margin-top:${px(12 * u)}; }
.rp-labels span { flex:1; text-align:center; font-size:${px(19 * u)}; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rp-note { position:absolute; left:${px(48 * u)}; right:${px(48 * u)}; bottom:${px(34 * u)}; font-size:${px(19 * u)}; color:#9ca3af; letter-spacing:.04em; }
`;
    const html = [
      groundHtml(),
      `<div class="rp-page" id="rp-page"><div class="rp-band"><span>${escapeHtml(brand.name)}</span><b>${escapeHtml(brand.demo.label)}</b></div>`,
      `<div class="rp-body"><div class="rp-head"><div><div class="rp-title" id="rp-title">${escapeHtml(fill(params.title))}</div>`,
      `<div class="rp-sub" id="rp-sub">${escapeHtml(fill(params.subtitle))}</div></div>`,
      grade
        ? `<div class="rp-grade" id="rp-grade"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="80" fill="none" stroke="#e5e7eb" stroke-width="9"/>` +
          `<circle id="rp-ring" cx="90" cy="90" r="80" fill="none" stroke="var(--c-highlight)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${r3(ring)}" stroke-dashoffset="${r3(ring)}"/></svg>` +
          `<div><b>${grade}</b>${verdict ? `<span>${verdict}</span>` : ""}</div></div>`
        : "",
      `</div>`,
      bars.length
        ? `<div class="rp-chart-title" id="rp-chart-title">${escapeHtml(fill(params.chartTitle))}</div><div class="rp-chart">${bars
            .map(
              (bar, k) =>
                `<div class="rp-bar"><b id="rp-val-${k}" style="bottom:${px((bar.value / top) * (chartH - 40 * u) + 8 * u)}">${escapeHtml(String(bar.value))}</b><i id="rp-bar-${k}" style="height:${px((bar.value / top) * (chartH - 40 * u))}"></i></div>`,
            )
            .join(
              "",
            )}</div><div class="rp-labels">${bars.map((bar) => `<span>${escapeHtml(bar.label)}</span>`).join("")}</div>`
        : "",
      `</div>`,
      params.note ? `<div class="rp-note" id="rp-note">${escapeHtml(fill(params.note))}</div>` : "",
      `</div>`,
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, 0, rise, motion.settle);
      st.set("#rp-page", {
        transform: `translateY(${px((1 - up) * 120 * u)}) scale(${r3(0.96 + 0.04 * up)})`,
        ...fade(up),
      });
      riseState(st, t, motion, u, "#rp-title", null, rise * 0.7, { lift: 12 });
      riseState(st, t, motion, u, "#rp-sub", null, rise * 0.9, { lift: 10 });
      if (grade) {
        const p = span(t, gradeAt!, gradeAt! + 1.0, motion.move);
        st.set("#rp-ring", { "stroke-dashoffset": String(r3(ring * (1 - (p * score) / 100))) });
        st.set("#rp-grade", {
          transform: `scale(${r3(0.85 + 0.15 * span(t, gradeAt!, gradeAt! + 0.4, motion.settle))})`,
          ...fade(span(t, gradeAt! - 0.1, gradeAt! + 0.2, motion.linear)),
        });
      }
      if (bars.length)
        st.set("#rp-chart-title", fade(span(t, barsAt! - 0.2, barsAt!, motion.linear)));
      bars.forEach((_bar, k) => {
        const p = span(t, barAt(k), barAt(k) + 0.55, motion.settle);
        st.set(`#rp-bar-${k}`, { transform: `scaleY(${r3(p)})` });
        st.set(`#rp-val-${k}`, {
          transform: `translateY(${px((1 - p) * 20 * u)})`,
          ...fade(span(t, barAt(k) + 0.3, barAt(k) + 0.55, motion.linear)),
        });
      });
      if (params.note) st.set("#rp-note", fade(span(t, rise, rise + 0.4, motion.linear)));
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rise, label: "The page is in" },
        ...(grade ? [{ at: gradeAt! + 1.0, label: "The grade is drawn" }] : []),
        ...(bars.length
          ? [{ at: barAt(bars.length - 1) + 0.55, label: "The chart is drawn" }]
          : []),
      ],
    };
  },
});
