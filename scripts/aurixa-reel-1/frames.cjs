// Draws Reel 1's style frames (system edition, BRIEF.md): one 1080 x 1920 still for each block, at its key
// beat and under its caption, for approval before anything moves. A frame is drawn from the plates
// themselves (their HTML, at the camera's zoom, so type stays sharp however close the camera is), the
// graphics kit (./kit.cjs) and the tokens reel_css.ts writes from the brand's code (aurixa-reel.css).
// Run: node scripts/aurixa-reel-1/frames.cjs <outDir> <assetsDir>   (FRAMES_ONLY=F01,F05 draws some;
// FRAMES_ZONES=1 draws the frame's zones over each, to check them)
const fs = require("fs");
const path = require("path");

const { PLATES, KIT, ASSET_HOST, styles } = require("./plates.cjs");

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((file) =>
  fs.existsSync(file),
);

const OUT = path.resolve(process.argv[2] || "reel-1-frames");
const ASSETS = process.argv[3] ? path.resolve(process.argv[3]) : null;
const SPEC = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../docs/brands/aurixa-reel-1/spec.json"), "utf8"),
);
const CAPTIONS = SPEC.edit.captions;
const asset = (name) =>
  ASSETS && fs.existsSync(path.join(ASSETS, name)) ? `${ASSET_HOST}/${name}` : null;
const P = asset("P.png");
const D = asset("D.png");
const EMBLEM = asset("emblem.png");
const WORDMARK = asset("wordmark.png");

/** A plate at its drawn size in CSS px, with its HTML (edited where a frame needs a state of its own). */
function plate(key, edit = (html) => html) {
  const p = PLATES[key];
  if (!p) throw new Error(`There is no plate ${key}`);
  const scale = p.scale ?? 1;
  return { html: edit(p.html), css: [p.size[0] / scale, p.size[1] / scale] };
}

/**
 * Marks `words` (the text after `lead`) for the highlight. The marker is placed under them once the frame
 * is drawn, where the browser set them, so a change to the page's layout cannot leave it under other words.
 */
function markWords(html, lead, words) {
  const at = html.split(lead + words).length - 1;
  if (at !== 1) throw new Error(`"${lead}${words}" is on the page ${at} times, not once`);
  return html.replace(lead + words, `${lead}<span data-mark>${words}</span>`);
}

const {
  frame,
  rail,
  camera,
  shot,
  through,
  pointer,
  focusCorners,
  marker,
  link,
  recordCard,
  person,
  doc,
  ausMap,
  pin,
  clock,
  bridge,
  plainWin,
  listing,
  inbox,
  note,
  glyph,
} = KIT;

// ------------------------------------------------------------------ today's tools, one window each (02.1, 03.1)
// PL-02A holds the four windows in one plate; in the film they arrive one by one, so each is its own window.
const bar = (w) =>
  `<div style="height:14px;border-radius:7px;background:var(--reel-before-paper);width:${w}%"></div>`;
const research =
  () => `<div style="flex:1;display:flex;flex-direction:column;gap:16px;padding:20px 22px;min-width:0">
    <div style="height:150px;border-radius:8px;background:var(--reel-before-paper);position:relative;overflow:hidden">
      <svg width="100%" height="100%" viewBox="0 0 600 150" preserveAspectRatio="none"><g stroke="var(--reel-before-border)" stroke-width="5" fill="none"><path d="M0 40 L600 70"/><path d="M0 120 L600 96"/><path d="M180 0 L240 150"/><path d="M430 0 L390 150"/></g></svg></div>
    <div style="font-size:24px;font-weight:700">Comparable sales</div>
    ${[72, 64, 80, 58]
      .map(
        (w) =>
          `<div style="display:flex;gap:14px;align-items:center"><div style="width:48px;height:34px;border-radius:6px;background:var(--reel-before-paper);flex:none"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px">${bar(w)}${bar(w - 26)}</div></div>`,
      )
      .join("")}</div>`;
const worksheet = () => {
  const cols = ["", "A", "B", "C"];
  const head = `<div class="fk-row hd">${cols.map((c) => `<span>${c}</span>`).join("")}</div>`;
  const rows = [
    ["Item", "Amount", "Notes"],
    ["Purchase price", "", ""],
    ["Deposit", "", ""],
    ["Loan", "=B2-B3", ""],
    ["Rent / week", "", ""],
  ]
    .map(
      (cells, i) =>
        `<div class="fk-row"><span class="n">${i + 1}</span>${cells
          .map(
            (c, j) =>
              `<span class="${i === 0 ? "lab" : ""}${i === 3 && j === 1 ? " sel" : ""}">${c}${i === 3 && j === 1 ? '<em class="fk-caret"></em>' : ""}</span>`,
          )
          .join("")}</div>`,
    )
    .join("");
  return `<div class="fk-sheet"><div class="fx"><b>fx</b>=B2-B3</div>${head}${rows}</div>`;
};
const contact = () => `<div style="flex:1;display:flex;flex-direction:column">
    <div style="height:92px;background:var(--reel-before-paper);border-bottom:1px solid var(--reel-before-border)"></div>
    <div style="display:flex;gap:18px;align-items:flex-end;padding:0 24px;margin-top:-46px">
      <div style="width:92px;height:92px;border-radius:50%;background:var(--reel-before-surface);border:3px solid var(--reel-before-border);display:grid;place-items:center;font-size:32px;font-weight:700">JE</div>
      <div style="padding-bottom:8px"><div style="font-size:30px;font-weight:700">Jordan Ellis</div><div style="font-size:20px;color:var(--reel-before-ink-muted)">Contact</div></div></div>
    <div style="padding:18px 24px;display:grid;grid-template-columns:110px 1fr;gap:14px 16px;align-items:center;font-size:20px;color:var(--reel-before-ink-muted)">
      <span>Phone</span>${bar(46)}<span>Email</span>${bar(70)}<span>Notes</span>${bar(84)}</div></div>`;
const blankReport =
  () => `<div style="flex:1;padding:26px 34px;display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;align-items:center;font-size:34px;font-weight:700;color:var(--reel-before-ink-muted)">Untitled report<em class="fk-caret" style="height:40px;margin-left:6px"></em></div>
    ${[0, 1, 2, 3].map(() => `<div style="height:2px;background:var(--reel-before-paper)"></div>`).join("")}</div>`;
const scaled = (x, y, scale, html) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;transform:scale(${scale});transform-origin:0 0">${html}</div>`;

