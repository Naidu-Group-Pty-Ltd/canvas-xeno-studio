/**
 * A product's list view, from the brand's demo record: the records with their
 * statuses, a filter for one status pressed, the records that don't match
 * folding away and the rest closing up, the first left selected. A screen only
 * changes because of an action the viewer sees (Reel 1's brief).
 */
import { z } from "zod";
import { beatsAcross, groundHtml, pointerHtml, pointerState } from "../kit";
import { demoList } from "../demo";
import { CompositionState, escapeHtml, fade, lerp, px, r3, span } from "../state";
import { defineTemplate } from "../types";
import { initialsOf, productShell, statusTone } from "./product";

const schema = z.object({
  section: z.string().max(40).default("Records"),
  list: z.string().max(40).default("items"),
  /** The status the filter keeps (empty: the first record's). */
  filter: z.string().max(40).default(""),
  pointer: z.boolean().default(true),
});

export const listTemplate = defineTemplate({
  id: "record-list",
  version: 1,
  title: "Record list",
  description:
    "The product's list of records from the demo record: a status filter is pressed, the rest fold away, and the match is selected.",
  group: "product",
  schema,
  fields: [
    { key: "section", label: "Page title", kind: "text", max: 40 },
    { key: "list", label: "Demo record list", kind: "text", max: 40 },
    { key: "filter", label: "Filter on status (empty: the first's)", kind: "text", max: 40 },
    { key: "pointer", label: "Pointer", kind: "toggle" },
  ],
  duration: { default: 6, min: 3, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const shell = productShell({
      brand,
      motion,
      width,
      height,
      u,
      duration,
      section: fill(params.section),
      active: 1,
    });
    const { content } = shell;
    const list = demoList(brand.demo, params.list);
    const rows = (list?.rows ?? []).slice(0, 7);
    const statusOf = (row: string[]) => row.at(-1) ?? "";
    const statuses = [...new Set(rows.map(statusOf).filter(Boolean))].slice(0, 4);
    const filter = fill(params.filter) || statuses[0] || "";
    const chipH = 56 * u;
    const rowH = 92 * u;
    const listTop = chipH + 30 * u;
    const keep = rows.map((row) => !filter || statusOf(row) === filter);
    const kept = (k: number) => keep.slice(0, k).filter(Boolean).length;

    const [rowsAt, filterAt] = beatsAcross(duration, [0, 0.5], shell.rise + 0.05, 1.3);
    const rowAt = (k: number) => rowsAt! + k * 0.1;
    const chipIndex = Math.max(0, statuses.indexOf(filter));
    // Where the filter's chip sits, to press it.
    const chipX = content.x + 20 * u + chipIndex * 200 * u + 80 * u;
    const chipY = content.y + chipH / 2;

    const css = `${shell.css}
.ls-chips { display:flex; gap:${px(16 * u)}; height:${px(chipH)}; align-items:center; }
.ls-chips .cx-chip { min-width:${px(184 * u)}; justify-content:center; font-size:${px(21 * u)}; }
.ls-chip-off { background:transparent !important; color:var(--c-muted) !important; border-color:var(--c-line) !important; }
.ls-list { position:absolute; left:0; right:0; top:${px(listTop)}; }
.ls-row { position:absolute; left:0; right:0; height:${px(rowH - 12 * u)}; border-radius:${px(16 * u)}; background:var(--c-surface); border:1px solid var(--c-line);
  display:flex; align-items:center; gap:${px(18 * u)}; padding:0 ${px(20 * u)}; font-size:${px(25 * u)}; color:var(--c-ink); }
.ls-row span.n { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.ls-row span.o { width:30%; color:var(--c-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ls-ini { flex:none; width:${px(46 * u)}; height:${px(46 * u)}; border-radius:50%; background:var(--c-raised); display:flex; align-items:center; justify-content:center; font-size:${px(18 * u)}; font-weight:700; }
.ls-row .cx-chip { font-size:${px(19 * u)}; padding:${px(5 * u)} ${px(14 * u)}; }
`;
    const body = [
      `<div class="ls-chips" id="ls-chips">${statuses
        .map(
          (status, k) =>
            `<span class="cx-chip ${statusTone(status)}" id="ls-chip-${k}">${escapeHtml(status)}</span>`,
        )
        .join("")}</div>`,
      `<div class="ls-list">${rows
        .map(
          (row, k) =>
            `<div class="ls-row" id="ls-row-${k}" style="top:${px(k * rowH)}"><span class="ls-ini">${escapeHtml(initialsOf(row[0] ?? ""))}</span>` +
            `<span class="n">${escapeHtml(row[0] ?? "")}</span>${row.length > 2 ? `<span class="o">${escapeHtml(row[1] ?? "")}</span>` : ""}` +
            `<span class="cx-chip ${statusTone(statusOf(row))}">${escapeHtml(statusOf(row))}</span></div>`,
        )
        .join("")}</div>`,
    ].join("");
    const html = [
      groundHtml(),
      shell.html(body),
      params.pointer && filter ? pointerHtml() : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      shell.state(st, t);
      st.set("#ls-chips", fade(span(t, shell.rise * 0.6, shell.rise + 0.2, motion.linear)));
      const folded = filter ? span(t, filterAt! + 0.15, filterAt! + 0.7, motion.move) : 0;
      statuses.forEach((status, k) => {
        const off = status !== filter ? span(t, filterAt!, filterAt! + 0.2, motion.linear) : 0;
        st.set(`#ls-chip-${k}`, { opacity: r3(1 - 0.55 * off) });
      });
      rows.forEach((_row, k) => {
        const p = span(t, rowAt(k), rowAt(k) + 0.35, motion.settle);
        // A row that doesn't match folds away; the rest close up into the room it leaves.
        const gone = keep[k] ? 0 : folded;
        const y = lerp(k * rowH, kept(k) * rowH, keep[k] ? folded : 0);
        const selected =
          keep[k] && kept(k) === 0 ? span(t, filterAt! + 0.7, filterAt! + 0.9, motion.linear) : 0;
        st.set(`#ls-row-${k}`, {
          top: px(y),
          transform: `translateX(${px((1 - p) * 40 * u + gone * 30 * u)}) scale(${r3(1 - 0.05 * gone)})`,
          "border-color": selected > 0.5 ? "var(--c-accent)" : "var(--c-line)",
          ...fade(p * (1 - gone)),
        });
      });
      if (params.pointer && filter)
        pointerState(st, t, motion, u, {
          from: [width * 0.84, height * 0.82],
          to: [chipX, chipY],
          a: filterAt! - 0.8,
          b: filterAt! - 0.08,
          show: filterAt! - 0.8,
          press: filterAt!,
        });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rowAt(rows.length - 1) + 0.35, label: "The records are in" },
        ...(filter ? [{ at: filterAt!, label: `Filtered to ${filter}` }] : []),
      ],
    };
  },
});
