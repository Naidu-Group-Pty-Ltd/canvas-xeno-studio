// Reel 2, shot 09.1: Aurixa Systems, the operating system for modern property professionals; start your free trial
// today. Reel 1's closing card (../../aurixa-reel-1/scenes/close.cjs), the series' signature, on Reel 2's clock: it
// slams in on the music's return (the cut, until the music is fitted), the whole offer there from the first frame:
// the living logo (Reel 1's card take, ../../aurixa-reel-1/logo.cjs, the supplied art's own scene, its lettering
// exact) over a glass card holding the operating-system line, 14-DAY FREE TRIAL, the button (G-CTA, ../pages/cta.cjs)
// and the address. The hit is a flash behind the card, a shake, a shock ring and the card's gold lines drawing out
// from under the logo. Then it is alive on the words: on "operating" light runs round the card's edge and across its
// glass and the line shimmers; on "start" the pointer comes to the button and it rises under it; on the last beat
// the press: a burst from the button, a ring across the whole card, the logo flaring once; then everything holds
// through the music's ring, the button breathing. Its ground is its own (an aurora of the brand's gold and cyan,
// motes rising). No captions: the card says it.
const M = require("../motion.cjs");
const L = require("../../aurixa-reel-1/pages/light.cjs");
const C = require("../pages/cta.cjs");
const LOGO = require("../../aurixa-reel-1/logo.cjs");
const PACE = require("../pacing.cjs");

const { F, shotOf, beat, frameOf, span, lerp, r3, px, State, fade, clamp01 } = M;
const { pointerHtml, pointer, captionHtml, caption, EASE } = M;

// The card, in frame px. The logo's art at k = 0.62 (the emblem's centre at 540, 520); the glass card under it
// holds the offer; the button at 880 by 156.
const ART = { w: 1240 };
ART.k = ART.w / LOGO.ART.w;
ART.h = LOGO.ART.h * ART.k;
ART.left = 540 - ART.w / 2;
ART.top = 520 - (LOGO.ART.emblem[1] + LOGO.ART.emblem[3] / 2) * ART.k;
const EMBLEM_C = [540, 520];
const CARD = { x0: 54, y0: 930, x1: 1026, y1: 1484, r: 30 };
const BTN = { w: 880, h: 156, left: 100, top: 1202 };
BTN.c = [BTN.left + BTN.w / 2, BTN.top + BTN.h / 2];
const LOCAL = [BTN.w * 0.7, BTN.h * 0.6];

/** The card's gold line, one half: from the top's centre out, down its side, back along its foot to the centre. */
function halfBorder(side) {
  const { x0, y0, x1, y1, r } = CARD;
  const c = 540;
  if (side > 0)
    return `M${c} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${c}`;
  return `M${c} ${y0}H${x0 + r}A${r} ${r} 0 0 0 ${x0} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 0 ${x0 + r} ${y1}H${c}`;
}
const HALF = 2 * (540 - CARD.x0 - CARD.r) + Math.PI * CARD.r + (CARD.y1 - CARD.y0 - 2 * CARD.r);

const MOTES = (() => {
  const rnd = L.seeded(1501);
  return Array.from({ length: 46 }, (_, i) => ({
    x: rnd() * 1080,
    y: rnd() * 1920,
    v: 18 + rnd() * 46,
    s: 2 + rnd() * 3.6,
    sway: 6 + rnd() * 16,
    ph: rnd() * Math.PI * 2,
    tw: 0.6 + rnd() * 1.4,
    col: i % 5 === 0 ? L.CYAN : i % 3 === 0 ? "#FFFFFF" : L.GOLD_LIGHT,
  }));
})();