// The extra CSS the frames' own pieces need, beyond the kit.
const FRAME_CSS = `
.fk-caret { display:inline-block; width:3px; height:26px; background:var(--reel-before-ink); vertical-align:middle; }
.fk-sheet { flex:1; display:flex; flex-direction:column; font-size:20px; }
.fk-sheet .fx { display:flex; gap:16px; padding:10px 16px; border-bottom:1px solid var(--reel-before-border); font-family:var(--reel-before-type); }
.fk-sheet .fx b { font-style:italic; color:var(--reel-before-ink-muted); font-weight:600; }
.fk-row { display:grid; grid-template-columns:48px 1.6fr 1fr 1fr; border-bottom:1px solid var(--reel-before-border); }
.fk-row span { height:46px; display:flex; align-items:center; padding:0 12px; border-right:1px solid var(--reel-before-border); white-space:nowrap; overflow:hidden; }
.fk-row.hd span, .fk-row .n { background:var(--reel-before-paper); color:var(--reel-before-ink-muted); justify-content:center; font-size:17px; }
.fk-row .lab { font-weight:700; }
.fk-row .sel { outline:3px solid var(--reel-before-ink); outline-offset:-3px; font-family:Inconsolata, monospace; }
.fk-tail { position:absolute; width:28px; height:28px; transform:rotate(45deg); background:var(--reel-before-surface); }
.fk-tail.down { border-right:1px solid var(--reel-before-border); border-bottom:1px solid var(--reel-before-border); }
.fk-doclist { flex:1; padding:20px 22px; display:flex; flex-direction:column; gap:12px; }
.fk-doclist h4 { font-size:25px; font-weight:700; margin-bottom:4px; }
.fk-doclist div { padding:14px 16px; border:1px solid var(--reel-before-border); border-radius:8px; background:var(--reel-before-paper); font-size:22px; }
.fk-doclist div.copy { border-color:var(--reel-before-ink-muted); border-style:dashed; background:var(--reel-before-surface); }
.fk-shimmer { background:linear-gradient(110deg, #ffffff 30%, #5eddE8 50%, #ffffff 70%); background-size:200% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent; }
.fk-horizon { position:absolute; left:0; right:0; height:2px; z-index:2;
  background:linear-gradient(90deg, transparent, var(--reel-hairline) 16%, var(--reel-hairline) 84%, transparent); box-shadow:var(--reel-glow-gold); }
.fk-confirm { position:absolute; transform:translate(-50%, -50%); z-index:8; padding:8px 16px; border-radius:999px; white-space:nowrap;
  font:600 21px/1 var(--reel-sans); color:var(--reel-ink); background:color-mix(in srgb, var(--reel-surface) 94%, transparent);
  border:2px solid var(--reel-gold-ink); box-shadow:var(--reel-glow-gold); }
`;

// ------------------------------------------------------------------ the frames
const TEAM = [
  ["AM", "#1238E8", "Buyer's agent", "Alex Morgan", "Aurixa Systems · Property"],
  ["JC", "#0f766e", "Finance broker", "Jamie Chen", "Harbour Finance Group"],
  ["PS", "#7c3aed", "Solicitor / conveyancer", "Priya Shah", "Shah Legal"],
  ["MP", "#b45309", "Accountant", "Mia Patel", "Patel &amp; Co Accountants"],
  ["DR", "#0e7490", "Builder / developer", "Daniel Reed", "Reed Constructions"],
];

