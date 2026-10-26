// Reel 3, shots 01.1 to 01.3: your client has found the property; the big question; can they afford it? (G-QUESTION)
// Today's paper desktop, in Reel 1's "before" kit (white, grey borders, the system's own type; nothing of Aurixa's).
// 01.1 is composed from its first frame, which is the thumbnail: 14 Wattle Grove's card (Reel 1's photograph, the
// address, the price, New build, the four facts) with Jordan Ellis's chip beside it (initials, no face), everything
// between y 240 and 1680 (a profile grid's centred 3:4 crop); the whole drifts in 3% across the shot, and on "found" a
// gold pin drops onto the card and settles. 01.2: the card dims under a slow push and a large question mark, in
// Playfair Display, draws in over it stroke by stroke (its outline, then its fill). 01.3: the question folds into a
// line: the card steps back to the top and the question mark flies down to become the figure of an empty borrowing
// capacity bar, under the price's full one, $1,150,000; on "afford" it pulses once.
const M = require("../motion.cjs");

const { shotOf, beat, EASE, span, lerp, lerp2, r3, px, State, fade, captionHtml, caption, F } = M;

/** The card, at its own scale 1 (frame px before any push): the photograph, then the body. */
const CARD = { x: 180, y: 384, w: 720, photo: 590, body: 276 };
CARD.h = CARD.photo + CARD.body;
const CARD_C = [CARD.x + CARD.w / 2, CARD.y + CARD.h / 2];
/** Jordan Ellis's chip, beside it: straddling the photograph's foot on the card's right. */
const CHIP = { x: 632, y: CARD.y + CARD.photo - 60, w: 344, h: 120 };
/** Where the pin lands (its tip), on the photograph's sky, in the card's own px. */
const PIN = { w: 66, h: 88, tip: [598, 136] };
/** The push of 01.2 and the drift of 01.1, about the card's centre. */
const DRIFT = 0.03;
const PUSH = 0.07;

/** Playfair Display SemiBold's question mark (font units, y up; bounds 31, -14 to 459, 782), hook then dot. */
const QM = {
  hook: "M229 782Q298 782 350.0 760.5Q402 739 430.5 698.5Q459 658 459 602Q459 546 428.5 502.0Q398 458 342.5 427.5Q287 397 214 380V234H194V389Q255 414 284.5 444.0Q314 474 324.0 509.0Q334 544 334 583Q334 678 298.5 720.0Q263 762 206 762Q180 762 154.5 755.5Q129 749 116 733Q140 726 153.5 709.5Q167 693 167 667Q167 638 147.0 619.5Q127 601 95 601Q67 601 49.0 620.0Q31 639 31 665Q31 692 46.0 712.0Q61 732 85 746Q108 760 144.0 771.0Q180 782 229 782Z",
  dot: "M206 132Q240 132 262.0 112.0Q284 92 284 59Q284 26 262.0 6.0Q240 -14 206 -14Q171 -14 149.5 6.0Q128 26 128 59Q128 92 149.5 112.0Q171 132 206 132Z",
  box: [31, -14, 459, 782],
};
const QM_W = QM.box[2] - QM.box[0];
const QM_H = QM.box[3] - QM.box[1];
/** The large question mark over the card (frame px, its height), and the small one it folds into. */
const BIG_H = 560;
const SMALL_H = 64;

/** 01.3's line: the card's place at the top, and the panel holding the price's bar and the capacity bar. */
const THUMB = { c: [540, 566], k: 0.5 };
const PANEL = { x: 100, y: 836, w: 880, h: 380 };
const BAR = { x: PANEL.x + 44, w: PANEL.w - 88, h: 20 };
const ROW_B = PANEL.y + 210;
/** The capacity row's figure: where the small question mark stands (its centre). */
const FIGURE_AT = [PANEL.x + PANEL.w - 44 - (SMALL_H * QM_W) / QM_H / 2, ROW_B + 34];

