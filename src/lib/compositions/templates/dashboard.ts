/**
 * A product's dashboard, drawn from the brand's demo record: three figures
 * (the record's metrics) counting up in their tiles, the record list arriving
 * row by row with its statuses, then the pointer selecting one row, held in
 * the focus corners. Every name and figure is the demo record's, so a rename
 * is one edit to the record.
 */
import { z } from "zod";
import {
  beatsAcross,
  cornersHtml,
  cornersState,
  groundHtml,
  pointerHtml,
  pointerState,
} from "../kit";
import { demoList, demoValue } from "../demo";
import { CompositionState, escapeHtml, fade, px, span } from "../state";
import { defineTemplate } from "../types";
import { countable } from "./stat";
import { initialsOf, productShell, statusTone } from "./product";

const schema = z.object({
  section: z.string().max(40).default("Overview"),
  list: z.string().max(40).default("items"),
  /** The row the pointer selects (1 is the first; 0 for none). */
  select: z.number().int().min(0).max(8).default(1),
});

export const dashboardTemplate = defineTemplate({
  id: "product-dashboard",
  version: 1,
  title: "Product dashboard",
  description:
    "The product's dashboard from the brand's demo record: its figures count up, its records arrive, and one is selected.",
  group: "product",
  schema,
  fields: [
    { key: "section", label: "Page title", kind: "text", max: 40 },
    { key: "list", label: "Demo record list", kind: "text", max: 40 },
    { key: "select", label: "Row to select (0 for none)", kind: "number", min: 0, max: 8, step: 1 },
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
      active: 0,
    });
    const { content } = shell;
    const metric = (key: string) => demoValue(brand.demo, `metrics.${key}`) ?? "";
    const tiles = [
      { value: metric("first"), label: metric("first_label") },
      { value: metric("second"), label: metric("second_label") },
      { value: metric("third"), label: metric("third_label") },
    ].filter((tile) => tile.value);
    const list = demoList(brand.demo, params.list);
    const rows = (list?.rows ?? []).slice(0, 6);
    const tileH = 150 * u;
    const rowH = 84 * u;
    const tableTop = tiles.length ? tileH + 34 * u : 0;
    const head = 52 * u;

    const [tilesAt, rowsAt, selectAt] = beatsAcross(
      duration,
      [0, 0.28, 0.72],
      shell.rise + 0.05,
      1.0,
    );
    const rowAt = (k: number) =>
      rowsAt! + k * Math.min(0.14, (selectAt! - rowsAt! - 0.3) / Math.max(1, rows.length));
    const selected = params.select > 0 && params.select <= rows.length ? params.select - 1 : -1;
    const rowRect = (k: number): [number, number, number, number] => [
      content.x,
      content.y + tableTop + head + k * rowH,
      content.w,
      rowH,
    ];

    const css = `${shell.css}
.db-tiles { display:flex; gap:${px(20 * u)}; height:${px(tileH)}; }
.db-tile { flex:1; border-radius:${px(18 * u)}; background:var(--c-raised); border:1px solid var(--c-line); padding:${px(22 * u)}; display:flex; flex-direction:column; justify-content:space-between; }
.db-tile b { font-family:var(--f-display); font-size:${px(50 * u)}; line-height:1; color:var(--c-ink); font-variant-numeric:tabular-nums; }
.db-tile span { font-size:${px(21 * u)}; color:var(--c-muted); }
.db-table { position:absolute; left:0; right:0; top:${px(tableTop)}; }
.db-head { display:flex; height:${px(head)}; align-items:center; font-size:${px(19 * u)}; letter-spacing:.08em; text-transform:uppercase; color:var(--c-muted); border-bottom:1px solid var(--c-line); }
.db-row { display:flex; height:${px(rowH)}; align-items:center; border-bottom:1px solid var(--c-line); font-size:${px(25 * u)}; color:var(--c-ink); border-radius:${px(12 * u)}; }
.db-cell { flex:1; min-width:0; padding:0 ${px(12 * u)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:${px(14 * u)}; }
.db-cell:first-child { flex:1.5; }
.db-ini { flex:none; width:${px(42 * u)}; height:${px(42 * u)}; border-radius:50%; background:var(--c-raised); border:1px solid var(--c-line); display:flex; align-items:center; justify-content:center; font-size:${px(17 * u)}; font-weight:700; }
.db-cell .cx-chip { font-size:${px(19 * u)}; padding:${px(5 * u)} ${px(14 * u)}; }
`;
    const columns = list?.columns ?? [];
    const body = [
      tiles.length
        ? `<div class="db-tiles">${tiles
            .map(
              (tile, k) =>
                `<div class="db-tile" id="db-tile-${k}"><b id="db-num-${k}">${escapeHtml(tile.value)}</b><span>${escapeHtml(tile.label)}</span></div>`,
            )
            .join("")}</div>`
        : "",
      `<div class="db-table">`,
      columns.length
        ? `<div class="db-head" id="db-head">${columns.map((column) => `<div class="db-cell">${escapeHtml(column)}</div>`).join("")}</div>`
        : "",
      rows
        .map(
          (row, k) =>
            `<div class="db-row" id="db-row-${k}">${row
              .map((cell, c) =>
                c === 0
                  ? `<div class="db-cell"><span class="db-ini">${escapeHtml(initialsOf(cell))}</span>${escapeHtml(cell)}</div>`
                  : c === row.length - 1 && row.length > 2
                    ? `<div class="db-cell"><span class="cx-chip ${statusTone(cell)}">${escapeHtml(cell)}</span></div>`
                    : `<div class="db-cell">${escapeHtml(cell)}</div>`,
              )
              .join("")}</div>`,
        )
        .join(""),
      `</div>`,
    ].join("");
    const html = [
      groundHtml(),
      shell.html(body),
      selected >= 0 ? cornersHtml() + pointerHtml() : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      shell.state(st, t);
      tiles.forEach((tile, k) => {
        const p = span(t, tilesAt! + k * 0.12, tilesAt! + k * 0.12 + 0.45, motion.settle);
        st.set(`#db-tile-${k}`, { transform: `translateY(${px((1 - p) * 24 * u)})`, ...fade(p) });
        const number = countable(tile.value);
        if (number) {
          const counted =
            number.number * span(t, tilesAt! + k * 0.12, tilesAt! + k * 0.12 + 1.1, motion.settle);
          const fixed = counted.toFixed(number.decimals);
          st.set(`#db-num-${k}`, {
            $text: number.grouped ? fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : fixed,
          });
        }
      });
      if (columns.length)
        st.set("#db-head", fade(span(t, rowsAt! - 0.1, rowsAt! + 0.2, motion.linear)));
      rows.forEach((_row, k) => {
        const p = span(t, rowAt(k), rowAt(k) + 0.35, motion.settle);
        const on = k === selected ? span(t, selectAt!, selectAt! + 0.2, motion.linear) : 0;
        st.set(`#db-row-${k}`, {
          transform: `translateX(${px((1 - p) * 40 * u)})`,
          background: on > 0.5 ? "var(--c-raised)" : "transparent",
          ...fade(p),
        });
      });
      if (selected >= 0) {
        const [rx, ry, rw, rh] = rowRect(selected);
        pointerState(st, t, motion, u, {
          from: [width * 0.86, height * 0.84],
          to: [rx + rw * 0.36, ry + rh * 0.55],
          a: selectAt! - 0.75,
          b: selectAt! - 0.08,
          show: selectAt! - 0.75,
          press: selectAt!,
        });
        cornersState(st, t, motion, u, [rx, ry, rw, rh], selectAt! + 0.1, selectAt! + 0.55, {
          inset: 6,
        });
      }
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: shell.rise, label: "The dashboard is in" },
        ...(tiles.length ? [{ at: tilesAt! + 1.1, label: "The figures land" }] : []),
        ...(selected >= 0
          ? [{ at: selectAt!, label: `Selects ${rows[selected]?.[0] ?? "a row"}` }]
          : []),
      ],
    };
  },
});