const FRAMES = {
  // 01.1, near the end of its push: the listing card opened above the gold pin on the New South Wales coast,
  // the continent still around it.
  F01: {
    shot: "01.1",
    at: 3.6,
    palette: "before",
    draw() {
      const map = ausMap({
        centre: [134.0, -27.5],
        at: [470, 845],
        scale: 25,
        region: [0, 300, 1080, 1260],
      });
      const [px0, py0] = map.toFrame([150.92, -33.68]);
      const point = [Math.round(px0), Math.round(py0)];
      const width = 470;
      const left = Math.round(point[0] - width + 70);
      return [
        map.svg,
        pin(point[0], point[1], { pulse: 0.55 }),
        `<div style="position:absolute;left:${left}px;bottom:${1920 - (point[1] - 96)}px;width:${width}px;z-index:6;filter:drop-shadow(0 18px 36px rgba(17,24,39,.18))">${listing({ width, chips: ["New listing · just now"] })}
          <div class="fk-tail down" style="left:${point[0] - left - 14}px;bottom:-13px"></div></div>`,
      ];
    },
  },
  // 02.1, its last beat: four tools in four styles, none finished, the empty report in front.
  F02: {
    shot: "02.1",
    at: 17.2,
    palette: "before",
    draw() {
      return [
        scaled(24, 384, 0.5, plainWin(0, 0, 1740, 1040, "Mail", inbox())),
        plainWin(400, 470, 650, 360, "Research", research()),
        plainWin(30, 640, 660, 340, "Financial worksheet", worksheet()),
        plainWin(470, 836, 580, 300, "Client details", contact()),
        plainWin(120, 990, 780, 290, "Untitled report", blankReport()),
        pointer(600, 1150),
      ];
    },
  },
  // 03.1, notifications from every edge; the windows nudged apart; the clock on Tuesday.
  F03: {
    shot: "03.1",
    at: 22.4,
    palette: "before",
    draw() {
      const toast = (key, x, y) => scaled(x, y, 0.86, note(key, 0, 0));
      return [
        plainWin(560, 384, 650, 360, "Research", research()),
        plainWin(-240, 560, 660, 340, "Financial worksheet", worksheet()),
        plainWin(660, 900, 580, 300, "Client details", contact()),
        plainWin(-170, 1020, 780, 290, "Untitled report", blankReport()),
        `<div style="position:absolute;left:240px;top:552px;z-index:8;filter:drop-shadow(0 18px 36px rgba(17,24,39,.2))">${listing({ width: 600, chips: ["Price guide updated", "Inspection booked"], enquiries: 27 })}</div>`,
        `<div style="position:absolute;inset:0;z-index:9">${toast("mail", 326, 366)}${toast("chat", 640, 650)}${toast("calendar", -150, 770)}${toast("plan", 700, 980)}${toast("crm", 150, 1166)}</div>`,
        clock(36, 392, "Tuesday 4:12 pm"),
      ];
    },
  },
  // 04.2, every portal arrived: the Command Centre as the hub, each portal on its own dashboard.
  F04: { shot: "04.2", at: 33.5, palette: "aurixa", draw: () => systemMap({ travellers: true }) },
  // 05.2: the client's report lifted out of the page, its pages fanned behind (NEW-REPORT-PAGES).
  F05: {
    shot: "05.2",
    at: 44.9,
    palette: "aurixa",
    rail: () => rail("Report"),
    draw() {
      // The page it lifted out of, dimmed behind it; then the report as an object: the cover in front and
      // its pages fanned behind (the contents, the property's photograph, the summary).
      const back = shot({
        plate: plate("PL-05C-b"),
        zoom: 0.68,
        focus: [768, 432],
        at: [540, 840],
        rect: [40, 384, 1000, 900],
        dim: 0.6,
      });
      const page = (key, x, y, rotate, z) => {
        const p = plate(key);
        const width = 470;
        const height = (width * 842.25) / 595.5;
        return doc({
          x,
          y,
          width,
          height,
          rotate,
          z,
          html: `<div style="position:relative;width:${p.css[0]}px;height:${p.css[1]}px;transform:scale(${width / 595.5});transform-origin:0 0">${p.html}</div>`,
        });
      };
      return [
        back.html,
        `<div style="position:absolute;inset:0;z-index:4">${[
          page("NEW-REPORT-PAGES-contents", 150, 470, -11, 1),
          page("NEW-REPORT-PAGES-property", 300, 440, -2, 2),
          page("NEW-REPORT-PAGES-summary", 470, 470, 9, 3),
          page("NEW-REPORT-PAGES-cover", 270, 520, -4, 4),
        ].join("")}</div>`,
      ];
    },
  },
  // 06.2: the five team cards ring 14 Wattle Grove's record, linked to it.
  F06: {
    shot: "06.2",
    at: 50.5,
    palette: "aurixa",
    rail: () => rail("Team"),
    draw() {
      const page = plate("PL-06A-b");
      const centre = [540, 830];
      const ring = [
        [540, 455],
        [870, 610],
        [800, 1175],
        [280, 1175],
        [210, 610],
      ];
      // Each traveller on the part of its line between the cards, part-way through its one run.
      const t = [0.45, 0.4, 0.35, 0.35, 0.4];
      return [
        shot({
          plate: page,
          zoom: 1.04,
          focus: [480, 300],
          at: [540, 834],
          rect: [40, 384, 1000, 900],
          dim: 0.62,
        }).html,
        ...ring.map((p, i) => link(p, centre, { traveller: t[i] })),
        recordCard({ x: 362, y: 665, width: 356, imageHeight: 170, titleSize: 42 }),
        ...ring.map(([x, y], i) => {
          const [initials, tone, role, name, firm] = TEAM[i];
          return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%)">${person({ x: 0, y: 0, initials, tone, role, name, firm }).replace('style="left:0px;top:0px"', 'style="position:relative"')}</div>`;
        }),
      ];
    },
  },
  // 07.1: the professional's own words, marked, and Approved.
  F07: {
    shot: "07.1",
    at: 56.6,
    palette: "aurixa",
    rail: () => rail("Team"),
    draw() {
      // The changed words in the draft's body, marked where the page sets them.
      const p = plate("PL-07A-b", (html) =>
        markWords(html, "Next step: ", "review the remaining questions together."),
      );
      const view = shot({
        plate: p,
        zoom: 2.07,
        focus: [1272, 495],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      });
      return [view.html];
    },
  },
  // 08.2: the report at how the assessment was reached, the marker on it (NEW-REPORT-PAGES).
  F08: {
    shot: "08.2",
    beat: 1,
    at: 64.6,
    palette: "aurixa",
    rail: () => rail("Team"),
    draw() {
      const viewer = PLATES["NEW-REPORT-PAGES-b"];
      const [left, top, k] = viewer.sheetAt;
      const onPage = ([x, y]) => [left + k * x, top + k * y];
      const view = shot({
        plate: plate("NEW-REPORT-PAGES-b"),
        zoom: 2.45,
        focus: onPage([297.75, 285]),
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      });
      // The marker under what was not assessed: the two unscored rows' "- (not scored)".
      const marks = viewer.marks.map(({ x, base, width }) => {
        const [x1, y1] = view.map(onPage([x, base + 2.6]));
        const [x2] = view.map(onPage([x + width, base]));
        return marker(x1, y1, x2 - x1);
      });
      return [view.html, ...marks];
    },
  },
  // 09.1: two lists, three copies of one document, no bridge holding.
  F09: {
    shot: "09.1",
    at: 70.5,
    palette: "before",
    draw() {
      const list = (title, items, copy = -1) =>
        `<div class="fk-doclist"><h4>${title}</h4>${items.map((t, i) => `<div class="${i === copy ? "copy" : ""}">${t}</div>`).join("")}</div>`;
      // Row centres: the left list's from 573, the right list's from 673, every 72 px.
      const L = (i) => [486, 573 + i * 72];
      const R = (i) => [594, 673 + i * 72];
      return [
        plainWin(
          36,
          420,
          450,
          440,
          "Documents",
          list("14 Wattle Grove — documents", [
            "Contract of sale (draft)",
            "Floor plan",
            "Building specification",
            "Planning certificate",
          ]),
        ),
        plainWin(
          594,
          520,
          450,
          540,
          "Documents (2)",
          list(
            "14 Wattle Grove — documents",
            [
              "Contract of sale (draft)",
              "Floor plan",
              "Floor plan (copy)",
              "Building specification",
              "Floor plan (copy 2)",
            ],
            4,
          ),
        ),
        bridge(L(0), R(0)),
        bridge(L(1), R(1), { broken: 0.5 }),
        bridge(L(1), R(2)),
        bridge(L(2), R(3)),
        `<div style="position:absolute;left:330px;top:930px;z-index:9;transform:rotate(-5deg);border-radius:8px;box-shadow:0 22px 40px rgba(17,24,39,.24)"><div class="fk-doclist" style="padding:0"><div style="background:var(--reel-before-surface);width:300px;font-weight:600">Floor plan</div></div></div>`,
        pointer(600, 968),
      ];
    },
  },
  // 10.2: the system map dimmed; the invitation risen into the centre, the pointer on its button.
  F10: {
    shot: "10.2",
    at: 78.8,
    palette: "aurixa",
    draw() {
      const invitation = plate("PL-11A-a");
      return [
        `<div style="position:absolute;inset:0;opacity:.32">${systemMap({ travellers: false }).join("")}</div>`,
        `<div style="position:absolute;left:-420px;top:280px;width:1920px;height:1080px;-webkit-mask-image:radial-gradient(46% 52% at 50% 48%, #000 62%, transparent 100%);mask-image:radial-gradient(46% 52% at 50% 48%, #000 62%, transparent 100%)">${invitation.html}</div>`,
      ];
    },
  },
  // 11.2: the demo workspace, focus settled on the Demo project card.
  F11: {
    shot: "11.2",
    at: 82.6,
    palette: "aurixa",
    draw() {
      const view = shot({
        plate: plate("PL-11A-c"),
        zoom: 1.9,
        focus: [447, 770],
        at: [540, 900],
        rect: [40, 384, 1000, 900],
      });
      const [x1, y1] = view.map([286, 711]);
      const [x2, y2] = view.map([608, 830]);
      return [view.html, focusCorners(x1, y1, x2 - x1, y2 - y1, 16)];
    },
  },
  // 12.3: the floor plan as one object beside the matter's Notes, Matter updated.
  F12: {
    shot: "12.3",
    at: 88.4,
    palette: "aurixa",
    draw() {
      const plan = D
        ? `<div style="width:100%;height:100%;background:#fff url('${D}') center/90% no-repeat"></div>`
        : `<div style="width:100%;height:100%;background:#fff"></div>`;
      const notes = shot({
        plate: plate("PL-12B-b"),
        zoom: 1.5,
        focus: [920, 530],
        at: [540, 1000],
        rect: [40, 700, 1000, 584],
        style: "z-index:3",
      });
      return [doc({ x: 330, y: 386, width: 420, height: 420, html: plan, rotate: -3 }), notes.html];
    },
  },
  // 13.1, after its pull back: the journey rail complete, ending on Subject to valuation.
  F13: {
    shot: "13.1",
    at: 93.8,
    palette: "aurixa",
    rail: () => rail("Decision", { complete: true, reading: "Subject to valuation" }),
    draw() {
      return [
        // The window is cut to the page's own height (720 css px at this zoom), so no empty band shows under it.
        shot({
          plate: plate("PL-13A-b"),
          zoom: 0.95,
          focus: [760, 400],
          at: [540, 860],
          rect: [40, 440, 1000, 712],
        }).html,
      ];
    },
  },
  // 14.1: Your decision. on the wall of the film's own screens.
  F14: {
    shot: "14.1",
    beat: 4,
    at: 99.0,
    palette: "aurixa",
    caption: false,
    draw: () => [...wall(), plate("PL-14A-4").html],
  },
  // 15.1: the closing card, the site's shimmer crossing START YOUR FREE TRIAL.
  F15: {
    shot: "15.1",
    beat: 1,
    at: 105.0,
    palette: "aurixa",
    caption: false,
    draw() {
      const card = plate("PL-15A", (html) =>
        html.replace(
          ">START YOUR FREE TRIAL<",
          '><span class="fk-shimmer" style="background-position:38% 0">START YOUR FREE TRIAL</span><',
        ),
      );
      return [...wall(0.18), card.html];
    },
  },
};