const css = `
.q-ground { position:absolute; inset:0; background:radial-gradient(90% 60% at 50% 42%, #FFFFFF 0%, #F3F4F6 62%, #E9EBEF 100%); }
.q-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${CARD_C[0]}px ${CARD_C[1]}px; }
.q-card { position:absolute; left:0; top:0; width:${CARD.w}px; height:${CARD.h}px; border-radius:24px; background:#fff; overflow:hidden;
  border:1.5px solid #D1D5DB; box-shadow:0 2px 6px rgba(15,23,42,.06), 0 30px 70px rgba(15,23,42,.17); transform-origin:50% 50%; }
.q-photo { position:absolute; left:0; top:0; width:${CARD.w}px; height:${CARD.photo}px; overflow:hidden; background:#2a3b52; }
.q-photo img { position:absolute; left:0; top:0; width:${CARD.w}px; transform-origin:50% 40%; }
.q-body { position:absolute; left:0; top:${CARD.photo}px; width:${CARD.w}px; height:${CARD.body}px; box-sizing:border-box; padding:26px 32px 0;
  font-family:Selawik, "Segoe UI", sans-serif; color:#111827; }
.q-body .t { font-size:40px; font-weight:700; letter-spacing:-.01em; line-height:1.1; }
.q-badge { position:absolute; left:22px; top:22px; font:600 22px/1 Selawik, "Segoe UI", sans-serif; color:#111827; background:rgba(255,255,255,.94);
  border-radius:999px; padding:10px 18px; box-shadow:0 4px 12px rgba(15,23,42,.18); }
.q-body .a { margin-top:8px; font-size:25px; color:#6B7280; }
.q-body .p { margin-top:14px; font-size:48px; font-weight:700; letter-spacing:-.015em; line-height:1; }
.q-body .f { margin-top:18px; display:flex; gap:20px; font-size:22px; font-weight:600; color:#374151; }
.q-body .f span { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }
.q-body .f svg { width:22px; height:22px; color:#6B7280; }
.q-veil { position:absolute; inset:0; background:#F3F4F6; pointer-events:none; }
.q-chip { position:absolute; left:0; top:0; width:${CHIP.w}px; height:${CHIP.h}px; box-sizing:border-box; border-radius:24px; background:#fff; border:1.5px solid #D1D5DB;
  display:flex; align-items:center; gap:18px; padding:0 24px; box-shadow:0 4px 10px rgba(15,23,42,.08), 0 22px 46px rgba(15,23,42,.18);
  font-family:Selawik, "Segoe UI", sans-serif; }
.q-chip .av { width:72px; height:72px; flex:none; border-radius:50%; display:grid; place-items:center; background:#1F2937; color:#fff; font-size:28px; font-weight:700; letter-spacing:.02em; }
.q-chip .n { font-size:30px; font-weight:700; color:#111827; line-height:1.1; }
.q-chip .r { font-size:21px; color:#6B7280; margin-top:4px; }
.q-pin { position:absolute; left:0; top:0; width:${PIN.w}px; height:${PIN.h}px; transform-origin:50% 100%; filter:drop-shadow(0 8px 10px rgba(80,58,10,.28)); }
.q-pin svg { width:100%; height:100%; display:block; }
.q-shadow { position:absolute; left:0; top:0; width:70px; height:18px; margin:-9px 0 0 -35px; border-radius:50%;
  background:radial-gradient(closest-side, rgba(40,30,10,.38), rgba(40,30,10,0)); }
.q-ring { position:absolute; left:0; top:0; border-radius:50%; border:3px solid #d7b35f; box-sizing:border-box; }
.q-mark { position:absolute; left:0; top:0; overflow:visible; transform-origin:0 0; }
.q-mark path { stroke:#1F2937; stroke-width:7; stroke-linejoin:round; stroke-linecap:round; fill:#1F2937; fill-opacity:0; vector-effect:non-scaling-stroke; }
.q-panel { position:absolute; left:${PANEL.x}px; top:${PANEL.y}px; width:${PANEL.w}px; height:${PANEL.h}px; box-sizing:border-box; border-radius:24px; background:#fff;
  border:1.5px solid #D1D5DB; box-shadow:0 2px 6px rgba(15,23,42,.06), 0 26px 60px rgba(15,23,42,.15); font-family:Selawik, "Segoe UI", sans-serif; }
.q-row { position:absolute; left:44px; right:44px; display:flex; align-items:baseline; }
.q-row .l { font-size:30px; font-weight:600; color:#6B7280; }
.q-row .v { margin-left:auto; font-size:58px; font-weight:700; color:#111827; letter-spacing:-.015em; line-height:1; }
.q-track { position:absolute; left:${BAR.x - PANEL.x}px; width:${BAR.w}px; height:${BAR.h}px; border-radius:${BAR.h / 2}px; overflow:hidden; }
.q-track.full { background:#E5E7EB; }
.q-track.full i { position:absolute; left:0; top:0; bottom:0; width:100%; border-radius:${BAR.h / 2}px; background:#374151; transform-origin:0 50%; }
.q-track.empty { box-sizing:border-box; border:3px dashed #9CA3AF; background:repeating-linear-gradient(135deg, rgba(107,114,128,.13) 0 9px, transparent 9px 18px); }
.q-fly { position:absolute; left:0; top:0; transform-origin:0 0; white-space:nowrap; font:700 48px/1 Selawik, "Segoe UI", sans-serif; color:#111827;
  letter-spacing:-.015em; }
`;