const css = `
.cl-ground { position:absolute; inset:0; background:radial-gradient(120% 70% at 50% 42%, #0d2342 0%, #0A192F 38%, #061022 70%, #040B16 100%); }
.cl-aur { position:absolute; left:0; top:0; border-radius:50%; mix-blend-mode:screen; }
.cl-aur.g { width:1100px; height:900px; background:radial-gradient(closest-side, rgba(240,180,92,.34), rgba(200,118,82,.15) 46%, rgba(110,56,100,0) 100%); }
.cl-aur.c { width:1100px; height:1000px; background:radial-gradient(closest-side, rgba(0,168,181,.30), rgba(0,120,150,.12) 50%, rgba(10,25,47,0) 100%); }
.cl-aur.v { width:1300px; height:800px; background:radial-gradient(closest-side, rgba(96,58,150,.26), rgba(60,40,110,.10) 55%, rgba(10,25,47,0) 100%); }
.cl-mote { position:absolute; left:0; top:0; border-radius:50%; }
.cl-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:540px 820px; }
.cl-glass { position:absolute; left:${CARD.x0}px; top:${CARD.y0}px; width:${CARD.x1 - CARD.x0}px; height:${CARD.y1 - CARD.y0}px; border-radius:${CARD.r}px; overflow:hidden;
  background:linear-gradient(180deg, rgba(16,35,61,.66), rgba(10,25,47,.58) 60%, rgba(6,16,34,.7));
  backdrop-filter:blur(18px) saturate(1.25); -webkit-backdrop-filter:blur(18px) saturate(1.25);
  box-shadow:0 40px 90px -30px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.10); }
.cl-glass i { position:absolute; top:-30%; bottom:-30%; width:38%; left:0; mix-blend-mode:screen; transform:skewX(-20deg);
  background:linear-gradient(90deg, rgba(255,236,190,0), rgba(255,236,190,.24) 50%, rgba(255,236,190,0)); }
.cl-glass b { position:absolute; inset:0; background:linear-gradient(160deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 40%, rgba(0,168,181,.06) 100%); }
.cl-border { position:absolute; left:0; top:0; width:1080px; height:1920px; overflow:visible; }
.cl-tag { position:absolute; left:100px; right:100px; top:968px; text-align:center; text-wrap:balance; font-family:'Playfair Display', serif; font-weight:600;
  font-size:46px; line-height:1.24; letter-spacing:-.005em; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(105deg, rgba(255,236,190,0) 0%, rgba(255,236,190,1) 50%, rgba(255,236,190,0) 100%), linear-gradient(180deg, #fff 8%, #c6cedb 68%, #fff);
  background-repeat:no-repeat; background-size:30% 100%, 100% 100%; background-position:-60% 0, 0 0; filter:drop-shadow(0 2px 10px rgba(0,0,0,.45)); }
.cl-rule { position:absolute; left:${540 - 140}px; top:1112px; width:280px; height:2px; background:linear-gradient(90deg, rgba(200,155,60,0), ${L.GOLD_INK}, rgba(200,155,60,0)); }
.cl-eye { position:absolute; left:0; right:0; top:1136px; text-align:center; font:700 31px/1 Inter, sans-serif; letter-spacing:.34em; padding-left:.34em;
  color:${L.CYAN}; text-shadow:0 0 18px rgba(94,221,232,.35); }
.cl-url { position:absolute; left:0; right:0; top:1398px; text-align:center; font:500 29px/1 Inter, sans-serif; letter-spacing:.08em; color:#b9c3d3; }
.cl-streak { position:absolute; left:-260px; width:1600px; height:12px; border-radius:50%; mix-blend-mode:screen;
  background:linear-gradient(90deg, rgba(245,209,122,0) 0%, rgba(245,209,122,.25) 22%, rgba(255,246,222,.95) 50%, rgba(245,209,122,.25) 78%, rgba(245,209,122,0) 100%); filter:blur(1.5px); }
.cl-flash { position:absolute; inset:0; }
.cl-expose { position:absolute; inset:0; background:#fff3dc; mix-blend-mode:screen; }
`;