// ------------------------------------------------------------------ the animatic's stills
// Review gate 2 (BRIEF.md): every shot as a still at its key state, timed to the voiceover by animatic.cjs. A
// shot with a style frame uses it; these are the rest, and the further stills of the shots whose picture
// changes outright partway (04.1, 08.2, 12.2, 14.1, 15.1). Each starts on its shot's `beat` (brief.json).
const STILLS = {
  // 01.2: Sent, the question readable, and on the attached listing the chip that says time is short.
  A01: {
    shot: "01.2",
    palette: "before",
    draw() {
      const p = plate(
        "PL-01B-b",
        (html) =>
          `${html}<span class="ls-chip" style="position:absolute;left:163px;top:404px;z-index:2;box-shadow:0 8px 20px rgba(17,24,39,.2)">Expressions of interest close Friday</span>`,
      );
      const view = shot({
        plate: p,
        zoom: 0.9,
        focus: [675, 420],
        at: [540, 830],
        rect: [40, 520, 1000, 560],
      });
      return [view.html, pointer(...view.map([694, 386]))];
    },
  },
  // 04.1, its first half: the emblem open over the gold hairline, the wordmark beneath (the supplied logo).
  A04a: {
    shot: "04.1",
    palette: "aurixa",
    draw() {
      const emblem = [440, (440 * 628) / 679];
      const wordmark = [620, (620 * 187) / 882];
      return [
        `<div class="fk-horizon" style="left:110px;right:110px;top:968px"></div>`,
        `<div style="position:absolute;left:${540 - emblem[0] / 2}px;top:${948 - emblem[1]}px;width:${emblem[0]}px;height:${emblem[1]}px;${EMBLEM ? `background:url('${EMBLEM}') center/contain no-repeat` : ""}"></div>`,
        `<div style="position:absolute;left:${540 - wordmark[0] / 2}px;top:996px;width:${wordmark[0]}px;height:${wordmark[1]}px;${WORDMARK ? `background:url('${WORDMARK}') center/contain no-repeat` : ""}"></div>`,
      ];
    },
  },
  // 04.1, from the emblem's lift: the Command Centre's Overview in the demo workspace, whole, in its window.
  A04b: {
    shot: "04.1",
    beat: 3,
    palette: "aurixa",
    draw: () => [
      shot({
        plate: plate("PL-11A-c"),
        zoom: 972 / 1536,
        focus: [768, 432],
        at: [540, 830],
        rect: [40, 543, 1000, 575],
      }).html,
    ],
  },
  // 04.3: Reports, New Build selected, focus corners on the three build types, 14 Wattle Grove's card beside them.
  A04c: {
    shot: "04.3",
    palette: "aurixa",
    draw() {
      const view = shot({
        plate: plate("PL-04B-b"),
        zoom: 0.82,
        focus: [887, 432],
        at: [540, 830],
        rect: [40, 462, 1000, 737],
      });
      const [x1, y1] = view.map([317, 690]);
      const [x2, y2] = view.map([1457, 793]);
      return [view.html, focusCorners(x1, y1, x2 - x1, y2 - y1), pointer(...view.map([940, 762]))];
    },
  },
  // 05.1: + Financial pressed, the tier preparing, the rail on Financial.
  A05: {
    shot: "05.1",
    palette: "aurixa",
    rail: () => rail("Financial"),
    draw() {
      const view = shot({
        plate: plate("PL-05A-b"),
        zoom: 1,
        focus: [766, 432],
        at: [540, 834],
        rect: [40, 388, 1000, 892],
      });
      return [view.html, pointer(...view.map([860, 133]))];
    },
  },
  // 06.1: the question and the reply in one thread, in the Command Centre's Message Hub.
  A06a: {
    shot: "06.1",
    palette: "aurixa",
    rail: () => rail("Team"),
    draw: () => [
      shot({
        plate: plate("NEW-MESSAGE-HUB-b"),
        zoom: 1.55,
        focus: [910, 600],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      }).html,
    ],
  },
  // 06.3: the agent's panel open over the report, its draft a card that reads Needs your go-ahead.
  A06b: {
    shot: "06.3",
    palette: "aurixa",
    rail: () => rail("Team"),
    draw: () => [
      shot({
        plate: plate("PL-06B-b"),
        zoom: 1.75,
        focus: [1268, 462],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      }).html,
    ],
  },
  // 08.1: the accountant's request, Fulfilled.
  A08a: {
    shot: "08.1",
    palette: "aurixa",
    rail: () => rail("Team"),
    draw: () => [
      shot({
        plate: plate("PL-08A-b"),
        zoom: 1.5,
        focus: [560, 380],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      }).html,
    ],
  },
  // 08.2, its first beat: the report at its summary, page 4, the marker under the readiness statement.
  A08b: {
    shot: "08.2",
    palette: "aurixa",
    rail: () => rail("Team"),
    draw() {
      const viewer = PLATES["NEW-REPORT-PAGES-a"];
      const [left, top, k] = viewer.sheetAt;
      const onPage = ([x, y]) => [left + k * x, top + k * y];
      const view = shot({
        plate: plate("NEW-REPORT-PAGES-a"),
        zoom: 2.45,
        focus: onPage([297.75, 288]),
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      });
      const marks = viewer.marks.map(({ x, base, width }) => {
        const [x1, y1] = view.map(onPage([x, base + 2.6]));
        const [x2] = view.map(onPage([x + width, base]));
        return marker(x1, y1, x2 - x1);
      });
      return [view.html, ...marks];
    },
  },
  // 08.3: the report on the client's Reports page, the next discussion's card beside it, the pointer on Download.
  A08c: {
    shot: "08.3",
    palette: "aurixa",
    rail: () => rail("Team"),
    draw() {
      const view = shot({
        plate: plate("NEW-CLIENT-REPORTS-a"),
        zoom: 972 / 960,
        focus: [480, 300],
        at: [540, 718],
        rect: [40, 400, 1000, 636],
      });
      const card = camera({
        plate: plate("NEW-CLIENT-REPORTS-b"),
        zoom: 1.25,
        focus: [205, 176],
        at: [90, 1078],
        crop: [205, 176, 720, 73],
        chrome: false,
        style: "z-index:6;border-radius:14px;box-shadow:var(--reel-shadow-document)",
      });
      return [view.html, card, pointer(...view.map([352, 324]))];
    },
  },
  // 09.2: the solicitor's document register, one copy of each document, each with its status.
  A09: {
    shot: "09.2",
    palette: "aurixa",
    draw: () => [
      shot({
        plate: plate("PL-09B-b"),
        zoom: 1.3,
        focus: [640, 380],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      }).html,
    ],
  },
  // 10.1: past the gold horizon into the system map, every portal live, its confirmations lit.
  A10: {
    shot: "10.1",
    palette: "aurixa",
    draw: () => [
      `<div class="fk-horizon" style="top:330px"></div><div class="fk-traveller" style="left:676px;top:331px;z-index:3"></div>`,
      ...systemMap({ travellers: true }),
      `<div class="fk-confirm" style="left:890px;top:1020px">Selected</div>`,
      `<div class="fk-confirm" style="left:744px;top:692px">Approved</div>`,
      `<div class="fk-confirm" style="left:190px;top:1020px">Fulfilled</div>`,
    ],
  },
  // 11.1: close on the button, pressed, its gold edge; the window holds the label and the button alone.
  A11: {
    shot: "11.1",
    palette: "aurixa",
    draw: () => [
      shot({
        plate: plate("PL-11A-b"),
        zoom: 1.6,
        focus: [960, 785],
        at: [540, 830],
        rect: [40, 640, 1000, 380],
      }).html,
    ],
  },
  // 12.1: the tour down the sidebar stops on the report's page.
  A12a: {
    shot: "12.1",
    palette: "aurixa",
    draw() {
      const view = shot({
        plate: plate("PL-05A-a"),
        zoom: 1.25,
        focus: [389, 432],
        at: [540, 834],
        rect: [40, 384, 1000, 900],
      });
      return [view.html, pointer(...view.map([172, 624]))];
    },
  },
  // 12.2, its first beat: Daniel's Stock List, 14 Wattle Grove Selected for a client.
  A12b: {
    shot: "12.2",
    palette: "aurixa",
    draw() {
      const view = shot({
        plate: plate("PL-12A-a"),
        zoom: 0.79,
        focus: [888, 432],
        at: [540, 830],
        rect: [40, 475, 1000, 711],
      });
      const [x1, y1] = view.map([1346, 503]);
      const [x2, y2] = view.map([1479, 521]);
      return [view.html, focusCorners(x1, y1, x2 - x1, y2 - y1)];
    },
  },
  // 12.2, from the click: the floor plan, whole, in its own tab.
  A12c: {
    shot: "12.2",
    beat: 1,
    palette: "aurixa",
    draw: () => [
      shot({
        plate: plate("PL-12A-b"),
        zoom: 1,
        focus: [760, 432],
        at: [540, 834],
        rect: [40, 388, 1000, 892],
      }).html,
    ],
  },
  // 12.4: the system map at rest, a little further back, every link's pulse arrived.
  A12d: {
    shot: "12.4",
    palette: "aurixa",
    draw: () => [
      `<div style="position:absolute;inset:0;transform:scale(.94);transform-origin:540px 812px">${systemMap({ travellers: true, t: [0.9, 0.9, 0.9, 0.9, 0.9] }).join("")}</div>`,
    ],
  },
  // 14.1: the wall alone, then each phrase on its beat (the fourth is F14).
  A14a: { shot: "14.1", palette: "aurixa", caption: false, draw: () => wall() },
  A14b: {
    shot: "14.1",
    beat: 1,
    palette: "aurixa",
    caption: false,
    draw: () => [...wall(), plate("PL-14A-1").html],
  },
  A14c: {
    shot: "14.1",
    beat: 2,
    palette: "aurixa",
    caption: false,
    draw: () => [...wall(), plate("PL-14A-2").html],
  },
  A14d: {
    shot: "14.1",
    beat: 3,
    palette: "aurixa",
    caption: false,
    draw: () => [...wall(), plate("PL-14A-3").html],
  },
  // 15.1: the closing card before the shimmer crosses it (F15).
  A15: {
    shot: "15.1",
    palette: "aurixa",
    caption: false,
    draw: () => [...wall(0.18), plate("PL-15A").html],
  },
};