const glyphs = {
  bed: '<path d="M3 18v-8h18v8M3 14h18M7 10V7h6v3"/>',
  bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0"/>',
  car: '<path d="M5 16l1.5-5h11l1.5 5M4 16h16v3H4zM7 19v1M17 19v1"/>',
  land: '<path d="M4 4h16v16H4zM4 9h5M15 20v-5"/>',
};
const glyph = (g) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[g]}</svg>`;
const PIN_SVG = `<svg viewBox="0 0 66 88"><defs><linearGradient id="q-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dc8e"/><stop offset=".45" stop-color="#d7b35f"/><stop offset="1" stop-color="#a87c26"/></linearGradient></defs>
  <path d="M33 2C16.4 2 3 15.2 3 31.5 3 53.6 33 86 33 86s30-32.4 30-54.5C63 15.2 49.6 2 33 2Z" fill="url(#q-gold)" stroke="#8a6519" stroke-width="1.5"/>
  <circle cx="33" cy="31" r="11.5" fill="#fff"/><path d="M14 22c3-9 11-14 19-14" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/></svg>`;

/** A question mark's place: its box's top-left in frame px and its height. */
const markAt = (st, sel, x, y, h) => {
  const k = h / QM_H;
  st.set(sel, { transform: `translate(${px(x)}, ${px(y)}) scale(${r3(k)})` });
};

function questionScene() {
  const [s1, s2, s3] = ["01.1", "01.2", "01.3"].map(shotOf);
  const TPIN = beat("01.1", 1);
  const [TDIM, TMARK] = [0, 1].map((i) => beat("01.2", i));
  const [TFOLD, TPULSE] = [0, 1].map((i) => beat("01.3", i));

  const html = () =>
    [
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="q-ground"></div></div>`,
      `<div class="q-stage" id="q-stage" style="z-index:2">`,
      `<div class="q-card" id="q-card"><div class="q-photo"><img id="q-img" src="${F.asset("P.png")}" alt="" style="top:-223px"><span class="q-badge">New build</span></div>
        <div class="q-body"><div class="t">14 Wattle Grove</div><div class="a">Banksia Rise NSW 2155</div><div class="p" id="q-cardprice">$1,150,000</div>
        <div class="f"><span>${glyph("bed")}4 bed</span><span>${glyph("bath")}2 bath</span><span>${glyph("car")}2 car</span><span>${glyph("land")}450 m² land</span></div></div>
        <div class="q-veil" id="q-veil-card" style="visibility:hidden"></div></div>`,
      `<div class="q-chip" id="q-chip"><div class="av">JE</div><div><div class="n">Jordan Ellis</div><div class="r">Client</div></div><div class="q-veil" id="q-veil-chip" style="visibility:hidden;border-radius:24px"></div></div>`,
      `<div class="q-shadow" id="q-shadow" style="visibility:hidden"></div>`,
      `<div class="q-ring" id="q-ring" style="visibility:hidden"></div>`,
      `<div class="q-pin" id="q-pin" style="visibility:hidden">${PIN_SVG}</div>`,
      `</div>`,
      `<div class="q-panel" id="q-panel" style="z-index:3;visibility:hidden">
        <div class="q-row" style="top:46px"><span class="l">Purchase price</span><span class="v" style="visibility:hidden">$1,150,000</span></div>
        <div class="q-track full" style="top:130px"><i id="q-fill"></i></div>
        <div class="q-row" style="top:210px"><span class="l">Borrowing capacity</span></div>
        <div class="q-track empty" id="q-empty" style="top:294px"></div></div>`,
      `<div class="q-ring" id="q-pulse" style="z-index:5;visibility:hidden;border-color:#6B7280"></div>`,
      `<div class="q-fly" id="q-fly" style="z-index:4;visibility:hidden">$1,150,000</div>`,
      `<svg class="q-mark" id="q-mark" style="z-index:4;visibility:hidden" width="${QM_W}" height="${QM_H}" viewBox="0 0 ${QM_W} ${QM_H}">
        <g transform="matrix(1 0 0 -1 ${-QM.box[0]} ${QM.box[3]})"><path id="q-hook" d="${QM.hook}" pathLength="1" stroke-dasharray="1 1"/><path id="q-dot" d="${QM.dot}" pathLength="1" stroke-dasharray="1 1"/></g></svg>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // The stage (the card, the chip and the pin): drifting in 3% across 01.1, pushing in on 01.2, and from the fold
    // giving way to 01.3's layout, where the card alone goes on, to the top.
    const fold = span(t, TFOLD, TFOLD + 0.62, EASE.move);
    const k =
      1 + DRIFT * span(t, s1.in, s1.out, EASE.linear) + PUSH * span(t, s2.in, s3.in, EASE.move);
    st.set("#q-stage", { transform: `scale(${r3(k * (1 - fold) + fold)})` });
    // The card: in place, then (on the fold, as the stage's push lets go) stepping back to the top of the frame.
    const cc = lerp2(CARD_C, THUMB.c, fold);
    st.set("#q-card", {
      transform: `translate(${px(cc[0] - CARD.w / 2)}, ${px(cc[1] - CARD.h / 2)}) scale(${r3(lerp(1, THUMB.k, fold))})`,
    });
    // The photograph breathes in, slowly, across the opening.
    st.set("#q-img", { transform: `scale(${r3(1 + 0.05 * span(t, s1.in, s3.in, EASE.linear))})` });
    // The chip, beside the card; it goes with the push and leaves on the fold.
    const chipOut = span(t, TFOLD, TFOLD + 0.32, EASE.move);
    st.set("#q-chip", {
      transform: `translate(${px(CHIP.x + 40 * chipOut)}, ${px(CHIP.y)})`,
      ...fade(1 - chipOut),
    });
    // The card dims on 01.2, under the question; whole again as it steps back.
    const dim = span(t, TDIM, TDIM + 0.45, EASE.move) * (1 - fold);
    st.set("#q-veil-card", fade(0.66 * dim));
    st.set("#q-veil-chip", fade(0.66 * dim));

    // The pin, on "found": falling, landing with a squash, settling; its shadow and a ring going out from its tip.
    // It stands on the card, so it goes where the card goes (the card's own px, through the card's place and scale).
    const ck = lerp(1, THUMB.k, fold);
    const onCard = ([x, y]) => [cc[0] + (x - CARD.w / 2) * ck, cc[1] + (y - CARD.h / 2) * ck];
    const fallA = TPIN - 0.24;
    const land = TPIN + 0.04;
    const u = Math.min(1, Math.max(0, (t - fallA) / (land - fallA)));
    const drop = u * u; // falling: gathering speed
    const since = t - land;
    const squash =
      since >= 0 && since < 0.42 ? Math.sin((Math.PI * since) / 0.42) * Math.exp(-since * 6) : 0;
    const [tx, ty] = onCard(PIN.tip);
    const pinY = lerp(ty - 520, ty, drop);
    st.set("#q-pin", {
      transform: `translate(${px(tx - PIN.w / 2)}, ${px(pinY - PIN.h)}) scale(${r3(ck * (1 + 0.12 * squash))}, ${r3(ck * (1 - 0.16 * squash))})`,
      ...fade(t >= fallA ? Math.min(1, (t - fallA) / 0.06) : 0),
    });
    const near = t >= fallA ? drop : 0;
    st.set("#q-shadow", {
      transform: `translate(${px(tx)}, ${px(ty + 2 * ck)}) scale(${r3(ck * lerp(0.35, 1, near))})`,
      ...fade(near * 0.9),
    });
    const ring = span(t, land, land + 0.7, EASE.settle);
    const d = lerp(20, 170, ring);
    st.set("#q-ring", {
      transform: `translate(${px(tx - d / 2)}, ${px(ty - d * 0.18)}) scaleY(0.36)`,
      width: px(d),
      height: px(d),
      ...fade(since >= 0 ? 0.85 * (1 - ring) : 0),
    });

    // The question mark: drawn over the card on "question" (the hook's outline, then the dot's, then the fill), in
    // the stage's push; on the fold it flies down to the capacity bar's figure and stands there.
    const drawHook = span(t, TMARK - 0.06, TMARK + 0.5, EASE.move);
    const drawDot = span(t, TMARK + 0.36, TMARK + 0.6, EASE.move);
    const fill = span(t, TMARK + 0.42, TMARK + 0.85, EASE.settle);
    st.set("#q-hook", { "stroke-dashoffset": r3(1 - drawHook), "fill-opacity": r3(fill) });
    st.set("#q-dot", { "stroke-dashoffset": r3(1 - drawDot), "fill-opacity": r3(fill) });
    // Over the card at its pushed scale, centred on the card's centre (the stage's origin).
    const bigH = BIG_H * k;
    const bigW = (bigH * QM_W) / QM_H;
    const bigAt = [CARD_C[0] - bigW / 2, CARD_C[1] - bigH / 2 + 10];
    const fly = span(t, TFOLD + 0.04, TFOLD + 0.62, EASE.move);
    const smallW = (SMALL_H * QM_W) / QM_H;
    const smallAt = [FIGURE_AT[0] - smallW / 2, FIGURE_AT[1] - SMALL_H / 2];
    const h = lerp(bigH, SMALL_H, fly);
    const at = lerp2(bigAt, smallAt, fly);
    // Its pulse on "afford": swelling once and settling, a ring going out from it.
    const pulse = span(t, TPULSE - 0.02, TPULSE + 0.5, EASE.linear);
    const swell = pulse > 0 && pulse < 1 ? 1 + 0.22 * Math.sin(Math.PI * pulse) ** 2 : 1;
    const ph = h * swell;
    const pw = (ph * QM_W) / QM_H;
    markAt(st, "#q-mark", at[0] + ((h * QM_W) / QM_H - pw) / 2, at[1] + (h - ph) / 2, ph);
    st.set("#q-mark", fade(t >= TMARK - 0.06 ? 1 : 0));
    const pr = span(t, TPULSE, TPULSE + 0.7, EASE.settle);
    const pd = lerp(SMALL_H, SMALL_H * 3.2, pr);
    st.set("#q-pulse", {
      transform: `translate(${px(FIGURE_AT[0] - pd / 2)}, ${px(FIGURE_AT[1] - pd / 2)})`,
      width: px(pd),
      height: px(pd),
      ...fade(t >= TPULSE ? 0.6 * (1 - pr) : 0),
    });

    // The price lifts out of the card (as the card steps back) and settles as the line's price, beside its bar.
    const S = k * (1 - fold) + fold;
    const cp = m.cardPrice;
    const local = [cc[0] + (cp[0] - CARD.w / 2) * ck, cc[1] + (cp[1] - CARD.h / 2) * ck];
    const fromAt = [CARD_C[0] + (local[0] - CARD_C[0]) * S, CARD_C[1] + (local[1] - CARD_C[1]) * S];
    const lineIn = span(t, TFOLD + 0.1, TFOLD + 0.55, EASE.settle);
    const pp = m.panelPrice;
    const toAt = [PANEL.x + pp[0], PANEL.y + pp[1] + lerp(60, 0, lineIn)];
    const lift = span(t, TFOLD + 0.02, TFOLD + 0.62, EASE.move);
    const flyAt = lerp2(fromAt, toAt, lift);
    st.set("#q-fly", {
      transform: `translate(${px(flyAt[0])}, ${px(flyAt[1])}) scale(${r3(lerp(S * ck, pp[3] / cp[3], lift))})`,
      ...fade(t >= TFOLD ? 1 : 0),
    });
    st.set("#q-cardprice", fade(t >= TFOLD ? 0 : 1));

    // The line: the panel comes up under the card, the price's bar fills to its figure, the capacity bar empty.
    const pin = span(t, TFOLD + 0.1, TFOLD + 0.55, EASE.settle);
    st.set("#q-panel", {
      transform: `translateY(${px(lerp(60, 0, pin))})`,
      ...fade(pin),
    });
    st.set("#q-fill", {
      transform: `scaleX(${r3(span(t, TFOLD + 0.3, TFOLD + 0.95, EASE.settle))})`,
    });
    st.set("#q-empty", { opacity: r3(span(t, TFOLD + 0.45, TFOLD + 0.8, EASE.linear)) });
    return st;
  };

  return {
    id: "question",
    shots: ["01.1", "01.2", "01.3"],
    palette: "before",
    html,
    // The card's price and the line's (each in its own box's px), for the price lifting from one to the other.
    measure: { cardPrice: ["#q-card", "#q-cardprice"], panelPrice: ["#q-panel", ".q-row .v"] },
    state,
  };
}

module.exports = questionScene;