function closeScene() {
  const shot = shotOf("09.1");
  // The music's return is the hit (its re-entry once the music is fitted; the cut until then), and the card is
  // already slamming in on the shot's first frame.
  const tHit = Math.max(shot.in, PACE.MUSIC?.bars?.reentry ?? shot.in);
  const tS = shot.in - 0.03;
  // The light laps the card on "operating" and on "start"; the press is the music's last downbeat (the brief's
  // last beat until the music is fitted), and the film holds after it through the music's ring.
  const [b51, b53] = [1, 2].map((i) => beat("09.1", i));
  const tPress = PACE.MUSIC?.bars?.final ?? beat("09.1", 3);
  if (PACE.MUSIC && !(tPress < shot.out - 0.8))
    throw new Error("09.1: no room to hold after the last downbeat");
  if (!(b53 < tPress - 0.6))
    throw new Error("09.1: the pointer has no time to arrive before the press");
  const tArrive = b53 + 0.12; // as "Start your free trial today" begins
  const tHover = tArrive - 0.12;

  const card = LOGO.cardLogoHtml({ id: "cl-logo", width: ART.w });
  const html = () =>
    [
      `<style>${L.burstCss}${C.ctaCss}${css}</style>`,
      `<div class="fk-layer" id="ground" style="z-index:0"><div class="cl-ground"></div>`,
      `<div class="cl-aur g" id="aur-g"></div><div class="cl-aur c" id="aur-c"></div><div class="cl-aur v" id="aur-v"></div>`,
      MOTES.map((_, i) => `<i class="cl-mote" id="mo${i}"></i>`).join(""),
      `</div>`,
      `<div class="cl-stage" id="stage" style="z-index:2">`,
      `<div class="cl-flash" id="flash"></div>`,
      `<div class="cl-glass" id="glass"><b></b><i id="sweep"></i></div>`,
      `<svg class="cl-border" viewBox="0 0 1080 1920"><defs><filter id="cl-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter></defs>`,
      [1, -1]
        .map(
          (s, i) =>
            `<path id="bg${i}" d="${halfBorder(s)}" fill="none" stroke="${L.GOLD_LIGHT}" stroke-width="9" filter="url(#cl-glow)" style="visibility:hidden"/>` +
            `<path id="bd${i}" d="${halfBorder(s)}" fill="none" stroke="${L.GOLD_INK}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${r3(HALF)} ${r3(HALF)}"/>` +
            `<path id="cg${i}" d="${halfBorder(s)}" fill="none" stroke="${L.GOLD_LIGHT}" stroke-width="7" stroke-linecap="round" filter="url(#cl-glow)" stroke-dasharray="150 ${r3(HALF + 200)}"/>` +
            `<path id="cm${i}" d="${halfBorder(s)}" fill="none" stroke="#fffaf0" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="90 ${r3(HALF + 200)}"/>`,
        )
        .join(""),
      `</svg>`,
      `<div style="position:absolute;left:${r3(ART.left)}px;top:${r3(ART.top)}px" id="logo-wrap">${card}</div>`,
      `<div class="cl-streak" id="streak" style="top:${EMBLEM_C[1] - 6}px;visibility:hidden"></div>`,
      `<div class="cl-tag" id="tag">The operating system for modern property professionals.</div>`,
      `<div class="cl-rule" id="rule"></div>`,
      `<div class="cl-eye">14-DAY FREE TRIAL</div>`,
      C.ctaHtml("cc", { w: BTN.w, h: BTN.h, size: 37, z: 7 }),
      `<div class="cl-url">aurixasystems.com.au</div>`,
      L.rippleHtml("rp", 8),
      L.burstHtml("pb", { z: 6, sparks: 34, rings: 2 }),
      L.burstHtml("hb", { z: -1, sparks: 26, rings: 2 }),
      `</div>`,
      pointerHtml(),
      `<div class="cl-expose" id="expose" style="z-index:40;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const u = t - tHit;

    // ---- the slam: in from 12% too big, hitting home on the re-entry, a breath of undershoot, a shake.
    const inP = span(t, tS, tHit + 0.1, EASE.settle);
    const back = clamp01((t - tHit - 0.1) / 0.36);
    const s = 1 + 0.12 * (1 - inP) - 0.014 * Math.sin(Math.PI * back) * (1 - back);
    const shake = t >= tHit ? Math.exp(-u / 0.11) : 0;
    const sx = 7 * shake * Math.sin(u * 83);
    const sy = 5 * shake * Math.cos(u * 71);
    st.set("#stage", { transform: `translate(${px(sx)}, ${px(sy)}) scale(${r3(s)})` });
    st.set("#ground", { transform: `scale(${r3(1 + 0.04 * (1 - inP))})` });

    // The flash, behind the card, from the emblem; and the frame's exposure kicked for a breath.
    const fl =
      (t < tHit ? 0.55 + 0.45 * span(t, tS, tHit, EASE.linear) : Math.exp(-u / 0.14)) * 0.95;
    st.set("#flash", {
      background: `radial-gradient(circle at ${px(EMBLEM_C[0])} ${px(EMBLEM_C[1])}, rgba(255,252,242,${r3(fl)}) 0px, rgba(255,232,180,${r3(fl * 0.62)}) 190px, rgba(240,176,100,${r3(fl * 0.2)}) 430px, rgba(140,80,110,${r3(fl * 0.05)}) 680px, rgba(10,25,47,0) 900px)`,
      ...fade(fl > 0.004 ? 1 : 0),
    });
    const pressU = t - tPress;
    const ex =
      (t < tHit ? 0.05 : 0.12 * Math.exp(-u / 0.06)) +
      (pressU >= 0 ? 0.1 * Math.exp(-pressU / 0.07) : 0);
    st.set("#expose", { opacity: r3(ex), visibility: ex > 0.004 ? "visible" : "hidden" });
    // The shock ring and its sparks, out from the emblem behind the card; the anamorphic line through it.
    L.burstState(st, t, "hb", {
      at: tHit,
      c: EMBLEM_C,
      flash: 0,
      ray: 0,
      reach: 1250,
      spread: 640,
      sparks: 26,
      rings: 2,
      seed: 50,
    });
    const streak = Math.max(
      t >= tHit ? Math.exp(-u / 0.32) : 0.6,
      pressU >= 0 ? 0.9 * Math.exp(-pressU / 0.38) : 0,
    );
    st.set("#streak", { transform: `scaleX(${r3(0.7 + 0.5 * streak)})`, ...fade(streak) });

    // ---- the ground: its aurora drifting and swelling on the bars, the motes rising.
    const bp = C.beatPulse(t, { tau: 0.5, bar: 1, beat: 0.25 });
    const k = t - shot.in;
    st.set("#aur-g", {
      transform: `translate(${px(-300 + 40 * Math.sin(k * 0.6))}, ${px(80 + 30 * Math.cos(k * 0.5))})`,
      opacity: r3(0.75 + 0.25 * bp),
    });
    st.set("#aur-c", {
      transform: `translate(${px(380 - 50 * Math.sin(k * 0.45))}, ${px(700 + 40 * Math.sin(k * 0.7))})`,
      opacity: r3(0.7 + 0.3 * bp),
    });
    st.set("#aur-v", {
      transform: `translate(${px(-110 + 30 * Math.cos(k * 0.4))}, ${px(1250 - 30 * Math.sin(k * 0.5))})`,
      opacity: 0.9,
    });
    MOTES.forEach((d, i) => {
      const y = ((((d.y - d.v * k) % 1920) + 1920) % 1920) - 20;
      const x = d.x + d.sway * Math.sin(k * 0.9 + d.ph);
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(k * d.tw * 3 + d.ph));
      st.set(`#mo${i}`, {
        transform: `translate(${px(x)}, ${px(y)})`,
        width: px(d.s),
        height: px(d.s),
        background: d.col,
        "box-shadow": `0 0 ${r3(d.s * 3)}px ${d.col}`,
        opacity: r3(a),
      });
    });

    // ---- the card's gold lines drawing out from under the logo on the hit; light laps them on "operating" and
    // "start" and at the press (both halves at once, meeting at the foot).
    const draw = span(t, tHit + 0.02, tHit + 0.8, EASE.move);
    const lap = (at, dur = 0.95) =>
      t >= at && t < at + dur ? span(t, at, at + dur, EASE.move) : null;
    const laps = [lap(b51), lap(b53), lap(tPress, 0.8)].filter((v) => v !== null);
    const lp = laps.length ? laps[laps.length - 1] : null;
    const flashBorder = pressU >= 0 ? Math.exp(-pressU / 0.3) : 0;
    // The card itself glows on the two words that carry it and at the press.
    const glowAt = (at, tau) => (t >= at ? Math.exp(-(t - at) / tau) : 0);
    const cardGlow = clamp01(
      0.75 * glowAt(b51, 0.5) +
        0.75 * glowAt(b53, 0.5) +
        flashBorder +
        0.25 * glowAt(tHit, 0.4) * draw,
    );
    [0, 1].forEach((i) => {
      st.set(`#bg${i}`, fade(0.85 * cardGlow));
      st.set(`#bd${i}`, {
        "stroke-dashoffset": `${r3(HALF * (1 - draw))}`,
        "stroke-opacity": r3(clamp01(0.7 + 0.3 * flashBorder + 0.2 * bp)),
        "stroke-width": r3(2 + 1.5 * flashBorder),
      });
      const head = lp === null ? -400 : lp * (HALF + 150);
      // The comet is drawn by its dash: its offset brings the dash's head `head` px along the line.
      const showDraw = t >= tHit && draw < 1;
      const at = showDraw ? draw * HALF : head;
      const on = showDraw || lp !== null;
      st.set(`#cg${i}`, { "stroke-dashoffset": `${r3(150 - at)}`, ...fade(on ? 0.9 : 0) });
      st.set(`#cm${i}`, { "stroke-dashoffset": `${r3(90 - at)}`, ...fade(on ? 1 : 0) });
    });
    // On "operating" the light also crosses the glass, and the line it is saying shimmers once.
    const sw = span(t, b51, b51 + 1.1, EASE.move);
    st.set("#sweep", {
      transform: `translateX(${px(lerp(-420, 1300, sw))}) skewX(-20deg)`,
      ...fade(t >= b51 && sw < 1 ? 1 : 0),
    });
    const sh = span(t, b51 + 0.05, b51 + 1.6, EASE.move);
    st.set("#tag", { "background-position": `${r3(-60 + 220 * sh)}% 0, 0 0` });
    st.set("#rule", {
      transform: `scaleX(${r3(span(t, tHit, tHit + 0.6, EASE.move) * (1 + 0.15 * bp))})`,
    });

    // ---- the logo: the card take running from the shot's start; it kicks with the hit, glows on the bars,
    // flares once at the press.
    LOGO.cardLogoState(st, "cl-logo", t, { t0: shot.in, offset: 0, frameOf });
    const kick =
      1 +
      (t >= tHit ? 0.45 * Math.exp(-u / 0.16) : 0.3) +
      0.12 * C.beatPulse(t, { tau: 0.35, bar: 1, beat: 0 }) +
      (pressU >= 0 ? 0.6 * Math.exp(-pressU / 0.22) : 0);
    st.set("#cl-logo", { filter: `brightness(${r3(kick)})` });

    // ---- the button: alive from the first frame; the pointer comes on "start" and it rises under it; the press
    // on the last beat throws its burst and a ring across the whole card; then it breathes.
    const tip = pointer(st, t, {
      from: [1010, 1600],
      to: [BTN.left + LOCAL[0], BTN.top + LOCAL[1]],
      a: tArrive - 0.5,
      b: tArrive,
      bow: 0.1,
      show: tArrive - 0.56,
      press: tPress,
    });
    st.set("#cc", { transform: `translate(${px(BTN.left)}, ${px(BTN.top)})` });
    const hover = span(t, tHover, tHover + 0.22, EASE.settle);
    const out = span(t, tPress + 0.05, tPress + 0.6, EASE.move);
    C.ctaState(st, t, "cc", {
      w: BTN.w,
      h: BTN.h,
      t0: shot.in,
      hover,
      hoverAt: tHover,
      ptr: hover > 0 ? [tip[0] - BTN.left, tip[1] - BTN.top] : null,
      press: tPress,
      pulse: 1 - out,
      breath: out,
      edge: 1,
      glow: 1 + 0.5 * (t >= tHit ? Math.exp(-u / 0.2) : 1),
    });
    L.rippleState(st, t, "rp", {
      at: tPress,
      c: [BTN.left + LOCAL[0], BTN.top + LOCAL[1]],
      reach: 1400,
    });
    L.burstState(st, t, "pb", {
      at: tPress,
      c: BTN.c,
      flash: 0.55,
      fr: 0.45,
      ray: 0.7,
      reach: 1300,
      spread: 520,
      sparks: 34,
      rings: 2,
      seed: 54,
    });
    return st;
  };

  return { id: "close", shots: ["09.1"], palette: "aurixa", html, state };
}

module.exports = closeScene;