/** G-SYSTEM-MAP's layout: the Command Centre as the hub and the five portals around it, each at its centre. */
const SYSTEM_MAP = {
  hub: { key: "PL-11A-c", label: "Command Centre", at: [540, 812], width: 540 },
  portalWidth: 300,
  portals: [
    { key: "PL-06A-a", label: "Client portal", at: [215, 470] },
    { key: "NEW-DASHBOARDS-finance", label: "Finance portal", at: [865, 470] },
    { key: "NEW-DASHBOARDS-accountant", label: "Accountant portal", at: [190, 1128] },
    { key: "NEW-DASHBOARDS-solicitor", label: "Solicitor portal", at: [540, 1128] },
    { key: "NEW-DASHBOARDS-builders", label: "Builders Network", at: [890, 1128], teal: true },
  ],
};

/** A label chip of the map, centred on x with its top at y. */
const mapChip = (label, x, y, z, teal = false) =>
  `<div class="fk-chip" style="left:${x}px;top:${y}px;z-index:${z}${teal ? ";color:var(--reel-teal-builders)" : ""}">${label}</div>`;

/** One portal of the map, on its own dashboard: its line from the hub, its window and its label. */
function mapPortal(i, { traveller = null } = {}) {
  const { key, label, at, teal } = SYSTEM_MAP.portals[i];
  const p = plate(key);
  const zoom = SYSTEM_MAP.portalWidth / p.css[0];
  return {
    line: link(SYSTEM_MAP.hub.at, at, { traveller }),
    window: camera({
      plate: p,
      zoom,
      focus: [p.css[0] / 2, p.css[1] / 2],
      at,
      style: `z-index:3${teal ? ";border-color:var(--reel-teal-builders)" : ""}`,
    }),
    chip: mapChip(label, at[0], at[1] + (p.css[1] * zoom) / 2 + 26, 4, teal),
  };
}

/** The map's hub: the Command Centre's window, and its label above it. */
function mapHub() {
  const { key, label, at, width } = SYSTEM_MAP.hub;
  const hub = plate(key);
  const zoom = width / hub.css[0];
  return {
    window: camera({
      plate: hub,
      zoom,
      focus: [hub.css[0] / 2, hub.css[1] / 2],
      at,
      style: "z-index:5",
    }),
    chip: mapChip(label, at[0], at[1] - (hub.css[1] * zoom) / 2 - 72, 6),
  };
}

/** G-SYSTEM-MAP: the Command Centre as the hub and the five portals around it, each on its own dashboard. */
function systemMap({ travellers, t = [0.62, 0.48, 0.7, 0.55, 0.4] }) {
  const portals = SYSTEM_MAP.portals.map((_, i) =>
    mapPortal(i, { traveller: travellers ? t[i] : null }),
  );
  const hub = mapHub();
  return [
    ...portals.map((p) => p.line),
    ...portals.map((p) => p.window),
    hub.window,
    ...portals.map((p) => p.chip),
    hub.chip,
  ];
}

/** G-WALL: the film's own screens tiled at a slight angle, dimmed and softened by the strongest glass blur. */
function wall(veil = 0) {
  const keys = [
    "PL-04B-a",
    "PL-05A-a",
    "PL-06A-a",
    "PL-08A-b",
    "PL-09B-b",
    "PL-11A-c",
    "PL-12A-a",
    "PL-13A-b",
    "NEW-MESSAGE-HUB-b",
    "NEW-DASHBOARDS-solicitor",
    "PL-07A-b",
    "NEW-DASHBOARDS-builders",
  ];
  const tiles = keys
    .map((key, i) => {
      const p = plate(key);
      const zoom = 520 / p.css[0];
      const col = i % 3;
      const row = Math.floor(i / 3);
      return `<div style="position:absolute;left:${col * 560 - 260 + (row % 2) * 180}px;top:${row * 340 - 40}px">${camera({ plate: p, zoom, focus: [0, 0], at: [0, 0] })}</div>`;
    })
    .join("");
  return [
    `<div style="position:absolute;inset:-200px;transform:rotate(-8deg) scale(1.08);filter:blur(var(--reel-blur));opacity:.9">${tiles}</div>`,
    `<div style="position:absolute;inset:0;background:var(--reel-ground);opacity:${0.3 + veil}"></div>`,
  ];
}

/** Where a page still to build would go. */
function pending(key) {
  return [
    `<div style="position:absolute;left:140px;right:140px;top:560px;padding:40px;border:3px dashed var(--reel-gold-ink);border-radius:24px;text-align:center;font:600 30px/1.4 Inter;color:var(--reel-gold-ink)">${key}<br><span style="font-size:22px;color:var(--reel-ink-muted)">drawn once the page is built</span></div>`,
  ];
}

function captionAt(t) {
  const cue = CAPTIONS.find((c) => t >= c.start && t < c.end);
  return cue ? cue.text : "";
}

/** The frames' stylesheet: the plates' (with their fonts), the kit's and the frames' own. */
async function stylesheet() {
  return (await styles()) + KIT.frameCss + FRAME_CSS;
}

/** Serves the assets folder's images to a page at ASSET_HOST, as the frames name them. */
async function routeAssets(page) {
  await page.route(`${ASSET_HOST}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const file = ASSETS && path.join(ASSETS, path.basename(name));
    const type = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[
      path.extname(name)
    ];
    return file && fs.existsSync(file)
      ? route.fulfill({ path: file, contentType: type ?? "image/png" })
      : route.fulfill({ status: 404, body: "" });
  });
}

/**
 * Draws frames to PNG, one browser for the lot: each job names a frame (FRAMES or STILLS), the caption it
 * carries and its file. A marker goes under each run a frame marks (data-mark), where the browser set it.
 */
async function drawAll(jobs) {
  const css = await stylesheet();
  const { chromium } = playwright();
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await routeAssets(page);
  for (const { still, caption, file } of jobs) {
    const html = frame({
      palette: still.palette,
      layers: still.draw(),
      rail: still.rail ? still.rail() : "",
      caption,
      zones: process.env.FRAMES_ZONES === "1",
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const root = document.querySelector(".fk");
      for (const words of document.querySelectorAll("[data-mark]")) {
        for (const line of words.getClientRects()) {
          const mark = document.createElement("div");
          mark.className = "fk-mark";
          mark.style.cssText = `left:${line.left}px;top:${line.bottom + 1}px;width:${line.width}px`;
          root.appendChild(mark);
        }
      }
    });
    await page.screenshot({ path: file });
  }
  await browser.close();
}

module.exports = {
  FRAMES,
  STILLS,
  CAPTIONS,
  drawAll,
  // For the motion renderer (./render.cjs): the same plates, pieces, styles and assets as the stills.
  plate,
  markWords,
  SYSTEM_MAP,
  mapPortal,
  mapChip,
  TEAM,
  EMBLEM,
  WORDMARK,
  ASSETS,
  asset,
  stylesheet,
  routeAssets,
  playwright,
  CHROMIUM,
};

// The 15 style frames, each under the caption at its key beat.
if (require.main === module)
  (async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const only = process.env.FRAMES_ONLY?.split(",");
    const jobs = [];
    const sheet = [];
    for (const [id, f] of Object.entries(FRAMES)) {
      if (only && !only.includes(id)) continue;
      const caption = f.caption === false ? "" : captionAt(f.at);
      const file = path.join(OUT, `${id}-${f.shot}.png`);
      jobs.push({ still: f, caption, file });
      sheet.push({ id, shot: f.shot, at: f.at, caption, file: path.basename(file) });
    }
    await drawAll(jobs);
    fs.writeFileSync(path.join(OUT, "frames.json"), `${JSON.stringify(sheet, null, 2)}\n`);
    console.log(sheet.length, "frames →", OUT);
  })();
